import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards, Headers } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import { GitlabService } from './gitlab.service';
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
    private readonly gitlabService: GitlabService,
    private readonly api: GitlabApiClientService,
    private readonly cache: GitlabCacheService,
    private readonly branches: BranchService,
    private readonly mrs: MergeRequestService,
    private readonly repo: RepositoryService,
    private readonly configService: ConfigService,
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

  @Post('projects/:projectId/branches')
  @ApiOperation({ summary: '创建分支（仅允许包含 yehan 关键词的分支名）' })
  async createBranch(
    @Param('projectId') projectId: string,
    @Body('branch') branch: string,
    @Body('ref') ref?: string,
  ) {
    try {
      if (!branch || branch.toLowerCase().indexOf('yehan') === -1) {
        // 与业务约束一致：仅允许包含 yehan 的分支
        return { error: 'branch name must include keyword "yehan"' }
      }
      // 若未提供 ref，自动取项目默认分支
      let base = ref
      if (!base) {
        const proj = await this.api.getProject(projectId)
        base = proj?.default_branch || proj?.defaultBranch || 'main'
      }
      return await this.branches.create(projectId, branch, base!)
    } catch (e) { throw toHttpException(e) }
  }

  // 兼容：GET 方式创建（便于在启用 CSRF 的生产模式下通过非浏览器调用）
  @Get('projects/:projectId/branches/create')
  @ApiOperation({ summary: '创建分支（GET 兼容；仅允许包含 yehan 关键词）' })
  async createBranchCompatGet(
    @Param('projectId') projectId: string,
    @Query('branch') branch: string,
    @Query('ref') ref?: string,
  ) {
    try {
      if (!branch || branch.toLowerCase().indexOf('yehan') === -1) {
        return { error: 'branch name must include keyword "yehan"' }
      }
      let base = ref
      if (!base) {
        const proj = await this.api.getProject(projectId)
        base = proj?.default_branch || proj?.defaultBranch || 'main'
      }
      return await this.branches.create(projectId, branch, base!)
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

  @Get('groups')
  @ApiOperation({ summary: '获取群组列表（当前用户可见）' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'per_page', required: false, type: Number })
  @ApiQuery({ name: 'page', required: false, type: Number })
  async listGroups(
    @Query('search') search?: string,
    @Query('per_page') per_page?: string,
    @Query('page') page?: string,
  ) {
    try {
      const per = per_page ? parseInt(per_page, 10) : 100
      const pg = page ? parseInt(page, 10) : 1
      return await this.api.listGroups({ search, per_page: per, page: pg, membership: true })
    } catch (e) { throw toHttpException(e) }
  }

  @Get('groups/:groupId/merge_requests')
  @ApiOperation({ summary: '获取群组合并请求列表（可包含子群组）' })
  @ApiQuery({ name: 'state', required: false, enum: ['opened', 'closed', 'merged'] })
  @ApiQuery({ name: 'per_page', required: false, type: Number })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'include_subgroups', required: false, type: Boolean })
  async listGroupMRs(
    @Param('groupId') groupId: string,
    @Query('state') state?: 'opened' | 'closed' | 'merged',
    @Query('per_page') per_page?: string,
    @Query('page') page?: string,
    @Query('include_subgroups') include_subgroups?: string,
  ) {
    try {
      const per = per_page ? parseInt(per_page, 10) : undefined
      const pg = page ? parseInt(page, 10) : undefined
      const inc = include_subgroups === undefined ? true : include_subgroups === 'true'
      return await this.api.listGroupMergeRequests(groupId, { state, per_page: per, page: pg, include_subgroups: inc })
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

  @Get('projects/:projectId/merge_requests/:mrId/commits')
  @ApiOperation({ summary: '获取合并请求提交历史' })
  async getMRCommits(@Param('projectId') projectId: string, @Param('mrId') mrId: string) {
    try { return await this.mrs.commits(projectId, mrId) } catch (e) { throw toHttpException(e) }
  }

  // ---- Approvals 代理（使用 /mrs/:iid 简化路径以兼容前端） ----

  @Get('projects/:projectId/mrs/:mrIid/approvals')
  @ApiOperation({ summary: '获取 MR 审批状态（Approvals）' })
  async approvals(@Param('projectId') projectId: string, @Param('mrIid') mrIid: string) {
    try { return await this.api.getMergeRequestApprovals(projectId, mrIid) } catch (e) { throw toHttpException(e) }
  }

  @Get('projects/:projectId/merge_requests/:mrId/approvals')
  @ApiOperation({ summary: '获取 MR 审批状态（兼容 merge_requests 路径）' })
  async approvalsCompat(@Param('projectId') projectId: string, @Param('mrId') mrId: string) {
    try { return await this.api.getMergeRequestApprovals(projectId, mrId) } catch (e) { throw toHttpException(e) }
  }

  @Get('projects/:projectId/mrs/:mrIid/approve')
  @ApiOperation({ summary: '批准 MR（GET 兼容；建议使用 POST）' })
  async approveCompatGet(@Param('projectId') projectId: string, @Param('mrIid') mrIid: string) {
    try { return await this.api.approveMergeRequest(projectId, mrIid) } catch (e) { throw toHttpException(e) }
  }

  @Post('projects/:projectId/mrs/:mrIid/approve')
  @ApiOperation({ summary: '批准 MR' })
  async approvePost(@Param('projectId') projectId: string, @Param('mrIid') mrIid: string) {
    try { return await this.api.approveMergeRequest(projectId, mrIid) } catch (e) { throw toHttpException(e) }
  }

  @Get('projects/:projectId/mrs/:mrIid/unapprove')
  @ApiOperation({ summary: '取消批准 MR（GET 兼容；建议使用 POST）' })
  async unapproveCompatGet(@Param('projectId') projectId: string, @Param('mrIid') mrIid: string) {
    try { return await this.api.unapproveMergeRequest(projectId, mrIid) } catch (e) { throw toHttpException(e) }
  }

  @Post('projects/:projectId/mrs/:mrIid/unapprove')
  @ApiOperation({ summary: '取消批准 MR' })
  async unapprovePost(@Param('projectId') projectId: string, @Param('mrIid') mrIid: string) {
    try { return await this.api.unapproveMergeRequest(projectId, mrIid) } catch (e) { throw toHttpException(e) }
  }

  @Get('projects/:projectId/mrs/:mrIid/notes')
  @ApiOperation({ summary: '在 MR 下添加评论（GET 兼容；建议使用 POST）' })
  async noteCompatGet(@Param('projectId') projectId: string, @Param('mrIid') mrIid: string, @Query('note') note: string) {
    try { return await this.api.createMergeRequestNote(projectId, mrIid, { body: note }) } catch (e) { throw toHttpException(e) }
  }

  @Post('projects/:projectId/mrs/:mrIid/notes')
  @ApiOperation({ summary: '在 MR 下添加评论（CodeRabbit 风格）' })
  async notePost(
    @Param('projectId') projectId: string,
    @Param('mrIid') mrIid: string,
    @Body('note') note?: string,
    @Body('body') body?: string
  ) {
    try {
      // 支持 note 或 body 字段，优先使用 body（与前端一致）
      const content = body || note;
      if (!content) {
        throw new Error('评论内容不能为空');
      }
      return await this.api.createMergeRequestNote(projectId, mrIid, { body: content });
    } catch (e) {
      throw toHttpException(e);
    }
  }

  @Public()
  @Post('projects/:projectId/merge_requests/:mrIid/discussions')
  @ApiOperation({ summary: '创建 MR 讨论（支持行内评论）' })
  async createDiscussion(
    @Param('projectId') projectId: string,
    @Param('mrIid') mrIid: string,
    @Body() payload: any,
    @Headers('private-token') userToken?: string,
    @Headers('x-gitlab-authorization') oauthToken?: string,
  ) {
    try {
      // 优先使用用户提供的token（支持OAuth Bearer或Private-Token）
      // 如果用户未提供token,则不传递参数,让API客户端使用系统Token
      const token = oauthToken?.replace(/^Bearer\s+/i, '') || userToken || undefined
      const authType = oauthToken ? 'BEARER' : (userToken ? 'PRIVATE' : undefined)
      return await this.api.createMergeRequestDiscussion(projectId, mrIid, payload, token, authType as any);
    } catch (e) {
      throw toHttpException(e);
    }
  }

  @Public()
  @Post('projects/:projectId/mrs/:mrIid/discussions')
  @ApiOperation({ summary: '创建 MR 讨论（简化路径）' })
  async createDiscussionShort(
    @Param('projectId') projectId: string,
    @Param('mrIid') mrIid: string,
    @Body() payload: any,
    @Headers('private-token') userToken?: string,
    @Headers('x-gitlab-authorization') oauthToken?: string,
  ) {
    try {
      // 优先使用用户提供的token（支持OAuth Bearer或Private-Token）
      // 如果用户未提供token,则不传递参数,让API客户端使用系统Token
      const token = oauthToken?.replace(/^Bearer\s+/i, '') || userToken || undefined
      const authType = oauthToken ? 'BEARER' : (userToken ? 'PRIVATE' : undefined)
      return await this.api.createMergeRequestDiscussion(projectId, mrIid, payload, token, authType as any);
    } catch (e) {
      throw toHttpException(e);
    }
  }

  // 兼容：POST 到 merge_requests 路径创建普通评论（与前端兜底一致）
  @Post('projects/:projectId/merge_requests/:mrId/notes')
  @ApiOperation({ summary: '在 MR 下添加评论（兼容 merge_requests 路径）' })
  async notePostCompat(
    @Param('projectId') projectId: string,
    @Param('mrId') mrId: string,
    @Body('note') note?: string,
    @Body('body') body?: string,
  ) {
    try {
      const content = body || note
      if (!content) throw new Error('评论内容不能为空')
      return await this.api.createMergeRequestNote(projectId, mrId, { body: content })
    } catch (e) { throw toHttpException(e) }
  }

  // ---- 一键清理评论（notes + discussions.notes）----
  @Post('projects/:projectId/merge_requests/:mrIid/comments/cleanup')
  async cleanupCommentsPost(
    @Param('projectId') projectId: string,
    @Param('mrIid') mrIid: string,
    @Query('scope') scope: 'moonlens' | 'all' = 'moonlens',
    @Headers('private-token') userToken?: string,
    @Headers('x-gitlab-authorization') oauthToken?: string,
  ) {
    return this.cleanupComments(projectId, mrIid, scope, userToken, oauthToken)
  }

  @Post('projects/:projectId/mrs/:mrIid/comments/cleanup')
  async cleanupCommentsPostCompat(
    @Param('projectId') projectId: string,
    @Param('mrIid') mrIid: string,
    @Query('scope') scope: 'moonlens' | 'all' = 'moonlens',
    @Headers('private-token') userToken?: string,
    @Headers('x-gitlab-authorization') oauthToken?: string,
  ) {
    return this.cleanupComments(projectId, mrIid, scope, userToken, oauthToken)
  }

  // GET 兼容（便于在某些场景下调试/避免CSRF拦截）
  @Get('projects/:projectId/merge_requests/:mrIid/comments/cleanup')
  async cleanupCommentsGet(
    @Param('projectId') projectId: string,
    @Param('mrIid') mrIid: string,
    @Query('scope') scope: 'moonlens' | 'all' = 'moonlens',
    @Headers('private-token') userToken?: string,
    @Headers('x-gitlab-authorization') oauthToken?: string,
  ) {
    return this.cleanupComments(projectId, mrIid, scope, userToken, oauthToken)
  }

  @Get('projects/:projectId/mrs/:mrIid/comments/cleanup')
  async cleanupCommentsGetCompat(
    @Param('projectId') projectId: string,
    @Param('mrIid') mrIid: string,
    @Query('scope') scope: 'moonlens' | 'all' = 'moonlens',
    @Headers('private-token') userToken?: string,
    @Headers('x-gitlab-authorization') oauthToken?: string,
  ) {
    return this.cleanupComments(projectId, mrIid, scope, userToken, oauthToken)
  }

  private async cleanupComments(
    projectId: string,
    mrIid: string,
    scope: 'moonlens' | 'all',
    userToken?: string,
    oauthToken?: string,
  ) {
    try {
      const token = oauthToken?.replace(/^Bearer\s+/i, '') || userToken || undefined
      const authType = oauthToken ? 'BEARER' : (userToken ? 'PRIVATE' : undefined)
      const isML = (s: any) => {
        const b = String(s || '')
        return /MoonLens AI/i.test(b) || /\[ML-FP:[0-9a-f]{8,64}\]/i.test(b) || /🤖\s*MoonLens/i.test(b)
      }

      // 1) notes
      const notes = await this.api.listMrNotes(projectId, mrIid, token, authType as any).catch(() => [])
      const notesToDelete = (notes || []).filter((n: any) => scope === 'all' || isML(n?.body))

      let deleted = 0, skipped = 0
      for (const n of notesToDelete) {
        try {
          await this.api.deleteMrNote(projectId, mrIid, n.id, token, authType as any)
          deleted++
        } catch { skipped++ }
      }

      // 2) discussion notes
      const discussions = await this.api.listMrDiscussions(projectId, mrIid).catch(() => [])
      for (const d of discussions || []) {
        for (const note of (d?.notes || [])) {
          if (scope === 'all' || isML(note?.body)) {
            try {
              await this.api.deleteDiscussionNote(projectId, mrIid, d.id, note.id, token, authType as any)
              deleted++
            } catch { skipped++ }
          }
        }
      }

      const total = (notes?.length || 0) + ((discussions || []) as any[]).reduce((acc: number, x: any) => acc + (x?.notes?.length || 0), 0)
      return { deleted, total, skipped, scope }
    } catch (e) { throw toHttpException(e) }
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

  @Get('mr-stats')
  @ApiOperation({ summary: '获取MR统计（支持按群组聚合）' })
  async getMRStats(
    @Headers('private-token') token?: string,
    @Query('group') group?: string,
    @Query('include_subgroups') include_subgroups?: string,
  ) {
    try {
      // 若指定 group 或存在默认组（GITLAB_DEFAULT_GROUP），则按群组统计（默认包含子群组）
      const defaultGroup = this.configService.get<string>('GITLAB_DEFAULT_GROUP');
      const groupKey = group || defaultGroup;
      if (groupKey) {
        const include = include_subgroups === undefined ? true : include_subgroups === 'true'
        const opened = await this.api.listGroupMergeRequests(groupKey, { state: 'opened', per_page: 100, page: 1, include_subgroups: include })

        // 按项目聚合统计（名称兜底为 #projectId）
        const map = new Map<number, { projectId: number; projectName: string; openMRs: number }>()
        for (const mr of opened || []) {
          const pid = Number(mr?.project_id || mr?.projectId)
          const pname = (mr?.references?.full?.split('!')[0]) || mr?.project_path || `#${pid}`
          if (!map.has(pid)) map.set(pid, { projectId: pid, projectName: String(pname || `#${pid}`), openMRs: 0 })
          map.get(pid)!.openMRs++
        }

        return {
          totalOpenMRs: (opened || []).length,
          projectStats: Array.from(map.values()).sort((a,b) => b.openMRs - a.openMRs),
          lastUpdated: new Date().toISOString(),
          scope: { type: 'group', group: groupKey, includeSubgroups: include },
        }
      }

      // 默认：按用户成员项目的最近20个项目聚合
      return await this.gitlabService.getMergeRequestStats(token)
    } catch (e) { 
      throw toHttpException(e) 
    }
  }
}
