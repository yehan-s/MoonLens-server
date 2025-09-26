import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { decryptSecret, encryptSecret } from '../../common/utils/crypto.util';
import { GitLabMetricsService } from './gitlab-metrics.service';

@Injectable()
export class GitlabTokenLifecycleService {
  private readonly logger = new Logger(GitlabTokenLifecycleService.name);

  constructor(private readonly prisma: PrismaService, private readonly metrics: GitLabMetricsService) {}

  /** 判断是否需要刷新（剩余 < buffer 秒） */
  needsRefresh(expiresAt?: Date, bufferSec = 120): boolean {
    if (!expiresAt) return false;
    return expiresAt.getTime() - Date.now() < bufferSec * 1000;
  }

  async maybeRefresh(connectionId: string, host: string, token: string, authType: 'PAT' | 'OAUTH'): Promise<string> {
    if (authType !== 'OAUTH') return token;
    const conn = await this.prisma.gitlabConnection.findUnique({ where: { id: connectionId } });
    if (!conn) return token;
    if (!this.needsRefresh(conn.tokenExpiresAt || undefined)) return token;
    try {
      return await this.refreshOAuth(conn.id, host);
    } catch (e) {
      this.logger.warn(`OAuth refresh failed for ${connectionId}: ${String(e)}`);
      return token;
    }
  }

  /** 刷新 OAuth Access Token（使用 env 客户端配置） */
  async refreshOAuth(connectionId: string, host: string): Promise<string> {
    const conn = await this.prisma.gitlabConnection.findUnique({ where: { id: connectionId } });
    if (!conn) throw new Error('connection not found');
    const clientId = process.env.GITLAB_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GITLAB_OAUTH_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new Error('missing oauth client');

    // 读取 refresh_token（如无则失败）
    const packed = (conn as any).oauthRefreshCipher as string | null;
    if (!packed) throw new Error('no refresh token');
    const refreshToken = decryptSecret(packed);

    const url = `${host}/oauth/token`;
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    });
    const res = await fetch(url, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } as any });
    if (!res.ok) throw new Error(`refresh http ${res.status}`);
    const data = await res.json();
    const access = data.access_token as string;
    const nextRefresh = data.refresh_token as string | undefined;
    const expiresIn = data.expires_in as number | undefined;
    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;

    await this.prisma.gitlabConnection.update({
      where: { id: connectionId },
      data: {
        tokenCipher: encryptSecret(access),
        tokenExpiresAt: expiresAt,
        ...(nextRefresh ? { oauthRefreshCipher: encryptSecret(nextRefresh) } : {}),
        lastRefreshAt: new Date(),
      } as any,
    });

    try { this.metrics.countTokenRefresh('success'); } catch {}
    return access;
  }
}
