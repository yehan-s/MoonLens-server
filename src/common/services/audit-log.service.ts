import { Injectable, Inject } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import type { Logger as NestLogger } from '@nestjs/common';

/**
 * 审计日志服务（结构化）
 * - 使用 @nestjs/winston 输出 JSON 结构化日志
 * - 统一事件模型：time, level, event, category, actor, target, details
 * - 可扩展对接外部分析（ELK/ClickHouse/ES 等）
 */
@Injectable()
export class AuditLogService {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: NestLogger,
  ) {}

  log(event: string, details: Record<string, unknown> = {}, category = 'generic') {
    this.logger.log({
      event,
      category,
      details,
    });
  }

  security(event: string, actor: Record<string, unknown>, target?: Record<string, unknown>, details: Record<string, unknown> = {}) {
    this.logger.warn({
      event,
      category: 'security',
      actor,
      target,
      details,
    });
  }

  auth(event: string, actor: Record<string, unknown>, details: Record<string, unknown> = {}) {
    this.logger.log({
      event,
      category: 'auth',
      actor,
      details,
    });
  }

  admin(event: string, actor: Record<string, unknown>, target?: Record<string, unknown>, details: Record<string, unknown> = {}) {
    this.logger.warn({
      event,
      category: 'admin',
      actor,
      target,
      details,
    });
  }
}
