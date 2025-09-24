# Requirements: Project Management API System

## Overview
MoonLens 项目管理 API 系统为前端提供项目组织、配置管理、团队协作和数据统计功能，是连接 GitLab 集成与 AI 审查的核心桥梁，确保项目生命周期管理的完整性和高效性。

## User Stories

### 1. 项目创建 API
**作为** API 服务
**我需要** 提供项目创建接口
**以便于** 支持前端用户创建和配置项目

**验收标准**：
- 接收项目基本信息（名称、描述、GitLab 项目 ID）
- 验证 GitLab 项目访问权限
- 创建项目记录和默认配置
- 设置项目创建者为管理员
- 初始化 Webhook 配置
- 返回完整项目信息

### 2. 项目配置管理 API
**作为** API 服务
**我需要** 提供项目配置管理接口
**以便于** 支持前端用户定制审查流程

**验收标准**：
- 提供配置项的 CRUD 接口
- 支持审查规则配置
- 支持 AI 模型选择配置
- 支持触发条件设置
- 支持通知规则配置
- 配置变更历史记录

### 3. 团队成员管理 API
**作为** API 服务
**我需要** 提供团队成员管理接口
**以便于** 支持项目访问权限控制

**验收标准**：
- 添加/移除项目成员接口
- 角色权限分配接口
- 成员列表查询接口
- 权限验证中间件
- 成员活动日志记录
- 批量成员操作支持

### 4. GitLab 集成管理 API
**作为** API 服务
**我需要** 提供 GitLab 项目集成接口
**以便于** 支持项目与 GitLab 的双向同步

**验收标准**：
- GitLab 项目验证接口
- Webhook 配置管理接口
- 项目同步状态检查
- GitLab 事件处理接口
- 同步失败重试机制
- 集成健康检查

### 5. 项目统计分析 API
**作为** API 服务
**我需要** 提供项目数据统计接口
**以便于** 支持前端展示项目分析报告

**验收标准**：
- 审查统计数据接口
- 代码质量指标接口
- 团队贡献度分析接口
- 趋势数据查询接口
- 统计报表生成接口
- 数据导出功能

### 6. 项目生命周期管理 API
**作为** API 服务
**我需要** 提供项目状态管理接口
**以便于** 支持项目的完整生命周期

**验收标准**：
- 项目状态更新接口
- 项目归档/恢复接口
- 项目删除（软删除）接口
- 项目克隆/模板接口
- 批量项目操作接口
- 状态变更通知

## Functional Requirements

### FR1: 项目管理核心
- **FR1.1**: 项目 CRUD 操作
- **FR1.2**: 项目状态管理（活跃、归档、删除）
- **FR1.3**: 项目克隆和模板功能
- **FR1.4**: 项目搜索和筛选
- **FR1.5**: 项目批量操作

### FR2: 配置管理核心
- **FR2.1**: 审查规则配置管理
- **FR2.2**: AI 模型配置管理
- **FR2.3**: 触发条件配置管理
- **FR2.4**: 通知配置管理
- **FR2.5**: 配置模板和版本管理

### FR3: 权限管理核心
- **FR3.1**: 基于角色的项目权限控制
- **FR3.2**: 成员管理和角色分配
- **FR3.3**: 权限继承和委托
- **FR3.4**: 操作权限验证
- **FR3.5**: 权限审计日志

### FR4: GitLab 集成核心
- **FR4.1**: GitLab 项目绑定和验证
- **FR4.2**: Webhook 自动配置
- **FR4.3**: 项目元数据同步
- **FR4.4**: 分支和标签同步
- **FR4.5**: 集成状态监控

### FR5: 数据统计核心
- **FR5.1**: 实时统计数据计算
- **FR5.2**: 历史趋势数据分析
- **FR5.3**: 自定义报表生成
- **FR5.4**: 数据聚合和缓存
- **FR5.5**: 统计数据导出

## Non-Functional Requirements

### NFR1: 性能要求
- **NFR1.1**: 项目列表查询 < 500ms
- **NFR1.2**: 配置保存响应 < 300ms
- **NFR1.3**: 统计查询响应 < 1s
- **NFR1.4**: 支持 1000+ 项目并发访问
- **NFR1.5**: 批量操作性能优化

### NFR2: 可扩展性要求
- **NFR2.1**: 支持项目数量水平扩展
- **NFR2.2**: 支持多租户隔离
- **NFR2.3**: 支持插件化配置扩展
- **NFR2.4**: 支持自定义字段扩展
- **NFR2.5**: 支持微服务架构部署

### NFR3: 安全性要求
- **NFR3.1**: 项目级数据隔离
- **NFR3.2**: 敏感配置加密存储
- **NFR3.3**: API 访问权限验证
- **NFR3.4**: 操作审计日志记录
- **NFR3.5**: RBAC 权限模型

### NFR4: 可用性要求
- **NFR4.1**: API 可用性 99.9%
- **NFR4.2**: 优雅的错误处理
- **NFR4.3**: 完整的 API 文档
- **NFR4.4**: 版本兼容性保证
- **NFR4.5**: 健康检查机制

### NFR5: 可维护性要求
- **NFR5.1**: 模块化 API 设计
- **NFR5.2**: 标准化错误响应
- **NFR5.3**: 完善的日志记录
- **NFR5.4**: 单元测试覆盖 > 85%
- **NFR5.5**: API 版本管理

## API Specifications

### Project Management APIs

#### POST /api/projects
```json
{
  \"request\": {
    \"name\": \"string\",
    \"description\": \"string\",
    \"gitlabProjectId\": \"string\",
    \"gitlabProjectUrl\": \"string\",
    \"defaultBranch\": \"string\"
  },
  \"response\": {
    \"id\": \"uuid\",
    \"name\": \"string\",
    \"description\": \"string\",
    \"gitlabProjectId\": \"string\",
    \"gitlabProjectUrl\": \"string\",
    \"defaultBranch\": \"string\",
    \"isActive\": true,
    \"ownerId\": \"uuid\",
    \"reviewConfig\": {},
    \"createdAt\": \"datetime\"
  }
}
```

#### GET /api/projects
```json
{
  \"query\": {
    \"page\": 1,
    \"limit\": 20,
    \"search\": \"string\",
    \"status\": \"active|archived\",
    \"ownerId\": \"uuid\"
  },
  \"response\": {
    \"projects\": [...],
    \"pagination\": {
      \"page\": 1,
      \"limit\": 20,
      \"total\": 100,
      \"totalPages\": 5
    }
  }
}
```

#### GET /api/projects/:id
```json
{
  \"response\": {
    \"id\": \"uuid\",
    \"name\": \"string\",
    \"description\": \"string\",
    \"gitlabProjectId\": \"string\",
    \"gitlabProjectUrl\": \"string\",
    \"defaultBranch\": \"string\",
    \"isActive\": true,
    \"reviewConfig\": {},
    \"webhookId\": \"string\",
    \"members\": [...],
    \"statistics\": {...},
    \"createdAt\": \"datetime\"
  }
}
```

#### PUT /api/projects/:id
```json
{
  \"request\": {
    \"name\": \"string\",
    \"description\": \"string\",
    \"defaultBranch\": \"string\",
    \"reviewConfig\": {}
  },
  \"response\": {
    \"project\": {...}
  }
}
```

#### DELETE /api/projects/:id
```json
{
  \"response\": {
    \"message\": \"Project deleted successfully\"
  }
}
```

### Project Configuration APIs

#### GET /api/projects/:id/config
```json
{
  \"response\": {
    \"reviewRules\": {
      \"enableAutoReview\": true,
      \"reviewTriggers\": [\"merge_request\", \"push\"],
      \"excludePatterns\": [\"*.md\", \"test/*\"],
      \"requireApproval\": true
    },
    \"aiConfig\": {
      \"provider\": \"openai\",
      \"model\": \"gpt-4\",
      \"maxTokens\": 4000,
      \"temperature\": 0.1
    },
    \"notifications\": {
      \"email\": true,
      \"webhook\": \"https://example.com/hook\",
      \"slack\": \"#dev-team\"
    }
  }
}
```

#### PUT /api/projects/:id/config
```json
{
  \"request\": {
    \"reviewRules\": {...},
    \"aiConfig\": {...},
    \"notifications\": {...}
  },
  \"response\": {
    \"config\": {...},
    \"message\": \"Configuration updated successfully\"
  }
}
```

### Project Members APIs

#### GET /api/projects/:id/members
```json
{
  \"response\": {
    \"members\": [
      {
        \"id\": \"uuid\",
        \"userId\": \"uuid\",
        \"user\": {
          \"id\": \"uuid\",
          \"username\": \"string\",
          \"email\": \"string\",
          \"avatar\": \"string\"
        },
        \"role\": \"owner|admin|member|viewer\",
        \"permissions\": [...],
        \"addedAt\": \"datetime\"
      }
    ]
  }
}
```

#### POST /api/projects/:id/members
```json
{
  \"request\": {
    \"userIds\": [\"uuid\"],
    \"role\": \"member\"
  },
  \"response\": {
    \"added\": [...],
    \"failed\": [...],
    \"message\": \"Members added successfully\"
  }
}
```

#### PUT /api/projects/:id/members/:memberId
```json
{
  \"request\": {
    \"role\": \"admin\"
  },
  \"response\": {
    \"member\": {...},
    \"message\": \"Member role updated\"
  }
}
```

#### DELETE /api/projects/:id/members/:memberId
```json
{
  \"response\": {
    \"message\": \"Member removed successfully\"
  }
}
```

### GitLab Integration APIs

#### POST /api/projects/:id/gitlab/verify
```json
{
  \"response\": {
    \"isValid\": true,
    \"projectInfo\": {
      \"id\": \"number\",
      \"name\": \"string\",
      \"url\": \"string\",
      \"defaultBranch\": \"string\",
      \"visibility\": \"private|internal|public\"
    },
    \"permissions\": {
      \"canCreateWebhook\": true,
      \"canReadProject\": true
    }
  }
}
```

#### POST /api/projects/:id/gitlab/webhook
```json
{
  \"request\": {
    \"events\": [\"merge_requests\", \"push\"]
  },
  \"response\": {
    \"webhookId\": \"string\",
    \"webhookUrl\": \"string\",
    \"events\": [...],
    \"message\": \"Webhook configured successfully\"
  }
}
```

#### GET /api/projects/:id/gitlab/sync-status
```json
{
  \"response\": {
    \"status\": \"synced|syncing|failed\",
    \"lastSyncAt\": \"datetime\",
    \"syncErrors\": [...],
    \"webhookStatus\": \"active|inactive\",
    \"projectMetadata\": {...}
  }
}
```

#### POST /api/projects/:id/gitlab/sync
```json
{
  \"response\": {
    \"syncJobId\": \"uuid\",
    \"message\": \"Sync initiated\"
  }
}
```

### Project Statistics APIs

#### GET /api/projects/:id/statistics
```json
{
  \"query\": {
    \"dateFrom\": \"2025-01-01\",
    \"dateTo\": \"2025-01-31\",
    \"granularity\": \"day|week|month\"
  },
  \"response\": {
    \"overview\": {
      \"totalReviews\": 156,
      \"averageQualityScore\": 8.5,
      \"issuesFound\": 42,
      \"issuesResolved\": 38
    },
    \"trends\": [
      {
        \"date\": \"2025-01-01\",
        \"reviews\": 5,
        \"qualityScore\": 8.2,
        \"issues\": 2
      }
    ],
    \"memberContributions\": [
      {
        \"userId\": \"uuid\",
        \"username\": \"string\",
        \"reviews\": 23,
        \"qualityScore\": 8.8
      }
    ]
  }
}
```

#### GET /api/projects/:id/statistics/export
```json
{
  \"query\": {
    \"format\": \"csv|json|pdf\",
    \"dateFrom\": \"2025-01-01\",
    \"dateTo\": \"2025-01-31\"
  },
  \"response\": {
    \"downloadUrl\": \"string\",
    \"expiresAt\": \"datetime\"
  }
}
```

## Database Requirements

### Projects Table Schema
```sql
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  gitlab_project_id VARCHAR(50) NOT NULL,
  gitlab_project_url VARCHAR(500) NOT NULL,
  default_branch VARCHAR(100) DEFAULT 'main',
  is_active BOOLEAN DEFAULT true,
  review_config JSON,
  webhook_id VARCHAR(100),
  webhook_secret VARCHAR(255),
  owner_id UUID NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  INDEX idx_owner_id (owner_id),
  INDEX idx_gitlab_project_id (gitlab_project_id),
  INDEX idx_is_active (is_active),
  UNIQUE KEY uk_gitlab_project (gitlab_project_id),
  FOREIGN KEY (owner_id) REFERENCES users(id)
);
```

### Project Members Table Schema
```sql
CREATE TABLE project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  user_id UUID NOT NULL,
  role ENUM('owner', 'admin', 'member', 'viewer') NOT NULL,
  permissions JSON,
  added_by UUID NOT NULL,
  added_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE KEY uk_project_user (project_id, user_id),
  INDEX idx_project_id (project_id),
  INDEX idx_user_id (user_id),
  INDEX idx_role (role),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (added_by) REFERENCES users(id)
);
```

### Project Statistics Table Schema
```sql
CREATE TABLE project_statistics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  date DATE NOT NULL,
  total_reviews INT DEFAULT 0,
  successful_reviews INT DEFAULT 0,
  failed_reviews INT DEFAULT 0,
  average_quality_score DECIMAL(3,2),
  issues_found INT DEFAULT 0,
  issues_resolved INT DEFAULT 0,
  lines_reviewed INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE KEY uk_project_date (project_id, date),
  INDEX idx_project_id (project_id),
  INDEX idx_date (date),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
```

### Project Activity Log Schema
```sql
CREATE TABLE project_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  user_id UUID,
  action VARCHAR(50) NOT NULL,
  resource_type VARCHAR(50),
  resource_id VARCHAR(100),
  details JSON,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  
  INDEX idx_project_id (project_id),
  INDEX idx_user_id (user_id),
  INDEX idx_action (action),
  INDEX idx_created_at (created_at),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

## Service Dependencies

### External Dependencies
- **GitLab API v4**: 项目信息获取和 Webhook 管理
- **Redis**: 缓存和会话存储
- **队列服务**: 异步任务处理（同步、统计）
- **文件存储**: 导出文件存储

### Internal Dependencies
- **用户认证模块**: 用户身份验证
- **权限管理模块**: 访问控制
- **通知服务**: 事件通知
- **审计日志模块**: 操作记录

## Security Considerations

### Data Protection
- 项目配置敏感信息加密存储
- GitLab 访问令牌安全管理
- Webhook 签名验证
- 数据库连接加密

### Access Control
- 基于项目的数据隔离
- 细粒度权限控制
- API 访问频率限制
- 跨项目访问防护

### Audit & Monitoring
- 所有操作审计日志
- 敏感操作二次确认
- 异常访问检测
- 权限变更通知

## Error Handling

### Error Response Format
```json
{
  \"error\": {
    \"code\": \"PROJECT_001\",
    \"message\": \"Project not found\",
    \"details\": \"The specified project does not exist or you don't have access\",
    \"timestamp\": \"2025-01-01T00:00:00Z\"
  }
}
```

### Error Codes
- **PROJECT_001**: 项目不存在
- **PROJECT_002**: 权限不足
- **PROJECT_003**: GitLab 集成失败
- **PROJECT_004**: 配置验证失败
- **PROJECT_005**: 成员操作失败
- **PROJECT_006**: 统计数据不可用
- **GITLAB_001**: GitLab API 访问失败
- **GITLAB_002**: Webhook 配置失败

## Constraints

### Technical Constraints
- NestJS + TypeScript + Prisma 技术栈
- RESTful API 设计规范
- OpenAPI 3.0 文档标准
- 微服务架构兼容性

### Business Constraints
- 项目数量按套餐限制
- 成员数量限制
- GitLab 访问权限要求
- 数据保留期限策略

### Performance Constraints
- 单项目最大成员数：1000
- 统计查询时间范围限制：1年
- 批量操作最大数量：100
- API 请求频率限制

## Acceptance Criteria

### AC1: 项目创建流程
1. 接收项目创建请求
2. 验证 GitLab 项目访问权限
3. 创建项目记录
4. 初始化默认配置
5. 设置创建者为项目所有者
6. 配置 GitLab Webhook
7. 返回完整项目信息

### AC2: 配置管理流程
1. 验证用户权限
2. 验证配置参数
3. 更新项目配置
4. 记录配置变更历史
5. 通知相关成员
6. 返回更新结果

### AC3: 成员管理流程
1. 验证操作权限
2. 验证用户有效性
3. 执行成员操作
4. 更新权限缓存
5. 记录操作日志
6. 发送通知

### AC4: 统计分析流程
1. 验证查询权限
2. 构建统计查询
3. 执行数据聚合
4. 格式化响应数据
5. 缓存查询结果
6. 返回统计报告

## Dependencies

### External Dependencies
- GitLab API v4
- Redis 缓存服务
- 队列处理服务
- 文件存储服务

### Internal Dependencies
- 用户认证模块
- 权限管理模块
- GitLab 集成模块
- 通知服务模块

## Risks

### 风险1: GitLab API 限流
- **影响**: 高
- **概率**: 中
- **缓解**: API 调用频率控制、缓存策略、重试机制

### 风险2: 数据量快速增长
- **影响**: 高
- **概率**: 高
- **缓解**: 分表分库、数据归档、性能优化

### 风险3: 权限模型复杂度
- **影响**: 中
- **概率**: 中
- **缓解**: 标准化角色定义、权限简化、测试覆盖

### 风险4: 配置数据丢失
- **影响**: 高
- **概率**: 低
- **缓解**: 定期备份、版本控制、配置导入导出

## Success Metrics

1. **API 响应时间** < 500ms (95th percentile)
2. **API 可用性** > 99.9%
3. **项目创建成功率** > 95%
4. **GitLab 集成成功率** > 90%
5. **配置保存成功率** > 99%
6. **统计查询性能** < 1s
7. **用户满意度** > 4.0/5.0

## Testing Requirements

### Unit Testing
- 项目管理服务单元测试覆盖率 > 85%
- 配置管理服务单元测试覆盖率 > 85%
- 权限验证服务单元测试覆盖率 > 90%

### Integration Testing
- GitLab API 集成测试
- 数据库操作集成测试
- 权限验证集成测试

### Performance Testing
- 项目列表查询性能测试
- 配置保存性能测试
- 统计查询性能测试
- 批量操作性能测试