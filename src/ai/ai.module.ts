import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AIConfigService } from './services/ai-config.service';
import { ReviewTaskQueueService } from './services/review-task-queue.service';
import { KimiProvider } from './providers/kimi.provider';
import { PrismaModule } from '../prisma/prisma.module';
import { GitlabModule } from '../gitlab/gitlab.module';
import { GitHubModule } from '../github/github.module';
import { PlatformTokenModule } from '../platform-tokens/platform-token.module';

@Module({
  imports: [
    HttpModule,
    ConfigModule,
    PrismaModule,
    GitlabModule,
    GitHubModule,
    PlatformTokenModule,
  ],
  controllers: [AiController],
  providers: [
    AiService,
    AIConfigService,
    ReviewTaskQueueService,
    KimiProvider,
  ],
  exports: [
    AiService,
    AIConfigService,
  ],
})
export class AiModule {}
