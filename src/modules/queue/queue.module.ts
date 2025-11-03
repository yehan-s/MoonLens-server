import { Module, Global, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { QueueService } from './queue.service';
import { AnalysisProcessor } from './processors/analysis.processor';
import { QueueController } from './queue.controller';
import { DeadLetterProcessor } from './processors/dead-letter.processor';
import { QueueMonitorService } from './queue-monitor.service';
import { AnalysisWorker } from '../../workers/analysis.worker';
import { GitlabModule } from '../../gitlab/gitlab.module';
import { GitHubModule } from '../../github/github.module';
import { ServicesModule } from '../../services/services.module';
import { ReviewModule } from '../../review/review.module';
import {
  getQueueConfig,
  ANALYSIS_QUEUE_CONFIG,
  DEAD_LETTER_QUEUE_CONFIG,
} from '../../config/queue.config';

@Global()
@Module({
  imports: [
    ConfigModule,
    GitlabModule,
    GitHubModule,
    ServicesModule,
    forwardRef(() => ReviewModule),
    // 配置 Bull 模块
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => getQueueConfig(configService),
      inject: [ConfigService],
    }),
    // 注册分析队列
    BullModule.registerQueue(
      ANALYSIS_QUEUE_CONFIG,
      DEAD_LETTER_QUEUE_CONFIG,
    ),
  ],
  controllers: [QueueController],
  providers: [
    QueueService,
    AnalysisProcessor,
    DeadLetterProcessor,
    QueueMonitorService,
    AnalysisWorker,
  ],
  exports: [QueueService, BullModule],
})
export class QueueModule {
  constructor(private queueMonitor: QueueMonitorService) {
    // 启动队列监控
    this.queueMonitor.startMonitoring();
  }
}
