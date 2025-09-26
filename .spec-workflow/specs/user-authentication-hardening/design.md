# User Authentication Hardening — Design

## 架构与组件
- 2FA 组件：TOTPService（otplib/自实现HMAC），控制器 endpoints：启用/验证/关闭；User 表新增 2fa 字段（secret/enabled/backupCodes 可选）。
- 邮件组件：MailService（nodemailer/provider 适配），模板与开关；复用 PasswordReset/EmailVerification 表。
- 权限持久化：Prisma 新表 roles/permissions/role_permissions/user_roles；PermissionGuard 改为 DB 源 + 缓存。
- 刷新轮换与重用检测：在 RefreshToken 表记录父子链/轮换戳；检测旧 token 再用→撤销会话 + 警告日志。
- 会话并发限制：Session 表查询活跃数，超过阈值（env：SESSION_MAX=5）则淘汰最旧。
- Captcha：在登录/重置阈值后要求提交 captchaToken，经 CaptchaService 校验后放行。
- 审计与指标：扩展 AuditLogService 与 MetricsService（2fa_events_total、token_reuse_total、captcha_challenges_total 等）。

## 数据模型建议（Prisma）
- User：`twoFactorEnabled:Boolean`、`twoFactorSecret:String?`（加密存储）；`emailVerified:Boolean` 已有。
- Role/Permission/UserRole/RolePermission：字符串主键或 UUID，名称唯一，适配缓存。
- RefreshToken：`rotatedFrom:String?` `rotatedAt:DateTime?`；重用检测依据。

## 接口与流程
- 2FA
  - POST /auth/2fa/setup → 返回 otpauth/url + secret（只在验证通过后保存）
  - POST /auth/2fa/enable { code } → 成功后 twoFactorEnabled=true
  - POST /auth/2fa/disable { code } → 关闭
  - 登录：若 twoFactorEnabled，/auth/login 返回 need2fa，随后 /auth/2fa/verify 颁发 JWT
- 邮件
  - POST /auth/email/send-verification；GET /auth/email/verify?token=...
- RBAC
  - /admin/roles /admin/permissions CRUD；/admin/users/:id/roles grant/revoke
- 刷新/会话
  - 刷新：将旧 refresh 设为 rotatedFrom，新发 token 记录 rotatedAt；检测旧 token 使用即判重用
  - 并发：登录前检查活跃数量，淘汰最旧

## 配置与环境变量
- 2FA：TOTP_ISSUER，TOTP_DIGITS=6，TOTP_STEP=30
- 邮件：MAIL_PROVIDER/SMTP_*；模板目录
- 会话：SESSION_MAX，SESSION_TTL_DAYS
- Captcha：CAPTCHA_PROVIDER / SECRET / THRESHOLDS

## 安全与隐私
- TwoFactorSecret 加密存储（AES‑GCM），仅在验证阶段短暂解密
- 日志脱敏：邮箱、IP 局部脱敏；Token 不落日志

## 迁移策略
- 权限持久化：先读 DB 不命中回退内存；灰度切换开关 PERM_PERSIST_ENABLED
- 2FA：逐步为管理员/高危用户引导启用

