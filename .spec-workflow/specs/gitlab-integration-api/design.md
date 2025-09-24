# Design: GitLab Integration API

## 系统架构

### 核心组件设计

```
GitLab Integration API
├── Controllers
│   ├── GitLabController (项目导入、连接管理)
│   ├── WebhookController (Webhook事件处理)
│   ├── ProjectSyncController (项目同步)
│   └── MergeRequestController (MR操作)
├── Services
│   ├── GitLabService (GitLab API调用)
│   ├── WebhookService (事件处理)
│   ├── ProjectSyncService (数据同步)
│   └── MergeRequestService (MR管理)
├── Guards
│   ├── GitLabTokenGuard (Token验证)
│   └── WebhookSignatureGuard (Webhook签名验证)
├── Interceptors
│   ├── GitLabRateLimitInterceptor (频率限制)
│   └── WebhookLoggingInterceptor (事件日志)
├── Queues
│   ├── WebhookQueue (异步事件处理)
│   ├── SyncQueue (数据同步队列)
│   └── RetryQueue (失败重试队列)
└── External Services
    ├── GitLabAPIClient (官方API客户端)
    └── WebhookVerificationService (签名验证)
```

## 数据库设计

### 表结构设计

```sql
-- GitLab连接表
CREATE TABLE gitlab_connections (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    gitlab_url VARCHAR(500) NOT NULL DEFAULT 'https://gitlab.com',
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    token_type VARCHAR(20) DEFAULT 'Bearer',
    expires_at DATETIME,
    gitlab_user_id BIGINT,
    gitlab_username VARCHAR(100),
    gitlab_email VARCHAR(200),
    avatar_url VARCHAR(500),
    connection_status ENUM('active', 'expired', 'revoked', 'error') DEFAULT 'active',
    last_sync_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_user_id (user_id),
    INDEX idx_gitlab_user_id (gitlab_user_id),
    INDEX idx_connection_status (connection_status),
    UNIQUE KEY uk_user_gitlab (user_id, gitlab_url)
);

-- GitLab项目表
CREATE TABLE gitlab_projects (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    project_id BIGINT NOT NULL,
    gitlab_connection_id BIGINT NOT NULL,
    gitlab_project_id BIGINT NOT NULL,
    name VARCHAR(200) NOT NULL,
    full_name VARCHAR(400) NOT NULL,
    description TEXT,
    default_branch VARCHAR(100) DEFAULT 'main',
    visibility_level ENUM('private', 'internal', 'public') DEFAULT 'private',
    ssh_url_to_repo VARCHAR(500),
    http_url_to_repo VARCHAR(500),
    web_url VARCHAR(500),
    avatar_url VARCHAR(500),
    star_count INT DEFAULT 0,
    forks_count INT DEFAULT 0,
    last_activity_at DATETIME,
    created_at_gitlab DATETIME,
    sync_status ENUM('pending', 'syncing', 'completed', 'failed') DEFAULT 'pending',
    webhook_id BIGINT,
    webhook_url VARCHAR(500),
    webhook_secret VARCHAR(100),
    webhook_status ENUM('inactive', 'active', 'failed') DEFAULT 'inactive',
    is_archived BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (gitlab_connection_id) REFERENCES gitlab_connections(id) ON DELETE CASCADE,
    INDEX idx_project_id (project_id),
    INDEX idx_gitlab_connection (gitlab_connection_id),
    INDEX idx_gitlab_project_id (gitlab_project_id),
    INDEX idx_sync_status (sync_status),
    INDEX idx_webhook_status (webhook_status),
    UNIQUE KEY uk_connection_gitlab_project (gitlab_connection_id, gitlab_project_id)
);

-- Webhook事件表
CREATE TABLE webhook_events (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    gitlab_project_id BIGINT NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    event_data JSON NOT NULL,
    object_kind VARCHAR(50),
    object_id BIGINT,
    user_id BIGINT,
    user_name VARCHAR(100),
    project_id BIGINT,
    source_branch VARCHAR(200),
    target_branch VARCHAR(200),
    merge_request_id BIGINT,
    merge_request_iid BIGINT,
    commit_sha VARCHAR(40),
    processing_status ENUM('pending', 'processing', 'completed', 'failed', 'ignored') DEFAULT 'pending',
    processing_attempts INT DEFAULT 0,
    error_message TEXT,
    processed_at DATETIME,
    gitlab_created_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (gitlab_project_id) REFERENCES gitlab_projects(id) ON DELETE CASCADE,
    INDEX idx_gitlab_project (gitlab_project_id),
    INDEX idx_event_type (event_type),
    INDEX idx_processing_status (processing_status),
    INDEX idx_merge_request_id (merge_request_id),
    INDEX idx_created_at (created_at),
    INDEX idx_gitlab_created_at (gitlab_created_at)
);

-- MR操作记录表
CREATE TABLE gitlab_mr_operations (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    gitlab_project_id BIGINT NOT NULL,
    merge_request_id BIGINT NOT NULL,
    merge_request_iid BIGINT NOT NULL,
    operation_type ENUM('comment', 'discussion', 'approval', 'status_update') NOT NULL,
    operation_data JSON,
    gitlab_response JSON,
    status ENUM('pending', 'success', 'failed') DEFAULT 'pending',
    error_message TEXT,
    retry_count INT DEFAULT 0,
    created_by BIGINT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (gitlab_project_id) REFERENCES gitlab_projects(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_gitlab_project (gitlab_project_id),
    INDEX idx_merge_request (merge_request_id),
    INDEX idx_operation_type (operation_type),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
);
```

## API接口设计

### Controller设计

#### GitLabController

```typescript
@Controller('api/gitlab')
@UseGuards(JwtAuthGuard)
@UseInterceptors(GitLabRateLimitInterceptor)
export class GitLabController {
  constructor(
    private readonly gitlabService: GitLabService,
    private readonly projectSyncService: ProjectSyncService,
  ) {}

  @Post('connect')
  @HttpCode(HttpStatus.OK)
  async connect(@Body() connectDto: GitLabConnectDto) {
    return this.gitlabService.createConnection(connectDto);
  }

  @Get('connections')
  async getConnections(@Request() req) {
    return this.gitlabService.getUserConnections(req.user.id);
  }

  @Delete('connections/:id')
  async deleteConnection(@Param('id') connectionId: string) {
    return this.gitlabService.removeConnection(+connectionId);
  }

  @Get('projects/:connectionId')
  async getProjects(
    @Param('connectionId') connectionId: string,
    @Query() query: GitLabProjectListDto,
  ) {
    return this.gitlabService.listProjects(+connectionId, query);
  }

  @Post('projects/import')
  async importProjects(@Body() importDto: GitLabProjectImportDto) {
    return this.projectSyncService.importProjects(importDto);
  }

  @Post('projects/:id/sync')
  async syncProject(@Param('id') projectId: string) {
    return this.projectSyncService.syncProject(+projectId);
  }
}
```

#### WebhookController

```typescript
@Controller('api/webhooks/gitlab')
@UseInterceptors(WebhookLoggingInterceptor)
export class WebhookController {
  constructor(
    private readonly webhookService: WebhookService,
  ) {}

  @Post(':projectId')
  @UseGuards(WebhookSignatureGuard)
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Param('projectId') projectId: string,
    @Headers('x-gitlab-event') eventType: string,
    @Body() payload: any,
  ) {
    return this.webhookService.processEvent(+projectId, eventType, payload);
  }

  @Get('test/:projectId')
  @UseGuards(JwtAuthGuard)
  async testWebhook(@Param('projectId') projectId: string) {
    return this.webhookService.testConnection(+projectId);
  }
}
```

### Service设计

#### GitLabService

```typescript
@Injectable()
export class GitLabService {
  constructor(
    @InjectRepository(GitlabConnection)
    private readonly connectionRepo: Repository<GitlabConnection>,
    @InjectRepository(GitlabProject)
    private readonly projectRepo: Repository<GitlabProject>,
    private readonly gitlabApiClient: GitLabAPIClient,
    private readonly redisService: RedisService,
  ) {}

  async createConnection(connectDto: GitLabConnectDto) {
    // 验证Token有效性
    const gitlabUser = await this.gitlabApiClient.getCurrentUser(connectDto.accessToken);
    
    // 创建或更新连接记录
    const connection = await this.connectionRepo.save({
      userId: connectDto.userId,
      gitlabUrl: connectDto.gitlabUrl || 'https://gitlab.com',
      accessToken: await this.encryptToken(connectDto.accessToken),
      refreshToken: connectDto.refreshToken ? await this.encryptToken(connectDto.refreshToken) : null,
      gitlabUserId: gitlabUser.id,
      gitlabUsername: gitlabUser.username,
      gitlabEmail: gitlabUser.email,
      avatarUrl: gitlabUser.avatar_url,
      connectionStatus: 'active',
    });

    return this.formatConnectionResponse(connection);
  }

  async listProjects(connectionId: number, query: GitLabProjectListDto) {
    const connection = await this.getActiveConnection(connectionId);
    const cacheKey = `gitlab:projects:${connectionId}:${JSON.stringify(query)}`;
    
    // 缓存检查
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // 调用GitLab API
    const projects = await this.gitlabApiClient.listProjects(
      await this.decryptToken(connection.accessToken),
      query,
    );

    // 缓存结果（15分钟）
    await this.redisService.setex(cacheKey, 900, JSON.stringify(projects));
    
    return projects;
  }

  private async encryptToken(token: string): Promise<string> {
    const cipher = crypto.createCipher('aes-256-cbc', process.env.ENCRYPTION_KEY);
    return cipher.update(token, 'utf8', 'hex') + cipher.final('hex');
  }

  private async decryptToken(encryptedToken: string): Promise<string> {
    const decipher = crypto.createDecipher('aes-256-cbc', process.env.ENCRYPTION_KEY);
    return decipher.update(encryptedToken, 'hex', 'utf8') + decipher.final('utf8');
  }
}
```

#### WebhookService

```typescript
@Injectable()
export class WebhookService {
  constructor(
    @InjectRepository(WebhookEvent)
    private readonly eventRepo: Repository<WebhookEvent>,
    @InjectQueue('webhook') private readonly webhookQueue: Queue,
    private readonly mergeRequestService: MergeRequestService,
  ) {}

  async processEvent(projectId: number, eventType: string, payload: any) {
    // 保存原始事件
    const event = await this.eventRepo.save({
      gitlabProjectId: projectId,
      eventType,
      eventData: payload,
      objectKind: payload.object_kind,
      objectId: payload.object_attributes?.id,
      userId: payload.user?.id,
      userName: payload.user?.name,
      projectId: payload.project?.id,
      sourceBranch: payload.object_attributes?.source_branch,
      targetBranch: payload.object_attributes?.target_branch,
      mergeRequestId: payload.object_attributes?.id,
      mergeRequestIid: payload.object_attributes?.iid,
      commitSha: payload.object_attributes?.last_commit?.id,
      gitlabCreatedAt: payload.object_attributes?.created_at,
    });

    // 异步处理事件
    await this.webhookQueue.add('process-event', {
      eventId: event.id,
      eventType,
      payload,
    }, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    });

    return { message: 'Event received', eventId: event.id };
  }

  @Process('process-event')
  async handleEventProcessing(job: Job) {
    const { eventId, eventType, payload } = job.data;
    
    try {
      await this.eventRepo.update(eventId, {
        processingStatus: 'processing',
        processingAttempts: job.attemptsMade + 1,
      });

      // 根据事件类型处理
      switch (eventType) {
        case 'Merge Request Hook':
          await this.handleMergeRequestEvent(payload);
          break;
        case 'Push Hook':
          await this.handlePushEvent(payload);
          break;
        case 'Note Hook':
          await this.handleNoteEvent(payload);
          break;
        default:
          await this.eventRepo.update(eventId, { processingStatus: 'ignored' });
          return;
      }

      await this.eventRepo.update(eventId, {
        processingStatus: 'completed',
        processedAt: new Date(),
      });

    } catch (error) {
      await this.eventRepo.update(eventId, {
        processingStatus: 'failed',
        errorMessage: error.message,
      });
      throw error;
    }
  }

  private async handleMergeRequestEvent(payload: any) {
    const action = payload.object_attributes.action;
    
    if (['open', 'reopen', 'update'].includes(action)) {
      // 触发代码审查
      await this.mergeRequestService.triggerReview({
        gitlabProjectId: payload.project.id,
        mergeRequestId: payload.object_attributes.id,
        mergeRequestIid: payload.object_attributes.iid,
        sourceBranch: payload.object_attributes.source_branch,
        targetBranch: payload.object_attributes.target_branch,
        lastCommitId: payload.object_attributes.last_commit.id,
      });
    }
  }
}
```

## 安全设计

### Token安全

```typescript
@Injectable()
export class TokenSecurityService {
  private readonly algorithm = 'aes-256-gcm';
  
  async encryptToken(token: string): Promise<string> {
    const key = crypto.scryptSync(process.env.ENCRYPTION_KEY, 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipherGCM(this.algorithm, key, iv);
    
    const encrypted = Buffer.concat([
      cipher.update(token, 'utf8'),
      cipher.final(),
    ]);
    
    const authTag = cipher.getAuthTag();
    
    return Buffer.concat([iv, authTag, encrypted]).toString('base64');
  }

  async decryptToken(encryptedToken: string): Promise<string> {
    const key = crypto.scryptSync(process.env.ENCRYPTION_KEY, 'salt', 32);
    const buffer = Buffer.from(encryptedToken, 'base64');
    
    const iv = buffer.slice(0, 16);
    const authTag = buffer.slice(16, 32);
    const encrypted = buffer.slice(32);
    
    const decipher = crypto.createDecipherGCM(this.algorithm, key, iv);
    decipher.setAuthTag(authTag);
    
    return decipher.update(encrypted, null, 'utf8') + decipher.final('utf8');
  }
}
```

### Webhook签名验证

```typescript
@Injectable()
export class WebhookSignatureGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const signature = request.headers['x-gitlab-token'];
    const body = JSON.stringify(request.body);
    
    const projectId = request.params.projectId;
    const expectedSignature = this.calculateSignature(body, projectId);
    
    return crypto.timingSafeEqual(
      Buffer.from(signature || '', 'utf8'),
      Buffer.from(expectedSignature, 'utf8'),
    );
  }

  private calculateSignature(body: string, projectId: string): string {
    const secret = process.env[`WEBHOOK_SECRET_${projectId}`] || process.env.DEFAULT_WEBHOOK_SECRET;
    return crypto.createHmac('sha256', secret).update(body).digest('hex');
  }
}
```

## 性能优化

### 缓存策略

```typescript
@Injectable()
export class GitLabCacheService {
  constructor(private readonly redisService: RedisService) {}

  // 项目信息缓存（1小时）
  async cacheProjectInfo(connectionId: number, projects: any[]): Promise<void> {
    const key = `gitlab:projects:${connectionId}`;
    await this.redisService.setex(key, 3600, JSON.stringify(projects));
  }

  // 用户信息缓存（30分钟）
  async cacheUserInfo(gitlabUserId: number, userInfo: any): Promise<void> {
    const key = `gitlab:user:${gitlabUserId}`;
    await this.redisService.setex(key, 1800, JSON.stringify(userInfo));
  }

  // Token有效性缓存（5分钟）
  async cacheTokenValidation(tokenHash: string, isValid: boolean): Promise<void> {
    const key = `gitlab:token:${tokenHash}`;
    await this.redisService.setex(key, 300, JSON.stringify({ isValid }));
  }
}
```

### 频率限制

```typescript
@Injectable()
export class GitLabRateLimitInterceptor implements NestInterceptor {
  constructor(private readonly redisService: RedisService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id;
    const key = `rate_limit:gitlab:${userId}`;
    
    const current = await this.redisService.incr(key);
    if (current === 1) {
      await this.redisService.expire(key, 60); // 1分钟窗口
    }
    
    if (current > 60) { // 每分钟最多60次请求
      throw new HttpException('Rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }
    
    return next.handle();
  }
}
```

## 错误处理

### 统一错误处理

```typescript
export enum GitLabErrorCode {
  CONNECTION_FAILED = 'GITLAB_CONNECTION_FAILED',
  INVALID_TOKEN = 'GITLAB_INVALID_TOKEN',
  PROJECT_NOT_FOUND = 'GITLAB_PROJECT_NOT_FOUND',
  WEBHOOK_VERIFICATION_FAILED = 'GITLAB_WEBHOOK_VERIFICATION_FAILED',
  RATE_LIMIT_EXCEEDED = 'GITLAB_RATE_LIMIT_EXCEEDED',
  SYNC_FAILED = 'GITLAB_SYNC_FAILED',
}

@Injectable()
export class GitLabErrorHandler {
  handleGitLabError(error: any): never {
    if (error.response?.status === 401) {
      throw new BusinessException(GitLabErrorCode.INVALID_TOKEN, '访问令牌无效或已过期');
    }
    
    if (error.response?.status === 404) {
      throw new BusinessException(GitLabErrorCode.PROJECT_NOT_FOUND, '项目不存在或无权限访问');
    }
    
    if (error.response?.status === 429) {
      throw new BusinessException(GitLabErrorCode.RATE_LIMIT_EXCEEDED, 'GitLab API频率限制');
    }
    
    throw new BusinessException(GitLabErrorCode.CONNECTION_FAILED, 'GitLab连接失败');
  }
}
```

## 监控与日志

### 事件审计

```typescript
@Injectable()
export class GitLabAuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>,
  ) {}

  async logConnection(userId: number, action: string, details: any): Promise<void> {
    await this.auditRepo.save({
      userId,
      action: `gitlab.${action}`,
      resourceType: 'gitlab_connection',
      details,
      ipAddress: details.ipAddress,
      userAgent: details.userAgent,
    });
  }

  async logWebhookEvent(projectId: number, eventType: string, success: boolean): Promise<void> {
    await this.auditRepo.save({
      userId: null,
      action: 'gitlab.webhook_received',
      resourceType: 'webhook_event',
      resourceId: projectId,
      details: { eventType, success },
    });
  }
}
```

### 健康检查

```typescript
@Injectable()
export class GitLabHealthIndicator extends HealthIndicator {
  constructor(private readonly gitlabApiClient: GitLabAPIClient) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      await this.gitlabApiClient.checkHealth();
      return this.getStatus(key, true);
    } catch (error) {
      return this.getStatus(key, false, { message: error.message });
    }
  }
}
```

## 配置管理

### 环境配置

```typescript
export interface GitLabConfig {
  defaultUrl: string;
  apiVersion: string;
  timeout: number;
  retryAttempts: number;
  rateLimitPerMinute: number;
  cacheTtl: {
    projects: number;
    users: number;
    tokens: number;
  };
  webhook: {
    secret: string;
    maxRetries: number;
    retryDelay: number;
  };
}

@Injectable()
export class GitLabConfigService {
  private readonly config: GitLabConfig = {
    defaultUrl: process.env.GITLAB_DEFAULT_URL || 'https://gitlab.com',
    apiVersion: process.env.GITLAB_API_VERSION || 'v4',
    timeout: +process.env.GITLAB_TIMEOUT || 10000,
    retryAttempts: +process.env.GITLAB_RETRY_ATTEMPTS || 3,
    rateLimitPerMinute: +process.env.GITLAB_RATE_LIMIT || 60,
    cacheTtl: {
      projects: +process.env.GITLAB_CACHE_PROJECTS || 3600,
      users: +process.env.GITLAB_CACHE_USERS || 1800,
      tokens: +process.env.GITLAB_CACHE_TOKENS || 300,
    },
    webhook: {
      secret: process.env.GITLAB_WEBHOOK_SECRET,
      maxRetries: +process.env.GITLAB_WEBHOOK_MAX_RETRIES || 3,
      retryDelay: +process.env.GITLAB_WEBHOOK_RETRY_DELAY || 2000,
    },
  };

  get(): GitLabConfig {
    return this.config;
  }
}
```

## 测试策略

### 单元测试覆盖

- GitLabService: Token加密/解密、API调用、错误处理
- WebhookService: 事件处理逻辑、签名验证、异步队列
- ProjectSyncService: 数据同步、冲突解决、状态管理
- Guards: 认证、授权、签名验证
- Interceptors: 频率限制、日志记录、错误拦截

### 集成测试

- GitLab API连接测试
- Webhook端到端测试
- 数据库事务测试
- 缓存功能测试
- 队列处理测试

## 部署注意事项

1. **环境变量配置**: 确保所有敏感配置通过环境变量传入
2. **数据库迁移**: 使用Prisma迁移管理数据库结构变更
3. **Redis配置**: 配置Redis用于缓存和队列处理
4. **Webhook URL**: 确保Webhook URL可被GitLab访问
5. **SSL证书**: 生产环境必须使用HTTPS
6. **监控设置**: 配置日志收集和性能监控
7. **备份策略**: 定期备份数据库和配置文件