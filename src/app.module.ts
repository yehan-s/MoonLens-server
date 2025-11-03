import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { BullModule } from '@nestjs/bull';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { GitlabModule } from './gitlab/gitlab.module';
import { GitHubModule } from './github/github.module';
import { AiModule } from './ai/ai.module';
import { ReviewModule } from './review/review.module';
import { ProjectsModule } from './projects/projects.module';
import { CommonModule } from './common/common.module';
import { RateLimitGuard } from './common/guards/rate-limit.guard';
import { WebhookModule } from './modules/webhook/webhook.module';
import { QueueModule } from './modules/queue/queue.module';
import { ServicesModule } from './services/services.module';
import { AnalysisModule } from './analysis/analysis.module';
import { HealthController } from './health/health.controller';

// 注意：为避免 TS 严格模式下 parseInt 接受 undefined 报错，提供默认值
const REDIS_PORT = parseInt(process.env.REDIS_PORT ?? '6379', 10);

@Module({
  imports: [
    // 配置模块
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // 缓存配置
    CacheModule.register({
      isGlobal: true,
      ttl: 5, // 默认缓存5秒
    }),

    // 任务队列配置
    BullModule.forRoot({
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: REDIS_PORT,
        password: process.env.REDIS_PASSWORD,
      },
    }),

    // 全局限流：每用户每秒 10 次（未认证按 IP 计算）
    ThrottlerModule.forRoot([
      {
        ttl: 1000, // 1秒窗口
        limit: 10, // 每窗口10次
      },
    ]),

    // 定时任务模块
    ScheduleModule.forRoot(),

    // 功能模块
    PrismaModule, // 数据库服务模块
    CommonModule, // 通用功能模块
    AuthModule,
    UsersModule,
    GitlabModule,
    GitHubModule,
    AiModule,
    ReviewModule,
    ProjectsModule,
    WebhookModule, // Webhook 处理模块
    QueueModule, // 队列处理模块
    ServicesModule, // 服务模块
    AnalysisModule, // 分析模块
  ],
  controllers: [AppController, HealthController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },
  ],
})
export class AppModule {}
