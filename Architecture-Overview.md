# GitLab AI 代码审查平台（Vue + NestJS + Python）

> 一套面向 GitLab 的 AI 代码审查 SaaS 架构模板：前端 Vue、后端 NestJS、AI 分析微服务 Python(FastAPI)。支持“前端/后端/AI 微服务”三段式架构与多仓结构（apps/*），AI 服务部分采用 Python 实现，可独立扩展与部署。

---

## 目录

- 功能特性
- 系统架构
- 目录结构（apps/* 多服务）
- 快速开始（Docker Compose）
- 环境变量与配置
- GitLab 集成指引
- 后端 API（NestJS）
- AI 微服务 API（FastAPI）
- 部署（Docker/K8s）
- 安全与合规
- RAG 预留与路线图
- 常见问题
- 贡献与许可

---

## 功能特性

- MR 自动摘要、逐行审查评论
- 事件驱动（Webhook）与异步处理（队列）
- 多模型支持（OpenAI/Anthropic/Azure/兼容 OpenAI 的代理）
- 可扩展：RAG、SAST、对话式审查等能力可平滑加装
- 安全默认开启：Webhook 校验、最小权限、用后即焚

---

## 系统架构

```
          +-----------------------+             +---------------------+
          |       GitLab          |  Webhook    |      Backend        |
          |  (MR/Push/Comment)    +-----------> |   NestJS (REST)     |
          +-----------+-----------+             | - /webhooks/gitlab  |
                      |                          | - GitLab Provider   |
                      |                          | - Task Enqueue      |
                      |                          +----+----------------+
                      |                               |
                      |                               | (jobs)
                      |                               v
          +-----------v-----------+             +----+----------------+
          |     Frontend (Vue)    |  HTTPS      |   Queue (Redis)     |
          |  Settings & Dashboard +<----------->|  (BullMQ / RMQ*)    |
          +-----------------------+             +----+----------------+
                                                       |
                                                       | (consume)
                                                       v
                                             +---------+-----------+
                                             |    AI Service       |
                                             | FastAPI (Python)    |
                                             | - /v1/review        |
                                             | - LLM Providers     |
                                             | - RAG (optional)    |
                                             +---------+-----------+
                                                       |
                                                       | (LLM API over HTTPS)
                                                       v
                                           +-----------+-----------+
                                           |   LLM Providers       |
                                           | OpenAI/Anthropic/...  |
                                           +-----------------------+

* 生产可用 RabbitMQ；MVP 推荐 Redis + BullMQ
```

---

## 目录结构（apps/* 多服务）

```
.
├─ apps/
│  ├─ frontend/           # Vue 3 + Vite + TS（GitLab风格UI）
│  ├─ backend/            # NestJS + Prisma + BullMQ
│  └─ ai-service/         # FastAPI + httpx + pydantic（Python 实现）
├─ packages/
│  └─ shared/             # 通用类型与工具（可选）
├─ infra/
│  ├─ docker/             # 各服务 Dockerfile
│  ├─ k8s/                # 部署清单（可选）
│  └─ compose.yaml        # 开发/演示用 docker-compose
├─ docs/
│  └─ api/                # OpenAPI/接口文档（可选）
└─ README.md
```

---

## 快速开始（Docker Compose）

示例：`infra/compose.yaml`

```yaml
version: "3.9"
services:
  mysql:
    image: mysql:8
    environment:
      MYSQL_DATABASE: moonlens
      MYSQL_USER: ml
      MYSQL_PASSWORD: ml
      MYSQL_ROOT_PASSWORD: mlroot
    ports: ["3306:3306"]
  redis:
    image: redis:7
    ports: ["6379:6379"]

  backend:
    build: ../apps/backend
    env_file: ../apps/backend/.env
    depends_on: [mysql, redis]
    ports: ["3000:3000"]

  ai-service:
    build: ../apps/ai-service
    env_file: ../apps/ai-service/.env
    depends_on: [redis]
    ports: ["8081:8081"]

  frontend:
    build: ../apps/frontend
    env_file: ../apps/frontend/.env
    depends_on: [backend]
    ports: ["5173:5173"]
```

启动：

```bash
cd infra
docker compose up --build
```

---

## 环境变量与配置

后端（NestJS）`apps/backend/.env`

```env
PORT=3000
NODE_ENV=development
DATABASE_URL=mysql://ml:ml@mysql:3306/moonlens
REDIS_URL=redis://redis:6379

JWT_SECRET=change-me
JWT_EXPIRES_IN=3600

GITLAB_BASE_URL=https://gitlab.com
GITLAB_WEBHOOK_SECRET=change-me
CONTACT_NAME=MoonLens Team
CONTACT_URL=https://moonlens.com
CONTACT_EMAIL=yehanescn@gmail.com
GITLAB_ENC_KEY=REPLACE_WITH_BASE64_32B_KEY
TOTP_ISSUER=MoonLens
TOTP_DIGITS=6
TOTP_STEP=30
```

AI 服务（FastAPI）`apps/ai-service/.env`

```env
AI_PROVIDER=openai
OPENAI_API_KEY=sk-xxx
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
```

---

## GitLab 集成指引（摘要）

- 在 GitLab 项目设置 Webhook 指向 `backend` 的 `/webhooks/gitlab`
- 使用 `GITLAB_WEBHOOK_SECRET` 校验请求
- 提供项目级访问令牌（建议通过前端管理界面配置并加密存储）
 - Webhook 安全：
   - 请求头 `X-Gitlab-Token` 必须与项目的 `webhookSecret` 匹配（若项目未配置则使用全局 `GITLAB_WEBHOOK_SECRET`）；否则 403
   - 事件存入 `webhook_events` 表并标记 `processed=false`，供后续消费者处理
- 连接管理 API：
  - POST `/api/gitlab/connections` 创建连接（加密存储令牌）
  - GET `/api/gitlab/connections` 列出当前用户连接
  - GET `/api/gitlab/connections/{id}/test` 测试连接可用性
  - DELETE `/api/gitlab/connections/{id}` 删除连接
  - POST `/api/gitlab/connections/{id}/sync-projects` 同步可见项目（元数据）
  - POST `/api/gitlab/connections/{id}/import-projects` 按 ID 列表导入项目

---

## 后端 API（NestJS）

- Swagger：`/api-docs`
- 鉴权：JWT + `JwtAuthGuard`；权限：`RolesGuard`（@Roles）、`PermissionsGuard`（@Permissions）
- 队列：Bull（Redis）用于异步审查任务
- 2FA（TOTP）：
  - POST `/auth/2fa/setup`（登录后） → 返回 `{ secret, otpauthUrl }`
  - POST `/auth/2fa/enable` → `{ secret, code }` 成功后启用
  - POST `/auth/2fa/disable` → `{ code }` 关闭
  - POST `/auth/2fa/verify` → `{ twoFactorToken, code, deviceId? }` 验证后颁发 JWT/Refresh

---

## AI 微服务 API（FastAPI）

- 路径：`/v1/review`，接收 MR Diff 与上下文，调用 LLM，返回摘要与逐行建议
- Provider 抽象：OpenAI/Anthropic/AzureOpenAI/兼容OpenAI
- 超时与重试：可配置，建议指数回退

---

## 部署（Docker/K8s）

- 每个服务独立镜像与部署单元（Deployment + Service + Ingress）
- 配置中心与秘钥：K8s ConfigMap/Secret 注入
- 可选 HPA：按 CPU/内存/队列长度扩缩

---

## 安全与合规

- Webhook 校验、最小权限、凭证管理（Secrets）
- 默认不持久化完整源码片段；日志避免记录代码内容
- 审计：记录审查任务与配置变更（可接入 ELK）

---

## RAG 预留与路线图

- 阶段一（MVP）：直连 LLM
- 阶段二：向量数据库（Milvus/Pinecone）+ 语义检索拼接
- 阶段三：对话式审查、模型路由与成本优化

---

## 常见问题

- 可否使用兼容 OpenAI 的中转？可以，设置 `OPENAI_BASE_URL`。
- Python 服务是否必须？AI 能力由 Python 服务承载，推荐常驻。

---

## 贡献与许可

- 欢迎 Issue/PR；建议遵循 commitlint、ESLint/Prettier
- License：MIT（示例）
