import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { PaginationQueryDto } from './dto/pagination.dto';
import { ProjectConfigurationService } from '../gitlab/services/project-configuration.service';
import { ProjectSyncService } from '../gitlab/services/project-sync.service';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configSvc: ProjectConfigurationService,
    private readonly projectSync: ProjectSyncService,
  ) {}

  async create(dto: CreateProjectDto) {
    const created = await this.prisma.project.create({
      data: {
        name: dto.name,
        description: dto.description || null,
        gitlabProjectId: dto.gitlabProjectId,
        gitlabProjectUrl: dto.gitlabProjectUrl,
        defaultBranch: dto.defaultBranch || 'main',
        isActive: dto.isActive ?? true,
        ownerId: await this.findOwnerId(),
      },
    });
    return created;
  }

  async list(query: PaginationQueryDto) {
    const { page, limit, search, status } = query;
    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { description: { contains: search } },
        { gitlabProjectId: { contains: search } },
      ];
    }
    if (status) where.isActive = status === 'active';
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.project.count({ where }),
      this.prisma.project.findMany({ where, orderBy: { updatedAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
    ]);
    return { projects: rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async get(id: string) {
    const row = await this.prisma.project.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('project not found');
    // 附带成员与简单统计
    const members = await this.prisma.projectMember.findMany({ where: { projectId: id } });
    const reviewsCount = await this.prisma.review.count({ where: { projectId: id } });
    return { ...row, members, statistics: { reviews: reviewsCount } };
  }

  async update(id: string, dto: UpdateProjectDto) {
    const row = await this.prisma.project.update({ where: { id }, data: { ...dto } as any });
    return { project: row };
  }

  async archive(id: string) {
    await this.prisma.project.update({ where: { id }, data: { isActive: false } });
  }

  async getConfig(id: string) {
    return await this.configSvc.get(id);
  }

  async patchConfig(id: string, patch: any) {
    return await this.configSvc.patch(id, patch);
  }

  async listMembers(id: string) {
    const pj = await this.prisma.project.findUnique({ where: { id } });
    if (!pj) throw new NotFoundException('project not found');
    const rows = await this.prisma.projectMember.findMany({ where: { projectId: id } });
    return { members: rows };
  }

  async addMembers(id: string, users: Array<{ gitlabUserId?: string; email?: string; username?: string; accessLevel?: number }>) {
    const pj = await this.prisma.project.findUnique({ where: { id } });
    if (!pj) throw new NotFoundException('project not found');
    let cnt = 0;
    for (const u of users) {
      if (!u.gitlabUserId) continue;
      await this.prisma.projectMember.upsert({
        where: { projectId_gitlabUserId: { projectId: id, gitlabUserId: String(u.gitlabUserId) } },
        update: { username: u.username || null, email: u.email || null, accessLevel: u.accessLevel ?? null },
        create: { projectId: id, gitlabUserId: String(u.gitlabUserId), username: u.username || null, email: u.email || null, accessLevel: u.accessLevel ?? null },
      });
      cnt++;
    }
    return { added: cnt };
  }

  async removeMember(id: string, gitlabUserId: string) {
    const pj = await this.prisma.project.findUnique({ where: { id } });
    if (!pj) throw new NotFoundException('project not found');
    await this.prisma.projectMember.delete({ where: { projectId_gitlabUserId: { projectId: id, gitlabUserId: String(gitlabUserId) } } });
    return { ok: true };
  }

  async syncStatus(id: string) {
    const pj = await this.prisma.project.findUnique({ where: { id } });
    if (!pj) throw new NotFoundException('project not found');
    return {
      status: 'synced',
      lastMembersSyncAt: pj.lastMembersSyncAt ?? null,
      lastBranchesSyncAt: pj.lastBranchesSyncAt ?? null,
      webhookActive: !!pj.webhookId,
    };
  }

  async syncProject(id: string) {
    const pj = await this.prisma.project.findUnique({ where: { id } });
    if (!pj) throw new NotFoundException('project not found');
    // 从项目配置读取关联的 connectionId
    const cfg = await this.configSvc.get(id);
    const connId = cfg?.association?.connectionId;
    if (!connId) return { ok: false, message: 'connection not linked' };
    const members = await this.projectSync.syncProjectMembers(connId, pj.gitlabProjectId);
    const branches = await this.projectSync.syncProjectBranches(connId, pj.gitlabProjectId);
    return { ok: true, members, branches };
  }

  private async findOwnerId(): Promise<string> {
    const admin = await this.prisma.user.findFirst({ where: { role: 'ADMIN' } });
    if (admin) return admin.id;
    const any = await this.prisma.user.findFirst();
    if (!any) throw new Error('no user to own project');
    return any.id;
  }
}
