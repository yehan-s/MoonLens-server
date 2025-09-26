import { Injectable } from '@nestjs/common';
import { ProjectConfigurationService } from '../gitlab/services/project-configuration.service';

/**
 * 配置模板与继承服务
 * 说明：复用现有 ProjectConfigurationService 的结构与历史机制
 */
@Injectable()
export class ConfigurationTemplateService {
  constructor(private readonly configSvc: ProjectConfigurationService) {}

  async applyTemplate(projectId: string, template: Partial<Record<string, any>>, actorId?: string) {
    // 从现有配置读取并合并模板
    return await this.configSvc.patch(projectId, template, actorId);
  }

  async setInheritance(projectId: string, baseConfig: Partial<Record<string, any>>, actorId?: string) {
    // 简化：直接合并“父”配置作为 patch
    return await this.configSvc.patch(projectId, baseConfig, actorId);
  }

  async listBuiltinTemplates() {
    // 示例模板集合；后续可改为从存储加载
    return [
      {
        name: 'default',
        config: {
          review: { auto: true, aiModel: 'gpt-4', rules: [] },
          sync: { enabled: true, members: true, branches: true },
        },
      },
      {
        name: 'strict-security',
        config: {
          review: { auto: true, aiModel: 'gpt-4', rules: [{ id: 'sec-*' }] },
        },
      },
    ];
  }
}

