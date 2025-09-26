import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from '../prisma/prisma.module';
import { GitlabController } from './gitlab.controller';
import { GitlabService } from './gitlab.service';
import { GitlabApiClientService } from './services/gitlab-api-client.service';
import { MergeRequestService } from './services/merge-request.service';
import { RepositoryService } from './services/repository.service';
import { BranchService } from './services/branch.service';
import { GitlabConnectionController } from './controllers/gitlab-connection.controller';
import { GitlabTokenLifecycleService } from './services/token-lifecycle.service';
import { ProjectSyncService } from './services/project-sync.service';
import { ProjectImportController } from './controllers/project-import.controller';
import { GitlabWebhookController } from './controllers/webhook.controller';
import { GitLabMetricsService } from './services/gitlab-metrics.service';
import { GitlabHealthCheckService } from './services/health-check.service';
import { GitlabHealthController } from './controllers/health.controller';
import { FailureRecoveryService } from './services/failure-recovery.service';
import { SyncRecoveryService } from './services/sync-recovery.service';
import { SecurityAuditService } from './services/security-audit.service';
import { ProjectConfigurationService } from './services/project-configuration.service';
import { WebhookManagementService } from './services/webhook-management.service';
import { WebhookManagementController } from './controllers/webhook-management.controller';
import { GitlabEventProcessor } from './queues/gitlab-event.queue';
import { GitlabCacheService } from './cache/gitlab.cache';
import { ApiOptimizationService } from './services/api-optimization.service';
import { MrDiscussionService } from './services/mr-discussion.service';
import { ReviewSyncService } from './services/review-sync.service';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({ name: 'gitlab-events' }),
  ],
  controllers: [GitlabController, GitlabConnectionController, ProjectImportController, GitlabWebhookController, GitlabHealthController, WebhookManagementController],
  providers: [
    GitlabService,
    GitlabApiClientService,
    GitlabTokenLifecycleService,
    ProjectSyncService,
    MergeRequestService,
    MrDiscussionService,
    ReviewSyncService,
    RepositoryService,
    BranchService,
    GitLabMetricsService,
    GitlabHealthCheckService,
    FailureRecoveryService,
    SyncRecoveryService,
    SecurityAuditService,
    ProjectConfigurationService,
    WebhookManagementService,
    GitlabEventProcessor,
    GitlabCacheService,
    ApiOptimizationService,
  ],
  exports: [
    GitlabApiClientService,
    GitlabTokenLifecycleService,
    ProjectSyncService,
    MergeRequestService,
    MrDiscussionService,
    ReviewSyncService,
    RepositoryService,
    BranchService,
    GitLabMetricsService,
    GitlabHealthCheckService,
    FailureRecoveryService,
    SyncRecoveryService,
    SecurityAuditService,
    ProjectConfigurationService,
    WebhookManagementService,
    GitlabCacheService,
    ApiOptimizationService,
  ],
})
export class GitlabModule {}
