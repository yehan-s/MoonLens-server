# Tasks: AI Code Review API

## Task List

- [ ] 1. 创建AiModel实体模型
  - File: prisma/schema.prisma
  - 创建支持多AI提供商的模型配置实体
  - 包含提供商类型、模型版本、API配置、定价等字段
  - Purpose: 支持多种AI模型的统一管理和配置
  - _Leverage: 现有Prisma schema结构, src/common/prisma/prisma.service.ts_
  - _Requirements: FR2: AI模型集成_
  - _Prompt: Implement the task for spec ai-code-review-api, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Backend Data Architect specializing in Prisma ORM and database design | Task: Create AiModel entity in Prisma schema supporting multiple AI providers (OpenAI, Anthropic, local models) with flexible configuration including provider type, model version, API endpoints, token limits, pricing, and active status | Restrictions: Must follow existing Prisma patterns, ensure proper indexing, maintain data consistency | _Leverage: 现有Prisma模式, PrismaService | _Requirements: FR2.1-FR2.5 AI模型集成需求 | Success: AiModel entity created with proper fields, relationships, and database indexes | Instructions: Set this task to in-progress [-] in tasks.md before starting, then mark as complete [x] when finished._

- [ ] 2. 创建CodeReview实体模型
  - File: prisma/schema.prisma
  - 创建代码审查会话跟踪实体
  - 包含项目关联、GitLab信息、处理状态、错误信息等
  - Purpose: 跟踪每次代码审查的完整生命周期
  - _Leverage: 现有Project和User实体, GitLab集成模块_
  - _Requirements: FR1: 审查触发, FR5: 结果处理_
  - _Prompt: Implement the task for spec ai-code-review-api, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Database Designer with expertise in relational modeling | Task: Create CodeReview Prisma entity for tracking review sessions with relationships to Project, User, and GitLab entities, including review status, AI model used, code diff, processing times, and error handling | Restrictions: Must ensure proper foreign key relationships, optimize for query performance, handle large diff content | _Leverage: 现有实体关系, 错误处理模式 | _Requirements: FR1.1-FR1.5, FR5.1-FR5.5 | Success: CodeReview entity with complete relationships and optimized queries | Instructions: Set this task to in-progress [-] in tasks.md before starting, then mark as complete [x] when finished._

- [ ] 3. 创建ReviewSuggestion实体模型
  - File: prisma/schema.prisma
  - 创建AI生成建议存储实体
  - 包含建议类型、严重级别、代码位置、建议内容等
  - Purpose: 结构化存储AI审查建议和用户反馈
  - _Leverage: CodeReview实体, 枚举类型定义_
  - _Requirements: FR4: 建议生成_
  - _Prompt: Implement the task for spec ai-code-review-api, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Backend Developer with expertise in data modeling and categorization | Task: Create ReviewSuggestion Prisma entity for storing AI-generated suggestions with proper categorization (bug, security, performance, style), severity levels, file paths, line numbers, and resolution tracking | Restrictions: Must support efficient querying by type and severity, handle large suggestion volumes, maintain suggestion history | _Leverage: 枚举类型定义, 现有分类模式 | _Requirements: FR4.1-FR4.5 建议生成需求 | Success: ReviewSuggestion entity with proper categorization and resolution tracking | Instructions: Set this task to in-progress [-] in tasks.md before starting, then mark as complete [x] when finished._

- [ ] 4. 创建AiModelUsage实体模型
  - File: prisma/schema.prisma
  - 创建AI模型使用统计实体
  - 包含Token消耗、响应时间、成本、成功率等指标
  - Purpose: 提供详细的AI模型使用分析和成本控制
  - _Leverage: AiModel和CodeReview实体关系_
  - _Requirements: NFR4: 成本控制_
  - _Prompt: Implement the task for spec ai-code-review-api, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Analytics Developer with expertise in usage tracking and cost calculation | Task: Create AiModelUsage Prisma entity for tracking detailed usage statistics including token consumption, response times, costs, and success rates with proper relationships to AiModel and CodeReview entities | Restrictions: Must optimize for analytics queries, handle high-frequency inserts, support time-based aggregation | _Leverage: 时间序列数据模式, 聚合查询优化 | _Requirements: NFR4.1-NFR4.5 成本控制需求 | Success: AiModelUsage entity with comprehensive usage tracking and cost calculation | Instructions: Set this task to in-progress [-] in tasks.md before starting, then mark as complete [x] when finished._

- [ ] 5. 实现AIProvider抽象接口
  - File: src/ai/interfaces/ai-provider.interface.ts
  - 设计统一的AI提供商接口
  - 定义建议生成、聊天交互、健康检查等方法
  - Purpose: 支持多种AI模型的统一访问和扩展
  - _Leverage: NestJS接口模式, 现有服务接口_
  - _Requirements: FR2: AI模型集成_
  - _Prompt: Implement the task for spec ai-code-review-api, first run spec-workflow-guide to get the workflow guide then implement the task: Role: TypeScript Architect specializing in interface design and polymorphism | Task: Design abstract AIProvider interface supporting multiple AI models with methods for suggestion generation, chat interactions, health checks, and proper TypeScript typing | Restrictions: Must ensure extensibility for future providers, maintain type safety, handle errors consistently | _Leverage: 现有接口模式, 错误处理策略 | _Requirements: FR2.1-FR2.5 AI模型集成 | Success: AIProvider interface with comprehensive method signatures and proper typing | Instructions: Set this task to in-progress [-] in tasks.md before starting, then mark as complete [x] when finished._

- [ ] 6. 实现OpenAIProvider类
  - File: src/ai/providers/openai.provider.ts
  - 实现OpenAI GPT模型集成
  - 包含API认证、请求处理、使用量跟踪、错误处理
  - Purpose: 提供OpenAI模型的完整集成支持
  - _Leverage: @nestjs/common, openai SDK, 配置服务_
  - _Requirements: FR2: AI模型集成_
  - _Prompt: Implement the task for spec ai-code-review-api, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Backend Developer with expertise in OpenAI API integration | Task: Implement OpenAIProvider class for GPT model integration with API authentication, request/response processing, token usage tracking, retry logic, and comprehensive error handling | Restrictions: Must handle API rate limits, implement proper retry strategies, track usage accurately, ensure security | _Leverage: OpenAI SDK, 重试机制模式, 使用量跟踪 | _Requirements: FR2.1 OpenAI GPT-4集成 | Success: OpenAIProvider fully functional with error handling and usage tracking | Instructions: Set this task to in-progress [-] in tasks.md before starting, then mark as complete [x] when finished._

- [ ] 7. 实现AnthropicProvider类
  - File: src/ai/providers/anthropic.provider.ts
  - 实现Anthropic Claude模型集成
  - 包含消息API调用、响应格式转换、使用量跟踪
  - Purpose: 提供Claude模型的完整集成支持
  - _Leverage: @anthropic-ai/sdk, 配置服务, 响应转换工具_
  - _Requirements: FR2: AI模型集成_
  - _Prompt: Implement the task for spec ai-code-review-api, first run spec-workflow-guide to get the workflow guide then implement the task: Role: AI Integration Developer with expertise in Anthropic Claude API | Task: Implement AnthropicProvider class for Claude model integration with message API calls, response format conversion, and usage tracking following the AIProvider interface | Restrictions: Must maintain consistent response format, handle Claude-specific features, ensure proper error mapping | _Leverage: Anthropic SDK, 响应格式化工具 | _Requirements: FR2.2 Anthropic Claude集成 | Success: AnthropicProvider working correctly with consistent interface implementation | Instructions: Set this task to in-progress [-] in tasks.md before starting, then mark as complete [x] when finished._

- [ ] 8. 实现DiffProcessor类
  - File: src/review/processors/diff.processor.ts
  - 创建Git差异解析和代码变更分析
  - 包含文件类型识别、变更分类、安全扫描
  - Purpose: 将Git差异转换为结构化的审查输入
  - _Leverage: diff解析库, 文件类型检测工具_
  - _Requirements: FR3: 代码分析_
  - _Prompt: Implement the task for spec ai-code-review-api, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Code Analysis Expert with expertise in Git diff parsing and static analysis | Task: Create DiffProcessor class for parsing Git diffs, extracting code changes, detecting file types, categorizing changes, and performing security scanning | Restrictions: Must handle various diff formats, optimize for large changes, ensure accurate parsing, detect security vulnerabilities | _Leverage: diff解析工具, 静态分析库 | _Requirements: FR3.1-FR3.5 代码分析需求 | Success: DiffProcessor accurately parses diffs and extracts structured change information | Instructions: Set this task to in-progress [-] in tasks.md before starting, then mark as complete [x] when finished._

- [ ] 9. 实现ContextExtractor类
  - File: src/review/processors/context.extractor.ts
  - 创建代码上下文提取和语义分析
  - 包含依赖分析、函数提取、项目结构理解
  - Purpose: 为AI模型提供丰富的代码上下文信息
  - _Leverage: AST解析器, 语言检测库, 依赖分析工具_
  - _Requirements: FR3: 代码分析_
  - _Prompt: Implement the task for spec ai-code-review-api, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Static Analysis Developer with expertise in AST parsing and code understanding | Task: Create ContextExtractor class for building rich context from code changes including dependency analysis, function extraction, language detection, and project structure understanding | Restrictions: Must support multiple programming languages, handle large codebases efficiently, extract meaningful context, avoid over-processing | _Leverage: AST解析库, 多语言支持工具 | _Requirements: FR3.2-FR3.4 上下文提取和依赖分析 | Success: ContextExtractor provides comprehensive code context for AI analysis | Instructions: Set this task to in-progress [-] in tasks.md before starting, then mark as complete [x] when finished._

- [ ] 10. 实现ReviewService类
  - File: src/review/review.service.ts
  - 创建代码审查业务逻辑核心
  - 管理审查生命周期、协调AI调用、处理结果
  - Purpose: 提供代码审查的完整业务流程管理
  - _Leverage: AIModelService, Queue服务, Prisma服务_
  - _Requirements: FR1: 审查触发, FR5: 结果处理_
  - _Prompt: Implement the task for spec ai-code-review-api, first run spec-workflow-guide to get the workflow guide then implement the task: Role: NestJS Service Developer with expertise in business logic orchestration | Task: Create ReviewService class managing complete review lifecycle including creation, AI coordination, result processing, and state management with queue integration for async processing | Restrictions: Must handle concurrent reviews, maintain state consistency, integrate with queue system, provide proper error recovery | _Leverage: BullMQ队列, AIModelService, 状态机模式 | _Requirements: FR1.1-FR1.5, FR5.1-FR5.5 | Success: ReviewService manages complete review workflow with proper error handling and state management | Instructions: Set this task to in-progress [-] in tasks.md before starting, then mark as complete [x] when finished._

- [ ] 11. 实现ReviewController类
  - File: src/review/review.controller.ts
  - 创建代码审查API端点
  - 包含CRUD操作、认证防护、权限检查
  - Purpose: 提供完整的代码审查HTTP API接口
  - _Leverage: @nestjs/common装饰器, Guards, Swagger文档_
  - _Requirements: API接口需求_
  - _Prompt: Implement the task for spec ai-code-review-api, first run spec-workflow-guide to get the workflow guide then implement the task: Role: NestJS Controller Developer with expertise in REST API design | Task: Create ReviewController with comprehensive API endpoints including CRUD operations, authentication guards, permission checks, proper error handling, and Swagger documentation | Restrictions: Must follow REST conventions, implement proper validation, ensure security, provide comprehensive API documentation | _Leverage: 认证Guards, 验证管道, Swagger装饰器 | _Requirements: 所有API接口需求 | Success: ReviewController provides complete API with proper documentation and security | Instructions: Set this task to in-progress [-] in tasks.md before starting, then mark as complete [x] when finished._

- [ ] 12. 实现AIModelService类
  - File: src/ai/ai-model.service.ts
  - 创建AI模型管理和调用服务
  - 包含模型选择、调用协调、使用统计
  - Purpose: 统一管理多种AI模型的调用和配置
  - _Leverage: AIProvider接口, 配置服务, 使用统计_
  - _Requirements: FR2: AI模型集成_
  - _Prompt: Implement the task for spec ai-code-review-api, first run spec-workflow-guide to get the workflow guide then implement the task: Role: AI Integration Specialist with expertise in service orchestration | Task: Create AIModelService for managing AI model calls, provider selection, usage tracking, and model coordination with proper error handling and fallback mechanisms | Restrictions: Must handle provider failures gracefully, track usage accurately, implement intelligent model selection, ensure cost efficiency | _Leverage: Provider工厂模式, 断路器模式, 使用跟踪 | _Requirements: FR2.1-FR2.5 AI模型集成 | Success: AIModelService provides reliable AI model management with usage tracking and error handling | Instructions: Set this task to in-progress [-] in tasks.md before starting, then mark as complete [x] when finished._

- [ ] 13. 配置BullMQ审查队列
  - File: src/queue/review.queue.ts
  - 配置异步代码审查处理队列
  - 包含任务类型、重试策略、优先级处理
  - Purpose: 支持异步审查处理和高并发场景
  - _Leverage: @nestjs/bull, Redis配置, 队列监控_
  - _Requirements: NFR1: 性能需求_
  - _Prompt: Implement the task for spec ai-code-review-api, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Queue System Developer with expertise in BullMQ and job processing | Task: Configure BullMQ for asynchronous review processing with proper job types, retry strategies, priority handling, monitoring, and Redis integration | Restrictions: Must handle job failures gracefully, provide monitoring capabilities, ensure job persistence, optimize for performance | _Leverage: BullMQ最佳实践, Redis配置, 监控工具 | _Requirements: NFR1.2 并发审查支持 | Success: Queue system handles async reviews efficiently with proper monitoring and error recovery | Instructions: Set this task to in-progress [-] in tasks.md before starting, then mark as complete [x] when finished._

- [ ] 14. 实现ReviewCacheService类
  - File: src/review/services/review-cache.service.ts
  - 创建智能审查结果缓存
  - 包含相似性检测、缓存策略、失效管理
  - Purpose: 优化性能并减少AI调用成本
  - _Leverage: Redis服务, 缓存策略模式_
  - _Requirements: NFR1: 性能, NFR4: 成本控制_
  - _Prompt: Implement the task for spec ai-code-review-api, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Performance Optimization Expert with expertise in caching strategies | Task: Create ReviewCacheService for intelligent caching of review results with similarity detection, cache invalidation, and performance optimization using Redis | Restrictions: Must implement intelligent cache keys, handle cache invalidation properly, optimize memory usage, ensure cache consistency | _Leverage: Redis缓存模式, 相似度算法 | _Requirements: NFR1.5 缓存命中率, NFR4.2 智能缓存策略 | Success: Caching system improves performance and reduces AI costs significantly | Instructions: Set this task to in-progress [-] in tasks.md before starting, then mark as complete [x] when finished._

- [ ] 15. 实现成本跟踪拦截器
  - File: src/common/interceptors/cost-tracking.interceptor.ts
  - 创建AI使用成本监控和控制
  - 包含配额检查、使用统计、预警机制
  - Purpose: 控制AI调用成本并提供使用分析
  - _Leverage: @nestjs/common拦截器, 使用统计服务_
  - _Requirements: NFR4: 成本控制_
  - _Prompt: Implement the task for spec ai-code-review-api, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Cost Management Developer with expertise in usage monitoring | Task: Create cost tracking interceptor for AI usage monitoring, quota management, and spending control with proper alerting and analytics | Restrictions: Must prevent cost overruns, provide accurate tracking, implement user/project quotas, ensure performance impact is minimal | _Leverage: 拦截器模式, 使用统计, 告警服务 | _Requirements: NFR4.1-NFR4.5 成本控制需求 | Success: Cost tracking prevents overruns and provides comprehensive usage analytics | Instructions: Set this task to in-progress [-] in tasks.md before starting, then mark as complete [x] when finished._

- [ ] 16. 实现对话式审查功能
  - File: src/review/conversation/conversation.service.ts
  - 创建与AI的交互式代码讨论
  - 包含上下文管理、对话历史、状态跟踪
  - Purpose: 支持开发者与AI进行深入的代码讨论
  - _Leverage: AIModelService, 对话上下文管理_
  - _Requirements: User Story 5: 对话式审查_
  - _Prompt: Implement the task for spec ai-code-review-api, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Conversational AI Developer with expertise in context management | Task: Create conversational review functionality enabling interactive discussions between developers and AI with proper context management and conversation history | Restrictions: Must maintain conversation context, handle multi-turn discussions, ensure conversation relevance, optimize token usage | _Leverage: 上下文管理, 对话状态机, Token优化 | _Requirements: User Story 5验收标准 | Success: Developers can have meaningful conversations about code with AI maintaining proper context | Instructions: Set this task to in-progress [-] in tasks.md before starting, then mark as complete [x] when finished._

- [ ] 17. 实现审查配置管理
  - File: src/review/config/review-config.service.ts
  - 创建项目级审查规则和配置
  - 包含模型选择、触发条件、自定义规则
  - Purpose: 支持项目个性化的审查配置
  - _Leverage: 项目管理模块, 配置验证_
  - _Requirements: FR1: 审查触发条件_
  - _Prompt: Implement the task for spec ai-code-review-api, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Configuration Management Developer with expertise in rule engines | Task: Create review configuration management supporting project-specific settings including AI model selection, trigger conditions, custom rules, and configuration validation | Restrictions: Must validate configuration consistency, support configuration inheritance, ensure backward compatibility, provide configuration templates | _Leverage: 配置验证器, 规则引擎模式 | _Requirements: FR1.4 条件触发, User Story 2验收标准 | Success: Projects can configure personalized review settings with proper validation and templates | Instructions: Set this task to in-progress [-] in tasks.md before starting, then mark as complete [x] when finished._

- [ ] 18. 实现健康检查和监控
  - File: src/health/ai-health.indicator.ts
  - 创建AI服务健康检查
  - 包含模型可用性、响应时间、错误率监控
  - Purpose: 确保AI服务稳定性和可观测性
  - _Leverage: @nestjs/terminus, 监控服务_
  - _Requirements: NFR2: 准确性, 系统可靠性_
  - _Prompt: Implement the task for spec ai-code-review-api, first run spec-workflow-guide to get the workflow guide then implement the task: Role: DevOps Developer with expertise in health monitoring | Task: Implement comprehensive health checking for AI services including model availability, response times, error rates, and system metrics monitoring | Restrictions: Must provide actionable health information, avoid false positives, ensure minimal performance impact, integrate with existing monitoring | _Leverage: NestJS健康检查, 监控集成 | _Requirements: NFR2.1-NFR2.5 准确性需求 | Success: Health checks provide reliable system status and early warning of issues | Instructions: Set this task to in-progress [-] in tasks.md before starting, then mark as complete [x] when finished._

- [ ] 19. 编写综合单元测试
  - File: src/review/__tests__/
  - 为所有核心组件编写单元测试
  - 包含AI调用、计算逻辑、错误处理测试
  - Purpose: 确保代码质量和功能正确性
  - _Leverage: Jest, @nestjs/testing, 测试工具_
  - _Requirements: 质量保证要求_
  - _Prompt: Implement the task for spec ai-code-review-api, first run spec-workflow-guide to get the workflow guide then implement the task: Role: QA Engineer with expertise in Jest and comprehensive testing | Task: Write comprehensive unit tests for all core components covering AI calls, business logic, error handling, and edge cases with proper mocking and test independence | Restrictions: Must achieve >80% code coverage, test all error scenarios, maintain test performance, ensure test reliability | _Leverage: Jest测试框架, 模拟工具, 测试助手 | _Requirements: 单元测试覆盖率>80% | Success: All unit tests pass with comprehensive coverage and reliable execution | Instructions: Set this task to in-progress [-] in tasks.md before starting, then mark as complete [x] when finished._

- [ ] 20. 集成测试和性能验证
  - File: test/integration/review/
  - 执行端到端集成测试
  - 验证完整审查流程和性能指标
  - Purpose: 确保系统集成正确且性能达标
  - _Leverage: 测试数据库, 集成测试工具_
  - _Requirements: 所有性能和功能需求_
  - _Prompt: Implement the task for spec ai-code-review-api, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Integration Test Engineer with expertise in end-to-end testing | Task: Execute comprehensive integration tests validating complete review workflows, AI integration, performance metrics, and system reliability meeting all requirements | Restrictions: Must test real scenarios, validate performance benchmarks, ensure data consistency, verify error recovery | _Leverage: 集成测试框架, 性能测试工具 | _Requirements: 所有NFR性能需求, 验收标准 | Success: Integration tests confirm system meets all functional and performance requirements | Instructions: Set this task to in-progress [-] in tasks.md before starting, then mark as complete [x] when finished._