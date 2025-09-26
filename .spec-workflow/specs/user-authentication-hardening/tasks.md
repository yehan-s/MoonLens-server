# Tasks — User Authentication Hardening

> 完整任务列表（原子化、含文件定位）。每个任务均含实现提示 _Prompt（用于代理/协作开发）。

- [ ] 1. 引入 TOTP 服务与接口
  - Files: src/auth/services/totp.service.ts, src/auth/auth.controller.ts
  - Desc: 提供 2FA 的 setup/enable/disable/verify 四个端点与服务，secret 加密存储
  - _Leverage: otplib 或自实现 HMAC，crypto AES‑GCM，加密工具已有
  - _Requirements: FR-H1, NFR-H1
  - _Prompt: Implement the task for spec user-authentication-hardening, first run spec-workflow-guide to get the workflow guide then implement the task: As a security engineer, add TOTP 2FA setup/enable/disable/verify endpoints. Encrypt secret with AES‑GCM; only persist after verify success. Add DTOs and validation. Update login flow to return need2fa when enabled and require /auth/2fa/verify to issue JWT. Restrictions: do not log secrets/codes; ensure replay protection. _Leverage: otplib, crypto util, existing AuthService. Success: endpoints pass e2e and secret never appears in logs.

- [ ] 2. 邮件服务与验证流程
  - Files: src/common/services/mail.service.ts, src/auth/auth.controller.ts
  - Desc: 发送验证邮件与验证回调；模板化；可切换 provider
  - _Leverage: nodemailer/provider, existing EmailVerification 表
  - _Requirements: FR-H2, NFR-H3
  - _Prompt: Implement the task for spec user-authentication-hardening, first run spec-workflow-guide to get the workflow guide then implement the task: Build MailService with SMTP config + simple templates. Add /auth/email/send-verification and /auth/email/verify. Restrictions: rate-limit sending; do not leak whether email exists. Success: verification toggles emailVerified and audited.

- [ ] 3. 权限持久化（模型与服务）
  - Files: prisma/schema.prisma, src/auth/services/permission.service.ts, src/auth/guards/permissions.guard.ts
  - Desc: 新增 Role/Permission/UserRole/RolePermission；PermissionGuard 改读 DB + 缓存
  - _Leverage: Prisma, CacheModule
  - _Requirements: FR-H3, NFR-H5
  - _Prompt: Implement the task for spec user-authentication-hardening, first run spec-workflow-guide to get the workflow guide then implement the task: Add schema and service to materialize roles/permissions; update PermissionGuard to load+cache. Restrictions: keep backward-compatible switch PERM_PERSIST_ENABLED. Success: admin APIs reflect DB values and guard honors them.

- [ ] 4. 权限管理接口（Admin）
  - Files: src/admin/controllers/roles.controller.ts, src/admin/controllers/permissions.controller.ts
  - Desc: 角色/权限 CRUD 与授予/撤销用户角色
  - _Leverage: JwtAuthGuard, RolesGuard(admin), ValidationPipe
  - _Requirements: FR-H3
  - _Prompt: Implement the task for spec user-authentication-hardening, first run spec-workflow-guide to get the workflow guide then implement the task: Build admin endpoints for role/permission CRUD and user role grant/revoke. Restrictions: audit all changes; add throttling. Success: e2e admin flows green.

- [ ] 5. 刷新令牌轮换与重用检测
  - Files: src/auth/services/jwt.service.ts, prisma/schema.prisma
  - Desc: 为 RefreshToken 增加 rotatedFrom/rotatedAt 字段；检测被重用的旧 refresh → 撤销并审计
  - _Leverage: Prisma transaction, AuditLogService
  - _Requirements: FR-H4, NFR-H1
  - _Prompt: Implement the task for spec user-authentication-hardening, first run spec-workflow-guide to get the workflow guide then implement the task: Implement refresh rotation chain and reuse detection; if reuse occurs, revoke tokens and sessions; log security event. Restrictions: atomic TX; avoid leaking details. Success: e2e covers reuse path.

- [ ] 6. 会话并发限制与淘汰
  - Files: src/auth/auth.service.ts, src/auth/auth.controller.ts
  - Desc: 登录前检查活跃会话数，超过 SESSION_MAX 淘汰最旧会话
  - _Leverage: Prisma orderBy lastActivity, env SESSION_MAX
  - _Requirements: FR-H5
  - _Prompt: Implement the task for spec user-authentication-hardening, first run spec-workflow-guide to get the workflow guide then implement the task: Enforce per-user max sessions and LRU eviction. Restrictions: audit eviction; configurable via env. Success: e2e validates eviction.

- [ ] 7. Captcha 集成（登录/忘记密码阈值）
  - Files: src/common/services/captcha.service.ts, src/auth/auth.controller.ts
  - Desc: 按阈值要求提供 captchaToken 并校验
  - _Leverage: provider SDK / 自实现 HMAC 校验
  - _Requirements: FR-H6, NFR-H3
  - _Prompt: Implement the task for spec user-authentication-hardening, first run spec-workflow-guide to get the workflow guide then implement the task: Add CaptchaService and integrate to login/forgot-password when thresholds exceeded. Restrictions: do not hardcode provider keys. Success: e2e covers challenge path.

- [ ] 8. 审计与指标扩展
  - Files: src/common/services/audit-log.service.ts, src/common/services/metrics.service.ts
  - Desc: 扩展事件种类与指标（2FA、邮箱验证、刷新重用、会话淘汰、权限变更、captcha）
  - _Leverage: nest-winston, prom-client
  - _Requirements: FR-H7, NFR-H4
  - _Prompt: Implement the task for spec user-authentication-hardening, first run spec-workflow-guide to get the workflow guide then implement the task: Add audit events + Prom metrics; expose on /metrics. Success: metrics visible and meaningful.

- [ ] 9. 文档与配置
  - Files: README.md, Architecture-Overview.md, .env.example
  - Desc: 新增/更新环境变量与使用指南、风险提示
  - _Leverage: 现有文档结构
  - _Requirements: NFR-H5
  - _Prompt: Implement the task for spec user-authentication-hardening, first run spec-workflow-guide to get the workflow guide then implement the task: Update docs for 2FA/mail/rbac/rotation/captcha/session limits. Success: reviewers can deploy by docs only.

- [ ] 10. E2E 测试补齐
  - Files: test/*.e2e-spec.ts
  - Desc: 覆盖 2FA、邮箱验证、权限管理、刷新重用、并发会话与 Captcha 场景
  - _Leverage: supertest, jest
  - _Requirements: FR-H1..H7, NFR-H4
  - _Prompt: Implement the task for spec user-authentication-hardening, first run spec-workflow-guide to get the workflow guide then implement the task: Add comprehensive e2e that seed and clean DB. Restrictions: avoid flaky; use time-bounded waits. Success: all green in CI.
