import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsBoolean, IsDateString, IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

/**
 * 项目实体（用于API Schema/序列化，不直接映射数据库）
 * 说明：数据库模型由 Prisma 管理，此处用于 Swagger 文档与输出结构约束
 */
export class ProjectEntity {
  @ApiProperty({ description: '项目ID' })
  @IsString()
  @Expose()
  id!: string;

  @ApiProperty({ description: '项目名称' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  @Expose()
  name!: string;

  @ApiPropertyOptional({ description: '项目描述' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Expose()
  description?: string | null;

  @ApiProperty({ description: 'GitLab 项目ID（字符串）' })
  @IsString()
  @Expose()
  gitlabProjectId!: string;

  @ApiProperty({ description: 'GitLab 项目URL' })
  @IsUrl()
  @Expose()
  gitlabProjectUrl!: string;

  @ApiPropertyOptional({ description: '默认分支' })
  @IsOptional()
  @IsString()
  @Expose()
  defaultBranch?: string | null;

  @ApiProperty({ description: '是否激活', default: true })
  @IsBoolean()
  @Expose()
  isActive!: boolean;

  @ApiPropertyOptional({ description: '项目审查/集成配置（JSON）' })
  @IsOptional()
  @Expose()
  reviewConfig?: Record<string, any> | null;

  @ApiPropertyOptional({ description: 'Webhook ID' })
  @IsOptional()
  @IsString()
  @Expose()
  webhookId?: string | null;

  @ApiPropertyOptional({ description: 'Webhook Secret' })
  @IsOptional()
  @IsString()
  @Expose()
  webhookSecret?: string | null;

  @ApiProperty({ description: '创建时间' })
  @IsDateString()
  @Expose()
  createdAt!: Date;

  @ApiProperty({ description: '更新时间' })
  @IsDateString()
  @Expose()
  updatedAt!: Date;

  constructor(partial: Partial<ProjectEntity>) {
    Object.assign(this, partial);
  }
}

