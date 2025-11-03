# Tasks: ai-code-review-market-alignment (后端)

## Task List

- [ ] 1. 校验/补齐 Prisma 模型（Review/ReviewItem）
  - File: prisma/schema.prisma
  - Description: 如已存在 Review/ReviewItem 则核对字段与索引；若无则按设计添加，保持最小侵入与兼容
  - Purpose: 为历史查询/入库提供结构基础
  - _Leverage: 现有 prisma/schema.prisma；设计文档§9；`npx prisma generate`_
  - _Requirements: FR-5 历史查询；FR-2 内容保存；NFR-4 可扩展性_
  - _Prompt: Implement the task for spec ai-code-review-market-alignment, first run spec-workflow-guide to get the workflow guide then implement the task: Role: NestJS + Prisma Engineer | Task: Validate or add Review/ReviewItem models with proper indexes | Restrictions: Do not break existing tables or remove fields; ensure backward compatibility | Success: db push ok and Prisma Client usable._

- [ ] 2. 新增指纹工具（去重）
  - File: src/common/utils/fingerprint.util.ts
  - Description: 提供 fingerprint(file,line,comment) → sha256（含 normalizeText）
  - Purpose: 标准化建议去重与 MR 评论幂等标记
  - _Leverage: Node crypto；utils 目录风格；设计文档§3_
  - _Requirements: FR-3 去重与上限；NFR-2 可靠性_
  - _Prompt: Implement the task for spec ai-code-review-market-alignment, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Node Utilities Author | Task: Implement stable hashing and export API | Restrictions: No heavy deps; add minimal unit test; Chinese comments | Success: tests pass; utility reusable._

- [ ] 3. 处理器标准化与去重/阈值控制
  - File: src/modules/queue/processors/analysis.processor.ts
  - Description: 消费 job 时统一为 ReviewResult，计算 fingerprint，应用 maxComments 上限，记录 costMs
  - Purpose: 产出稳定有限的建议集合
  - _Leverage: ai/ai.service.ts；fingerprint.util.ts；Bull 队列_
  - _Requirements: FR-2 内容；FR-3 上限；NFR-1 安全_
  - _Prompt: Implement the task for spec ai-code-review-market-alignment, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Queue Processor Dev | Task: Normalize AI output, dedupe and cap Top-N | Restrictions: Keep queue names/handlers; logs without sensitive content | Success: stable ReviewResult without duplicates._

- [ ] 4. 幂等回写到 GitLab（讨论/行内评论）
  - File: src/gitlab/services/mr-discussion.service.ts
  - Description: 发布摘要与行内评论；评论尾部附 [ML-FP:<sha256>]；若已存在指纹则跳过
  - Purpose: 防止评论刷屏，确保回写幂等
  - _Leverage: gitlab/services/merge-request.service.ts；@gitbeaker/rest_
  - _Requirements: FR-4 回写幂等；NFR-1 安全_
  - _Prompt: Implement the task for spec ai-code-review-market-alignment, first run spec-workflow-guide to get the workflow guide then implement the task: Role: GitLab API Adapter | Task: Implement idempotent notes write with fingerprint | Restrictions: No code content in logs; retries handled by queue | Success: No duplicate notes; single summary updated._

- [ ] 5. 保存审查结果（入库）
  - File: src/services/analysis-result.service.ts
  - Description: 将 ReviewResult 写入 Review/ReviewItem；记录 provider/model/counts/时间；事务写入
  - Purpose: 支撑历史查询与趋势分析
  - _Leverage: PrismaService；模型关系_
  - _Requirements: FR-2 内容保存；FR-5 历史查询_
  - _Prompt: Implement the task for spec ai-code-review-market-alignment, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Prisma Service Dev | Task: saveReviewResult(projectId,mrIid,result) with dedupe on fingerprint | Restrictions: No duplicate inserts | Success: returns saved id; data complete._

- [ ] 6. 历史查询与详情 API
  - File: src/review/review.controller.ts; src/review/review.service.ts
  - Description: GET /api/review 列表（分页/过滤）与 GET /api/review/:id 详情
  - Purpose: 前端 MR 详情与历史页消费
  - _Leverage: Controller/Service 模板；Prisma 查询_
  - _Requirements: FR-5 历史查询；NFR-3 可用性_
  - _Prompt: Implement the task for spec ai-code-review-market-alignment, first run spec-workflow-guide to get the workflow guide then implement the task: Role: API Controller Dev | Task: Implement list/detail with pagination and filters | Restrictions: Do not expose sensitive fields | Success: Swagger可试用，200结构正确._

- [ ] 7. 项目级配置接口（扩展字段）
  - File: src/projects/controllers/project-config.controller.ts; src/projects/services/project-configuration.service.ts
  - Description: 支持 provider/model/temperature/maxComments/dedupe/trigger 的读写与校验；记录审计
  - Purpose: 允许项目级审查策略调优
  - _Leverage: projects 模块；ConfigService_
  - _Requirements: FR-6 配置_
  - _Prompt: Implement the task for spec ai-code-review-market-alignment, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Config API Dev | Task: Extend project config API to support AI fields | Restrictions: Backward compatible | Success: Swagger可读写并校验._

- [ ] 8. 指标埋点（Prometheus）
  - File: src/common/services/metrics.service.ts; src/ai/ai.service.ts; src/modules/queue/processors/analysis.processor.ts
  - Description: 新增 histogram/counter（AI 调用时长、回写条数、队列失败等）；标注 status
  - Purpose: 可观测性与故障定位
  - _Leverage: prom-client；MetricsService_
  - _Requirements: FR-8 可观测性；NFR-3 可用性_
  - _Prompt: Implement the task for spec ai-code-review-market-alignment, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Observability Engineer | Task: Add metrics at AI call/processor/write paths | Restrictions: No sensitive labels | Success: /metrics shows new series and changes with calls._

- [ ] 9. 单测与最小 E2E
  - File: src/common/utils/__tests__/fingerprint.util.spec.ts; src/review/review.controller.spec.ts
  - Description: 覆盖指纹工具与查询接口最小用例
  - Purpose: 基础质量保障
  - _Leverage: Jest；@nestjs/testing_
  - _Requirements: NFR-2 可靠性；NFR-3 可用性_
  - _Prompt: Implement the task for spec ai-code-review-market-alignment, first run spec-workflow-guide to get the workflow guide then implement the task: Role: QA Engineer | Task: Add minimal tests for fingerprint and review API | Restrictions: No extra frameworks | Success: npm test passes with coverage on key paths._
