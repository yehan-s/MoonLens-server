# 设计文档：ai-code-review-market-alignment（后端）

## 1. 技术概览
- 框架/语言：NestJS 11 + TypeScript，Prisma（MySQL），BullMQ（Redis）
- 模块边界与数据流：
  1) GitLab Webhook → `gitlab/controllers/webhook.controller.ts` + `guards/webhook-signature.guard.ts`
  2) 事件验证与标准化 → 入队 `queue.service.ts`（jobs: review:enqueue）
  3) 消费者 `modules/queue/processors/analysis.processor.ts`：
     - 拉取 MR diff（`gitlab/services/merge-request.service.ts`/`repository.service.ts`）
     - 组装 Prompt → 调用 AI 服务（`ai/ai.service.ts`）
     - 结果标准化（summary + comments[]）→ 幂等回写（`gitlab/services/mr-discussion.service.ts`）
     - 记录 `Review` 与 `ReviewItem`（Prisma）
  4) 历史查询 API：`review.controller.ts`（GET /api/reviews）
  5) 配置 API：`ai.controller.ts` 或新增 `config.controller.ts`（POST /api/config）
- 关键非功能：零持久化源码（仅 diff 片段临时内存）、令牌与密钥加密、日志脱敏、Prometheus 指标

## 2. 数据契约
### 2.1 AI 服务输出（标准化内部结构）
```ts
export type ReviewLevel = 'issue' | 'suggestion' | 'note';
export interface ReviewComment {
  file: string;            // 相对路径
  line?: number;           // 新文件行号（可选）
  oldLine?: number;        // 旧文件行号（可选）
  level: ReviewLevel;      // 严重级别
  category?: string;       // 性质：security/perf/readability/maintainability/…
  ruleId?: string;         // 可选规则/来源标识
  fingerprint: string;     // 去重指纹（file+line+hash(content)）
  comment: string;         // 文本建议
}
export interface ReviewResult {
  summary: string;         // MR 摘要
  comments: ReviewComment[];
  provider?: string;       // openai/anthropic/…
  model?: string;
  costMs?: number;         // AI 调用耗时
}
```

### 2.2 历史查询 API（对前端）
- `GET /api/reviews?projectId=xxx&mrIid=yyy&page=1&pageSize=20&level=issue|suggestion|note&category=security`
- 响应：
```json
{
  "items": [
    {
      "id": "rev_123",
      "projectId": "p_1",
      "mrIid": 7,
      "createdAt": "2025-09-26T05:12:00Z",
      "summary": "…",
      "counts": { "issue": 3, "suggestion": 5, "note": 2 },
      "provider": "openai",
      "model": "gpt-4o-mini"
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 1
}
```
- `GET /api/reviews/{id}` 返回单次详情（含 comments）。

### 2.3 配置 API（项目级）
- `POST /api/config` 输入：
```json
{
  "projectId": "p_1",
  "provider": "openai",
  "model": "gpt-4o-mini",
  "temperature": 0.2,
  "maxComments": 20,
  "dedupe": true,
  "trigger": { "labels": ["ai-review"], "minChangedLines": 5 }
}
```
- 输出：保存后的配置 + 审计记录 id

## 3. 去重与幂等
- 指纹：`fingerprint = sha256(file + ':' + (line||oldLine||0) + ':' + stableHash(comment))`
- 去重策略：
  - 单次结果内：Set 去重
  - 历史维度：近 N 天（可配）内若存在相同指纹且未修改代码区域，则跳过回写，仅记录“重复建议被抑制”计数
- 幂等回写：在 MR 讨论中标记标识（如 `[ML-FP:<fingerprint>]`）以避免重复发布；更新策略为“存在则跳过/合并摘要”

## 4. 触发与队列
- 触发事件：MR Create/Update/Note（评论触发对话式占位）
- 入队：`reviews` 队列（attempts=3, backoff=exponential 2x, max 2min）
- 消费：`analysis.processor.ts` 读取 job（projectId, mrIid, gitlabConnectionId）→ 执行业务流
- 死信：`dead-letter.processor.ts` 记录并告警（日志/Prom 指标）

## 5. Provider 与 Aggregator 抽象
- Provider：在 `ai.service.ts` 内通过策略路由选择 provider（openai/anthropic/azure/openai_compatible）；所有 provider 统一输出 `ReviewResult`
- Aggregator（预留）：接口 `StaticAnalysisAggregator`：
```ts
interface StaticAnalysisIssue { file: string; line?: number; ruleId: string; level: 'blocker'|'critical'|'major'|'minor'; message: string; source: 'sonar'|'codacy'; }
interface StaticAnalysisAggregator { fetch(projectId: string, mrIid: number): Promise<StaticAnalysisIssue[]> }
```
- 聚合策略：与 AI 结果并列呈现，不混淆；可在摘要中引用数量与分布

## 6. 安全与合规
- 不持久化源码（只处理 diff 片段于内存）
- 令牌与密钥：`GITLAB_ENC_KEY` AES-GCM 加密；不入日志
- Webhook：校验 `X-Gitlab-Token`，按项目 secret 优先
- 日志脱敏：URL/Token/代码片段屏蔽

## 7. 指标与可观测性
- Prometheus 指标：
  - `ml_ai_call_duration_ms` (histogram, labels: provider, model, status)
  - `ml_review_write_comments_total` (counter, labels: level)
  - `ml_queue_length`、`ml_job_failures_total`
- 日志：结构化（winston），追踪 jobId、projectId、mrIid

## 8. 失败与降级
- Provider 超时/配额 → 回退次级 provider（可选）或标记部分失败
- 评论回写失败 → 重试；仍失败则将结果仅保存在历史记录中
- 阈值触发：超过 `maxComments` 时仅写摘要 + Top-N 评论

## 9. 迁移与数据模型（Prisma）
- 新增/校验实体（示意）：
```prisma
model Review { id String @id @default(uuid()) projectId String mrIid Int createdAt DateTime @default(now()) summary String? provider String? model String? items ReviewItem[] @@index([projectId, mrIid]) @@map("reviews") }
model ReviewItem { id String @id @default(uuid()) reviewId String review Review @relation(fields:[reviewId], references:[id]) file String line Int? oldLine Int? level String category String? ruleId String? fingerprint String @index comment String @@map("review_items") }
```

## 10. 落地步骤
- A. 新增/完善 Prisma 模型与迁移（确保最小侵入）
- B. 在 `analysis.processor.ts` 补齐标准化、去重、回写逻辑
- C. 在 `review.controller.ts` 实现查询（分页/过滤）
- D. 在 `ai.controller.ts` 或新 `config.controller.ts` 提供项目级配置的读写接口
- E. 完善 `gitlab/.../mr-discussion.service.ts` 幂等回写策略（指纹标记）
- F. 指标埋点与错误处理（Prom/Winston）
