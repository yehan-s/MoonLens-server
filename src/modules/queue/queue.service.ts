import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue, Job, JobOptions } from 'bull';
import { Queue as BullQueue } from 'bull';

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @InjectQueue('analysis') private analysisQueue: any,
    @InjectQueue('dead-letter') private deadLetterQueue: any,
  ) {}

  /**
   * 添加分析任务到队列
   */
  async addAnalysisTask(data: any, options?: JobOptions): Promise<Job> {
    try {
      const job = await this.analysisQueue.add('analyze', data, {
        ...options,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      });

      this.logger.log(`Added analysis task ${job.id} to queue`);
      return job;
    } catch (error) {
      this.logger.error(`Failed to add analysis task: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取队列状态
   */
  async getQueueStatus(queueName: 'analysis' | 'dead-letter' = 'analysis') {
    const queue = queueName === 'analysis' ? this.analysisQueue : this.deadLetterQueue;
    
    const [
      waiting,
      active,
      completed,
      failed,
      delayed,
      paused,
    ] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
      queue.isPaused(),
    ]);

    return {
      name: queue.name,
      counts: {
        waiting,
        active,
        completed,
        failed,
        delayed,
      },
      isPaused: paused,
    };
  }

  /**
   * 暂停队列处理
   */
  async pauseQueue(queueName: 'analysis' | 'dead-letter' = 'analysis'): Promise<void> {
    const queue = queueName === 'analysis' ? this.analysisQueue : this.deadLetterQueue;
    await queue.pause();
    this.logger.log(`Queue ${queueName} paused`);
  }

  /**
   * 恢复队列处理
   */
  async resumeQueue(queueName: 'analysis' | 'dead-letter' = 'analysis'): Promise<void> {
    const queue = queueName === 'analysis' ? this.analysisQueue : this.deadLetterQueue;
    await queue.resume();
    this.logger.log(`Queue ${queueName} resumed`);
  }

  /**
   * 清理队列
   */
  async cleanQueue(
    queueName: 'analysis' | 'dead-letter' = 'analysis',
    grace: number = 5000,
    status?: 'completed' | 'failed',
  ): Promise<void> {
    const queue = queueName === 'analysis' ? this.analysisQueue : this.deadLetterQueue;
    
    if (status === 'completed') {
      await queue.clean(grace, 'completed');
    } else if (status === 'failed') {
      await queue.clean(grace, 'failed');
    } else {
      await queue.clean(grace);
    }
    
    this.logger.log(`Queue ${queueName} cleaned (grace: ${grace}ms, status: ${status || 'all'})`);
  }

  /**
   * 重试失败的任务
   */
  async retryFailedJobs(queueName: 'analysis' | 'dead-letter' = 'analysis'): Promise<number> {
    const queue = queueName === 'analysis' ? this.analysisQueue : this.deadLetterQueue;
    const failedJobs = await queue.getFailed();
    
    let retryCount = 0;
    for (const job of failedJobs) {
      try {
        await job.retry();
        retryCount++;
      } catch (error) {
        this.logger.error(`Failed to retry job ${job.id}: ${error.message}`);
      }
    }
    
    this.logger.log(`Retried ${retryCount} failed jobs in ${queueName} queue`);
    return retryCount;
  }

  /**
   * 将失败任务移至死信队列
   */
  async moveToDeadLetter(job: Job): Promise<void> {
    try {
      await this.deadLetterQueue.add('dead-letter', {
        originalQueue: job.queue.name,
        originalJobId: job.id,
        data: job.data,
        failedReason: job.failedReason,
        stacktrace: job.stacktrace,
        attempts: job.attemptsMade,
        timestamp: new Date().toISOString(),
      });
      
      this.logger.log(`Moved job ${job.id} to dead letter queue`);
    } catch (error) {
      this.logger.error(`Failed to move job to dead letter: ${error.message}`);
    }
  }
}