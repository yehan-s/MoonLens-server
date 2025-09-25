# MoonLens Server 项目概述

## 项目简介
MoonLens是一个企业级GitLab AI代码审查平台的后端服务，提供智能化代码审查、项目管理和团队协作功能。

## 技术架构
- **框架**: NestJS + TypeScript
- **数据库**: Prisma + MySQL
- **缓存/队列**: Redis + BullMQ
- **认证**: JWT + Passport.js + OAuth 2.0
- **AI集成**: OpenAI GPT + Anthropic Claude
- **部署**: Docker + Kubernetes

## 核心模块架构

### 1. 用户认证API (user-authentication-api)
**功能**: JWT认证、OAuth集成、会话管理
- 邮箱密码注册/登录
- GitLab OAuth 2.0认证
- Token管理和刷新机制
- 密码重置流程
- 多设备登录管理
- 审计日志记录

### 2. 项目管理API (project-management-api) 
**功能**: 项目生命周期管理、权限控制
- 项目CRUD操作
- RBAC权限管理系统
- 成员管理和角色分配
- 项目配置管理
- 统计分析和报表
- 搜索和筛选功能

### 3. GitLab集成API (gitlab-integration-api)
**功能**: GitLab平台深度集成
- GitLab项目导入和同步
- Webhook事件处理
- MR操作管理
- 项目成员同步
- API调用频率控制
- 错误恢复机制

### 4. AI代码审查API (ai-code-review-api)
**功能**: 智能代码审查和建议生成
- 多AI模型支持(OpenAI/Anthropic)
- 代码差异分析
- 安全漏洞检测
- 建议生成和分类
- 对话式审查交互
- 成本控制和监控

## 数据库设计

### 核心实体
- **users**: 用户信息和认证
- **projects**: 项目配置和状态
- **project_members**: 项目成员关系
- **gitlab_connections**: GitLab连接配置
- **gitlab_projects**: GitLab项目映射
- **webhook_events**: Webhook事件记录
- **code_reviews**: 代码审查记录
- **review_suggestions**: 审查建议
- **ai_models**: AI模型配置
- **ai_model_usage**: 使用统计

## 项目结构
```
MoonLens-server/
├── .spec-workflow/           # 规范文档
│   ├── steering/            # 指导文档
│   └── specs/               # 模块规范
│       ├── user-authentication-api/
│       ├── project-management-api/
│       ├── gitlab-integration-api/
│       └── ai-code-review-api/
├── src/                     # 源代码目录
│   ├── auth/               # 认证模块
│   ├── users/              # 用户管理
│   ├── projects/           # 项目管理
│   ├── gitlab/             # GitLab集成
│   ├── ai/                 # AI服务
│   ├── review/             # 代码审查
│   └── common/             # 公共模块
├── prisma/                 # 数据库配置
├── test/                   # 测试文件
└── docker-compose.yml      # Docker配置
```

## 开发流程

### 规范文档体系
项目采用Spec Workflow规范，每个模块包含：
- **requirements.md**: 需求规格说明
- **design.md**: 架构设计文档
- **tasks.md**: 开发任务分解

### 当前状态
✅ 所有4个核心API模块的完整规范文档已创建
✅ 所有design和tasks文档已提交审批
🔄 等待文档审批完成后开始实际开发

## 关键特性

### 安全性
- JWT Token安全管理
- 密码bcrypt加密
- API访问控制
- 敏感数据脱敏
- 审计日志追踪

### 性能优化
- Redis缓存策略
- 数据库查询优化
- 异步队列处理
- API频率限制
- CDN加速支持

### 可扩展性
- 模块化架构设计
- 微服务就绪
- 水平扩展支持
- 插件化AI模型
- 开放API接口

### 监控告警
- 应用性能监控
- 业务指标统计
- 错误追踪分析
- 自动告警机制
- 运维自动化

## 部署环境
- **开发环境**: Docker Compose
- **生产环境**: Kubernetes
- **数据库**: MySQL 8.0 + Redis
- **对象存储**: 支持多种云存储
- **监控**: Prometheus + Grafana

## 团队协作
- Git工作流程
- 代码评审规范  
- 自动化测试
- CI/CD流水线
- 文档驱动开发