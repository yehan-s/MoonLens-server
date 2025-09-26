import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { Queue as BullQueue } from 'bull';
import { ConfigService } from '@nestjs/config';

interface GitLabMergeRequestEvent {
  object_kind: string;
  event_type: string;
  user: {
    id: number;
    name: string;
    username: string;
    email: string;
  };
  project: {
    id: number;
    name: string;
    description: string;
    web_url: string;
    namespace: string;
    path_with_namespace: string;
    default_branch: string;
    ssh_url_to_repo: string;
    http_url_to_repo: string;
  };
  object_attributes: {
    id: number;
    iid: number;
    target_branch: string;
    source_branch: string;
    state: string;
    title: string;
    description: string;
    url: string;
    action: string;
    last_commit: {
      id: string;
      message: string;
      timestamp: string;
      author: {
        name: string;
        email: string;
      };
    };
  };
  repository: {
    name: string;
    url: string;
    description: string;
    homepage: string;
  };
}

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    @InjectQueue('analysis') private analysisQueue: any,
    private configService: ConfigService,
  ) {}

  /**
   * 处理 GitLab 事件
   */
  async processGitLabEvent(eventType: string, payload: any): Promise<void> {
    this.logger.log(`Processing GitLab event: ${eventType}`);
    
    // 仅处理 MR 相关事件
    if (!this.isMergeRequestEvent(eventType)) {
      this.logger.log(`Ignoring non-MR event: ${eventType}`);
      return;
    }

    const mrEvent = payload as GitLabMergeRequestEvent;
    
    // 仅处理打开或更新的 MR
    if (!this.shouldProcessMergeRequest(mrEvent)) {
      this.logger.log(`Skipping MR with action: ${mrEvent.object_attributes?.action}`);
      return;
    }

    // 创建分析任务
    await this.createAnalysisTask(mrEvent);
  }

  /**
   * 判断是否为 MR 事件
   */
  private isMergeRequestEvent(eventType: string): boolean {
    return eventType === 'Merge Request Hook' || eventType === 'merge_request';
  }

  /**
   * 判断是否应处理此 MR
   */
  private shouldProcessMergeRequest(event: GitLabMergeRequestEvent): boolean {
    const action = event.object_attributes?.action;
    const state = event.object_attributes?.state;
    
    // 处理打开、重新打开、更新的 MR
    const validActions = ['open', 'reopen', 'update'];
    const validStates = ['opened', 'reopened'];
    
    return validActions.includes(action) || validStates.includes(state);
  }

  /**
   * 创建分析任务
   */
  private async createAnalysisTask(event: GitLabMergeRequestEvent): Promise<void> {
    const taskData = {
      projectId: event.project.id,
      projectPath: event.project.path_with_namespace,
      mergeRequestId: event.object_attributes.id,
      mergeRequestIid: event.object_attributes.iid,
      sourceBranch: event.object_attributes.source_branch,
      targetBranch: event.object_attributes.target_branch,
      title: event.object_attributes.title,
      description: event.object_attributes.description,
      url: event.object_attributes.url,
      repoUrl: event.project.http_url_to_repo,
      lastCommit: event.object_attributes.last_commit,
      author: {
        name: event.user.name,
        username: event.user.username,
        email: event.user.email,
      },
      timestamp: new Date().toISOString(),
    };

    try {
      // 添加任务到队列
      const job = await this.analysisQueue.add('analyze-mr', taskData, {
        delay: 1000, // 延迟 1 秒处理，避免瞬时负载
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      });

      this.logger.log(`Created analysis task: ${job.id} for MR ${taskData.mergeRequestIid}`);
    } catch (error) {
      this.logger.error('Failed to create analysis task:', error);
      throw error;
    }
  }

  /**
   * 验证 webhook 签名（用于 Guard）
   */
  async verifyWebhookSignature(token: string): Promise<boolean> {
    const expectedToken = this.configService.get<string>('GITLAB_WEBHOOK_TOKEN');
    
    if (!expectedToken) {
      this.logger.warn('GITLAB_WEBHOOK_TOKEN not configured');
      return false;
    }

    // 使用常量时间比较防止时序攻击
    return this.constantTimeCompare(token, expectedToken);
  }

  /**
   * 常量时间字符串比较
   */
  private constantTimeCompare(a: string, b: string): boolean {
    if (!a || !b || a.length !== b.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    
    return result === 0;
  }
}