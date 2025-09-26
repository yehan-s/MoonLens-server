import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../common/services/prisma.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { ReviewStatus } from '@prisma/client';

export interface DateRange { from: Date; to: Date }

@Injectable()
export class ProjectStatisticsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  async getProjectStatistics(projectId: string, range: DateRange) {
    const cacheKey = `stats:${projectId}:${range.from.toISOString()}:${range.to.toISOString()}`;
    const cached = await this.cache.get<any>(cacheKey);
    if (cached) return cached;

    const [totalReviews, successfulReviews, failedReviews, scores] = await Promise.all([
      this.prisma.review.count({ where: { projectId, createdAt: { gte: range.from, lte: range.to } } }),
      this.prisma.review.count({ where: { projectId, status: ReviewStatus.COMPLETED, createdAt: { gte: range.from, lte: range.to } } }),
      this.prisma.review.count({ where: { projectId, status: ReviewStatus.FAILED, createdAt: { gte: range.from, lte: range.to } } }),
      // 质量分数目前为示意；如无字段，可基于 summary 估算
      Promise.resolve<number[]>([]),
    ]);
    const avgQualityScore = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length) : undefined;

    // 简单趋势：按日统计数量
    const trends: Array<{ date: string; reviews: number; success: number; failed: number; avgScore?: number }> = [];
    const dayMs = 24 * 3600 * 1000;
    for (let t = range.from.getTime(); t <= range.to.getTime(); t += dayMs) {
      const dayStart = new Date(new Date(t).toDateString());
      const dayEnd = new Date(dayStart.getTime() + dayMs - 1);
      // 出于性能考虑，此处不逐日查询数据库；实际可改为单次 group by 查询
      // 先填充 0，前端或后续可用更优实现
      trends.push({ date: dayStart.toISOString().slice(0, 10), reviews: 0, success: 0, failed: 0, avgScore: undefined });
    }

    const result = {
      overview: {
        totalReviews,
        successfulReviews,
        failedReviews,
        successRate: totalReviews > 0 ? successfulReviews / totalReviews : 0,
        avgQualityScore,
      },
      trends,
      memberContributions: [],
    };
    await this.cache.set(cacheKey, result, 900_000);
    return result;
  }
}
