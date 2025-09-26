import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { WebhookService } from './webhook.service';
import { WebhookSignatureGuard } from '../../guards/webhook-signature.guard';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(private readonly webhookService: WebhookService) {}

  @Post('gitlab')
  @HttpCode(HttpStatus.OK)
  @UseGuards(WebhookSignatureGuard)
  @ApiOperation({ summary: 'Receive GitLab webhook events' })
  @ApiHeader({
    name: 'X-Gitlab-Token',
    description: 'GitLab webhook secret token',
    required: true,
  })
  @ApiResponse({ status: 200, description: 'Webhook processed successfully' })
  @ApiResponse({ status: 401, description: 'Invalid signature' })
  async handleGitLabWebhook(
    @Body() payload: any,
    @Headers('x-gitlab-event') eventType: string,
    @Headers('x-gitlab-token') token: string,
  ) {
    this.logger.log(`Received GitLab webhook: ${eventType}`);
    
    // 立即返回 200，异步处理
    setImmediate(async () => {
      try {
        await this.webhookService.processGitLabEvent(eventType, payload);
      } catch (error) {
        this.logger.error('Failed to process webhook:', error);
      }
    });
    
    return { 
      success: true, 
      message: 'Webhook received and queued for processing' 
    };
  }
}