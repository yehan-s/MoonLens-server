import { Controller, Get, Post, Query, HttpCode, HttpStatus, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard'
import { QueueService } from './queue.service'

@ApiTags('Queue')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('queue')
export class QueueController {
  constructor(private readonly queue: QueueService) {}

  @Get('status')
  @ApiOperation({ summary: '获取队列状态（analysis 或 dead-letter）' })
  @ApiQuery({ name: 'name', required: false, description: 'analysis|dead-letter', schema: { default: 'analysis' } })
  async status(@Query('name') name: 'analysis'|'dead-letter' = 'analysis') {
    return this.queue.getQueueStatus(name)
  }

  @Post('retry-failed')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: '重试失败任务' })
  @ApiQuery({ name: 'name', required: false, description: 'analysis|dead-letter', schema: { default: 'analysis' } })
  async retry(@Query('name') name: 'analysis'|'dead-letter' = 'analysis') {
    const count = await this.queue.retryFailedJobs(name)
    return { retried: count }
  }
}

