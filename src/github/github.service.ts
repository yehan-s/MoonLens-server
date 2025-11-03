import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosRequestConfig } from 'axios';

@Injectable()
export class GitHubService {
  private readonly logger = new Logger(GitHubService.name);
  private readonly apiUrl = 'https://api.github.com';

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {}

  /**
   * 获取GitHub访问令牌
   */
  private getAccessToken(githubTokenHeader?: string): string | null {
    // 优先使用请求头中的github-token
    if (githubTokenHeader) {
      this.logger.debug(`使用请求头中的GitHub token`);
      return githubTokenHeader;
    }
    
    // 使用环境变量中的默认令牌
    const envToken = this.configService.get<string>('GITHUB_TOKEN');
    if (envToken) {
      this.logger.debug(`使用环境变量中的GitHub token`);
      return envToken;
    }
    
    this.logger.warn('未找到GitHub token');
    return null;
  }

  /**
   * 发送GitHub API请求
   */
  private async request<T>(
    path: string,
    config: AxiosRequestConfig = {},
    token?: string,
  ): Promise<T> {
    const accessToken = token || this.getAccessToken();
    this.logger.debug(`request() - path: ${path}, token provided: ${!!token}, accessToken: ${accessToken ? accessToken.substring(0, 10) + '...' : 'NONE'}`);

    if (!accessToken) {
      this.logger.error('GitHub访问令牌未配置');
      throw new Error('GitHub访问令牌未配置，请先配置GitHub Token');
    }

    const requestConfig: AxiosRequestConfig = {
      ...config,
      url: `${this.apiUrl}${path}`,
      headers: {
        ...config.headers,
        'Authorization': `token ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    };

    try {
      this.logger.debug(`GitHub API请求: ${path}`);
      const response = await firstValueFrom(
        this.httpService.request<T>(requestConfig)
      );
      return response.data;
    } catch (error: any) {
      this.logger.error(`GitHub API请求失败: ${error.message}`, error.stack);
      
      // 提供更详细的错误信息
      if (error.response?.status === 401) {
        throw new Error('GitHub认证失败：请检查Token是否有效');
      } else if (error.response?.status === 403) {
        throw new Error('GitHub API限流或权限不足');
      } else if (error.response?.status === 404) {
        throw new Error('GitHub资源不存在');
      } else {
        throw new Error(`GitHub API请求失败: ${error.response?.data?.message || error.message}`);
      }
    }
  }

  /**
   * 获取用户仓库列表
   */
  async getUserRepos(params?: {
    page?: number;
    per_page?: number;
    q?: string;
  }, token?: string): Promise<any[]> {
    this.logger.debug(`getUserRepos called with token: ${token ? token.substring(0, 10) + '...' : 'NONE'}`);
    const searchParams = new URLSearchParams();
    
    if (params?.page) searchParams.append('page', String(params.page));
    if (params?.per_page) searchParams.append('per_page', String(params.per_page));
    if (params?.q) {
      // 使用搜索API
      searchParams.append('q', `user:@me ${params.q}`);
      return this.request<{ items: any[] }>(
        `/search/repositories?${searchParams.toString()}`,
        { method: 'GET' },
        token,
      ).then(result => result.items);
    }
    
    return this.request<any[]>(
      `/user/repos?${searchParams.toString()}`,
      { method: 'GET' },
      token,
    );
  }

  /**
   * 获取仓库的Pull Requests
   */
  async getPullRequests(
    owner: string,
    repo: string,
    params?: {
      state?: 'open' | 'closed' | 'all';
      page?: number;
      per_page?: number;
    },
    token?: string,
  ): Promise<any[]> {
    const searchParams = new URLSearchParams();
    
    if (params?.state) searchParams.append('state', params.state);
    if (params?.page) searchParams.append('page', String(params.page));
    if (params?.per_page) searchParams.append('per_page', String(params.per_page));
    
    return this.request<any[]>(
      `/repos/${owner}/${repo}/pulls?${searchParams.toString()}`,
      { method: 'GET' },
      token,
    );
  }

  /**
   * 获取Pull Request详情
   */
  async getPullRequest(
    owner: string,
    repo: string,
    pull_number: number,
    token?: string,
  ): Promise<any> {
    return this.request<any>(
      `/repos/${owner}/${repo}/pulls/${pull_number}`,
      { method: 'GET' },
      token,
    );
  }

  /**
   * 获取Pull Request的文件变更
   */
  async getPullRequestFiles(
    owner: string,
    repo: string,
    pull_number: number,
    token?: string,
  ): Promise<any[]> {
    return this.request<any[]>(
      `/repos/${owner}/${repo}/pulls/${pull_number}/files`,
      { method: 'GET' },
      token,
    );
  }

  /**
   * 获取Pull Request的diff
   */
  async getPullRequestDiff(
    owner: string,
    repo: string,
    pull_number: number,
    token?: string,
  ): Promise<string> {
    return this.request<string>(
      `/repos/${owner}/${repo}/pulls/${pull_number}`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/vnd.github.v3.diff',
        },
      },
      token,
    );
  }

  /**
   * 获取文件内容
   * @param owner 仓库所有者
   * @param repo 仓库名称
   * @param path 文件路径
   * @param ref 分支或commit引用，默认为仓库默认分支
   * @param token GitHub token (可选)
   * @returns 文件内容（已解码的文本）
   */
  async getFileContent(
    owner: string,
    repo: string,
    path: string,
    ref?: string,
    token?: string,
  ): Promise<{ content: string; encoding: string; sha: string }> {
    this.logger.log(`获取文件内容: ${owner}/${repo}/${path}${ref ? `?ref=${ref}` : ''}`);

    const searchParams = new URLSearchParams();
    if (ref) searchParams.append('ref', ref);

    const result = await this.request<any>(
      `/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}${searchParams.toString() ? '?' + searchParams.toString() : ''}`,
      { method: 'GET' },
      token,
    );

    // GitHub API 返回 base64 编码的内容
    if (result.encoding === 'base64' && result.content) {
      const decodedContent = Buffer.from(result.content, 'base64').toString('utf-8');
      return {
        content: decodedContent,
        encoding: 'utf-8',
        sha: result.sha,
      };
    }

    // 如果不是 base64，直接返回
    return {
      content: result.content || '',
      encoding: result.encoding || 'utf-8',
      sha: result.sha,
    };
  }


  /**
   * 获取MR的代码变更 (统一接口,兼容GitLab命名)
   * @param projectId 格式: owner/repo
   * @param mrIid PR编号
   * @param token GitHub token (可选)
   */
  async getMergeRequestChanges(
    projectId: string,
    mrIid: string,
    token?: string,
  ): Promise<any[]> {
    this.logger.log(`获取GitHub PR变更: projectId=${projectId}, mrIid=${mrIid}`);

    // 解析 projectId (格式: owner/repo)
    const [owner, repo] = projectId.split('/');

    if (!owner || !repo) {
      throw new Error(`Invalid projectId format: ${projectId}. Expected format: owner/repo`);
    }

    const pull_number = parseInt(mrIid, 10);

    if (isNaN(pull_number)) {
      throw new Error(`Invalid PR number: ${mrIid}`);
    }

    return this.getPullRequestFiles(owner, repo, pull_number, token);
  }

  /**
   * 创建 PR Review (类似 CodeRabbit 的总评)
   */
  async createPullRequestReview(
    owner: string,
    repo: string,
    pull_number: number,
    body: string,
    event: 'COMMENT' | 'APPROVE' | 'REQUEST_CHANGES' = 'COMMENT',
    token?: string,
  ): Promise<any> {
    this.logger.log(`创建PR Review: ${owner}/${repo}#${pull_number}`);
    
    return this.request<any>(
      `/repos/${owner}/${repo}/pulls/${pull_number}/reviews`,
      {
        method: 'POST',
        data: {
          body,
          event,
        },
      },
      token,
    );
  }

  /**
   * 创建 PR 普通评论 (用于总评)
   */
  async createIssueComment(
    owner: string,
    repo: string,
    pull_number: number,
    body: string,
    token?: string,
  ): Promise<any> {
    this.logger.log(`创建PR评论: ${owner}/${repo}#${pull_number}`);
    
    return this.request<any>(
      `/repos/${owner}/${repo}/issues/${pull_number}/comments`,
      {
        method: 'POST',
        data: {
          body,
        },
      },
      token,
    );
  }

  /**
   * 创建 PR Review Comment (代码行级别评论)
   */
  async createPullRequestReviewComment(
    owner: string,
    repo: string,
    pull_number: number,
    body: string,
    commit_id: string,
    path: string,
    line: number,
    token?: string,
  ): Promise<any> {
    this.logger.log(`创建PR行评论: ${owner}/${repo}#${pull_number} ${path}:${line}`);
    
    return this.request<any>(
      `/repos/${owner}/${repo}/pulls/${pull_number}/comments`,
      {
        method: 'POST',
        data: {
          body,
          commit_id,
          path,
          line,
          side: 'RIGHT', // 评论新代码
        },
      },
      token,
    );
  }

  /**
   * 批量创建 Review Comments (使用 pending review)
   */
  async createPullRequestReviewWithComments(
    owner: string,
    repo: string,
    pull_number: number,
    body: string,
    comments: Array<{
      path: string;
      line: number;
      body: string;
    }>,
    commit_id: string,
    token?: string,
  ): Promise<any> {
    this.logger.log(`创建PR Review(含${comments.length}条评论): ${owner}/${repo}#${pull_number}`);
    
    return this.request<any>(
      `/repos/${owner}/${repo}/pulls/${pull_number}/reviews`,
      {
        method: 'POST',
        data: {
          body,
          event: 'COMMENT',
          commit_id,
          comments: comments.map(c => ({
            path: c.path,
            line: c.line,
            body: c.body,
            side: 'RIGHT',
          })),
        },
      },
      token,
    );
  }

  // ---- 清理评论（Issue Comments + Review Comments）----
  async listIssueComments(owner: string, repo: string, issue_number: number, token?: string): Promise<any[]> {
    return this.request<any[]>(
      `/repos/${owner}/${repo}/issues/${issue_number}/comments`,
      { method: 'GET' },
      token,
    )
  }

  async deleteIssueComment(owner: string, repo: string, comment_id: number, token?: string): Promise<void> {
    await this.request<any>(
      `/repos/${owner}/${repo}/issues/comments/${comment_id}`,
      { method: 'DELETE' },
      token,
    )
  }

  async listReviewComments(owner: string, repo: string, pull_number: number, token?: string): Promise<any[]> {
    return this.request<any[]>(
      `/repos/${owner}/${repo}/pulls/${pull_number}/comments`,
      { method: 'GET' },
      token,
    )
  }

  async deleteReviewComment(owner: string, repo: string, comment_id: number, token?: string): Promise<void> {
    await this.request<any>(
      `/repos/${owner}/${repo}/pulls/comments/${comment_id}`,
      { method: 'DELETE' },
      token,
    )
  }

  /**
   * 获取所有仓库的PR统计（聚合API）
   * 用于Dashboard显示待处理PR总数
   */
  async getMRStats(token?: string): Promise<{
    totalOpenMRs: number;
    projectStats: Array<{
      projectId: string;
      projectName: string;
      owner: string;
      repo: string;
      openMRs: number;
    }>;
  }> {
    try {
      this.logger.log('开始获取GitHub PR统计...');

      // 1. 获取用户所有仓库
      const repos = await this.getUserRepos({ per_page: 100 }, token);
      this.logger.log(`获取到 ${repos.length} 个仓库`);

      // 2. 并行获取每个仓库的open PR数量
      const projectStats = await Promise.all(
        repos.map(async (repo) => {
          try {
            const pulls = await this.getPullRequests(
              repo.owner.login,
              repo.name,
              { state: 'open', per_page: 100 },
              token,
            );

            return {
              projectId: String(repo.id),
              projectName: repo.name,
              owner: repo.owner.login,
              repo: repo.name,
              openMRs: pulls.length,
            };
          } catch (error) {
            this.logger.warn(`获取仓库 ${repo.full_name} 的PR失败:`, error.message);
            return {
              projectId: String(repo.id),
              projectName: repo.name,
              owner: repo.owner.login,
              repo: repo.name,
              openMRs: 0,
            };
          }
        })
      );

      // 3. 计算总数
      const totalOpenMRs = projectStats.reduce((sum, stat) => sum + stat.openMRs, 0);

      this.logger.log(`GitHub PR统计完成: 总计 ${totalOpenMRs} 个待处理PR`);

      return {
        totalOpenMRs,
        projectStats: projectStats.filter(stat => stat.openMRs > 0), // 只返回有PR的项目
      };
    } catch (error) {
      this.logger.error('获取GitHub PR统计失败:', error);
      throw error;
    }
  }

  /**
   * 在PR上创建评论（CodeRabbit 风格）
   * GitHub 使用 Issues API 来创建 PR 评论
   */
  async createPRComment(
    owner: string,
    repo: string,
    issueNumber: number,
    body: string,
    token?: string,
  ): Promise<any> {
    try {
      this.logger.log(`在 ${owner}/${repo}#${issueNumber} 上创建PR评论`);

      const comment = await this.request<any>(
        `/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
        {
          method: 'POST',
          data: {
            body: body,
          },
        },
        token,
      );

      this.logger.log(`成功创建PR评论: ${comment.id}`);
      return comment;
    } catch (error) {
      this.logger.error(`创建PR评论失败: ${error.message}`, error.stack);
      throw error;
    }
  }
}