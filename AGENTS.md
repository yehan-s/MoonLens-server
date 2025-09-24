# Repository Guidelines

## 项目结构与模块组织
- 源码：`src/`（NestJS 模块化）
  - 入口：`src/main.ts`；根模块：`src/app.module.ts`
  - 业务模块：`users/`、`auth/`、`projects/`、`review/`、`ai/`、`gitlab/`、`common/`
- 数据模型：`prisma/schema.prisma`
- 测试：同目录 `*.spec.ts`（单元/集成）；E2E 在 `test/`
- 构建产物：`dist/`
- 配置与文档：`.env`（参考 `.env.example`）、`nest-cli.json`、`tsconfig*.json`、`Architecture-Overview.md`

## 构建、测试与本地开发
- 开发启动：`npm run start:dev`（热重载）
- 生产启动：`npm run build && npm run start:prod`
- 代码检查：`npm run lint`；格式化：`npm run format`
- 单元测试：`npm test`；覆盖率：`npm run test:cov`
- E2E 测试：`npm run test:e2e`
- 可选编排：`docker-compose up -d`（如需依赖服务）

## 代码风格与命名约定
- 语言：TypeScript（NestJS DI + 装饰器）
- Lint/Format：ESLint（`eslint.config.mjs`）+ Prettier（`.prettierrc`）
  - Prettier：`singleQuote: true`，`trailingComma: all`
- 缩进与命名：2 空格；类/装饰器 `PascalCase`，变量/函数 `camelCase`，文件小写连字符或语义后缀（如 `users.service.ts`、`auth.dto.ts`）
- 分层约定：Controller 只处理 I/O；业务逻辑置于 Service；数据访问经 `PrismaService`

## 测试规范
- 框架：Jest（`*.spec.ts`）；E2E 配置：`test/jest-e2e.json`
- 约束：新增/变更功能需配套单测；接口改动建议增加 E2E
- 命名示例：`users.controller.spec.ts`、`projects.service.spec.ts`
- 运行：`npm test` / `npm run test:cov` / `npm run test:e2e`

## 提交与 Pull Request
- 提交信息：建议遵循 Conventional Commits（如 `feat: ...`、`fix: ...`、`chore: ...`）
- PR 要求：
  - 清晰描述与变更清单；关联 Issue
  - 必要时附运行截图/日志与影响面、回滚方案
  - 通过 `lint` 与全部测试；无未格式化文件

## 安全与配置提示（重要）
- 环境变量：基于 `.env.example` 创建 `.env`；切勿提交真实密钥
- Prisma：修改 `schema.prisma` 后执行 `npx prisma generate`；本地迁移用 `npx prisma migrate dev`
- API 文档：新增接口请补充 `@nestjs/swagger` 注解与示例

## 代理/工具集成（可选）
- MCP：项目包含 `.mcp.json` 与 `.serena/`，可用于代码检索与自动化编辑
- 约定：保持模块边界清晰，自动化修改需通过测试与 Lint

