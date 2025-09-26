import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { UserRole } from '@prisma/client';

/**
 * 权限守卫
 * 支持按权限字符串进行细粒度的资源级控制，并带有简单缓存
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // 未声明权限要求则放行（交由其它守卫处理，如 Jwt、Roles）
    if (!required || required.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user) return false;

    const userId = user.userId as string;
    const role = user.role as UserRole | undefined;

    // 从缓存获取用户权限
    const cacheKey = `perms:${userId}`;
    let userPerms =
      (await this.cache.get<string[] | undefined>(cacheKey)) ?? undefined;

    if (!userPerms) {
      // 简易基于角色的权限映射；可替换为 DB 查询
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

      userPerms = role ? (rolePermsMap[role] ?? []) : [];
      // 缓存 60 秒
      await this.cache.set(cacheKey, userPerms, 60_000);
    }

    // ADMIN 拥有通配权限
    if (userPerms.includes('*')) return true;

    // 判断是否包含任一所需权限
    return required.some((p) => userPerms.includes(p));
  }
}
