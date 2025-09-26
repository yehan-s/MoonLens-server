import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import * as crypto from 'crypto';

@Injectable()
export class WebhookSignatureGuard implements CanActivate {
  private readonly logger = new Logger(WebhookSignatureGuard.name);

  constructor(private configService: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = request.headers['x-gitlab-token'] as string;
    
    if (!token) {
      this.logger.warn('Missing X-Gitlab-Token header');
      throw new UnauthorizedException('Missing webhook token');
    }

    const expectedToken = this.configService.get<string>('GITLAB_WEBHOOK_TOKEN');
    
    if (!expectedToken) {
      this.logger.error('GITLAB_WEBHOOK_TOKEN not configured');
      throw new UnauthorizedException('Webhook token not configured');
    }

    // 使用常量时间比较防止时序攻击
    const isValid = this.constantTimeCompare(token, expectedToken);
    
    if (!isValid) {
      this.logger.warn('Invalid webhook token received');
      throw new UnauthorizedException('Invalid webhook token');
    }

    return true;
  }

  /**
   * 常量时间字符串比较，防止时序攻击
   */
  private constantTimeCompare(a: string, b: string): boolean {
    if (!a || !b) {
      return false;
    }

    // 确保比较相同长度的字符串
    const lengthA = Buffer.byteLength(a);
    const lengthB = Buffer.byteLength(b);
    
    // 使用 crypto.timingSafeEqual 进行安全比较
    if (lengthA !== lengthB) {
      return false;
    }

    try {
      return crypto.timingSafeEqual(
        Buffer.from(a, 'utf8'),
        Buffer.from(b, 'utf8')
      );
    } catch (error) {
      this.logger.error('Error comparing tokens:', error);
      return false;
    }
  }
}