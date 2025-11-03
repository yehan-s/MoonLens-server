import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class GitlabService {
  private readonly logger = new Logger(GitlabService.name);
  private readonly gitlabApiUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.gitlabApiUrl = this.configService.get<string>('GITLAB_BASE_URL') || 'https://gitlab.com';
  }

  /**
   * 构建GitLab请求头
   * - 如果传入的是 Bearer 令牌（以 "Bearer " 开头），则使用 Authorization 头
   * - 否则回退为 PRIVATE-TOKEN（PAT/系统令牌）
   */
  private buildHeaders(token: string | undefined): Record<string, string> {
    const headers: Record<string, string> = {};
    if (!token) return headers;

    // 兼容传入已带前缀的 OAuth 令牌
    if (/^Bearer\s+/i.test(token)) {
      headers['Authorization'] = token;
    } else {
      headers['PRIVATE-TOKEN'] = token;
    }
    return headers;
  }

  /**
   * 获取 MR 的代码变更
   */
  async getMergeRequestChanges(
    projectId: string,
    mrIid: string,
    token?: string,
    apiUrl?: string
  ): Promise<any> {
    this.logger.log(`获取MR变更: projectId=${projectId}, mrIid=${mrIid}`);

    try {
      const gitlabToken = token || this.configService.get<string>('GITLAB_TOKEN');
      const baseUrl = apiUrl || this.gitlabApiUrl;

      if (!gitlabToken) {
        this.logger.warn('GitLab token未配置');
        return null;
      }

      this.logger.log(`使用GitLab URL: ${baseUrl}`);
      const headers = this.buildHeaders(gitlabToken);
      if (headers['Authorization']) {
        this.logger.log('使用 Authorization 头访问 GitLab');
      } else if (headers['PRIVATE-TOKEN']) {
        this.logger.log('使用 PRIVATE-TOKEN 头访问 GitLab');
      }

      const response = await firstValueFrom(
        this.httpService.get(
          `${baseUrl}/api/v4/projects/${projectId}/merge_requests/${mrIid}/changes`,
          {
            headers,
          },
        ),
      );

      let data = response.data;

      // 兼容: 某些部署下 /changes 不返回 diff_refs，需要补打一条详情获取 diff_refs
      if (!data?.diff_refs) {
        try {
          const details = await firstValueFrom(
            this.httpService.get(
              `${baseUrl}/api/v4/projects/${projectId}/merge_requests/${mrIid}`,
              { headers },
            ),
          );
          data = { ...data, diff_refs: details.data?.diff_refs };
        } catch (e) {
          this.logger.warn(`获取MR详情(diff_refs)失败，仍返回changes: ${projectId} !${mrIid}`);
        }
      }

      // 返回完整对象（包含 diff_refs 与 changes），供上层构造 position
      return data;
    } catch (error: any) {
      const status = error?.response?.status;
      const data = error?.response?.data;
      this.logger.error(`获取MR变更失败: ${status || ''} ${error.message}`);
      if (status === 401) {
        this.logger.error('GitLab 返回 401，请检查令牌类型与权限（OAuth需 Authorization: Bearer，PAT 用 PRIVATE-TOKEN；需包含 api/read_repository）');
      }
      if (data) {
        this.logger.error(`GitLab 响应: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
      }
      return null;
    }
  }

  /**
   * 在 MR 上发布评论
   */
  async postMergeRequestNote(
    projectId: string,
    mrIid: string,
    body: string,
    token?: string,
  ): Promise<any> {
    this.logger.log(`发布MR评论: projectId=${projectId}, mrIid=${mrIid}`);
    
    try {
      const gitlabToken = token || this.configService.get<string>('GITLAB_BOT_TOKEN') || this.configService.get<string>('GITLAB_TOKEN');
      
      if (!gitlabToken) {
        throw new Error('GitLab token未配置');
      }

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.gitlabApiUrl}/api/v4/projects/${projectId}/merge_requests/${mrIid}/notes`,
          { body },
          {
            headers: {
              ...this.buildHeaders(gitlabToken),
              'Content-Type': 'application/json',
            },
          },
        ),
      );
      
      this.logger.log(`MR评论发布成功: noteId=${response.data.id}`);
      return response.data.changes || [];
    } catch (error) {
      this.logger.error(`发布MR评论失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 在 MR 上发布带位置的讨论（内联评论）
   */
  async postMergeRequestDiscussion(
    projectId: string,
    mrIid: string,
    body: string,
    position: {
      base_sha: string;
      head_sha: string;
      start_sha: string;
      position_type: 'text';
      new_path: string;
      new_line?: number;
      old_path?: string;
      old_line?: number;
    },
    token?: string,
  ): Promise<any> {
    this.logger.log(`发布MR内联评论: projectId=${projectId}, mrIid=${mrIid}, file=${position.new_path}:${position.new_line || position.old_line}`);
    
    try {
      const gitlabToken = token || this.configService.get<string>('GITLAB_BOT_TOKEN') || this.configService.get<string>('GITLAB_TOKEN');
      
      if (!gitlabToken) {
        throw new Error('GitLab token未配置');
      }

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.gitlabApiUrl}/api/v4/projects/${projectId}/merge_requests/${mrIid}/discussions`,
          { body, position },
          {
            headers: {
              ...this.buildHeaders(gitlabToken),
              'Content-Type': 'application/json',
            },
          },
        ),
      );
      
      this.logger.log(`MR内联评论发布成功: discussionId=${response.data.id}`);
      return response.data;
    } catch (error) {
      this.logger.error(`发布MR内联评论失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取所有项目的MR统计（聚合API）
   * 批量获取多个项目的MR数量，避免前端发送大量请求
   */
  async getMergeRequestStats(token?: string): Promise<any> {
    this.logger.log('获取MR统计数据');
    
    try {
      // 获取GitLab token
      const gitlabToken = token || this.configService.get<string>('GITLAB_TOKEN');
      
      if (!gitlabToken) {
        this.logger.warn('GitLab token未配置，返回空统计');
        return {
          totalOpenMRs: 0,
          projectStats: [],
          lastUpdated: new Date().toISOString(),
        };
      }

      // 获取用户的项目列表（限制数量避免超时）
      const projectsResponse = await firstValueFrom(
        this.httpService.get(`${this.gitlabApiUrl}/api/v4/projects`, {
          headers: this.buildHeaders(gitlabToken),
          params: {
            membership: true,
            per_page: 20, // 限制为20个项目
            order_by: 'last_activity_at',
            sort: 'desc',
          },
        }),
      );

      const projects = projectsResponse.data;
      const projectStats: Array<{
        projectId: number;
        projectName: string;
        openMRs: number;
        webUrl: string;
      }> = [];
      let totalOpenMRs = 0;

      // 批量获取每个项目的MR统计
      for (const project of projects) {
        try {
          const mrsResponse = await firstValueFrom(
            this.httpService.get(
              `${this.gitlabApiUrl}/api/v4/projects/${project.id}/merge_requests`,
              {
                headers: this.buildHeaders(gitlabToken),
                params: {
                  state: 'opened',
                  per_page: 100,
                },
              },
            ),
          );

          const openMRs = mrsResponse.data.length;
          if (openMRs > 0) {
            projectStats.push({
              projectId: project.id,
              projectName: project.name_with_namespace || project.name,
              openMRs: openMRs,
              webUrl: project.web_url,
            });
            totalOpenMRs += openMRs;
          }
        } catch (error) {
          this.logger.warn(`获取项目 ${project.name} 的MR失败:`, error.message);
        }
      }

      // 按MR数量排序
      projectStats.sort((a, b) => b.openMRs - a.openMRs);

      return {
        totalOpenMRs,
        projectStats,
        projectCount: projects.length,
        lastUpdated: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('获取MR统计失败:', error.message);
      return {
        totalOpenMRs: 0,
        projectStats: [],
        error: error.message,
      };
    }
  }
}
