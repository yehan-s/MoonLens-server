import { Controller, Post, Body, Headers, Logger, HttpCode } from '@nestjs/common';
import { GitHubWebhookService } from './github-webhook.service';

@Controller('webhooks/github')
export class GitHubWebhookController {
  private readonly logger = new Logger(GitHubWebhookController.name);

  constructor(private readonly webhookService: GitHubWebhookService) {}

  /**
   * 处理 GitHub Webhook 事件
   */
  @Post()
  @HttpCode(200)
  async handleWebhook(
    @Headers('x-github-event') eventType: string,
    @Headers('x-hub-signature-256') signature: string,
    @Body() payload: any,
  ) {
    this.logger.log(`收到GitHub Webhook: ${eventType}`);
    
    try {
      // 验证签名
      await this.webhookService.verifySignature(signature, payload);
      
      // 处理事件
      await this.webhookService.processGitHubEvent(eventType, payload);
      
      return { message: 'Webhook processed successfully' };
    } catch (error) {
      this.logger.error(`Webhook处理失败: ${error.message}`, error.stack);
      throw error;
    }
  }
}
