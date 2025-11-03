import type { Job } from 'bull';
import { Logger, Injectable } from '@nestjs/common';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { ReviewSyncService } from '../gitlab/services/review-sync.service';
import { AnalysisResultService } from '../services/analysis-result.service';
import { MetricsService } from '../common/services/metrics.service';
import { AiAnalysisService } from '../services/ai-analysis.service';
import { GitlabApiClientService } from '../gitlab/services/gitlab-api-client.service';
import { AIReviewService } from '../review/services/ai-review.service';
import { GitHubService } from '../github/github.service';
import { CommentFormatterService } from '../review/services/comment-formatter.service';

interface AnalysisJobData {
  projectId: string;
  projectPath: string;
  mergeRequestId: number;
  mergeRequestIid: number;
  sourceBranch: string;
  targetBranch: string;
  title: string;
  description: string;
  url: string;
  repoUrl: string;
  lastCommit: {
    id: string;
    message: string;
    timestamp: string;
    author: {
      name: string;
      email: string;
    };
  };
  author: {
    name: string;
    username: string;
    email: string;
  };
  timestamp: string;
  platform?: 'gitlab' | 'github';
  pullNumber?: number;
}

@Injectable()
export class AnalysisWorker {
  private readonly logger = new Logger(AnalysisWorker.name);

  constructor(
    private configService: ConfigService,
    private readonly reviewSync: ReviewSyncService,
    private readonly resultService: AnalysisResultService,
    private readonly metrics: MetricsService,
    private readonly aiAnalysis: AiAnalysisService,
    private readonly gitlabApi: GitlabApiClientService,
    private readonly aiReviewService: AIReviewService,
    private readonly githubService: GitHubService,
  ) {}

  /**
   * 处理 MR 分析任务
   */
  async handleAnalyzeMR(job: Job<AnalysisJobData>) {
    this.logger.log(`Processing MR analysis job ${job.id} for MR ${job.data.mergeRequestIid}`);
    const startTime = Date.now();
    
    let containerId: string | null = null;
    
    try {
      // 1. 生成唯一的任务 ID
      const taskId = crypto.randomBytes(16).toString('hex');
      
      // 2. 准备 Docker 容器环境变量
      const taskData = {
        taskId,
        projectId: job.data.projectId,
        projectPath: job.data.projectPath,
        mergeRequestId: job.data.mergeRequestId,
        mergeRequestIid: job.data.mergeRequestIid,
        repoUrl: job.data.repoUrl,
        sourceBranch: job.data.sourceBranch,
        targetBranch: job.data.targetBranch,
        token: await this.getProjectToken(job.data.projectId),
      };

      // 3. 执行分析（优先使用内置 LLM 服务；若未配置则回退 Docker Worker）
      const processedResult = await this.analyzeMergeRequest(job, taskData);

      // 5.1 入库（零持久化：只写结构化结果与统计，不写源码）
      try {
        const saved = await this.resultService.createAnalysisResult({
          projectId: job.data.projectId,
          mergeRequestIid: job.data.mergeRequestIid,
          filesAnalyzed: processedResult.filesAnalyzed,
          issuesFound: processedResult.issuesFound,
          metrics: processedResult.metrics,
          processingTime: Date.now() - startTime,
          taskId,
        });
        if (processedResult.issues?.length) {
          await this.resultService.createIssues(
            processedResult.issues.map((it: any) => ({
              resultId: saved.id,
              filePath: it.file || 'unknown',
              lineNumber: it.line || null,
              severity: (it.severity || 'INFO').toString().toUpperCase(),
              type: it.type || 'BEST_PRACTICE',
              rule: it.rule || null,
              message: it.message || '',
              suggestion: it.suggestion || '',
              confidence: it.confidence ?? null,
            })),
          );
        }
      } catch (e) {
        this.logger.warn(`Save review result failed: ${e?.message}`);
      }

      // 5.2 发布 CodeRabbit 风格的 AI 审查评论
      try {
        // 构建 AIReviewResult 格式
        const aiReviewResult = this.convertToAIReviewResult(processedResult, job.data);
        
        // 根据平台发布评论
        const platform = job.data.platform || 'gitlab';
        
        if (platform === 'github') {
          // GitHub PR 评论
          await this.publishGitHubReview(job.data, aiReviewResult);
        } else {
          // GitLab MR 评论
          await this.aiReviewService.publishReviewToMR(
            String(job.data.projectId),
            String(job.data.mergeRequestIid),
            aiReviewResult,
          );
        }
        
        this.logger.log(`AI 审查评论发布成功: ${platform} #${job.data.mergeRequestIid || job.data.pullNumber}`);
        try { this.metrics.httpRequestsTotal.inc({ method: 'POST', route: `/${platform}/ai-review`, status_code: '200' }); } catch {}
      } catch (e) {
        this.logger.warn(`AI 审查评论发布失败: ${e?.message}`);
      }
      
      // 6. 报告进度
      await job.progress(100);
      
      const processingTime = Date.now() - startTime;
      this.logger.log(`Job ${job.id} completed in ${processingTime}ms`);
      
      return {
        success: true,
        taskId,
        projectId: job.data.projectId,
        mergeRequestIid: job.data.mergeRequestIid,
        ...processedResult,
        processingTime,
        timestamp: new Date().toISOString(),
      };
      
    } catch (error) {
      this.logger.error(`Analysis job ${job.id} failed: ${error.message}`, error.stack);
      try { this.metrics.httpRequestsTotal.inc({ method: 'QUEUE', route: 'analysis', status_code: '500' }); } catch {}
      throw error;
    } finally {
      // 7. 确保清理容器（无论成功或失败）
      if (containerId) {
        await this.cleanupContainer(containerId);
      }
    }
  }

  /**
   * 获取项目访问令牌
   */
  private async getProjectToken(projectId: string): Promise<string> {
    // TODO: 从数据库或配置中获取项目的访问令牌
    // 这里暂时使用环境变量中的通用令牌
    return this.configService.get<string>('GITLAB_ACCESS_TOKEN', '');
  }

  /**
   * 运行分析容器
   */
  private async runAnalysisContainer(taskData: any): Promise<string> {
    return new Promise((resolve, reject) => {
      const dockerArgs = [
        'run',
        '--rm', // 容器退出后自动删除
        '-d', // 后台运行
        '--name', `analysis-${taskData.taskId}`,
        '--read-only', // 只读根文件系统
        '--tmpfs', '/tmp:size=1G,mode=1770', // 内存文件系统
        '--memory', '2g', // 内存限制 2GB
        '--cpus', '1.0', // CPU 限制 1 核
        '--network', 'isolated_network', // 隔离网络
        '--user', '1000:1000', // 非 root 用户
        '--security-opt', 'no-new-privileges:true', // 禁止提权
        '--cap-drop', 'ALL', // 移除所有权限
        '--cap-add', 'CHOWN', // 仅允许必要权限
        '--cap-add', 'SETUID',
        '--cap-add', 'SETGID',
        '-e', `TASK_DATA=${JSON.stringify(taskData)}`,
        '-e', 'NODE_ENV=production',
        '-e', 'MAX_ANALYSIS_TIME=600000',
        '-e', 'MEMORY_LIMIT=2048',
        'moonlens/worker:latest',
      ];

      const docker = spawn('docker', dockerArgs);
      let containerId = '';
      let errorOutput = '';

      docker.stdout.on('data', (data) => {
        containerId += data.toString().trim();
      });

      docker.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      docker.on('close', (code) => {
        if (code === 0 && containerId) {
          this.logger.log(`Started container: ${containerId.substring(0, 12)}`);
          resolve(containerId);
        } else {
          reject(new Error(`Failed to start container: ${errorOutput}`));
        }
      });

      docker.on('error', (error) => {
        reject(new Error(`Docker spawn error: ${error.message}`));
      });
    });
  }

  /**
   * 等待容器执行完成并获取结果
   */
  private async waitForContainer(containerId: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Analysis timeout exceeded'));
      }, 600000); // 10分钟超时

      // 等待容器完成
      const wait = spawn('docker', ['wait', containerId]);
      
      wait.on('close', (exitCode) => {
        clearTimeout(timeout);
        
        // 获取容器日志（分析结果）
        const logs = spawn('docker', ['logs', containerId]);
        let output = '';
        let errorOutput = '';

        logs.stdout.on('data', (data) => {
          output += data.toString();
        });

        logs.stderr.on('data', (data) => {
          errorOutput += data.toString();
        });

        logs.on('close', () => {
          try {
            // 解析最后一行 JSON 输出
            const lines = output.trim().split('\n');
            const lastLine = lines[lines.length - 1];
            
            if (lastLine && lastLine.startsWith('{')) {
              const result = JSON.parse(lastLine);
              if (result.success) {
                resolve(result);
              } else {
                reject(new Error(result.error || 'Analysis failed'));
              }
            } else {
              // 如果没有 JSON 输出，检查错误
              reject(new Error(`No valid output from container: ${errorOutput}`));
            }
          } catch (error) {
            reject(new Error(`Failed to parse container output: ${error.message}`));
          }
        });
      });

      wait.on('error', (error) => {
        clearTimeout(timeout);
        reject(new Error(`Docker wait error: ${error.message}`));
      });
    });
  }

  /**
   * 处理分析结果
   */
  private processAnalysisResult(result: any): any {
    // 确保不包含源代码 + 标准化/去重/上限控制
    const maxComments = parseInt(process.env.AI_MAX_COMMENTS || '20', 10);
    const rawIssues: any[] = result?.results?.issues || [];

    // 过滤潜在源码字段，并计算指纹
    const { fingerprint } = require('../common/utils/fingerprint.util');
    const cleaned = rawIssues.map((issue: any) => {
      const safe = {
        file: issue.file,
        line: issue.line,
        column: issue.column,
        endLine: issue.endLine,
        endColumn: issue.endColumn,
        severity: issue.severity,
        type: issue.type,
        message: issue.message,
        suggestion: issue.suggestion,
        rule: issue.rule,
        confidence: issue.confidence,
      } as any;
      safe.fingerprint = fingerprint(safe.file || '', safe.line, `${safe.type || ''}:${safe.message || ''}:${safe.suggestion || ''}`);
      return safe;
    });

    // 去重（按指纹）
    const seen = new Set<string>();
    const deduped: any[] = [];
    for (const it of cleaned) {
      if (!it.fingerprint) { deduped.push(it); continue; }
      if (!seen.has(it.fingerprint)) {
        seen.add(it.fingerprint);
        deduped.push(it);
      }
    }

    // 上限裁剪（保持顺序）
    const limited = deduped.slice(0, Math.max(0, maxComments));

    return {
      filesAnalyzed: result?.results?.filesAnalyzed || 0,
      issuesFound: limited.length,
      issues: limited,
      metrics: result?.results?.metrics || {},
    };
  }

  /**
   * 分析 MR：优先调用 AiAnalysisService；若缺少 AI_API_KEY 则回退 Docker Worker
   */
  private async analyzeMergeRequest(job: Job<AnalysisJobData>, taskData: any) {
    const hasAiKey = !!this.configService.get<string>('AI_API_KEY')
    if (hasAiKey) {
      try {
        const req = await this.buildCodeAnalysisRequest(job, taskData.projectId, taskData.mergeRequestIid)
        const started = Date.now()
        const llm = await this.aiAnalysis.analyzeCode(req as any)
        const took = Date.now() - started
        const result = {
          results: {
            filesAnalyzed: (req.files || []).length,
            issueCount: (llm.issues || []).length,
            issues: llm.issues,
            metrics: llm.metrics || {},
          }
        }
        const processed = this.processAnalysisResult(result)
        processed.metrics.llm_time_ms = took
        return processed
      } catch (e) {
        this.logger.warn(`LLM 分析失败，回退 Docker Worker：${(e as any)?.message}`)
      }
    }

    // 回退：Docker 容器分析
    let containerId: string | null = null
    try {
      containerId = await this.runAnalysisContainer(taskData)
      const analysisResult = await this.waitForContainer(containerId)
      return this.processAnalysisResult(analysisResult)
    } finally {
      if (containerId) await this.cleanupContainer(containerId).catch(() => {})
    }
  }

  /**
   * 从 GitLab/GitHub 拉取 MR/PR 变更并构建 LLM 请求
   */
  private async buildCodeAnalysisRequest(job: Job<AnalysisJobData>, projectId: string, mrIid: number) {
    const platform = job.data.platform || 'gitlab';

    if (platform === 'github') {
      // GitHub PR 分支
      return await this.buildGitHubPRRequest(job.data);
    } else {
      // GitLab MR 分支
      return await this.buildGitLabMRRequest(projectId, mrIid);
    }
  }

  /**
   * 构建 GitHub PR 分析请求
   */
  private async buildGitHubPRRequest(jobData: AnalysisJobData) {
    const { owner, repo, pullNumber } = this.parseGitHubInfo(jobData);

    this.logger.log(`获取GitHub PR文件: ${owner}/${repo}#${pullNumber}`);

    // 获取 PR 文件列表
    const prFiles = await this.githubService.getPullRequestFiles(owner, repo, pullNumber);

    if (!prFiles || prFiles.length === 0) {
      this.logger.warn(`GitHub PR #${pullNumber} 没有文件变更`);
      return {
        files: [],
        context: {
          projectType: 'github-pr',
          framework: 'unknown',
          targetBranch: jobData.targetBranch || 'main',
          sourceBranch: jobData.sourceBranch || 'feature',
        },
        rules: [],
      };
    }

    // 转换为统一格式
    const files = prFiles.map((file: any) => {
      const path = file.filename || 'unknown';
      const language = this.detectLanguage(path);
      const changes = file.patch || '';
      // GitHub API 返回的文件内容（如果有）
      const content = file.contents_url ? '' : ''; // 暂不获取完整内容

      return { path, language, content, changes };
    });

    this.logger.log(`获取到 ${files.length} 个变更文件`);

    return {
      files,
      context: {
        projectType: 'github-pr',
        framework: 'unknown',
        targetBranch: jobData.targetBranch || 'main',
        sourceBranch: jobData.sourceBranch || 'feature',
      },
      rules: [],
    };
  }

  /**
   * 构建 GitLab MR 分析请求
   */
  private async buildGitLabMRRequest(projectId: string, mrIid: number) {
    // 获取 MR 概览与 diff
    const mr = await this.gitlabApi.getMergeRequest(projectId, mrIid)
    const diffs = await this.gitlabApi.listMergeRequestDiffs(projectId, mrIid)
    const headSha = mr?.diff_refs?.head_sha || mr?.sha || mr?.source_sha

    const files = await Promise.all((diffs || []).map(async (c: any) => {
      const path = c.new_path || c.newPath || c.old_path || c.oldPath || 'unknown'
      const language = this.detectLanguage(path)
      const changes = c.diff || c.patch || ''
      // 可选：抓取最新文件内容（受权限与体量限制，这里只在小文件时拉取）
      let content = ''
      try {
        if (headSha && path && changes && changes.length < 8000) {
          content = await this.gitlabApi.getFileRaw(projectId, path, headSha)
          if (content && content.length > 2000) content = content.slice(0, 2000)
        }
      } catch { /* 忽略内容抓取失败 */ }
      return { path, language, content, changes }
    }))

    return {
      files,
      context: {
        projectType: 'gitlab-mr',
        framework: 'unknown',
        targetBranch: mr?.target_branch || 'main',
        sourceBranch: mr?.source_branch || 'feature',
      },
      rules: [],
    }
  }

  /**
   * 解析 GitHub 仓库信息
   */
  private parseGitHubInfo(jobData: AnalysisJobData): { owner: string; repo: string; pullNumber: number } {
    // 从 projectPath 解析 owner/repo (如 "yehan-s/manage_1")
    const parts = (jobData.projectPath || '').split('/');
    const owner = parts[0] || '';
    const repo = parts[1] || '';
    const pullNumber = jobData.pullNumber || jobData.mergeRequestIid || 0;

    return { owner, repo, pullNumber };
  }

  /**
   * 将处理结果转换为 AIReviewResult 格式
   */
  private convertToAIReviewResult(processedResult: any, jobData: AnalysisJobData): any {
    const issues = processedResult.issues || [];
    const metrics = processedResult.metrics || {};
    
    // 统计严重程度
    const errorCount = issues.filter((i: any) => i.severity === 'error' || i.severity === 'ERROR').length;
    const warningCount = issues.filter((i: any) => i.severity === 'warning' || i.severity === 'WARNING').length;
    const infoCount = issues.length - errorCount - warningCount;
    
    // 计算总分（基于问题数量和严重程度）
    const score = Math.max(100 - (errorCount * 15 + warningCount * 5 + infoCount * 2), 0);
    
    // 确定总体严重程度
    let severity: 'success' | 'warning' | 'error' | 'info' = 'success';
    if (errorCount > 0) severity = 'error';
    else if (warningCount > 0) severity = 'warning';
    else if (infoCount > 0) severity = 'info';
    
    // 生成描述
    const parts: string[] = [];
    if (errorCount > 0) parts.push(`${errorCount} 个严重问题`);
    if (warningCount > 0) parts.push(`${warningCount} 个警告`);
    if (infoCount > 0) parts.push(`${infoCount} 个提示`);
    
    const description = parts.length > 0
      ? `发现 ${parts.join('、')}，建议修复后合并`
      : '代码质量良好，未发现明显问题';
    
    return {
      summary: {
        title: `代码审查完成 - 发现 ${issues.length} 个问题`,
        description,
        severity,
      },
      issues: issues.map((issue: any) => {
        const after = this.extractAfterFromSuggestion(issue.suggestion || '') || (issue.code || '');
        const mapped: any = {
          id: issue.fingerprint || `issue-${Math.random().toString(36).substr(2, 9)}`,
          type: this.normalizeIssueType(issue.type),
          severity: this.normalizeSeverity(issue.severity),
          title: issue.message || '未知问题',
          description: issue.message || '',
          file: issue.file || 'unknown',
          line: issue.line || 1,
          column: issue.column,
          suggestion: issue.suggestion || '',
          code: issue.code,
        };
        if (after && typeof after === 'string' && after.trim().length > 0) {
          mapped.codeExample = { before: '', after };
        }
        return mapped;
      }),
      score,
      metrics: {
        security: metrics.security || 80,
        performance: metrics.performance || 80,
        maintainability: metrics.maintainability || 75,
        reliability: metrics.reliability || 80,
      },
      suggestions: this.generateSuggestions(issues),
    };
  }

  /**
   * 从建议文本中提取“可应用”的代码内容（支持 ```code``` 或 `inline`）
   */
  private extractAfterFromSuggestion(text: string): string | null {
    if (!text) return null;
    // 优先匹配三引号代码块（带或不带语言标识）
    const block = text.match(/```(?:[a-zA-Z0-9_-]+)?\n([\s\S]*?)```/);
    if (block && block[1]) return block[1].trim();
    // 其次匹配单反引号的内联代码
    const inline = text.match(/`([^`]+)`/);
    if (inline && inline[1]) return inline[1].trim();
    // 兜底：从自然语言中提取看起来像代码的一行（常见于 <img .../>、const ... = ... 等）
    const tag = text.match(/<(?:img|a|div|span|input|button)[^>]*?>\/?/i);
    if (tag && tag[0]) return tag[0].trim();
    const assign = text.match(/^[ \t]*[^\s]+\s*=\s*[^;]+;?/m);
    if (assign && assign[0]) return assign[0].trim();
    return null;
  }

  /**
   * 标准化问题类型
   */
  private normalizeIssueType(type: string): 'security' | 'performance' | 'quality' | 'style' | 'bug' {
    const typeStr = (type || '').toLowerCase();
    if (typeStr.includes('security') || typeStr.includes('安全')) return 'security';
    if (typeStr.includes('performance') || typeStr.includes('性能')) return 'performance';
    if (typeStr.includes('bug') || typeStr.includes('错误')) return 'bug';
    if (typeStr.includes('style') || typeStr.includes('风格')) return 'style';
    return 'quality';
  }

  /**
   * 标准化严重程度
   */
  private normalizeSeverity(severity: string): 'error' | 'warning' | 'info' {
    const sevStr = (severity || '').toLowerCase();
    if (sevStr === 'error' || sevStr === 'critical' || sevStr === 'high') return 'error';
    if (sevStr === 'warning' || sevStr === 'medium') return 'warning';
    return 'info';
  }

  /**
   * 生成建议列表
   */
  private generateSuggestions(issues: any[]): string[] {
    const suggestions: string[] = [];
    
    const hasSecurityIssues = issues.some(i => this.normalizeIssueType(i.type) === 'security');
    const hasPerformanceIssues = issues.some(i => this.normalizeIssueType(i.type) === 'performance');
    const hasBugs = issues.some(i => this.normalizeIssueType(i.type) === 'bug');
    
    if (hasSecurityIssues) {
      suggestions.push('优先修复安全相关问题，避免潜在漏洞');
    }
    
    if (hasBugs) {
      suggestions.push('修复已发现的 bug，确保代码正确性');
    }
    
    if (hasPerformanceIssues) {
      suggestions.push('优化性能相关代码，提升系统响应速度');
    }
    
    if (issues.length === 0) {
      suggestions.push('代码质量良好，可以考虑添加更多测试');
    } else {
      suggestions.push('确保所有变更都有对应的测试覆盖');
    }
    
    suggestions.push('更新相关文档以反映代码变更');
    
    return suggestions;
  }

  /**
   * 发布 GitHub PR Review
   */
  private async publishGitHubReview(jobData: any, reviewResult: any): Promise<void> {
    const owner = jobData.owner;
    const repo = jobData.repo;
    const pullNumber = jobData.pullNumber;
    let headSha = jobData.headSha;
    
    if (!owner || !repo || !pullNumber) {
      this.logger.warn('GitHub 发布评论缺少必要参数');
      return;
    }
    
    try {
      // 使用 CommentFormatterService 的格式化逻辑
      const formatter = new CommentFormatterService();
      
      // 格式化总评
      const summaryComment = formatter.formatSummaryComment(reviewResult);
      
      // 获取 Bot Token
      const botToken = this.configService.get<string>('GITHUB_BOT_TOKEN') || 
                       this.configService.get<string>('GITHUB_TOKEN');
      
      if (!botToken) {
        this.logger.warn('GITHUB_BOT_TOKEN 未配置,跳过评论发布');
        return;
      }
      
      // 发布 Issue Comment (总评)
      await this.githubService.createIssueComment(
        owner,
        repo,
        pullNumber,
        summaryComment,
        botToken,
      );
      
      this.logger.log(`GitHub PR 总评发布成功: ${owner}/${repo}#${pullNumber}`);
      
      // 阶段2：发布行内评论（带 suggestion，可一键 Apply）
      try {
        // 获取 PR 详情以拿到 headSha
        if (!headSha) {
          const pr = await this.githubService.getPullRequest(owner, repo, pullNumber, botToken);
          headSha = pr?.head?.sha;
        }

        if (!headSha) {
          this.logger.warn('获取 headSha 失败，跳过行内评论');
          return;
        }

        const order: Record<string, number> = { error: 0, warning: 1, info: 2 };
        const inlineCandidates = (reviewResult.issues || [])
          .slice()
          .sort((a: any, b: any) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9))
          .slice(0, 30);

        if (inlineCandidates.length === 0) return;

        // 使用已实现的格式化器，确保包含 ```suggestion 代码块
        const formatter = new CommentFormatterService();
        const comments = inlineCandidates.map((issue: any) => ({
          path: issue.file,
          line: Math.max(1, Number(issue.line) || 1),
          body: formatter.formatInlineComment(issue),
        }));

        await this.githubService.createPullRequestReviewWithComments(
          owner,
          repo,
          pullNumber,
          '🤖 AI Code Review - Detailed Issues',
          comments,
          headSha,
          botToken,
        );
        this.logger.log(`GitHub PR 行内评论发布成功: ${comments.length} 条`);
      } catch (e) {
        this.logger.warn(`发布 GitHub 行内评论失败: ${e?.message}`);
      }
      
    } catch (error) {
      this.logger.error(`发布 GitHub Review 失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  private detectLanguage(path: string): string {
    const ext = (path.split('.').pop() || '').toLowerCase()
    switch (ext) {
      case 'ts': return 'ts'
      case 'js': return 'js'
      case 'vue': return 'vue'
      case 'py': return 'python'
      case 'java': return 'java'
      case 'go': return 'go'
      case 'cs': return 'csharp'
      case 'rb': return 'ruby'
      default: return 'text'
    }
  }

  /**
   * 清理容器
   */
  private async cleanupContainer(containerId: string): Promise<void> {
    return new Promise((resolve) => {
      // 强制停止并删除容器
      const stop = spawn('docker', ['stop', '-t', '0', containerId]);
      
      stop.on('close', () => {
        // 容器已经使用 --rm 标志，会自动删除
        this.logger.log(`Cleaned up container: ${containerId.substring(0, 12)}`);
        resolve();
      });

      stop.on('error', (error) => {
        this.logger.error(`Failed to stop container: ${error.message}`);
        // 即使失败也继续，容器会被系统清理
        resolve();
      });

      // 设置清理超时
      setTimeout(() => {
        this.logger.warn('Container cleanup timeout, forcing resolution');
        resolve();
      }, 5000);
    });
  }

  /**
   * 处理简单分析任务（向后兼容）
   */
  async handleAnalysis(job: Job) {
    // 转换为 MR 分析格式
    const mrData: AnalysisJobData = {
      projectId: job.data.projectId,
      projectPath: job.data.projectPath || '',
      mergeRequestId: job.data.mergeRequestId || 0,
      mergeRequestIid: job.data.mergeRequestIid || 0,
      sourceBranch: job.data.sourceBranch || 'main',
      targetBranch: job.data.targetBranch || 'main',
      title: job.data.title || 'Analysis',
      description: job.data.description || '',
      url: job.data.url || '',
      repoUrl: job.data.repoUrl,
      lastCommit: job.data.lastCommit || {
        id: '',
        message: '',
        timestamp: new Date().toISOString(),
        author: { name: '', email: '' },
      },
      author: job.data.author || {
        name: '',
        username: '',
        email: '',
      },
      timestamp: job.data.timestamp || new Date().toISOString(),
    };

    // 使用相同的处理逻辑
    return this.handleAnalyzeMR({ ...job, data: mrData } as Job<AnalysisJobData>);
  }
}
