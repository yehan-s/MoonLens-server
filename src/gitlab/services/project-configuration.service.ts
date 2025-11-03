import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../common/services/audit-log.service';
import { GitLabMetricsService } from './gitlab-metrics.service';

type JsonObject = Record<string, any>;

/**
 * 项目配置与关联管理
 * - 存储介质：projects.reviewConfig(Json)
 * - 能力：读取/设置/增量更新、版本记录、回滚、模板合并、关联（connectionId）维护
 */
@Injectable()
export class ProjectConfigurationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly metrics: GitLabMetricsService,
  ) {}

  private defaultTemplate(): JsonObject {
    return {
      sync: {
        enabled: true,
        members: true,
        branches: true,
      },
      review: {
        auto: true,
        provider: 'openai',
        model: 'gpt-4o-mini',
        temperature: 0.2,
        maxComments: 20,
        dedupe: true,
        trigger: { labels: ['ai-review'], minChangedLines: 0 },
        aiModel: 'gpt-4', // 向后兼容旧字段
        rules: [],
      },
      association: {
        connectionId: null as string | null,
      },
      _history: [], // [{ at, by, action, diff }]
    };
  }

  private deepMerge<T extends JsonObject>(base: T, patch: Partial<T>): T {
    const out: any = Array.isArray(base) ? [...(base as any)] : { ...base };
    for (const [k, v] of Object.entries(patch)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        out[k] = this.deepMerge(out[k] ?? {}, v as any);
      } else {
        out[k] = v as any;
      }
    }
    return out as T;
  }

  async get(projectId: string): Promise<JsonObject> {
    const p = await this.prisma.project.findUnique({ where: { id: projectId }, select: { reviewConfig: true } });
    if (!p) throw new NotFoundException('project not found');
    const cfg = (p.reviewConfig as JsonObject) || {};
    // 补齐模板缺失项
    return this.deepMerge(this.defaultTemplate(), cfg);
  }

  async set(projectId: string, config: JsonObject, actorId?: string) {
    const before = await this.get(projectId);
    const merged = this.deepMerge(this.defaultTemplate(), config || {});
    const after = await this.prisma.project.update({ where: { id: projectId }, data: { reviewConfig: merged } });
    this.recordHistory(projectId, before, merged, 'set', actorId);
    try { this.metrics.countProjectConfig('set'); } catch {}
    this.audit.log('gitlab.project.config.set', { projectId });
    return after.reviewConfig as JsonObject;
  }

  async patch(projectId: string, patch: JsonObject, actorId?: string) {
    const before = await this.get(projectId);
    const next = this.deepMerge(before, patch || {});
    const after = await this.prisma.project.update({ where: { id: projectId }, data: { reviewConfig: next } });
    this.recordHistory(projectId, before, next, 'patch', actorId);
    try { this.metrics.countProjectConfig('patch'); } catch {}
    this.audit.log('gitlab.project.config.patch', { projectId });
    return after.reviewConfig as JsonObject;
  }

  async linkConnection(projectId: string, connectionId: string, actorId?: string) {
    if (!connectionId) throw new BadRequestException('connectionId required');
    const exists = await this.prisma.gitlabConnection.findUnique({ where: { id: connectionId }, select: { id: true } });
    if (!exists) throw new NotFoundException('connection not found');
    const before = await this.get(projectId);
    const next = this.deepMerge(before, { association: { connectionId } });
    const after = await this.prisma.project.update({ where: { id: projectId }, data: { reviewConfig: next } });
    this.recordHistory(projectId, before, next, 'link', actorId);
    try { this.metrics.countProjectAssociation('link'); } catch {}
    this.audit.security('gitlab.project.link', { id: actorId }, { projectId, connectionId });
    return after.reviewConfig as JsonObject;
  }

  async unlinkConnection(projectId: string, actorId?: string) {
    const before = await this.get(projectId);
    const next = this.deepMerge(before, { association: { connectionId: null } });
    const after = await this.prisma.project.update({ where: { id: projectId }, data: { reviewConfig: next } });
    this.recordHistory(projectId, before, next, 'unlink', actorId);
    try { this.metrics.countProjectAssociation('unlink'); } catch {}
    this.audit.security('gitlab.project.unlink', { id: actorId }, { projectId });
    return after.reviewConfig as JsonObject;
  }

  async rollback(projectId: string, toIndex: number, actorId?: string) {
    const current = await this.get(projectId);
    const history = Array.isArray(current._history) ? current._history : [];
    if (toIndex < 0 || toIndex >= history.length) throw new BadRequestException('invalid history index');
    const snap = history[toIndex]?.after;
    if (!snap) throw new BadRequestException('snapshot not found');
    const after = await this.prisma.project.update({ where: { id: projectId }, data: { reviewConfig: snap } });
    this.recordHistory(projectId, current, snap, 'rollback', actorId);
    try { this.metrics.countProjectConfig('rollback'); } catch {}
    this.audit.admin('gitlab.project.config.rollback', { id: actorId }, { projectId }, { toIndex });
    return after.reviewConfig as JsonObject;
  }

  private recordHistory(projectId: string, before: JsonObject, after: JsonObject, action: string, actorId?: string) {
    const entry = { at: new Date().toISOString(), by: actorId || null, action, before, after };
    // 历史记录存放于 reviewConfig._history 内；长度限制避免无限增长
    const hist = Array.isArray(after._history) ? after._history : [];
    hist.push(entry);
    while (hist.length > 20) hist.shift();
    after._history = hist;
    // 持久化
    this.prisma.project.update({ where: { id: projectId }, data: { reviewConfig: after } }).catch(() => void 0);
  }
}
