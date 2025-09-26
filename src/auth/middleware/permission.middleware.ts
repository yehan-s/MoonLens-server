import { Injectable, NestMiddleware, Inject, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { AuditLogService } from '../../common/services/audit-log.service';
import { UserRole } from '@prisma/client';

/**
 * 权限中间件（API 级别）
 * - 基于路由和方法映射所需权限（resource:action）
 * - 从用户角色推导权限集合（含缓存）
 * - 提供基本的调试与审计打点
 *
 * 注意：此中间件与基于装饰器的 PermissionsGuard 并不冲突。
 * 只有当路由存在静态映射的权限要求时才会拦截；否则放行。
 */
@Injectable()
export class PermissionMiddleware implements NestMiddleware {
  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly audit: AuditLogService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const user = (req as any).user;
    const method = req.method.toUpperCase();
    const originalPath = req.path; // 不含查询串

    const required = this.resolveRequiredPermission(method, originalPath);
    // 未声明权限，直接放行（交由 Guards/Controllers 继续处理）
    if (!required) return next();

    if (!user) {
      throw new UnauthorizedException('未认证或会话失效');
    }

    const perms = await this.getUserPermissions(user.userId as string, user.role as UserRole | undefined);

    const canonical = this.canonicalize(method, originalPath);
    const allowed = perms.includes('*') || perms.includes(required);

    // 调试开关：?perm_debug=1
    const debug = 'perm_debug' in (req.query || {});
    if (debug) {
      this.audit.log('perm.debug', {
        userId: user.userId,
        role: user.role,
        method,
        path: originalPath,
        canonical,
        required,
        perms,
        allowed,
      });
    }

    if (!allowed) {
      this.audit.log('perm.denied', {
        userId: user.userId,
        role: user.role,
        method,
        path: originalPath,
        required,
      });
      throw new ForbiddenException('权限不足');
    }

    next();
  }

  /**
   * 路由权限静态映射（可扩展为从配置/数据库加载）
   */
  private resolveRequiredPermission(method: string, path: string): string | null {
    // 管理员用户管理端点
    if (method === 'GET' && path === '/users') return 'user:list';
    if (method === 'POST' && /\/users\/[^/]+\/freeze$/.test(path)) return 'user:freeze';
    if (method === 'POST' && /\/users\/[^/]+\/unfreeze$/.test(path)) return 'user:unfreeze';

    // 其他端点暂不做静态声明，由 @Permissions/@Roles 守卫处理
    return null;
  }

  private canonicalize(method: string, path: string): string {
    // 将ID位归一化，便于缓存与审计
    const p = path.replace(/\/[0-9a-fA-F-]{8,}\b/g, '/:id');
    return `${method} ${p}`;
  }

  private async getUserPermissions(userId: string, role?: UserRole): Promise<string[]> {
    const cacheKey = `perm:list:${userId}`;
    const cached = (await this.cache.get<string[] | undefined>(cacheKey)) ?? undefined;
    if (cached) return cached;

    const rolePermsMap: Record<UserRole, string[]> = {
      [UserRole.ADMIN]: ['*'],
      [UserRole.USER]: [
        'user:profile:read',
        'user:profile:update',
        'user:avatar:upload',
        'user:password:change',
        'user:email:change',
        'user:preferences:read',
        'user:preferences:update',
        'auth:sessions:list',
        'auth:sessions:terminate',
        'auth:login-history:read',
        'auth:logout',
      ],
      [UserRole.GUEST]: [],
    };

    const list = role ? rolePermsMap[role] ?? [] : [];
    await this.cache.set(cacheKey, list, 60_000);
    return list;
  }
}

