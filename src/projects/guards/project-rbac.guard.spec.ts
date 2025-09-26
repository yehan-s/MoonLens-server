import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ProjectRbacGuard } from './project-rbac.guard';

class MemoryCache {
  store = new Map<string, any>();
  async get<T>(k: string) { return this.store.get(k) as T | undefined }
  async set(k: string, v: any) { this.store.set(k, v) }
  async del(k: string) { this.store.delete(k) }
}

describe('ProjectRbacGuard', () => {
  let guard: ProjectRbacGuard;
  const prisma = {
    projectMember: { findFirst: jest.fn() },
  } as any;
  const cache = new MemoryCache();
  const reflector = new Reflector();

  function createContext(userId: string, projectId: string) {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user: { userId }, params: { id: projectId } }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as any;
  }

  beforeEach(async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['project:read']);
    const module = await Test.createTestingModule({
      providers: [
        { provide: Reflector, useValue: reflector },
        { provide: (require('../../common/services/prisma.service') as any).PrismaService, useValue: prisma },
        { provide: 'CACHE_MANAGER', useValue: cache },
        ProjectRbacGuard,
      ],
    }).compile();
    guard = module.get(ProjectRbacGuard);
    cache.store.clear();
    jest.clearAllMocks();
  });

  it('只读权限：accessLevel >= 20 允许访问', async () => {
    prisma.projectMember.findFirst.mockResolvedValue({ accessLevel: 20 });
    const ok = await guard.canActivate(createContext('u1', 'p1'));
    expect(ok).toBe(true);
  });

  it('写权限：当需要写权限时 accessLevel < 30 拒绝', async () => {
    // 切换为写权限
    (reflector.getAllAndOverride as any).mockReturnValue(['project:members:update']);
    prisma.projectMember.findFirst.mockResolvedValue({ accessLevel: 20 });
    const ok = await guard.canActivate(createContext('u1', 'p1'));
    expect(ok).toBe(false);
  });
});

