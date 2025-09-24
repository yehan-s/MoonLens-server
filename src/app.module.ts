import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { BullModule } from '@nestjs/bull';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { GitlabModule } from './gitlab/gitlab.module';
import { AiModule } from './ai/ai.module';
import { ReviewModule } from './review/review.module';
import { ProjectsModule } from './projects/projects.module';
import { CommonModule } from './common/common.module';

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
    
    // 功能模块
    CommonModule, // 包含 PrismaService，必须先加载
    AuthModule,
    UsersModule,
    GitlabModule,
    AiModule,
    ReviewModule,
    ProjectsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
