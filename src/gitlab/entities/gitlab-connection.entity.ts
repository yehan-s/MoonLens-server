import { ApiHideProperty, ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUrl, MaxLength, Min } from 'class-validator';
import { encryptSecret, decryptSecret } from '../../common/utils/crypto.util';

export enum GitlabAuthType {
  PAT = 'PAT',
  OAUTH = 'OAUTH',
}

export class CreateGitlabConnectionDto {
  @ApiProperty({ description: '连接名称', example: 'Personal GitLab' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({ description: 'GitLab 基础地址', example: 'https://gitlab.com' })
  @IsUrl()
  host: string;

  @ApiProperty({ description: '认证类型', enum: GitlabAuthType, example: GitlabAuthType.PAT })
  @IsEnum(GitlabAuthType)
  authType: GitlabAuthType;

  @ApiProperty({ description: '令牌明文（PAT 或 OAuth Access Token）', format: 'password' })
  @IsString()
  token: string;

  @ApiProperty({ description: '令牌过期时间（OAuth 可选）', required: false })
  @IsOptional()
  @IsDateString()
  tokenExpiresAt?: Date;
}

export class GitlabConnectionResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  host: string;

  @ApiProperty({ enum: GitlabAuthType })
  authType: GitlabAuthType;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty({ required: false })
  tokenExpiresAt?: Date;

  @ApiProperty()
  usageCount: number;

  @ApiProperty({ required: false })
  lastUsedAt?: Date;

  @ApiProperty({ required: false })
  lastTestedAt?: Date;

  @ApiProperty({ required: false })
  lastError?: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

// 辅助：加密/解密工具的包装，便于调用方使用
export const GitlabTokenCrypto = {
  encrypt: (plain: string) => encryptSecret(plain),
  decrypt: (packed: string) => decryptSecret(packed),
};

