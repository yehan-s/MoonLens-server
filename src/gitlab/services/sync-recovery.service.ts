import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { decryptSecret } from '../../common/utils/crypto.util';
import { GitlabApiClientService } from './gitlab-api-client.service';
import { GitlabTokenLifecycleService } from './token-lifecycle.service';
import { ProjectSyncService } from './project-sync.service';

/**
 * 同步恢复服务
 * - 校验本地与 GitLab 之间的数据一致性
 * - 发现缺失或不一致时，触发增量修复（项目、成员、分支）
 * - 支持按连接、按项目粒度执行
 */
@Injectable()
export class SyncRecoveryService {
  private readonly logger = new Logger(SyncRecoveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly api: GitlabApiClientService,
    private readonly tokenLife: GitlabTokenLifecycleService,
    private readonly projectSync: ProjectSyncService,
  ) {}

  /**
   * 针对指定连接执行全量一致性校验与修复
   */
  async recoverConnection(connectionId: string): Promise<{ checked: number; repaired: number }> {
    const conn = await this.prisma.gitlabConnection.findUnique({ where: { id: connectionId } });
    if (!conn || !conn.isActive) return { checked: 0, repaired: 0 };

    const host = conn.host;
    const authType = conn.authType as any as 'PAT' | 'OAUTH';
    const token = decryptSecret(conn.tokenCipher);
    const access = await this.tokenLife.maybeRefresh(conn.id, host, token, authType);
    this.api.configure({ host, token: access, authType, refresher: async () => this.tokenLife.refreshOAuth(conn.id, host) });

    const remoteProjects = await this.api.listProjects({ membership: true, perPage: 100 });
    let checked = 0;
    let repaired = 0;

    for (const rp of remoteProjects) {
      const gitlabId = String(rp.id);
      const res = await this.recoverProjectByGitlabId(connectionId, gitlabId).catch((e) => {
        this.logger.warn(`recover project ${gitlabId} failed: ${String(e)}`);
        return { repaired: 0 };
      });
      checked++;
      repaired += res.repaired;
    }

    // 可选：清理本地多余项目（不在 membership 列表）——此处暂不自动删除，仅记录
    return { checked, repaired };
  }

  /**
   * 恢复单个项目（通过 GitLab 项目 ID）
   */
  async recoverProjectByGitlabId(connectionId: string, projectGitlabId: string | number): Promise<{ repaired: number }> {
    const conn = await this.prisma.gitlabConnection.findUnique({ where: { id: connectionId } });
    if (!conn) return { repaired: 0 };
    const host = conn.host;
    const authType = conn.authType as any as 'PAT' | 'OAUTH';
    const token = decryptSecret(conn.tokenCipher);
    const access = await this.tokenLife.maybeRefresh(conn.id, host, token, authType);
    this.api.configure({ host, token: access, authType, refresher: async () => this.tokenLife.refreshOAuth(conn.id, host) });

    // 取远端真实状态
    const rp = await this.api.getProject(projectGitlabId);
    const gitlabId = String(rp.id);
    const name = rp.name as string;
    const webUrl = rp.web_url as string;
    const defaultBranch = (rp.default_branch as string) || null;

    // 校验/修复本地项目记录
    let repaired = 0;
    const local = await this.prisma.project.findFirst({ where: { gitlabProjectId: gitlabId } });
    if (!local) {
      await this.prisma.project.create({
        data: {
          name,
          description: null,
          gitlabProjectId: gitlabId,
          gitlabProjectUrl: webUrl,
          defaultBranch: defaultBranch || undefined,
          isActive: true,
          ownerId: conn.userId || (await this.ensureOwner()),
        },
      });
      repaired++;
    } else {
      const needUpdate = local.name !== name || local.gitlabProjectUrl !== webUrl || (defaultBranch && local.defaultBranch !== defaultBranch);
      if (needUpdate) {
        await this.prisma.project.update({
          where: { id: local.id },
          data: { name, gitlabProjectUrl: webUrl, defaultBranch: defaultBranch || local.defaultBranch || undefined },
        });
        repaired++;
      }
    }

    // 同步成员/分支（作为修复的一部分）
    const members = await this.projectSync.syncProjectMembers(conn.id, gitlabId).catch((e) => {
      this.logger.warn(`sync members failed for ${gitlabId}: ${String(e)}`);
      return { upserted: 0 };
    });
    repaired += members.upserted > 0 ? 1 : 0;

    const branches = await this.projectSync.syncProjectBranches(conn.id, gitlabId).catch((e) => {
      this.logger.warn(`sync branches failed for ${gitlabId}: ${String(e)}`);
      return { upserted: 0 };
    });
    repaired += branches.upserted > 0 ? 1 : 0;

    return { repaired };
  }

  /**
   * 简单拥有者兜底（与 ProjectSyncService 保持一致）
   */
  private async ensureOwner(): Promise<string> {
    const admin = await this.prisma.user.findFirst({ where: { role: 'ADMIN' } });
    if (admin) return admin.id;
    const any = await this.prisma.user.findFirst();
    if (!any) throw new Error('no user to own project');
    return any.id;
  }
}

