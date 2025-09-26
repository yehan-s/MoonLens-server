import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { Queue as BullQueue } from 'bull';
import { Cron, CronExpression } from '@nestjs/schedule';
import { QUEUE_MONITORING_CONFIG } from '../../config/queue.config';

@Injectable()
export class QueueMonitorService {
  private readonly logger = new Logger(QueueMonitorService.name);
  private monitoringInterval: any = null;

  constructor(
    @InjectQueue('analysis') private analysisQueue: any,
    @InjectQueue('dead-letter') private deadLetterQueue: any,
  ) {}

  /**
   * 启动队列监控
   */
  startMonitoring() {
    this.logger.log('Starting queue monitoring');
    
    // 设置定时监控
    this.monitoringInterval = setInterval(
      () => this.checkQueueHealth(),
      QUEUE_MONITORING_CONFIG.monitoringInterval,
    );
  }

  /**
   * 停止队列监控
   */
  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      this.logger.log('Queue monitoring stopped');
    }
  }

  /**
   * 检查队列健康状态
   */
  private async checkQueueHealth() {
    try {
      // 检查分析队列
      await this.checkQueue(this.analysisQueue);
      
      // 检查死信队列
      await this.checkQueue(this.deadLetterQueue);
    } catch (error) {
      this.logger.error(`Queue health check failed: ${error.message}`);
    }
  }

  /**
   * 检查单个队列
   */
  private async checkQueue(queue: BullQueue) {
    const [waiting, active, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    const total = waiting + active + delayed;

    // 检查队列深度
    if (total > QUEUE_MONITORING_CONFIG.depthCriticalThreshold) {
      this.logger.error(
        `Queue ${queue.name} depth critical: ${total} jobs (waiting: ${waiting}, active: ${active}, delayed: ${delayed})`,
      );
      // TODO: 发送告警
    } else if (total > QUEUE_MONITORING_CONFIG.depthWarningThreshold) {
      this.logger.warn(
        `Queue ${queue.name} depth warning: ${total} jobs (waiting: ${waiting}, active: ${active}, delayed: ${delayed})`,
      );
    }

    // 检查失败任务
    if (failed > 0) {
      this.logger.warn(`Queue ${queue.name} has ${failed} failed jobs`);
    }

    // 记录队列指标
    this.logger.debug(
      `Queue ${queue.name} status - Waiting: ${waiting}, Active: ${active}, Failed: ${failed}, Delayed: ${delayed}`,
    );
  }

  /**
   * 每小时清理完成的任务
   */
  @Cron(CronExpression.EVERY_HOUR)
  async cleanCompletedJobs() {
    try {
      this.logger.log('Cleaning completed jobs');
      
      // 清理超过1小时的完成任务
      await this.analysisQueue.clean(3600000, 'completed');
      
      // 清理超过24小时的失败任务
      await this.analysisQueue.clean(86400000, 'failed');
      
      this.logger.log('Completed jobs cleaned');
    } catch (error) {
      this.logger.error(`Failed to clean jobs: ${error.message}`);
    }
  }

  /**
   * 每天报告队列统计
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async reportDailyStats() {
    try {
      const analysisStats = await this.getQueueStats(this.analysisQueue);
      const deadLetterStats = await this.getQueueStats(this.deadLetterQueue);
      
      this.logger.log('Daily queue statistics:', {
        analysis: analysisStats,
        deadLetter: deadLetterStats,
      });
      
      // TODO: 可以将统计信息发送到监控系统或生成报告
    } catch (error) {
      this.logger.error(`Failed to generate daily stats: ${error.message}`);
    }
  }

  /**
   * 获取队列统计信息
   */
  private async getQueueStats(queue: BullQueue) {
    const [
      waiting,
      active,
      completed,
      failed,
      delayed,
    ] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    return {
      name: queue.name,
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + delayed,
    };
  }

  /**
   * 生命周期钩子：模块销毁时停止监控
   */
  onModuleDestroy() {
    this.stopMonitoring();
  }
}