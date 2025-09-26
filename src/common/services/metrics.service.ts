import { Injectable } from '@nestjs/common';
import { collectDefaultMetrics, register, Histogram, Counter, Gauge } from 'prom-client';

// 避免在同一进程内重复注册默认指标（热重载或多次实例化场景）
let defaultMetricsRegistered = false;

@Injectable()
export class MetricsService {
  readonly httpDuration: Histogram;
  readonly httpRequestsTotal: Counter;
  readonly activeSessions: Gauge;

  constructor() {
    if (!defaultMetricsRegistered) {
      collectDefaultMetrics();
      defaultMetricsRegistered = true;
    }

    this.httpDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP 请求耗时（秒）',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.05, 0.1, 0.2, 0.5, 1, 2, 5],
    });

    this.httpRequestsTotal = new Counter({
      name: 'http_requests_total',
      help: 'HTTP 请求总数',
      labelNames: ['method', 'route', 'status_code'],
    });

    this.activeSessions = new Gauge({
      name: 'active_sessions',
      help: '活跃会话数',
    });
  }

  async metrics(): Promise<string> {
    return register.metrics();
  }
}
