import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Histogram, register } from 'prom-client';

/**
 * GitLab 集成指标服务
 * 收集：API 调用次数/时延、错误率、Webhook 事件处理、同步数据量、Token 刷新结果
 */
@Injectable()
export class GitLabMetricsService {

  readonly apiRequestsTotal: Counter<string>;
  readonly apiRequestDuration: Histogram<string>;
  readonly apiErrorsTotal: Counter<string>;

  readonly webhookEventsTotal: Counter<string>;
  readonly syncOperationsTotal: Counter<string>;
  readonly tokenRefreshTotal: Counter<string>;
  readonly auditEventsTotal: Counter<string>;
  readonly complianceReportsTotal: Counter<string>;
  readonly complianceIssuesTotal: Counter<string>;
  readonly projectConfigTotal: Counter<string>;
  readonly projectAssociationTotal: Counter<string>;
  readonly webhookManageTotal: Counter<string>;

  readonly connectionsActive: Gauge<string>;

  constructor() {

    this.apiRequestsTotal = (register.getSingleMetric('gitlab_api_requests_total') as Counter<string>)
      || new Counter({ name: 'gitlab_api_requests_total', help: 'GitLab API 请求总数', labelNames: ['method', 'path', 'status'] as const });

    this.apiRequestDuration = (register.getSingleMetric('gitlab_api_request_duration_seconds') as Histogram<string>)
      || new Histogram({ name: 'gitlab_api_request_duration_seconds', help: 'GitLab API 请求耗时（秒）', labelNames: ['method', 'path', 'status'] as const, buckets: [0.05, 0.1, 0.2, 0.5, 1, 2, 5] });

    this.apiErrorsTotal = (register.getSingleMetric('gitlab_api_errors_total') as Counter<string>)
      || new Counter({ name: 'gitlab_api_errors_total', help: 'GitLab API 错误总数', labelNames: ['method', 'path', 'status'] as const });

    this.webhookEventsTotal = (register.getSingleMetric('gitlab_webhook_events_total') as Counter<string>)
      || new Counter({ name: 'gitlab_webhook_events_total', help: 'GitLab Webhook 事件计数', labelNames: ['event_type', 'status'] as const });

    this.syncOperationsTotal = (register.getSingleMetric('gitlab_sync_operations_total') as Counter<string>)
      || new Counter({ name: 'gitlab_sync_operations_total', help: 'GitLab 同步操作计数', labelNames: ['type', 'result'] as const });

    this.tokenRefreshTotal = (register.getSingleMetric('gitlab_token_refresh_total') as Counter<string>)
      || new Counter({ name: 'gitlab_token_refresh_total', help: 'GitLab OAuth Token 刷新次数', labelNames: ['result'] as const });

    this.connectionsActive = (register.getSingleMetric('gitlab_connections_active') as Gauge<string>)
      || new Gauge({ name: 'gitlab_connections_active', help: '活跃的 GitLab 连接数量' });

    this.auditEventsTotal = (register.getSingleMetric('gitlab_audit_events_total') as Counter<string>)
      || new Counter({ name: 'gitlab_audit_events_total', help: 'GitLab 审计事件计数', labelNames: ['event'] as const });

    this.complianceReportsTotal = (register.getSingleMetric('gitlab_compliance_reports_total') as Counter<string>)
      || new Counter({ name: 'gitlab_compliance_reports_total', help: 'GitLab 合规报告生成次数', labelNames: ['status'] as const });

    this.complianceIssuesTotal = (register.getSingleMetric('gitlab_compliance_issues_total') as Counter<string>)
      || new Counter({ name: 'gitlab_compliance_issues_total', help: 'GitLab 合规问题计数', labelNames: ['issue'] as const });

    this.projectConfigTotal = (register.getSingleMetric('gitlab_project_config_updates_total') as Counter<string>)
      || new Counter({ name: 'gitlab_project_config_updates_total', help: 'GitLab 项目配置操作次数', labelNames: ['action'] as const });

    this.projectAssociationTotal = (register.getSingleMetric('gitlab_project_association_total') as Counter<string>)
      || new Counter({ name: 'gitlab_project_association_total', help: 'GitLab 项目关联变更次数', labelNames: ['action'] as const });

    this.webhookManageTotal = (register.getSingleMetric('gitlab_webhook_manage_total') as Counter<string>)
      || new Counter({ name: 'gitlab_webhook_manage_total', help: 'GitLab Webhook 管理操作计数', labelNames: ['action', 'result'] as const });
  }

  /** API 调用观测 */
  observeApi(method: string, path: string, status: string, seconds: number) {
    const labels = { method, path, status } as const;
    this.apiRequestsTotal.inc(labels);
    this.apiRequestDuration.observe(labels, seconds);
    if (status && Number(status) >= 400) {
      this.apiErrorsTotal.inc(labels);
    }
  }

  /** Webhook 事件计数 */
  countWebhook(eventType: string, status: 'handled' | 'ignored' | 'invalid_secret') {
    this.webhookEventsTotal.inc({ event_type: eventType || 'unknown', status });
  }

  /** 同步计数 */
  countSync(type: 'projects' | 'members' | 'branches', result: 'success' | 'failure', delta = 1) {
    this.syncOperationsTotal.inc({ type, result }, delta);
  }

  /** 刷新计数 */
  countTokenRefresh(result: 'success' | 'failure') {
    this.tokenRefreshTotal.inc({ result });
  }

  /** 连接活跃数（可由调用方定期设置） */
  setActiveConnections(n: number) {
    this.connectionsActive.set(n);
  }

  /** 审计事件计数 */
  countAuditEvent(event: string) {
    this.auditEventsTotal.inc({ event });
  }

  /** 合规报告与问题计数 */
  countComplianceReport(ok: boolean, issues: string[]) {
    this.complianceReportsTotal.inc({ status: ok ? 'ok' : 'not_ok' });
    for (const issue of issues || []) {
      this.complianceIssuesTotal.inc({ issue });
    }
  }

  /** 项目配置操作计数 */
  countProjectConfig(action: 'set' | 'patch' | 'rollback') {
    this.projectConfigTotal.inc({ action });
  }

  /** 项目关联变更计数 */
  countProjectAssociation(action: 'link' | 'unlink') {
    this.projectAssociationTotal.inc({ action });
  }

  /** Webhook 管理计数 */
  countWebhookManage(action: 'upsert' | 'delete' | 'test', result: 'success' | 'noop' | 'not_found') {
    this.webhookManageTotal.inc({ action, result });
  }
}
