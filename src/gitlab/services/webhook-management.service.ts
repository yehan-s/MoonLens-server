import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GitlabApiClientService } from './gitlab-api-client.service';
import { GitlabTokenLifecycleService } from './token-lifecycle.service';
import { GitLabMetricsService } from './gitlab-metrics.service';
import { randomBytes } from 'crypto';
import { decryptSecret } from '../../common/utils/crypto.util';

@Injectable()
export class WebhookManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly api: GitlabApiClientService,
    private readonly tokenLife: GitlabTokenLifecycleService,
    private readonly metrics: GitLabMetricsService,
  ) {}

  private defaultCallbackUrl(): string {
    const base = process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    return `${base}/api/webhooks/gitlab`;
  }

  private async configureClient(connectionId: string) {
    const conn = await this.prisma.gitlabConnection.findUnique({ where: { id: connectionId } });
    if (!conn) throw new NotFoundException('connection not found');
    const token = decryptSecret(conn.tokenCipher as any);
    const host = conn.host;
    const authType = conn.authType as any as 'PAT' | 'OAUTH';
    const access = await this.tokenLife.maybeRefresh(conn.id, host, token, authType);
    this.api.configure({ host, token: access, authType, refresher: async () => this.tokenLife.refreshOAuth(conn.id, host) });
    return conn;
  }

  async upsertProjectHook(connectionId: string, projectGitlabId: string | number, opts: {
    callbackUrl?: string; secret?: string; pushEvents?: boolean; mergeRequestsEvents?: boolean; enableSslVerification?: boolean;
  }) {
    await this.configureClient(connectionId);
    const project = await this.prisma.project.findFirst({ where: { gitlabProjectId: String(projectGitlabId) } });
    const url = opts.callbackUrl || this.defaultCallbackUrl();
    const secret = opts.secret || project?.webhookSecret || randomBytes(16).toString('hex');
    const body: any = {
      url,
      token: secret,
      enable_ssl_verification: opts.enableSslVerification ?? true,
      push_events: opts.pushEvents ?? true,
      merge_requests_events: opts.mergeRequestsEvents ?? true,
    };

    let hook: any;
    if (project?.webhookId) {
      hook = await this.api.updateProjectHook(projectGitlabId, project.webhookId, body);
    } else {
      hook = await this.api.createProjectHook(projectGitlabId, body);
      // 持久化到本地项目
      if (project) {
        await this.prisma.project.update({ where: { id: project.id }, data: { webhookId: String(hook.id), webhookSecret: secret } });
      }
    }
    try { this.metrics.countWebhookManage('upsert', 'success'); } catch {}
    return { hookId: String(hook.id), url: hook.url, pushEvents: !!hook.push_events, mergeRequestsEvents: !!hook.merge_requests_events };
  }

  async deleteProjectHook(connectionId: string, projectGitlabId: string | number) {
    await this.configureClient(connectionId);
    const project = await this.prisma.project.findFirst({ where: { gitlabProjectId: String(projectGitlabId) } });
    if (project?.webhookId) {
      await this.api.deleteProjectHook(projectGitlabId, project.webhookId);
      await this.prisma.project.update({ where: { id: project.id }, data: { webhookId: null, webhookSecret: null } });
      try { this.metrics.countWebhookManage('delete', 'success'); } catch {}
      return { ok: true };
    }
    try { this.metrics.countWebhookManage('delete', 'noop'); } catch {}
    return { ok: true };
  }

  async testProjectHook(connectionId: string, projectGitlabId: string | number) {
    await this.configureClient(connectionId);
    // 简化为读取 hooks 列表进行存在性验证
    const hooks = await this.api.listProjectHooks(projectGitlabId);
    const project = await this.prisma.project.findFirst({ where: { gitlabProjectId: String(projectGitlabId) } });
    const exists = project?.webhookId ? hooks.some((h: any) => String(h.id) === String(project.webhookId)) : hooks.length > 0;
    try { this.metrics.countWebhookManage('test', exists ? 'success' : 'not_found'); } catch {}
    return { ok: exists };
  }
}
