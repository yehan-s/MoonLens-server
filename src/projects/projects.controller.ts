import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { PaginationQueryDto } from './dto/pagination.dto';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { ProjectConfigurationService } from '../gitlab/services/project-configuration.service';
import { ProjectMemberService } from './project-member.service';

@ApiTags('项目管理')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER, UserRole.ADMIN)
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly configSvc: ProjectConfigurationService,
    private readonly memberSvc: ProjectMemberService,
  ) {}

  @Post()
  @ApiOperation({ summary: '创建项目' })
  async create(@Body() dto: CreateProjectDto) {
    return await this.projects.create(dto);
  }

  @Get()
  @ApiOperation({ summary: '分页查询项目' })
  async list(@Query() query: PaginationQueryDto) {
    return await this.projects.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取项目详情' })
  async get(@Param('id') id: string) {
    return await this.projects.get(id);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新项目信息' })
  async update(@Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return await this.projects.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '归档（软删除）项目' })
  @ApiResponse({ status: 200, description: '项目已归档' })
  async archive(@Param('id') id: string) {
    await this.projects.archive(id);
    return { message: 'Project archived' };
  }

  @Get(':id/config')
  @ApiOperation({ summary: '获取项目配置' })
  async getConfig(@Param('id') id: string) {
    return await this.projects.getConfig(id);
  }

  @Put(':id/config')
  @ApiOperation({ summary: '更新项目配置（整体覆盖或增量合并）' })
  async setConfig(@Param('id') id: string, @Body() patch: any) {
    return await this.projects.patchConfig(id, patch);
  }

  @Get(':id/members')
  @ApiOperation({ summary: '获取项目成员列表' })
  async listMembers(@Param('id') id: string) {
    return await this.memberSvc.list(id);
  }

  @Post(':id/members')
  @ApiOperation({ summary: '添加项目成员（按 GitLab 用户ID 或邮箱）' })
  async addMembers(@Param('id') id: string, @Body() body: { users: Array<{ gitlabUserId?: string; email?: string; username?: string; accessLevel?: number }> }) {
    // 支持直接添加或邀请
    const users = body?.users || [];
    const withId = users.filter((u) => !!u.gitlabUserId);
    const noId = users.filter((u) => !u.gitlabUserId);
    const added = withId.length ? await this.memberSvc.add(id, withId) : { added: 0 };
    const invited = noId.length ? await this.memberSvc.invite(id, noId) : { invited: 0 };
    return { ...added, ...invited };
  }

  @Delete(':id/members/:gitlabUserId')
  @ApiOperation({ summary: '移除项目成员（按 GitLab 用户ID）' })
  async removeMember(@Param('id') id: string, @Param('gitlabUserId') gitlabUserId: string) {
    return await this.memberSvc.remove(id, gitlabUserId);
  }

  @Get(':id/gitlab/sync-status')
  @ApiOperation({ summary: '查看 GitLab 同步状态' })
  async syncStatus(@Param('id') id: string) {
    return await this.projects.syncStatus(id);
  }

  @Post(':id/gitlab/sync')
  @ApiOperation({ summary: '触发本项目的成员与分支同步' })
  async sync(@Param('id') id: string) {
    return await this.projects.syncProject(id);
  }
}
