import { Body, Controller, ForbiddenException, Headers, HttpCode, Post } from '@nestjs/common';
import { createHmac } from 'crypto';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { GitLabMetricsService } from '../services/gitlab-metrics.service';
import { SecurityAuditService } from '../services/security-audit.service';
import { GitlabCacheService } from '../cache/gitlab.cache';

@ApiTags('GitLab Webhook')
@Controller('webhooks/gitlab')
export class GitlabWebhookController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: GitLabMetricsService,
    private readonly audit: SecurityAuditService,
    @InjectQueue('gitlab-events') private readonly queue: Queue,
    private readonly cache: GitlabCacheService,
  ) {}

  @Post()
  @HttpCode(202)
  @ApiOperation({ summary: '接收 GitLab Webhook 事件（校验 X-Gitlab-Token）' })
  async handle(
    @Body() payload: any,
    @Headers('x-gitlab-token') token: string,
    @Headers('x-gitlab-event') eventType: string,
    @Headers('x-gitlab-event-signature') eventSig?: string,
    @Headers('x-gitlab-webhook-signature') webhookSig?: string,
  ) {
    // 解析项目 ID（兼容多种事件结构）
    const projectId = String(
      payload?.project?.id ?? payload?.project_id ?? payload?.object_attributes?.target_project_id ?? payload?.object_attributes?.project_id ?? '',
    );

    // 校验 Secret：优先项目级 secret，其次全局 env
    const globalSecret = process.env.GITLAB_WEBHOOK_SECRET;
    let localProject = null as { id: string; webhookSecret: string | null } | null;
    if (projectId) {
      localProject = await this.prisma.project.findFirst({
        where: { gitlabProjectId: projectId },
        select: { id: true, webhookSecret: true },
      });
    }

    const expected = localProject?.webhookSecret || globalSecret;
    if (!expected) {
      try { this.metrics.countWebhook(eventType, 'invalid_secret'); } catch {}
      try { this.audit.webhookEvent(eventType, projectId || undefined, 'invalid_secret'); } catch {}
      throw new ForbiddenException('Invalid webhook secret');
    }
    const tokenOk = !!token && token === expected;
    let hmacOk = false;
    const h = eventSig || webhookSig;
    if (!tokenOk && h) {
      try {
        const raw = typeof payload === 'string' ? (payload as any) : JSON.stringify(payload);
        const digest = createHmac('sha256', expected).update(raw).digest('hex');
        const normalized = String(h).startsWith('sha256=') ? String(h).substring(7) : String(h);
        hmacOk = digest === normalized;
      } catch {
        hmacOk = false;
      }
    }
    if (!tokenOk && !hmacOk) {
      try { this.metrics.countWebhook(eventType, 'invalid_secret'); } catch {}
      try { this.audit.webhookEvent(eventType, projectId || undefined, 'invalid_secret'); } catch {}
      throw new ForbiddenException('Invalid webhook credentials');
    }

    // 未匹配到本地项目则直接接受（可记录为孤儿事件，也可丢弃）
    if (!localProject) {
      try { this.metrics.countWebhook(eventType, 'ignored'); } catch {}
      try { this.audit.webhookEvent(eventType, projectId || undefined, 'ignored'); } catch {}
      return { ok: true, ignored: true };
    }

    // 幂等性：使用事件UUID或摘要进行短期去重（10分钟）
    const uuid = (arguments as any)?.[0]?.headers?.['x-gitlab-event-uuid'] || undefined;
    const raw = typeof payload === 'string' ? (payload as any) : JSON.stringify(payload);
    const hashKey = require('crypto').createHash('sha256').update(String(uuid || '') + '|' + eventType + '|' + projectId + '|' + raw).digest('hex');
    const dedupKey = this.cache.keyFor('project', projectId, `evt:${hashKey}`);
    const already = await this.cache.wrap(dedupKey, 600, async () => false); // 若不存在将写入 false，再下方置 true
    if (already === true) {
      try { this.metrics.countWebhook(eventType, 'handled'); } catch {}
      try { this.audit.webhookEvent(eventType, localProject.id, 'handled'); } catch {}
      return { ok: true, duplicate: true };
    }

    // 记录事件（异步处理可由队列/消费者完成，这里仅落库）
    const created = await this.prisma.webhookEvent.create({
      data: {
        projectId: localProject.id,
        eventType: eventType || 'unknown',
        payload,
      },
    });
    // 入队异步处理
    try {
      await this.queue.add({ eventId: created.id }, { attempts: 3, backoff: { type: 'exponential', delay: 1000 } })
    } catch {}
    // 标记幂等缓存为已处理
    await this.cache.del(dedupKey).catch(() => void 0);
    await this.cache.wrap(dedupKey, 600, async () => true);
    try { this.metrics.countWebhook(eventType, 'handled'); } catch {}
    try { this.audit.webhookEvent(eventType, localProject.id, 'handled'); } catch {}
    return { ok: true };
  }
}
