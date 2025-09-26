import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

/**
 * 项目统计实体（用于API输出结构）。存储聚合与趋势数据。
 */
export class ProjectStatisticsEntity {
  @ApiProperty({ description: '概览指标' })
  @Expose()
  overview!: {
    totalReviews: number;
    successfulReviews: number;
    failedReviews: number;
    successRate: number;
    avgQualityScore?: number;
    issuesFound?: number;
    issuesResolved?: number;
  };

  @ApiProperty({ description: '趋势数据（按时间）' })
  @Expose()
  trends!: Array<{ date: string; reviews: number; success: number; failed: number; avgScore?: number }>;

  @ApiProperty({ description: '成员贡献' })
  @Expose()
  memberContributions!: Array<{ userId: string; username?: string; reviews: number; comments?: number }>;

  constructor(partial: Partial<ProjectStatisticsEntity>) {
    Object.assign(this, partial);
  }
}

