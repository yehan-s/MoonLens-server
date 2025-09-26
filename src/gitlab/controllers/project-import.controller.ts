import { Body, Controller, ForbiddenException, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { PrismaService } from '../../common/services/prisma.service';
import { ProjectSyncService } from '../services/project-sync.service';

class ImportProjectsDto {
  projectIds: Array<string | number>;
}

@ApiTags('GitLab 项目导入')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('gitlab/connections/:id')
export class ProjectImportController {
  constructor(private readonly prisma: PrismaService, private readonly sync: ProjectSyncService) {}

  @Post('import-projects')
  @ApiOperation({ summary: '按项目ID列表导入项目' })
  async importProjects(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: ImportProjectsDto) {
    const row = await this.prisma.gitlabConnection.findUnique({ where: { id } });
    if (!row) throw new ForbiddenException('连接不存在');
    if (row.userId && row.userId !== user.userId) throw new ForbiddenException();
    const res = await this.sync.importProjects(id, dto.projectIds || []);
    return { ok: true, ...res };
  }
}

