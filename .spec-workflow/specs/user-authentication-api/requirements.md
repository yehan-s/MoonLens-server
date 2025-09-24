# Requirements: User Authentication API System

## Overview
MoonLens 用户认证 API 系统为前端客户端提供安全的身份验证、授权和用户管理服务，支持传统邮箱注册登录和 GitLab OAuth 集成，确保系统安全性和用户体验。

## User Stories

### 1. 用户注册 API
**作为** API 服务
**我需要** 提供用户注册接口
**以便于** 支持前端用户通过邮箱注册账号

**验收标准**：
- 接收注册请求（邮箱、密码、用户名）
- 验证邮箱格式和唯一性
- 验证密码强度（至少8位，包含大小写字母和数字）
- 密码 bcrypt 加密存储（salt rounds: 10）
- 成功注册后返回用户信息和 JWT Token
- 记录注册日志和审计信息

### 2. 用户登录 API
**作为** API 服务
**我需要** 提供用户登录验证接口
**以便于** 支持前端用户身份验证

**验收标准**：
- 接收登录请求（邮箱、密码）
- 验证用户凭据
- 实现登录失败锁定机制（5次失败锁定15分钟）
- 成功登录返回 JWT Token 和用户信息
- 记录登录历史和异常登录检测
- 支持多设备登录管理

### 3. GitLab OAuth 集成 API
**作为** API 服务
**我需要** 集成 GitLab OAuth 2.0 认证
**以便于** 支持用户通过 GitLab 账号登录

**验收标准**：
- 提供 OAuth 授权 URL 生成接口
- 处理 GitLab OAuth 回调
- 获取 GitLab 用户信息和访问令牌
- 首次登录自动创建关联账号
- 存储 GitLab 访问令牌和用户 ID
- 支持令牌刷新和过期处理

### 4. JWT Token 管理 API
**作为** API 服务
**我需要** 提供 Token 管理和验证服务
**以便于** 支持前端会话管理

**验收标准**：
- 生成 JWT Access Token（7天有效期）
- 生成 Refresh Token（30天有效期）
- 提供 Token 刷新接口
- Token 验证中间件
- Token 黑名单管理（退出登录时）
- 多设备 Token 管理

### 5. 密码重置 API
**作为** API 服务
**我需要** 提供密码重置功能
**以便于** 支持忘记密码的用户重置密码

**验收标准**：
- 接收密码重置请求
- 生成重置令牌（24小时有效）
- 发送重置邮件（集成邮件服务）
- 验证重置令牌有效性
- 处理密码重置请求
- 重置后使所有旧 Token 失效

### 6. 用户资料管理 API
**作为** API 服务
**我需要** 提供用户资料 CRUD 接口
**以便于** 支持前端用户信息管理

**验收标准**：
- 获取用户资料接口
- 更新用户基本信息（用户名、头像）
- 修改密码接口（需验证旧密码）
- 修改邮箱接口（需邮箱验证）
- 用户状态管理（激活、锁定、注销）
- 数据脱敏处理

## Functional Requirements

### FR1: 认证服务层
- **FR1.1**: 实现 JWT Token 生成和验证服务
- **FR1.2**: 实现密码加密和验证服务
- **FR1.3**: 实现登录失败锁定机制
- **FR1.4**: 实现 Token 刷新机制
- **FR1.5**: 实现多设备登录管理

### FR2: OAuth 集成层
- **FR2.1**: GitLab OAuth 2.0 集成
- **FR2.2**: 第三方用户信息同步
- **FR2.3**: 访问令牌管理和刷新
- **FR2.4**: OAuth 错误处理和重试
- **FR2.5**: 账号关联和绑定

### FR3: 用户管理层
- **FR3.1**: 用户 CRUD 操作
- **FR3.2**: 用户状态管理
- **FR3.3**: 用户权限角色管理
- **FR3.4**: 用户活动日志记录
- **FR3.5**: 用户数据隐私保护

### FR4: 邮件服务层
- **FR4.1**: 邮箱验证邮件发送
- **FR4.2**: 密码重置邮件发送
- **FR4.3**: 邮件模板管理
- **FR4.4**: 邮件发送队列
- **FR4.5**: 邮件发送状态追踪

### FR5: 安全服务层
- **FR5.1**: 请求频率限制
- **FR5.2**: 异常登录检测
- **FR5.3**: IP 黑名单管理
- **FR5.4**: 安全审计日志
- **FR5.5**: 敏感操作二次验证

## Non-Functional Requirements

### NFR1: 性能要求
- **NFR1.1**: 登录接口响应时间 < 300ms
- **NFR1.2**: Token 验证时间 < 50ms
- **NFR1.3**: 支持 10,000 并发用户
- **NFR1.4**: 数据库查询优化（索引覆盖）
- **NFR1.5**: 缓存策略优化（Redis）

### NFR2: 安全要求
- **NFR2.1**: 所有 API 强制 HTTPS 传输
- **NFR2.2**: SQL 注入防护（Prisma ORM）
- **NFR2.3**: XSS 攻击防护（输入验证）
- **NFR2.4**: CSRF 令牌验证
- **NFR2.5**: API 访问速率限制

### NFR3: 可用性要求
- **NFR3.1**: API 可用性 99.9%
- **NFR3.2**: 错误响应标准化
- **NFR3.3**: API 文档完整性（Swagger）
- **NFR3.4**: 健康检查接口
- **NFR3.5**: 优雅降级处理

### NFR4: 可扩展性要求
- **NFR4.1**: 水平扩展支持
- **NFR4.2**: 数据库连接池管理
- **NFR4.3**: 缓存分离部署
- **NFR4.4**: 微服务架构兼容
- **NFR4.5**: 负载均衡支持

### NFR5: 监控要求
- **NFR5.1**: API 调用监控
- **NFR5.2**: 错误日志聚合
- **NFR5.3**: 性能指标收集
- **NFR5.4**: 安全事件告警
- **NFR5.5**: 健康状态监控

## API Specifications

### Authentication APIs

#### POST /api/auth/register
```json
{
  \"request\": {
    \"email\": \"string\",
    \"password\": \"string\", 
    \"username\": \"string\"
  },
  \"response\": {
    \"user\": {
      \"id\": \"uuid\",
      \"email\": \"string\",
      \"username\": \"string\",
      \"avatar\": \"string\"
    },
    \"tokens\": {
      \"accessToken\": \"string\",
      \"refreshToken\": \"string\"
    }
  }
}
```

#### POST /api/auth/login
```json
{
  \"request\": {
    \"email\": \"string\",
    \"password\": \"string\"
  },
  \"response\": {
    \"user\": {...},
    \"tokens\": {...}
  }
}
```

#### POST /api/auth/refresh
```json
{
  \"request\": {
    \"refreshToken\": \"string\"
  },
  \"response\": {
    \"accessToken\": \"string\",
    \"refreshToken\": \"string\"
  }
}
```

#### POST /api/auth/logout
```json
{
  \"request\": {
    \"refreshToken\": \"string\"
  },
  \"response\": {
    \"message\": \"Logged out successfully\"
  }
}
```

### GitLab OAuth APIs

#### GET /api/auth/gitlab/url
```json
{
  \"response\": {
    \"authUrl\": \"string\",
    \"state\": \"string\"
  }
}
```

#### POST /api/auth/gitlab/callback
```json
{
  \"request\": {
    \"code\": \"string\",
    \"state\": \"string\"
  },
  \"response\": {
    \"user\": {...},
    \"tokens\": {...}
  }
}
```

### User Management APIs

#### GET /api/users/profile
```json
{
  \"response\": {
    \"id\": \"uuid\",
    \"email\": \"string\",
    \"username\": \"string\",
    \"avatar\": \"string\",
    \"gitlabUserId\": \"string\",
    \"createdAt\": \"datetime\"
  }
}
```

#### PUT /api/users/profile
```json
{
  \"request\": {
    \"username\": \"string\",
    \"avatar\": \"string\"
  },
  \"response\": {
    \"user\": {...}
  }
}
```

#### POST /api/users/change-password
```json
{
  \"request\": {
    \"oldPassword\": \"string\",
    \"newPassword\": \"string\"
  },
  \"response\": {
    \"message\": \"Password changed successfully\"
  }
}
```

### Password Reset APIs

#### POST /api/auth/forgot-password
```json
{
  \"request\": {
    \"email\": \"string\"
  },
  \"response\": {
    \"message\": \"Reset email sent\"
  }
}
```

#### POST /api/auth/reset-password
```json
{
  \"request\": {
    \"token\": \"string\",
    \"newPassword\": \"string\"
  },
  \"response\": {
    \"message\": \"Password reset successfully\"
  }
}
```

## Database Requirements

### User Table Schema
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  full_name VARCHAR(100),
  avatar VARCHAR(500),
  is_active BOOLEAN DEFAULT true,
  gitlab_user_id VARCHAR(50),
  gitlab_access_token TEXT,
  preferences JSON,
  failed_login_attempts INT DEFAULT 0,
  locked_until TIMESTAMP,
  email_verified_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  INDEX idx_email (email),
  INDEX idx_username (username),
  INDEX idx_gitlab_user_id (gitlab_user_id)
);
```

### Token Blacklist Table Schema
```sql
CREATE TABLE token_blacklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash VARCHAR(255) NOT NULL,
  user_id UUID NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  
  INDEX idx_token_hash (token_hash),
  INDEX idx_expires_at (expires_at),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### Login History Table Schema
```sql
CREATE TABLE login_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  ip_address INET,
  user_agent TEXT,
  login_method VARCHAR(20), -- 'email' or 'gitlab'
  success BOOLEAN NOT NULL,
  failure_reason VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  
  INDEX idx_user_id (user_id),
  INDEX idx_created_at (created_at),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

## Service Dependencies

### External Dependencies
- **GitLab OAuth API**: 用户信息获取和令牌管理
- **邮件服务**: 密码重置和验证邮件发送
- **Redis**: 缓存和会话存储
- **MySQL/PostgreSQL**: 用户数据持久化

### Internal Dependencies
- **配置服务**: JWT 密钥、OAuth 配置
- **日志服务**: 操作日志和错误日志
- **队列服务**: 异步任务处理
- **通知服务**: 系统通知推送

## Security Considerations

### Authentication Security
- JWT 使用 RS256 算法签名
- Token 包含最小必要信息
- Refresh Token 单次使用机制
- 密码复杂度强制验证

### Authorization Security
- 基于角色的访问控制（RBAC）
- 资源级别权限验证
- API 路径权限映射
- 操作权限审计

### Data Protection
- 敏感数据加密存储
- PII 数据脱敏处理
- 数据传输加密
- 数据备份加密

## Error Handling

### Error Response Format
```json
{
  \"error\": {
    \"code\": \"AUTH_001\",
    \"message\": \"Invalid credentials\",
    \"details\": \"Email or password is incorrect\",
    \"timestamp\": \"2025-01-01T00:00:00Z\"
  }
}
```

### Error Codes
- **AUTH_001**: 无效凭据
- **AUTH_002**: 账户被锁定
- **AUTH_003**: Token 已过期
- **AUTH_004**: Token 无效
- **AUTH_005**: 邮箱已存在
- **AUTH_006**: 密码不符合要求
- **OAUTH_001**: OAuth 授权失败
- **OAUTH_002**: OAuth 令牌无效

## Constraints

### Technical Constraints
- NestJS + TypeScript + Prisma 技术栈
- JWT 认证机制
- RESTful API 设计规范
- OpenAPI 3.0 文档标准
- Docker 容器化部署

### Business Constraints
- 用户注册需邮箱验证
- 密码强度策略不可降低
- OAuth 仅支持 GitLab
- 多设备登录限制（同时最多5台设备）
- 数据保留期限符合 GDPR 要求

### Performance Constraints
- 单实例支持 1000 并发用户
- 数据库连接池大小限制
- Redis 内存使用限制
- API 响应时间 SLA

## Acceptance Criteria

### AC1: 用户注册流程
1. 接收有效注册请求
2. 验证邮箱格式和唯一性
3. 验证密码复杂度
4. 创建用户记录
5. 生成 JWT Token
6. 返回用户信息和 Token
7. 记录注册日志

### AC2: 用户登录流程
1. 接收登录请求
2. 验证用户凭据
3. 检查账户状态
4. 更新登录历史
5. 生成 JWT Token
6. 返回认证信息

### AC3: OAuth 集成流程
1. 生成 GitLab OAuth URL
2. 处理 OAuth 回调
3. 获取用户信息
4. 创建/更新用户账号
5. 生成系统 Token
6. 返回认证结果

### AC4: Token 管理流程
1. 生成访问令牌
2. 生成刷新令牌
3. 验证令牌有效性
4. 处理令牌刷新
5. 管理令牌黑名单

## Dependencies

### External Dependencies
- GitLab OAuth API v4
- SMTP 邮件服务
- Redis 缓存服务
- 数据库服务

### Internal Dependencies
- 用户管理模块
- 配置管理模块
- 日志服务模块
- 队列处理模块

## Risks

### 风险1: 安全漏洞
- **影响**: 高
- **概率**: 中
- **缓解**: 定期安全审计、渗透测试、依赖更新

### 风险2: OAuth API 变更
- **影响**: 中
- **概率**: 低
- **缓解**: API 版本锁定、适配层设计、降级方案

### 风险3: 性能瓶颈
- **影响**: 高
- **概率**: 中
- **缓解**: 缓存优化、数据库优化、负载均衡

### 风险4: 数据泄露
- **影响**: 高
- **概率**: 低
- **缓解**: 数据加密、访问控制、审计日志

## Success Metrics

1. **API 响应时间** < 300ms (95th percentile)
2. **API 可用性** > 99.9%
3. **认证成功率** > 99%
4. **Token 验证性能** < 50ms
5. **安全事件数** = 0
6. **代码覆盖率** > 90%
7. **API 文档完整度** = 100%

## Testing Requirements

### Unit Testing
- 认证服务单元测试覆盖率 > 90%
- 用户管理服务单元测试覆盖率 > 90%
- OAuth 集成单元测试覆盖率 > 85%

### Integration Testing
- API 端点集成测试
- 数据库操作集成测试
- 第三方服务集成测试

### Security Testing
- 认证绕过测试
- Token 安全测试
- 输入验证测试
- 权限验证测试

### Performance Testing
- 并发用户负载测试
- API 响应时间测试
- 数据库性能测试
- 缓存性能测试