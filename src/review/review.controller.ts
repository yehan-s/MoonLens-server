import { Controller, Get, Post, Body, Param, Query, NotFoundException, UseGuards } from '@nestjs/common';
import { ReviewService } from './review.service';
import { AIReviewService } from './services/ai-review.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Review')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('review')
export class ReviewController {
  constructor(
    private readonly service: ReviewService,
    private readonly aiReviewService: AIReviewService,
  ) {}

  /**
   * 列表查询：GET /api/review?projectId=...&mrIid=...&page=1&pageSize=20
   */
  @Get()
  async list(@Query() q: any) {
    return this.service.list({
      projectId: q.projectId,
      mrIid: q.mrIid ? Number(q.mrIid) : undefined,
      page: q.page ? Number(q.page) : undefined,
      pageSize: q.pageSize ? Number(q.pageSize) : undefined,
      level: q.level,
      category: q.category,
    });
  }

  /**
   * 详情：GET /api/review/:id
   */
  @Get(':id')
  async get(@Param('id') id: string) {
    const res = await this.service.get(id);
    if (!res) throw new NotFoundException('review_not_found');
    return res;
  }

  /**
   * AI 审查 MR：POST /api/review/ai-review
   */
  @Post('ai-review')
  @ApiOperation({ summary: 'AI 审查 Merge Request' })
  async aiReviewMR(
    @Body() body: { projectId: string; mrId: string; diffs?: any[] }
  ) {
    // 如果没有提供 diffs，从 GitLab 获取
    let diffs = body.diffs;
    if (!diffs) {
      // 这里应该调用 GitLab API 获取 diffs
      // 暂时返回空数组
      diffs = [];
    }
    
    return await this.aiReviewService.reviewMergeRequest(
      body.projectId,
      body.mrId,
      diffs
    );
  }

  /**
   * 获取 MR 的审查历史：GET /api/review/mr/:projectId/:mrId
   */
  @Get('mr/:projectId/:mrId')
  @ApiOperation({ summary: '获取 MR 的审查历史' })
  async getMRReviews(
    @Param('projectId') projectId: string,
    @Param('mrId') mrId: string
  ) {
    return this.service.list({
      projectId,
      mrIid: Number(mrId),
    });
  }
}
