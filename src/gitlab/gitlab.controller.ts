import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GitlabApiClientService } from './services/gitlab-api-client.service';
import { GitlabCacheService } from './cache/gitlab.cache';
import { BranchService } from './services/branch.service';
import { MergeRequestService } from './services/merge-request.service';
import { RepositoryService } from './services/repository.service';
import { toHttpException } from './utils/error.util';

@ApiTags('GitLab')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('gitlab')
export class GitlabController {
  constructor(
    private readonly api: GitlabApiClientService,
    private readonly cache: GitlabCacheService,
    private readonly branches: BranchService,
    private readonly mrs: MergeRequestService,
    private readonly repo: RepositoryService,
  ) {}

  @Get('projects')
  @ApiOperation({ summary: '列出项目（当前用户可见）' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'per_page', required: false, type: Number })
  @ApiQuery({ name: 'page', required: false, type: Number })
  async listProjects(@Query('search') search?: string, @Query('per_page') perPage?: string, @Query('page') page?: string) {
    try {
      const per = perPage ? parseInt(perPage, 10) : undefined
      const key = this.cache.keyFor('projects', undefined, `${search || ''}:${per || ''}`)
      return await this.cache.wrap(key, 30, () => this.api.listProjects({ membership: true, search, perPage: per }))
    } catch (e) { throw toHttpException(e) }
  }

  @Get('projects/:projectId')
  @ApiOperation({ summary: '获取项目详情' })
  async getProject(@Param('projectId') projectId: string) {
    try {
      const key = this.cache.keyFor('project', projectId)
      return await this.cache.wrap(key, 60, () => this.api.getProject(projectId))
    } catch (e) { throw toHttpException(e) }
  }

  @Get('projects/:projectId/branches')
  @ApiOperation({ summary: '获取项目分支' })
  async getBranches(
    @Param('projectId') projectId: string,
    @Query('per_page') per_page?: string,
    @Query('page') page?: string,
  ) {
    try {
      const per = per_page ? parseInt(per_page, 10) : undefined
      const pg = page ? parseInt(page, 10) : undefined
      const key = this.cache.keyFor('branches', projectId, `${per || ''}:${pg || ''}`)
      return await this.cache.wrap(key, 30, () => this.branches.list(projectId, { per_page: per, page: pg }))
    } catch (e) { throw toHttpException(e) }
  }

  @Get('projects/:projectId/merge_requests')
  @ApiOperation({ summary: '获取项目合并请求列表' })
  @ApiQuery({ name: 'state', required: false, enum: ['opened', 'closed', 'merged'] })
  @ApiQuery({ name: 'per_page', required: false, type: Number })
  @ApiQuery({ name: 'page', required: false, type: Number })
  async listMRs(
    @Param('projectId') projectId: string,
    @Query('state') state?: 'opened' | 'closed' | 'merged',
    @Query('per_page') per_page?: string,
    @Query('page') page?: string,
  ) {
    try {
      const per = per_page ? parseInt(per_page, 10) : undefined
      const pg = page ? parseInt(page, 10) : undefined
      return await this.mrs.list(projectId, { state, per_page: per, page: pg })
    } catch (e) { throw toHttpException(e) }
  }

  @Get('projects/:projectId/merge_requests/:mrId')
  @ApiOperation({ summary: '获取合并请求详情' })
  async getMR(@Param('projectId') projectId: string, @Param('mrId') mrId: string) {
    try { return await this.mrs.get(projectId, mrId) } catch (e) { throw toHttpException(e) }
  }

  @Get('projects/:projectId/merge_requests/:mrId/diffs')
  @ApiOperation({ summary: '获取合并请求差异' })
  async getMRDiffs(@Param('projectId') projectId: string, @Param('mrId') mrId: string) {
    try { return await this.mrs.diffs(projectId, mrId) } catch (e) { throw toHttpException(e) }
  }

  @Get('projects/:projectId/repository/tree')
  @ApiOperation({ summary: '获取项目文件树' })
  @ApiQuery({ name: 'path', required: false })
  @ApiQuery({ name: 'ref', required: false })
  @ApiQuery({ name: 'recursive', required: false, type: Boolean })
  async repoTree(
    @Param('projectId') projectId: string,
    @Query('path') path?: string,
    @Query('ref') ref?: string,
    @Query('recursive') recursive?: string,
  ) {
    try {
      const key = this.cache.keyFor('tree', projectId, `${ref || ''}:${path || ''}:${recursive || ''}`)
      return await this.cache.wrap(key, 30, () => this.repo.tree(projectId, { path, ref, recursive: recursive === 'true' }))
    } catch (e) { throw toHttpException(e) }
  }

  @Get('projects/:projectId/repository/files/:filePath')
  @ApiOperation({ summary: '获取文件原始内容' })
  @ApiQuery({ name: 'ref', required: true })
  async fileRaw(@Param('projectId') projectId: string, @Param('filePath') filePath: string, @Query('ref') ref: string) {
    try {
      const content = await this.repo.fileRaw(projectId, filePath, ref)
      return { content }
    } catch (e) { throw toHttpException(e) }
  }
}
