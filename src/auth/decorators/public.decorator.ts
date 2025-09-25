import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * 公共路由装饰器
 * 用于标记不需要认证的路由
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);