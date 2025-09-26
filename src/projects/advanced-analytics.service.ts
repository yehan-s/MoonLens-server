import { Injectable } from '@nestjs/common';

/**
 * 高级统计分析（示例实现）
 * - 趋势预测：简单移动平均
 * - 异常检测：基于标准差阈值
 * - 对比分析：对比两个时间段指标
 */
@Injectable()
export class AdvancedAnalyticsService {
  forecast(values: number[], window = 3): number[] {
    const out: number[] = [];
    for (let i = 0; i < values.length; i++) {
      const start = Math.max(0, i - window + 1);
      const slice = values.slice(start, i + 1);
      const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
      out.push(avg);
    }
    return out;
  }

  detectAnomaly(values: number[], threshold = 3): boolean[] {
    const mean = values.reduce((a, b) => a + b, 0) / (values.length || 1);
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length || 1);
    const sd = Math.sqrt(variance);
    return values.map((v) => (sd === 0 ? false : Math.abs(v - mean) / sd > threshold));
  }

  compareSeries(a: number[], b: number[]) {
    const len = Math.max(a.length, b.length);
    const pad = (arr: number[]) => Array.from({ length: len }, (_, i) => (typeof arr[i] === 'number' ? arr[i] : 0));
    const aa = pad(a);
    const bb = pad(b);
    const diff = aa.map((v, i) => v - bb[i]);
    const sum = (arr: number[]) => arr.reduce((x, y) => x + y, 0);
    return { sumA: sum(aa), sumB: sum(bb), diff, delta: sum(diff) };
  }
}

