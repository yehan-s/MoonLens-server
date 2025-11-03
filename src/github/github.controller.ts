import { Controller, Get, Post, Param, Query, Headers, UseGuards, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GitHubService } from './github.service';

@ApiTags('GitHub')
@Controller('github')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class GitHubController {
  constructor(private readonly githubService: GitHubService) {}

  @Get('user/repos')
  @ApiOperation({ summary: '获取用户仓库列表' })
  async getUserRepos(
    @Headers('github-token') githubToken?: string,
    @Query('page') page?: number,
    @Query('per_page') perPage?: number,
    @Query('q') q?: string,
  ) {
    return this.githubService.getUserRepos(
      { page, per_page: perPage, q },
      githubToken,
    );
  }

  @Get('repos/:owner/:repo/pulls')
  @ApiOperation({ summary: '获取仓库的Pull Requests' })
  async getPullRequests(
    @Param('owner') owner: string,
    @Param('repo') repo: string,
    @Headers('github-token') githubToken?: string,
    @Query('state') state?: 'open' | 'closed' | 'all',
    @Query('page') page?: number,
    @Query('per_page') perPage?: number,
  ) {
    return this.githubService.getPullRequests(
      owner,
      repo,
      { state, page, per_page: perPage },
      githubToken,
    );
  }

  @Get('repos/:owner/:repo/pulls/:pull_number')
  @ApiOperation({ summary: '获取Pull Request详情' })
  async getPullRequest(
    @Param('owner') owner: string,
    @Param('repo') repo: string,
    @Param('pull_number') pullNumber: number,
    @Headers('github-token') githubToken?: string,
  ) {
    return this.githubService.getPullRequest(
      owner,
      repo,
      pullNumber,
      githubToken,
    );
  }

  @Get('repos/:owner/:repo/pulls/:pull_number/files')
  @ApiOperation({ summary: '获取Pull Request的文件变更' })
  async getPullRequestFiles(
    @Param('owner') owner: string,
    @Param('repo') repo: string,
    @Param('pull_number') pullNumber: number,
    @Headers('github-token') githubToken?: string,
  ) {
    return this.githubService.getPullRequestFiles(
      owner,
      repo,
      pullNumber,
      githubToken,
    );
  }

  @Get('repos/:owner/:repo/pulls/:pull_number/diff')
  @ApiOperation({ summary: '获取Pull Request的diff' })
  async getPullRequestDiff(
    @Param('owner') owner: string,
    @Param('repo') repo: string,
    @Param('pull_number') pullNumber: number,
    @Headers('github-token') githubToken?: string,
  ) {
    return this.githubService.getPullRequestDiff(
      owner,
      repo,
      pullNumber,
      githubToken,
    );
  }

  @Get('repos/:owner/:repo/contents/*')
  @ApiOperation({ summary: '获取文件内容' })
  async getFileContent(
    @Param('owner') owner: string,
    @Param('repo') repo: string,
    @Param('0') path: string,  // 捕获通配符路径
    @Query('ref') ref?: string,
    @Headers('github-token') githubToken?: string,
  ) {
    return this.githubService.getFileContent(
      owner,
      repo,
      path,
      ref,
      githubToken,
    );
  }


  @Get('mr-stats')
  @ApiOperation({ summary: '获取所有仓库的PR统计（聚合）' })
  async getMRStats(@Headers('github-token') githubToken?: string) {
    return this.githubService.getMRStats(githubToken);
  }

  @Post('repos/:owner/:repo/issues/:issue_number/comments')
  @ApiOperation({ summary: '在PR上添加评论（CodeRabbit 风格）' })
  async createPRComment(
    @Param('owner') owner: string,
    @Param('repo') repo: string,
    @Param('issue_number') issueNumber: number,
    @Body('body') body: string,
    @Headers('github-token') githubToken?: string,
  ) {
    return this.githubService.createPRComment(
      owner,
      repo,
      issueNumber,
      body,
      githubToken,
    );
  }

  @Post('repos/:owner/:repo/pulls/:pull_number/reviews')
  @ApiOperation({ summary: '创建PR Review（支持Suggested Changes）' })
  async createPRReview(
    @Param('owner') owner: string,
    @Param('repo') repo: string,
    @Param('pull_number') pullNumber: number,
    @Body('body') body: string,
    @Body('comments') comments: Array<{
      path: string;
      line: number;
      body: string;
    }>,
    @Headers('github-token') githubToken?: string,
  ) {
    // 获取PR详情以获取最新的commit SHA
    const pr = await this.githubService.getPullRequest(
      owner,
      repo,
      pullNumber,
      githubToken,
    );

    const commitId = pr.head.sha;

    return this.githubService.createPullRequestReviewWithComments(
      owner,
      repo,
      pullNumber,
      body,
      comments,
      commitId,
      githubToken,
    );
  }

  // ---- 一键清理评论（Issue Comments + Review Comments）----
  @Post('repos/:owner/:repo/pulls/:pull_number/comments/cleanup')
  @ApiOperation({ summary: '清理 PR 评论（默认仅 MoonLens 评论；可选全部）' })
  async cleanupComments(
    @Param('owner') owner: string,
    @Param('repo') repo: string,
    @Param('pull_number') pullNumber: number,
    @Query('scope') scope: 'moonlens' | 'all' = 'moonlens',
    @Headers('github-token') githubToken?: string,
  ) {
    const isML = (s: any) => {
      const b = String(s || '')
      return /MoonLens AI/i.test(b) || /\[ML-FP:[0-9a-f]{8,64}\]/i.test(b) || /🤖\s*MoonLens/i.test(b)
    }

    let deleted = 0, skipped = 0
    // Issue comments
    const issueComments = await this.githubService.listIssueComments(owner, repo, pullNumber, githubToken).catch(() => [])
    for (const c of issueComments || []) {
      if (scope === 'all' || isML(c?.body)) {
        try { await this.githubService.deleteIssueComment(owner, repo, c.id, githubToken); deleted++ } catch { skipped++ }
      }
    }
    // Review comments
    const reviewComments = await this.githubService.listReviewComments(owner, repo, pullNumber, githubToken).catch(() => [])
    for (const c of reviewComments || []) {
      if (scope === 'all' || isML(c?.body)) {
        try { await this.githubService.deleteReviewComment(owner, repo, c.id, githubToken); deleted++ } catch { skipped++ }
      }
    }
    const total = (issueComments?.length || 0) + (reviewComments?.length || 0)
    return { deleted, total, skipped, scope }
  }
}