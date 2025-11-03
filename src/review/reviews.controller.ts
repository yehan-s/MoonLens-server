import { Body, Controller, Get, HttpCode, HttpStatus, NotFoundException, Param, Post, Query, Res, UseGuards } from '@nestjs/common'
import type { Response } from 'express'
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { PrismaService } from '../prisma/prisma.service'
import { QueueService } from '../modules/queue/queue.service'
import { GitlabApiClientService } from '../gitlab/services/gitlab-api-client.service'
import { ReviewService } from './review.service'
import { formatReport, renderHtml } from './report.util'
import { randomUUID } from 'crypto'

/**
 * Reviews 控制器（复数形式），用于兼容前端 MoonLens-client 的 /api/reviews 路径。
 *
 * 说明：
 * - 原有 singular 形式的 /api/review 已用于查询；
 * - 前端接线使用 plural 形式并包含创建/AI分析/重跑/导出等端点；
 * - 这里提供轻量实现，将创建任务映射为 AnalysisResult 占位记录（仅元数据，不存储源代码）。
 */
@ApiTags('Review')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reviews')
export class ReviewsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly service: ReviewService,
    private readonly queue: QueueService,
    private readonly gitlabApi: GitlabApiClientService,
  ) {}

  /**
   * 创建审查任务（最小实现）
   * 前端请求体示例：{ projectId, type: 'branch'|'merge_request'|'full', branch?, mergeRequestId?, rules? }
   * 返回：{ id: taskId, status: 'pending' }
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '创建审查任务' })
  async create(@Body() body: any) {
    const taskId = `task-${Date.now()}-${randomUUID()}`
    const projectId = String(body.projectId)
    const mrIid = body.mergeRequestId ? Number(body.mergeRequestId) : undefined

    // 最小落库：仅创建 AnalysisResult 占位行，避免存源代码（符合零持久化设计）
    await this.prisma.analysisResult.create({
      data: {
        projectId,
        mergeRequestIid: mrIid,
        sourceBranch: body.branch || null,
        metrics: { totalIssues: 0 },
        filesAnalyzed: 0,
        issuesFound: 0,
        taskId,
      },
    })

    // 若为 MR 审查，入队 MR 分析任务
    if (body.type === 'merge_request' && mrIid) {
      // 解析项目（兼容传入本地UUID或GitLab Project ID）
      const project = await this.prisma.project.findFirst({
        where: { OR: [{ id: projectId }, { gitlabProjectId: projectId }] },
      })
      if (project) {
        let projectPath = ''
        try {
          const u = new URL(project.gitlabProjectUrl)
          const parts = u.pathname.split('/').filter(Boolean)
          projectPath = parts.slice(-2).join('/')
        } catch {}
        // 获取 MR 详情以丰富任务上下文（失败不阻断）
        let mr: any = null
        try { mr = await this.gitlabApi.getMergeRequest(project.gitlabProjectId, mrIid) } catch {}
        await this.queue.addMRAnalysisTask({
          projectId: project.id,
          projectPath,
          mergeRequestId: mr?.id ?? mrIid,
          mergeRequestIid: mrIid,
          sourceBranch: mr?.source_branch || body.branch || project.defaultBranch || 'main',
          targetBranch: mr?.target_branch || project.defaultBranch || 'main',
          title: mr?.title || '',
          description: mr?.description || '',
          url: mr?.web_url || '',
          repoUrl: project.gitlabProjectUrl,
          lastCommit: mr?.sha ? { id: mr.sha, message: '', timestamp: new Date().toISOString(), author: { name: '', email: '' } } : undefined,
          author: mr?.author ? { name: mr.author.name, username: mr.author.username, email: '' } : undefined,
          timestamp: new Date().toISOString(),
        })
      }
    }

    return { id: taskId, status: 'pending' }
  }

  /**
   * 列表
   * 兼容参数：projectId、status（忽略）、page、per_page
   */
  @Get()
  @ApiOperation({ summary: '获取审查任务列表' })
  @ApiQuery({ name: 'projectId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'per_page', required: false, type: Number })
  async list(@Query() q: any) {
    return this.service.list({
      projectId: q.projectId,
      page: q.page ? Number(q.page) : undefined,
      pageSize: q.per_page ? Number(q.per_page) : undefined,
    })
  }

  /**
   * 任务详情（按 id 或 taskId 命中）
   */
  @Get(':id')
  @ApiOperation({ summary: '获取审查任务详情' })
  async get(@Param('id') id: string) {
    let res = await this.service.get(id)
    if (!res) {
      const fallback = await this.prisma.analysisResult.findFirst({ where: { taskId: id }, include: { issues: true } })
      if (!fallback) throw new NotFoundException('review_not_found')
      res = {
        id: fallback.id,
        projectId: fallback.projectId,
        mrIid: fallback.mergeRequestIid,
        createdAt: fallback.createdAt,
        issues: fallback.issues,
        metrics: fallback.metrics,
      }
    }
    return res
  }

  /**
   * 获取 AI 分析结果
   * 返回结构：{ issues: [...], aiInsights? }
   */
  @Get(':id/ai-analysis')
  @ApiOperation({ summary: '获取 AI 分析结果' })
  async ai(@Param('id') id: string) {
    const row = await this.prisma.analysisResult.findFirst({ where: { OR: [{ id }, { taskId: id }] }, include: { issues: true } })
    if (!row) throw new NotFoundException('review_not_found')
    const issues = (row.issues || []).map((x: any) => ({
      id: x.id,
      file: x.filePath,
      line: x.lineNumber,
      severity: String(x.severity || 'INFO').toLowerCase(),
      category: 'maintainability',
      message: x.message,
      suggestion: x.suggestion,
      codeSnippet: x.codeSnippet,
      rule: x.rule,
    }))
    // 可选洞察占位
    const m: any = row.metrics as any
    const aiInsights = m?.aiInsights || undefined
    return { issues, aiInsights }
  }

  /**
   * 重新执行审查（最小实现：入队占位）
   */
  @Post(':id/rerun')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: '重新执行审查' })
  async rerun(@Param('id') id: string) {
    // TODO: 接入队列 worker，当前返回占位状态
    return { status: 'queued', id }
  }

  /**
   * 导出报告（json/html/pdf）
   * 注意：此处为演示实现；生产应生成真实格式并控制权限。
   */
  @Get('reports/:reportId/export')
  @ApiOperation({ summary: '导出审查报告' })
  async export(
    @Param('reportId') reportId: string,
    @Query('format') format: 'json' | 'html' | 'pdf' = 'json',
    @Res() res: Response,
  ) {
    const raw = await this.get(reportId).catch(() => ({ id: reportId, summary: {}, issues: [] }))
    const report = formatReport(raw)
    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Content-Disposition', `attachment; filename=report-${reportId}.json`)
      return res.status(200).send(JSON.stringify(report, null, 2))
    }
    if (format === 'html') {
      const html = renderHtml(report)
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename=report-${reportId}.html`)
      return res.status(200).send(html)
    }
    // 简易 PDF 占位：返回 HTML 字节流（生产建议独立渲染服务）
    const html = renderHtml(report)
    const bytes = Buffer.from(html, 'utf-8')
    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('Content-Disposition', `attachment; filename=report-${reportId}.pdf`)
    return res.status(200).send(bytes)
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]+/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[c] || c)
}
