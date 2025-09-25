# MoonLens API 文档

## 基础信息
- **Base URL**: `http://localhost:3000/api`
- **认证方式**: Bearer Token (JWT)
- **API 版本**: v1.0.0

## 认证相关 API

### 1. 用户注册
**POST** `/auth/register`

注册新用户账号。

**请求体**:
```json
{
  "email": "user@example.com",
  "username": "johndoe",
  "password": "SecurePass123",
  "fullName": "John Doe" // 可选
}
```

**响应** (201 Created):
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "username": "johndoe",
    "fullName": "John Doe",
    "role": "USER",
    "isActive": true,
    "emailVerified": false,
    "createdAt": "2025-01-01T00:00:00Z"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": 3600
}
```

**错误响应**:
- `400 Bad Request` - 请求参数无效
- `409 Conflict` - 邮箱或用户名已存在

### 2. 用户登录
**POST** `/auth/login`

使用邮箱和密码登录。

**请求体**:
```json
{
  "email": "user@example.com",
  "password": "SecurePass123",
  "deviceId": "device-123" // 可选，用于多设备管理
}
```

**响应** (200 OK):
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "username": "johndoe",
    "role": "USER"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": 3600
}
```

**错误响应**:
- `401 Unauthorized` - 邮箱或密码错误
- `403 Forbidden` - 账户被锁定（连续5次失败后锁定15分钟）

### 3. 刷新令牌
**POST** `/auth/refresh`

使用刷新令牌获取新的访问令牌。

**请求体**:
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**响应** (200 OK):
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...", // 如果即将过期会返回新的
  "expiresIn": 3600
}
```

### 4. 登出
**POST** `/auth/logout`

登出当前设备。

**Headers**:
```
Authorization: Bearer <accessToken>
```

**请求体**:
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**响应** (200 OK):
```json
{
  "message": "登出成功"
}
```

### 5. 登出所有设备
**POST** `/auth/logout-all`

从所有设备登出。

**Headers**:
```
Authorization: Bearer <accessToken>
```

**响应** (200 OK):
```json
{
  "message": "已从所有设备登出"
}
```

### 6. 获取当前用户信息
**GET** `/auth/profile`

获取当前登录用户的信息。

**Headers**:
```
Authorization: Bearer <accessToken>
```

**响应** (200 OK):
```json
{
  "userId": "uuid",
  "email": "user@example.com",
  "username": "johndoe",
  "fullName": "John Doe",
  "role": "USER",
  "emailVerified": true,
  "createdAt": "2025-01-01T00:00:00Z"
}
```

### 7. 获取登录历史
**GET** `/auth/login-history`

获取用户的登录历史记录。

**Headers**:
```
Authorization: Bearer <accessToken>
```

**查询参数**:
- `limit` - 返回记录数量（默认: 10）
- `offset` - 偏移量（默认: 0）

**响应** (200 OK):
```json
[
  {
    "id": "uuid",
    "ipAddress": "192.168.1.1",
    "userAgent": "Mozilla/5.0...",
    "loginMethod": "EMAIL",
    "success": true,
    "createdAt": "2025-01-01T00:00:00Z"
  }
]
```

### 8. 获取活跃会话
**GET** `/auth/sessions`

获取所有活跃的会话列表。

**Headers**:
```
Authorization: Bearer <accessToken>
```

**响应** (200 OK):
```json
[
  {
    "id": "uuid",
    "deviceId": "device-123",
    "deviceType": "Chrome on Windows",
    "ipAddress": "192.168.1.1",
    "lastActivityAt": "2025-01-01T00:00:00Z",
    "createdAt": "2025-01-01T00:00:00Z"
  }
]
```

## 用户管理 API

### 9. 获取用户资料
**GET** `/users/profile`

获取当前用户的详细资料。

**Headers**:
```
Authorization: Bearer <accessToken>
```

**响应** (200 OK):
```json
{
  "id": "uuid",
  "username": "johndoe",
  "email": "user@example.com",
  "fullName": "John Doe",
  "avatar": "https://example.com/avatar.jpg",
  "role": "USER",
  "isActive": true,
  "emailVerified": true,
  "gitlabUserId": "12345",
  "createdAt": "2025-01-01T00:00:00Z",
  "updatedAt": "2025-01-01T00:00:00Z"
}
```

### 10. 更新用户资料
**PUT** `/users/profile`

更新用户基本信息。

**Headers**:
```
Authorization: Bearer <accessToken>
```

**请求体**:
```json
{
  "username": "newusername",
  "fullName": "New Name",
  "avatar": "https://example.com/new-avatar.jpg"
}
```

**响应** (200 OK):
```json
{
  "id": "uuid",
  "username": "newusername",
  "email": "user@example.com",
  "fullName": "New Name",
  "avatar": "https://example.com/new-avatar.jpg",
  "updatedAt": "2025-01-01T00:00:00Z"
}
```

### 11. 上传头像
**POST** `/users/avatar`

上传用户头像图片。

**Headers**:
```
Authorization: Bearer <accessToken>
Content-Type: multipart/form-data
```

**请求体**:
- `file` - 图片文件（支持: jpg, jpeg, png, gif，最大: 5MB）

**响应** (200 OK):
```json
{
  "avatarUrl": "/uploads/avatars/processed_abc123.jpg"
}
```

### 12. 修改密码
**POST** `/users/change-password`

修改用户密码。

**Headers**:
```
Authorization: Bearer <accessToken>
```

**请求体**:
```json
{
  "oldPassword": "OldPass123",
  "newPassword": "NewPass456",
  "confirmPassword": "NewPass456"
}
```

**响应** (200 OK):
```json
{
  "message": "密码修改成功，请重新登录"
}
```

**错误响应**:
- `400 Bad Request` - 新密码不符合要求或确认密码不匹配
- `401 Unauthorized` - 当前密码错误

### 13. 修改邮箱
**POST** `/users/change-email`

修改用户邮箱地址。

**Headers**:
```
Authorization: Bearer <accessToken>
```

**请求体**:
```json
{
  "newEmail": "newemail@example.com",
  "password": "CurrentPassword123"
}
```

**响应** (200 OK):
```json
{
  "message": "邮箱修改成功，请查收验证邮件"
}
```

### 14. 获取用户偏好设置
**GET** `/users/preferences`

获取用户的偏好设置。

**Headers**:
```
Authorization: Bearer <accessToken>
```

**响应** (200 OK):
```json
{
  "theme": "dark",
  "language": "zh-CN",
  "notifications": {
    "email": true,
    "inApp": true
  },
  "codeReviewSettings": {
    "autoReview": true,
    "aiModel": "gpt-4",
    "reviewLevel": "detailed"
  }
}
```

### 15. 更新用户偏好设置
**PUT** `/users/preferences`

更新用户偏好设置。

**Headers**:
```
Authorization: Bearer <accessToken>
```

**请求体**:
```json
{
  "theme": "light",
  "language": "en-US",
  "notifications": {
    "email": false,
    "inApp": true
  }
}
```

**响应** (200 OK):
```json
{
  "message": "偏好设置更新成功",
  "preferences": { /* 更新后的偏好设置 */ }
}
```

## 密码重置 API

### 16. 忘记密码
**POST** `/auth/forgot-password`

发送密码重置邮件。

**请求体**:
```json
{
  "email": "user@example.com"
}
```

**响应** (200 OK):
```json
{
  "message": "如果该邮箱已注册，重置邮件已发送"
}
```

### 17. 重置密码
**POST** `/auth/reset-password`

使用重置令牌设置新密码。

**请求体**:
```json
{
  "token": "reset-token-string",
  "newPassword": "NewSecurePass123"
}
```

**响应** (200 OK):
```json
{
  "message": "密码重置成功"
}
```

## GitLab OAuth API

### 18. 获取 GitLab 授权 URL
**GET** `/auth/gitlab/authorize`

获取 GitLab OAuth 授权页面 URL。

**查询参数**:
- `redirect_uri` - 授权后的回调地址（可选）

**响应** (200 OK):
```json
{
  "authUrl": "https://gitlab.com/oauth/authorize?client_id=...",
  "state": "random-state-string"
}
```

### 19. GitLab OAuth 回调
**POST** `/auth/gitlab/callback`

处理 GitLab OAuth 回调。

**请求体**:
```json
{
  "code": "authorization-code",
  "state": "random-state-string"
}
```

**响应** (200 OK):
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "username": "gitlab-user",
    "gitlabUserId": "12345"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": 3600
}
```

### 20. 断开 GitLab 连接
**POST** `/auth/gitlab/disconnect`

断开 GitLab 账号关联。

**Headers**:
```
Authorization: Bearer <accessToken>
```

**响应** (200 OK):
```json
{
  "message": "GitLab 账号已断开连接"
}
```

## 项目管理 API

### 21. 获取项目列表
**GET** `/projects`

获取用户的项目列表。

**Headers**:
```
Authorization: Bearer <accessToken>
```

**查询参数**:
- `page` - 页码（默认: 1）
- `limit` - 每页数量（默认: 20）
- `search` - 搜索关键词
- `isActive` - 是否激活

**响应** (200 OK):
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "MoonLens Frontend",
      "description": "前端项目",
      "gitlabProjectId": "100",
      "gitlabProjectUrl": "https://gitlab.com/moonlens/frontend",
      "defaultBranch": "main",
      "isActive": true,
      "createdAt": "2025-01-01T00:00:00Z"
    }
  ],
  "total": 10,
  "page": 1,
  "totalPages": 1
}
```

## 代码审查 API

### 22. 获取审查列表
**GET** `/reviews`

获取代码审查列表。

**Headers**:
```
Authorization: Bearer <accessToken>
```

**查询参数**:
- `projectId` - 项目ID
- `status` - 状态（PENDING, IN_PROGRESS, COMPLETED, FAILED）
- `page` - 页码
- `limit` - 每页数量

**响应** (200 OK):
```json
{
  "data": [
    {
      "id": "uuid",
      "projectId": "uuid",
      "gitlabMergeRequestId": "1",
      "title": "实现用户认证功能",
      "status": "COMPLETED",
      "reviewType": "MERGE_REQUEST",
      "createdAt": "2025-01-01T00:00:00Z"
    }
  ],
  "total": 50,
  "page": 1,
  "totalPages": 3
}
```

## 错误响应格式

所有 API 错误响应都遵循统一格式：

```json
{
  "statusCode": 400,
  "message": "错误描述信息",
  "error": "Bad Request",
  "timestamp": "2025-01-01T00:00:00Z",
  "path": "/api/auth/login"
}
```

### 常见错误码

| 状态码 | 说明 |
|--------|------|
| 400 | Bad Request - 请求参数无效 |
| 401 | Unauthorized - 未认证或令牌无效 |
| 403 | Forbidden - 无权限或账户被锁定 |
| 404 | Not Found - 资源不存在 |
| 409 | Conflict - 资源冲突（如邮箱已存在）|
| 429 | Too Many Requests - 请求频率超限 |
| 500 | Internal Server Error - 服务器内部错误 |

## 认证说明

### JWT Token 结构

**Access Token Payload**:
```json
{
  "userId": "uuid",
  "email": "user@example.com",
  "username": "johndoe",
  "role": "USER",
  "jti": "token-id",
  "type": "access",
  "iat": 1704067200,
  "exp": 1704070800
}
```

**Token 有效期**:
- Access Token: 1小时
- Refresh Token: 7天

### 请求头示例

需要认证的接口都需要在请求头中包含：

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## 限流策略

- 登录接口: 5次/分钟
- 注册接口: 3次/分钟
- 密码重置: 3次/小时
- 常规 API: 100次/分钟

## WebSocket 事件

### 连接认证
```javascript
socket.connect({
  auth: {
    token: "your-access-token"
  }
});
```

### 事件列表

**服务端事件**:
- `review:started` - 代码审查开始
- `review:progress` - 审查进度更新
- `review:completed` - 审查完成
- `review:failed` - 审查失败

**客户端事件**:
- `subscribe:project` - 订阅项目更新
- `unsubscribe:project` - 取消订阅

## 健康检查

### 健康状态
**GET** `/health`

检查服务健康状态。

**响应** (200 OK):
```json
{
  "status": "ok",
  "info": {
    "database": { "status": "up" },
    "redis": { "status": "up" }
  },
  "error": {},
  "details": {
    "database": { "status": "up" },
    "redis": { "status": "up" }
  }
}
```

## 版本信息

### API 版本
**GET** `/version`

获取 API 版本信息。

**响应** (200 OK):
```json
{
  "version": "1.0.0",
  "buildTime": "2025-01-01T00:00:00Z",
  "gitCommit": "abc123"
}
```

---

## 更新日志

### v1.0.0 (2025-01-01)
- 初始版本发布
- 实现用户认证系统
- 支持 GitLab OAuth 集成
- 项目管理基础功能
- 代码审查功能

## 联系方式

- API 问题反馈: api@moonlens.com
- 技术支持: support@moonlens.com
- 文档更新: docs@moonlens.com