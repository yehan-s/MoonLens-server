import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import * as crypto from 'crypto';

interface GitHubPullRequestEvent {
  action: string;
  number: number;
  pull_request: {
    id: number;
    number: number;
    state: string;
    title: string;
    body: string;
    html_url: string;
    head: {
      ref: string;
      sha: string;
      repo: {
        name: string;
        full_name: string;
        clone_url: string;
      };
    };
    base: {
      ref: string;
      sha: string;
      repo: {
        name: string;
        full_name: string;
      };
    };
    user: {
      login: string;
      avatar_url: string;
    };
  };
  repository: {
    id: number;
    name: string;
    full_name: string;
    owner: {
      login: string;
    };
    html_url: string;
    clone_url: string;
  };
  sender: {
    login: string;
  };
}

@Injectable()
export class GitHubWebhookService {
  private readonly logger = new Logger(GitHubWebhookService.name);

  constructor(
    @InjectQueue('analysis') private analysisQueue: Queue,
    private readonly configService: ConfigService,
  ) {}

  /**
   * 验证 GitHub Webhook 签名
   */
  async verifySignature(signature: string, payload: any): Promise<void> {
    const secret = this.configService.get<string>('GITHUB_WEBHOOK_SECRET');
    
    if (!secret) {
      this.logger.warn('GITHUB_WEBHOOK_SECRET 未配置,跳过签名验证');
      return;
    }

    if (!signature) {
      throw new UnauthorizedException('缺少签名头');
    }

    // GitHub 使用 HMAC SHA256
    const hmac = crypto.createHmac('sha256', secret);
    const payloadString = JSON.stringify(payload);
    const calculatedSignature = 'sha256=' + hmac.update(payloadString).digest('hex');

    // 常量时间比较
    if (!this.constantTimeCompare(signature, calculatedSignature)) {
      throw new UnauthorizedException('签名验证失败');
    }
  }

  /**
   * 处理 GitHub 事件
   */
  async processGitHubEvent(eventType: string, payload: any): Promise<void> {
    this.logger.log(`处理GitHub事件: ${eventType}`);
    
    // 仅处理 PR 相关事件
    if (eventType !== 'pull_request') {
      this.logger.log(`忽略非PR事件: ${eventType}`);
      return;
    }

    const prEvent = payload as GitHubPullRequestEvent;
    
    // 仅处理打开或同步(更新)的 PR
    if (!this.shouldProcessPullRequest(prEvent)) {
      this.logger.log(`跳过PR动作: ${prEvent.action}`);
      return;
    }

    // 创建分析任务
    await this.createAnalysisTask(prEvent);
  }

  /**
   * 判断是否应处理此 PR
   */
  private shouldProcessPullRequest(event: GitHubPullRequestEvent): boolean {
    const action = event.action;
    
    // 处理打开、重新打开、同步(更新)的 PR
    const validActions = ['opened', 'reopened', 'synchronize'];
    
    return validActions.includes(action);
  }

  /**
   * 创建分析任务
   */
  private async createAnalysisTask(event: GitHubPullRequestEvent): Promise<void> {
    const pr = event.pull_request;
    const repo = event.repository;
    
    const taskData = {
      platform: 'github',
      projectId: String(repo.id),
      projectPath: repo.full_name,
      owner: repo.owner.login,
      repo: repo.name,
      mergeRequestId: pr.id,
      mergeRequestIid: pr.number,
      pullNumber: pr.number,
      sourceBranch: pr.head.ref,
      targetBranch: pr.base.ref,
      headSha: pr.head.sha,
      baseSha: pr.base.sha,
      title: pr.title,
      description: pr.body || '',
      url: pr.html_url,
      repoUrl: repo.clone_url,
      lastCommit: {
        id: pr.head.sha,
        message: '',
        timestamp: new Date().toISOString(),
        author: {
          name: pr.user.login,
          email: '',
        },
      },
      author: {
        name: pr.user.login,
        username: pr.user.login,
        email: '',
      },
      timestamp: new Date().toISOString(),
    };

    try {
      // 添加任务到队列
      const job = await this.analysisQueue.add('analyze-mr', taskData, {
        delay: 1000,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      });

      this.logger.log(`创建GitHub分析任务: ${job.id} for PR #${pr.number}`);
    } catch (error) {
      this.logger.error('创建分析任务失败:', error);
      throw error;
    }
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
