import { Module } from '@nestjs/common';
import { AnalysisController } from './analysis.controller';
import { QueueModule } from '../modules/queue/queue.module';
import { ServicesModule } from '../services/services.module';

@Module({
  imports: [QueueModule, ServicesModule],
  controllers: [AnalysisController],
})
export class AnalysisModule {}