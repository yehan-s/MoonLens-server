import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

/**
 * 自定义限流守卫
 * - 优先使用已认证用户的 userId 作为限流键，实现“每用户每秒 10 次”
 * - 未认证用户回退到 IP 地址
 */
@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  protected async getTracker(req: Request): Promise<string> {
    const userId = (req as any)?.user?.userId as string | undefined;
    if (userId) return `uid:${userId}`;
    // Fallback: IP
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip;
    return `ip:${ip}`;
  }
}
