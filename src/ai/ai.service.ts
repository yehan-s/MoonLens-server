import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { AIConfigService, AIProviderConfig } from './services/ai-config.service';
import { KimiProvider, CodeAnalysisRequest, AnalysisResult } from './providers/kimi.provider';
import { GitlabService } from '../gitlab/gitlab.service';
import { GitHubService } from '../github/github.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReviewTaskQueueService } from './services/review-task-queue.service';
import { PlatformTokenService } from '../platform-tokens/platform-token.service';

export interface ReviewRequest {
  projectId: string;
  mrIid: string;
  userId: string;
  provider?: string;
  apiKey?: string;
  model?: string;
  rules?: string[];
  fullReview?: boolean;
  gitlabToken?: string;
  githubToken?: string;
}

export interface ReviewReport {
  id?: string;
  projectId: string;
  mrIid: string;
  summary: string;
  score: number;
  issues: Array<{
    severity: 'error' | 'warning' | 'info';
    file: string;
    line: number;
    message: string;
    suggestion?: string;
  }>;
  suggestions: string[];
  reviewedFiles: number;
  totalFiles: number;
  provider: string;
  model: string;
  timestamp: string;
  duration: number;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly configService: AIConfigService,
    private readonly kimiProvider: KimiProvider,
    private readonly gitlabService: GitlabService,
    private readonly githubService: GitHubService,
    private readonly prisma: PrismaService,
    private readonly taskQueue: ReviewTaskQueueService,
    private readonly platformTokenService: PlatformTokenService,
  ) {}

  /**
   * 执行MR代码审查
   */
  /**
   * 创建异步审查任务
   */
  async createReviewTask(request: ReviewRequest): Promise<{ taskId: string; status: string }> {
    try {
      this.logger.log(`创建异步审查任务: ${request.projectId} MR#${request.mrIid}`);

      // 使用统一的 getMRChanges 方法获取文件变更（自动判断 GitHub/GitLab）
      const filesToAnalyze = await this.getMRChanges(
        request.projectId,
        request.mrIid,
        request.userId,
        request.gitlabToken,
        request.githubToken,
      );

      if (!filesToAnalyze || filesToAnalyze.length === 0) {
        throw new NotFoundException('未找到文件变更');
      }

      this.logger.log(`获取到 ${filesToAnalyze.length} 个文件变更`);

      // 创建任务
      const task = this.taskQueue.createTask(
        request.userId,
        request.projectId,
        request.mrIid,
        filesToAnalyze.length,
      );

      // 异步执行审查（不阻塞返回）
      this.executeReviewTask(task.id, request, filesToAnalyze).catch(error => {
        this.logger.error(`任务 ${task.id} 执行失败:`, error);
        this.taskQueue.updateTask(task.id, {
          status: 'failed',
          error: error.message || '未知错误',
        });
      });

      return {
        taskId: task.id,
        status: task.status,
      };
    } catch (error) {
      this.logger.error('创建审查任务失败:', error);
      throw error;
    }
  }

  /**
   * Mock模式执行审查（演示异步+并行）
   */
  private async executeReviewTaskMock(
    taskId: string,
    request: ReviewRequest,
    filesToAnalyze: any[],
  ): Promise<void> {
    const startTime = Date.now();

    try {
      this.taskQueue.updateTask(taskId, {
        status: 'processing',
        progress: 0,
      });

      // 模拟并行分析
      const analysisPromises = filesToAnalyze.map((file, index) => 
        new Promise<any>((resolve) => {
          // 模拟每个文件耗时1-3秒
          const delay = 1000 + Math.random() * 2000;
          
          setTimeout(() => {
            const processedFiles = index + 1;
            const progress = Math.round((processedFiles / filesToAnalyze.length) * 100);
            
            this.taskQueue.updateTask(taskId, {
              processedFiles,
              progress,
              currentFile: file.new_path,
            });

            resolve({
              score: 80 + Math.floor(Math.random() * 20),
              issues: this.generateMockIssues(file.new_path),
              suggestions: ['优化代码结构', '添加单元测试'],
            });
          }, delay);
        })
      );

      const results = await Promise.all(analysisPromises);

      // 汇总结果
      const report = {
        projectId: request.projectId,
        mrIid: request.mrIid,
        summary: '代码质量评分: 85/100. 发现 2 个警告，3 个提示。',
        score: 85,
        issues: results.flatMap(r => r.issues),
        suggestions: ['建议添加更多测试覆盖', '优化性能关键路径'],
        reviewedFiles: filesToAnalyze.length,
        totalFiles: filesToAnalyze.length,
        provider: 'mock',
        model: 'demo',
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
      };

      this.taskQueue.updateTask(taskId, {
        status: 'completed',
        result: report,
      });

      this.logger.log(`任务 ${taskId} 完成，耗时 ${Date.now() - startTime}ms`);
    } catch (error) {
      this.logger.error(`任务 ${taskId} 执行失败:`, error);
      this.taskQueue.updateTask(taskId, {
        status: 'failed',
        error: error.message || '未知错误',
      });
    }
  }

  /**
   * 生成mock文件列表
   */
  private generateMockFiles(count: number): any[] {
    const files = [
      'src/api/auth.ts',
      'src/services/user.service.ts',
      'src/controllers/project.controller.ts',
      'src/models/task.model.ts',
      'src/utils/validator.ts',
      'src/middleware/auth.middleware.ts',
      'src/config/database.ts',
      'src/routes/api.routes.ts',
      'src/lib/logger.ts',
      'src/types/index.ts',
    ];
    
    return files.slice(0, count).map(path => ({ new_path: path }));
  }

  /**
   * 生成mock问题列表
   */
  private generateMockIssues(filePath: string): any[] {
    const random = Math.random();
    if (random < 0.3) return []; // 30% 无问题
    
    return [
      {
        severity: random > 0.7 ? 'error' : 'warning',
        file: filePath,
        line: Math.floor(Math.random() * 100) + 1,
        message: '建议添加错误处理',
        suggestion: '使用 try-catch 包裹可能抛出异常的代码',
      },
    ];
  }

  /**
   * 异步执行审查任务（并行处理）
   */
  private async executeReviewTask(
    taskId: string,
    request: ReviewRequest,
    filesToAnalyze: any[],
  ): Promise<void> {
    const startTime = Date.now();

    try {
      // 更新任务状态为处理中
      this.taskQueue.updateTask(taskId, {
        status: 'processing',
        progress: 0,
      });

      // 获取AI配置
      const aiConfig = await this.getAIConfig(request);

      // 并行分析所有文件
      const analysisPromises = filesToAnalyze.map((change, index) => 
        this.analyzeFile(change, aiConfig, request.rules)
          .then(result => {
            // 每完成一个文件，更新进度
            const processedFiles = index + 1;
            const progress = Math.round((processedFiles / filesToAnalyze.length) * 100);
            
            const currentFile = change.filename || change.new_path || change.old_path;
            
            this.taskQueue.updateTask(taskId, {
              processedFiles,
              progress,
              currentFile,
            });

            return { success: true, result, file: currentFile };
          })
          .catch(error => {
            const filePath = change.filename || change.new_path || change.old_path || 'unknown';
            this.logger.error(`分析文件失败 [${filePath}]: ${error.message}`, error.stack);
            // 返回错误信息而不是 null
            return { 
              success: false, 
              error: error.message || '未知错误', 
              file: filePath 
            };
          })
      );

      // 等待所有分析完成
      const results = await Promise.all(analysisPromises);

      // 分离成功和失败的结果
      type SuccessResult = { success: true; result: AnalysisResult; file: string };
      type FailedResult = { success: false; error: string; file: string };

      const successResults: AnalysisResult[] = [];
      const failedResults: FailedResult[] = [];

      results.forEach(r => {
        if (r.success) {
          successResults.push((r as SuccessResult).result);
        } else {
          failedResults.push(r as FailedResult);
        }
      });

      // 记录失败信息
      if (failedResults.length > 0) {
        this.logger.warn(`任务 ${taskId} 中有 ${failedResults.length}/${filesToAnalyze.length} 个文件分析失败:`);
        failedResults.forEach(f => {
          this.logger.warn(`  - ${f.file}: ${f.error}`);
        });
      }

      // 如果所有文件都失败，将任务标记为失败
      if (successResults.length === 0) {
        throw new BadRequestException(
          `所有文件分析失败。失败详情:\n${failedResults.map(f => `- ${f.file}: ${f.error}`).join('\n')}`
        );
      }

      // 汇总分析结果
      const report = this.aggregateAnalyses(
        successResults,
        request,
        aiConfig,
        successResults.length,
        filesToAnalyze.length,
        Date.now() - startTime,
        failedResults.length > 0 ? failedResults : undefined,
      );

      // 保存审查报告
      await this.saveReviewReport(report, request.userId);

      // 更新任务为完成
      this.taskQueue.updateTask(taskId, {
        status: 'completed',
        result: report,
      });

      this.logger.log(`任务 ${taskId} 完成，耗时 ${Date.now() - startTime}ms`);
    } catch (error) {
      this.logger.error(`任务 ${taskId} 执行失败:`, error);
      
      this.taskQueue.updateTask(taskId, {
        status: 'failed',
        error: error.message || '未知错误',
      });
      
      throw error;
    }
  }

  async reviewMergeRequest(request: ReviewRequest): Promise<ReviewReport> {
    const startTime = Date.now();
    
    try {
      // 获取或使用提供的AI配置
      const aiConfig = await this.getAIConfig(request);
      
      // 获取MR的代码变更
      const changes = await this.getMRChanges(
        request.projectId,
        request.mrIid,
        request.userId,
        request.gitlabToken,
        request.githubToken,
      );
      
      if (!changes || changes.length === 0) {
        throw new NotFoundException('未找到代码变更');
      }

      // 分析每个文件的变更
      const fileAnalyses: AnalysisResult[] = [];
      const failedFiles: Array<{ success: false; error: string; file: string }> = [];
      let reviewedFiles = 0;

      for (const change of changes) {
        const filePath = change.filename || change.new_path || change.old_path;
        if (this.shouldAnalyzeFile(filePath)) {
          try {
            const analysis = await this.analyzeFile(change, aiConfig, request.rules);
            fileAnalyses.push(analysis);
            reviewedFiles++;
          } catch (error) {
            this.logger.error(`分析文件失败 [${filePath}]: ${error.message}`, error.stack);
            failedFiles.push({
              success: false,
              error: error.message || '未知错误',
              file: filePath,
            });
          }
        }
      }

      // 如果所有文件都失败，抛出异常
      if (fileAnalyses.length === 0 && failedFiles.length > 0) {
        throw new BadRequestException(
          `所有文件分析失败。失败详情:\n${failedFiles.map(f => `- ${f.file}: ${f.error}`).join('\n')}`
        );
      }

      // 汇总分析结果
      const report = this.aggregateAnalyses(
        fileAnalyses,
        request,
        aiConfig,
        reviewedFiles,
        changes.length,
        Date.now() - startTime,
        failedFiles.length > 0 ? failedFiles : undefined,
      );

      // 保存审查报告
      await this.saveReviewReport(report, request.userId);

      return report;
    } catch (error) {
      this.logger.error('MR审查失败:', error);
      throw error;
    }
  }

  /**
   * 获取AI配置
   */
  private async getAIConfig(request: ReviewRequest): Promise<AIProviderConfig> {
    // 如果请求中提供了API密钥，直接使用
    if (request.apiKey) {
      return {
        provider: request.provider || 'kimi',
        apiKey: request.apiKey,
        model: request.model,
      };
    }

    // 尝试从用户配置中获取
    const userConfig = await this.configService.getUserAIConfig(request.userId);
    
    // 如果用户有配置，使用用户配置
    if (userConfig && userConfig.providers && userConfig.providers.length > 0) {
      const provider = request.provider || userConfig.defaultProvider || 'kimi';
      const providerConfig = userConfig.providers.find(p => p.provider === provider);
      
      if (providerConfig) {
        return providerConfig;
      }
    }
    
    // 如果用户没有配置或找不到指定的provider，使用系统默认配置
    const defaultConfig = await this.configService.getDefaultAIConfig();
    if (defaultConfig) {
      this.logger.log('使用系统默认AI配置');
      return defaultConfig;
    }
    
    // 如果连默认配置都没有，抛出错误
    throw new BadRequestException('系统未配置默认AI提供商，请联系管理员');
  }

  /**
   * 获取MR的代码变更(支持GitHub和GitLab)
   */
  private async getMRChanges(
    projectId: string,
    mrIid: string,
    userId: string,
    gitlabToken?: string,
    githubToken?: string
  ): Promise<any[]> {
    try {
      let changes: any[];

      // 判断是GitHub还是GitLab (GitHub: owner/repo, GitLab: 数字ID)
      if (projectId.includes('/')) {
        // GitHub项目
        this.logger.log(`从GitHub获取MR变更: projectId=${projectId}, mrIid=${mrIid}`);
        changes = await this.githubService.getMergeRequestChanges(projectId, mrIid, githubToken);
      } else {
        // GitLab项目
        this.logger.log(`从GitLab获取MR变更: projectId=${projectId}, mrIid=${mrIid}`);

        // 从数据库获取用户的 GitLab token 和 API URL
        const platformToken = await this.platformTokenService.getToken(userId, 'gitlab');

        if (!platformToken) {
          this.logger.warn(`用户 ${userId} 没有GitLab token配置`);
          throw new Error('GitLab token未配置，请先完成OAuth认证');
        }

        const apiUrl = platformToken.apiUrl || 'https://gitlab.com';
        // 统一令牌格式：OAuth 使用 Bearer，PAT 使用裸值
        const rawToken = gitlabToken || platformToken.accessToken;
        const token = (platformToken as any).authMethod === 'oauth' && rawToken && !/^Bearer\s+/i.test(rawToken)
          ? `Bearer ${rawToken}`
          : rawToken;

        this.logger.log(`使用GitLab API URL: ${apiUrl}`);
        const mrOrChanges = await this.gitlabService.getMergeRequestChanges(projectId, mrIid, token, apiUrl);
        // 兼容：既支持返回 changes 数组，也支持返回包含 diff_refs 的完整对象
        changes = Array.isArray(mrOrChanges) ? mrOrChanges : (mrOrChanges?.changes || []);
      }

      if (!changes || changes.length === 0) {
        this.logger.warn(`未获取到MR变更: projectId=${projectId}, mrIid=${mrIid}`);
        throw new Error('未找到代码变更');
      }

      return changes;
    } catch (error) {
      this.logger.error('获取MR变更失败:', error);
      throw error;
    }
  }

  /**
   * 判断是否应该分析文件
   */
  private shouldAnalyzeFile(filePath: string): boolean {
    if (!filePath) return false;

    // 排除的文件类型
    const excludedExtensions = [
      '.jpg', '.jpeg', '.png', '.gif', '.svg',
      '.pdf', '.doc', '.docx',
      '.zip', '.tar', '.gz',
      '.lock', '.sum',
    ];

    const excludedPaths = [
      'node_modules/',
      'dist/',
      'build/',
      '.git/',
      'coverage/',
      'vendor/',
    ];

    // 检查文件扩展名
    const ext = filePath.substring(filePath.lastIndexOf('.'));
    if (excludedExtensions.includes(ext.toLowerCase())) {
      return false;
    }

    // 检查路径
    for (const path of excludedPaths) {
      if (filePath.includes(path)) {
        return false;
      }
    }

    return true;
  }

  /**
   * 分析单个文件
   */
  private async analyzeFile(
    change: any,
    aiConfig: AIProviderConfig,
    rules?: string[],
  ): Promise<AnalysisResult> {
    // 验证文件变更对象
    if (!change) {
      throw new BadRequestException('文件变更对象不能为空');
    }

    // 获取文件路径（兼容 GitHub 和 GitLab API）
    const filePath = change.filename || change.new_path || change.old_path;
    
    // 验证文件路径
    if (!filePath || typeof filePath !== 'string') {
      throw new BadRequestException(`无效的文件路径: ${JSON.stringify(change)}`);
    }

    // 验证文件路径格式（防止路径遍历攻击）
    if (filePath.includes('..') || filePath.startsWith('/') || filePath.includes('\\')) {
      throw new BadRequestException(`不安全的文件路径: ${filePath}`);
    }

    // 验证 diff 内容
    if (!change.diff && !change.patch) {
      this.logger.warn(`文件 ${filePath} 没有变更内容`);
      // 返回空分析结果而非抛出异常
      return {
        score: 100,
        issues: [],
        suggestions: [],
        summary: '无变更内容',
        timestamp: new Date().toISOString(),
      };
    }

    // 提取文件语言
    const language = this.detectLanguage(filePath);

    // 构建分析请求
    const request: CodeAnalysisRequest = {
      code: change.patch || change.diff || '',
      filePath: filePath,
      language,
      context: `This is a git diff of changes made to the file.`,
      rules,
    };

    // 根据提供商选择服务
    switch (aiConfig.provider) {
      case 'kimi':
        return await this.kimiProvider.analyzeCode(request, {
          apiKey: aiConfig.apiKey,
          apiUrl: aiConfig.apiUrl,
          model: aiConfig.model,
          maxTokens: aiConfig.maxTokens,
          temperature: aiConfig.temperature,
        });
      // 未来可以添加其他提供商
      default:
        throw new BadRequestException(`不支持的AI提供商: ${aiConfig.provider}`);
    }
  }

  /**
   * 检测编程语言
   */
  private detectLanguage(filePath: string): string {
    // 验证文件路径
    if (!filePath || typeof filePath !== 'string') {
      this.logger.warn(`无效的文件路径: ${filePath}`);
      return 'unknown';
    }

    // 检查是否有扩展名
    const lastDotIndex = filePath.lastIndexOf('.');
    if (lastDotIndex === -1 || lastDotIndex === filePath.length - 1) {
      this.logger.warn(`文件无扩展名: ${filePath}`);
      return 'unknown';
    }

    const ext = filePath.substring(lastDotIndex + 1).toLowerCase();
    const languageMap: Record<string, string> = {
      'js': 'javascript',
      'jsx': 'javascript',
      'ts': 'typescript',
      'tsx': 'typescript',
      'py': 'python',
      'java': 'java',
      'go': 'go',
      'rs': 'rust',
      'cpp': 'cpp',
      'c': 'c',
      'cs': 'csharp',
      'php': 'php',
      'rb': 'ruby',
      'swift': 'swift',
      'kt': 'kotlin',
      'vue': 'vue',
      'html': 'html',
      'css': 'css',
      'scss': 'scss',
      'sql': 'sql',
      'sh': 'bash',
      'yml': 'yaml',
      'yaml': 'yaml',
      'json': 'json',
      'xml': 'xml',
      'md': 'markdown',
    };

    return languageMap[ext] || ext;
  }

  /**
   * 汇总多个文件的分析结果
   */
  private aggregateAnalyses(
    analyses: AnalysisResult[],
    request: ReviewRequest,
    aiConfig: AIProviderConfig,
    reviewedFiles: number,
    totalFiles: number,
    duration: number,
    failedResults?: Array<{ success: false; error: string; file: string }>,
  ): ReviewReport {
    // 合并所有问题
    const allIssues = analyses.flatMap(a => a.issues);
    
    // 计算总分
    const averageScore = analyses.length > 0
      ? Math.round(analyses.reduce((sum, a) => sum + a.score, 0) / analyses.length)
      : 100;

    // 合并建议
    const allSuggestions = new Set<string>();
    analyses.forEach(a => {
      a.suggestions.forEach(s => allSuggestions.add(s));
    });

    // 生成摘要（包含失败信息）
    const summary = this.generateSummary(allIssues, averageScore, failedResults);

    // 构建报告对象
    const report: any = {
      projectId: request.projectId,
      mrIid: request.mrIid,
      summary,
      score: averageScore,
      issues: allIssues,
      suggestions: Array.from(allSuggestions),
      reviewedFiles,
      totalFiles,
      provider: aiConfig.provider,
      model: aiConfig.model || 'default',
      timestamp: new Date().toISOString(),
      duration,
    };

    // 如果有失败的文件，添加到报告中
    if (failedResults && failedResults.length > 0) {
      report.failedFiles = failedResults.map(f => ({
        file: f.file,
        error: f.error,
      }));
      report.warnings = report.warnings || [];
      report.warnings.push(`${failedResults.length} 个文件分析失败，详情见 failedFiles 字段`);
    }

    return report;
  }

  /**
   * 生成审查摘要
   */
  private generateSummary(
    issues: any[], 
    score: number, 
    failedResults?: Array<{ success: false; error: string; file: string }>
  ): string {
    const errorCount = issues.filter(i => i.severity === 'error').length;
    const warningCount = issues.filter(i => i.severity === 'warning').length;
    const infoCount = issues.filter(i => i.severity === 'info').length;

    let summary = `代码质量评分: ${score}/100. `;

    if (errorCount === 0 && warningCount === 0 && infoCount === 0) {
      summary += '未发现明显问题，代码质量良好。';
    } else {
      summary += `发现 ${errorCount} 个错误，${warningCount} 个警告，${infoCount} 个提示。`;
      
      if (errorCount > 0) {
        summary += ' 建议优先修复错误级别的问题。';
      } else if (warningCount > 0) {
        summary += ' 建议关注警告级别的问题。';
      }
    }

    // 添加失败文件信息
    if (failedResults && failedResults.length > 0) {
      summary += ` ⚠️ 注意：${failedResults.length} 个文件分析失败。`;
    }

    return summary;
  }

  /**
   * 保存审查报告
   */
  private async saveReviewReport(report: ReviewReport, userId: string): Promise<void> {
    try {
      await this.prisma.reviewReport.create({
        data: {
          projectId: report.projectId,
          mrIid: report.mrIid,
          userId,
          summary: report.summary,
          score: report.score,
          issues: JSON.stringify(report.issues),
          suggestions: JSON.stringify(report.suggestions),
          provider: report.provider,
          model: report.model,
          reviewedFiles: report.reviewedFiles,
          totalFiles: report.totalFiles,
          duration: report.duration,
          createdAt: new Date(report.timestamp),
        },
      });
    } catch (error) {
      this.logger.error('保存审查报告失败:', error);
      // 不抛出错误，允许返回报告即使保存失败
    }
  }

  /**
   * 获取历史审查报告
   */
  async getReviewHistory(
    userId: string,
    projectId?: string,
    mrIid?: string,
  ): Promise<ReviewReport[]> {
    try {
      const where: any = { userId };
      if (projectId) where.projectId = projectId;
      if (mrIid) where.mrIid = mrIid;

      const reports = await this.prisma.reviewReport.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 20,
      });

      return reports.map(r => ({
        id: r.id,
        projectId: r.projectId,
        mrIid: r.mrIid,
        summary: r.summary,
        score: r.score,
        issues: JSON.parse(r.issues as string),
        suggestions: JSON.parse(r.suggestions as string),
        reviewedFiles: r.reviewedFiles,
        totalFiles: r.totalFiles,
        provider: r.provider,
        model: r.model,
        timestamp: r.createdAt.toISOString(),
        duration: r.duration,
      }));
    } catch (error) {
      this.logger.error('获取审查历史失败:', error);
      return [];
    }
  }

  /**
   * 验证AI配置
   */
  async validateAIConfig(config: AIProviderConfig): Promise<boolean> {
    try {
      switch (config.provider) {
        case 'kimi':
          return await this.kimiProvider.validateConfig({
            apiKey: config.apiKey,
            apiUrl: config.apiUrl,
            model: config.model,
          });
        // 未来添加其他提供商的验证
        default:
          return false;
      }
    } catch (error) {
      this.logger.error('验证AI配置失败:', error);
      return false;
    }
  }

  /**
   * 获取任务状态
   */
  getTaskStatus(taskId: string) {
    const task = this.taskQueue.getTask(taskId);
    if (!task) {
      return null;
    }

    return {
      taskId: task.id,
      status: task.status,
      progress: task.progress,
      currentFile: task.currentFile,
      processedFiles: task.processedFiles,
      totalFiles: task.totalFiles,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      error: task.error,
    };
  }

  /**
   * 获取任务结果
   */
  getTaskResult(taskId: string) {
    const task = this.taskQueue.getTask(taskId);
    if (!task) {
      return null;
    }

    if (task.status !== 'completed') {
      return {
        taskId: task.id,
        status: task.status,
        message: task.status === 'failed' ? task.error : '任务尚未完成',
      };
    }

    return {
      taskId: task.id,
      status: task.status,
      result: task.result,
    };
  }

  /**
   * 获取用户的任务列表
   */
  getUserTasks(userId: string, limit = 20) {
    return this.taskQueue.getUserTasks(userId, limit);
  }
}