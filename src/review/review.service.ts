import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface ReviewListQuery {
  projectId?: string;
  mrIid?: number;
  page?: number;
  pageSize?: number;
  level?: string; // issue/suggestion/note（此处先保留占位）
  category?: string; // 占位
}

@Injectable()
export class ReviewService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: ReviewListQuery) {
    const page = Math.max(1, Number(q.page || 1));
    const pageSize = Math.max(1, Math.min(50, Number(q.pageSize || 20)));
    const where: any = {};
    if (q.projectId) where.projectId = q.projectId;
    if (q.mrIid) where.mergeRequestIid = Number(q.mrIid);

    const [items, total] = await Promise.all([
      this.prisma.analysisResult.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          issues: {
            select: { id: true, severity: true, type: true },
          },
        },
      }),
      this.prisma.analysisResult.count({ where }),
    ]);

    const mapped = items.map((it) => ({
      id: it.id,
      projectId: it.projectId,
      mrIid: it.mergeRequestIid,
      createdAt: it.createdAt,
      summary: it.metrics as any, // 兼容：暂无单独 summary 字段
      counts: this.countBySeverity(it.issues as any[]),
      provider: undefined,
      model: undefined,
    }));

    return { items: mapped, page, pageSize, total };
  }

  async get(id: string) {
    const res = await this.prisma.analysisResult.findUnique({
      where: { id },
      include: { issues: true },
    });
    if (!res) return null;
    return {
      id: res.id,
      projectId: res.projectId,
      mrIid: res.mergeRequestIid,
      createdAt: res.createdAt,
      issues: res.issues,
      metrics: res.metrics,
    };
  }

  private countBySeverity(issues: Array<{ severity?: string }>) {
    const init = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 } as any;
    for (const i of issues || []) {
      const s = (i.severity || '').toString().toUpperCase();
      if (s in init) init[s]++;
    }
    return init;
  }
}
