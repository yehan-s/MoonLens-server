import { BullModuleOptions } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';

/**
 * Redis 队列配置
 * 用于异步任务处理
 */
export const getQueueConfig = (configService: ConfigService): BullModuleOptions => {
  return {
    redis: {
      host: configService.get<string>('REDIS_HOST') || '127.0.0.1',
      port: configService.get<number>('REDIS_PORT', 6379),
      password: configService.get<string>('REDIS_PASSWORD'),
      db: configService.get<number>('REDIS_DB', 0),
      retryStrategy: (times: number) => {
        // 重试策略：指数退避
        return Math.min(Math.exp(times) * 1000, 30000);
      },
      reconnectOnError: (err: Error) => {
        // 仅在特定错误时重连
        const targetError = 'READONLY';
        if (err.message.includes(targetError)) {
          return 1; // 重连
        }
        return false;
      },
    },
    defaultJobOptions: {
      removeOnComplete: true,
      removeOnFail: false,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    },
  };
};

/**
 * 分析队列配置
 */
export const ANALYSIS_QUEUE_CONFIG = {
  name: 'analysis',
  options: {
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000, // 5秒初始延迟
      },
      timeout: 600000, // 10分钟超时
      removeOnComplete: {
        age: 3600, // 完成后保留1小时
        count: 100, // 保留最近100个完成的任务
      },
      removeOnFail: {
        age: 86400, // 失败后保留24小时
      },
    },
  },
};

/**
 * 死信队列配置
 */
export const DEAD_LETTER_QUEUE_CONFIG = {
  name: 'dead-letter',
  options: {
    defaultJobOptions: {
      removeOnComplete: false, // 永不自动删除
      removeOnFail: false,
      attempts: 1, // 不重试
    },
  },
};

/**
 * 队列监控配置
 */
export const QUEUE_MONITORING_CONFIG = {
  // 队列深度警告阈值
  depthWarningThreshold: 100,
  // 队列深度严重阈值
  depthCriticalThreshold: 500,
  // 任务处理时间警告阈值（毫秒）
  processingTimeWarning: 60000, // 1分钟
  // 任务处理时间严重阈值（毫秒）
  processingTimeCritical: 300000, // 5分钟
  // 监控间隔（毫秒）
  monitoringInterval: 30000, // 30秒
};