import { ApiProperty } from '@nestjs/swagger';

export class ComplianceReportDto {
  @ApiProperty({ description: '连接ID' })
  connectionId!: string;

  @ApiProperty({ description: 'GitLab 基础地址', required: false })
  host?: string;

  @ApiProperty({ description: '认证类型（PAT/OAUTH）', required: false })
  authType?: string;

  @ApiProperty({ description: '访问令牌过期时间', required: false, type: String })
  tokenExpiresAt?: string;

  @ApiProperty({ description: '上次刷新时间', required: false, type: String })
  lastRefreshAt?: string;

  @ApiProperty({ description: '合规是否通过' })
  ok!: boolean;

  @ApiProperty({ description: '发现的问题列表', type: [String] })
  issues!: string[];

  @ApiProperty({ description: '报告生成时间（ISO 字符串）' })
  generatedAt!: string;
}

export class ComplianceCheckDto {
  @ApiProperty({ description: '合规是否通过' })
  ok!: boolean;

  @ApiProperty({ description: '发现的问题列表', type: [String] })
  issues!: string[];
}

export class RecoveryConnectionResultDto {
  @ApiProperty({ description: '是否成功' })
  ok!: boolean;

  @ApiProperty({ description: '检查的远端项目数' })
  checked!: number;

  @ApiProperty({ description: '执行修复的数量（项）' })
  repaired!: number;
}

export class RecoveryProjectResultDto {
  @ApiProperty({ description: '是否成功' })
  ok!: boolean;

  @ApiProperty({ description: '该项目修复的数量（项）' })
  repaired!: number;
}

