import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { PrismaService } from '../../prisma/prisma.service'
import { InjectQueue } from '@nestjs/bull'
import type { Queue } from 'bull'

/**
 * 定时调度：扫描未处理的 WebhookEvent 并重新入队
 * - 目标：提升稳健性，避免短暂故障导致事件丢失
 */
@Injectable()
export class GitlabEventScheduler {
  private readonly logger = new Logger(GitlabEventScheduler.name)
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('gitlab-events') private readonly queue: Queue,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async rerunUnprocessed() {
    const since = new Date(Date.now() - 5_000) // 跳过刚入库的 5 秒事件，避免重复
    const items = await this.prisma.webhookEvent.findMany({
      where: { processed: false, createdAt: { lt: since } },
      orderBy: { createdAt: 'asc' },
      take: 50,
      select: { id: true },
    })
    for (const it of items) {
      try {
        await this.queue.add({ eventId: it.id }, { attempts: 3, backoff: { type: 'exponential', delay: 1000 } })
      } catch (e) {
        this.logger.warn(`Requeue webhook event failed: ${it.id} ${e?.message}`)
      }
    }
    if (items.length > 0) this.logger.log(`Requeued ${items.length} unprocessed webhook events`)
  }
}

