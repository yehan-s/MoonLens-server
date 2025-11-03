import { Body, Controller, Post } from '@nestjs/common'
import { Public } from '../auth/decorators/public.decorator'
import { GitlabApiClientService } from '../gitlab/services/gitlab-api-client.service'
import { AiAnalysisService } from '../services/ai-analysis.service'
import { AnalysisResultService } from '../services/analysis-result.service'
import { ReviewSyncService } from '../gitlab/services/review-sync.service'
import { fingerprint } from '../common/utils/fingerprint.util'

@Controller('api/analysis/debug')
export class DebugAnalysisController {
  constructor(
    private readonly gitlab: GitlabApiClientService,
    private readonly ai: AiAnalysisService,
    private readonly results: AnalysisResultService,
    private readonly reviewSync: ReviewSyncService,
  ) {}

  /**
   * 调试端点：手动对指定 MR 执行分析 → 保存 → 回写评论（尽力行内定位）
   * Body: { projectPathOrId: string, mrIid: number }
   */
  @Public()
  @Post('analyze-mr')
  async analyzeMR(@Body() body: { projectPathOrId: string; mrIid: number }) {
    const project = body.projectPathOrId
    const mrIid = Number(body.mrIid)
    // 1) 拉取 MR 与 diffs
    const mr = await this.gitlab.getMergeRequest(project, mrIid)
    const diffs = await this.gitlab.listMergeRequestDiffs(project, mrIid)
    const headSha = mr?.diff_refs?.head_sha || mr?.sha || mr?.source_sha

    // 2) 构建分析请求（尽量包含小文件内容 + diff 片段）
    const files = [] as Array<{ path: string; language: string; content: string; changes: string }>
    for (const c of diffs || []) {
      const path = c.new_path || c.newPath || c.old_path || c.oldPath || 'unknown'
      const language = this.detectLanguage(path)
      const changes = c.diff || c.patch || ''
      let content = ''
      try {
        if (headSha && path && changes && changes.length < 8000) {
          content = await this.gitlab.getFileRaw(project, path, headSha)
          if (content && content.length > 2000) content = content.slice(0, 2000)
        }
      } catch {}
      files.push({ path, language, content, changes })
    }

    // 3) 调用 LLM；失败则回退启发式规则
    let issues: any[] = []
    try {
      const llm = await this.ai.analyzeCode({ files, context: { projectType: 'gitlab-mr' }, rules: [] } as any)
      issues = llm?.issues || []
    } catch {
      // 启发式：从 diff 检测 console.log/md5/todo/var
      for (const f of files) {
        const lower = (f.changes || '').toLowerCase()
        if (lower.includes('console.log')) {
          issues.push({ file: f.path, line: 0, severity: 'low', type: 'style', message: '包含 console.log，建议移除或使用日志库', suggestion: '使用 logger 并设置级别' })
        }
        if (lower.includes('md5')) {
          issues.push({ file: f.path, line: 0, severity: 'high', type: 'security', message: '使用弱哈希 md5', suggestion: '使用 bcrypt/argon2 等密码哈希算法' })
        }
        if (lower.includes('todo')) {
          issues.push({ file: f.path, line: 0, severity: 'info', type: 'maintainability', message: 'TODO 未处理', suggestion: '完善 TODO 或创建任务跟踪' })
        }
        if (lower.includes('\nvar ')) {
          issues.push({ file: f.path, line: 0, severity: 'minor', type: 'style', message: 'JS 使用 var 声明', suggestion: '改为 let/const' })
        }
      }
    }

    // 4) 处理：去重、上限（20）
    const seen = new Set<string>()
    const max = 20
    const cleaned = [] as any[]
    for (const it of issues) {
      const fp = fingerprint(it.file || '', it.line || 0, `${it.type || ''}:${it.message || ''}:${it.suggestion || ''}`)
      if (!seen.has(fp)) {
        seen.add(fp)
        cleaned.push({ ...it, fingerprint: fp })
      }
      if (cleaned.length >= max) break
    }

    // 5) 保存
    const saved = await this.results.createAnalysisResult({
      projectId: project,
      mergeRequestIid: mrIid,
      filesAnalyzed: files.length,
      issuesFound: cleaned.length,
      metrics: {},
      processingTime: 0,
      workerVersion: 'debug-1',
      taskId: `debug-${Date.now()}`,
    } as any)
    if (cleaned.length) {
      await this.results.createIssues(cleaned.map((x) => ({
        resultId: saved.id,
        filePath: x.file || 'unknown',
        lineNumber: x.line || 0,
        severity: String(x.severity || 'info').toUpperCase(),
        type: (x.type || 'BEST_PRACTICE').toUpperCase(),
        rule: x.rule || null,
        message: x.message || '',
        suggestion: x.suggestion || '',
      })))
    }

    // 6) 回写评论（尽力行内定位，失败回退普通评论）
    const comments = cleaned.map((it) => ({
      body: `【${String(it.severity || '').toUpperCase()}】${it.type || ''} @ ${it.file || ''}:${it.line || 0}\n${it.message || ''}\n建议：${it.suggestion || ''}`,
      fingerprint: it.fingerprint,
      file: it.file,
      line: it.line || 0,
    }))
    const posted = cleaned.length ? (await this.reviewSync.postCommentsIdempotent(project, mrIid, comments)).posted : 0

    return { ok: true, savedId: saved.id, commentsPosted: posted, issues: cleaned.length }
  }

  private detectLanguage(path: string): string {
    const ext = (path.split('.').pop() || '').toLowerCase()
    switch (ext) {
      case 'ts': return 'ts'
      case 'js': return 'js'
      case 'vue': return 'vue'
      case 'py': return 'python'
      case 'java': return 'java'
      case 'go': return 'go'
      case 'cs': return 'csharp'
      case 'rb': return 'ruby'
      default: return 'text'
    }
  }
}

