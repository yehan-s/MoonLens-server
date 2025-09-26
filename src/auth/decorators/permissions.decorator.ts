import { SetMetadata } from '@nestjs/common';

// 权限元数据 Key
export const PERMISSIONS_KEY = 'permissions';

/**
 * 权限装饰器
 * 为路由声明所需的权限标识（资源:动作）
 */
export const Permissions = (...perms: string[]) =>
  SetMetadata(PERMISSIONS_KEY, perms);
