import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/services/prisma.service';

export interface AddMemberInput {
  gitlabUserId?: string;
  email?: string;
  username?: string;
  accessLevel?: number;
}

@Injectable()
export class ProjectMemberService {
  constructor(private readonly prisma: PrismaService) {}

  async list(projectId: string) {
    const pj = await this.ensureProject(projectId);
    const members = await this.prisma.projectMember.findMany({ where: { projectId: pj.id } });
    return { members };
  }

  async invite(projectId: string, users: AddMemberInput[]) {
    const pj = await this.ensureProject(projectId);
    let invited = 0;
    for (const u of users) {
      if (!u.gitlabUserId && !u.email && !u.username) continue;
      // 以 gitlabUserId 优先；无则占位（以 email/username 填充可读信息）
      const gitlabUserId = (u.gitlabUserId && String(u.gitlabUserId)) || `pending:${u.email || u.username}`;
      await this.prisma.projectMember.upsert({
        where: { projectId_gitlabUserId: { projectId: pj.id, gitlabUserId } },
        update: {
          username: u.username || null,
          email: u.email || null,
          accessLevel: u.accessLevel ?? null,
          state: 'invited',
        },
        create: {
          projectId: pj.id,
          gitlabUserId,
          username: u.username || null,
          email: u.email || null,
          accessLevel: u.accessLevel ?? null,
          state: 'invited',
        },
      });
      invited++;
    }
    return { invited };
  }

  async add(projectId: string, users: AddMemberInput[]) {
    const pj = await this.ensureProject(projectId);
    let added = 0;
    for (const u of users) {
      if (!u.gitlabUserId) continue;
      await this.prisma.projectMember.upsert({
        where: { projectId_gitlabUserId: { projectId: pj.id, gitlabUserId: String(u.gitlabUserId) } },
        update: {
          username: u.username || null,
          email: u.email || null,
          accessLevel: u.accessLevel ?? null,
          state: 'active',
        },
        create: {
          projectId: pj.id,
          gitlabUserId: String(u.gitlabUserId),
          username: u.username || null,
          email: u.email || null,
          accessLevel: u.accessLevel ?? null,
          state: 'active',
        },
      });
      added++;
    }
    return { added };
  }

  async updateRole(projectId: string, gitlabUserId: string, accessLevel: number) {
    const pj = await this.ensureProject(projectId);
    const updated = await this.prisma.projectMember.update({
      where: { projectId_gitlabUserId: { projectId: pj.id, gitlabUserId: String(gitlabUserId) } },
      data: { accessLevel },
    });
    return { member: updated };
  }

  async remove(projectId: string, gitlabUserId: string) {
    const pj = await this.ensureProject(projectId);
    await this.prisma.projectMember.delete({ where: { projectId_gitlabUserId: { projectId: pj.id, gitlabUserId: String(gitlabUserId) } } });
    return { ok: true };
  }

  async cancelInvite(projectId: string, tokenOrKey: string) {
    const pj = await this.ensureProject(projectId);
    // 简化：以 pending:key 作为占位成员记录，取消即删除
    const key = `pending:${tokenOrKey}`;
    await this.prisma.projectMember.deleteMany({ where: { projectId: pj.id, gitlabUserId: key, state: 'invited' } });
    return { ok: true };
  }

  private async ensureProject(id: string) {
    const pj = await this.prisma.project.findUnique({ where: { id } });
    if (!pj) throw new NotFoundException('project not found');
    return pj;
  }
}
