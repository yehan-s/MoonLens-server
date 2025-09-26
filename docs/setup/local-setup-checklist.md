# 本地联调清单（项目管理 + GitLab 集成）

> 目标：在本机完成登录、创建 GitLab 连接、同步项目/成员/分支、绑定项目配置与（可选）配置 Webhook。

## 前置条件
- Node.js 18+、npm 9+
- 本地数据库（MySQL 或 Postgres）与 Redis 可用
- OpenSSL（生成加密密钥）
- GitLab 账号与 PAT（建议仅最小权限，见下）

## 环境准备
- 复制并编辑环境变量
  - cp docs/setup/env.local.example .env
  - 生成 32 字节密钥：`openssl rand -base64 32`，填入 `GITLAB_ENC_KEY`
  - 设置 `DATABASE_URL`、`JWT_SECRET`、`REDIS_HOST/PORT`
  - 如需 Webhook，设置 `PUBLIC_BASE_URL`（外网可达）
- 初始化数据库
  - `npx prisma generate`
  - `npx prisma migrate dev`
  - `npm run prisma:seed`（创建管理员 admin@moonlens.com / Admin@123456）
- 启动后端
  - `npm run start:dev`

## 验证流程
1) 登录获取访问令牌（accessToken）
- POST /auth/login
- Body: `{ "email":"admin@moonlens.com", "password":"Admin@123456" }`

2) 创建 GitLab 连接
- POST /gitlab/connections
- Body: `{ "name":"my-gitlab", "host":"https://gitlab.com", "authType":"PAT", "token":"<你的PAT>" }`
- 记录返回的 `id` 作为 `connectionId`

3) 测试连接
- GET /gitlab/connections/{connectionId}/test
- 返回 `{ ok: true }` 即表示可用

4) 同步可见项目
- POST /gitlab/connections/{connectionId}/sync-projects
- 返回 `{ synced: <数量> }`

5) 选择一个 GitLab 项目（projectGitlabId）
- 可在上一步同步完后，到数据库表 `projects` 查看对应 `gitlabProjectId`
- 或直接使用你已知的 GitLab 项目 ID

6) 绑定连接到本地项目配置
- PUT /projects/{localProjectId}/config（或先 POST /projects 创建本地项目）
- Body: `{ "association": { "connectionId": "<connectionId>" } }`

7) 同步成员与分支
- POST /gitlab/connections/{connectionId}/projects/{projectGitlabId}/sync-members
- POST /gitlab/connections/{connectionId}/projects/{projectGitlabId}/sync-branches

8) （可选）创建/更新项目 Webhook
- POST /gitlab/connections/{connectionId}/projects/{projectGitlabId}/hooks
- Body 可选：`{ "callbackUrl":"<你的PUBLIC_BASE_URL>/api/webhooks/gitlab", "secret":"<可选>" }`

## GitLab PAT 最小权限
- 只读同步：`read_api`
- 管理 Hook：需要 `api`

## 常见问题
- 缺少 `GITLAB_ENC_KEY` 会导致创建连接时报错
- `.env.example` 与 Prisma 使用的 `DATABASE_URL` 不一致时，以本清单的 `DATABASE_URL` 为准
- 若无外网地址，Webhook 步骤可跳过

