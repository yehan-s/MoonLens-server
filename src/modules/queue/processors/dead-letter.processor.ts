import { Process, Processor } from '@nestjs/bull';
import type { Job } from 'bull';
import { Logger } from '@nestjs/common';

/**
 * 死信队列处理器
 * 处理所有失败且无法重试的任务
 */
@Processor('dead-letter')
export class DeadLetterProcessor {
  private readonly logger = new Logger(DeadLetterProcessor.name);

  @Process('dead-letter')
  async handleDeadLetter(job: Job) {
    this.logger.warn(`Processing dead letter job ${job.id}`);
    
    const {
      originalQueue,
      originalJobId,
      data,
      failedReason,
      stacktrace,
      attempts,
      timestamp,
    } = job.data;

    // 记录失败任务信息
    this.logger.error(
      `Dead letter from queue: ${originalQueue}, ` +
      `original job: ${originalJobId}, ` +
      `attempts: ${attempts}, ` +
      `reason: ${failedReason}`,
    );

    // TODO: 可以在这里实现以下功能：
    // 1. 发送告警通知（邮件、Slack等）
    // 2. 记录到数据库供后续分析
    // 3. 生成失败报告
    // 4. 触发人工介入流程

    // 这里仅记录到日志
    this.logger.error(`Dead letter details:`, {
      originalQueue,
      originalJobId,
      failedReason,
      attempts,
      timestamp,
      dataKeys: Object.keys(data || {}),
    });

    // 如果有堆栈信息，也记录下来
    if (stacktrace) {
      this.logger.error(`Stacktrace: ${stacktrace}`);
    }

    return {
      processed: true,
      originalJobId,
      processedAt: new Date().toISOString(),
    };
  }
}