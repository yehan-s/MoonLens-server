import { Module } from '@nestjs/common';
import { AiAnalysisService } from './ai-analysis.service';
import { GitLabService } from './gitlab.service';
import { AnalysisResultService } from './analysis-result.service';
import { HttpModule } from '@nestjs/axios';
import { PrismaModule } from '../prisma/prisma.module';
import { CacheModule } from '@nestjs/cache-manager';

@Module({
  imports: [
    HttpModule,
    PrismaModule,
    CacheModule.register({
      ttl: 3600, // 1小时缓存
    }),
  ],
  providers: [
    AiAnalysisService,
    GitLabService,
    AnalysisResultService,
  ],
  exports: [
    AiAnalysisService,
    GitLabService,
    AnalysisResultService,
  ],
})
export class ServicesModule {}