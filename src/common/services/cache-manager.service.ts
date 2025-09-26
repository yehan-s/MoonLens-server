import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import type { Cache } from 'cache-manager';

/**
 * 多层缓存管理器（统一封装）
 * - 依赖 Nest 全局 CacheModule（可配置为 Redis 或内存）
 * - 提供 get/set/del 包装与命名空间能力
 */
@Injectable()
export class AppCacheManagerService {
  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  async get<T>(key: string): Promise<T | undefined> {
    return (await this.cache.get<T>(key)) ?? undefined;
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    await this.cache.set(key, value as any, ttlMs);
  }

  async del(key: string): Promise<void> {
    await this.cache.del(key);
  }

  async wrap<T>(key: string, supplier: () => Promise<T>, ttlMs = 60_000): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== undefined) return cached;
    const value = await supplier();
    await this.set(key, value, ttlMs);
    return value;
  }
}

