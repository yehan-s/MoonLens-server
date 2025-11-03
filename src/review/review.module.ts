import { Module, forwardRef } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ReviewController } from './review.controller';
import { ReviewsController } from './reviews.controller';
import { ReviewService } from './review.service';
import { AIReviewService } from './services/ai-review.service';
import { CommentFormatterService } from './services/comment-formatter.service';
import { FileCacheService } from './services/file-cache.service';
import { PrismaModule } from '../prisma/prisma.module';
import { QueueModule } from '../modules/queue/queue.module';
import { GitlabModule } from '../gitlab/gitlab.module';

@Module({
  imports: [PrismaModule, forwardRef(() => QueueModule), GitlabModule, HttpModule],
  controllers: [ReviewController, ReviewsController],
  providers: [ReviewService, AIReviewService, CommentFormatterService, FileCacheService],
  exports: [ReviewService, AIReviewService, FileCacheService],
})
export class ReviewModule {}
