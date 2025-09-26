import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class UpdateProjectDto {
  @ApiProperty({ description: '项目名称', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiProperty({ description: '项目描述', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: '默认分支', required: false })
  @IsOptional()
  @IsString()
  defaultBranch?: string;

  @ApiProperty({ description: '是否激活', required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ description: 'GitLab 项目 URL', required: false })
  @IsOptional()
  @IsUrl()
  gitlabProjectUrl?: string;
}

