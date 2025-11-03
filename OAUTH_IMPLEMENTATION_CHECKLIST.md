# OAuth 实现文件清单

## ✅ 已创建的文件

1. `prisma/schema.prisma` - 添加了 PlatformToken 模型
2. `src/platform-tokens/platform-token.service.ts` - Token 管理服务
3. `src/platform-tokens/platform-token.module.ts` - Token 模块
4. `src/auth/gitlab-oauth.controller.ts` - GitLab OAuth Controller

## 📝 待创建的文件（参考之前的完整代码）

### 后端文件

5. `src/auth/github-oauth.controller.ts` - GitHub OAuth Controller
6. `src/gitlab/gitlab-proxy.controller.ts` - GitLab 代理 API
7. `src/gitlab/gitlab.module.ts` - GitLab 模块
8. `src/github/github-proxy.controller.ts` - GitHub 代理 API
9. `src/github/github.module.ts` - GitHub 模块
10. `src/platform-tokens/token-refresh.service.ts` - Token 自动刷新
11. `src/auth/auth.module.ts` - 更新导入 PlatformTokenModule
12. `src/app.module.ts` - 注册 GitLabModule 和 GitHubModule

### 前端文件

13. `src/api/github.ts` - GitHub API 封装
14. `src/views/GitHubCallback.vue` - GitHub 回调页面
15. `src/views/Settings.vue` - 添加 GitHub 平台管理部分

### 环境配置

16. `.env` (后端) - 添加 OAuth 配置：
```env
# GitLab OAuth
GITLAB_CLIENT_ID=your_gitlab_app_id
GITLAB_CLIENT_SECRET=your_gitlab_secret
GITLAB_REDIRECT_URI=http://localhost:3000/auth/gitlab/callback

# GitHub OAuth
GITHUB_CLIENT_ID=your_github_app_id
GITHUB_CLIENT_SECRET=your_github_secret
GITHUB_REDIRECT_URI=http://localhost:3000/auth/github/callback

# Frontend
FRONTEND_URL=http://localhost:5173

# JWT
JWT_SECRET=dev-super-secret
JWT_EXPIRES_IN=7d
```

## 🔧 数据库迁移

由于权限问题，需要手动创建表：

```sql
-- 在 MySQL 中执行
USE moonlens_db;

CREATE TABLE `platform_tokens` (
  `id` VARCHAR(36) PRIMARY KEY,
  `userId` VARCHAR(36) NOT NULL,
  `platform` VARCHAR(20) NOT NULL,
  `accessToken` TEXT NOT NULL,
  `refreshToken` TEXT,
  `expiresAt` DATETIME,
  `apiUrl` VARCHAR(255),
  `authMethod` VARCHAR(10) DEFAULT 'oauth',
  `platformUserId` VARCHAR(50),
  `platformUsername` VARCHAR(100),
  `platformEmail` VARCHAR(255),
  `createdAt` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `userId_platform` (`userId`, `platform`),
  FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## 📚 依赖包

确保安装以下依赖：

```bash
# 后端
cd MoonLens-server
npm install @gitbeaker/node @octokit/rest axios

# 前端（已安装）
cd ../MoonLens-client
# axios 已有
```

## ⚙️ 注册 OAuth App

### GitLab
1. 访问 https://gitlab.com/-/user_settings/applications
2. 创建新应用：
   - Name: MoonLens
   - Redirect URI: `http://localhost:3000/auth/gitlab/callback`
   - Scopes: `read_user`, `read_api`, `read_repository`
3. 获取 Application ID 和 Secret

### GitHub
1. 访问 https://github.com/settings/developers
2. 创建新 OAuth App：
   - Application name: MoonLens
   - Homepage URL: `http://localhost:5173`
   - Callback URL: `http://localhost:3000/auth/github/callback`
3. 获取 Client ID 和 Client Secret

## 🚀 启动步骤

1. **配置环境变量**
   ```bash
   cd MoonLens-server
   # 编辑 .env 添加 OAuth 配置
   ```

2. **创建数据库表**
   ```bash
   # 手动执行上面的 SQL
   # 或者修复数据库权限后运行：
   npx prisma migrate dev
   ```

3. **启动后端**
   ```bash
   cd MoonLens-server
   npm run start:dev
   ```

4. **启动前端**
   ```bash
   cd MoonLens-client
   npm run dev
   ```

5. **测试 OAuth 流程**
   - 访问 `http://localhost:5173/settings`
   - 点击"连接 GitLab 账号"
   - 完成授权
   - 检查是否成功保存 token

## 🔍 调试技巧

查看后端日志：
```bash
cd MoonLens-server
tail -f .run-dev-3000.log
```

检查数据库：
```sql
SELECT * FROM platform_tokens;
```

测试 API：
```bash
# 获取 token 后测试
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:3000/api/gitlab/projects
```

## ✅ 完成标志

- [ ] 数据库表创建成功
- [ ] OAuth App 注册完成
- [ ] 环境变量配置完成
- [ ] 后端服务启动成功
- [ ] 前端服务启动成功
- [ ] GitLab OAuth 登录成功
- [ ] GitHub OAuth 登录成功
- [ ] 代理 API 调用成功
