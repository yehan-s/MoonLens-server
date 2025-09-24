# 任务完成检查清单

当完成一个开发任务后，请按照以下步骤进行检查：

## 1. 代码质量检查

### 格式化代码
```bash
npm run format
```
确保所有代码符合 Prettier 格式规范

### 运行 ESLint
```bash
npm run lint
```
修复所有 ESLint 错误和警告

### TypeScript 类型检查
```bash
npm run build
```
确保没有 TypeScript 编译错误

## 2. Prisma 相关（如果修改了数据模型）

### 格式化 Schema
```bash
npx prisma format
```

### 生成 Prisma Client
```bash
npx prisma generate
```

### 创建迁移（如果需要）
```bash
npx prisma migrate dev --name <描述性的迁移名称>
```

## 3. 测试

### 运行单元测试
```bash
npm run test
```
确保所有测试通过

### 检查测试覆盖率（可选）
```bash
npm run test:cov
```
查看是否达到覆盖率要求

## 4. 功能验证

### 启动开发服务器
```bash
npm run start:dev
```

### 测试 API
- 访问 Swagger 文档：http://localhost:3000/api-docs
- 使用 Postman 或 curl 测试新增/修改的 API
- 验证 WebSocket 连接（如果涉及）

## 5. 依赖检查

### 如果添加了新依赖
- 确保 package.json 已更新
- 运行 `npm install` 确保 package-lock.json 同步
- 在 README 中记录新依赖的用途（如果是重要依赖）

## 6. 文档更新

### 更新相关文档
- API 文档（通过 Swagger 装饰器自动生成）
- README.md（如果有重大功能变更）
- 代码注释（复杂逻辑必须有中文注释）

## 7. Git 提交前

### 检查改动
```bash
git status
git diff
```

### 确保 .env 不被提交
- 敏感信息只放在 .env 中
- .env.example 只包含示例配置

## 8. 提交代码

### 规范的提交信息
```bash
git add .
git commit -m "type: 简洁的描述"
```

示例：
- `feat: 添加用户注册功能`
- `fix: 修复登录时的密码验证问题`
- `refactor: 重构认证服务`

## 9. 容器化检查（如果需要部署）

### 测试 Docker 构建
```bash
docker-compose build
docker-compose up -d
```

### 查看容器日志
```bash
docker-compose logs -f moonlens-server
```

## 10. 最终检查清单

- [ ] 代码已格式化
- [ ] ESLint 无错误
- [ ] TypeScript 编译通过
- [ ] 测试全部通过
- [ ] API 功能正常
- [ ] Swagger 文档已更新
- [ ] 敏感信息未暴露
- [ ] Git 提交信息规范

## 常见问题修复

### Prisma 相关错误
- `P2002`: 唯一约束冲突 - 检查是否有重复数据
- `P2025`: 记录未找到 - 添加 NotFoundException 处理

### TypeScript 错误
- 隐式 any - 明确添加类型定义
- 可能为 null - 添加空值检查或使用可选链

### ESLint 警告
- 未使用的变量 - 删除或添加下划线前缀
- Promise 未处理 - 添加 async/await 或 .catch()

## 记录和沟通

完成任务后：
1. 更新项目看板（如果有）
2. 记录遇到的问题和解决方案
3. 与团队分享重要的技术决策