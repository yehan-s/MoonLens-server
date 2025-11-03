# Tasks: User Authentication API

基于用户认证系统的需求分析和设计文档，将开发工作分解为具体可执行的任务，每个任务都包含明确的实现路径和验收标准。

## 数据库与实体管理

- [x] 1. 设计并创建User实体模型
  - File: src/user/entities/user.entity.ts
  - 创建用户实体，包含基本字段、认证字段、状态管理字段，设置数据库索引和约束
  - Purpose: 建立用户数据的核心结构，为认证系统提供数据基础
  - _Leverage: Prisma ORM, class-validator, class-transformer
  - _Requirements: FR3.1, NFR1.1
  - _Prompt: You are a senior backend developer working on a NestJS application with Prisma ORM. Create the User entity with fields for authentication (email, password hash, salt), profile (username, avatar), OAuth integration (gitlab_id, gitlab_token), status management (is_active, is_locked, last_login_at), and timestamps. Include proper validations, indexes, and database constraints. Set up proper field mappings and ensure security best practices for sensitive data. When implementing this task, mark it as completed by changing the checkbox from [ ] to [x] and add implementation notes in the commit message.

- [x] 2. 创建Prisma数据库Schema配置
  - File: prisma/schema.prisma
  - 定义完整的数据库Schema，包含User、TokenBlacklist、LoginHistory等表结构
  - Purpose: 建立数据库结构基础，确保数据一致性和性能
  - _Leverage: Prisma Schema Language, MySQL
  - _Requirements: NFR2.4, NFR1.1
  - _Prompt: You are a database architect working on a user authentication system using Prisma and MySQL. Design a comprehensive schema including User table (with proper indexes on email, gitlab_id), TokenBlacklist table for JWT token management, LoginHistory table for audit trails, and any relation tables needed. Include proper field types, constraints, indexes for performance, and consider data privacy requirements. Set up proper database relationships and cascading rules. When implementing this task, mark it as completed by changing the checkbox from [ ] to [x] and add implementation notes in the commit message.

- [x] 3. 实现数据库迁移和种子数据
  - File: prisma/migrations/*, prisma/seed.ts
  - 创建数据库迁移文件并实现种子数据脚本，包含默认管理员账户
  - Purpose: 建立数据库版本控制和初始数据设置
  - _Leverage: Prisma Migrate, Prisma Client
  - _Requirements: NFR4.4
  - _Prompt: You are a DevOps engineer setting up database migrations for a NestJS authentication system. Create initial database migration files and implement a seed script that creates default admin user, sets up proper password hashing, and includes any reference data needed. Ensure migrations are reversible and include proper error handling. Create a seed script that can safely run multiple times without creating duplicates. When implementing this task, mark it as completed by changing the checkbox from [ ] to [x] and add implementation notes in the commit message.

## 核心认证服务

- [x] 4. 实现密码加密服务
  - File: src/auth/services/password.service.ts
  - 创建密码哈希、验证、强度检查服务，使用bcrypt进行加密
  - Purpose: 提供安全的密码处理功能，保护用户密码安全
  - _Leverage: bcryptjs, class-validator
  - _Requirements: NFR1.1, FR1.1
  - _Prompt: You are a security-focused backend developer implementing password security for a NestJS application. Create a PasswordService with methods for hashing passwords using bcrypt (salt rounds: 10), verifying passwords, and validating password strength (minimum 8 characters, must contain uppercase, lowercase, and numbers). Include proper error handling, logging for security events, and ensure all operations are async. Add comprehensive unit tests covering edge cases. When implementing this task, mark it as completed by changing the checkbox from [ ] to [x] and add implementation notes in the commit message.

- [x] 5. 开发JWT Token管理服务
  - File: src/auth/services/jwt.service.ts
  - 实现JWT Token的生成、验证、刷新和黑名单管理功能
  - Purpose: 提供完整的JWT Token生命周期管理
  - _Leverage: @nestjs/jwt, jsonwebtoken
  - _Requirements: FR1.1, FR1.4, FR4.1
  - _Prompt: You are a backend security specialist developing JWT token management for a NestJS application. Create a JwtService that handles token generation with user claims, token validation with proper error handling, automatic token refresh mechanism (when < 1 hour remaining), and token blacklist management. Include methods for token revocation, batch token invalidation, and token payload extraction. Ensure proper security headers and implement rate limiting for token operations. When implementing this task, mark it as completed by changing the checkbox from [ ] to [x] and add implementation notes in the commit message.

- [x] 6. 创建认证Guards和策略
  - File: src/auth/guards/jwt-auth.guard.ts, src/auth/strategies/jwt.strategy.ts
  - 实现JWT认证Guard和Passport策略，提供路由级别的认证保护
  - Purpose: 建立路由级别的认证和授权控制机制
  - _Leverage: @nestjs/passport, passport-jwt
  - _Requirements: FR2.3, FR2.4
  - _Prompt: You are a NestJS authentication expert implementing route protection mechanisms. Create JwtAuthGuard using Passport JWT strategy for route protection, LocalAuthGuard for login endpoints, and RolesGuard for role-based access control. Include proper error handling, custom decorators for public routes, and integration with the JWT service. Implement guard composition for complex authorization scenarios and ensure guards work properly with WebSocket connections. When implementing this task, mark it as completed by changing the checkbox from [ ] to [x] and add implementation notes in the commit message.

## 用户管理功能

- [x] 7. 实现用户注册功能
  - File: src/auth/controllers/auth.controller.ts, src/auth/services/auth.service.ts
  - 开发用户注册接口，包含邮箱验证、密码强度检查、用户创建
  - Purpose: 提供用户注册功能，建立新用户账户
  - _Leverage: class-validator, class-transformer
  - _Requirements: FR3.1, AC1
  - _Prompt: You are a full-stack developer implementing user registration for a NestJS authentication system. Create registration endpoints with comprehensive validation (email format, uniqueness check, password strength), user creation with proper password hashing, automatic login after successful registration, and proper error responses. Include rate limiting for registration attempts, input sanitization, and email verification workflow. Implement proper DTOs for request/response and comprehensive logging. When implementing this task, mark it as completed by changing the checkbox from [ ] to [x] and add implementation notes in the commit message.

- [x] 8. 开发用户登录功能
  - File: src/auth/controllers/auth.controller.ts, src/auth/services/auth.service.ts
  - 创建用户登录接口，包含凭据验证、Token生成、登录历史记录
  - Purpose: 提供安全的用户登录功能和会话管理
  - _Leverage: passport-local, @nestjs/throttler
  - _Requirements: FR1.2, AC2, NFR2.1
  - _Prompt: You are a backend developer creating secure login functionality for NestJS. Implement login endpoints with credential validation, JWT token generation, login history tracking, and account lockout after 5 failed attempts (15-minute lockout). Include login rate limiting, IP tracking, device fingerprinting, and comprehensive audit logging. Create proper DTOs and ensure response includes user profile and token information. Add remember-me functionality and proper session management. When implementing this task, mark it as completed by changing the checkbox from [ ] to [x] and add implementation notes in the commit message.

- [x] 9. 实现用户资料管理功能
  - File: src/user/controllers/user.controller.ts, src/user/services/user.service.ts
  - 开发用户资料查看、更新、头像上传功能
  - Purpose: 提供完整的用户资料管理功能
  - _Leverage: multer, sharp (图片处理)
  - _Requirements: FR3.2, AC3
  - _Prompt: You are a full-stack developer implementing user profile management for NestJS. Create endpoints for viewing user profile, updating profile information (username, email with verification), changing password (with old password verification), and avatar upload with image processing. Include proper validation, file size limits, image compression, and secure file storage. Implement profile privacy controls and audit logging for sensitive changes. When implementing this task, mark it as completed by changing the checkbox from [ ] to [x] and add implementation notes in the commit message.

- [x] 10. 开发密码重置功能
  - File: src/auth/services/password-reset.service.ts
  - 实现忘记密码、重置Token生成、邮件发送、密码重置流程
  - Purpose: 提供安全的密码重置机制
  - _Leverage: nodemailer, crypto
  - _Requirements: FR3.3, AC4
  - _Prompt: You are a security engineer implementing password reset functionality for NestJS. Create a password reset system with secure token generation (24-hour expiry), email sending with proper templates, token validation, and new password setting. Include rate limiting for reset requests, token usage tracking (one-time use), and comprehensive security logging. Implement proper email templates and ensure old passwords are invalidated after successful reset. When implementing this task, mark it as completed by changing the checkbox from [ ] to [x] and add implementation notes in the commit message.

## OAuth集成功能

- [x] 11. 配置GitLab OAuth策略
  - File: src/auth/strategies/gitlab.strategy.ts
  - 实现GitLab OAuth 2.0认证策略和配置
  - Purpose: 提供GitLab账户登录集成功能
  - _Leverage: passport-gitlab2
  - _Requirements: FR1.3, AC3
  - _Prompt: You are an OAuth integration specialist implementing GitLab authentication for NestJS. Create GitLab OAuth strategy with proper configuration, user profile fetching, token storage, and account linking logic. Handle OAuth errors gracefully, implement proper scopes for GitLab API access, and ensure secure token storage. Include callback URL handling and proper redirect management. When implementing this task, mark it as completed by changing the checkbox from [ ] to [x] and add implementation notes in the commit message.

- [x] 12. 实现OAuth用户管理
  - File: src/auth/services/oauth.service.ts
  - 开发OAuth用户创建、账户绑定、Token管理功能
  - Purpose: 管理OAuth用户的创建和账户关联
  - _Leverage: GitLab API client
  - _Requirements: FR1.3, FR1.5
  - _Prompt: You are a backend developer implementing OAuth user management for NestJS. Create service for handling OAuth user creation (first-time GitLab login), account linking (existing users connecting GitLab), GitLab token storage and refresh, and account unlinking. Include GitLab profile synchronization, proper error handling for GitLab API failures, and user permission mapping from GitLab roles. When implementing this task, mark it as completed by changing the checkbox from [ ] to [x] and add implementation notes in the commit message.

## 会话和Token管理

- [x] 13. 实现Token刷新机制
  - File: src/auth/services/token-refresh.service.ts
  - 开发自动Token刷新功能，包含刷新策略和Token轮换
  - Purpose: 提供无缝的Token刷新体验，保持用户会话
  - _Leverage: @nestjs/schedule, Redis
  - _Requirements: FR1.4, FR4.2
  - _Prompt: You are a session management expert implementing token refresh for NestJS. Create automatic token refresh service that detects tokens expiring within 1 hour, generates new tokens with proper claims, maintains refresh token rotation, and handles concurrent refresh requests. Include Redis-based refresh token storage, proper cleanup of expired tokens, and rate limiting for refresh operations. Implement graceful degradation when refresh fails. When implementing this task, mark it as completed by changing the checkbox from [ ] to [x] and add implementation notes in the commit message.

- [x] 14. 开发Token黑名单管理
  - File: src/auth/services/token-blacklist.service.ts
  - 实现Token撤销、黑名单检查、批量Token失效功能
  - Purpose: 提供Token安全控制和会话管理
  - _Leverage: Redis, Prisma
  - _Requirements: FR4.1, NFR3.1
  - _Prompt: You are a security engineer implementing token blacklist management for NestJS. Create token blacklist service with Redis-based storage for fast lookups, database persistence for audit trails, batch token revocation for user logout from all devices, and automatic cleanup of expired blacklist entries. Include middleware for blacklist checking and proper error handling. Optimize for high-performance token validation. When implementing this task, mark it as completed by changing the checkbox from [ ] to [x] and add implementation notes in the commit message.

- [x] 15. 实现多设备会话管理
  - File: src/auth/services/session.service.ts
  - 开发多设备登录检测、会话列表、远程注销功能
  - Purpose: 提供多设备会话控制和安全管理
  - _Leverage: device-detector-js, geoip-lite
  - _Requirements: FR4.3, NFR3.1
  - _Prompt: You are a session security specialist implementing multi-device session management for NestJS. Create session tracking with device fingerprinting, IP geolocation, login device detection, active session listing, and remote session termination. Include suspicious login detection, concurrent session limits, and session activity monitoring. Implement proper privacy controls and session encryption. When implementing this task, mark it as completed by changing the checkbox from [ ] to [x] and add implementation notes in the commit message.

## 授权和权限控制

- [x] 16. 实现基于角色的访问控制(RBAC)
  - File: src/auth/guards/roles.guard.ts, src/auth/decorators/roles.decorator.ts
  - 开发角色管理、权限检查、动态权限控制系统
  - Purpose: 建立细粒度的权限控制机制
  - _Leverage: @nestjs/common, reflect-metadata
  - _Requirements: FR2.1, FR2.2, FR2.4
  - _Prompt: You are an authorization expert implementing RBAC for NestJS. Create role-based access control with roles (admin, user, guest), permission decorators, role guards, and dynamic permission checking. Include role inheritance, resource-based permissions, and administrative role management. Implement proper permission caching and audit logging for permission changes. Create flexible permission system supporting both route-level and resource-level controls. When implementing this task, mark it as completed by changing the checkbox from [ ] to [x] and add implementation notes in the commit message.

- [x] 17. 开发权限验证中间件
  - File: src/auth/middleware/permission.middleware.ts
  - 实现API级别的权限验证和访问控制
  - Purpose: 提供API级别的细粒度权限控制
  - _Leverage: @nestjs/common, custom decorators
  - _Requirements: FR2.4, NFR3.1
  - _Prompt: You are a middleware developer creating permission validation for NestJS APIs. Create permission middleware that validates user permissions against requested resources, supports dynamic permission calculation, includes permission caching for performance, and provides detailed access logs. Include support for conditional permissions and resource ownership checks. Implement proper error responses and permission debugging tools. When implementing this task, mark it as completed by changing the checkbox from [ ] to [x] and add implementation notes in the commit message.

## 安全和监控

- [x] 18. 实现安全增强中间件
  - File: src/common/middleware/security.middleware.ts
  - 开发CORS、CSRF、XSS防护、速率限制等安全中间件
  - Purpose: 提供全面的应用安全防护
  - _Leverage: helmet, @nestjs/throttler, csurf
  - _Requirements: NFR1.3, NFR1.4, NFR1.5
  - _Prompt: You are a security engineer implementing comprehensive security middleware for NestJS. Create security middleware stack including CORS configuration, CSRF protection, XSS prevention, SQL injection protection, rate limiting (10 req/s per user), and request validation. Include security headers, input sanitization, and malicious request detection. Implement configurable security policies and security event logging. When implementing this task, mark it as completed by changing the checkbox from [ ] to [x] and add implementation notes in the commit message.

- [x] 19. 开发审计日志系统
  - File: src/common/services/audit-log.service.ts
  - 实现操作审计、安全事件记录、日志分析功能
  - Purpose: 提供完整的操作审计和安全监控
  - _Leverage: @nestjs/winston, elasticsearch
  - _Requirements: NFR4.4, FR3.5
  - _Prompt: You are a monitoring specialist implementing audit logging for NestJS authentication system. Create comprehensive audit logging for all authentication events, permission changes, security violations, and administrative operations. Include structured logging with proper indexing, log rotation policies, real-time security alerts, and log analysis capabilities. Implement privacy-compliant logging and log retention policies. When implementing this task, mark it as completed by changing the checkbox from [ ] to [x] and add implementation notes in the commit message.

- [x] 20. 实现系统监控和健康检查
  - File: src/health/health.controller.ts, src/common/services/metrics.service.ts
  - 开发健康检查端点、性能监控、告警系统
  - Purpose: 提供系统健康监控和性能跟踪
  - _Leverage: @nestjs/terminus, prometheus-client
  - _Requirements: NFR2.1, NFR2.2, NFR4.4
  - _Prompt: You are a DevOps engineer implementing system monitoring for NestJS authentication service. Create health check endpoints for database, Redis, external services, performance metrics collection (response times, error rates, active sessions), and alerting for critical issues. Include custom health indicators and comprehensive service monitoring. Implement metrics export for monitoring systems and automated recovery procedures. When implementing this task, mark it as completed by changing the checkbox from [ ] to [x] and add implementation notes in the commit message.
