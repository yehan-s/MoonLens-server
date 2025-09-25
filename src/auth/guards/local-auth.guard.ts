import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * 本地认证守卫
 * 用于保护登录路由
 */
@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {}