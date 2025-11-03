# MoonLens API 文档

## 概述

MoonLens 是一个基于 GitLab 的 AI 代码审查平台，提供完整的 RESTful API 接口。

## 快速开始

### 基础配置

- **API 基础路径**: `http://localhost:3000/api`
- **认证方式**: JWT Bearer Token
- **内容类型**: `application/json`

### 认证流程

1. **注册账号**
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "username": "johndoe",
    "password": "SecurePass123"
  }'
```

2. **用户登录**
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123"
  }'
```

3. **使用 Token 访问受保护接口**
```bash
curl -X GET http://localhost:3000/api/auth/profile \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## API 文档格式

本项目提供多种格式的 API 文档：

### 1. Markdown 文档
- 📄 [API.md](./API.md) - 完整的 API 接口说明文档

### 2. OpenAPI/Swagger 规范
- 📄 [openapi.yaml](./openapi.yaml) - OpenAPI 3.0 规范文件
- 可导入到 Swagger UI、Postman 或其他 API 工具

### 3. Postman Collection
- 📄 [postman-collection.json](./postman-collection.json) - Postman 测试集合
- 包含所有接口的测试用例和自动化脚本

## 在线文档访问

启动服务后，可以通过以下方式访问在线文档：

### Swagger UI
访问 `http://localhost:3000/api-docs` 查看交互式 API 文档

### 功能特性：
- 🔍 交互式 API 探索
- 📝 在线测试接口
- 📚 完整的请求/响应示例
- 🔐 认证测试支持

## 导入到其他工具

### Postman
1. 打开 Postman
2. 点击 Import
3. 选择 `postman-collection.json` 文件
4. 配置环境变量：
   - `baseUrl`: http://localhost:3000/api
   - `accessToken`: (登录后自动设置)
   - `refreshToken`: (登录后自动设置)

### Insomnia
1. 打开 Insomnia
2. 导入 `openapi.yaml` 文件
3. 自动生成所有接口请求

### VSCode REST Client
创建 `.http` 文件：
```http
### 登录
POST http://localhost:3000/api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123"
}

### 获取用户信息
GET http://localhost:3000/api/auth/profile
Authorization: Bearer {{accessToken}}
```

## API 版本管理

当前版本：**v1.0.0**

### 版本策略
- 主版本号：不兼容的 API 修改
- 次版本号：向下兼容的功能性新增
- 修订号：向下兼容的问题修正

## 错误处理

所有错误响应遵循统一格式：

```json
{
  "statusCode": 400,
  "message": "错误描述",
  "error": "Bad Request",
  "timestamp": "2025-01-01T00:00:00Z",
  "path": "/api/auth/login"
}
```

### 常见错误码

| 状态码 | 说明 | 处理建议 |
|--------|------|----------|
| 400 | 请求参数无效 | 检查请求参数格式 |
| 401 | 未认证或令牌无效 | 重新登录获取新令牌 |
| 403 | 无权限或账户被锁定 | 检查权限或等待解锁 |
| 404 | 资源不存在 | 检查请求路径 |
| 409 | 资源冲突 | 检查是否重复创建 |
| 429 | 请求频率超限 | 降低请求频率 |
| 500 | 服务器内部错误 | 联系管理员 |

## 认证与授权

### JWT Token 说明

**Access Token 有效期**: 1小时
**Refresh Token 有效期**: 7天

### Token 刷新策略

当 Access Token 即将过期（剩余时间少于 5 分钟）时，使用 Refresh Token 获取新的 Access Token：

```javascript
async function refreshAccessToken(refreshToken) {
  const response = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken })
  });
  
  const data = await response.json();
  // 保存新的 tokens
  localStorage.setItem('accessToken', data.accessToken);
  if (data.refreshToken) {
    localStorage.setItem('refreshToken', data.refreshToken);
  }
}
```

## 限流策略

API 接口实施了速率限制以防止滥用：

| 接口类型 | 限制 | 时间窗口 |
|----------|------|----------|
| 登录 | 5 次 | 1 分钟 |
| 注册 | 3 次 | 1 分钟 |
| 密码重置 | 3 次 | 1 小时 |
| 常规 API | 100 次 | 1 分钟 |

超过限制将返回 `429 Too Many Requests` 错误。

## WebSocket 连接

实时功能通过 WebSocket 提供：

```javascript
const socket = io('http://localhost:3000', {
  auth: {
    token: 'your-access-token'
  }
});

// 订阅项目更新
socket.emit('subscribe:project', { projectId: 'project-id' });

// 接收审查进度
socket.on('review:progress', (data) => {
  console.log('审查进度:', data);
});
```

## 开发与联调

- 📄 约定文档：`docs/开发与联调约定.md`
- ⚙️ 本地调试：后端使用 `npm run start:dev`（3000）；前端（同级仓）`npm run dev`（5173）
- 🔗 联调前请先阅读：
  - `docs/前后端联调指南.md`
  - `docs/gitlab-integration.md`、`docs/GitLab-OAuth配置.md`
  - `docs/authentication.md`

## 测试账号

开发环境提供以下测试账号：

| 角色 | 邮箱 | 密码 |
|------|------|------|
| 管理员 | admin@moonlens.com | Admin@123456 |
| 开发者 | developer@example.com | Dev@123456 |
| 测试员 | tester@example.com | Test@123456 |
| 访客 | guest@example.com | Guest@123456 |

⚠️ **注意**: 这些账号仅用于开发测试，生产环境请删除或修改密码。

## 开发工具

### 推荐的 API 测试工具

1. **Postman** - 功能最全面的 API 测试工具
2. **Insomnia** - 简洁优雅的 REST 客户端
3. **Thunder Client** - VSCode 内置扩展
4. **cURL** - 命令行工具
5. **HTTPie** - 人性化的命令行 HTTP 客户端

### API 调试技巧

1. **查看请求日志**
```bash
# 开启详细日志
export DEBUG=app:*
npm run start:dev
```

2. **使用代理调试**
配置 HTTP 代理（如 Charles、Fiddler）拦截和分析请求

3. **浏览器开发者工具**
在浏览器控制台直接测试 API：
```javascript
fetch('/api/auth/profile', {
  headers: {
    'Authorization': 'Bearer ' + localStorage.getItem('accessToken')
  }
}).then(res => res.json()).then(console.log)
```

## 常见问题

### Q: 如何处理 Token 过期？
A: 使用 Refresh Token 刷新，或重新登录获取新 Token。

### Q: 账户被锁定怎么办？
A: 连续 5 次登录失败后账户会锁定 15 分钟，等待自动解锁或联系管理员。

### Q: 如何修改 API 基础路径？
A: 在 `.env` 文件中设置 `API_PREFIX` 变量。

### Q: 支持哪些图片格式作为头像？
A: 支持 JPG、JPEG、PNG、GIF，最大 5MB。

## 更新日志

### v1.0.0 (2025-01-01)
- ✨ 初始版本发布
- ✨ 完整的用户认证系统
- ✨ JWT Token 管理
- ✨ 用户资料管理
- ✨ 密码重置功能
- ✨ GitLab OAuth 集成
- ✨ 多设备会话管理
- 📝 完整的 API 文档

## 更多资源

- 环境变量样例：`docs/setup/env.local.example`（仅示例键名，不含敏感值）
- Docker 本地启动（根目录）：
```bash
docker compose up --build
```
- 规格与任务（Spec 工作流）：
  - `.spec-workflow/steering`：产品/技术/结构
  - `.spec-workflow/specs`：requirements/design/tasks（实施前标记 `[-]`，完成后改为 `[x]`）

## 联系支持

- 📧 技术支持: support@moonlens.com
- 🐛 问题反馈: https://github.com/moonlens/issues
- 📚 文档更新: docs@moonlens.com

## 许可证

MIT License - 详见 [LICENSE](../LICENSE) 文件
