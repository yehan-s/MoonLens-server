# Design: AI Code Review API

## 系统架构

### 核心组件设计

```
AI Code Review API
├── Controllers
│   ├── ReviewController (审查管理)
│   ├── AIModelController (AI模型管理)
│   ├── ReviewConfigController (审查配置)
│   └── ReviewHistoryController (审查历史)
├── Services
│   ├── ReviewService (审查业务逻辑)
│   ├── AIModelService (AI模型调用)
│   ├── CodeAnalysisService (代码分析)
│   ├── SuggestionService (建议处理)
│   └── ReviewCacheService (审查缓存)
├── Providers
│   ├── OpenAIProvider (OpenAI GPT调用)
│   ├── AnthropicProvider (Anthropic Claude调用)
│   └── LocalModelProvider (本地模型支持)
├── Processors
│   ├── DiffProcessor (差异解析)
│   ├── ContextExtractor (上下文提取)
│   └── SecurityScanner (安全扫描)
├── Queues
│   ├── ReviewQueue (审查任务队列)
│   ├── RetryQueue (重试队列)
│   └── BatchProcessingQueue (批处理队列)
├── Guards
│   ├── ReviewPermissionGuard (审查权限)
│   └── AIModelQuotaGuard (模型配额限制)
└── Interceptors
    ├── ReviewLoggingInterceptor (审查日志)
    ├── CostTrackingInterceptor (成本跟踪)
    └── CacheInterceptor (缓存拦截)
```

## 数据库设计

### 表结构设计

```sql
-- AI模型配置表
CREATE TABLE ai_models (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    provider ENUM('openai', 'anthropic', 'local', 'other') NOT NULL,
    model_version VARCHAR(50) NOT NULL,
    api_endpoint VARCHAR(500),
    max_tokens INT DEFAULT 4096,
    temperature DECIMAL(3,2) DEFAULT 0.7,
    max_retries INT DEFAULT 3,
    timeout_seconds INT DEFAULT 30,
    cost_per_1k_tokens DECIMAL(10,4),
    is_active BOOLEAN DEFAULT TRUE,
    configuration JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_provider (provider),
    INDEX idx_is_active (is_active),
    UNIQUE KEY uk_provider_model (provider, model_version)
);

-- 代码审查表
CREATE TABLE code_reviews (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    project_id BIGINT NOT NULL,
    gitlab_project_id BIGINT,
    merge_request_id BIGINT,
    merge_request_iid BIGINT,
    source_branch VARCHAR(200),
    target_branch VARCHAR(200),
    commit_sha VARCHAR(40),
    review_type ENUM('auto', 'manual', 'scheduled') DEFAULT 'auto',
    status ENUM('pending', 'processing', 'completed', 'failed', 'cancelled') DEFAULT 'pending',
    ai_model_id BIGINT,
    configuration JSON,
    code_diff TEXT,
    context_files JSON,
    total_lines_added INT DEFAULT 0,
    total_lines_removed INT DEFAULT 0,
    files_changed INT DEFAULT 0,
    processing_started_at DATETIME,
    processing_completed_at DATETIME,
    error_message TEXT,
    retry_count INT DEFAULT 0,
    created_by BIGINT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (ai_model_id) REFERENCES ai_models(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_project_id (project_id),
    INDEX idx_merge_request (merge_request_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at),
    INDEX idx_processing_time (processing_started_at, processing_completed_at)
);

-- 审查建议表
CREATE TABLE review_suggestions (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    review_id BIGINT NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    line_number INT,
    suggestion_type ENUM('bug', 'performance', 'security', 'style', 'best_practice', 'refactor', 'test') NOT NULL,
    severity ENUM('info', 'low', 'medium', 'high', 'critical') DEFAULT 'medium',
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    original_code TEXT,
    suggested_code TEXT,
    reasoning TEXT,
    references JSON,
    is_resolved BOOLEAN DEFAULT FALSE,
    resolved_by BIGINT,
    resolved_at DATETIME,
    resolution_note TEXT,
    gitlab_discussion_id BIGINT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (review_id) REFERENCES code_reviews(id) ON DELETE CASCADE,
    FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_review_id (review_id),
    INDEX idx_file_path (file_path),
    INDEX idx_suggestion_type (suggestion_type),
    INDEX idx_severity (severity),
    INDEX idx_is_resolved (is_resolved),
    INDEX idx_created_at (created_at)
);

-- AI模型使用统计表
CREATE TABLE ai_model_usage (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    ai_model_id BIGINT NOT NULL,
    review_id BIGINT NOT NULL,
    prompt_tokens INT DEFAULT 0,
    completion_tokens INT DEFAULT 0,
    total_tokens INT DEFAULT 0,
    response_time_ms INT,
    cost_amount DECIMAL(10,4),
    success BOOLEAN DEFAULT TRUE,
    error_code VARCHAR(50),
    error_message TEXT,
    usage_date DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (ai_model_id) REFERENCES ai_models(id) ON DELETE CASCADE,
    FOREIGN KEY (review_id) REFERENCES code_reviews(id) ON DELETE CASCADE,
    INDEX idx_ai_model_id (ai_model_id),
    INDEX idx_review_id (review_id),
    INDEX idx_usage_date (usage_date),
    INDEX idx_success (success)
);

-- 审查配置表
CREATE TABLE review_configurations (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    project_id BIGINT NOT NULL,
    name VARCHAR(100) NOT NULL,
    ai_model_id BIGINT NOT NULL,
    is_default BOOLEAN DEFAULT FALSE,
    trigger_conditions JSON,
    review_scope JSON,
    prompt_template TEXT,
    max_files_per_review INT DEFAULT 50,
    max_lines_per_file INT DEFAULT 1000,
    enabled_suggestion_types JSON,
    severity_filter JSON,
    custom_rules JSON,
    webhook_config JSON,
    is_active BOOLEAN DEFAULT TRUE,
    created_by BIGINT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (ai_model_id) REFERENCES ai_models(id) ON DELETE RESTRICT,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_project_id (project_id),
    INDEX idx_is_default (is_default),
    INDEX idx_is_active (is_active),
    UNIQUE KEY uk_project_default (project_id, is_default)
);

-- 审查对话表（交互式审查）
CREATE TABLE review_conversations (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    review_id BIGINT NOT NULL,
    suggestion_id BIGINT,
    user_id BIGINT NOT NULL,
    conversation_data JSON NOT NULL,
    message_count INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (review_id) REFERENCES code_reviews(id) ON DELETE CASCADE,
    FOREIGN KEY (suggestion_id) REFERENCES review_suggestions(id) ON DELETE SET NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_review_id (review_id),
    INDEX idx_user_id (user_id),
    INDEX idx_is_active (is_active)
);
```

## API接口设计

### Controller设计

#### ReviewController

```typescript
@Controller('api/reviews')
@UseGuards(JwtAuthGuard)
@UseInterceptors(ReviewLoggingInterceptor)
export class ReviewController {
  constructor(
    private readonly reviewService: ReviewService,
    private readonly suggestionService: SuggestionService,
  ) {}

  @Post()
  @UseGuards(ReviewPermissionGuard)
  async createReview(@Body() createDto: CreateReviewDto) {
    return this.reviewService.createReview(createDto);
  }

  @Post(':id/trigger')
  async triggerReview(@Param('id') reviewId: string) {
    return this.reviewService.triggerReview(+reviewId);
  }

  @Get(':id')
  async getReview(@Param('id') reviewId: string) {
    return this.reviewService.getReviewDetails(+reviewId);
  }

  @Get(':id/suggestions')
  async getSuggestions(
    @Param('id') reviewId: string,
    @Query() query: SuggestionQueryDto,
  ) {
    return this.suggestionService.getSuggestionsByReview(+reviewId, query);
  }

  @Put('suggestions/:suggestionId/resolve')
  async resolveSuggestion(
    @Param('suggestionId') suggestionId: string,
    @Body() resolveDto: ResolveSuggestionDto,
  ) {
    return this.suggestionService.resolveSuggestion(+suggestionId, resolveDto);
  }

  @Post(':id/chat')
  async startConversation(
    @Param('id') reviewId: string,
    @Body() chatDto: ReviewChatDto,
  ) {
    return this.reviewService.startConversation(+reviewId, chatDto);
  }

  @Get('project/:projectId')
  async getProjectReviews(
    @Param('projectId') projectId: string,
    @Query() query: ReviewListQueryDto,
  ) {
    return this.reviewService.getProjectReviews(+projectId, query);
  }
}
```

#### AIModelController

```typescript
@Controller('api/ai-models')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AIModelController {
  constructor(private readonly aiModelService: AIModelService) {}

  @Get()
  async listModels(@Query() query: ModelListQueryDto) {
    return this.aiModelService.listModels(query);
  }

  @Post()
  async createModel(@Body() createDto: CreateModelDto) {
    return this.aiModelService.createModel(createDto);
  }

  @Put(':id')
  async updateModel(
    @Param('id') modelId: string,
    @Body() updateDto: UpdateModelDto,
  ) {
    return this.aiModelService.updateModel(+modelId, updateDto);
  }

  @Post(':id/test')
  async testModel(@Param('id') modelId: string) {
    return this.aiModelService.testModelConnection(+modelId);
  }

  @Get(':id/usage')
  async getModelUsage(
    @Param('id') modelId: string,
    @Query() query: UsageQueryDto,
  ) {
    return this.aiModelService.getUsageStatistics(+modelId, query);
  }
}
```

### Service设计

#### ReviewService

```typescript
@Injectable()
export class ReviewService {
  constructor(
    @InjectRepository(CodeReview)
    private readonly reviewRepo: Repository<CodeReview>,
    private readonly aiModelService: AIModelService,
    private readonly codeAnalysisService: CodeAnalysisService,
    private readonly suggestionService: SuggestionService,
    private readonly reviewCacheService: ReviewCacheService,
    @InjectQueue('review') private readonly reviewQueue: Queue,
  ) {}

  async createReview(createDto: CreateReviewDto) {
    // 创建审查记录
    const review = await this.reviewRepo.save({
      projectId: createDto.projectId,
      gitlabProjectId: createDto.gitlabProjectId,
      mergeRequestId: createDto.mergeRequestId,
      mergeRequestIid: createDto.mergeRequestIid,
      sourceBranch: createDto.sourceBranch,
      targetBranch: createDto.targetBranch,
      commitSha: createDto.commitSha,
      reviewType: createDto.reviewType || 'manual',
      aiModelId: createDto.aiModelId,
      configuration: createDto.configuration,
      codeDiff: createDto.codeDiff,
      createdBy: createDto.userId,
    });

    // 异步处理审查
    await this.reviewQueue.add('process-review', {
      reviewId: review.id,
      priority: createDto.priority || 'normal',
    }, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: 100,
      removeOnFail: 50,
    });

    return this.formatReviewResponse(review);
  }

  @Process('process-review')
  async processReview(job: Job) {
    const { reviewId } = job.data;
    const review = await this.reviewRepo.findOne({ where: { id: reviewId } });
    
    if (!review) {
      throw new Error(`Review ${reviewId} not found`);
    }

    try {
      // 更新状态为处理中
      await this.reviewRepo.update(reviewId, {
        status: 'processing',
        processingStartedAt: new Date(),
      });

      // 代码分析
      const analysisResult = await this.codeAnalysisService.analyzeDiff(
        review.codeDiff,
        review.configuration,
      );

      // AI模型调用
      const suggestions = await this.aiModelService.generateSuggestions(
        review.aiModelId,
        analysisResult,
        review.configuration,
      );

      // 保存建议
      await this.suggestionService.saveSuggestions(reviewId, suggestions);

      // 更新完成状态
      await this.reviewRepo.update(reviewId, {
        status: 'completed',
        processingCompletedAt: new Date(),
      });

      // 缓存结果
      await this.reviewCacheService.cacheReviewResult(reviewId, suggestions);

    } catch (error) {
      await this.reviewRepo.update(reviewId, {
        status: 'failed',
        errorMessage: error.message,
        retryCount: review.retryCount + 1,
      });

      // 如果重试次数未超限，重新加入队列
      if (review.retryCount < 2) {
        await this.reviewQueue.add('process-review', {
          reviewId,
          priority: 'retry',
        }, {
          delay: Math.pow(2, review.retryCount) * 5000, // 指数退避
        });
      }

      throw error;
    }
  }

  async startConversation(reviewId: number, chatDto: ReviewChatDto) {
    const review = await this.reviewRepo.findOne({ where: { id: reviewId } });
    if (!review) {
      throw new NotFoundException('Review not found');
    }

    // 获取对话上下文
    const context = await this.buildConversationContext(reviewId, chatDto.suggestionId);
    
    // 调用AI模型进行对话
    const response = await this.aiModelService.chat(
      review.aiModelId,
      chatDto.message,
      context,
    );

    // 保存对话记录
    return this.saveConversationMessage(reviewId, chatDto, response);
  }
}
```

#### AIModelService

```typescript
@Injectable()
export class AIModelService {
  constructor(
    @InjectRepository(AiModel)
    private readonly modelRepo: Repository<AiModel>,
    @InjectRepository(AiModelUsage)
    private readonly usageRepo: Repository<AiModelUsage>,
    private readonly openaiProvider: OpenAIProvider,
    private readonly anthropicProvider: AnthropicProvider,
    private readonly localProvider: LocalModelProvider,
  ) {}

  async generateSuggestions(
    modelId: number,
    analysisResult: CodeAnalysisResult,
    configuration: any,
  ): Promise<ReviewSuggestion[]> {
    const model = await this.modelRepo.findOne({ where: { id: modelId } });
    if (!model || !model.isActive) {
      throw new NotFoundException('AI model not found or inactive');
    }

    const provider = this.getProvider(model.provider);
    const startTime = Date.now();

    try {
      // 构建提示词
      const prompt = this.buildPrompt(analysisResult, configuration);
      
      // 调用AI模型
      const response = await provider.generateSuggestions(model, prompt);
      
      // 记录使用统计
      await this.recordUsage(modelId, response, Date.now() - startTime);
      
      // 解析响应为建议格式
      return this.parseSuggestions(response, analysisResult);

    } catch (error) {
      await this.recordUsage(modelId, null, Date.now() - startTime, error);
      throw error;
    }
  }

  async chat(
    modelId: number,
    message: string,
    context: ConversationContext,
  ): Promise<string> {
    const model = await this.modelRepo.findOne({ where: { id: modelId } });
    if (!model || !model.isActive) {
      throw new NotFoundException('AI model not found or inactive');
    }

    const provider = this.getProvider(model.provider);
    const startTime = Date.now();

    try {
      const response = await provider.chat(model, message, context);
      await this.recordUsage(modelId, response, Date.now() - startTime);
      return response.content;
    } catch (error) {
      await this.recordUsage(modelId, null, Date.now() - startTime, error);
      throw error;
    }
  }

  private getProvider(providerType: string) {
    switch (providerType) {
      case 'openai':
        return this.openaiProvider;
      case 'anthropic':
        return this.anthropicProvider;
      case 'local':
        return this.localProvider;
      default:
        throw new BadRequestException(`Unsupported provider: ${providerType}`);
    }
  }

  private buildPrompt(analysisResult: CodeAnalysisResult, configuration: any): string {
    const template = configuration.promptTemplate || this.getDefaultPromptTemplate();
    
    return template
      .replace('{DIFF}', analysisResult.diff)
      .replace('{CONTEXT}', JSON.stringify(analysisResult.context))
      .replace('{LANGUAGE}', analysisResult.primaryLanguage)
      .replace('{RULES}', JSON.stringify(configuration.customRules || {}));
  }

  private async recordUsage(
    modelId: number,
    response: any,
    responseTime: number,
    error?: Error,
  ): Promise<void> {
    await this.usageRepo.save({
      aiModelId: modelId,
      promptTokens: response?.usage?.prompt_tokens || 0,
      completionTokens: response?.usage?.completion_tokens || 0,
      totalTokens: response?.usage?.total_tokens || 0,
      responseTimeMs: responseTime,
      costAmount: this.calculateCost(modelId, response?.usage),
      success: !error,
      errorCode: error?.name,
      errorMessage: error?.message,
      usageDate: new Date().toISOString().split('T')[0],
    });
  }
}
```

### Provider实现

#### OpenAIProvider

```typescript
@Injectable()
export class OpenAIProvider {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL,
    });
  }

  async generateSuggestions(model: AiModel, prompt: string) {
    const response = await this.openai.chat.completions.create({
      model: model.modelVersion,
      messages: [
        {
          role: 'system',
          content: 'You are an expert code reviewer. Analyze the provided code and give specific, actionable feedback.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_tokens: model.maxTokens,
      temperature: model.temperature,
      response_format: { type: 'json_object' },
    });

    return response;
  }

  async chat(model: AiModel, message: string, context: ConversationContext) {
    const messages = this.buildChatMessages(context, message);
    
    const response = await this.openai.chat.completions.create({
      model: model.modelVersion,
      messages,
      max_tokens: Math.min(model.maxTokens, 2000), // 对话限制更少token
      temperature: model.temperature,
    });

    return response.choices[0];
  }

  private buildChatMessages(context: ConversationContext, message: string) {
    const messages = [
      {
        role: 'system' as const,
        content: `You are helping with code review. Context: ${context.reviewSummary}`,
      },
    ];

    // 添加历史对话
    context.previousMessages.forEach(msg => {
      messages.push({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      });
    });

    // 添加当前消息
    messages.push({
      role: 'user' as const,
      content: message,
    });

    return messages;
  }
}
```

#### AnthropicProvider

```typescript
@Injectable()
export class AnthropicProvider {
  private anthropic: Anthropic;

  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  async generateSuggestions(model: AiModel, prompt: string) {
    const response = await this.anthropic.messages.create({
      model: model.modelVersion,
      max_tokens: model.maxTokens,
      temperature: model.temperature,
      system: 'You are an expert code reviewer. Return your analysis in valid JSON format.',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    return {
      choices: [{
        message: {
          content: response.content[0].type === 'text' ? response.content[0].text : '',
        },
      }],
      usage: {
        prompt_tokens: response.usage.input_tokens,
        completion_tokens: response.usage.output_tokens,
        total_tokens: response.usage.input_tokens + response.usage.output_tokens,
      },
    };
  }

  async chat(model: AiModel, message: string, context: ConversationContext) {
    const messages = this.buildChatMessages(context, message);
    
    const response = await this.anthropic.messages.create({
      model: model.modelVersion,
      max_tokens: Math.min(model.maxTokens, 2000),
      temperature: model.temperature,
      system: `You are helping with code review. Context: ${context.reviewSummary}`,
      messages,
    });

    return {
      message: {
        content: response.content[0].type === 'text' ? response.content[0].text : '',
      },
      usage: {
        prompt_tokens: response.usage.input_tokens,
        completion_tokens: response.usage.output_tokens,
        total_tokens: response.usage.input_tokens + response.usage.output_tokens,
      },
    };
  }
}
```

## 代码分析引擎

### DiffProcessor

```typescript
@Injectable()
export class DiffProcessor {
  parseDiff(diffText: string): ParsedDiff {
    const files = [];
    const lines = diffText.split('\n');
    let currentFile = null;
    let currentHunk = null;

    for (const line of lines) {
      if (line.startsWith('diff --git')) {
        if (currentFile) {
          files.push(currentFile);
        }
        currentFile = {
          path: this.extractFilePath(line),
          hunks: [],
          additions: 0,
          deletions: 0,
        };
      } else if (line.startsWith('@@') && currentFile) {
        if (currentHunk) {
          currentFile.hunks.push(currentHunk);
        }
        currentHunk = {
          oldStart: this.extractOldStart(line),
          newStart: this.extractNewStart(line),
          context: this.extractContext(line),
          changes: [],
        };
      } else if (currentHunk && (line.startsWith('+') || line.startsWith('-') || line.startsWith(' '))) {
        const change = {
          type: line[0] as '+' | '-' | ' ',
          content: line.slice(1),
          lineNumber: this.calculateLineNumber(currentHunk, line[0]),
        };
        currentHunk.changes.push(change);
        
        if (line.startsWith('+')) {
          currentFile.additions++;
        } else if (line.startsWith('-')) {
          currentFile.deletions++;
        }
      }
    }

    if (currentHunk && currentFile) {
      currentFile.hunks.push(currentHunk);
    }
    if (currentFile) {
      files.push(currentFile);
    }

    return {
      files,
      totalAdditions: files.reduce((sum, f) => sum + f.additions, 0),
      totalDeletions: files.reduce((sum, f) => sum + f.deletions, 0),
      totalFiles: files.length,
    };
  }

  extractSecurityIssues(diff: ParsedDiff): SecurityIssue[] {
    const issues = [];
    
    for (const file of diff.files) {
      for (const hunk of file.hunks) {
        for (const change of hunk.changes) {
          if (change.type === '+') {
            // 检查常见安全问题
            const content = change.content.toLowerCase();
            
            if (content.includes('password') && content.includes('=')) {
              issues.push({
                type: 'hardcoded_credential',
                file: file.path,
                line: change.lineNumber,
                severity: 'high',
                message: 'Potential hardcoded password detected',
              });
            }
            
            if (content.includes('sql') && (content.includes('+') || content.includes('concat'))) {
              issues.push({
                type: 'sql_injection',
                file: file.path,
                line: change.lineNumber,
                severity: 'high',
                message: 'Potential SQL injection vulnerability',
              });
            }
          }
        }
      }
    }
    
    return issues;
  }
}
```

### ContextExtractor

```typescript
@Injectable()
export class ContextExtractor {
  async extractContext(
    diff: ParsedDiff,
    gitlabProjectId: number,
    commitSha: string,
  ): Promise<CodeContext> {
    const context = {
      mainLanguage: this.detectMainLanguage(diff),
      fileContexts: [],
      dependencies: [],
      projectStructure: {},
    };

    for (const file of diff.files) {
      const fileContext = await this.extractFileContext(
        file,
        gitlabProjectId,
        commitSha,
      );
      context.fileContexts.push(fileContext);
    }

    // 分析依赖关系
    context.dependencies = await this.analyzeDependencies(diff);

    return context;
  }

  private detectMainLanguage(diff: ParsedDiff): string {
    const extensions = {};
    
    for (const file of diff.files) {
      const ext = path.extname(file.path).toLowerCase();
      extensions[ext] = (extensions[ext] || 0) + 1;
    }

    const sortedExts = Object.entries(extensions)
      .sort(([, a], [, b]) => (b as number) - (a as number));

    const languageMap = {
      '.js': 'javascript',
      '.ts': 'typescript',
      '.py': 'python',
      '.java': 'java',
      '.go': 'go',
      '.rs': 'rust',
      '.cpp': 'cpp',
      '.c': 'c',
    };

    return languageMap[sortedExts[0]?.[0]] || 'unknown';
  }

  private async extractFileContext(
    file: ParsedFile,
    gitlabProjectId: number,
    commitSha: string,
  ): Promise<FileContext> {
    // 获取完整文件内容用于上下文分析
    const fullContent = await this.getFileContent(
      gitlabProjectId,
      file.path,
      commitSha,
    );

    return {
      path: file.path,
      language: this.detectFileLanguage(file.path),
      imports: this.extractImports(fullContent),
      functions: this.extractFunctions(fullContent),
      classes: this.extractClasses(fullContent),
      complexity: this.calculateComplexity(fullContent),
    };
  }
}
```

## 缓存与性能优化

### ReviewCacheService

```typescript
@Injectable()
export class ReviewCacheService {
  constructor(private readonly redisService: RedisService) {}

  async cacheReviewResult(reviewId: number, suggestions: ReviewSuggestion[]): Promise<void> {
    const key = `review:${reviewId}`;
    const data = {
      suggestions,
      cachedAt: new Date().toISOString(),
    };
    
    // 缓存24小时
    await this.redisService.setex(key, 86400, JSON.stringify(data));
  }

  async getCachedReview(reviewId: number): Promise<ReviewSuggestion[] | null> {
    const key = `review:${reviewId}`;
    const cached = await this.redisService.get(key);
    
    if (cached) {
      const data = JSON.parse(cached);
      return data.suggestions;
    }
    
    return null;
  }

  async cacheSimilarReview(diffHash: string, suggestions: ReviewSuggestion[]): Promise<void> {
    const key = `similar:${diffHash}`;
    await this.redisService.setex(key, 3600, JSON.stringify(suggestions)); // 1小时
  }

  async findSimilarReview(diffHash: string): Promise<ReviewSuggestion[] | null> {
    const key = `similar:${diffHash}`;
    const cached = await this.redisService.get(key);
    
    return cached ? JSON.parse(cached) : null;
  }
}
```

## 成本控制

### CostTrackingInterceptor

```typescript
@Injectable()
export class CostTrackingInterceptor implements NestInterceptor {
  constructor(
    private readonly usageRepo: Repository<AiModelUsage>,
    private readonly configService: ConfigService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id;
    const projectId = request.body?.projectId;

    // 检查用户/项目配额
    const monthlyUsage = await this.getMonthlyUsage(userId, projectId);
    const monthlyLimit = this.configService.get('AI_MONTHLY_LIMIT', 1000);

    if (monthlyUsage >= monthlyLimit) {
      throw new HttpException('Monthly AI usage limit exceeded', HttpStatus.PAYMENT_REQUIRED);
    }

    // 检查日使用量
    const dailyUsage = await this.getDailyUsage(userId, projectId);
    const dailyLimit = this.configService.get('AI_DAILY_LIMIT', 100);

    if (dailyUsage >= dailyLimit) {
      throw new HttpException('Daily AI usage limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }

    return next.handle();
  }

  private async getMonthlyUsage(userId: number, projectId?: number): Promise<number> {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const query = this.usageRepo
      .createQueryBuilder('usage')
      .innerJoin('usage.review', 'review')
      .where('review.created_by = :userId', { userId })
      .andWhere('usage.created_at >= :startOfMonth', { startOfMonth });

    if (projectId) {
      query.andWhere('review.project_id = :projectId', { projectId });
    }

    const result = await query
      .select('SUM(usage.total_tokens)', 'totalTokens')
      .getRawOne();

    return parseInt(result.totalTokens || '0');
  }
}
```

## 监控与日志

### ReviewLoggingInterceptor

```typescript
@Injectable()
export class ReviewLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ReviewLoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, user, body } = request;
    const startTime = Date.now();

    this.logger.log(`[${method}] ${url} - User: ${user?.id} - Started`);

    return next.handle().pipe(
      tap({
        next: (data) => {
          const duration = Date.now() - startTime;
          this.logger.log(
            `[${method}] ${url} - User: ${user?.id} - Completed in ${duration}ms`,
          );
          
          // 记录关键操作
          if (url.includes('/reviews') && method === 'POST') {
            this.logger.log(
              `Review created: ${JSON.stringify({ 
                projectId: body.projectId, 
                mergeRequestId: body.mergeRequestId,
                duration 
              })}`,
            );
          }
        },
        error: (error) => {
          const duration = Date.now() - startTime;
          this.logger.error(
            `[${method}] ${url} - User: ${user?.id} - Failed in ${duration}ms: ${error.message}`,
            error.stack,
          );
        },
      }),
    );
  }
}
```

## 配置管理

### AI模型配置

```typescript
export interface AIModelConfig {
  models: {
    openai: {
      apiKey: string;
      baseUrl?: string;
      models: string[];
      defaultModel: string;
    };
    anthropic: {
      apiKey: string;
      models: string[];
      defaultModel: string;
    };
  };
  limits: {
    maxTokensPerRequest: number;
    maxRequestsPerMinute: number;
    maxCostPerMonth: number;
  };
  prompts: {
    defaultTemplate: string;
    securityFocused: string;
    performanceFocused: string;
  };
}

@Injectable()
export class AIConfigService {
  private readonly config: AIModelConfig;

  constructor(private readonly configService: ConfigService) {
    this.config = {
      models: {
        openai: {
          apiKey: this.configService.get('OPENAI_API_KEY'),
          baseUrl: this.configService.get('OPENAI_BASE_URL'),
          models: ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo'],
          defaultModel: 'gpt-4',
        },
        anthropic: {
          apiKey: this.configService.get('ANTHROPIC_API_KEY'),
          models: ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'],
          defaultModel: 'claude-3-sonnet',
        },
      },
      limits: {
        maxTokensPerRequest: +this.configService.get('AI_MAX_TOKENS', '4000'),
        maxRequestsPerMinute: +this.configService.get('AI_MAX_REQUESTS_PER_MINUTE', '10'),
        maxCostPerMonth: +this.configService.get('AI_MAX_COST_PER_MONTH', '100'),
      },
      prompts: {
        defaultTemplate: this.getDefaultPromptTemplate(),
        securityFocused: this.getSecurityPromptTemplate(),
        performanceFocused: this.getPerformancePromptTemplate(),
      },
    };
  }
}
```

## 测试策略

### 单元测试重点

- ReviewService: 审查创建、状态管理、错误处理
- AIModelService: 模型调用、响应解析、成本计算
- DiffProcessor: 差异解析、安全检测、语言识别
- Providers: OpenAI/Anthropic API调用、错误处理
- CacheService: 缓存策略、相似度检测
- CostTracking: 配额检查、使用统计

### 集成测试

- 完整审查流程测试
- AI模型集成测试
- WebHook触发测试
- 数据库事务测试
- 队列处理测试

### E2E测试

- GitLab MR触发完整审查流程
- 多模型对比测试
- 成本控制验证
- 性能压力测试

## 部署配置

1. **AI模型API密钥**: 配置OpenAI和Anthropic API密钥
2. **队列服务**: 配置BullMQ用于异步处理
3. **缓存服务**: 配置Redis用于结果缓存
4. **监控配置**: 设置日志收集和性能监控
5. **成本监控**: 配置使用量和成本预警
6. **安全配置**: 确保API密钥安全存储
7. **模型配置**: 根据需求配置默认AI模型