import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({
      log:
        process.env.NODE_ENV === 'development'
          ? ['query', 'info', 'warn', 'error']
          : ['error'],
    });
  }

  async onModuleInit() {
    // 启动时尝试连接数据库（带重试），失败不阻塞应用启动
    const maxRetries = 5;
    const delayMs = 1000;
    for (let i = 1; i <= maxRetries; i++) {
      try {
        await this.$connect();
        return;
      } catch (err) {
        if (i === maxRetries) {
          console.warn(
            `Prisma 连接失败（已重试 ${maxRetries} 次），将延后至首次查询时再连接。`,
            err,
          );
          return; // 不抛出，让应用继续启动，后续按需连接
        }
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  // 清理数据库（用于测试）
  async cleanDatabase() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('cleanDatabase 不允许在生产环境中执行');
    }

    const models = Reflect.ownKeys(this).filter(
      (key) => typeof key === 'string' && key[0] !== '_' && key[0] !== '$',
    ) as string[];

    for (const model of models) {
      try {
        const anyThis = this as any;
        if (anyThis[model]?.deleteMany) {
          await anyThis[model].deleteMany();
        }
      } catch (error) {
        console.log(`清理 ${String(model)} 失败:`, error);
      }
    }
  }

  // 事务处理辅助方法
  async executeTransaction<T>(
    fn: (prisma: PrismaClient) => Promise<T>,
  ): Promise<T> {
    return this.$transaction(fn);
  }
}
