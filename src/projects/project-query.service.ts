import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/services/prisma.service';

export interface ProjectQueryOptions {
  page?: number;
  limit?: number;
  search?: string;
  status?: 'active' | 'archived';
  ownerId?: string;
}

/**
 * 项目查询优化服务
 * - 提供统一的分页/过滤/搜索能力
 * - 预留索引与统计优化点
 */
@Injectable()
export class ProjectQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async listProjects(opts: ProjectQueryOptions) {
    const page = Math.max(1, Number(opts.page || 1));
    const limit = Math.max(1, Math.min(100, Number(opts.limit || 20)));

    const where: any = {};
    if (opts.search) {
      where.OR = [
        { name: { contains: opts.search } },
        { description: { contains: opts.search } },
        { gitlabProjectId: { contains: opts.search } },
      ];
    }
    if (opts.status) {
      where.isActive = opts.status === 'active';
    }
    if (opts.ownerId) {
      where.ownerId = opts.ownerId;
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.project.count({ where }),
      this.prisma.project.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      projects: rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }
}
