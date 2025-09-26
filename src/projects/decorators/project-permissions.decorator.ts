import { SetMetadata } from '@nestjs/common';

/**
 * 项目级权限装饰器
 * 示例：@ProjectPermissions('project:read')
 */
export const PROJECT_PERMS_KEY = 'project:perms';
export const ProjectPermissions = (...permissions: string[]) =>
  SetMetadata(PROJECT_PERMS_KEY, permissions);

