import { Injectable, Logger, NotFoundException, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { Cache as CacheManager } from 'cache-manager';

interface CreateAnalysisResultDto {
  projectId: string;
  mergeRequestId?: number;
  mergeRequestIid?: number;
  sourceBranch?: string;
  targetBranch?: string;
  commitHash?: string;
  filesAnalyzed: number;
  issuesFound: number;
  metrics: any;
  processingTime?: number;
  workerVersion?: string;
  taskId?: string;
  reviewId?: string;
}

interface CreateIssueDto {
  resultId: string;
  filePath: string;
  lineNumber?: number;
  columnNumber?: number;
  endLine?: number;
  endColumn?: number;
  severity: string;
  type: string;
  rule?: string;
  message: string;
  codeSnippet?: string;
  suggestion: string;
  fixExample?: string;
  confidence?: number;
  isAutoFixable?: boolean;
  tags?: any;
}

interface AnalysisResultFilter {
  projectId?: string;
  mergeRequestIid?: number;
  status?: string;
  fromDate?: Date;
  toDate?: Date;
}

interface PaginationOptions {
  page?: number;
  limit?: number;
  orderBy?: string;
  order?: 'asc' | 'desc';
}

@Injectable()
export class AnalysisResultService {
  private readonly logger = new Logger(AnalysisResultService.name);
  private readonly cacheTTL = 3600; // 1小时缓存

  constructor(
    private prisma: PrismaService,
    @Inject('CACHE_MANAGER') private cacheManager: any,
  ) {}

  /**
   * 创建分析结果
   */
  async createAnalysisResult(data: CreateAnalysisResultDto): Promise<any> {
    try {
      // 确保不存储源代码
      const sanitizedMetrics = this.sanitizeMetrics(data.metrics);

      const result = await this.prisma.analysisResult.create({
        data: {
          ...data,
          metrics: sanitizedMetrics,
          completedAt: new Date(),
        },
      });

      // 清除相关缓存
      await this.invalidateCache(`project:${data.projectId}`);

      // 更新质量趋势
      await this.updateQualityTrend(data.projectId, result);

      this.logger.log(`Created analysis result ${result.id} for project ${data.projectId}`);
      return result;
    } catch (error) {
      this.logger.error('Failed to create analysis result:', error);
      throw error;
    }
  }

  /**
   * 批量创建问题记录
   */
  async createIssues(issues: CreateIssueDto[]): Promise<any[]> {
    try {
      // 过滤和净化代码片段
      const sanitizedIssues = issues.map(issue => ({
        ...issue,
        codeSnippet: this.sanitizeCodeSnippet(issue.codeSnippet),
      }));

      const createdIssues = await this.prisma.issue.createMany({
        data: sanitizedIssues as any,
      });

      this.logger.log(`Created ${createdIssues.count} issues`);
      return this.prisma.issue.findMany({
        where: {
          resultId: sanitizedIssues[0]?.resultId,
        },
      });
    } catch (error) {
      this.logger.error('Failed to create issues:', error);
      throw error;
    }
  }

  /**
   * 获取分析结果
   */
  async getAnalysisResult(id: string): Promise<any> {
    const cacheKey = `result:${id}`;
    const cached = await this.cacheManager.get(cacheKey);
    
    if (cached) {
      return cached;
    }

    const result = await this.prisma.analysisResult.findUnique({
      where: { id },
      include: {
        issues: true,
        review: true,
      },
    });

    if (!result) {
      throw new NotFoundException(`Analysis result ${id} not found`);
    }

    await this.cacheManager.set(cacheKey, result, this.cacheTTL);
    return result;
  }

  /**
   * 查询分析结果列表
   */
  async queryAnalysisResults(
    filter: AnalysisResultFilter,
    pagination: PaginationOptions = {},
  ) {
    const {
      page = 1,
      limit = 20,
      orderBy = 'createdAt',
      order = 'desc',
    } = pagination;

    const where: Prisma.AnalysisResultWhereInput = {};
    
    if (filter.projectId) {
      where.projectId = filter.projectId;
    }
    
    if (filter.mergeRequestIid) {
      where.mergeRequestIid = filter.mergeRequestIid;
    }
    
    if (filter.fromDate || filter.toDate) {
      where.createdAt = {
        ...(filter.fromDate && { gte: filter.fromDate }),
        ...(filter.toDate && { lte: filter.toDate }),
      };
    }

    const [results, total] = await Promise.all([
      this.prisma.analysisResult.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [orderBy]: order },
        include: {
          issues: {
            select: {
              id: true,
              severity: true,
              type: true,
            },
          },
        },
      }),
      this.prisma.analysisResult.count({ where }),
    ]);

    return {
      data: results,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * 获取项目质量趋势
   */
  async getQualityTrends(
    projectId: string,
    period: 'day' | 'week' | 'month' = 'day',
    limit: number = 30,
  ) {
    const cacheKey = `trends:${projectId}:${period}:${limit}`;
    const cached = await this.cacheManager.get(cacheKey);
    
    if (cached) {
      return cached;
    }

    const trends = await this.prisma.qualityTrend.findMany({
      where: { projectId },
      orderBy: { date: 'desc' },
      take: limit,
    });

    // 如果按周或月聚合
    const aggregated = this.aggregateTrends(trends, period);
    
    await this.cacheManager.set(cacheKey, aggregated, this.cacheTTL);
    return aggregated;
  }

  /**
   * 计算项目质量分数
   */
  async calculateQualityScore(projectId: string): Promise<number> {
    const recentResults = await this.prisma.analysisResult.findMany({
      where: {
        projectId,
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 最近7天
        },
      },
      include: {
        issues: {
          select: {
            severity: true,
          },
        },
      },
    });

    if (recentResults.length === 0) {
      return 100; // 无数据时默认满分
    }

    // 计算平均问题数和严重度权重
    let totalScore = 0;
    for (const result of recentResults) {
      const issueScore = this.calculateIssueScore(result.issues);
      totalScore += issueScore;
    }

    return Math.round(totalScore / recentResults.length);
  }

  /**
   * 获取项目统计信息
   */
  async getProjectStatistics(projectId: string) {
    const cacheKey = `stats:${projectId}`;
    const cached = await this.cacheManager.get(cacheKey);
    
    if (cached) {
      return cached;
    }

    const [
      totalAnalyses,
      totalIssues,
      recentAnalyses,
      severityDistribution,
      typeDistribution,
    ] = await Promise.all([
      this.prisma.analysisResult.count({
        where: { projectId },
      }),
      this.prisma.issue.count({
        where: {
          result: { projectId },
        },
      }),
      this.prisma.analysisResult.findMany({
        where: {
          projectId,
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 最近30天
          },
        },
        select: {
          issuesFound: true,
          filesAnalyzed: true,
          processingTime: true,
        },
      }),
      this.getIssueSeverityDistribution(projectId),
      this.getIssueTypeDistribution(projectId),
    ]);

    const avgIssuesPerAnalysis = recentAnalyses.length > 0
      ? recentAnalyses.reduce((sum, r) => sum + r.issuesFound, 0) / recentAnalyses.length
      : 0;

    const avgProcessingTime = recentAnalyses.length > 0
      ? recentAnalyses.reduce((sum, r) => sum + (r.processingTime || 0), 0) / recentAnalyses.length
      : 0;

    const stats = {
      totalAnalyses,
      totalIssues,
      avgIssuesPerAnalysis: Math.round(avgIssuesPerAnalysis * 10) / 10,
      avgProcessingTime: Math.round(avgProcessingTime),
      qualityScore: await this.calculateQualityScore(projectId),
      severityDistribution,
      typeDistribution,
      lastAnalysisAt: recentAnalyses[0]?.issuesFound ? new Date() : null,
    };

    await this.cacheManager.set(cacheKey, stats, this.cacheTTL);
    return stats;
  }

  /**
   * 删除旧的分析结果
   */
  async cleanupOldResults(daysToKeep: number = 90): Promise<number> {
    const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
    
    const deleted = await this.prisma.analysisResult.deleteMany({
      where: {
        createdAt: {
          lt: cutoffDate,
        },
      },
    });

    this.logger.log(`Cleaned up ${deleted.count} old analysis results`);
    return deleted.count;
  }

  /**
   * 净化指标数据（确保不含源代码）
   */
  private sanitizeMetrics(metrics: any): any {
    if (!metrics) return {};

    // 移除可能包含源代码的字段
    const sanitized = { ...metrics };
    const prohibitedKeys = ['code', 'source', 'content', 'snippet', 'raw'];
    
    for (const key of prohibitedKeys) {
      delete sanitized[key];
    }

    // 递归清理嵌套对象
    for (const key in sanitized) {
      if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
        sanitized[key] = this.sanitizeMetrics(sanitized[key]);
      }
    }

    return sanitized;
  }

  /**
   * 净化代码片段
   */
  private sanitizeCodeSnippet(snippet?: string): string | undefined {
    if (!snippet) return undefined;

    // 限制长度
    let sanitized = snippet.substring(0, 500);

    // 过滤敏感信息
    const sensitivePatterns = [
      /password\s*=\s*["'][^"']+["']/gi,
      /api[_-]?key\s*=\s*["'][^"']+["']/gi,
      /secret\s*=\s*["'][^"']+["']/gi,
      /token\s*=\s*["'][^"']+["']/gi,
      /[a-z0-9]{32,}/gi, // 长字符串（可能是密钥）
    ];

    for (const pattern of sensitivePatterns) {
      sanitized = sanitized.replace(pattern, '[REDACTED]');
    }

    return sanitized;
  }

  /**
   * 更新质量趋势
   */
  private async updateQualityTrend(projectId: string, result: any) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 获取今天的所有分析
    const todayResults = await this.prisma.analysisResult.findMany({
      where: {
        projectId,
        createdAt: {
          gte: today,
          lt: new Date(today.getTime() + 24 * 60 * 60 * 1000),
        },
      },
      include: {
        issues: {
          select: {
            severity: true,
          },
        },
      },
    });

    // 计算今日统计
    const stats = this.calculateDailyStats(todayResults);

    await this.prisma.qualityTrend.upsert({
      where: {
        projectId_date: {
          projectId,
          date: today,
        },
      },
      update: stats,
      create: {
        projectId,
        date: today,
        week: this.getWeekNumber(today),
        month: today.getMonth() + 1,
        year: today.getFullYear(),
        ...stats,
      },
    });
  }

  /**
   * 计算每日统计
   */
  private calculateDailyStats(results: any[]): any {
    if (results.length === 0) {
      return {
        totalAnalyses: 0,
        avgIssues: 0,
        avgCritical: 0,
        avgHigh: 0,
        avgMedium: 0,
        avgLow: 0,
        qualityScore: 100,
      };
    }

    const severityCounts = {
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
      INFO: 0,
    };

    let totalIssues = 0;
    for (const result of results) {
      totalIssues += result.issues.length;
      for (const issue of result.issues) {
        severityCounts[issue.severity]++;
      }
    }

    const avgIssues = totalIssues / results.length;
    const qualityScore = Math.max(
      0,
      100 - (
        severityCounts.CRITICAL * 20 +
        severityCounts.HIGH * 10 +
        severityCounts.MEDIUM * 5 +
        severityCounts.LOW * 2
      ) / results.length
    );

    return {
      totalAnalyses: results.length,
      avgIssues: Math.round(avgIssues * 10) / 10,
      avgCritical: Math.round((severityCounts.CRITICAL / results.length) * 10) / 10,
      avgHigh: Math.round((severityCounts.HIGH / results.length) * 10) / 10,
      avgMedium: Math.round((severityCounts.MEDIUM / results.length) * 10) / 10,
      avgLow: Math.round((severityCounts.LOW / results.length) * 10) / 10,
      qualityScore: Math.round(qualityScore),
    };
  }

  /**
   * 计算问题分数
   */
  private calculateIssueScore(issues: any[]): number {
    const weights = {
      CRITICAL: 20,
      HIGH: 10,
      MEDIUM: 5,
      LOW: 2,
      INFO: 1,
    };

    let totalWeight = 0;
    for (const issue of issues) {
      totalWeight += weights[issue.severity as keyof typeof weights] || 0;
    }

    return Math.max(0, 100 - totalWeight);
  }

  /**
   * 聚合趋势数据
   */
  private aggregateTrends(trends: any[], period: string): any[] {
    if (period === 'day') {
      return trends;
    }

    // TODO: 实现周和月的聚合逻辑
    return trends;
  }

  /**
   * 获取问题严重度分布
   */
  private async getIssueSeverityDistribution(projectId: string) {
    const result = await this.prisma.issue.groupBy({
      by: ['severity'],
      where: {
        result: { projectId },
      },
      _count: true,
    });

    return result.reduce((acc, item) => {
      acc[item.severity] = item._count;
      return acc;
    }, {} as Record<string, number>);
  }

  /**
   * 获取问题类型分布
   */
  private async getIssueTypeDistribution(projectId: string) {
    const result = await this.prisma.issue.groupBy({
      by: ['type'],
      where: {
        result: { projectId },
      },
      _count: true,
    });

    return result.reduce((acc, item) => {
      acc[item.type] = item._count;
      return acc;
    }, {} as Record<string, number>);
  }

  /**
   * 获取周数
   */
  private getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  }

  /**
   * 清除缓存
   */
  private async invalidateCache(pattern: string) {
    // 临时清除所有缓存，未来可实现基于模式的缓存清除
    // await this.cacheManager.reset();
  }
}