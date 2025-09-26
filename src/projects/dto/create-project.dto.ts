import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class CreateProjectDto {
  @ApiProperty({ description: '项目名称' })
  @IsString()
  @MaxLength(255)
  name!: string;

  @ApiProperty({ description: '项目描述', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'GitLab 项目 ID（字符串）' })
  @IsString()
  gitlabProjectId!: string;

  @ApiProperty({ description: 'GitLab 项目 URL' })
  @IsUrl()
  gitlabProjectUrl!: string;

  @ApiProperty({ description: '默认分支', required: false, default: 'main' })
  @IsOptional()
  @IsString()
  defaultBranch?: string;

  @ApiProperty({ description: '是否激活', required: false, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

