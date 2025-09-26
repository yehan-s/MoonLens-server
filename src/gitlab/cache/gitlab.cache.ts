import { Injectable } from '@nestjs/common'
import type { Cache } from 'cache-manager'
import { Inject } from '@nestjs/common'
import { CACHE_MANAGER } from '@nestjs/cache-manager'

@Injectable()
export class GitlabCacheService {
  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  async wrap<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
    const cached = await this.cache.get<T>(key)
    if (cached !== undefined && cached !== null) return cached
    const val = await fn()
    await this.cache.set(key, val, ttlSeconds * 1000)
    return val
  }

  async del(key: string) {
    await this.cache.del(key)
  }

  keyFor(type: 'projects' | 'project' | 'branches' | 'tree', id?: string | number, extra?: string) {
    return ['gitlab', type, id, extra].filter(Boolean).join(':')
  }
}
