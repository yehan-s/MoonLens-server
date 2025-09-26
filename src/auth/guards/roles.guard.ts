import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * 角色守卫
 * 用于基于角色的访问控制
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // 获取路由所需的角色（方法 > 类）
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // 如果没有设置角色要求，允许访问
    if (!requiredRoles) {
      return true;
    }

    // 获取请求中的用户信息
    const { user } = context.switchToHttp().getRequest();

    // 未登录或无角色信息，拒绝访问
    if (!user || !user.role) {
      return false;
    }

    // 角色继承层级：高权限包含低权限
    const roleHierarchy: Record<UserRole, UserRole[]> = {
      [UserRole.ADMIN]: [UserRole.ADMIN, UserRole.USER, UserRole.GUEST],
      [UserRole.USER]: [UserRole.USER, UserRole.GUEST],
      [UserRole.GUEST]: [UserRole.GUEST],
    };

    // 检查用户是否具有所需角色
    const effectiveRoles = roleHierarchy[user.role as UserRole] ?? [];
    return requiredRoles.some((r) => effectiveRoles.includes(r));
  }
}
