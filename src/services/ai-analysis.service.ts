import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';
import { MetricsService } from '../common/services/metrics.service';
import { AiProviderFactory } from './ai/ai-provider.factory';

interface CodeAnalysisRequest {
  files: Array<{
    path: string;
    language: string;
    content: string; // 仅传递必要的代码片段
    changes?: string; // diff 内容
  }>;
  context: {
    projectType?: string;
    framework?: string;
    targetBranch?: string;
    sourceBranch?: string;
  };
  rules?: string[]; // 自定义规则
}

interface CodeIssue {
  file: string;
  line: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  type: string;
  message: string;
  suggestion: string;
  rule?: string;
  confidence?: number;
}

interface AnalysisResponse {
  issues: CodeIssue[];
  metrics: {
    complexity?: number;
    maintainability?: number;
    coverage?: number;
    duplications?: number;
  };
  summary: string;
}

@Injectable()
export class AiAnalysisService {
  private readonly logger = new Logger(AiAnalysisService.name);
  private readonly maxTokensPerRequest = 4000;
  private readonly maxRetries = 3;
  private analysisCache = new Map<string, AnalysisResponse>();

  constructor(
    private configService: ConfigService,
    private httpService: HttpService,
    private metrics: MetricsService,
    private providerFactory: AiProviderFactory,
  ) {}

  /**
   * 执行 AI 代码分析
   */
  async analyzeCode(request: CodeAnalysisRequest): Promise<AnalysisResponse> {
    try {
      // 生成缓存键
      const cacheKey = this.generateCacheKey(request);
      
      // 检查缓存
      if (this.analysisCache.has(cacheKey)) {
        this.logger.log('Returning cached analysis result');
        return this.analysisCache.get(cacheKey)!;
      }

      // 批处理大文件
      const batches = this.createBatches(request.files);
      const allIssues: CodeIssue[] = [];
      
      for (const batch of batches) {
        const batchRequest = { ...request, files: batch };
        const prompt = this.buildAnalysisPrompt(batchRequest);
        // 根据配置调度 Provider
        const provider = this.providerFactory.get();
        const started = Date.now();
        let content = '';
        try {
          content = await provider.generate(prompt, { model: this.configService.get<string>('AI_MODEL') || undefined, temperature: 0.3 });
          try { this.metrics.aiCallDurationMs.observe({ provider: provider.name, model: this.configService.get<string>('AI_MODEL') || 'unknown', status: 'ok' } as any, Date.now() - started); } catch {}
        } catch (e: any) {
          try { this.metrics.aiCallDurationMs.observe({ provider: provider.name, model: this.configService.get<string>('AI_MODEL') || 'unknown', status: 'error' } as any, 0); } catch {}
          throw e;
        }
        // 解析响应
        const parsed = this.parseAiResponse({ choices: [{ message: { content } }] });
        allIssues.push(...parsed.issues);
      }

      // 聚合结果
      const result: AnalysisResponse = {
        issues: this.deduplicateIssues(allIssues),
        metrics: this.calculateMetrics(allIssues),
        summary: this.generateSummary(allIssues),
      };

      // 缓存结果（1小时）
      this.analysisCache.set(cacheKey, result);
      setTimeout(() => this.analysisCache.delete(cacheKey), 3600000);

      return result;
    } catch (error) {
      this.logger.error('AI analysis failed:', error);
      throw error;
    }
  }

  /**
   * 构建分析提示词
   */
  private buildAnalysisPrompt(request: CodeAnalysisRequest): string {
    const contextInfo = request.context
      ? `项目类型: ${request.context.projectType || '未知'}
框架: ${request.context.framework || '未知'}
目标分支: ${request.context.targetBranch || 'main'}`
      : '';

    const rulesInfo = request.rules?.length
      ? `请特别关注以下规则:\n${request.rules.join('\n')}`
      : '';

    const prompt = `你是一个专业的代码审查专家。请分析以下代码变更，识别潜在问题并提供改进建议。

${contextInfo}

${rulesInfo}

请分析以下文件的代码质量问题：
1. 安全漏洞（SQL注入、XSS、敏感信息泄露等）
2. 性能问题（N+1查询、内存泄漏、低效算法等）
3. 代码异味（重复代码、过长函数、复杂度过高等）
4. 最佳实践违规
5. 潜在的运行时错误

对于每个问题，请提供：
- 严重程度（critical/high/medium/low/info）
- 问题类型
- 具体位置（文件、行号）
- 问题描述
- 修复建议

文件内容：
${this.formatFilesForPrompt(request.files)}

请以JSON格式返回分析结果，格式如下：
{
  "issues": [
    {
      "file": "文件路径",
      "line": 行号,
      "severity": "严重程度",
      "type": "问题类型",
      "message": "问题描述",
      "suggestion": "修复建议"
    }
  ],
  "summary": "总体评价"
}`;

    return prompt;
  }

  /**
   * 格式化文件内容用于提示词
   */
  private formatFilesForPrompt(files: CodeAnalysisRequest['files']): string {
    return files
      .map(file => {
        // 限制每个文件的内容长度
        const content = this.truncateContent(file.content, 1000);
        return `
文件: ${file.path}
语言: ${file.language}
${file.changes ? '变更内容:\n' + file.changes : '内容:\n' + content}
`;
      })
      .join('\n---\n');
  }

  /**
   * 调用 AI API
   */
  private async callAiApi(prompt: string): Promise<any> {
    const apiKey = this.configService.get<string>('AI_API_KEY');
    const apiUrl = this.configService.get<string>('AI_API_URL', 'https://api.openai.com/v1/chat/completions');
    const model = this.configService.get<string>('AI_MODEL', 'gpt-4');
    const provider = this.configService.get<string>('AI_PROVIDER', 'openai');

    let retries = 0;
    while (retries < this.maxRetries) {
      try {
        const started = Date.now();
        const response = await firstValueFrom(
          this.httpService.post(
            apiUrl,
            {
              model,
              messages: [
                {
                  role: 'system',
                  content: '你是一个专业的代码审查专家，专注于代码质量和安全性分析。',
                },
                {
                  role: 'user',
                  content: prompt,
                },
              ],
              temperature: 0.3,
              max_tokens: 2000,
              response_format: { type: 'json_object' },
            },
            {
              headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
              },
              timeout: 30000,
            },
          ),
        );

        const data = (response as any).data;
        try { this.metrics.aiCallDurationMs.observe({ provider, model, status: 'ok' } as any, Date.now() - started); } catch {}
        return data;
      } catch (error: any) {
        retries++;
        this.logger.warn(`AI API call failed (attempt ${retries}/${this.maxRetries}):`, error.message);
        try { this.metrics.aiCallDurationMs.observe({ provider, model, status: 'error' } as any, 0); } catch {}
        
        if (retries >= this.maxRetries) {
          throw new Error(`AI API call failed after ${this.maxRetries} attempts`);
        }
        
        // 指数退避
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, retries) * 1000));
      }
    }
  }

  /**
   * 解析 AI 响应
   */
  private parseAiResponse(response: any): AnalysisResponse {
    try {
      const content = response?.choices?.[0]?.message?.content || response?.content || '';
      const parsed = typeof content === 'string' ? JSON.parse(content) : content;
      
      // 验证和标准化响应
      return {
        issues: (parsed.issues || []).map((issue: any) => ({
          file: issue.file || 'unknown',
          line: parseInt(issue.line) || 1,
          column: issue.column ? parseInt(issue.column) : undefined,
          severity: this.normalizeSeverity(issue.severity),
          type: issue.type || 'unknown',
          message: issue.message || '',
          suggestion: issue.suggestion || '',
          rule: issue.rule,
          confidence: issue.confidence,
        })),
        metrics: parsed.metrics || {},
        summary: parsed.summary || '',
      };
    } catch (error) {
      this.logger.error('Failed to parse AI response:', error);
      return {
        issues: [],
        metrics: {},
        summary: 'Analysis failed',
      };
    }
  }

  /**
   * 标准化严重程度
   */
  private normalizeSeverity(severity: string): CodeIssue['severity'] {
    const normalized = severity?.toLowerCase();
    switch (normalized) {
      case 'critical':
      case 'error':
        return 'critical';
      case 'high':
      case 'warning':
        return 'high';
      case 'medium':
        return 'medium';
      case 'low':
      case 'minor':
        return 'low';
      default:
        return 'info';
    }
  }

  /**
   * 创建批次以避免令牌限制
   */
  private createBatches(files: CodeAnalysisRequest['files']): CodeAnalysisRequest['files'][] {
    const batches: CodeAnalysisRequest['files'][] = [];
    let currentBatch: CodeAnalysisRequest['files'] = [];
    let currentTokens = 0;

    for (const file of files) {
      const fileTokens = this.estimateTokens(file.content);
      
      if (currentTokens + fileTokens > this.maxTokensPerRequest) {
        if (currentBatch.length > 0) {
          batches.push(currentBatch);
          currentBatch = [];
          currentTokens = 0;
        }
      }
      
      currentBatch.push(file);
      currentTokens += fileTokens;
    }

    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    return batches;
  }

  /**
   * 估算令牌数
   */
  private estimateTokens(text: string): number {
    // 简单估算：平均每个令牌约4个字符
    return Math.ceil(text.length / 4);
  }

  /**
   * 截断内容
   */
  private truncateContent(content: string, maxChars: number): string {
    if (content.length <= maxChars) {
      return content;
    }
    return content.substring(0, maxChars) + '\n... (内容已截断)';
  }

  /**
   * 生成缓存键
   */
  private generateCacheKey(request: CodeAnalysisRequest): string {
    const hash = crypto.createHash('md5');
    hash.update(JSON.stringify({
      files: request.files.map(f => ({
        path: f.path,
        content: f.content.substring(0, 100), // 仅使用前100字符
      })),
      context: request.context,
      rules: request.rules,
    }));
    return hash.digest('hex');
  }

  /**
   * 去重问题
   */
  private deduplicateIssues(issues: CodeIssue[]): CodeIssue[] {
    const seen = new Set<string>();
    return issues.filter(issue => {
      const key = `${issue.file}:${issue.line}:${issue.message}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * 计算指标
   */
  private calculateMetrics(issues: CodeIssue[]): AnalysisResponse['metrics'] {
    const severityCounts = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    };

    issues.forEach(issue => {
      severityCounts[issue.severity]++;
    });

    // 计算质量分数（0-100）
    const qualityScore = Math.max(
      0,
      100 - 
      severityCounts.critical * 20 -
      severityCounts.high * 10 -
      severityCounts.medium * 5 -
      severityCounts.low * 2 -
      severityCounts.info * 1
    );

    return {
      complexity: Math.round(qualityScore / 10),
      maintainability: qualityScore,
    };
  }

  /**
   * 生成摘要
   */
  private generateSummary(issues: CodeIssue[]): string {
    const severityCounts = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    };

    issues.forEach(issue => {
      severityCounts[issue.severity]++;
    });

    const parts: string[] = [];
    if (severityCounts.critical > 0) {
      parts.push(`${severityCounts.critical} 个严重问题`);
    }
    if (severityCounts.high > 0) {
      parts.push(`${severityCounts.high} 个高优先级问题`);
    }
    if (severityCounts.medium > 0) {
      parts.push(`${severityCounts.medium} 个中等问题`);
    }

    if (parts.length === 0) {
      return '代码质量良好，未发现重大问题';
    }

    return `发现 ${parts.join('、')}，建议优先修复`;
  }
}
