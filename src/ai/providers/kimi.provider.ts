import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '@nestjs/config';

export interface KimiConfig {
  apiKey: string;
  apiUrl?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface CodeAnalysisRequest {
  code: string;
  filePath: string;
  language?: string;
  context?: string;
  rules?: string[];
}

export interface CodeIssue {
  severity: 'error' | 'warning' | 'info';
  file: string;
  line: number;
  column?: number;
  message: string;
  rule?: string;
  suggestion?: string;
  code?: string;
  codeExample?: {
    before: string;
    after: string;
  };
}

export interface AnalysisResult {
  summary: string;
  score: number;
  issues: CodeIssue[];
  suggestions: string[];
  timestamp: string;
}

@Injectable()
export class KimiProvider {
  private readonly logger = new Logger(KimiProvider.name);
  private readonly defaultApiUrl = 'https://api.moonshot.cn/v1';
  private readonly defaultModel = 'kimi-k2-0905-preview';

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * 分析代码并返回审查结果
   */
  async analyzeCode(
    request: CodeAnalysisRequest,
    config: KimiConfig,
  ): Promise<AnalysisResult> {
    try {
      const apiUrl = config.apiUrl || this.defaultApiUrl;
      const model = config.model || this.defaultModel;
      const maxTokens = config.maxTokens || 4000;
      const temperature = config.temperature || 0.7;

      // 构建提示词
      const prompt = this.buildPrompt(request);

      // 调用Kimi API
      const response = await firstValueFrom(
        this.httpService.post(
          `${apiUrl}/chat/completions`,
          {
            model,
            messages: [
              {
                role: 'system',
                content: '你是一个专业的代码审查专家。请分析代码并提供详细的审查报告。',
              },
              {
                role: 'user',
                content: prompt,
              },
            ],
            max_tokens: maxTokens,
            temperature,
          },
          {
            headers: {
              'Authorization': `Bearer ${config.apiKey}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      // 解析响应
      const aiResponse = response.data.choices[0].message.content;
      return this.parseAIResponse(aiResponse, request.filePath);
    } catch (error) {
      this.logger.error('Kimi API调用失败:', error);
      throw new Error(`AI分析失败: ${error.message}`);
    }
  }

  /**
   * 构建分析提示词
   */
  private buildPrompt(request: CodeAnalysisRequest): string {
    const parts = [
      `请分析以下${request.language || ''}代码：`,
      `文件路径：${request.filePath}`,
      '',
      '```' + (request.language || ''),
      request.code,
      '```',
      '',
    ];

    if (request.context) {
      parts.push(`上下文信息：${request.context}`, '');
    }

    if (request.rules && request.rules.length > 0) {
      parts.push('请特别注意以下规则：');
      request.rules.forEach(rule => parts.push(`- ${rule}`));
      parts.push('');
    }

    parts.push(
      '请提供以下内容的JSON格式响应：',
      '1. summary: 总体评价摘要',
      '2. score: 代码质量评分（0-100）',
      '3. issues: 发现的问题列表，每个问题包含：',
      '   - severity: 严重程度（error/warning/info）',
      '   - line: 行号',
      '   - message: 问题描述',
      '   - suggestion: 修复建议',
      '   - codeExample: (可选)代码示例对象，包含before和after两个字段',
      '     * before: 修改前的代码示例',
      '     * after: 修改后的代码示例',
      '4. suggestions: 改进建议列表',
      '',
      '注意：对于重要问题(error/warning)，请尽量提供codeExample，帮助开发者理解如何修复。',
    );

    return parts.join('\n');
  }

  /**
   * 解析AI响应
   */
  private parseAIResponse(response: string, filePath: string): AnalysisResult {
    try {
      // 尝试提取JSON内容
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        
        // 确保issues中的每个项都有file字段
        if (parsed.issues && Array.isArray(parsed.issues)) {
          parsed.issues = parsed.issues.map((issue: any) => ({
            ...issue,
            file: issue.file || filePath,
          }));
        }

        return {
          summary: parsed.summary || '代码分析完成',
          score: parsed.score || 75,
          issues: parsed.issues || [],
          suggestions: parsed.suggestions || [],
          timestamp: new Date().toISOString(),
        };
      }

      // 如果无法解析JSON，返回默认结构
      return this.createDefaultResponse(response, filePath);
    } catch (error) {
      this.logger.warn('解析AI响应失败，使用默认格式:', error);
      return this.createDefaultResponse(response, filePath);
    }
  }

  /**
   * 创建默认响应格式
   */
  private createDefaultResponse(content: string, filePath: string): AnalysisResult {
    // 简单的文本解析逻辑
    const lines = content.split('\n').filter(line => line.trim());
    const issues: CodeIssue[] = [];
    const suggestions: string[] = [];

    lines.forEach(line => {
      if (line.includes('错误') || line.includes('Error')) {
        issues.push({
          severity: 'error',
          file: filePath,
          line: 1,
          message: line,
        });
      } else if (line.includes('警告') || line.includes('Warning')) {
        issues.push({
          severity: 'warning',
          file: filePath,
          line: 1,
          message: line,
        });
      } else if (line.includes('建议') || line.includes('Suggestion')) {
        suggestions.push(line);
      }
    });

    return {
      summary: lines[0] || '代码已分析',
      score: 75,
      issues,
      suggestions: suggestions.length > 0 ? suggestions : ['代码质量尚可，建议定期review'],
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 验证API配置
   */
  async validateConfig(config: KimiConfig): Promise<boolean> {
    try {
      const apiUrl = config.apiUrl || this.defaultApiUrl;
      
      // 简单的模型列表请求来验证API key
      const response = await firstValueFrom(
        this.httpService.get(`${apiUrl}/models`, {
          headers: {
            'Authorization': `Bearer ${config.apiKey}`,
          },
        }),
      );

      return response.status === 200;
    } catch (error) {
      this.logger.error('验证Kimi配置失败:', error);
      return false;
    }
  }
}