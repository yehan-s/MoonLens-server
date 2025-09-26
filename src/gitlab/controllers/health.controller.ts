import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { GitlabHealthCheckService } from '../services/health-check.service';

@ApiTags('GitLab 健康检查')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER, UserRole.ADMIN)
@Controller('gitlab/health')
export class GitlabHealthController {
  constructor(private readonly health: GitlabHealthCheckService) {}

  @Get()
  @ApiOperation({ summary: 'GitLab 集成健康汇总' })
  async overall() {
    return await this.health.overall();
  }

  @Get('connections/:id')
  @ApiOperation({ summary: '检测指定连接的连通性' })
  async check(@Param('id') id: string) {
    return await this.health.checkConnection(id);
  }
}

