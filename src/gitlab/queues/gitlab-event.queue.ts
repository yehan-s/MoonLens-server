import { Processor, Process } from '@nestjs/bull'
import type { Job } from 'bull'
import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

type GitlabEventJob = {
  eventId: string
}

@Processor('gitlab-events')
@Injectable()
export class GitlabEventProcessor {
  private readonly logger = new Logger(GitlabEventProcessor.name)
  constructor(private readonly prisma: PrismaService) {}

  @Process()
  async handle(job: Job<GitlabEventJob>) {
    const { eventId } = job.data
    const ev = await this.prisma.webhookEvent.findUnique({ where: { id: eventId } })
    if (!ev) {
      this.logger.warn(`Webhook event not found: ${eventId}`)
      return
    }
    // TODO: 根据不同 eventType 执行不同同步逻辑，这里先做占位处理与标记
    this.logger.log(`Processing GitLab event ${eventId} type=${ev.eventType}`)
    await this.prisma.webhookEvent.update({ where: { id: eventId }, data: { processed: true } })
  }
}
