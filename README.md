# GitLab AI 代码审查平台（Vue + NestJS + Python）

> 面向 GitLab 的 AI 代码审查平台：前端 Vue、后端 NestJS、AI 分析微服务 Python(FastAPI)。采用“三段式多服务 + apps/* 目录结构”，AI 服务最终由 Python 实现并独立部署。

---

## 项目愿景（Product Brief）
- 目标：让每个团队都能以低成本获得高质量的 MR 审查反馈，缩短反馈闭环，提升代码质量与交付效率。
- 核心能力：MR 摘要、逐行建议、多供应商 LLM、Webhook 事件驱动、可扩展插件体系。
- 路线图：MVP（已落地）→ 增强体验（对话式审查/自定义规则）→ 智能升级（RAG/自动修复）→ 企业特性（私有化/审计/合规）。详见 `.spec-workflow/steering/product.md`。

---

## 系统架构（三段式）
```
          +-----------------------+             +---------------------+
          |       GitLab          |  Webhook    |      Backend        |
          |  (MR/Push/Comment)    +-----------> |   NestJS (REST)     |
          +-----------+-----------+             | - /webhooks/gitlab  |
                      |                          | - GitLab Provider   |
                      |                          | - Queue/BullMQ      |
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
```
- 更详细说明见 `Architecture-Overview.md`

---

## 目录结构（apps/*）
```
apps/
  frontend/   # Vue 3 + Vite + TS
  backend/    # NestJS + Prisma + BullMQ
  ai-service/ # FastAPI + httpx + pydantic
infra/
  compose.yaml
specs/        # 规范/需求/设计/任务（见 .spec-workflow）
docs/
  api/        # API 文档（OpenAPI/Swagger/Postman）
```

---

## 快速开始（Docker Compose）
- 推荐使用 `infra/compose.yaml` 启动 mysql/redis/backend/ai-service/frontend。
```bash
cd infra
docker compose up --build
```
- 本地开发：
  - Backend：进入 `apps/backend`，配置 `.env`，运行 `npm run start:dev`
  - AI Service：进入 `apps/ai-service`，配置 `.env`，运行 `uvicorn app:app --reload --port 8081`
  - Swagger：后端启动后访问 `/api-docs`

---

## 环境变量（示例）
- Backend（NestJS）`apps/backend/.env`
```env
PORT=3000
NODE_ENV=development
# 数据库（统一使用 MySQL）
DATABASE_URL=mysql://ml:ml@localhost:3306/moonlens

REDIS_URL=redis://localhost:6379

JWT_SECRET=change-me
JWT_EXPIRES_IN=3600

GITLAB_BASE_URL=https://gitlab.com
GITLAB_WEBHOOK_SECRET=change-me

# 文档与联系信息（用于 Swagger 联系方式显示）
CONTACT_NAME=MoonLens Team
CONTACT_URL=https://moonlens.com
CONTACT_EMAIL=yehanescn@gmail.com

# GitLab 令牌加密（必须 32 字节，Base64 编码）
# 生成示例（Node）：console.log(require('crypto').randomBytes(32).toString('base64'))
GITLAB_ENC_KEY=REPLACE_WITH_BASE64_32B_KEY

# TOTP 2FA（可选）
TOTP_ISSUER=MoonLens
TOTP_DIGITS=6
TOTP_STEP=30

# GitLab OAuth（可选）
GITLAB_OAUTH_CLIENT_ID=
GITLAB_OAUTH_CLIENT_SECRET=
GITLAB_OAUTH_CALLBACK_URL=http://localhost:3000/api/auth/gitlab/callback
 
# GitLab OAuth（可选）
GITLAB_OAUTH_CLIENT_ID=
GITLAB_OAUTH_CLIENT_SECRET=
GITLAB_OAUTH_CALLBACK_URL=http://localhost:3000/api/auth/gitlab/callback
```
- AI Service（FastAPI）`apps/ai-service/.env`
```env
AI_PROVIDER=openai
OPENAI_API_KEY=sk-xxx
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
```

---

## 权限与安全
- 认证：JWT + Refresh，`JwtAuthGuard`/`JwtStrategy`
- 角色（RBAC）：`RolesGuard` + `@Roles(UserRole.…)`（继承：ADMIN ⊇ USER ⊇ GUEST）
- 资源权限：`PermissionsGuard` + `@Permissions('resource:action')`（带缓存）
- 审计：基础审计打点 `AuditLogService`（可扩展至 ELK/ClickHouse）

---

## 双因素认证（2FA）
- 功能说明：支持基于 TOTP（如 Google Authenticator）的两步验证，Secret 采用 AES‑GCM 加密存储。
- 关键变量：`TOTP_ISSUER`、`TOTP_DIGITS`、`TOTP_STEP`
- 使用流程：
  1) 登录后调用 `POST /auth/2fa/setup` 获取 `{ secret, otpauthUrl }`（展示给用户扫码）
  2) 用户输入 App 中生成的 6 位验证码，调用 `POST /auth/2fa/enable { secret, code }`
  3) 启用后，`/auth/login` 会返回 `{ need2fa: true, twoFactorToken }`
  4) 前端使用 `twoFactorToken` 与一次性验证码调用 `POST /auth/2fa/verify`，服务端签发 JWT/Refresh 并创建会话
  5) 关闭：`POST /auth/2fa/disable { code }`
- 安全与审计：所有启用/关闭/验证事件写入审计日志；验证码与密钥不落日志。

---

## 术语（Spec）
- FR（Functional Requirement）：功能性需求，例如“实现 2FA 登录流程”。
- NFR（Non‑Functional Requirement）：非功能性需求，例如“安全性、性能、可观测性等”。

---

## Spec 驱动开发（重要）
- 指南位置：`.spec-workflow/`（steering：产品/技术/结构；specs：requirements/design/tasks）
- 工作流：Requirements → Design → Tasks → Implementation
  - 实施任务前，在 `tasks.md` 将对应条目标记为 `[-]`
  - 完成后将 `[-]` 改为 `[x]`，并附上实现说明
- 当前规范：`user-authentication-api`（实现进度见 `.spec-workflow/specs/user-authentication-api/tasks.md`）
- 建议：提交 PR 时在描述中引用任务编号与需求条目，保持“规格 ↔ 实现”可追溯

---

## 技术决策与差异说明
- 数据库：统一使用 MySQL（Prisma）
- ORM：采用 Prisma（与仓库实现一致）
  - 理由：生成能力强、类型推导良好、迁移体验更顺滑
- 队列：Redis + BullMQ（MVP），生产可升级 RabbitMQ

---

## 常用脚本
- 开发：`npm run start:dev`
- 生产：`npm run build && npm run start:prod`
- 规范：`npm run lint`，格式化：`npm run format`
- 测试：`npm test`、`npm run test:cov`、`npm run test:e2e`
- Prisma：`npx prisma generate`、`npx prisma migrate dev`

---

## 贡献与部署建议
- 提交规范：建议遵循 Conventional Commits
- 部署：各服务独立镜像与配置，数据库迁移/种子纳入 CI/CD；生产禁用公开 Swagger 或加鉴权
- 可观测性：Prometheus + Grafana + ELK/Jaeger（按需启用）

---

更多背景、架构与演进路线，请阅读：`Architecture-Overview.md` 与 `.spec-workflow/steering/*`。
