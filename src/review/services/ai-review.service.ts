import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { GitlabService } from '../../gitlab/gitlab.service';
import { CommentFormatterService } from './comment-formatter.service';
import { FileCacheService } from './file-cache.service';
import { createHash } from 'crypto';

export interface CodeIssue {
  id: string;
  type: 'security' | 'performance' | 'quality' | 'style' | 'bug';
  severity: 'error' | 'warning' | 'info';
  title: string;
  description: string;
  file: string;
  line: number;
  column?: number;
  suggestion?: string;
  code?: string;
  // 新增：代码示例（Before/After）
  codeExample?: {
    before: string;  // 修改前的代码
    after: string;   // 修改后的代码
    language?: string; // 代码语言
  };
}

export interface AIReviewResult {
  summary: {
    title: string;
    description: string;
    severity: 'success' | 'warning' | 'error' | 'info';
  };
  issues: CodeIssue[];
  score: number;
  metrics: {
    security: number;
    performance: number;
    maintainability: number;
    reliability: number;
  };
  suggestions: string[];
  // 新增：缓存信息
  fromCache?: boolean;
  cacheAge?: number;  // 缓存年龄（毫秒）
  hitCount?: number;  // 缓存命中次数
}

export interface FileReviewRequest {
  filePath: string;
  fileHash?: string;  // Git blob SHA
  diff: string;
  projectId: string;
  mrId: string;
  rules?: string[];
}

@Injectable()
export class AIReviewService {
  private readonly logger = new Logger(AIReviewService.name);
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly cacheEnabled: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly gitlabService: GitlabService,
    private readonly commentFormatter: CommentFormatterService,
    private readonly fileCacheService: FileCacheService,
  ) {
    this.apiUrl = this.configService.get<string>('MOONSHOT_API_URL', 'https://api.moonshot.cn/v1');
    this.apiKey = this.configService.get<string>('MOONSHOT_API_KEY', '');
    this.cacheEnabled = this.configService.get<boolean>('AI_REVIEW_CACHE_ENABLED', true);
  }

  /**
   * 分析代码差异并生成审查报告（支持缓存）
   */
  async reviewMergeRequest(
    projectId: string,
    mrId: string,
    diffs: any[],
    rules?: string[],
    forceRefresh = false,
  ): Promise<AIReviewResult> {
    try {
      const startTime = Date.now();

      // 如果启用缓存，批量查询
      if (this.cacheEnabled && !forceRefresh) {
        const cachedResult = await this.reviewWithCache(projectId, mrId, diffs, rules);
        if (cachedResult) {
          this.logger.log(`⚡ 使用缓存结果完成审查，耗时${Date.now() - startTime}ms`);
          return cachedResult;
        }
      }

      // 准备代码内容
      const codeContext = this.prepareDiffsForReview(diffs);

      // 如果没有配置 API Key，返回模拟结果
      if (!this.apiKey) {
        return this.generateMockReview(diffs);
      }

      // 调用 AI API
      const prompt = this.buildReviewPrompt(codeContext);
      const aiResponse = await this.callAIAPI(prompt);

      // 解析 AI 响应
      const result = this.parseAIResponse(aiResponse, diffs);

      // 异步保存到缓存（不阻塞返回）
      if (this.cacheEnabled) {
        this.saveToCacheAsync(projectId, mrId, diffs, result, rules).catch(err =>
          this.logger.error(`保存缓存失败: ${err.message}`)
        );
      }

      this.logger.log(`✨ AI审查完成，耗时${Date.now() - startTime}ms`);
      return { ...result, fromCache: false };
    } catch (error) {
      console.error('AI review failed:', error);
      // 失败时返回基础分析结果
      return this.generateBasicReview(diffs);
    }
  }

  /**
   * 使用缓存进行审查（文件级缓存）
   */
  private async reviewWithCache(
    projectId: string,
    mrId: string,
    diffs: any[],
    rules?: string[],
  ): Promise<AIReviewResult | null> {
    try {
      // 提取文件hash信息
      const fileInfos = diffs.map(diff => ({
        fileHash: this.extractFileHash(diff),
        filePath: diff.new_path || diff.old_path,
        projectId,
      }));

      // 批量查询缓存
      const cachedFiles = await this.fileCacheService.batchGetCached(fileInfos, rules);

      if (cachedFiles.size === 0) {
        this.logger.debug('无缓存命中，执行完整审查');
        return null;
      }

      this.logger.log(`🎯 缓存命中 ${cachedFiles.size}/${diffs.length} 个文件`);

      // 如果全部命中，合并结果
      if (cachedFiles.size === diffs.length) {
        return this.mergeCachedResults(Array.from(cachedFiles.values()));
      }

      // 部分命中：暂不支持混合模式，返回null触发完整审查
      this.logger.debug('部分缓存命中，执行完整审查以保证一致性');
      return null;
    } catch (error) {
      this.logger.error(`缓存查询失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 异步保存到缓存
   */
  private async saveToCacheAsync(
    projectId: string,
    mrId: string,
    diffs: any[],
    result: AIReviewResult,
    rules?: string[],
  ): Promise<void> {
    try {
      // 为每个文件保存缓存
      const savePromises = diffs.map(async (diff) => {
        const fileHash = this.extractFileHash(diff);
        const filePath = diff.new_path || diff.old_path;

        // 提取该文件的问题
        const fileIssues = result.issues.filter(issue => issue.file === filePath);

        const fileReviewData = {
          score: result.score,
          issues: fileIssues,
          suggestions: result.suggestions.filter(s => s.includes(filePath)),
          summary: result.summary,
          metrics: result.metrics,
        };

        await this.fileCacheService.saveCacheEntry(
          fileHash,
          filePath,
          projectId,
          fileReviewData,
          'kimi',  // TODO: 从配置读取
          'kimi-k2-0905-preview',
          rules,
        );
      });

      await Promise.all(savePromises);
      this.logger.log(`💾 已缓存${diffs.length}个文件的审查结果`);
    } catch (error) {
      this.logger.error(`异步保存缓存失败: ${error.message}`);
    }
  }

  /**
   * 合并缓存的文件结果
   */
  private mergeCachedResults(cachedEntries: any[]): AIReviewResult {
    const allIssues: CodeIssue[] = [];
    const allSuggestions = new Set<string>();
    let totalScore = 0;
    let totalHits = 0;
    let oldestCacheTime = Date.now();

    for (const entry of cachedEntries) {
      const data = entry.reviewData;

      // 合并问题
      if (data.issues) {
        allIssues.push(...data.issues);
      }

      // 合并建议
      if (data.suggestions) {
        data.suggestions.forEach((s: string) => allSuggestions.add(s));
      }

      // 累加分数
      totalScore += data.score || 0;
      totalHits += entry.hitCount;

      // 记录最老的缓存时间
      const cacheTime = new Date(entry.createdAt).getTime();
      if (cacheTime < oldestCacheTime) {
        oldestCacheTime = cacheTime;
      }
    }

    const avgScore = Math.round(totalScore / cachedEntries.length);
    const cacheAge = Date.now() - oldestCacheTime;

    return {
      summary: {
        title: `代码审查完成（缓存） - 发现 ${allIssues.length} 个问题`,
        description: `基于缓存的审查结果，共${cachedEntries.length}个文件`,
        severity: allIssues.some(i => i.severity === 'error') ? 'error' :
                  allIssues.some(i => i.severity === 'warning') ? 'warning' : 'success',
      },
      issues: allIssues,
      score: avgScore,
      metrics: cachedEntries[0]?.reviewData?.metrics || this.getDefaultMetrics(),
      suggestions: Array.from(allSuggestions),
      fromCache: true,
      cacheAge,
      hitCount: totalHits,
    };
  }

  /**
   * 提取文件hash（Git blob SHA）
   */
  private extractFileHash(diff: any): string {
    // 优先使用Git blob SHA
    if (diff.blob_id) {
      return diff.blob_id;
    }

    // 如果没有blob_id，尝试从diff header提取
    if (diff.diff) {
      const match = diff.diff.match(/index ([a-f0-9]+)\.\./);
      if (match) {
        return match[1];
      }
    }

    // 降级方案：使用内容hash
    const content = diff.diff || '';
    return this.fileCacheService.calculateFileHash(content);
  }

  /**
   * 准备差异内容用于审查
   */
  private prepareDiffsForReview(diffs: any[]): string {
    return diffs.map(diff => {
      const path = diff.new_path || diff.old_path;
      const content = diff.diff || '';
      return `File: ${path}\n${content}\n`;
    }).join('\n---\n');
  }

  /**
   * 构建审查提示词
   */
  private buildReviewPrompt(codeContext: string): string {
    return `Review these code changes (git diff format). Focus ONLY on modified/added lines.

Detect and report:
1. Bugs (null/undefined, async/await, resource leaks, race conditions)
2. Security (injection, XSS, insecure crypto, credential leaks)
3. Performance (N+1, blocking I/O in loops, memory leaks)
4. Breaking changes (API incompatibility, removed exports)
5. TypeScript correctness (any usage, missing types)

STRICT OUTPUT REQUIREMENTS:
1) Every issue MUST include a codeExample with both before and after. If you cannot propose a concrete code change, SKIP that issue.
2) codeExample.before MUST be an exact snippet from the diff.
3) codeExample.after MUST be a ready-to-apply replacement (no comments/explanations inside the code block), 1-10 lines.
4) Keep after minimal and complete (valid syntax). Prefer single-line replacements when possible.
5) Do NOT include backticks or markdown in JSON values.

${codeContext}

Return valid JSON only (no markdown wrapping):
{
  "summary": {
    "title": "Brief assessment (1 line)",
    "description": "Key findings summary",
    "severity": "success|warning|error|info"
  },
  "issues": [
    {
      "id": "unique-id",
      "type": "bug|security|performance|quality|style",
      "severity": "error|warning|info",
      "title": "Issue title",
      "description": "Why this matters",
      "file": "path/from/diff",
      "line": 123,
      "suggestion": "How to fix it (brief text)",
      "codeExample": {
        "before": "// Original problematic code\\nconst x = null;\\nif (x.value) { ... }",
        "after": "const x = data?.x;\\nif (x) { doSomething(x) }",
        "language": "typescript"
      }
    }
  ],
  "score": 0-100,
  "metrics": {
    "security": 0-100,
    "performance": 0-100,
    "maintainability": 0-100,
    "reliability": 0-100
  },
  "suggestions": ["Specific actionable advice with examples", "Not generic platitudes"]
}

REMEMBER: Every issue MUST have a codeExample with before/after (no prose-only issues).`;
  }

  /**
   * 调用 AI API
   */
  private async callAIAPI(prompt: string): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.apiUrl}/chat/completions`,
          {
            model: 'kimi-k2-0905-preview',
            messages: [
              {
                role: 'system',
                content: 'You are an experienced developer and code reviewer. Analyze code thoroughly and provide constructive feedback with clear explanations.',
              },
              {
                role: 'user',
                content: prompt,
              },
            ],
            temperature: 0.3,
            max_tokens: 2000,
          },
          {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      return response.data.choices[0].message.content;
    } catch (error) {
      console.error('AI API call failed:', error);
      throw error;
    }
  }

  /**
   * 解析 AI 响应
   */
  private parseAIResponse(aiResponse: string, diffs: any[]): AIReviewResult {
    try {
      // 尝试解析 JSON 响应
      const parsed = JSON.parse(aiResponse);

      // 为每个issue补充codeExample（如果AI没返回）
      const issues = (parsed.issues || []).map(issue => {
        if (!issue.codeExample) {
          const generated = this.generateCodeExample(issue);
          this.logger.log(`生成代码示例 for issue "${issue.title}": before=${generated.before?.substring(0, 50)}, after=${generated.after?.substring(0, 50)}`);
          issue.codeExample = generated;
        } else {
          this.logger.log(`AI已返回codeExample for issue "${issue.title}"`);
        }
        return issue;
      });

      return {
        summary: parsed.summary || this.getDefaultSummary(),
        issues,
        score: parsed.score || 75,
        metrics: parsed.metrics || this.getDefaultMetrics(),
        suggestions: parsed.suggestions || [],
      };
    } catch (error) {
      // 如果解析失败，返回基础结果
      return this.generateBasicReview(diffs);
    }
  }

  /**
   * 根据问题描述生成代码示例
   */
  private generateCodeExample(issue: any): { before: string; after: string; language?: string } {
    const language = this.detectLanguage(issue.file);
    const title = issue.title || '';
    const description = issue.description || '';
    const suggestion = issue.suggestion || '';

    // 合并所有文本用于分析
    const fullText = `${title} ${description} ${suggestion}`.toLowerCase();

    // 尝试从suggestion中提取代码片段（反引号包裹的内容）
    const codeMatches = suggestion.match(/```(\w+)?\n([\s\S]*?)```/g) ||
                       suggestion.match(/`([^`]+)`/g);

    let beforeCode = '';
    let afterCode = '';

    if (codeMatches && codeMatches.length >= 2) {
      // 有多个代码块，假设第一个是before，第二个是after
      beforeCode = codeMatches[0].replace(/```\w*\n?|`/g, '').trim();
      afterCode = codeMatches[1].replace(/```\w*\n?|`/g, '').trim();
    } else if (codeMatches && codeMatches.length === 1) {
      // 只有一个代码块，作为after，生成before
      afterCode = codeMatches[0].replace(/```\w*\n?|`/g, '').trim();
      beforeCode = this.inferBeforeCode(fullText, afterCode);
    } else {
      // 没有代码块，基于问题类型生成示例
      const example = this.generateExampleByPattern(fullText, language);
      beforeCode = example.before;
      afterCode = example.after;
    }

    return {
      before: beforeCode || `// ${title}\n// ${description}`,
      after: afterCode || `// 修复建议:\n// ${suggestion}`,
      language
    };
  }

  /**
   * 根据after代码推断before代码
   */
  private inferBeforeCode(fullText: string, afterCode: string): string {
    // 简单的before推断逻辑
    if (fullText.includes('空格') && afterCode.includes(' ')) {
      return afterCode.replace(/ /g, '');
    }
    if (fullText.includes('类型') && afterCode.includes('javascript')) {
      return '```\n' + afterCode.replace('```javascript', '```').replace(/```\w*/, '```');
    }
    return `// 修改前的代码\n${afterCode.split('\n')[0]}`;
  }

  /**
   * 基于问题模式生成代码示例
   */
  private generateExampleByPattern(fullText: string, language: string): { before: string; after: string } {
    // HTML/JSX: <img> 缺少 alt 属性
    if ((fullText.includes('img') && fullText.includes('alt')) || /img\s*标签|alt\s*属性/.test(fullText)) {
      // 生成一个可直接应用的一行替换示例
      // 使用通用占位，避免依赖具体变量名；用户可在 MR 中二次调整
      if (language === 'typescript' || language === 'javascript' || language === 'vue') {
        return {
          before: `<img src={avatar} />`,
          after: `<img src={avatar} alt={name ? name + '头像' : '头像'} />`
        };
      }
      return {
        before: `<img src="avatar.png">`,
        after: `<img src="avatar.png" alt="图片描述">`
      };
    }

    // Markdown相关问题
    if (fullText.includes('空格') && fullText.includes('中文')) {
      return {
        before: 'GitHub webhook配置指南',
        after: 'GitHub webhook 配置指南'
      };
    }

    if (fullText.includes('代码块') && fullText.includes('语言')) {
      return {
        before: '```\nfunction test() {\n  console.log("hello");\n}',
        after: '```javascript\nfunction test() {\n  console.log("hello");\n}'
      };
    }

    if (fullText.includes('日期') || fullText.includes('时间')) {
      return {
        before: '测试时间: 2025-10-02',
        after: '测试时间: 2025-10-03'
      };
    }

    // TypeScript/JavaScript问题
    if (fullText.includes('null') || fullText.includes('undefined')) {
      return {
        before: `const value = data.field;\nif (value) { ... }`,
        after: `const value = data?.field;\nif (value) { ... }`
      };
    }

    if (fullText.includes('console.log')) {
      return {
        before: `console.log('Debug:', data);`,
        after: `logger.debug('Data:', data);`
      };
    }

    if (fullText.includes('async') || fullText.includes('await')) {
      return {
        before: `for (let item of items) {\n  await process(item);\n}`,
        after: `await Promise.all(\n  items.map(item => process(item))\n);`
      };
    }

    // 通用模式
    return {
      before: `// 问题代码\n${fullText.substring(0, 50)}...`,
      after: `// 修复后的代码\n// 请参考建议进行修改`
    };
  }

  /**
   * 根据文件扩展名检测语言
   */
  private detectLanguage(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const langMap: Record<string, string> = {
      'ts': 'typescript',
      'js': 'javascript',
      'tsx': 'typescript',
      'jsx': 'javascript',
      'vue': 'vue',
      'py': 'python',
      'java': 'java',
      'go': 'go',
      'rs': 'rust',
      'md': 'markdown'
    };
    return langMap[ext || ''] || 'text';
  }

  /**
   * 生成模拟审查结果（用于测试）
   */
  private generateMockReview(diffs: any[]): AIReviewResult {
    const issues: CodeIssue[] = [];
    let issueId = 0;

    // 分析每个文件的差异
    diffs.forEach((diff, index) => {
      const filePath = diff.new_path || diff.old_path;
      const diffContent = diff.diff || '';

      // 检查常见问题
      if (diffContent.includes('console.log')) {
        issues.push({
          id: `issue-${++issueId}`,
          type: 'quality',
          severity: 'warning',
          title: '调试代码未移除',
          description: '发现 console.log 语句，建议在生产环境中移除',
          file: filePath,
          line: this.findLineNumber(diffContent, 'console.log'),
          suggestion: '使用适当的日志库，或在生产构建中移除调试语句',
          codeExample: {
            before: `// 调试代码\nconsole.log('Debug:', data);\nprocessData(data);`,
            after: `// 使用日志库\nlogger.debug('Processing data:', data);\nprocessData(data);`,
            language: 'typescript'
          }
        });
      }

      if (diffContent.includes('// TODO') || diffContent.includes('// FIXME')) {
        issues.push({
          id: `issue-${++issueId}`,
          type: 'quality',
          severity: 'info',
          title: '存在待办事项',
          description: '代码中存在 TODO 或 FIXME 注释',
          file: filePath,
          line: this.findLineNumber(diffContent, '// TODO'),
          suggestion: '完成待办事项或创建相应的任务追踪',
          codeExample: {
            before: `// TODO: 添加错误处理\nfunction processData(data) {\n  return data.map(x => x * 2);\n}`,
            after: `// 已添加错误处理\nfunction processData(data) {\n  if (!Array.isArray(data)) {\n    throw new Error('Invalid data');\n  }\n  return data.map(x => x * 2);\n}`,
            language: 'typescript'
          }
        });
      }

      if (diffContent.includes('password') && !diffContent.includes('bcrypt')) {
        issues.push({
          id: `issue-${++issueId}`,
          type: 'security',
          severity: 'error',
          title: '潜在的密码安全问题',
          description: '密码处理可能未使用安全的哈希算法',
          file: filePath,
          line: this.findLineNumber(diffContent, 'password'),
          suggestion: '使用 bcrypt 或其他安全的密码哈希库',
          codeExample: {
            before: `// 不安全：明文或简单hash\nconst hashedPassword = crypto\n  .createHash('md5')\n  .update(password)\n  .digest('hex');`,
            after: `// 安全：使用bcrypt\nimport * as bcrypt from 'bcrypt';\n\nconst saltRounds = 10;\nconst hashedPassword = await bcrypt.hash(\n  password,\n  saltRounds\n);`,
            language: 'typescript'
          }
        });
      }

      if (diffContent.includes('eval(') || diffContent.includes('Function(')) {
        issues.push({
          id: `issue-${++issueId}`,
          type: 'security',
          severity: 'error',
          title: '危险的动态代码执行',
          description: '使用 eval 或 Function 构造函数可能导致安全漏洞',
          file: filePath,
          line: this.findLineNumber(diffContent, 'eval('),
          suggestion: '避免使用 eval，寻找更安全的替代方案',
          codeExample: {
            before: `// 危险：eval执行字符串代码\nconst result = eval(userInput);`,
            after: `// 安全：使用JSON.parse或其他安全方法\ntry {\n  const result = JSON.parse(userInput);\n  // 或使用特定的解析库\n} catch (error) {\n  console.error('Invalid input');\n}`,
            language: 'typescript'
          }
        });
      }

      // 检查性能问题
      if (diffContent.includes('for') && diffContent.includes('await')) {
        issues.push({
          id: `issue-${++issueId}`,
          type: 'performance',
          severity: 'warning',
          title: '循环中的异步操作',
          description: '在循环中使用 await 可能导致性能问题',
          file: filePath,
          line: this.findLineNumber(diffContent, 'await'),
          suggestion: '考虑使用 Promise.all() 并行处理',
          codeExample: {
            before: `// 串行执行，慢\nconst results = [];\nfor (const item of items) {\n  const result = await processItem(item);\n  results.push(result);\n}`,
            after: `// 并行执行，快\nconst results = await Promise.all(\n  items.map(item => processItem(item))\n);`,
            language: 'typescript'
          }
        });
      }
    });

    const score = Math.max(100 - issues.length * 10, 40);
    const severity = issues.some(i => i.severity === 'error') ? 'error' :
                    issues.some(i => i.severity === 'warning') ? 'warning' : 'success';

    return {
      summary: {
        title: `代码审查完成 - 发现 ${issues.length} 个问题`,
        description: this.getSummaryDescription(issues),
        severity,
      },
      issues,
      score,
      metrics: {
        security: issues.filter(i => i.type === 'security').length === 0 ? 90 : 60,
        performance: issues.filter(i => i.type === 'performance').length === 0 ? 85 : 70,
        maintainability: Math.max(90 - issues.filter(i => i.type === 'quality').length * 5, 60),
        reliability: Math.max(95 - issues.filter(i => i.type === 'bug').length * 10, 50),
      },
      suggestions: this.generateSuggestions(issues),
    };
  }

  /**
   * 生成基础审查结果
   */
  private generateBasicReview(diffs: any[]): AIReviewResult {
    const fileCount = diffs.length;
    const additions = diffs.reduce((sum, diff) => {
      const adds = (diff.diff?.match(/^\+/gm) || []).length;
      return sum + adds;
    }, 0);
    const deletions = diffs.reduce((sum, diff) => {
      const dels = (diff.diff?.match(/^-/gm) || []).length;
      return sum + dels;
    }, 0);

    return {
      summary: {
        title: '基础代码审查完成',
        description: `分析了 ${fileCount} 个文件，${additions} 行新增，${deletions} 行删除`,
        severity: 'info',
      },
      issues: [],
      score: 75,
      metrics: {
        security: 80,
        performance: 80,
        maintainability: 75,
        reliability: 80,
      },
      suggestions: [
        '建议添加单元测试覆盖新增代码',
        '确保代码符合项目编码规范',
        '考虑代码的可维护性和可扩展性',
      ],
    };
  }

  /**
   * 查找行号
   */
  private findLineNumber(diff: string, pattern: string): number {
    const lines = diff.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(pattern)) {
        // 尝试从差异中提取实际行号
        const match = lines[i].match(/@@ -\d+,\d+ \+(\d+)/);
        if (match) {
          return parseInt(match[1], 10) + i;
        }
        return i + 1;
      }
    }
    return 1;
  }

  /**
   * 生成摘要描述
   */
  private getSummaryDescription(issues: CodeIssue[]): string {
    const errorCount = issues.filter(i => i.severity === 'error').length;
    const warningCount = issues.filter(i => i.severity === 'warning').length;
    const infoCount = issues.filter(i => i.severity === 'info').length;

    const parts: string[] = [];
    if (errorCount > 0) parts.push(`${errorCount} 个严重问题`);
    if (warningCount > 0) parts.push(`${warningCount} 个警告`);
    if (infoCount > 0) parts.push(`${infoCount} 个提示`);

    if (parts.length === 0) {
      return '代码质量良好，未发现明显问题';
    }

    return `发现 ${parts.join('、')}，建议修复后合并`;
  }

  /**
   * 生成建议
   */
  private generateSuggestions(issues: CodeIssue[]): string[] {
    const suggestions: string[] = [];

    if (issues.some(i => i.type === 'security')) {
      suggestions.push('优先修复安全相关问题，避免潜在漏洞');
    }

    if (issues.some(i => i.type === 'performance')) {
      suggestions.push('优化性能相关代码，提升系统响应速度');
    }

    if (issues.some(i => i.type === 'quality')) {
      suggestions.push('改善代码质量，提高可维护性');
    }

    if (issues.length === 0) {
      suggestions.push('代码质量良好，可以考虑添加更多测试');
    }

    suggestions.push('确保所有变更都有对应的测试覆盖');
    suggestions.push('更新相关文档以反映代码变更');

    return suggestions;
  }

  /**
   * 获取默认摘要
   */
  private getDefaultSummary() {
    return {
      title: '代码审查完成',
      description: '已完成代码分析',
      severity: 'info' as const,
    };
  }

  /**
   * 获取默认指标
   */
  private getDefaultMetrics() {
    return {
      security: 75,
      performance: 75,
      maintainability: 75,
      reliability: 75,
    };
  }

  /**
   * 发布审查结果到 GitLab MR（CodeRabbit 风格）
   */
  async publishReviewToMR(
    projectId: string,
    mrIid: string,
    reviewResult: AIReviewResult,
    token?: string,
  ): Promise<void> {
    try {
      this.logger.log(`发布AI审查结果到MR: projectId=${projectId}, mrIid=${mrIid}`);
      
      // 格式化总评评论
      const summaryComment = this.commentFormatter.formatSummaryComment(reviewResult);
      
      // 发布总评
      await this.gitlabService.postMergeRequestNote(
        projectId,
        mrIid,
        summaryComment,
        token,
      );
      
      this.logger.log(`AI审查总评发布成功`);
      
      // 阶段2 - 发布内联评论（限制数量，避免刷屏）
      // 扩大范围到 info，优先级：error > warning > info
      const order = { error: 0, warning: 1, info: 2 } as const;
      const inlineCandidates = (reviewResult.issues || [])
        .slice()
        .sort((a: any, b: any) => (order[a.severity as keyof typeof order] ?? 9) - (order[b.severity as keyof typeof order] ?? 9))
        .slice(0, 30);

      for (const issue of inlineCandidates) {
        await this.publishInlineComment(projectId, mrIid, issue, token);
      }
      
    } catch (error) {
      this.logger.error(`发布AI审查结果失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 发布单个内联评论（阶段2功能）
   */
  private async publishInlineComment(
    projectId: string,
    mrIid: string,
    issue: CodeIssue,
    token?: string,
  ): Promise<void> {
    try {
      // 获取 MR 变更信息以构建 position（需要 diff_refs + changes）
      const mrChanges = await this.gitlabService.getMergeRequestChanges(
        projectId,
        mrIid,
        token,
      );
      
      if (!mrChanges || !mrChanges.diff_refs) {
        this.logger.warn('无法获取MR diff信息，跳过内联评论');
        return;
      }

      const { diff_refs } = mrChanges;
      const changes: any[] = mrChanges.changes || [];

      // 归一化文件路径，去掉行号、反斜杠、前导./
      const norm = (p: string | undefined) => (p || '').replace(/:\d+$/, '').replace(/\\/g, '/').replace(/^\.\//, '');
      const target = norm(issue.file);

      // 匹配文件变更项（多重容错）
      let fileChange = changes.find(c => norm(c.new_path) === target || norm(c.old_path) === target);
      if (!fileChange) fileChange = changes.find(c => norm(c.new_path).endsWith('/' + target) || norm(c.old_path).endsWith('/' + target));
      if (!fileChange) {
        const base = target.split('/').pop() || target;
        fileChange = changes.find(c => (norm(c.new_path).split('/').pop() === base) || (norm(c.old_path).split('/').pop() === base));
      }
      if (!fileChange) {
        this.logger.warn(`未在MR变更中找到文件: ${issue.file}，跳过内联评论`);
        return;
      }

      const newPath = fileChange.new_path || issue.file;

      // 在 diff 中更智能地定位行号：优先使用 issue.line；否则匹配建议代码；否则取hunk起始
      const diffText = fileChange.diff || '';
      let newLine: number | undefined = undefined;
      const pref = Number(issue.line || 0);
      if (pref > 0) {
        // 检查pref是否落在任一hunk中新文件行范围
        const inRange = /@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@[\s\S]*?(?=^@@ |\Z)/gm;
        let m: RegExpExecArray | null;
        while ((m = inRange.exec(diffText)) !== null) {
          const start = parseInt(m[3], 10);
          const len = m[4] ? parseInt(m[4], 10) : 1;
          const end = start + Math.max(1, len) - 1;
          if (pref >= start && pref <= end) { newLine = pref; break; }
        }
      }
      if (!newLine) {
        // 尝试用 after 代码第一行匹配
        const afterLine = (issue.codeExample?.after || '').split('\n').map(s => s.trim()).find(Boolean);
        if (afterLine) {
          // 遍历hunk，推进新文件行计数，匹配去掉前缀后的行内容
          const lines = diffText.split('\n');
          let currNew = 0; let inHunk = false;
          for (const line of lines) {
            const header = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
            if (header) { currNew = parseInt(header[2], 10); inHunk = true; continue; }
            if (!inHunk) continue;
            if (line.startsWith('+') || line.startsWith(' ')) {
              const content = line.substring(1).trimEnd();
              if (content.includes(afterLine)) { newLine = currNew; break; }
              currNew++;
            } else if (line.startsWith('-')) {
              // 删除行不增加 new 行号
            } else if (line.startsWith('diff ') || line.startsWith('index ')) {
              inHunk = false;
            }
          }
        }
      }
      if (!newLine) {
        const m = diffText.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/m);
        if (m) newLine = parseInt(m[1], 10);
      }
      if (!newLine) newLine = 1;

      // 构建 position（默认锚定到新增/修改后的 new_line）
      const position = {
        base_sha: diff_refs.base_sha,
        head_sha: diff_refs.head_sha,
        start_sha: diff_refs.start_sha,
        position_type: 'text' as const,
        new_path: newPath,
        new_line: newLine,
      };
      
      // 格式化评论内容（包含 GitLab 建议块）
      const comment = this.commentFormatter.formatInlineComment(issue);
      
      // 发布讨论
      await this.gitlabService.postMergeRequestDiscussion(
        projectId,
        mrIid,
        comment,
        position,
        token,
      );
      
      this.logger.log(`内联评论发布成功: ${newPath}:${newLine}`);
    } catch (error) {
      this.logger.warn(`内联评论发布失败: ${error.message}`);
      // 内联评论失败不影响整体流程
    }
  }
}