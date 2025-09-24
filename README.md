# MoonLens Server

GitLab 原生 AI 代码审查工具后端服务

## 技术栈

- **框架**: NestJS
- **数据库**: MySQL 8.0 / PostgreSQL（可选）
- **缓存/队列**: Redis
- **认证**: JWT
- **API 文档**: Swagger
- **容器化**: Docker

## 快速开始

### 前置要求

- Node.js >= 20.11
- MySQL 8.0 或 PostgreSQL
- Redis
- Docker & Docker Compose (可选)

### 本地开发

1. 安装依赖
```bash
npm install
```

2. 配置环境变量
```bash
cp .env.example .env
# 编辑 .env 文件，配置数据库和其他服务
```

3. 启动开发服务器
```bash
npm run start:dev
```

4. 访问 API 文档
```
http://localhost:3000/api-docs
```

### 使用 Docker Compose

```bash
# 启动所有服务
docker-compose up -d

# 查看日志
docker-compose logs -f moonlens-server

# 停止服务
docker-compose down
```

## 项目结构

```
src/
├── auth/          # 认证模块
├── users/         # 用户管理模块
├── projects/      # 项目管理模块
├── gitlab/        # GitLab 集成模块
├── ai/            # AI 服务模块
├── review/        # 代码审查模块
├── common/        # 公共模块
└── main.ts        # 应用入口
```

## 核心功能

- **GitLab 集成**: 支持 GitLab Webhook，自动触发代码审查
- **AI 代码审查**: 集成 AI 模型进行智能代码分析
- **实时通知**: WebSocket 实时推送审查进度和结果
- **任务队列**: 使用 Bull 队列处理异步审查任务
- **权限管理**: JWT 认证和基于角色的访问控制

## API 端点

主要 API 端点：

- `POST /api/auth/login` - 用户登录
- `POST /api/auth/register` - 用户注册
- `GET /api/projects` - 获取项目列表
- `POST /api/projects` - 创建项目
- `POST /api/gitlab/webhook` - GitLab Webhook 接收端点
- `POST /api/review/trigger` - 手动触发代码审查
- `GET /api/review/:id` - 获取审查结果

## 环境变量说明

查看 `.env.example` 文件了解所有配置项

## 开发命令

```bash
# 开发模式
npm run start:dev

# 生产构建
npm run build

# 生产模式运行
npm run start:prod

# 运行测试
npm run test

# 运行 E2E 测试
npm run test:e2e

# 代码格式化
npm run format

# 代码检查
npm run lint
```

## 许可证

MIT