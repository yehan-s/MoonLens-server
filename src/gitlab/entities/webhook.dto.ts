import { ApiProperty } from '@nestjs/swagger';

export class UpsertWebhookDto {
  @ApiProperty({ description: 'GitLab 项目 ID（数字或字符串）' })
  projectGitlabId!: string;

  @ApiProperty({ description: '回调 URL（默认 /api/webhooks/gitlab）', required: false })
  callbackUrl?: string;

  @ApiProperty({ description: 'Webhook 密钥（不传则自动生成）', required: false })
  secret?: string;

  @ApiProperty({ description: '是否启用推送事件', default: true, required: false })
  pushEvents?: boolean;

  @ApiProperty({ description: '是否启用合并请求事件', default: true, required: false })
  mergeRequestsEvents?: boolean;

  @ApiProperty({ description: '是否启用 SSL 校验', default: true, required: false })
  enableSslVerification?: boolean;
}

export class WebhookResponseDto {
  @ApiProperty({ description: 'GitLab 返回的 Hook ID' })
  hookId!: string;

  @ApiProperty({ description: '回调 URL' })
  url!: string;

  @ApiProperty({ description: '是否启用推送事件' })
  pushEvents!: boolean;

  @ApiProperty({ description: '是否启用 MR 事件' })
  mergeRequestsEvents!: boolean;
}

export class DeleteWebhookResultDto {
  @ApiProperty({ description: '是否成功' })
  ok!: boolean;
}

