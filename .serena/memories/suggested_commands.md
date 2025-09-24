# 开发命令指南

## 常用开发命令

### 项目启动
```bash
# 开发模式（热重载）
npm run start:dev

# 调试模式
npm run start:debug

# 生产模式
npm run start:prod
```

### Prisma 数据库管理
```bash
# 生成 Prisma Client（修改 schema 后必须执行）
npx prisma generate

# 创建数据库迁移
npx prisma migrate dev --name <migration-name>

# 应用数据库迁移（生产环境）
npx prisma migrate deploy

# 重置数据库（开发环境）
npx prisma migrate reset

# 打开 Prisma Studio（可视化数据库管理）
npx prisma studio

# 格式化 schema 文件
npx prisma format
```

### 代码质量
```bash
# 代码格式化
npm run format

# ESLint 检查并修复
npm run lint

# 构建项目
npm run build
```

### 测试
```bash
# 运行单元测试
npm run test

# 监听模式运行测试
npm run test:watch

# 生成测试覆盖率报告
npm run test:cov

# 调试测试
npm run test:debug

# 运行 E2E 测试
npm run test:e2e
```

### Docker 相关
```bash
# 启动所有服务（MySQL + Redis + App）
docker-compose up -d

# 查看服务日志
docker-compose logs -f moonlens-server

# 停止所有服务
docker-compose down

# 清理所有数据（包括数据卷）
docker-compose down -v

# 重新构建镜像
docker-compose build --no-cache
```

### Git 操作
```bash
# 查看状态
git status

# 添加文件
git add .

# 提交代码
git commit -m "feat: description"

# 推送代码
git push origin <branch-name>
```

### 系统工具（macOS）
```bash
# 查看文件列表
ls -la

# 查找文件
find . -name "*.ts"

# 搜索文本（使用 ripgrep，更快）
rg "pattern" --type ts

# 查看进程
ps aux | grep node

# 终止进程
kill -9 <PID>

# 查看端口占用
lsof -i :3000
```

### 环境配置
```bash
# 复制环境变量模板
cp .env.example .env

# 编辑环境变量
nano .env
# 或
vim .env
```

### 依赖管理
```bash
# 安装所有依赖
npm install

# 安装生产依赖
npm install --production

# 添加新依赖
npm install <package-name>

# 添加开发依赖
npm install -D <package-name>

# 更新依赖
npm update

# 查看过时的依赖
npm outdated
```

## 端口说明
- 3000: NestJS 应用主端口
- 3001: WebSocket 端口
- 3306: MySQL 数据库
- 6379: Redis 缓存/队列
- 5555: Prisma Studio（运行时）