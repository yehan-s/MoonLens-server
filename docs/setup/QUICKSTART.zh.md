# MoonLens 后端快速启动（本地 / Docker）

本文档描述如何在本地使用 Docker 快速启动 MoonLens 后端（NestJS + Prisma + Bull/Redis），并给出常见验证路径。

## 一、环境准备
- 安装 Docker（已包含 Compose 插件）
- 端口占用：`3000`（HTTP API）、`3001`（WebSocket，可选）、`3306`（MySQL）、`6379`（Redis）
- 若 3306/6379 已被占用，可在 `docker-compose.yml` 修改对外映射端口

## 二、启动（Docker Compose）
```bash
# 进入后端目录
cd MoonLens-server

#（可选）检查/拷贝示例环境变量
cp -n .env.example .env || true

# 启动 MySQL + Redis + MoonLens Server（后台模式）
docker compose up -d

# 查看容器状态
docker compose ps
```

首次启动会拉取镜像并构建服务镜像（`moonlens-server`）。MySQL 初始化脚本位于 `init.sql`。

## 三、验证
- 健康检查
  - 浏览器打开：`http://localhost:3000/api/health`
- Swagger 文档
  - 打开：`http://localhost:3000/api-docs`
- 队列状态（需要 JWT）
  - `GET /api/queue/status?name=analysis`
- 审查报告导出（需要 JWT）
  - `GET /api/reviews/reports/:reportId/export?format=html|json|pdf`

> 登录接口与默认种子用户，请参考 `docs/README.md`、`docs/API.md` 或 `docs/setup/local-setup-checklist.md`。

## 四、常见问题
- 端口冲突：修改 `docker-compose.yml` 的 `ports` 对外映射后重启
- 数据未初始化：`docker compose logs mysql` 查看 MySQL 初始化日志
- Server 未启动：`docker compose logs moonlens-server` 查看后端启动日志
- 修改代码未生效：Dockerfile 默认以生产方式运行；开发模式建议本机直启（见下）

## 五、本机开发模式（可选）
适合频繁改动代码并热重载：
```bash
# 安装依赖
npm ci

# 生成 Prisma 客户端并迁移（需要本地 MySQL/Redis）
npx prisma generate
npx prisma migrate dev

# 启动开发模式
npm run start:dev
```

所需环境变量请参考：`docs/setup/env.local.example` 与项目根目录 `.env`。

---
如需 GitLab 集成联调、Webhook、Provider 选择与 AI Key 配置，请参阅：
- `docs/setup/local-setup-checklist.md`
- `docs/API.md`、`docs/SWAGGER.md`
- `Architecture-Overview.md`

