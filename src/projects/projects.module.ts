import { PrismaModule } from '../prisma/prisma.module';
import { Module } from '@nestjs/common';
import { GitlabModule } from '../gitlab/gitlab.module';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { ProjectQueryService } from './project-query.service';
import { ProjectMemberService } from './project-member.service';
import { PermissionAuditService } from './permission-audit.service';
import { ProjectConfigurationService } from '../gitlab/services/project-configuration.service';
import { ConfigurationTemplateService } from './configuration-template.service';
import { ConfigurationMigrationService } from './configuration-migration.service';
import { ProjectStatisticsService } from './project-statistics.service';
import { ReportGenerationService } from './report-generation.service';
import { AdvancedAnalyticsService } from './advanced-analytics.service';
import { ProjectRbacGuard } from './guards/project-rbac.guard';

@Module({
  imports: [GitlabModule, PrismaModule],
  controllers: [ProjectsController],
  providers: [
    ProjectsService,
    ProjectQueryService,
    ProjectMemberService,
    PermissionAuditService,
    ProjectConfigurationService,
    ConfigurationTemplateService,
    ConfigurationMigrationService,
    ProjectStatisticsService,
    ReportGenerationService,
    AdvancedAnalyticsService,
    ProjectRbacGuard,
  ],
  exports: [
    ProjectsService,
    ProjectQueryService,
    ProjectMemberService,
    ProjectStatisticsService,
    ReportGenerationService,
    AdvancedAnalyticsService,
  ],
})
export class ProjectsModule {}
