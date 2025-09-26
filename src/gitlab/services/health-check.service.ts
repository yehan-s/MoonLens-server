import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { decryptSecret } from '../../common/utils/crypto.util';
import { GitlabApiClientService } from './gitlab-api-client.service';
import { GitlabTokenLifecycleService } from './token-lifecycle.service';
import { GitLabMetricsService } from './gitlab-metrics.service';

/**
 * GitLab 健康检查服务
 * - 连接连通性检测（access token 有效性）
 * - API 可用性检测（/api/v4/user）
 * - 汇总健康状态（活跃连接数/可用连接数）
 */
@Injectable()
export class GitlabHealthCheckService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly api: GitlabApiClientService,
    private readonly tokenLife: GitlabTokenLifecycleService,
    private readonly metrics: GitLabMetricsService,
  ) {}

  /**
   * 检测指定连接的连通性
   */
  async checkConnection(connectionId: string) {
    const conn = await this.prisma.gitlabConnection.findUnique({ where: { id: connectionId } });
    if (!conn) {
      return { ok: false, reason: 'connection_not_found' };
    }
    if (!conn.isActive) {
      return { ok: false, reason: 'connection_inactive' };
    }

    const token = decryptSecret(conn.tokenCipher);
    const authType = conn.authType as any as 'PAT' | 'OAUTH';
    const host = conn.host;
    const access = await this.tokenLife.maybeRefresh(conn.id, host, token, authType);
    this.api.configure({ host, token: access, authType, refresher: async () => this.tokenLife.refreshOAuth(conn.id, host) });

    try {
      const ok = await this.api.ping();
      return {
        ok,
        host,
        authType,
        tokenExpiresAt: conn.tokenExpiresAt ?? undefined,
        lastRefreshAt: conn.lastRefreshAt ?? undefined,
      };
    } catch (e) {
      return { ok: false, reason: 'api_unreachable', error: String(e) };
    }
  }

  /**
   * 汇总健康状态
   */
  async overall() {
    const total = await this.prisma.gitlabConnection.count({ where: { isActive: true } });
    let okCount = 0;
    const rows = await this.prisma.gitlabConnection.findMany({ where: { isActive: true }, select: { id: true } });
    for (const r of rows) {
      const res = await this.checkConnection(r.id);
      if (res.ok) okCount++;
    }
    try { this.metrics.setActiveConnections(total); } catch {}
    return { totalActiveConnections: total, healthyConnections: okCount, status: okCount > 0 ? 'ok' : (total > 0 ? 'degraded' : 'idle') };
  }
}

