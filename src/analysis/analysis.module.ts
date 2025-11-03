import { Module } from '@nestjs/common';
import { AnalysisController } from './analysis.controller';
import { DebugAnalysisController } from './debug.controller';
import { QueueModule } from '../modules/queue/queue.module';
import { ServicesModule } from '../services/services.module';
import { GitlabModule } from '../gitlab/gitlab.module';

@Module({
  imports: [QueueModule, ServicesModule, GitlabModule],
  controllers: [AnalysisController, DebugAnalysisController],
})
export class AnalysisModule {}
