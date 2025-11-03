import { Module } from '@nestjs/common';
import { AiAnalysisService } from './ai-analysis.service';
import { AiProviderFactory } from './ai/ai-provider.factory';
import { OpenAIProvider } from './ai/openai.provider';
import { MoonshotProvider } from './ai/moonshot.provider';
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
    AiProviderFactory,
    OpenAIProvider,
    MoonshotProvider,
    GitLabService,
    AnalysisResultService,
  ],
  exports: [
    AiAnalysisService,
    AiProviderFactory,
    GitLabService,
    AnalysisResultService,
  ],
})
export class ServicesModule {}
