import { Injectable } from '@nestjs/common';
import { ProjectConfigurationService } from '../../gitlab/services/project-configuration.service';
import { ProjectSyncService } from '../../gitlab/services/project-sync.service';
import { WebhookManagementService } from '../../gitlab/services/webhook-management.service';

/**
 * GitLab 集成服务（集成层包装）
 * - 复用 gitlab 模块内的能力，对外提供统一接口
 */
@Injectable()
export class GitlabIntegrationService {
  constructor(
    private readonly cfg: ProjectConfigurationService,
    private readonly sync: ProjectSyncService,
    private readonly webhooks: WebhookManagementService,
  ) {}

  async bindProject(projectId: string, connectionId: string, actorId?: string) {
    const cfg = await this.cfg.linkConnection(projectId, connectionId, actorId);
    return { ok: true, config: cfg };
  }

  async unbindProject(projectId: string, actorId?: string) {
    const cfg = await this.cfg.unlinkConnection(projectId, actorId);
    return { ok: true, config: cfg };
  }

  async syncMembers(connectionId: string, gitlabProjectId: string | number) {
    return await this.sync.syncProjectMembers(connectionId, gitlabProjectId);
  }

  async syncBranches(connectionId: string, gitlabProjectId: string | number) {
    return await this.sync.syncProjectBranches(connectionId, gitlabProjectId);
  }

  async upsertWebhook(connectionId: string, projectGitlabId: string | number, opts?: { callbackUrl?: string; secret?: string }) {
    return await this.webhooks.upsertProjectHook(connectionId, projectGitlabId, {
      callbackUrl: opts?.callbackUrl,
      secret: opts?.secret,
      pushEvents: true,
      mergeRequestsEvents: true,
      enableSslVerification: true,
    });
  }
}
