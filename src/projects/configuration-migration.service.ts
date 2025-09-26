import { BadRequestException, Injectable } from '@nestjs/common';
import { ProjectConfigurationService } from '../gitlab/services/project-configuration.service';

/**
 * 配置验证与迁移服务
 * - 轻量校验：字段类型与允许键集合
 * - 迁移：从旧版结构迁至新版（示例实现）
 */
@Injectable()
export class ConfigurationMigrationService {
  private readonly allowedKeys = new Set(['sync', 'review', 'association', '_history']);

  constructor(private readonly configSvc: ProjectConfigurationService) {}

  validateSchema(config: Record<string, any>) {
    if (typeof config !== 'object' || config === null) {
      throw new BadRequestException('config must be an object');
    }
    for (const key of Object.keys(config)) {
      if (!this.allowedKeys.has(key)) {
        throw new BadRequestException(`unknown config key: ${key}`);
      }
    }
    // 可添加更细粒度校验
    return true;
  }

  async migrate(projectId: string, transform: (oldCfg: any) => any, actorId?: string) {
    const current = await this.configSvc.get(projectId);
    const next = transform(current);
    this.validateSchema(next);
    return await this.configSvc.set(projectId, next, actorId);
  }

  async diff(projectId: string, nextConfig: any) {
    const current = await this.configSvc.get(projectId);
    return { before: current, after: nextConfig };
  }
}

