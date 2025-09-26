import { Test } from '@nestjs/testing';
import { ProjectQueryService } from './project-query.service';

describe('ProjectQueryService', () => {
  let service: ProjectQueryService;
  const prisma = {
    project: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn((args: any[]) => Promise.all(args)),
  } as any;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ProjectQueryService,
        { provide: (require('../common/services/prisma.service') as any).PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(ProjectQueryService);
    jest.clearAllMocks();
  });

  it('应当按分页与搜索返回项目列表', async () => {
    prisma.project.count.mockResolvedValue(3);
    prisma.project.findMany.mockResolvedValue([
      { id: '1', name: 'alpha', updatedAt: new Date() },
      { id: '2', name: 'beta', updatedAt: new Date() },
    ]);

    const res = await service.listProjects({ page: 1, limit: 2, search: 'a' });
    expect(prisma.project.count).toHaveBeenCalledWith({
      where: {
        OR: [
          { name: { contains: 'a' } },
          { description: { contains: 'a' } },
          { gitlabProjectId: { contains: 'a' } },
        ],
      },
    });
    expect(prisma.project.findMany).toHaveBeenCalled();
    expect(res.pagination.total).toBe(3);
    expect(res.projects).toHaveLength(2);
  });

  it('应当支持状态过滤', async () => {
    prisma.project.count.mockResolvedValue(0);
    prisma.project.findMany.mockResolvedValue([]);
    await service.listProjects({ status: 'archived' });
    expect(prisma.project.count).toHaveBeenCalledWith({ where: { isActive: false } });
  });
});

