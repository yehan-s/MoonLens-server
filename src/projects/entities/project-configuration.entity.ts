import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsArray, IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';

/**
 * 项目配置实体（与 Project.reviewConfig 对应的结构）
 */
export class ProjectConfigurationEntity {
  @ApiProperty({ description: '同步配置' })
  @IsObject()
  @Expose()
  sync!: {
    enabled: boolean;
    members: boolean;
    branches: boolean;
  };

  @ApiProperty({ description: '审查配置' })
  @IsObject()
  @Expose()
  review!: {
    auto: boolean;
    aiModel: string;
    rules: any[];
  };

  @ApiPropertyOptional({ description: '关联关系（如 GitLab 连接ID）' })
  @IsObject()
  @Expose()
  association?: { connectionId: string | null };

  @ApiPropertyOptional({ description: '历史记录' })
  @IsOptional()
  @IsArray()
  @Expose()
  _history?: Array<{ at: string; by: string | null; action: string; before?: any; after?: any }>;

  constructor(partial: Partial<ProjectConfigurationEntity>) {
    Object.assign(this, partial);
  }
}

