# 贡献指南（MoonLens 后端）

## 提交前检查
- [ ] 已阅读 `docs/开发与联调约定.md` 并遵循其中调试/联调约定
- [ ] 对应 Spec（requirements/design/tasks）审批通过，任务项按 `[ ]/[-]/[x]` 更新
- [ ] 变更对齐 `docs/` 架构文档（Architecture-Overview、技术实现、零持久化、集成文档等）
- [ ] 本地调试：`npm run start:dev`（端口 3000），健康 `/api/health`、Swagger `/api-docs`
- [ ] 依赖：MySQL/Redis 已就绪；必要时使用 `docker compose up -d mysql redis`
- [ ] 数据库：优先 `npx prisma db push` 同步
- [ ] 无敏感信息入库；令牌/密钥通过环境变量或密管

## PR 要求
- 说明：变更范围、风险与回滚方案
- 联调说明：涉及接口/用例/注意事项
- 关联：Spec 审批 ID、相关 issue/任务

