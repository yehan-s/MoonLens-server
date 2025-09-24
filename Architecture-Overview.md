# GitLab AI 代码审查平台（Vue + NestJS + Python）

> 一套面向 **GitLab** 的 AI 代码审查 SaaS 架构模板：前端 **Vue**、后端 **NestJS**、AI 分析微服务 **Python(FastAPI)**。
> MVP 阶段**直接调用商业 LLM API**（支持中转/第三方 Key），中低并发可用，架构可水平扩展，并为**RAG**与**私有化部署**预留接口。

---

## 目录

* [功能特性](#功能特性)
* [系统架构](#系统架构)
* [目录结构](#目录结构)
* [快速开始](#快速开始)
* [环境变量与配置](#环境变量与配置)
* [GitLab 集成指引](#gitlab-集成指引)
* [后端 API（NestJS）](#后端-apinestjs)
* [AI 微服务 API（FastAPI）](#ai-微服务-apifastapi)
* [部署（Docker/K8s）](#部署dockerk8s)
* [安全与合规](#安全与合规)
* [RAG 预留与路线图](#rag-预留与路线图)
* [常见问题](#常见问题)
* [贡献与许可](#贡献与许可)

---

## 功能特性

* **MR 自动摘要**：MR 创建/更新时生成简明变更摘要。
* **逐行审查评论**：在 MR diff 行内给出可操作建议（缺陷、可读性、最佳实践）。
* **事件驱动**：GitLab Webhook 触发分析，异步处理，不阻塞 MR 页面。
* **多模型支持**：可配置 OpenAI / Anthropic / Azure OpenAI / 兼容 OpenAI 的中转代理（自定义 `BASE_URL`）。
* **可扩展**：消息队列解耦，横向扩容；RAG、SAST、对话式审查等能力可平滑加装。
* **平台抽象**：后端以适配器模式封装 Git 平台，MVP 聚焦 GitLab，后续可拓展 GitHub/Bitbucket。
* **安全默认开启**：Webhook 校验、最小权限、用后即焚、不持久化源码片段（除非显式开启 RAG 索引）。

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

## 目录结构

```
.
├─ apps/
│  ├─ frontend/           # Vue 3 + Vite + TS（GitLab风格UI）
│  ├─ backend/            # NestJS + TypeORM + BullMQ
│  └─ ai-service/         # FastAPI + httpx + pydantic
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

## 快速开始

### 前置要求

* Node.js ≥ 18（或 20），pnpm/yarn/npm 任选
* Python ≥ 3.11，pip/uv（任选）
* Docker 与 Docker Compose
* 一个 GitLab 项目（SaaS 或自托管均可）
* 一组可用的 **LLM API Key**（支持中转/第三方 Key）

### 一键启动（推荐：Docker Compose）

`infra/compose.yaml`（示例）：

```yaml
version: "3.9"
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: glai
      POSTGRES_USER: glai
      POSTGRES_PASSWORD: glai
    ports: ["5432:5432"]
  redis:
    image: redis:7
    ports: ["6379:6379"]

  backend:
    build: ../apps/backend
    env_file: ../apps/backend/.env
    depends_on: [postgres, redis]
    ports: ["8080:8080"]

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

运行：

```bash
cd infra
docker compose up --build
```

---

## 环境变量与配置

> **要点**：Python 仅在需要时由后端触发调用；允许接入第三方/中转 Key；LLM 访问地址与密钥均可配置。

### Backend（NestJS）`apps/backend/.env`

```env
# 服务
PORT=8080
NODE_ENV=development
LOG_LEVEL=info

# GitLab
GITLAB_BASE_URL=https://gitlab.com
GITLAB_WEBHOOK_SECRET=change-me                 # 用于校验 Webhook
# 对于每个项目的访问令牌建议通过前端配置后加密存库，不放 .env

# 数据库
DB_URL=postgres://glai:glai@postgres:5432/glai

# 队列（MVP：Redis + BullMQ）
REDIS_URL=redis://redis:6379

# AI 服务
AI_SERVICE_URL=http://ai-service:8081
AI_TIMEOUT_MS=120000

# CORS / 鉴权（用于前端管理面板）
DASHBOARD_JWT_SECRET=change-me
CORS_ORIGIN=http://localhost:5173
```

### AI Service（FastAPI）`apps/ai-service/.env`

```env
# Provider 选择：openai | anthropic | azureopenai | openai_compatible
AI_PROVIDER=openai
# OpenAI（或兼容 OpenAI 的中转/代理）
OPENAI_API_KEY=sk-xxx
OPENAI_BASE_URL=https://api.openai.com/v1       # 若使用中转，替换为代理 BASE_URL
OPENAI_MODEL=gpt-4o-mini                        # 也可使用 gpt-4o, o3-mini 等

# Anthropic（可选）
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-3-5-sonnet-20240620

# 请求控制
AI_TEMPERATURE=0.2
AI_MAX_TOKENS=1200
AI_REQUEST_TIMEOUT=120

# RAG（默认关闭；未来启用）
RAG_ENABLED=false
VECTOR_DB_PROVIDER=pinecone                      # pinecone | milvus | weaviate
PINECONE_API_KEY=
PINECONE_INDEX=

# 安全
SAFE_MODE=true                                   # 输出过滤等
```

### Frontend（Vue）`apps/frontend/.env`

```env
VITE_API_BASE_URL=http://localhost:8080
```

---

## GitLab 集成指引

1. **创建 Webhook**

   * GitLab → *Project* → *Settings* → *Webhooks*
   * URL：`https://<your-backend-domain>/webhooks/gitlab`
   * Secret Token：使用 `GITLAB_WEBHOOK_SECRET`
   * 订阅事件（至少）：**Merge request events**（创建/更新）、**Push events**（可选，用于增量更新）、**Comments（Note）events**（为对话式审查预留）
   * 启用 SSL 验证 & 触发测试，后端应返回 `200`。

2. **后端访问 GitLab**

   * 推荐：为目标项目/组创建**访问令牌**（最小权限：`api` 或具体到 `read_repository` + `write_repository`/`api` 以便写评论）。
   * 在前端“项目设置”界面录入该令牌（后端加密存储），后端以项目维度使用对应 Token 调用 GitLab API。

---

## 后端 API（NestJS）

> 管理与集成 API（示例）——实际请以项目内 OpenAPI 文档为准。

* `POST /webhooks/gitlab`
  接收 GitLab 事件（MR/Push/Note）。验证 `X-Gitlab-Token` 后，将 MR 分析任务入队。

* `POST /api/projects/:projectId/token`
  绑定/更新项目的 GitLab 访问令牌（仅 Maintainer/Owner 可用）。

* `GET /api/reviews?projectId=...&mrIid=...`
  查询某 MR 的历史分析记录摘要。

* `POST /api/config`
  更新全局/项目级 AI 设置（默认模型、开关等）。

> **发布评论**：后端收到 AI 结果后，调用 GitLab API：
>
> * 行内评论：`POST /projects/:id/merge_requests/:iid/discussions`
> * MR 摘要：`POST /projects/:id/merge_requests/:iid/notes` 或更新 MR 描述

---

## AI 微服务 API（FastAPI）

* `POST /v1/review`

  * **入参示例**：

    ```json
    {
      "project": { "id": 123, "name": "foo/bar" },
      "mr": {
        "iid": 7,
        "title": "feat: add pagination",
        "description": "…",
        "author": "alice",
        "diffs": [
          {
            "file": "src/api/users.ts",
            "language": "ts",
            "patch": "@@ -10,6 +10,15 @@ ...",
            "newPath": "src/api/users.ts",
            "oldPath": "src/api/users.ts",
            "hunks": [
              { "newStart": 40, "newLines": 12, "oldStart": 35, "oldLines": 0, "content": "..." }
            ]
          }
        ]
      },
      "options": {
        "provider": "openai",
        "model": "gpt-4o-mini",
        "temperature": 0.2,
        "rag": false
      }
    }
    ```
  * **出参示例**：

    ```json
    {
      "summary": "该 MR 增加分页参数校验与默认值…",
      "comments": [
        {
          "file": "src/api/users.ts",
          "line": 52,
          "level": "issue",
          "comment": "分页参数未限制上限，可能导致过大页大小的性能问题。建议设置 maxPageSize 并在控制器层校验。"
        },
        {
          "file": "src/api/users.ts",
          "line": 61,
          "level": "suggestion",
          "comment": "考虑将重复的分页参数解析逻辑提取为中间件或工具函数以复用。"
        }
      ]
    }
    ```

> **多模型支持**：通过 `AI_PROVIDER` 与请求 `options` 联动；若 Provider 不可用，支持在服务内部做 **fallback**（例如优先 Anthropic，失败则回退 OpenAI）。

---

## 部署（Docker/K8s）

### Docker 镜像

* `apps/backend/Dockerfile`：构建 NestJS 产物（多阶段：builder + runtime）
* `apps/ai-service/Dockerfile`：FastAPI + `uvicorn` 运行
* `apps/frontend/Dockerfile`：Vite 构建 + Nginx 托管静态资源

### Kubernetes（示意）

* `Deployment`：`backend` / `ai-service` / `frontend`
* `Service`：各自 `ClusterIP`，对外暴露 Ingress（HTTPS）
* `ConfigMap/Secret`：以 K8s Secret 持有 API Key/Token；通过 Env 注入
* `HPA`：根据 CPU/内存/自定义指标（如队列长度）自动扩缩容
* 队列：MVP 用 Redis（托管或自管）；生产可切换 RabbitMQ 集群

---

## 安全与合规

* **Webhook 校验**：校验 `X-Gitlab-Token` 与 `GITLAB_WEBHOOK_SECRET`。
* **最小权限**：GitLab Access Token 仅授予读取仓库与写评论所需权限。
* **凭证管理**：API Key/Token 存放 K8s Secrets / 云秘钥管家（不入镜像/代码库）。
* **用后即焚**：不持久化完整源码；仅在内存中处理 diff；日志避免记录代码内容。
* **第三方 LLM**：默认不授权用于训练；优先选择支持“零保留”的企业选项；支持自定义 `BASE_URL` 指向私有/代理网关。
* **审计**：记录审查任务与结果摘要、配置变更操作日志，便于追踪与合规检查。

---

## RAG 预留与路线图

* **当前（MVP）**：不开启 RAG，直接将 MR diff + 轻量上下文提示给 LLM，快速验证价值。
* **阶段二**：启用仓库索引器（异步），将函数/类/文档切分嵌入至 **向量数据库**（Pinecone/Milvus 等）；在审查时语义检索相关上下文拼接入 Prompt，**降低误报、提升“项目相关性”**。
* **阶段三**：引入**对话式审查**（监听评论事件），支持“为什么？”、“给重构示例”、“生成单测”等交互；探索对高频任务使用**微调开源模型** + **模型路由**，平衡成本/质量。

---

## 常见问题

**Q1：我有一个中转的 Codex/兼容 OpenAI 的 Key，可以用吗？**
A：可以。设置 `AI_PROVIDER=openai`，并将 `OPENAI_BASE_URL` 指向你的中转地址，同时填入 `OPENAI_API_KEY`。模型名可用 `OPENAI_MODEL=gpt-4o-mini`（或中转支持的名称）。

**Q2：Python 服务是一直跑吗？**
A：AI 微服务常驻，但**仅在需要时**由后端派发任务；你也可通过开关限制触发时机（如仅在 MR 打标签或变更超过阈值时触发）。

**Q3：如何避免评论“刷屏”？**
A：在后端开启去重与阈值控制：相同建议不重复发布；限制每次最多评论 N 条；将长建议折叠为摘要 + 详情链接。

**Q4：自托管如何做？**
A：所有组件容器化；将 LLM 访问改为企业内网代理或自建模型端点（保留相同接口）；向量数据库用自托管 Milvus；Secrets 用企业密管；Ingress 走内网网关。

---

## 贡献与许可

* 欢迎提交 Issue/PR（规范：commitlint + lint-staged + Prettier/ESLint）。
* 许可（示例）：MIT（或根据你的实际选择在根目录 `LICENSE` 指定）。

---

### 开发提示（可选）

* **后端**：

  * 适配层接口 `IRepositoryProvider`（`fetchDiff()`, `postSummary()`, `postInlineComments()`…）
  * 默认实现 `GitLabProvider`；未来新增 `GitHubProvider` 只需实现同接口。
  * 队列（BullMQ）：`reviews` 队列（生产可换 RabbitMQ）。

* **AI 服务**：

  * Provider 抽象：`ModelProvider`（OpenAI/Anthropic/AzureOpenAI/OpenAICompatible）。
  * Prompt 模板：MR 概览、逐行建议（含严重级别与修复建议），可通过配置热更新。
  * 输出校验：pydantic 模型保证结构化返回。
  * 失败重试：`tenacity` 指数回退；对超时/配额错误做降级与告警。

* **前端**：

  * 设置（项目令牌、模型选择、开关）+ 审查记录列表 + 明细页。
  * 风格：GitLab UI 近似设计，减少用户心理切换。

---

> 如需，我可以把上述 README 拆分为实际的 `compose.yaml`、`Dockerfile`、`NestJS Module` 与 `FastAPI Router` 的最小可运行样板代码，直接落库启动。
