import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GitLabMetricsService } from './gitlab-metrics.service';
import { FailureRecoveryService } from './failure-recovery.service';
import { ApiOptimizationService } from './api-optimization.service';

type RetryOptions = { retries: number; baseDelayMs: number };

@Injectable()
export class GitlabApiClientService {
  private readonly logger = new Logger(GitlabApiClientService.name);
  private host: string;
  private token?: string;
  private authType?: 'PAT' | 'OAUTH';
  private refresher?: () => Promise<string>; // 可选：提供刷新方法（用于 OAUTH）
  // 简易去重：相同 method+url 的并发请求复用同一个 Promise，避免风暴
  private inflight = new Map<string, Promise<any>>();
  private breakerKey: string;

  constructor(
    private readonly config: ConfigService,
    private readonly metrics: GitLabMetricsService,
    private readonly breaker: FailureRecoveryService,
    private readonly optimizer: ApiOptimizationService,
  ) {
    this.host = this.config.get<string>('GITLAB_BASE_URL') || 'https://gitlab.com';
    this.token = this.config.get<string>('GITLAB_ACCESS_TOKEN');
    this.breakerKey = `gitlab:${this.host}`;
    console.log('[DEBUG] GitLab API Client initialized:', {
      host: this.host,
      tokenExists: !!this.token,
      tokenLength: this.token?.length,
      tokenPrefix: this.token?.substring(0, 8)
    });
  }

  configure(opts: { host?: string; token?: string; authType?: 'PAT' | 'OAUTH'; refresher?: () => Promise<string> }) {
    if (opts.host) this.host = opts.host;
    if (opts.token) this.token = opts.token;
    if (opts.authType) this.authType = opts.authType;
    if (opts.refresher) this.refresher = opts.refresher;
    this.breakerKey = `gitlab:${this.host}`;
  }

  private getAuthHeaders() {
    if (!this.token) return {};
    // 优先使用显式 authType
    if (this.authType === 'OAUTH') return { Authorization: `Bearer ${this.token}` } as any
    if (this.authType === 'PAT') return { 'Private-Token': this.token } as any
    // 启发式：GitLab PAT 通常以 glpat- 开头
    if (this.token.startsWith('glpat-')) return { 'Private-Token': this.token } as any
    // 默认按 PAT 处理（更广泛兼容）
    return { 'Private-Token': this.token } as any
  }

  private getAuthHeadersWithOverride(overrideToken?: string, type?: 'BEARER' | 'PRIVATE') {
    const token = overrideToken || this.token;
    console.log('[DEBUG] getAuthHeadersWithOverride:', {
      overrideToken: overrideToken ? `${overrideToken.substring(0, 8)}...` : 'undefined',
      thisToken: this.token ? `${this.token.substring(0, 8)}...` : 'undefined',
      finalToken: token ? `${token.substring(0, 8)}...` : 'undefined',
      tokenExists: !!token
    });
    if (!token) return {};
    // GitLab 支持 Private-Token 或 OAuth Token（Authorization: Bearer）
    if (type === 'BEARER') return { Authorization: `Bearer ${token}` } as any
    if (type === 'PRIVATE') return { 'Private-Token': token } as any
    // 启发式：优先识别 PAT
    if (token.startsWith('glpat-')) return { 'Private-Token': token } as any
    // 默认按 PAT 处理（后续必要时可扩展更多判定）
    return { 'Private-Token': token } as any
  }

  private async doFetch<T>(url: string, init: RequestInit & { retry?: RetryOptions; timeoutMs?: number; _overrideToken?: string; _overrideTokenAuth?: 'BEARER' | 'PRIVATE' } = {}): Promise<T> {
    const key = `${((init as any)?.method || 'GET').toString().toUpperCase()}:${url}`;
    const existing = this.inflight.get(key) as Promise<T> | undefined;
    if (existing) return existing;
    const { retry, _overrideToken, _overrideTokenAuth, ...rest } = init as any;
    const retries = retry?.retries ?? 3;
    const base = retry?.baseDelayMs ?? 300;

    let lastErr: any;
    // 断路器：请求前检查
    const gate = this.breaker.beforeRequest({ key: this.breakerKey });
    if (!gate.allow) {
      const err = new Error(gate.reason || 'circuit_open');
      (err as any).code = 'CIRCUIT_OPEN';
      throw err;
    }
    const runner = (async () => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const started = process.hrtime.bigint();
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), (rest as any).timeoutMs ?? 10000);
        const exec = () => fetch(url, {
          ...rest,
          headers: {
            'Content-Type': 'application/json',
            ...(rest.headers || {}),
            ...(this.getAuthHeadersWithOverride(_overrideToken, _overrideTokenAuth)),
          },
          signal: controller.signal,
        } as any);
        const res = await this.optimizer.wrapFetch(url, rest, exec);
        clearTimeout(t);
        const method = ((rest as any).method || 'GET').toString().toUpperCase();
        const path = (() => { try { return new URL(url).pathname } catch { return url } })();
        const status = String(res.status);
        const elapsed = Number(process.hrtime.bigint() - started) / 1e9;
        this.metrics.observeApi(method, path, status, elapsed);

        if (!res.ok) {
          // 429 退避
          if (res.status === 429) {
            const ra = res.headers.get('retry-after');
            const wait = ra ? parseInt(ra, 10) * 1000 : base * Math.pow(2, attempt);
            await new Promise((r) => setTimeout(r, wait));
            continue;
          }
          // 401 针对 OAUTH 可尝试刷新一次
          if (res.status === 401 && this.authType === 'OAUTH' && this.refresher) {
            try {
              const newToken = await this.refresher();
              this.token = newToken;
              // 立即重试本次
              continue;
            } catch (e) {
              lastErr = e;
            }
          }
          const text = await res.text();
          throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
        }
        const ct = res.headers.get('content-type') || '';
        const data = (ct.includes('application/json') ? await res.json() : (await res.text() as any)) as T;
        // 成功：关闭或重置断路器
        this.breaker.afterSuccess({ key: this.breakerKey });
        return data;
      } catch (err) {
        lastErr = err;
        if (attempt < retries) {
          const delay = base * Math.pow(2, attempt);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
      }
      break;
    }
    this.logger.error(`GitLab request failed: ${url}`, lastErr?.stack || String(lastErr));
    try {
      const method = ((init as any).method || 'GET').toString().toUpperCase();
      const path = (() => { try { return new URL(url).pathname } catch { return url } })();
      this.metrics.observeApi(method, path, 'error', 0);
    } catch {}
    // 失败：计入断路器
    try { this.breaker.afterFailure({ key: this.breakerKey }); } catch {}
    throw lastErr;
  })();
    this.inflight.set(key, runner);
    try {
      return await runner as T;
    } finally {
      this.inflight.delete(key);
    }
  }

  async ping(): Promise<boolean> {
    try {
      await this.getCurrentUser();
      return true;
    } catch {
      return false;
    }
  }

  async getCurrentUser(): Promise<any> {
    const api = `${this.host}/api/v4/user`;
    return this.doFetch(api, { retry: { retries: 2, baseDelayMs: 300 } } as any);
  }

  async listProjects(params: { membership?: boolean; search?: string; perPage?: number } = {}): Promise<any[]> {
    const qs = new URLSearchParams();
    if (params.membership) qs.set('membership', 'true');
    if (params.search) qs.set('search', params.search);
    if (params.perPage) qs.set('per_page', String(params.perPage));
    const api = `${this.host}/api/v4/projects?${qs.toString()}`;
    return this.doFetch<any[]>(api, { retry: { retries: 2, baseDelayMs: 400 } } as any);
  }

  async getProject(id: number | string): Promise<any> {
    const api = `${this.host}/api/v4/projects/${encodeURIComponent(String(id))}`;
    return this.doFetch<any>(api, { retry: { retries: 2, baseDelayMs: 400 } } as any);
  }

  async listProjectMembers(projectId: number | string, params: { perPage?: number; page?: number } = {}): Promise<any[]> {
    const qs = new URLSearchParams();
    if (params.perPage) qs.set('per_page', String(params.perPage));
    if (params.page) qs.set('page', String(params.page));
    // 使用 /members/all 以包含继承的权限
    const api = `${this.host}/api/v4/projects/${encodeURIComponent(String(projectId))}/members/all?${qs.toString()}`;
    return this.doFetch<any[]>(api, { retry: { retries: 2, baseDelayMs: 400 } } as any);
  }

  async listProjectBranches(projectId: number | string, params: { perPage?: number; page?: number } = {}): Promise<any[]> {
    const qs = new URLSearchParams();
    if (params.perPage) qs.set('per_page', String(params.perPage));
    if (params.page) qs.set('page', String(params.page));
    const api = `${this.host}/api/v4/projects/${encodeURIComponent(String(projectId))}/repository/branches?${qs.toString()}`;
    return this.doFetch<any[]>(api, { retry: { retries: 2, baseDelayMs: 400 } } as any);
  }

  // Webhooks
  async listProjectHooks(projectId: number | string): Promise<any[]> {
    const api = `${this.host}/api/v4/projects/${encodeURIComponent(String(projectId))}/hooks`;
    return this.doFetch<any[]>(api, { retry: { retries: 2, baseDelayMs: 400 } } as any);
  }

  async createProjectHook(projectId: number | string, body: any): Promise<any> {
    const api = `${this.host}/api/v4/projects/${encodeURIComponent(String(projectId))}/hooks`;
    return this.doFetch<any>(api, { method: 'POST', body: JSON.stringify(body), retry: { retries: 2, baseDelayMs: 400 } } as any);
  }

  async updateProjectHook(projectId: number | string, hookId: number | string, body: any): Promise<any> {
    const api = `${this.host}/api/v4/projects/${encodeURIComponent(String(projectId))}/hooks/${encodeURIComponent(String(hookId))}`;
    return this.doFetch<any>(api, { method: 'PUT', body: JSON.stringify(body), retry: { retries: 2, baseDelayMs: 400 } } as any);
  }

  async deleteProjectHook(projectId: number | string, hookId: number | string): Promise<void> {
    const api = `${this.host}/api/v4/projects/${encodeURIComponent(String(projectId))}/hooks/${encodeURIComponent(String(hookId))}`;
    await this.doFetch<any>(api, { method: 'DELETE', retry: { retries: 1, baseDelayMs: 300 } } as any);
  }

  // Merge Requests
  async listGroups(params: { search?: string; per_page?: number; page?: number; membership?: boolean } = {}): Promise<any[]> {
    const qs = new URLSearchParams();
    if (params.search) qs.set('search', params.search);
    if (params.per_page) qs.set('per_page', String(params.per_page));
    if (params.page) qs.set('page', String(params.page));
    if (params.membership !== false) qs.set('membership', 'true');
    const api = `${this.host}/api/v4/groups?${qs.toString()}`;
    return this.doFetch<any[]>(api, { retry: { retries: 2, baseDelayMs: 400 } } as any);
  }
  async listGroupMergeRequests(
    groupId: number | string,
    params: { state?: 'opened' | 'merged' | 'closed'; per_page?: number; page?: number; include_subgroups?: boolean } = {},
  ): Promise<any[]> {
    const qs = new URLSearchParams()
    if (params.state) qs.set('state', params.state)
    if (params.per_page) qs.set('per_page', String(params.per_page))
    if (params.page) qs.set('page', String(params.page))
    if (params.include_subgroups !== false) qs.set('include_subgroups', 'true')
    const api = `${this.host}/api/v4/groups/${encodeURIComponent(String(groupId))}/merge_requests?${qs.toString()}`
    return this.doFetch<any[]>(api, { retry: { retries: 2, baseDelayMs: 400 } } as any)
  }
  async listMergeRequests(
    projectId: number | string,
    params: { state?: 'opened' | 'merged' | 'closed'; per_page?: number; page?: number } = {},
  ): Promise<any[]> {
    const qs = new URLSearchParams()
    if (params.state) qs.set('state', params.state)
    if (params.per_page) qs.set('per_page', String(params.per_page))
    if (params.page) qs.set('page', String(params.page))
    const api = `${this.host}/api/v4/projects/${encodeURIComponent(String(projectId))}/merge_requests?${qs.toString()}`
    return this.doFetch<any[]>(api, { retry: { retries: 2, baseDelayMs: 400 } } as any)
  }

  async getMergeRequest(projectId: number | string, mergeRequestIid: number | string): Promise<any> {
    const api = `${this.host}/api/v4/projects/${encodeURIComponent(String(projectId))}/merge_requests/${encodeURIComponent(
      String(mergeRequestIid),
    )}`
    return this.doFetch<any>(api, { retry: { retries: 2, baseDelayMs: 400 } } as any)
  }

  async listMergeRequestDiffs(projectId: number | string, mergeRequestIid: number | string): Promise<any[]> {
    const api = `${this.host}/api/v4/projects/${encodeURIComponent(String(projectId))}/merge_requests/${encodeURIComponent(
      String(mergeRequestIid),
    )}/changes`
    const res = await this.doFetch<any>(api, { retry: { retries: 2, baseDelayMs: 400 } } as any)
    // GitLab 的 /changes 返回对象，包含 changes 列表
    return res?.changes || []
  }

  async listMergeRequestCommits(projectId: number | string, mergeRequestIid: number | string): Promise<any[]> {
    const api = `${this.host}/api/v4/projects/${encodeURIComponent(String(projectId))}/merge_requests/${encodeURIComponent(
      String(mergeRequestIid),
    )}/commits`
    const res = await this.doFetch<any[]>(api, { retry: { retries: 2, baseDelayMs: 400 } } as any)
    return res || []
  }

  /**
   * 获取 MR 审批状态（GitLab Approvals）
   */
  async getMergeRequestApprovals(projectId: number | string, mrIid: number | string): Promise<any> {
    const api = `${this.host}/api/v4/projects/${encodeURIComponent(String(projectId))}/merge_requests/${encodeURIComponent(String(mrIid))}/approvals`;
    return this.doFetch<any>(api, { retry: { retries: 2, baseDelayMs: 400 } } as any);
  }

  /**
   * 执行批准 MR
   */
  async approveMergeRequest(projectId: number | string, mrIid: number | string): Promise<any> {
    const api = `${this.host}/api/v4/projects/${encodeURIComponent(String(projectId))}/merge_requests/${encodeURIComponent(String(mrIid))}/approve`;
    return this.doFetch<any>(api, { method: 'POST', body: JSON.stringify({}), retry: { retries: 2, baseDelayMs: 400 } } as any);
  }

  /**
   * 取消批准 MR
   */
  async unapproveMergeRequest(projectId: number | string, mrIid: number | string): Promise<any> {
    const api = `${this.host}/api/v4/projects/${encodeURIComponent(String(projectId))}/merge_requests/${encodeURIComponent(String(mrIid))}/unapprove`;
    return this.doFetch<any>(api, { method: 'POST', body: JSON.stringify({}), retry: { retries: 2, baseDelayMs: 400 } } as any);
  }

  // 兼容旧方法名
  async createMergeRequestNote(projectId: number | string, mrIid: number | string, note: { body: string; position?: any }) {
    return this.addMrNote(projectId, mrIid, { body: note.body, position: note.position })
  }

  // 创建讨论（支持行内评论）
  async createMergeRequestDiscussion(
    projectId: number | string,
    mrIid: number | string,
    payload: { body: string; position?: any },
    userToken?: string,
    authType?: 'BEARER' | 'PRIVATE',
  ) {
    return this.addMrDiscussion(projectId, mrIid, payload, userToken, authType)
  }

  // Repository tree & file
  async getRepositoryTree(
    projectId: number | string,
    params: { path?: string; ref?: string; recursive?: boolean } = {},
  ): Promise<any[]> {
    const qs = new URLSearchParams()
    if (params.path) qs.set('path', params.path)
    if (params.ref) qs.set('ref', params.ref)
    if (params.recursive) qs.set('recursive', 'true')
    const api = `${this.host}/api/v4/projects/${encodeURIComponent(String(projectId))}/repository/tree?${qs.toString()}`
    return this.doFetch<any[]>(api, { retry: { retries: 2, baseDelayMs: 400 } } as any)
  }

  async getFileRaw(projectId: number | string, filePath: string, ref: string): Promise<string> {
    const api = `${this.host}/api/v4/projects/${encodeURIComponent(String(projectId))}/repository/files/${encodeURIComponent(
      filePath,
    )}/raw?ref=${encodeURIComponent(ref)}`
    // 取 raw 文本
    return this.doFetch<string>(api, { retry: { retries: 1, baseDelayMs: 300 } } as any)
  }

  // Create branch
  async createBranch(projectId: number | string, branch: string, ref: string): Promise<any> {
    const api = `${this.host}/api/v4/projects/${encodeURIComponent(String(projectId))}/repository/branches?branch=${encodeURIComponent(branch)}&ref=${encodeURIComponent(ref)}`
    return this.doFetch<any>(api, { method: 'POST', retry: { retries: 1, baseDelayMs: 300 } } as any)
  }

  // MR notes & discussions
  async listMrDiscussions(projectId: number | string, mrIid: number | string): Promise<any[]> {
    const api = `${this.host}/api/v4/projects/${encodeURIComponent(String(projectId))}/merge_requests/${encodeURIComponent(String(mrIid))}/discussions`;
    return this.doFetch<any[]>(api, { retry: { retries: 2, baseDelayMs: 400 } } as any);
  }

  async listMrNotes(projectId: number | string, mrIid: number | string, userToken?: string, authType?: 'BEARER' | 'PRIVATE'): Promise<any[]> {
    const api = `${this.host}/api/v4/projects/${encodeURIComponent(String(projectId))}/merge_requests/${encodeURIComponent(String(mrIid))}/notes`;
    return this.doFetch<any[]>(api, { retry: { retries: 2, baseDelayMs: 400 }, _overrideToken: userToken, _overrideTokenAuth: authType } as any);
  }

  async addMrNote(projectId: number | string, mrIid: number | string, body: { body: string; position?: any }): Promise<any> {
    const api = `${this.host}/api/v4/projects/${encodeURIComponent(String(projectId))}/merge_requests/${encodeURIComponent(String(mrIid))}/notes`;
    return this.doFetch<any>(api, { method: 'POST', body: JSON.stringify(body), retry: { retries: 2, baseDelayMs: 400 } } as any);
  }

  async addMrDiscussion(
    projectId: number | string,
    mrIid: number | string,
    body: { body: string; position?: any },
    userToken?: string,
    authType?: 'BEARER' | 'PRIVATE',
  ): Promise<any> {
    const api = `${this.host}/api/v4/projects/${encodeURIComponent(String(projectId))}/merge_requests/${encodeURIComponent(String(mrIid))}/discussions`;
    return this.doFetch<any>(api, { method: 'POST', body: JSON.stringify(body), retry: { retries: 2, baseDelayMs: 400 }, _overrideToken: userToken, _overrideTokenAuth: authType } as any);
  }

  async replyMrDiscussion(projectId: number | string, mrIid: number | string, discussionId: string, body: { body: string }): Promise<any> {
    const api = `${this.host}/api/v4/projects/${encodeURIComponent(String(projectId))}/merge_requests/${encodeURIComponent(String(mrIid))}/discussions/${encodeURIComponent(discussionId)}/notes`;
    return this.doFetch<any>(api, { method: 'POST', body: JSON.stringify(body), retry: { retries: 2, baseDelayMs: 400 } } as any);
  }

  async deleteMrNote(projectId: number | string, mrIid: number | string, noteId: string | number, userToken?: string, authType?: 'BEARER' | 'PRIVATE'): Promise<void> {
    const api = `${this.host}/api/v4/projects/${encodeURIComponent(String(projectId))}/merge_requests/${encodeURIComponent(String(mrIid))}/notes/${encodeURIComponent(String(noteId))}`;
    await this.doFetch<any>(api, { method: 'DELETE', retry: { retries: 1, baseDelayMs: 300 }, _overrideToken: userToken, _overrideTokenAuth: authType } as any);
  }

  async deleteDiscussionNote(projectId: number | string, mrIid: number | string, discussionId: string, noteId: string | number, userToken?: string, authType?: 'BEARER' | 'PRIVATE'): Promise<void> {
    const api = `${this.host}/api/v4/projects/${encodeURIComponent(String(projectId))}/merge_requests/${encodeURIComponent(String(mrIid))}/discussions/${encodeURIComponent(discussionId)}/notes/${encodeURIComponent(String(noteId))}`;
    await this.doFetch<any>(api, { method: 'DELETE', retry: { retries: 1, baseDelayMs: 300 }, _overrideToken: userToken, _overrideTokenAuth: authType } as any);
  }

  async updateMr(projectId: number | string, mrIid: number | string, body: any): Promise<any> {
    const api = `${this.host}/api/v4/projects/${encodeURIComponent(String(projectId))}/merge_requests/${encodeURIComponent(String(mrIid))}`;
    return this.doFetch<any>(api, { method: 'PUT', body: JSON.stringify(body), retry: { retries: 2, baseDelayMs: 400 } } as any);
  }
}
