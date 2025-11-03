import { Process, Processor } from '@nestjs/bull';
import type { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { QueueService } from '../queue.service';
import { AnalysisWorker } from '../../../workers/analysis.worker';

@Processor('analysis')
export class AnalysisProcessor {
  private readonly logger = new Logger(AnalysisProcessor.name);

  constructor(
    private queueService: QueueService,
    private analysisWorker: AnalysisWorker,
  ) {}

  /**
   * 处理分析任务
   */
  @Process({ name: 'analyze', concurrency: 2 })
  async handleAnalysis(job: Job) {
    // 委托给实际的 worker 处理
    return this.analysisWorker.handleAnalysis(job);
  }

  /**
   * 处理分析 MR 任务
   */
  @Process({ name: 'analyze-mr', concurrency: 2 })
  async handleAnalyzeMR(job: Job) {
    // 委托给实际的 worker 处理
    return this.analysisWorker.handleAnalyzeMR(job);
  }

  /**
   * 任务完成事件
   */
  @Process('completed')
  onCompleted(job: Job) {
    this.logger.log(`Job ${job.id} completed successfully`);
  }

  /**
   * 任务失败事件
   */
  @Process('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Job ${job.id} failed: ${error.message}`);
  }

  /**
   * 任务进度更新
   */
  @Process('progress')
  onProgress(job: Job, progress: number) {
    this.logger.log(`Job ${job.id} progress: ${progress}%`);
  }
}
