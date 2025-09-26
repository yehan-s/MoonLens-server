import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { decryptSecret } from '../../common/utils/crypto.util';
import { GitlabApiClientService } from './gitlab-api-client.service';
import { GitlabTokenLifecycleService } from './token-lifecycle.service';
import { GitLabMetricsService } from './gitlab-metrics.service';

@Injectable()
export class ProjectSyncService {
  private readonly logger = new Logger(ProjectSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly api: GitlabApiClientService,
    private readonly tokenLife: GitlabTokenLifecycleService,
    private readonly metrics: GitLabMetricsService,
  ) {}

  /**
   * 基础项目信息同步（名称、URL、默认分支）
   */
  async syncProjects(connectionId: string): Promise<{ synced: number }> {
    const conn = await this.prisma.gitlabConnection.findUnique({ where: { id: connectionId } });
    if (!conn) throw new Error('connection not found');
    if (!conn.isActive) throw new Error('connection inactive');
    const token = decryptSecret(conn.tokenCipher);

    // 按需刷新 token（OAuth）
    const authType = conn.authType as any as 'PAT' | 'OAUTH';
    const host = conn.host;
    const access = await this.tokenLife.maybeRefresh(conn.id, host, token, authType);

    // 配置客户端
    this.api.configure({
      host,
      token: access,
      authType,
      refresher: async () => this.tokenLife.refreshOAuth(conn.id, host),
    });

    const projects = await this.api.listProjects({ membership: true, perPage: 100 });
    let count = 0;
    for (const p of projects) {
      const gitlabId = String(p.id);
      const name = p.name as string;
      const webUrl = p.web_url as string;
      const defaultBranch = p.default_branch as string | null;

      const existing = await this.prisma.project.findFirst({ where: { gitlabProjectId: gitlabId } });
      if (existing) {
        await this.prisma.project.update({
          where: { id: existing.id },
          data: { name, gitlabProjectUrl: webUrl, defaultBranch: defaultBranch || existing.defaultBranch || undefined },
        });
      } else {
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
      }
      count++;
    }
    await this.prisma.gitlabConnection.update({ where: { id: conn.id }, data: { lastUsedAt: new Date(), usageCount: { increment: 1 } } });
    try { this.metrics.countSync('projects', 'success', count); } catch {}
    return { synced: count };
  }

  /**
   * 导入指定项目（按项目ID列表）
   */
  async importProjects(connectionId: string, projectIds: Array<string | number>): Promise<{ imported: number }> {
    const conn = await this.prisma.gitlabConnection.findUnique({ where: { id: connectionId } });
    if (!conn) throw new Error('connection not found');
    if (!conn.isActive) throw new Error('connection inactive');
    const token = decryptSecret(conn.tokenCipher);
    const authType = conn.authType as any as 'PAT' | 'OAUTH';
    const host = conn.host;
    const access = await this.tokenLife.maybeRefresh(conn.id, host, token, authType);
    this.api.configure({ host, token: access, authType, refresher: async () => this.tokenLife.refreshOAuth(conn.id, host) });

    let count = 0;
    for (const id of projectIds) {
      try {
        const p = await this.api.getProject(id);
        const gitlabId = String(p.id);
        const name = p.name as string;
        const webUrl = p.web_url as string;
        const defaultBranch = p.default_branch as string | null;

        const existing = await this.prisma.project.findFirst({ where: { gitlabProjectId: gitlabId } });
        if (existing) {
          await this.prisma.project.update({
            where: { id: existing.id },
            data: { name, gitlabProjectUrl: webUrl, defaultBranch: defaultBranch || existing.defaultBranch || undefined },
          });
        } else {
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
        }
        count++;
      } catch (e) {
        this.logger.warn(`import project ${id} failed: ${String(e)}`);
      }
    }
    await this.prisma.gitlabConnection.update({ where: { id: conn.id }, data: { lastUsedAt: new Date(), usageCount: { increment: 1 } } });
    return { imported: count };
  }

  async syncProjectMembers(connectionId: string, projectGitlabId: string | number): Promise<{ upserted: number }> {
    const conn = await this.prisma.gitlabConnection.findUnique({ where: { id: connectionId } });
    if (!conn) throw new Error('connection not found');
    const token = decryptSecret(conn.tokenCipher);
    const host = conn.host;
    const authType = conn.authType as any as 'PAT' | 'OAUTH';
    const access = await this.tokenLife.maybeRefresh(conn.id, host, token, authType);
    this.api.configure({ host, token: access, authType, refresher: async () => this.tokenLife.refreshOAuth(conn.id, host) });

    const members: any[] = [];
    const perPage = 100;
    for (let page = 1; ; page++) {
      const batch = await this.api.listProjectMembers(projectGitlabId, { perPage, page });
      if (!batch || batch.length === 0) break;
      members.push(...batch);
      if (batch.length < perPage) break;
    }
    const project = await this.prisma.project.findFirst({ where: { gitlabProjectId: String(projectGitlabId) } });
    if (!project) throw new Error('project not found locally');
    let upserted = 0;
    const seen = new Set<string>();
    for (const m of members) {
      const gitlabUserId = String(m.id);
      seen.add(gitlabUserId);
      await this.prisma.projectMember.upsert({
        where: { projectId_gitlabUserId: { projectId: project.id, gitlabUserId } },
        update: {
          username: m.username || null,
          name: m.name || null,
          email: m.email || null,
          accessLevel: m.access_level ?? null,
          state: m.state || null,
          avatarUrl: m.avatar_url || null,
          webUrl: m.web_url || null,
        },
        create: {
          projectId: project.id,
          gitlabUserId,
          username: m.username || null,
          name: m.name || null,
          email: m.email || null,
          accessLevel: m.access_level ?? null,
          state: m.state || null,
          avatarUrl: m.avatar_url || null,
          webUrl: m.web_url || null,
        },
      });
      upserted++;
    }
    // 删除已不存在的成员
    await this.prisma.projectMember.deleteMany({
      where: { projectId: project.id, gitlabUserId: { notIn: Array.from(seen) } },
    });
    await this.prisma.project.update({ where: { id: project.id }, data: { lastMembersSyncAt: new Date() } });
    try { this.metrics.countSync('members', 'success', upserted); } catch {}
    return { upserted };
  }

  async syncProjectBranches(connectionId: string, projectGitlabId: string | number): Promise<{ upserted: number }> {
    const conn = await this.prisma.gitlabConnection.findUnique({ where: { id: connectionId } });
    if (!conn) throw new Error('connection not found');
    const token = decryptSecret(conn.tokenCipher);
    const host = conn.host;
    const authType = conn.authType as any as 'PAT' | 'OAUTH';
    const access = await this.tokenLife.maybeRefresh(conn.id, host, token, authType);
    this.api.configure({ host, token: access, authType, refresher: async () => this.tokenLife.refreshOAuth(conn.id, host) });

    const branches: any[] = [];
    const perPage = 100;
    for (let page = 1; ; page++) {
      const batch = await this.api.listProjectBranches(projectGitlabId, { perPage, page });
      if (!batch || batch.length === 0) break;
      branches.push(...batch);
      if (batch.length < perPage) break;
    }
    const project = await this.prisma.project.findFirst({ where: { gitlabProjectId: String(projectGitlabId) } });
    if (!project) throw new Error('project not found locally');
    let upserted = 0;
    const kept = new Set<string>();
    for (const b of branches) {
      const name = String(b.name);
      kept.add(name);
      await this.prisma.projectBranch.upsert({
        where: { projectId_name: { projectId: project.id, name } },
        update: {
          isDefault: (typeof b.default === 'boolean') ? b.default : (project.defaultBranch ? project.defaultBranch === name : null),
          isProtected: b.protected ?? null,
        },
        create: {
          projectId: project.id,
          name,
          isDefault: (typeof b.default === 'boolean') ? b.default : (project.defaultBranch ? project.defaultBranch === name : null),
          isProtected: b.protected ?? null,
        },
      });
      upserted++;
    }
    await this.prisma.projectBranch.deleteMany({ where: { projectId: project.id, name: { notIn: Array.from(kept) } } });
    await this.prisma.project.update({ where: { id: project.id }, data: { lastBranchesSyncAt: new Date() } });
    try { this.metrics.countSync('branches', 'success', upserted); } catch {}
    return { upserted };
  }

  private async ensureOwner(): Promise<string> {
    // 若缺少 owner（全局连接），选择任意管理员或首个用户作为占位
    const admin = await this.prisma.user.findFirst({ where: { role: 'ADMIN' } });
    if (admin) return admin.id;
    const any = await this.prisma.user.findFirst();
    if (!any) throw new Error('no user to own project');
    return any.id;
  }
}
