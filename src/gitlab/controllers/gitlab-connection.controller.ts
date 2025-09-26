import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { PrismaService } from '../../common/services/prisma.service';
import {
  CreateGitlabConnectionDto,
  GitlabAuthType,
  GitlabConnectionResponseDto,
  GitlabTokenCrypto,
} from '../entities/gitlab-connection.entity';
import { GitlabApiClientService } from '../services/gitlab-api-client.service';
import { ProjectSyncService } from '../services/project-sync.service';
import { GitlabTokenLifecycleService } from '../services/token-lifecycle.service';
import { SyncRecoveryService } from '../services/sync-recovery.service';
import { ComplianceCheckDto, ComplianceReportDto, RecoveryConnectionResultDto, RecoveryProjectResultDto } from '../entities/compliance.dto';
import { SecurityAuditService } from '../services/security-audit.service';

@ApiTags('GitLab 连接')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER, UserRole.ADMIN)
@Controller('gitlab/connections')
export class GitlabConnectionController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gitlabClient: GitlabApiClientService,
    private readonly projectSync: ProjectSyncService,
    private readonly tokenLife: GitlabTokenLifecycleService,
    private readonly audit: SecurityAuditService,
    private readonly recovery: SyncRecoveryService,
  ) {}

  /**
   * 创建连接
   */
  @Post()
  @ApiOperation({ summary: '创建 GitLab 连接（加密存储令牌）' })
  @ApiResponse({ status: 201, description: '创建成功' })
  async create(
    @CurrentUser() user: any,
    @Body() dto: CreateGitlabConnectionDto,
  ): Promise<GitlabConnectionResponseDto> {
    const tokenCipher = GitlabTokenCrypto.encrypt(dto.token);
    const created = await this.prisma.gitlabConnection.create({
      data: {
        userId: user.userId,
        name: dto.name,
        host: dto.host,
        authType: dto.authType as any, // Prisma enum 同名字符串
        tokenCipher,
        tokenExpiresAt: dto.tokenExpiresAt ?? null,
        isActive: true,
      },
    });
    try { this.audit.connectionCreated(user.userId, created.id, created.host, created.authType); } catch {}
    return this.toResponseDto(created);
  }

  /**
   * 列出当前用户的连接
   */
  @Get()
  @ApiOperation({ summary: '列出当前用户的 GitLab 连接' })
  async list(@CurrentUser() user: any): Promise<GitlabConnectionResponseDto[]> {
    const rows = await this.prisma.gitlabConnection.findMany({
      where: { userId: user.userId },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((r) => this.toResponseDto(r));
  }

  /**
   * 测试连接（调 GitLab API 获取当前用户）
   */
  @Get(':id/test')
  @ApiOperation({ summary: '测试连接有效性' })
  async test(@CurrentUser() user: any, @Param('id') id: string) {
    const row = await this.prisma.gitlabConnection.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('连接不存在');
    if (row.userId && row.userId !== user.userId) throw new ForbiddenException();

    const token = GitlabTokenCrypto.decrypt(row.tokenCipher);
    this.gitlabClient.configure({ host: row.host, token, authType: row.authType as any, refresher: async () => this.tokenLife.refreshOAuth(row.id, row.host) });
    let me: any;
    try {
      me = await this.gitlabClient.getCurrentUser();
      try { this.audit.connectionTested(user.userId, id, true); } catch {}
    } catch (e) {
      try { this.audit.connectionTested(user.userId, id, false, String(e)); } catch {}
      throw e;
    }

    await this.prisma.gitlabConnection.update({
      where: { id },
      data: {
        lastTestedAt: new Date(),
        lastUsedAt: new Date(),
        usageCount: { increment: 1 },
        lastError: null,
      },
    });

    return { ok: true, me };
  }

  /**
   * 同步项目（当前用户的该连接可见项目）
   */
  @Post(':id/sync-projects')
  @ApiOperation({ summary: '同步 GitLab 项目' })
  async syncProjects(@CurrentUser() user: any, @Param('id') id: string) {
    const row = await this.prisma.gitlabConnection.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('连接不存在');
    if (row.userId && row.userId !== user.userId) throw new ForbiddenException();
    const res = await this.projectSync.syncProjects(id);
    try { this.audit.projectSyncTriggered(user.userId, id, 'projects', res as any); } catch {}
    return { ok: true, ...res };
  }

  @Post(':id/projects/:pid/sync-members')
  @ApiOperation({ summary: '同步指定项目成员' })
  async syncMembers(@CurrentUser() user: any, @Param('id') id: string, @Param('pid') pid: string) {
    const row = await this.prisma.gitlabConnection.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('连接不存在');
    if (row.userId && row.userId !== user.userId) throw new ForbiddenException();
    const res = await this.projectSync.syncProjectMembers(id, pid);
    try { this.audit.projectSyncTriggered(user.userId, id, 'members', { projectGitlabId: pid, ...res } as any); } catch {}
    return { ok: true, ...res };
  }

  @Post(':id/projects/:pid/sync-branches')
  @ApiOperation({ summary: '同步指定项目分支' })
  async syncBranches(@CurrentUser() user: any, @Param('id') id: string, @Param('pid') pid: string) {
    const row = await this.prisma.gitlabConnection.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('连接不存在');
    if (row.userId && row.userId !== user.userId) throw new ForbiddenException();
    const res = await this.projectSync.syncProjectBranches(id, pid);
    try { this.audit.projectSyncTriggered(user.userId, id, 'branches', { projectGitlabId: pid, ...res } as any); } catch {}
    return { ok: true, ...res };
  }

  /**
   * 合规报告（管理接口）
   */
  @Get(':id/compliance-report')
  @ApiOperation({ summary: '生成并返回 GitLab 连接的合规报告' })
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({ type: ComplianceReportDto })
  async complianceReport(@CurrentUser() user: any, @Param('id') id: string) {
    const row = await this.prisma.gitlabConnection.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('连接不存在');
    if (row.userId && row.userId !== user.userId) throw new ForbiddenException();
    // 生成报告（内部会记录合规指标）
    const report = await this.audit.generateComplianceReport(id);
    return report;
  }

  /**
   * 合规快速检查（仅返回问题列表，管理接口）
   */
  @Get(':id/compliance-check')
  @ApiOperation({ summary: '检查 GitLab 连接的合规性，仅返回 issues 列表' })
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({ type: ComplianceCheckDto })
  async complianceCheck(@CurrentUser() user: any, @Param('id') id: string) {
    const row = await this.prisma.gitlabConnection.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('连接不存在');
    if (row.userId && row.userId !== user.userId) throw new ForbiddenException();
    const result = await this.audit.checkCompliance(id);
    return result;
  }

  /**
   * 触发连接级数据一致性恢复（管理接口）
   */
  @Post(':id/recover')
  @ApiOperation({ summary: '触发连接级数据一致性恢复（项目/成员/分支）' })
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({ type: RecoveryConnectionResultDto })
  async recoverConnection(@CurrentUser() user: any, @Param('id') id: string) {
    const row = await this.prisma.gitlabConnection.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('连接不存在');
    if (row.userId && row.userId !== user.userId) throw new ForbiddenException();
    const res = await this.recovery.recoverConnection(id);
    try { this.audit.recoveryTriggered(user.userId, id, 'connection', res as any); } catch {}
    return { ok: true, ...res };
  }

  /**
   * 触发单项目一致性恢复（管理接口）
   */
  @Post(':id/projects/:pid/recover')
  @ApiOperation({ summary: '触发单项目一致性恢复（成员/分支）' })
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({ type: RecoveryProjectResultDto })
  async recoverProject(@CurrentUser() user: any, @Param('id') id: string, @Param('pid') pid: string) {
    const row = await this.prisma.gitlabConnection.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('连接不存在');
    if (row.userId && row.userId !== user.userId) throw new ForbiddenException();
    const res = await this.recovery.recoverProjectByGitlabId(id, pid);
    try { this.audit.recoveryTriggered(user.userId, id, 'project', { projectGitlabId: pid, ...res } as any); } catch {}
    return { ok: true, ...res };
  }

  /**
   * 删除连接
   */
  @Delete(':id')
  @ApiOperation({ summary: '删除 GitLab 连接' })
  async remove(@CurrentUser() user: any, @Param('id') id: string) {
    const row = await this.prisma.gitlabConnection.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('连接不存在');
    if (row.userId && row.userId !== user.userId) throw new ForbiddenException();

    await this.prisma.gitlabConnection.delete({ where: { id } });
    try { this.audit.connectionDeleted(user.userId, id); } catch {}
    return { ok: true };
  }

  private toResponseDto(row: any): GitlabConnectionResponseDto {
    const dto = new GitlabConnectionResponseDto();
    dto.id = row.id;
    dto.name = row.name;
    dto.host = row.host;
    dto.authType = row.authType as GitlabAuthType;
    dto.isActive = row.isActive;
    dto.tokenExpiresAt = row.tokenExpiresAt ?? undefined;
    dto.usageCount = row.usageCount ?? 0;
    dto.lastUsedAt = row.lastUsedAt ?? undefined;
    dto.lastTestedAt = row.lastTestedAt ?? undefined;
    dto.lastError = row.lastError ?? undefined;
    dto.createdAt = row.createdAt;
    dto.updatedAt = row.updatedAt;
    return dto;
  }
}
