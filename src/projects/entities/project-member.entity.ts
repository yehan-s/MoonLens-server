import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString } from 'class-validator';

/**
 * 项目成员实体（API Schema/序列化）
 * 角色以 GitLab accessLevel 数值表示；如需项目内RBAC，可在服务层做映射
 */
export class ProjectMemberEntity {
  @ApiProperty({ description: '成员记录ID' })
  @IsString()
  @Expose()
  id!: string;

  @ApiProperty({ description: '项目ID' })
  @IsString()
  @Expose()
  projectId!: string;

  @ApiProperty({ description: 'GitLab 用户ID（字符串）' })
  @IsString()
  @Expose()
  gitlabUserId!: string;

  @ApiPropertyOptional({ description: 'GitLab 用户名' })
  @IsOptional()
  @IsString()
  @Expose()
  username?: string | null;

  @ApiPropertyOptional({ description: '成员姓名' })
  @IsOptional()
  @IsString()
  @Expose()
  name?: string | null;

  @ApiPropertyOptional({ description: '邮箱' })
  @IsOptional()
  @IsString()
  @Expose()
  email?: string | null;

  @ApiPropertyOptional({ description: '访问级别（GitLab access_level）' })
  @IsOptional()
  @IsInt()
  @Expose()
  accessLevel?: number | null;

  @ApiPropertyOptional({ description: '成员状态（GitLab state）' })
  @IsOptional()
  @IsString()
  @Expose()
  state?: string | null;

  @ApiPropertyOptional({ description: '头像URL' })
  @IsOptional()
  @IsString()
  @Expose()
  avatarUrl?: string | null;

  @ApiPropertyOptional({ description: 'GitLab 个人页URL' })
  @IsOptional()
  @IsString()
  @Expose()
  webUrl?: string | null;

  @ApiProperty({ description: '创建时间' })
  @IsDateString()
  @Expose()
  createdAt!: Date;

  @ApiProperty({ description: '更新时间' })
  @IsDateString()
  @Expose()
  updatedAt!: Date;

  constructor(partial: Partial<ProjectMemberEntity>) {
    Object.assign(this, partial);
  }
}

