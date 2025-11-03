# Requirements: GitLab Integration API System

## Overview
GitLab 集成 API 系统为 MoonLens 提供与 GitLab 平台的深度集成能力，包括项目同步、Webhook 管理、MR 事件处理、审查结果同步等核心功能，是连接 GitLab 平台与 AI 代码审查的关键桥梁。

## User Stories

### 1. GitLab 项目导入 API
**作为** API 服务
**我需要** 提供 GitLab 项目导入接口
**以便于** 支持前端用户批量导入和管理 GitLab 项目

**验收标准**：
- 验证 GitLab Token 有效性和权限
- 获取用户可访问的项目列表
- 支持项目信息批量同步
- 创建项目本地记录和映射关系
- 保存加密的 GitLab 访问凭据
- 项目导入状态实时更新

### 2. Webhook 配置管理 API
**作为** API 服务
**我需要** 提供 GitLab Webhook 配置管理接口
**以便于** 自动接收和处理 GitLab 事件

**验收标准**：
- 自动生成安全的 Webhook URL 和 Secret
- 调用 GitLab API 创建/更新 Webhook
- 配置事件类型过滤（MR、Push、评论）
- Webhook 连接测试和状态监控
- 支持 Webhook 配置的增删改查
- 处理 GitLab API 权限和错误

### 3. GitLab 事件处理 API
**作为** API 服务
**我需要** 接收和处理 GitLab Webhook 事件
**以便于** 触发相应的业务逻辑

**验收标准**：
- 接收 GitLab Webhook POST 请求
- 验证 Webhook 签名和来源
- 解析不同类型的 GitLab 事件
- 事件数据标准化和验证
- 异步事件处理队列
- 事件处理状态跟踪和日志

### 4. MR 操作管理 API
**作为** API 服务
**我需要** 提供 Merge Request 操作接口
**以便于** 获取 MR 信息和发布审查结果

**验收标准**：
- 获取 MR 列表和详细信息
- 获取 MR 代码差异（Diff）
- 创建 MR 评论和逐行讨论
- 更新 MR 状态和标签
- 处理 MR 评论回复
- 支持 MR 批量操作

### 5. 项目同步管理 API
**作为** API 服务
**我需要** 提供项目信息同步接口
**以便于** 保持本地项目数据与 GitLab 的一致性

**验收标准**：
- 同步项目基本信息（名称、描述、分支等）
- 同步项目成员和权限
- 同步项目分支和标签信息
- 处理项目变更和删除
- 增量同步和冲突处理
- 同步状态监控和错误恢复

### 6. GitLab API 客户端服务
**作为** API 服务
**我需要** 封装 GitLab API 调用
**以便于** 提供统一的 GitLab 操作接口

**验收标准**：
- 统一的 GitLab API 调用封装
- 自动处理认证和授权
- API 请求限流和重试机制
- 错误处理和状态码映射
- API 响应缓存策略
- 支持多个 GitLab 实例

## Functional Requirements

### FR1: 认证管理
- **FR1.1**: GitLab Personal Access Token 管理
- **FR1.2**: GitLab OAuth 2.0 应用认证
- **FR1.3**: Token 加密存储和安全管理
- **FR1.4**: Token 有效性验证和刷新
- **FR1.5**: 多 GitLab 实例支持

### FR2: 项目集成
- **FR2.1**: GitLab 项目列表获取和过滤
- **FR2.2**: 项目详细信息同步
- **FR2.3**: 项目成员和权限映射
- **FR2.4**: 分支和标签信息同步
- **FR2.5**: 项目配置和 Webhook 管理

### FR3: Webhook 服务
- **FR3.1**: Webhook 端点注册和管理
- **FR3.2**: 事件签名验证和安全检查
- **FR3.3**: 事件类型解析和路由
- **FR3.4**: 异步事件处理队列
- **FR3.5**: 事件重试和失败恢复

### FR4: MR 集成
- **FR4.1**: MR 数据获取和解析
- **FR4.2**: 代码差异分析和提取
- **FR4.3**: MR 评论和讨论管理
- **FR4.4**: 审查结果同步回 GitLab
- **FR4.5**: MR 状态和标签更新

### FR5: 数据同步
- **FR5.1**: 增量数据同步机制
- **FR5.2**: 同步冲突检测和处理
- **FR5.3**: 数据一致性验证
- **FR5.4**: 同步状态监控和报告
- **FR5.5**: 批量同步优化

## Non-Functional Requirements

### NFR1: 性能要求
- **NFR1.1**: Webhook 响应时间 < 200ms
- **NFR1.2**: GitLab API 调用响应 < 2s
- **NFR1.3**: 支持 100+ 并发 Webhook 请求
- **NFR1.4**: 事件处理延迟 < 5s
- **NFR1.5**: 批量操作优化（分页、并行）

### NFR2: 可靠性要求
- **NFR2.1**: Webhook 事件处理成功率 > 99%
- **NFR2.2**: API 调用重试机制（指数退避）
- **NFR2.3**: 事件幂等性保证
- **NFR2.4**: 断点续传和错误恢复
- **NFR2.5**: 数据一致性保证机制

### NFR3: 安全要求
- **NFR3.1**: GitLab Token AES-256 加密存储
- **NFR3.2**: Webhook 签名验证（HMAC-SHA256）
- **NFR3.3**: API 请求 HTTPS 强制加密
- **NFR3.4**: 敏感数据脱敏和日志过滤
- **NFR3.5**: 访问控制和操作审计

### NFR4: 扩展性要求
- **NFR4.1**: 支持多 GitLab 实例集成
- **NFR4.2**: 插件化事件处理器
- **NFR4.3**: 水平扩展和负载均衡
- **NFR4.4**: 配置热更新支持
- **NFR4.5**: API 版本兼容性管理

### NFR5: 监控要求
- **NFR5.1**: API 调用监控和统计
- **NFR5.2**: Webhook 事件监控
- **NFR5.3**: 同步状态实时监控
- **NFR5.4**: 错误告警和通知
- **NFR5.5**: 性能指标收集

## API Specifications

### GitLab Integration APIs

#### GET /api/gitlab/projects
```json
{
  \"query\": {
    \"token\": \"string\",
    \"search\": \"string\",
    \"visibility\": \"private|internal|public\",
    \"membership\": \"boolean\",
    \"page\": 1,
    \"limit\": 20
  },
  \"response\": {
    \"projects\": [
      {
        \"id\": \"number\",
        \"name\": \"string\",
        \"path\": \"string\",
        \"namespace\": \"string\",
        \"description\": \"string\",
        \"visibility\": \"string\",
        \"defaultBranch\": \"string\",
        \"webUrl\": \"string\",
        \"sshUrl\": \"string\",
        \"httpUrl\": \"string\",
        \"permissions\": {...}
      }
    ],
    \"pagination\": {...}
  }
}
```

#### POST /api/gitlab/projects/import
```json
{
  \"request\": {
    \"token\": \"string\",
    \"projectIds\": [\"number\"],
    \"syncMembers\": true,
    \"setupWebhook\": true
  },
  \"response\": {
    \"imported\": [
      {
        \"gitlabId\": \"number\",
        \"localId\": \"uuid\",
        \"status\": \"success|failed\",
        \"webhookId\": \"string\",
        \"error\": \"string\"
      }
    ],
    \"summary\": {
      \"total\": 10,
      \"successful\": 8,
      \"failed\": 2
    }
  }
}
```

### Webhook Management APIs

#### POST /api/gitlab/projects/:id/webhook
```json
{
  \"request\": {
    \"events\": [\"merge_requests\", \"push\", \"note\"],
    \"enableSslVerification\": true
  },
  \"response\": {
    \"id\": \"string\",
    \"url\": \"string\",
    \"secret\": \"string\",
    \"events\": [...],
    \"status\": \"active\"
  }
}
```

#### GET /api/gitlab/projects/:id/webhook
```json
{
  \"response\": {
    \"id\": \"string\",
    \"url\": \"string\",
    \"events\": [...],
    \"status\": \"active|inactive\",
    \"lastTriggered\": \"datetime\",
    \"successRate\": 0.98,
    \"recentEvents\": [...]
  }
}
```

#### DELETE /api/gitlab/projects/:id/webhook
```json
{
  \"response\": {
    \"message\": \"Webhook deleted successfully\"
  }
}
```

### Webhook Event Processing APIs

#### POST /api/webhook/gitlab/:projectId
```json
{
  \"headers\": {
    \"X-Gitlab-Event\": \"Merge Request Hook\",
    \"X-Gitlab-Token\": \"string\"
  },
  \"request\": {
    \"object_kind\": \"merge_request\",
    \"event_type\": \"merge_request\",
    \"project\": {...},
    \"object_attributes\": {...},
    \"changes\": {...},
    \"user\": {...}
  },
  \"response\": {
    \"received\": true,
    \"eventId\": \"uuid\",
    \"status\": \"queued\"
  }
}
```

#### GET /api/webhook/events/:eventId/status
```json
{
  \"response\": {
    \"eventId\": \"uuid\",
    \"status\": \"queued|processing|completed|failed\",
    \"processedAt\": \"datetime\",
    \"result\": {...},
    \"error\": \"string\"
  }
}
```

### Merge Request APIs

#### GET /api/gitlab/projects/:id/merge-requests
```json
{
  \"query\": {
    \"state\": \"opened|closed|merged\",
    \"author\": \"string\",
    \"assignee\": \"string\",
    \"milestone\": \"string\",
    \"page\": 1,
    \"limit\": 20
  },
  \"response\": {
    \"mergeRequests\": [
      {
        \"id\": \"number\",
        \"iid\": \"number\",
        \"title\": \"string\",
        \"description\": \"string\",
        \"state\": \"string\",
        \"author\": {...},
        \"assignee\": {...},
        \"sourceBranch\": \"string\",
        \"targetBranch\": \"string\",
        \"webUrl\": \"string\",
        \"createdAt\": \"datetime\"
      }
    ]
  }
}
```

#### GET /api/gitlab/projects/:id/merge-requests/:mrId/changes
```json
{
  \"response\": {
    \"changes\": [
      {
        \"oldPath\": \"string\",
        \"newPath\": \"string\",
        \"aMode\": \"string\",
        \"bMode\": \"string\",
        \"newFile\": false,
        \"renamedFile\": false,
        \"deletedFile\": false,
        \"diff\": \"string\"
      }
    ],
    \"commits\": [...],
    \"compareTimeout\": false,
    \"compareSameRef\": false
  }
}
```

#### POST /api/gitlab/projects/:id/merge-requests/:mrId/notes
```json
{
  \"request\": {
    \"body\": \"string\",
    \"position\": {
      \"baseSha\": \"string\",
      \"headSha\": \"string\",
      \"startSha\": \"string\",
      \"newPath\": \"string\",
      \"newLine\": 10,
      \"oldPath\": \"string\",
      \"oldLine\": 8
    }
  },
  \"response\": {
    \"id\": \"number\",
    \"body\": \"string\",
    \"author\": {...},
    \"createdAt\": \"datetime\",
    \"system\": false,
    \"discussionId\": \"string\"
  }
}
```

### Project Sync APIs

#### POST /api/gitlab/projects/:id/sync
```json
{
  \"request\": {
    \"syncType\": \"full|incremental\",
    \"syncMembers\": true,
    \"syncBranches\": true,
    \"force\": false
  },
  \"response\": {
    \"syncJobId\": \"uuid\",
    \"status\": \"queued\",
    \"estimatedDuration\": \"30s\"
  }
}
```

#### GET /api/gitlab/projects/:id/sync/status
```json
{
  \"response\": {
    \"status\": \"idle|syncing|completed|failed\",
    \"lastSyncAt\": \"datetime\",
    \"nextSyncAt\": \"datetime\",
    \"syncProgress\": {
      \"total\": 100,
      \"completed\": 75,
      \"failed\": 2
    },
    \"errors\": [...]
  }
}
```

## Database Requirements

### GitLab Connections Table Schema
```sql
CREATE TABLE gitlab_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  gitlab_url VARCHAR(255) NOT NULL DEFAULT 'https://gitlab.com',
  access_token TEXT NOT NULL, -- AES encrypted
  token_type ENUM('personal', 'oauth') DEFAULT 'personal',
  token_scopes JSON,
  expires_at TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  INDEX idx_user_id (user_id),
  INDEX idx_gitlab_url (gitlab_url),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

### GitLab Projects Table Schema
```sql
CREATE TABLE gitlab_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL,
  project_id UUID NOT NULL,
  gitlab_project_id BIGINT NOT NULL,
  gitlab_path VARCHAR(255) NOT NULL,
  gitlab_namespace VARCHAR(255) NOT NULL,
  gitlab_name VARCHAR(255) NOT NULL,
  gitlab_description TEXT,
  default_branch VARCHAR(100),
  visibility ENUM('private', 'internal', 'public'),
  web_url VARCHAR(500),
  ssh_url VARCHAR(500),
  http_url VARCHAR(500),
  webhook_id VARCHAR(100),
  webhook_secret VARCHAR(255),
  last_sync_at TIMESTAMP,
  sync_status ENUM('pending', 'syncing', 'completed', 'failed') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE KEY uk_gitlab_project (connection_id, gitlab_project_id),
  INDEX idx_project_id (project_id),
  INDEX idx_gitlab_project_id (gitlab_project_id),
  INDEX idx_sync_status (sync_status),
  FOREIGN KEY (connection_id) REFERENCES gitlab_connections(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
```

### Webhook Events Table Schema
```sql
CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  gitlab_project_id BIGINT NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  event_data JSON NOT NULL,
  event_signature VARCHAR(255),
  source_ip INET,
  status ENUM('received', 'queued', 'processing', 'completed', 'failed') DEFAULT 'received',
  processed_at TIMESTAMP,
  error_message TEXT,
  retry_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  
  INDEX idx_project_id (project_id),
  INDEX idx_event_type (event_type),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
```

### GitLab API Requests Log Schema
```sql
CREATE TABLE gitlab_api_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL,
  method VARCHAR(10) NOT NULL,
  endpoint VARCHAR(500) NOT NULL,
  status_code INT,
  response_time_ms INT,
  rate_limit_remaining INT,
  rate_limit_reset TIMESTAMP,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  
  INDEX idx_connection_id (connection_id),
  INDEX idx_endpoint (endpoint),
  INDEX idx_status_code (status_code),
  INDEX idx_created_at (created_at),
  FOREIGN KEY (connection_id) REFERENCES gitlab_connections(id) ON DELETE CASCADE
);
```

## Service Dependencies

### External Dependencies
- **GitLab API v4**: 项目信息、MR 操作、Webhook 管理
- **Redis**: 事件队列和缓存
- **队列服务**: 异步事件处理
- **加密服务**: Token 加密解密

### Internal Dependencies
- **用户认证模块**: 用户身份验证
- **项目管理模块**: 项目数据管理
- **AI 代码审查模块**: 审查任务触发
- **通知服务**: 事件通知

## Security Considerations

### Token Security
- GitLab Token 使用 AES-256 加密存储
- Token 权限最小化原则
- Token 定期轮换和验证
- Token 访问日志记录

### Webhook Security
- HMAC-SHA256 签名验证
- 来源 IP 白名单验证
- 请求频率限制
- 恶意请求检测

### Data Protection
- 敏感数据传输加密
- API 响应数据脱敏
- 审计日志完整记录
- 数据访问权限控制

## Error Handling

### Error Response Format
```json
{
  \"error\": {
    \"code\": \"GITLAB_001\",
    \"message\": \"GitLab API request failed\",
    \"details\": \"Rate limit exceeded, retry after 60 seconds\",
    \"retryAfter\": 60,
    \"timestamp\": \"2025-01-01T00:00:00Z\"
  }
}
```

### Error Codes
- **GITLAB_001**: GitLab API 请求失败
- **GITLAB_002**: Token 无效或过期
- **GITLAB_003**: 权限不足
- **GITLAB_004**: 项目不存在
- **GITLAB_005**: Webhook 配置失败
- **GITLAB_006**: 事件处理失败
- **WEBHOOK_001**: 签名验证失败
- **WEBHOOK_002**: 事件格式无效
- **SYNC_001**: 同步任务失败

## Constraints

### Technical Constraints
- GitLab API v4 兼容性要求
- Webhook 事件格式固定
- API 请求频率限制
- Token 权限范围限制
- 网络连接稳定性要求

### Business Constraints
- 只支持有权限访问的项目
- 遵守 GitLab API 使用条款
- 不存储 GitLab 源代码内容
- 审查结果保留期限限制
- 并发处理数量限制

### Integration Constraints
- 依赖 GitLab 服务可用性
- 支持 GitLab CE/EE 版本
- 防火墙和网络配置要求
- SSL 证书验证要求
- 代理服务器支持

## Acceptance Criteria

### AC1: GitLab 项目导入流程
1. 验证 GitLab Token 有效性
2. 获取用户项目列表
3. 选择和过滤项目
4. 批量创建本地项目记录
5. 配置 Webhook（如需要）
6. 返回导入结果统计

### AC2: Webhook 事件处理流程
1. 接收 GitLab Webhook 请求
2. 验证签名和来源
3. 解析事件类型和数据
4. 入队异步处理
5. 触发相应业务逻辑
6. 更新处理状态

### AC3: MR 审查结果同步流程
1. 接收审查结果数据
2. 格式化为 GitLab 评论格式
3. 调用 GitLab API 发布评论
4. 处理 API 响应和错误
5. 更新同步状态
6. 记录操作日志

### AC4: 项目同步流程
1. 检查同步触发条件
2. 获取 GitLab 项目最新信息
3. 对比本地数据差异
4. 执行增量更新
5. 处理冲突和错误
6. 更新同步状态

## Dependencies

### External Dependencies
- GitLab API v4 服务
- GitLab Webhook 服务
- 互联网连接
- SSL 证书服务

### Internal Dependencies
- 用户认证模块
- 项目管理模块
- 队列处理服务
- 缓存服务
- 加密服务

## Risks

### 风险1: GitLab API 变更或不可用
- **影响**: 高
- **概率**: 低
- **缓解**: API 版本锁定、适配层、降级方案、监控告警

### 风险2: API 速率限制
- **影响**: 中
- **概率**: 中
- **缓解**: 请求限流、缓存策略、批量优化、多实例部署

### 风险3: Webhook 丢失或重复
- **影响**: 中
- **概率**: 中
- **缓解**: 幂等性设计、重试机制、状态检查、补偿机制

### 风险4: Token 泄露或过期
- **影响**: 高
- **概率**: 低
- **缓解**: 加密存储、定期轮换、权限最小化、访问审计

## Success Metrics

1. **API 响应时间** < 2s (95th percentile)
2. **Webhook 处理成功率** > 99%
3. **项目导入成功率** > 95%
4. **同步数据一致性** > 99.5%
5. **API 可用性** > 99.9%
6. **事件处理延迟** < 5s (平均)
7. **Token 验证成功率** > 99%

## Testing Requirements

### Unit Testing
- GitLab API 客户端单元测试覆盖率 > 90%
- Webhook 事件处理单元测试覆盖率 > 85%
- 数据同步服务单元测试覆盖率 > 85%

### Integration Testing
- GitLab API 集成测试
- Webhook 端到端测试
- 项目同步集成测试
- 错误处理集成测试

### Performance Testing
- API 响应时间测试
- 并发 Webhook 处理测试
- 批量操作性能测试
- 内存和 CPU 使用率测试

### Security Testing
- Token 安全测试
- Webhook 签名验证测试
- 权限验证测试
- 数据加密测试