import { Test } from '@nestjs/testing';
import { ProjectMemberService } from './project-member.service';

describe('ProjectMemberService', () => {
  let service: ProjectMemberService;
  const prisma = {
    project: { findUnique: jest.fn() },
    projectMember: {
      upsert: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      update: jest.fn(),
    },
  } as any;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ProjectMemberService,
        { provide: (require('../common/services/prisma.service') as any).PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(ProjectMemberService);
    jest.clearAllMocks();
    prisma.project.findUnique.mockResolvedValue({ id: 'pj1' });
  });

  it('list: 返回成员列表', async () => {
    prisma.projectMember.findMany.mockResolvedValue([{ id: 'm1' }]);
    const res = await service.list('pj1');
    expect(res.members).toHaveLength(1);
  });

  it('invite: 未提供 gitlabUserId 时创建邀请记录', async () => {
    const res = await service.invite('pj1', [{ email: 'a@b.com' }, { username: 'foo' }]);
    expect(prisma.projectMember.upsert).toHaveBeenCalled();
    expect(res.invited).toBe(2);
  });

  it('add: 提供 gitlabUserId 时创建或更新活跃成员', async () => {
    const res = await service.add('pj1', [{ gitlabUserId: '123', email: 'a@b.com' }]);
    expect(prisma.projectMember.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId_gitlabUserId: { projectId: 'pj1', gitlabUserId: '123' } } }),
    );
    expect(res.added).toBe(1);
  });

  it('remove: 按 gitlabUserId 删除成员', async () => {
    await service.remove('pj1', '123');
    expect(prisma.projectMember.delete).toHaveBeenCalled();
  });
});

