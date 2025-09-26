import { Controller, Get, Header } from '@nestjs/common';
import { PrismaService } from '../common/services/prisma.service';
import { MetricsService } from '../common/services/metrics.service';

@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metricsService: MetricsService,
  ) {}

  @Get('health')
  async health() {
    // 数据库健康检查
    let db = 'down';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = 'up';
    } catch (e) {
      db = 'down';
    }

    return {
      status: db === 'up' ? 'ok' : 'degraded',
      checks: {
        database: db,
      },
      uptime: process.uptime(),
      timestamp: Date.now(),
    };
  }

  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async metrics() {
    return await this.metricsService.metrics();
  }
}

