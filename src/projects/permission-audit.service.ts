import { Injectable } from '@nestjs/common';
import { AuditLogService } from '../common/services/audit-log.service';

/**
 * 项目权限审计服务
 * 记录权限变更、成员操作、安全事件
 */
@Injectable()
export class PermissionAuditService {
  constructor(private readonly audit: AuditLogService) {}

  logRoleChange(projectId: string, actorId: string | null, member: { gitlabUserId: string }, before?: any, after?: any) {
    this.audit.security('project.member.role.change', { id: actorId }, { projectId, gitlabUserId: member.gitlabUserId }, { before, after });
  }

  logMemberInvite(projectId: string, actorId: string | null, payload: any) {
    this.audit.security('project.member.invite', { id: actorId }, { projectId }, payload);
  }

  logMemberRemove(projectId: string, actorId: string | null, gitlabUserId: string) {
    this.audit.security('project.member.remove', { id: actorId }, { projectId, gitlabUserId });
  }
}

