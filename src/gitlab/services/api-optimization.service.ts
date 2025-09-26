import { Injectable } from '@nestjs/common';

type Key = string;

@Injectable()
export class ApiOptimizationService {
  private readonly maxConcurrency = Number(process.env.GITLAB_API_MAX_CONCURRENCY || 6);
  private running = 0;
  private queue: Array<() => void> = [];
  private inflight = new Map<Key, Promise<any>>();

  private acquire(): Promise<void> {
    if (this.running < this.maxConcurrency) {
      this.running++;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.queue.push(resolve));
  }

  private release() {
    const next = this.queue.shift();
    if (next) next();
    else this.running--;
  }

  async limit<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  async dedup<T>(key: Key, fn: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key);
    if (existing) return existing as Promise<T>;
    const p = fn().finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  async wrapFetch<T>(url: string, init: any, exec: () => Promise<T>): Promise<T> {
    const method = (init?.method || 'GET').toString().toUpperCase();
    const key = `${method} ${url}`;
    return this.dedup(key, () => this.limit(exec));
  }
}

