import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * 角色装饰器
 * 用于设置路由所需的角色
 * @param roles 允许访问的角色列表
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
