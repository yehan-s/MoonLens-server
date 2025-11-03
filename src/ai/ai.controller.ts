import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Delete,
  Inject,
} from '@nestjs/common';
import { AiService, ReviewRequest, ReviewReport } from './ai.service';
import { AIConfigService } from './services/ai-config.service';
import type { AISettings, AIProviderConfig } from './services/ai-config.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller()
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly configService: AIConfigService,
  ) {}

  /**
   * 执行AI代码审查
   * POST /api/ai/review
   */
  @Post('ai/review')
  @HttpCode(HttpStatus.OK)
  async reviewMergeRequest(
    @Request() req: any,
    @Body() body: {
      projectId: string;
      mrIid: string;
      provider?: string;
      apiKey?: string;
      model?: string;
      rules?: string[];
      fullReview?: boolean;
      async?: boolean; // 新增：是否异步执行
    },
  ): Promise<ReviewReport | { taskId: string; status: string }> {
    // 平台标识（用于确定读取哪个token头）
    const platform = (req.headers['x-git-platform'] as string) || body?.['platform'] || ''

    // 兼容前端传入的 Authorization 代理头，优先使用 Bearer 头，其次回退到旧头
    const gitlabAuthHeader = (req.headers['x-gitlab-authorization'] as string) || ''
    const githubAuthHeader = (req.headers['x-github-authorization'] as string) || ''

    // 由于后端自己的JWT占用 Authorization 头，这里只读取自定义头，避免冲突
    const gitlabToken = gitlabAuthHeader || (req.headers['private-token'] as string)
    // GitHub 服务内部会拼接 `token <accessToken>`，这里传入裸 token
    const githubToken = (githubAuthHeader && (githubAuthHeader as string).replace(/^token\s+/i, ''))
      || (req.headers['github-token'] as string)

    const reviewRequest: ReviewRequest = {
      ...body,
      userId: req.user.userId || req.user.id,
      gitlabToken,
      githubToken,
    };

    // 如果指定异步执行，创建任务并立即返回
    if (body.async) {
      return await this.aiService.createReviewTask(reviewRequest);
    }

    // 否则同步执行（向后兼容）
    return await this.aiService.reviewMergeRequest(reviewRequest);
  }


  /**
   * 查询任务状态
   * GET /api/ai/review/task/:taskId/status
   */
  @Get('ai/review/task/:taskId/status')
  async getTaskStatus(
    @Request() req: any,
    @Param('taskId') taskId: string,
  ) {
    const status = this.aiService.getTaskStatus(taskId);
    
    if (!status) {
      return {
        success: false,
        message: '任务不存在',
      };
    }

    return {
      success: true,
      data: status,
    };
  }

  /**
   * 获取任务结果
   * GET /api/ai/review/task/:taskId/result
   */
  @Get('ai/review/task/:taskId/result')
  async getTaskResult(
    @Request() req: any,
    @Param('taskId') taskId: string,
  ) {
    const result = this.aiService.getTaskResult(taskId);
    
    if (!result) {
      return {
        success: false,
        message: '任务不存在',
      };
    }

    if (result.status !== 'completed') {
      return {
        success: false,
        message: result.message || '任务尚未完成',
        data: {
          taskId: result.taskId,
          status: result.status,
        },
      };
    }

    return {
      success: true,
      data: result.result,
    };
  }

  /**
   * 获取用户的任务列表
   * GET /api/ai/review/tasks
   */
  @Get('ai/review/tasks')
  async getUserTasks(
    @Request() req: any,
    @Query('limit') limit?: string,
  ) {
    const userId = req.user.userId || req.user.id;
    const tasks = this.aiService.getUserTasks(userId, limit ? parseInt(limit) : 20);
    
    return {
      success: true,
      data: tasks,
    };
  }

  /**
   * 获取AI审查历史
   * GET /api/ai/review/history
   */
  @Get('ai/review/history')
  async getReviewHistory(
    @Request() req: any,
    @Query('projectId') projectId?: string,
    @Query('mrIid') mrIid?: string,
  ): Promise<ReviewReport[]> {
    const userId = req.user.userId || req.user.id;
    return await this.aiService.getReviewHistory(userId, projectId, mrIid);
  }

  /**
   * 获取用户的AI配置
   * GET /api/settings/ai
   */
  @Get('settings/ai')
  async getAISettings(@Request() req: any): Promise<{ data: AISettings | null }> {
    const userId = req.user.userId || req.user.id;
    const settings = await this.configService.getUserAIConfig(userId);
    return { data: settings };
  }

  /**
   * 保存用户的AI配置
   * POST /api/settings/ai
   */
  @Post('settings/ai')
  @HttpCode(HttpStatus.OK)
  async saveAISettings(
    @Request() req: any,
    @Body() settings: any,
  ): Promise<{ success: boolean; data: AISettings }> {
    const userId = req.user.userId || req.user.id;
    
    // 处理单个provider配置或完整设置
    let fullSettings: AISettings;
    
    if ('provider' in settings && 'apiKey' in settings) {
      // 单个provider配置
      const currentSettings = await this.configService.getUserAIConfig(userId) || {
        userId,
        providers: [] as AIProviderConfig[],
      };
      
      // 更新或添加provider
      const providerIndex = currentSettings.providers.findIndex(
        (p: AIProviderConfig) => p.provider === settings.provider,
      );
      
      if (providerIndex >= 0) {
        currentSettings.providers[providerIndex] = settings as AIProviderConfig;
      } else {
        currentSettings.providers.push(settings as AIProviderConfig);
      }
      
      // 如果是第一个provider，设置为默认
      if (currentSettings.providers.length === 1) {
        (currentSettings as any).defaultProvider = settings.provider;
      }
      
      fullSettings = currentSettings;
    } else {
      // 完整设置
      fullSettings = {
        ...settings as AISettings,
        userId,
      };
    }
    
    const saved = await this.configService.saveUserAIConfig(userId, fullSettings);
    return { success: true, data: saved };
  }

  /**
   * 删除用户的AI配置
   * DELETE /api/settings/ai
   */
  @Delete('settings/ai')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAISettings(@Request() req: any): Promise<void> {
    const userId = req.user.userId || req.user.id;
    await this.configService.deleteUserAIConfig(userId);
  }

  /**
   * 验证AI配置
   * POST /api/settings/ai/validate
   */
  @Post('settings/ai/validate')
  @HttpCode(HttpStatus.OK)
  async validateAIConfig(
    @Body() config: any,
  ): Promise<{ valid: boolean; message: string }> {
    // 验证API密钥格式
    const isFormatValid = this.configService.validateApiKey(
      config.provider,
      config.apiKey,
    );
    
    if (!isFormatValid) {
      return {
        valid: false,
        message: 'API密钥格式不正确',
      };
    }

    // 验证连接
    const isConnectionValid = await this.aiService.validateAIConfig(config as AIProviderConfig);
    
    return {
      valid: isConnectionValid,
      message: isConnectionValid ? '配置验证成功' : '无法连接到AI服务',
    };
  }

  /**
   * 获取支持的AI提供商
   * GET /api/settings/ai/providers
   */
  @Get('settings/ai/providers')
  getSupportedProviders() {
    return {
      data: this.configService.getSupportedProviders(),
    };
  }
}
