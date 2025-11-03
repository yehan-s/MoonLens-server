import { Processor, Process } from '@nestjs/bull'
import type { Job } from 'bull'
import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { ProjectConfigurationService } from '../services/project-configuration.service'
import { QueueService } from '../../modules/queue/queue.service'
import { GitlabApiClientService } from '../services/gitlab-api-client.service'

type GitlabEventJob = {
  eventId: string
}

@Processor('gitlab-events')
@Injectable()
export class GitlabEventProcessor {
  private readonly logger = new Logger(GitlabEventProcessor.name)
  constructor(
    private readonly prisma: PrismaService,
    private readonly configSvc: ProjectConfigurationService,
    private readonly queue: QueueService,
    private readonly gitlabApi: GitlabApiClientService,
  ) {}

  @Process()
  async handle(job: Job<GitlabEventJob>) {
    const { eventId } = job.data
    const ev = await this.prisma.webhookEvent.findUnique({ where: { id: eventId } })
    if (!ev) {
      this.logger.warn(`Webhook event not found: ${eventId}`)
      return
    }
    this.logger.log(`Processing GitLab event ${eventId} type=${ev.eventType}`)
    try {
      await this.handleTrigger(ev).catch((e) => this.logger.warn(`Trigger handling skipped: ${e?.message}`))
    } finally {
      await this.prisma.webhookEvent.update({ where: { id: eventId }, data: { processed: true } })
    }
  }

  private async handleTrigger(ev: { projectId: string; eventType: string; payload: any }) {
    // 仅处理 Merge Request 与 Push 的触发
    const isMR = /merge\s*request/i.test(ev.eventType)
    const isPush = /push/i.test(ev.eventType)
    if (!isMR && !isPush) return

    const project = await this.prisma.project.findUnique({ where: { id: ev.projectId } })
    if (!project) return
    const cfg = await this.configSvc.get(project.id)
    const reviewCfg = (cfg?.review || {}) as any
    const triggerCfg = (reviewCfg.trigger || { labels: ['ai-review'], minChangedLines: 0 }) as any
    const auto = reviewCfg.auto !== false

    if (isMR) {
      const obj = ev.payload?.object_attributes || {}
      const mrIid = Number(obj.iid || ev.payload?.object_attributes?.iid)
      if (!mrIid) return
      const labels = (ev.payload?.labels || []).map((l: any) => String(l.title || l.name || '').toLowerCase())
      const wantLabels = (triggerCfg.labels || []).map((x: any) => String(x).toLowerCase())
      const hasLabel = wantLabels.length > 0 ? labels.some((t: string) => wantLabels.includes(t)) : false
      const changes = Number(obj.changes_count || 0) || 0
      const minLines = Number(triggerCfg.minChangedLines || 0)
      const should = auto || hasLabel || changes >= minLines
      if (!should) return

      // 丰富 MR 详情（失败不阻断）
      let mr: any = null
      try { mr = await this.gitlabApi.getMergeRequest(project.gitlabProjectId, mrIid) } catch {}
      let projectPath = ''
      try { const u = new URL(project.gitlabProjectUrl); const parts = u.pathname.split('/').filter(Boolean); projectPath = parts.slice(-2).join('/') } catch {}
      await this.queue.addMRAnalysisTask({
        projectId: project.id,
        projectPath,
        mergeRequestId: mr?.id ?? mrIid,
        mergeRequestIid: mrIid,
        sourceBranch: mr?.source_branch || obj?.source_branch || project.defaultBranch || 'main',
        targetBranch: mr?.target_branch || obj?.target_branch || project.defaultBranch || 'main',
        title: mr?.title || obj?.title || '',
        description: mr?.description || obj?.description || '',
        url: mr?.web_url || '',
        repoUrl: project.gitlabProjectUrl,
        lastCommit: mr?.sha ? { id: mr.sha, message: '', timestamp: new Date().toISOString(), author: { name: '', email: '' } } : undefined,
        author: mr?.author ? { name: mr.author.name, username: mr.author.username, email: '' } : undefined,
        timestamp: new Date().toISOString(),
      })
      return
    }

    if (isPush) {
      // Push 事件：按 minChangedLines 近似为变更文件数（added+modified+removed）
      const added = (ev.payload?.commits || []).reduce((n: number, c: any) => n + (c.added?.length || 0), 0)
      const modified = (ev.payload?.commits || []).reduce((n: number, c: any) => n + (c.modified?.length || 0), 0)
      const removed = (ev.payload?.commits || []).reduce((n: number, c: any) => n + (c.removed?.length || 0), 0)
      const filesChanged = added + modified + removed
      const minLines = Number(triggerCfg.minChangedLines || 0)
      const should = auto || filesChanged >= minLines
      if (!should) return
      // TODO: 这里可入队“分支分析”任务（当前仅支持 MR 分析，Push 默认跳过）
      this.logger.log(`Push trigger matched for project ${project.id}, changed files=${filesChanged}`)
    }
  }
}
