import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AnalysisResultService } from '../services/analysis-result.service';
import { QueueService } from '../modules/queue/queue.service';

@ApiTags('analysis')
@Controller('api/analysis')
@UseGuards(JwtAuthGuard)
export class AnalysisController {
  constructor(
    private readonly analysisResultService: AnalysisResultService,
    private readonly queueService: QueueService,
  ) {}

  @Post('trigger')
  @ApiOperation({ summary: '触发代码分析' })
  @ApiResponse({ status: HttpStatus.OK, description: '分析任务已创建' })
  async triggerAnalysis(@Body() body: { projectId: string; options?: any }) {
    const job = await this.queueService.addAnalysisTask({
      projectId: body.projectId,
      ...body.options,
      timestamp: new Date().toISOString(),
    });

    return {
      success: true,
      taskId: job.id,
      message: '分析任务已创建',
    };
  }

  @Get('results')
  @ApiOperation({ summary: '获取分析结果列表' })
  async getResults(@Query() query: any) {
    return this.analysisResultService.queryAnalysisResults(
      {
        projectId: query.projectId,
        mergeRequestIid: query.mergeRequestIid ? parseInt(query.mergeRequestIid) : undefined,
        fromDate: query.fromDate ? new Date(query.fromDate) : undefined,
        toDate: query.toDate ? new Date(query.toDate) : undefined,
      },
      {
        page: query.page ? parseInt(query.page) : 1,
        limit: query.limit ? parseInt(query.limit) : 20,
        orderBy: query.orderBy || 'createdAt',
        order: query.order || 'desc',
      },
    );
  }

  @Get('results/:id')
  @ApiOperation({ summary: '获取单个分析结果' })
  async getResult(@Param('id') id: string) {
    return this.analysisResultService.getAnalysisResult(id);
  }

  @Get('statistics/:projectId')
  @ApiOperation({ summary: '获取项目统计信息' })
  async getStatistics(@Param('projectId') projectId: string) {
    return this.analysisResultService.getProjectStatistics(projectId);
  }

  @Get('trends/:projectId')
  @ApiOperation({ summary: '获取质量趋势' })
  async getTrends(
    @Param('projectId') projectId: string,
    @Query('period') period?: string,
    @Query('limit') limit?: string,
  ) {
    return this.analysisResultService.getQualityTrends(
      projectId,
      period as any || 'day',
      limit ? parseInt(limit) : 30,
    );
  }

  @Get('distribution/severity/:projectId')
  @ApiOperation({ summary: '获取问题严重度分布' })
  async getSeverityDistribution(@Param('projectId') projectId: string) {
    const stats = await this.analysisResultService.getProjectStatistics(projectId);
    return stats.severityDistribution || {};
  }

  @Get('distribution/type/:projectId')
  @ApiOperation({ summary: '获取问题类型分布' })
  async getTypeDistribution(@Param('projectId') projectId: string) {
    const stats = await this.analysisResultService.getProjectStatistics(projectId);
    return stats.typeDistribution || {};
  }

  @Get('export/:id')
  @ApiOperation({ summary: '导出分析报告' })
  async exportReport(@Param('id') id: string, @Query('format') format?: string) {
    // TODO: 实现报告导出功能
    return {
      success: false,
      message: '报告导出功能正在开发中',
    };
  }

  @Get('queue/status')
  @ApiOperation({ summary: '获取队列状态' })
  async getQueueStatus() {
    return this.queueService.getQueueStatus();
  }
}