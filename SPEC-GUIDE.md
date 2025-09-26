# GitLab AI 代码审查平台 - Spec 创建指南

## 项目概述

基于 **Architecture-Overview.md**，本项目是一个面向 GitLab 的 AI 代码审查 SaaS 平台，采用如下架构：
- **后端**: NestJS + Prisma + BullMQ
- **AI 服务**: Python FastAPI
- **前端**: Vue 3 + Vite
- **队列**: Redis/RabbitMQ
- **数据库**: MySQL

## Spec 创建路线图

### 阶段一：核心功能 Specs

#### 1. `gitlab-integration` - GitLab 集成
**目标**: 实现 GitLab Webhook 接收、验证和 API 交互
- Webhook 事件处理（MR/Push/Comment）
- GitLab API 客户端封装
- 访问令牌管理
- Webhook 安全校验

#### 2. `review-engine` - 审查引擎
**目标**: 实现核心 AI 审查逻辑
- MR diff 解析与处理
- AI Provider 抽象层（OpenAI/Anthropic/兼容接口）
- Prompt 模板管理
- 审查结果结构化输出

#### 3. `task-queue` - 任务队列系统
**目标**: 异步任务处理架构
- BullMQ 队列配置
- 任务调度与重试机制
- 任务状态追踪
- 失败处理与告警

#### 4. `project-management` - 项目管理
**目标**: 多项目配置与管理
- 项目注册与配置
- Token 加密存储
- 项目级别设置
- 权限控制

### 阶段二：AI 服务 Specs

#### 5. `ai-service-core` - AI 服务核心
**目标**: FastAPI 微服务实现
- REST API 端点设计
- 多模型 Provider 支持
- 请求校验与响应格式
- 性能优化（并发/缓存）

#### 6. `llm-providers` - LLM Provider 集成
**目标**: 多 LLM 平台支持
- OpenAI API 集成
- Anthropic Claude 集成
- 兼容接口适配（中转/代理）
- Fallback 机制

### 阶段三：扩展功能 Specs

#### 7. `dashboard-api` - 管理面板 API
**目标**: 前端管理界面后端支持
- 用户认证（JWT）
- 项目配置 API
- 审查历史查询
- 统计数据接口

#### 8. `security-compliance` - 安全与合规
**目标**: 安全机制实现
- Webhook 签名验证
- API Key 加密管理
- 审计日志
- 数据脱敏处理

## 每个 Spec 的创建流程

### 步骤 1: Requirements（需求文档）
为每个 spec 创建需求文档，包含：
- **用户故事**: 从用户角度描述功能需求
- **功能需求**: 详细的功能点列表
- **非功能需求**: 性能、安全、可扩展性要求
- **验收标准**: EARS 格式的验收条件

### 步骤 2: Design（设计文档）
技术设计文档，包含：
- **架构设计**: 模块结构、数据流
- **API 设计**: 端点、请求/响应格式
- **数据模型**: 实体定义、关系图
- **技术选型**: 具体库/框架选择
- **错误处理**: 异常场景与降级策略

### 步骤 3: Tasks（任务分解）
将设计转化为可执行任务：
- **原子任务**: 每个任务 1-3 个文件
- **依赖关系**: 任务间的依赖
- **文件路径**: 具体要创建/修改的文件
- **测试要求**: 单元测试、集成测试

### 步骤 4: Implementation（实施）
- 按任务列表逐个实现
- 更新任务状态（pending → in-progress → completed）
- 确保代码质量和测试覆盖

## 推荐创建顺序

1. **先创建 Steering 文档**（可选但推荐）
   - `product.md`: 产品愿景与目标用户
   - `tech.md`: 技术栈选择理由
   - `structure.md`: 项目结构规范

2. **核心 Spec 优先级**
   ```
   gitlab-integration → review-engine → task-queue → project-management
   ```

3. **AI 服务 Spec**
   ```
   ai-service-core → llm-providers
   ```

4. **扩展功能 Spec**
   ```
   dashboard-api → security-compliance
   ```

## 使用 Spec Workflow MCP 工具

### 初始化
```bash
# 确保 MCP 服务器已配置（已在 .mcp.json 中配置）
# 启动 spec-workflow 服务
```

### 创建第一个 Spec
```
1. 运行: mcp__spec-workflow__spec-workflow-guide
2. 选择要创建的 spec，例如: "gitlab-integration"
3. 按照工作流逐步创建:
   - Requirements → 审批
   - Design → 审批
   - Tasks → 审批
   - Implementation
```

### 检查进度
```
运行: mcp__spec-workflow__spec-status
参数: 
  - projectPath: /Users/yehan/code/MoonLens/MoonLens-server
  - specName: gitlab-integration
```

## 特定于本项目的注意事项

### 1. GitLab API 版本
- 使用 GitLab API v4
- 支持 SaaS 和自托管版本
- 考虑 API 限流和重试

### 2. LLM API 配置
- 支持多种 API Key 来源（官方/中转/代理）
- 实现 Provider 抽象以便切换
- 考虑 Token 限制和成本控制

### 3. 异步处理
- 使用消息队列解耦服务
- MVP 使用 Redis + BullMQ
- 预留 RabbitMQ 升级路径

### 4. 安全要求
- 不持久化源码内容
- Webhook 签名验证
- Token 加密存储
- 最小权限原则

### 5. 扩展性设计
- Provider 模式支持多 Git 平台
- RAG 功能预留接口
- 水平扩展能力

## 环境变量模板

每个 spec 实现时需要的环境变量：

```env
# Backend (.env)
PORT=8080
NODE_ENV=development
GITLAB_BASE_URL=https://gitlab.com
GITLAB_WEBHOOK_SECRET=change-me
DB_URL=mysql://glai:glai@mysql:3306/glai
REDIS_URL=redis://redis:6379
AI_SERVICE_URL=http://ai-service:8081

# AI Service (.env)
AI_PROVIDER=openai
OPENAI_API_KEY=sk-xxx
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
```

## 开发建议

1. **先实现 MVP 版本**
   - 基础 Webhook 接收
   - 简单 AI 调用
   - 基本评论发布

2. **逐步增加功能**
   - 多模型支持
   - 高级 Prompt 策略
   - RAG 增强

3. **保持模块化**
   - 清晰的接口定义
   - 依赖注入
   - 易于测试

4. **文档驱动开发**
   - 先写 Spec 再写代码
   - 保持文档更新
   - 记录决策理由

## 下一步行动

1. 创建 `.spec-workflow/steering/` 文档（可选）
2. 开始创建第一个 spec: `gitlab-integration`
3. 按照 Spec Workflow 完成所有阶段
4. 实施代码并更新任务状态

---

*本指南基于 Architecture-Overview.md 创建，用于指导使用 Spec Workflow MCP 工具系统化地构建 GitLab AI 代码审查平台。*
