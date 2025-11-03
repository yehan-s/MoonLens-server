# GitLab OAuth App 注册指南

## 第一步：访问注册页面

**方式 1：直接访问**
```
https://gitlab.com/-/user_settings/applications
```

**方式 2：手动导航**
1. 打开 https://gitlab.com
2. 如果没登录，先登录（或注册新账号）
3. 点击右上角头像 → Settings
4. 左侧菜单找到 "Applications"

## 第二步：填写表单

```
Name:
  MoonLens

Redirect URI:
  http://localhost:3000/auth/gitlab/callback

Confidential (保持默认勾选):
  ☑ Confidential

Scopes (勾选以下三项):
  ☑ read_user       - Read the authenticated user's personal information
  ☑ read_api        - Grants read access to the API
  ☑ read_repository - Allows read-access to the repository
```

**截图示意：**
```
┌─────────────────────────────────────────────────┐
│ Add new application                             │
├─────────────────────────────────────────────────┤
│                                                 │
│ Name *                                          │
│ ┌─────────────────────────────────────────────┐ │
│ │ MoonLens                                    │ │
│ └─────────────────────────────────────────────┘ │
│                                                 │
│ Redirect URI *                                  │
│ ┌─────────────────────────────────────────────┐ │
│ │ http://localhost:3000/auth/gitlab/callback  │ │
│ └─────────────────────────────────────────────┘ │
│                                                 │
│ ☑ Confidential                                  │
│                                                 │
│ Scopes *                                        │
│ ☑ read_user                                     │
│ ☑ read_api                                      │
│ ☑ read_repository                               │
│ ☐ write_repository (不要勾选)                   │
│                                                 │
│         [Save application]                      │
└─────────────────────────────────────────────────┘
```

## 第三步：复制密钥

保存后会显示：

```
┌─────────────────────────────────────────────────┐
│ Application: MoonLens                           │
├─────────────────────────────────────────────────┤
│                                                 │
│ Application ID                                  │
│ ┌─────────────────────────────────────────────┐ │
│ │ 1a2b3c4d5e6f7g8h9i0j                        │ │ ← 复制这个
│ └─────────────────────────────────────────────┘ │
│                                                 │
│ Secret                                          │
│ ┌─────────────────────────────────────────────┐ │
│ │ gloas-abc123xyz789def456uvw...               │ │ ← 复制这个
│ └─────────────────────────────────────────────┘ │
│                                                 │
│ ⚠️  Save this secret! You won't be able to     │
│     access it again.                            │
└─────────────────────────────────────────────────┘
```

**立即复制到 MoonLens-server/.env：**

```bash
GITLAB_CLIENT_ID=1a2b3c4d5e6f7g8h9i0j
GITLAB_CLIENT_SECRET=gloas-abc123xyz789def456uvw...
```

## 第四步：验证配置

在终端测试：

```bash
cd MoonLens-server
cat .env | grep GITLAB

# 应该看到：
# GITLAB_CLIENT_ID=...
# GITLAB_CLIENT_SECRET=...
# GITLAB_REDIRECT_URI=http://localhost:3000/auth/gitlab/callback
```

✅ 完成！GitLab OAuth App 已注册。
