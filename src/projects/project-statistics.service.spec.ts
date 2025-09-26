import { Test } from '@nestjs/testing';
import { ProjectStatisticsService } from './project-statistics.service';

class MemoryCache {
  store = new Map<string, any>();
  async get<T>(k: string) { return this.store.get(k) as T | undefined }
  async set(k: string, v: any) { this.store.set(k, v) }
  async del(k: string) { this.store.delete(k) }
}

describe('ProjectStatisticsService', () => {
  let service: ProjectStatisticsService;
  const prisma = {
    review: { count: jest.fn() },
  } as any;
  const cache = new MemoryCache();

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ProjectStatisticsService,
        { provide: (require('../common/services/prisma.service') as any).PrismaService, useValue: prisma },
        { provide: 'CACHE_MANAGER', useValue: cache },
      ],
    }).compile();
    service = module.get(ProjectStatisticsService);
    cache.store.clear();
    jest.clearAllMocks();
  });

  it('应当返回统计概览并缓存结果', async () => {
    prisma.review.count
      .mockResolvedValueOnce(10) // total
      .mockResolvedValueOnce(7)  // success
      .mockResolvedValueOnce(3); // failed

    const from = new Date('2025-01-01');
    const to = new Date('2025-01-07');
    const res1 = await service.getProjectStatistics('p1', { from, to });
    expect(res1.overview.totalReviews).toBe(10);
    expect(res1.overview.successRate).toBeCloseTo(0.7);

    // 第二次命中缓存，不再调用数据库
    prisma.review.count.mockClear();
    const res2 = await service.getProjectStatistics('p1', { from, to });
    expect(res2.overview.totalReviews).toBe(10);
    expect(prisma.review.count).not.toHaveBeenCalled();
  });
});

