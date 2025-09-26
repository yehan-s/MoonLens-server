import { Injectable } from '@nestjs/common';

export interface ReportOptions {
  format?: 'json' | 'markdown' | 'csv';
  title?: string;
}

@Injectable()
export class ReportGenerationService {
  async generate(data: any, opts: ReportOptions = {}) {
    const format = opts.format || 'json';
    if (format === 'json') return JSON.stringify({ title: opts.title || 'Project Report', data }, null, 2);
    if (format === 'markdown') return this.renderMarkdown(opts.title || 'Project Report', data);
    if (format === 'csv') return this.renderCSV(data);
    return JSON.stringify({ title: opts.title || 'Project Report', data }, null, 2);
  }

  private renderMarkdown(title: string, data: any) {
    const lines: string[] = [`# ${title}`, '', '```json', JSON.stringify(data, null, 2), '```'];
    return lines.join('\n');
  }

  private renderCSV(data: any) {
    // 简易 CSV：仅平铺一级键值
    if (!data || typeof data !== 'object') return '';
    const rows: Array<Record<string, any>> = Array.isArray(data) ? data : [data];
    const headers = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
    const csv = [headers.join(',')];
    for (const r of rows) {
      csv.push(headers.map((h) => JSON.stringify(r[h] ?? '')).join(','));
    }
    return csv.join('\n');
  }
}

