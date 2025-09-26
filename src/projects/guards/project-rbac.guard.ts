import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../common/services/prisma.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { PROJECT_PERMS_KEY } from '../decorators/project-permissions.decorator';

/**
 * 项目级 RBAC 守卫
 * - 基于项目成员(ProjectMember)表的 accessLevel/状态做权限判定
 * - 简易策略：
 *   - admin(>=40)/maintainer(40) 具备写权限
 *   - developer(30) 具备一般修改权限
 *   - reporter(20)/guest(10) 具备只读权限
 */
@Injectable()
export class ProjectRbacGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(
      PROJECT_PERMS_KEY,
      [context.getHandler(), context.getClass()],
    );
    // 未声明项目级权限要求则通过
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest();
    const user = req.user as { userId?: string } | undefined;
    const projectId = req.params?.projectId || req.params?.id;
    if (!user?.userId || !projectId) return false;

    // 读取成员访问级别（带缓存）
    const cacheKey = `pj:member:${projectId}:${user.userId}`;
    let accessLevel = (await this.cache.get<number | undefined>(cacheKey)) ?? undefined;
    if (typeof accessLevel !== 'number') {
      const member = await this.prisma.projectMember.findFirst({
        where: { projectId, gitlabUserId: user.userId },
        select: { accessLevel: true },
      });
      accessLevel = member?.accessLevel ?? 0;
      await this.cache.set(cacheKey, accessLevel, 60_000);
    }

    // 简单映射：权限到访问级别的要求
    const needWrite = required.some((p) => /:(create|update|delete|members(:|$)|config(:|$))/.test(p));
    if (!needWrite) {
      // 只读：reporter(20)以上可访问
      return accessLevel >= 20;
    }
    // 写权限：developer(30)以上
    return accessLevel >= 30;
  }
}
