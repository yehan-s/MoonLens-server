import { Injectable } from '@nestjs/common';
import { AuditLogService } from '../../common/services/audit-log.service';
import { PrismaService } from '../../common/services/prisma.service';
import { ConfigService } from '@nestjs/config';
import { GitLabMetricsService } from './gitlab-metrics.service';

type SyncType = 'projects' | 'members' | 'branches';

@Injectable()
export class SecurityAuditService {
  constructor(
    private readonly audit: AuditLogService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly metrics: GitLabMetricsService,
  ) {}

  connectionCreated(userId: string, connectionId: string, host: string, authType: string) {
    this.audit.security('gitlab.connection.created', { id: userId }, { id: connectionId, host, authType });
    try { this.metrics.countAuditEvent('gitlab.connection.created'); } catch {}
  }

  connectionTested(userId: string, connectionId: string, ok: boolean, error?: string) {
    this.audit.security('gitlab.connection.test', { id: userId }, { id: connectionId }, { ok, error });
    try { this.metrics.countAuditEvent('gitlab.connection.test'); } catch {}
  }

  connectionDeleted(userId: string, connectionId: string) {
    this.audit.security('gitlab.connection.deleted', { id: userId }, { id: connectionId });
    try { this.metrics.countAuditEvent('gitlab.connection.deleted'); } catch {}
  }

  projectSyncTriggered(userId: string, connectionId: string, type: SyncType, result: Record<string, unknown>) {
    this.audit.security('gitlab.sync.trigger', { id: userId }, { id: connectionId, type }, result);
    try { this.metrics.countAuditEvent('gitlab.sync.trigger'); } catch {}
  }

  /** 恢复触发审计 */
  recoveryTriggered(userId: string, connectionId: string, scope: 'connection' | 'project', result: Record<string, unknown>) {
    this.audit.security('gitlab.recover.trigger', { id: userId }, { id: connectionId, scope }, result);
    try { this.metrics.countAuditEvent('gitlab.recover.trigger'); } catch {}
  }

  webhookEvent(eventType: string, projectId: string | undefined, status: 'handled' | 'ignored' | 'invalid_secret') {
    this.audit.security('gitlab.webhook', { type: eventType }, projectId ? { id: projectId } : undefined, { status });
    try { this.metrics.countAuditEvent('gitlab.webhook'); } catch {}
  }

  /**
   * 合规检查（连接级）
   * - host 必须是 https
   * - tokenCipher 存在
   * - OAUTH：必须有 tokenExpiresAt（或可刷新），应配置 client id/secret
   * - Webhook：建议存在全局或项目级 secret（只做提示，不作为强校验）
   */
  async checkCompliance(connectionId: string) {
    const conn = await this.prisma.gitlabConnection.findUnique({ where: { id: connectionId } });
    if (!conn) return { ok: false, issues: ['connection_not_found'] };
    const issues: string[] = [];
    const host = conn.host || '';
    if (!host.startsWith('https://')) issues.push('insecure_host_scheme');
    if (!conn.tokenCipher) issues.push('missing_token_cipher');

    if ((conn.authType as any) === 'OAUTH') {
      if (!conn.tokenExpiresAt) issues.push('oauth_missing_expiry');
      const hasClient = !!this.config.get<string>('GITLAB_OAUTH_CLIENT_ID') && !!this.config.get<string>('GITLAB_OAUTH_CLIENT_SECRET');
      if (!hasClient) issues.push('oauth_client_not_configured');
    }

    const globalWebhook = this.config.get<string>('GITLAB_WEBHOOK_SECRET');
    if (!globalWebhook) {
      // 连接下是否至少存在一个项目设置了 webhookSecret
      const anyProject = await this.prisma.project.findFirst({ where: { webhookSecret: { not: null } } });
      if (!anyProject) issues.push('webhook_secret_missing');
    }

    return { ok: issues.length === 0, issues };
  }

  async generateComplianceReport(connectionId: string) {
    const compliance = await this.checkCompliance(connectionId);
    const conn = await this.prisma.gitlabConnection.findUnique({ where: { id: connectionId } });
    const report = {
      connectionId,
      host: conn?.host,
      authType: conn?.authType,
      tokenExpiresAt: conn?.tokenExpiresAt ?? undefined,
      lastRefreshAt: (conn as any)?.lastRefreshAt ?? undefined,
      ok: compliance.ok,
      issues: compliance.issues,
      generatedAt: new Date().toISOString(),
    };
    try { this.metrics.countComplianceReport(report.ok, report.issues as string[]); } catch {}
    return report;
  }
}
