import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { createHash } from 'crypto';

/**
 * 文件审查缓存服务
 *
 * 职责：
 * 1. 按文件hash缓存AI审查结果
 * 2. 减少重复调用AI API
 * 3. 提升审查响应速度
 */

export interface FileCacheEntry {
  fileHash: string;
  filePath: string;
  projectId: string;
  rulesHash: string;
  reviewData: any;
  provider: string;
  model: string;
  createdAt: Date;
  expiresAt: Date;
  hitCount: number;
}

export interface CacheHitInfo {
  cached: boolean;
  age?: number;  // 缓存年龄（毫秒）
  hitCount?: number;
  source?: 'cache' | 'fresh';
}

@Injectable()
export class FileCacheService {
  private readonly logger = new Logger(FileCacheService.name);
  private readonly DEFAULT_TTL = 24 * 60 * 60 * 1000; // 24小时

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 查询缓存
   * @param fileHash 文件hash（Git blob SHA）
   * @param filePath 文件路径
   * @param projectId 项目ID
   * @param rules 审查规则
   * @returns 缓存的审查结果，如果未命中则返回null
   */
  async getCachedReview(
    fileHash: string,
    filePath: string,
    projectId: string,
    rules?: string[],
  ): Promise<FileCacheEntry | null> {
    try {
      const rulesHash = this.hashRules(rules);

      const cached = await this.prisma.fileReviewCache.findUnique({
        where: {
          fileHash_rulesHash_projectId: {
            fileHash,
            rulesHash,
            projectId,
          },
        },
      });

      if (!cached) {
        this.logger.debug(`缓存未命中: ${filePath} [${fileHash.substring(0, 8)}]`);
        return null;
      }

      // 检查是否过期
      if (this.isExpired(cached.expiresAt)) {
        this.logger.debug(`缓存已过期: ${filePath} [${fileHash.substring(0, 8)}]`);
        // 异步删除过期缓存
        this.deleteExpiredCache(cached.id).catch(err =>
          this.logger.error(`删除过期缓存失败: ${err.message}`)
        );
        return null;
      }

      this.logger.log(`✅ 缓存命中: ${filePath} [${fileHash.substring(0, 8)}] (${cached.hitCount}次)`);

      // 异步更新命中统计
      this.updateCacheHit(cached.id).catch(err =>
        this.logger.error(`更新缓存统计失败: ${err.message}`)
      );

      return {
        fileHash: cached.fileHash,
        filePath: cached.filePath,
        projectId: cached.projectId,
        rulesHash: cached.rulesHash,
        reviewData: cached.reviewData,
        provider: cached.provider,
        model: cached.model,
        createdAt: cached.createdAt,
        expiresAt: cached.expiresAt,
        hitCount: cached.hitCount,
      };
    } catch (error) {
      this.logger.error(`查询缓存失败: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * 保存审查结果到缓存
   * @param fileHash 文件hash
   * @param filePath 文件路径
   * @param projectId 项目ID
   * @param reviewData 审查结果
   * @param provider AI提供商
   * @param model AI模型
   * @param rules 审查规则
   * @param ttl 缓存有效期（毫秒）
   */
  async saveCacheEntry(
    fileHash: string,
    filePath: string,
    projectId: string,
    reviewData: any,
    provider: string,
    model: string,
    rules?: string[],
    ttl: number = this.DEFAULT_TTL,
  ): Promise<void> {
    try {
      const rulesHash = this.hashRules(rules);
      const expiresAt = new Date(Date.now() + ttl);

      await this.prisma.fileReviewCache.upsert({
        where: {
          fileHash_rulesHash_projectId: {
            fileHash,
            rulesHash,
            projectId,
          },
        },
        create: {
          fileHash,
          filePath,
          projectId,
          rulesHash,
          reviewData,
          provider,
          model,
          expiresAt,
          hitCount: 0,
        },
        update: {
          filePath,  // 更新路径（可能重命名）
          reviewData,
          provider,
          model,
          expiresAt,
          hitCount: 0, // 重置命中次数
        },
      });

      this.logger.log(`💾 已缓存: ${filePath} [${fileHash.substring(0, 8)}]`);
    } catch (error) {
      this.logger.error(`保存缓存失败: ${error.message}`, error.stack);
      // 缓存保存失败不影响主流程
    }
  }

  /**
   * 批量获取缓存
   * @param files 文件列表 { fileHash, filePath, projectId }
   * @param rules 审查规则
   * @returns Map<filePath, CachedEntry>
   */
  async batchGetCached(
    files: Array<{ fileHash: string; filePath: string; projectId: string }>,
    rules?: string[],
  ): Promise<Map<string, FileCacheEntry>> {
    const rulesHash = this.hashRules(rules);
    const result = new Map<string, FileCacheEntry>();

    try {
      const cachedEntries = await this.prisma.fileReviewCache.findMany({
        where: {
          AND: [
            {
              OR: files.map(f => ({
                fileHash: f.fileHash,
                filePath: f.filePath,
                projectId: f.projectId,
              })),
            },
            { rulesHash },
            { expiresAt: { gt: new Date() } }, // 排除过期
          ],
        },
      });

      for (const entry of cachedEntries) {
        result.set(entry.filePath, {
          fileHash: entry.fileHash,
          filePath: entry.filePath,
          projectId: entry.projectId,
          rulesHash: entry.rulesHash,
          reviewData: entry.reviewData,
          provider: entry.provider,
          model: entry.model,
          createdAt: entry.createdAt,
          expiresAt: entry.expiresAt,
          hitCount: entry.hitCount,
        });
      }

      this.logger.log(`批量查询缓存: ${files.length}个文件, 命中${result.size}个`);
    } catch (error) {
      this.logger.error(`批量查询缓存失败: ${error.message}`);
    }

    return result;
  }

  /**
   * 清理过期缓存
   */
  async cleanupExpiredCache(): Promise<number> {
    try {
      const result = await this.prisma.fileReviewCache.deleteMany({
        where: {
          expiresAt: { lt: new Date() },
        },
      });

      this.logger.log(`清理过期缓存: ${result.count}条`);
      return result.count;
    } catch (error) {
      this.logger.error(`清理过期缓存失败: ${error.message}`);
      return 0;
    }
  }

  /**
   * 清理项目的所有缓存
   */
  async clearProjectCache(projectId: string): Promise<number> {
    try {
      const result = await this.prisma.fileReviewCache.deleteMany({
        where: { projectId },
      });

      this.logger.log(`清理项目缓存: ${projectId}, ${result.count}条`);
      return result.count;
    } catch (error) {
      this.logger.error(`清理项目缓存失败: ${error.message}`);
      return 0;
    }
  }

  /**
   * 获取缓存统计信息
   */
  async getCacheStats(projectId?: string): Promise<{
    totalEntries: number;
    totalHits: number;
    avgHitCount: number;
    expiredEntries: number;
  }> {
    try {
      const where = projectId ? { projectId } : {};

      const [total, expired, stats] = await Promise.all([
        this.prisma.fileReviewCache.count({ where }),
        this.prisma.fileReviewCache.count({
          where: { ...where, expiresAt: { lt: new Date() } },
        }),
        this.prisma.fileReviewCache.aggregate({
          where,
          _sum: { hitCount: true },
          _avg: { hitCount: true },
        }),
      ]);

      return {
        totalEntries: total,
        totalHits: stats._sum.hitCount || 0,
        avgHitCount: stats._avg.hitCount || 0,
        expiredEntries: expired,
      };
    } catch (error) {
      this.logger.error(`获取缓存统计失败: ${error.message}`);
      return {
        totalEntries: 0,
        totalHits: 0,
        avgHitCount: 0,
        expiredEntries: 0,
      };
    }
  }

  /**
   * 计算文件内容hash（如果Git没有提供blob SHA）
   */
  calculateFileHash(content: string): string {
    return createHash('sha256')
      .update(content)
      .digest('hex');
  }

  /**
   * 计算规则hash
   */
  private hashRules(rules?: string[]): string {
    if (!rules || rules.length === 0) {
      return 'default';
    }

    const sortedRules = [...rules].sort().join(',');
    return createHash('md5')
      .update(sortedRules)
      .digest('hex');
  }

  /**
   * 检查缓存是否过期
   */
  private isExpired(expiresAt: Date): boolean {
    return new Date() > expiresAt;
  }

  /**
   * 更新缓存命中统计
   */
  private async updateCacheHit(cacheId: string): Promise<void> {
    try {
      await this.prisma.fileReviewCache.update({
        where: { id: cacheId },
        data: {
          hitCount: { increment: 1 },
          lastHitAt: new Date(),
        },
      });
    } catch (error) {
      // 忽略错误，不影响主流程
      this.logger.debug(`更新命中统计失败: ${error.message}`);
    }
  }

  /**
   * 删除过期缓存
   */
  private async deleteExpiredCache(cacheId: string): Promise<void> {
    try {
      await this.prisma.fileReviewCache.delete({
        where: { id: cacheId },
      });
    } catch (error) {
      // 忽略错误
      this.logger.debug(`删除过期缓存失败: ${error.message}`);
    }
  }
}
