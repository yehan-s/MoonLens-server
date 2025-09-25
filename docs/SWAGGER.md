# Swagger UI API 文档访问说明

## 🎯 访问地址

Swagger UI 已经配置完成，现在你可以通过以下地址访问交互式 API 文档：

### 📚 Swagger UI (推荐)
**http://localhost:3000/api-docs**

这是一个完全交互式的 API 文档界面，你可以：
- 🔍 浏览所有 API 接口
- 📝 查看请求/响应格式
- 🚀 直接在浏览器中测试 API
- 🔐 使用 JWT Token 进行认证测试

### 📄 JSON 格式文档
**http://localhost:3000/api-docs-json**

原始的 OpenAPI JSON 格式文档，可以：
- 导入到 Postman
- 用于代码生成
- 集成到其他 API 工具

## 🚀 快速使用指南

### 1. 打开 Swagger UI
在浏览器中访问：http://localhost:3000/api-docs

### 2. 认证设置
1. 点击页面右上角的 **"Authorize"** 按钮 🔐
2. 输入你的 JWT Token（通过登录接口获取）
3. 点击 **"Authorize"** 确认
4. 现在你可以测试需要认证的接口了

### 3. 测试接口
1. 点击任意接口展开详情
2. 点击 **"Try it out"** 按钮
3. 填写请求参数
4. 点击 **"Execute"** 执行请求
5. 查看响应结果

## 🎨 界面特性

### 已配置的自定义功能：
- ✅ **持久化授权** - 刷新页面后保持 Token
- ✅ **请求耗时显示** - 查看每个请求的执行时间
- ✅ **搜索过滤** - 快速查找接口
- ✅ **默认折叠** - 接口列表默认折叠，更清晰
- ✅ **字母排序** - 接口按字母顺序排列
- ✅ **深色主题** - 自定义的 MoonLens 主题色

## 📱 接口分组

API 接口按功能分组：

- **auth** - 用户认证（登录、注册、Token管理）
- **users** - 用户管理（资料、头像、偏好设置）
- **projects** - 项目管理（CRUD操作）
- **gitlab** - GitLab集成（OAuth、Webhook）
- **review** - 代码审查（AI审查、报告）
- **ai** - AI服务（模型配置、审查策略）

## 🔒 测试账号

用于测试的默认账号：

| 账号类型 | 邮箱 | 密码 |
|---------|------|------|
| 管理员 | admin@moonlens.com | Admin@123456 |
| 测试用户 | test@moonlens.com | Test@123456 |

## 💡 使用示例

### 测试登录流程：

1. 在 Swagger UI 中找到 **POST /api/auth/login**
2. 点击 **"Try it out"**
3. 输入测试账号：
   ```json
   {
     "email": "admin@moonlens.com",
     "password": "Admin@123456"
   }
   ```
4. 点击 **"Execute"**
5. 从响应中复制 `accessToken`
6. 点击顶部 **"Authorize"** 按钮
7. 粘贴 Token 并确认
8. 现在可以测试其他需要认证的接口了！

## 🛠️ 开发提示

- Swagger UI 会自动从代码中的装饰器生成文档
- 修改代码后，文档会自动更新
- 使用 `@ApiTags()` 为控制器分组
- 使用 `@ApiOperation()` 添加接口描述
- 使用 `@ApiResponse()` 定义响应格式

## 📝 注意事项

1. **开发环境专用** - Swagger UI 通常只在开发环境启用
2. **安全性** - 生产环境建议禁用或添加访问控制
3. **Token 管理** - Token 有效期为 1 小时，过期需重新登录

## 🎉 现在就试试吧！

打开浏览器访问：**http://localhost:3000/api-docs**

享受交互式 API 文档带来的便利！