import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { GitHubController } from './github.controller';
import { GitHubService } from './github.service';
import { GitHubWebhookController } from './github-webhook.controller';
import { GitHubWebhookService } from './github-webhook.service';

@Module({
  imports: [
    ConfigModule,
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),
    BullModule.registerQueue({
      name: 'analysis',
    }),
  ],
  controllers: [GitHubController, GitHubWebhookController],
  providers: [GitHubService, GitHubWebhookService],
  exports: [GitHubService],
})
export class GitHubModule {}