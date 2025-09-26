import { Injectable } from '@nestjs/common';
import { MetricsService } from './metrics.service';

/**
 * 性能监控服务
 * - 暴露便捷上报接口：请求耗时、计数、活跃会话等
 * - 可扩展自定义业务指标
 */
@Injectable()
export class PerformanceMonitoringService {
  constructor(private readonly metrics: MetricsService) {}

  startHttpTimer(labels: { method: string; route: string }) {
    const end = this.metrics.httpDuration.startTimer(labels as any);
    return (status: number) => {
      try {
        this.metrics.httpRequestsTotal.inc({ ...labels, status_code: String(status) } as any, 1);
      } finally {
        end({ status_code: String(status) } as any);
      }
    };
  }

  setActiveSessions(n: number) {
    this.metrics.activeSessions.set(n);
  }
}

