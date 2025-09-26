import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Gitlab } from '@gitbeaker/node';

interface AnalysisResult {
  projectId: string;
  mergeRequestIid: number;
  filesAnalyzed: number;
  issuesFound: number;
  issues: Array<{
    file: string;
    line: number;
    severity: string;
    type: string;
    message: string;
    suggestion: string;
  }>;
  metrics?: {
    qualityScore?: number;
    complexity?: number;
    maintainability?: number;
  };
  summary?: string;
}

@Injectable()
export class GitLabService {
  private readonly logger = new Logger(GitLabService.name);
  private gitlab: InstanceType<typeof Gitlab>;
  private readonly maxRetries = 3;
  private readonly rateLimit = 2000; // GitLab API 限制: 2000 req/min

  constructor(private configService: ConfigService) {
    this.initializeGitLabClient();
  }

  /**
   * 初始化 GitLab 客户端
   */
  private initializeGitLabClient() {
    const host = this.configService.get<string>('GITLAB_BASE_URL', 'https://gitlab.com');
    const token = this.configService.get<string>('GITLAB_ACCESS_TOKEN');

    if (!token) {
      this.logger.warn('GitLab access token not configured');
    }

    this.gitlab = new Gitlab({
      host,
      token: token || '',
    });
  }

  /**
   * 发布分析结果到 MR
   */
  async postAnalysisResults(
    projectId: string | number,
    mergeRequestIid: number,
    results: AnalysisResult,
  ): Promise<void> {
    try {
      // 格式化结果为 Markdown
      const comment = this.formatResultsAsMarkdown(results);
      
      // 发布到 MR 讨论
      await this.createMergeRequestComment(projectId, mergeRequestIid, comment);
      
      // 如果有严重问题，添加行内评论
      if (results.issues && results.issues.length > 0) {
        await this.addInlineComments(projectId, mergeRequestIid, results.issues);
      }

      this.logger.log(`Posted analysis results to MR ${mergeRequestIid}`);
    } catch (error) {
      this.logger.error('Failed to post results to GitLab:', error);
      throw error;
    }
  }

  /**
   * 创建 MR 评论
   */
  private async createMergeRequestComment(
    projectId: string | number,
    mergeRequestIid: number,
    body: string,
  ): Promise<void> {
    let retries = 0;
    
    while (retries < this.maxRetries) {
      try {
        await this.gitlab.MergeRequestNotes.create(
          projectId,
          mergeRequestIid,
          body,
        );
        return;
      } catch (error: any) {
        retries++;
        
        // 处理速率限制
        if (error.response?.status === 429) {
          const retryAfter = parseInt(error.response.headers['retry-after'] || '60');
          this.logger.warn(`Rate limited, retrying after ${retryAfter} seconds`);
          await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
          continue;
        }
        
        if (retries >= this.maxRetries) {
          throw error;
        }
        
        // 指数退避
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, retries) * 1000));
      }
    }
  }

  /**
   * 添加行内评论
   */
  private async addInlineComments(
    projectId: string | number,
    mergeRequestIid: number,
    issues: AnalysisResult['issues'],
  ): Promise<void> {
    // 只对高严重度问题添加行内评论
    const criticalIssues = issues.filter(
      issue => issue.severity === 'critical' || issue.severity === 'high'
    );

    // 限制行内评论数量，避免过度干扰
    const maxInlineComments = 10;
    const issuesToComment = criticalIssues.slice(0, maxInlineComments);

    for (const issue of issuesToComment) {
      try {
        const comment = this.formatIssueAsInlineComment(issue);
        
        // 创建讨论线程
        await this.gitlab.MergeRequestDiscussions.create(
          projectId,
          mergeRequestIid,
          comment,
        );
      } catch (error) {
        // 行内评论失败不影响整体流程
        this.logger.warn(`Failed to add inline comment for ${issue.file}:${issue.line}`, error);
      }
    }
  }

  /**
   * 格式化结果为 Markdown
   */
  private formatResultsAsMarkdown(results: AnalysisResult): string {
    const emoji = this.getStatusEmoji(results);
    const title = `## ${emoji} MoonLens 代码分析报告`;

    // 摘要部分
    const summary = `
### 📊 分析摘要
- **分析文件数**: ${results.filesAnalyzed}
- **发现问题数**: ${results.issuesFound}
- **代码质量分数**: ${results.metrics?.qualityScore || 'N/A'}/100
${results.summary ? `\n${results.summary}` : ''}
`;

    // 问题统计
    const issueStats = this.generateIssueStatistics(results.issues);
    const statistics = `
### 📈 问题统计
${issueStats}
`;

    // 详细问题列表
    let detailSection = '';
    if (results.issues && results.issues.length > 0) {
      const issuesByFile = this.groupIssuesByFile(results.issues);
      detailSection = `
### 🔍 详细问题

${Object.entries(issuesByFile)
  .map(([file, fileIssues]) => `
<details>
<summary><b>${file}</b> (${fileIssues.length} 个问题)</summary>

${fileIssues
  .map(issue => `
- **Line ${issue.line}** [${this.getSeverityBadge(issue.severity)}] \`${issue.type}\`
  - ${issue.message}
  - 💡 建议: ${issue.suggestion}
`)
  .join('')}
</details>
`)
  .join('')}
`;
    } else {
      detailSection = `
### ✅ 未发现问题
恭喜！代码质量良好，未发现需要修复的问题。
`;
    }

    // 指标部分
    const metrics = results.metrics ? `
### 📏 代码指标
| 指标 | 分值 | 状态 |
|------|------|------|
| 质量分数 | ${results.metrics.qualityScore || 'N/A'}/100 | ${this.getQualityStatus(results.metrics.qualityScore)} |
| 复杂度 | ${results.metrics.complexity || 'N/A'}/10 | ${this.getComplexityStatus(results.metrics.complexity)} |
| 可维护性 | ${results.metrics.maintainability || 'N/A'}/100 | ${this.getMaintainabilityStatus(results.metrics.maintainability)} |
` : '';

    // 页脚
    const footer = `
---
<sub>🤖 由 MoonLens AI 自动生成 | ${new Date().toLocaleString('zh-CN')} | [查看详情](${this.configService.get('APP_URL')}/projects/${results.projectId}/analysis)</sub>
`;

    return `${title}
${summary}
${statistics}
${detailSection}
${metrics}
${footer}`;
  }

  /**
   * 格式化问题为行内评论
   */
  private formatIssueAsInlineComment(issue: any): string {
    return `**[${this.getSeverityBadge(issue.severity)}]** ${issue.message}

💡 **建议**: ${issue.suggestion}

类型: \`${issue.type}\``;
  }

  /**
   * 获取状态表情
   */
  private getStatusEmoji(results: AnalysisResult): string {
    if (results.issuesFound === 0) {
      return '✅';
    }
    const hasCritical = results.issues?.some(i => i.severity === 'critical');
    if (hasCritical) {
      return '🚨';
    }
    const hasHigh = results.issues?.some(i => i.severity === 'high');
    if (hasHigh) {
      return '⚠️';
    }
    return '💡';
  }

  /**
   * 获取严重度徽章
   */
  private getSeverityBadge(severity: string): string {
    const badges = {
      critical: '🔴 严重',
      high: '🟠 高',
      medium: '🟡 中',
      low: '🔵 低',
      info: '⚪ 信息',
    };
    return badges[severity as keyof typeof badges] || severity;
  }

  /**
   * 生成问题统计
   */
  private generateIssueStatistics(issues: AnalysisResult['issues']): string {
    const counts = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    };

    issues.forEach(issue => {
      counts[issue.severity as keyof typeof counts]++;
    });

    const rows = Object.entries(counts)
      .filter(([_, count]) => count > 0)
      .map(([severity, count]) => `| ${this.getSeverityBadge(severity)} | ${count} |`)
      .join('\n');

    if (!rows) {
      return '无问题';
    }

    return `| 严重度 | 数量 |
|--------|------|
${rows}`;
  }

  /**
   * 按文件分组问题
   */
  private groupIssuesByFile(issues: AnalysisResult['issues']): Record<string, typeof issues> {
    const grouped: Record<string, typeof issues> = {};
    
    issues.forEach(issue => {
      if (!grouped[issue.file]) {
        grouped[issue.file] = [];
      }
      grouped[issue.file].push(issue);
    });

    // 按行号排序
    Object.keys(grouped).forEach(file => {
      grouped[file].sort((a, b) => a.line - b.line);
    });

    return grouped;
  }

  /**
   * 获取质量状态
   */
  private getQualityStatus(score?: number): string {
    if (!score) return '⚪';
    if (score >= 80) return '🟢 优秀';
    if (score >= 60) return '🟡 良好';
    if (score >= 40) return '🟠 需改进';
    return '🔴 较差';
  }

  /**
   * 获取复杂度状态
   */
  private getComplexityStatus(complexity?: number): string {
    if (!complexity) return '⚪';
    if (complexity <= 3) return '🟢 简单';
    if (complexity <= 6) return '🟡 中等';
    if (complexity <= 8) return '🟠 复杂';
    return '🔴 过于复杂';
  }

  /**
   * 获取可维护性状态
   */
  private getMaintainabilityStatus(score?: number): string {
    if (!score) return '⚪';
    if (score >= 80) return '🟢 易维护';
    if (score >= 60) return '🟡 可维护';
    if (score >= 40) return '🟠 难维护';
    return '🔴 极难维护';
  }

  /**
   * 获取项目信息
   */
  async getProject(projectId: string | number): Promise<any> {
    try {
      return await this.gitlab.Projects.show(projectId);
    } catch (error) {
      this.logger.error(`Failed to get project ${projectId}:`, error);
      throw error;
    }
  }

  /**
   * 获取 MR 信息
   */
  async getMergeRequest(projectId: string | number, mergeRequestIid: number): Promise<any> {
    try {
      return await this.gitlab.MergeRequests.show(projectId, mergeRequestIid);
    } catch (error) {
      this.logger.error(`Failed to get MR ${mergeRequestIid}:`, error);
      throw error;
    }
  }
}