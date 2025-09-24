# 代码规范与约定

## TypeScript 规范

### 类型定义
- 优先使用接口（interface）而非类型别名（type）
- 明确定义函数参数和返回值类型
- 避免使用 `any` 类型（已在 ESLint 中关闭强制检查，但尽量避免）
- 使用严格的空值检查（strictNullChecks: true）

### 命名规范
- **文件名**: kebab-case（如 `user.service.ts`）
- **类名**: PascalCase（如 `UsersService`）
- **接口名**: PascalCase，不使用 I 前缀（如 `User` 而非 `IUser`）
- **变量/函数**: camelCase（如 `getUserById`）
- **常量**: UPPER_SNAKE_CASE（如 `MAX_RETRY_COUNT`）
- **私有属性**: 使用 `private` 关键字，不使用下划线前缀

## NestJS 规范

### 模块组织
- 每个功能域一个模块（auth, users, projects 等）
- 模块内部结构：
  - `*.module.ts` - 模块定义
  - `*.controller.ts` - 控制器
  - `*.service.ts` - 服务层
  - `dto/` - 数据传输对象
  - `entities/` - 实体定义（现已移除，使用 Prisma）

### 装饰器使用
- 控制器使用 `@Controller()` 和路由装饰器
- 服务使用 `@Injectable()`
- 模块使用 `@Module()` 和 `@Global()`（全局模块）
- API 文档使用 `@ApiTags()`, `@ApiProperty()` 等

### 依赖注入
- 通过构造函数注入依赖
- 使用 `private readonly` 修饰符

## Prisma 规范

### Schema 定义
- 模型名使用 PascalCase
- 字段名使用 camelCase
- 使用 `@@map()` 映射数据库表名为 snake_case
- 明确定义索引 `@@index()`
- 使用枚举定义状态类型

### 数据操作
- 使用 PrismaService 进行数据库操作
- 错误处理：捕获 Prisma 特定错误码（如 P2025）
- 使用事务处理复杂操作

## 代码格式化

### Prettier 配置
```json
{
  "singleQuote": true,
  "trailingComma": "all"
}
```

### ESLint 规则
- 基于 TypeScript ESLint 推荐配置
- 集成 Prettier
- 关闭的规则：
  - `@typescript-eslint/no-explicit-any`: off
  - `@typescript-eslint/no-floating-promises`: warn
  - `@typescript-eslint/no-unsafe-argument`: warn

## 注释规范

### 中文注释
- 所有注释使用中文
- 复杂业务逻辑必须添加注释
- API 接口添加功能说明注释

### 注释格式
```typescript
// 单行注释

/**
 * 多行注释
 * 用于函数、类、接口说明
 */

// TODO: 待完成事项
// FIXME: 需要修复的问题
// NOTE: 重要说明
```

## Git 提交规范

### Commit Message 格式
```
<type>: <subject>

<body>
```

### Type 类型
- `feat`: 新功能
- `fix`: 修复 bug
- `docs`: 文档更新
- `style`: 代码格式调整
- `refactor`: 重构
- `perf`: 性能优化
- `test`: 测试相关
- `chore`: 构建过程或辅助工具的变动

## 错误处理

### 异常处理
- 使用 NestJS 内置异常类（NotFoundException, ConflictException 等）
- 自定义异常继承自 HttpException
- 统一错误响应格式

### 日志记录
- 开发环境：debug 级别
- 生产环境：info 级别
- 使用 NestJS Logger 服务

## 安全规范

### 认证授权
- 使用 JWT 进行身份认证
- 密码使用 bcrypt 加密（salt rounds: 10）
- 敏感信息不记录日志

### 数据验证
- 使用 class-validator 进行 DTO 验证
- 使用 ValidationPipe 全局验证管道
- 启用白名单模式（whitelist: true）

## 测试规范

### 测试文件
- 单元测试：`*.spec.ts`
- E2E 测试：`*.e2e-spec.ts`
- 测试覆盖率目标：80%

### 测试原则
- 每个服务方法都应有对应测试
- 测试应独立，不依赖外部服务
- 使用 Mock 隔离依赖