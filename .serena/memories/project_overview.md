# MoonLens Server 项目概述

## 项目目的
MoonLens 是一个 GitLab 原生 AI 代码审查工具的后端服务，旨在提供智能化的代码审查功能。

## 主要功能
- GitLab 集成：支持 GitLab Webhook，自动触发代码审查
- AI 代码审查：集成 AI 模型进行智能代码分析
- 实时通知：WebSocket 实时推送审查进度和结果
- 任务队列：使用 Bull 队列处理异步审查任务
- 权限管理：JWT 认证和基于角色的访问控制

## 技术栈
- **框架**: NestJS 11.x (企业级 Node.js 框架)
- **语言**: TypeScript 5.7
- **数据库**: 
  - ORM: Prisma 6.16 (替代 TypeORM)
  - 数据库: MySQL 8.0 (主选) / PostgreSQL (可选)
- **缓存/队列**: Redis + Bull
- **认证**: JWT + Passport.js
- **API 文档**: Swagger
- **WebSocket**: Socket.io
- **GitLab API**: @gitbeaker/node
- **容器化**: Docker + Docker Compose

## 项目结构
```
MoonLens-server/
├── src/                    # 源代码目录
│   ├── auth/              # 认证模块
│   ├── users/             # 用户管理模块
│   ├── projects/          # 项目管理模块
│   ├── gitlab/            # GitLab 集成模块
│   ├── ai/                # AI 服务模块
│   ├── review/            # 代码审查模块
│   ├── common/            # 公共模块（包含 PrismaService）
│   ├── app.module.ts      # 主应用模块
│   └── main.ts            # 应用入口
├── prisma/                # Prisma 数据库配置
│   └── schema.prisma      # 数据库模型定义
├── test/                  # 测试文件
├── docker-compose.yml     # Docker 编排配置
├── Dockerfile             # Docker 镜像配置
└── .env                   # 环境变量配置
```

## 数据模型
- User: 用户信息
- Project: 项目配置
- Review: 代码审查记录
- WebhookEvent: Webhook 事件记录
- AIConfig: AI 模型配置
- ReviewRule: 审查规则配置

## API 设计
- RESTful API 设计
- 全局 API 前缀: `/api`
- Swagger 文档: `http://localhost:3000/api-docs`

## 开发环境
- Node.js >= 20.11
- macOS (Darwin) 系统
- VS Code 推荐