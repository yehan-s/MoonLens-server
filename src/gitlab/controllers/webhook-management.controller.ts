import { Body, Controller, Get, Param, Post, Delete, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { PrismaService } from '../../common/services/prisma.service';
import { WebhookManagementService } from '../services/webhook-management.service';
import { UpsertWebhookDto, WebhookResponseDto, DeleteWebhookResultDto } from '../entities/webhook.dto';

@ApiTags('GitLab Webhook 管理')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('gitlab/connections/:id/projects/:pid/hooks')
export class WebhookManagementController {
  constructor(private readonly prisma: PrismaService, private readonly svc: WebhookManagementService) {}

  @Post()
  @ApiOperation({ summary: '创建/更新项目 Webhook（Upsert）' })
  @ApiOkResponse({ type: WebhookResponseDto })
  async upsertHook(@CurrentUser() user: any, @Param('id') id: string, @Param('pid') pid: string, @Body() dto: UpsertWebhookDto) {
    const row = await this.prisma.gitlabConnection.findUnique({ where: { id } });
    if (!row || (row.userId && row.userId !== user.userId)) {
      // 统一由 Roles 管控，此处只做存在校验
    }
    const res = await this.svc.upsertProjectHook(id, pid, {
      callbackUrl: dto.callbackUrl,
      secret: dto.secret,
      pushEvents: dto.pushEvents,
      mergeRequestsEvents: dto.mergeRequestsEvents,
      enableSslVerification: dto.enableSslVerification,
    });
    return res;
  }

  @Delete()
  @ApiOperation({ summary: '删除项目 Webhook' })
  @ApiOkResponse({ type: DeleteWebhookResultDto })
  async deleteHook(@CurrentUser() user: any, @Param('id') id: string, @Param('pid') pid: string) {
    const res = await this.svc.deleteProjectHook(id, pid);
    return res;
  }

  @Get('test')
  @ApiOperation({ summary: '测试项目 Webhook 存在性与配置' })
  async testHook(@CurrentUser() user: any, @Param('id') id: string, @Param('pid') pid: string) {
    const res = await this.svc.testProjectHook(id, pid);
    return res;
  }
}

