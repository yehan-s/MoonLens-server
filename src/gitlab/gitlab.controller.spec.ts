import { Test } from '@nestjs/testing'
import { GitlabController } from './gitlab.controller'
import { GitlabApiClientService } from './services/gitlab-api-client.service'
import { BranchService } from './services/branch.service'
import { MergeRequestService } from './services/merge-request.service'
import { RepositoryService } from './services/repository.service'
import { GitlabCacheService } from './cache/gitlab.cache'

describe('GitlabController', () => {
  it('listProjects returns data', async () => {
    const module = await Test.createTestingModule({
      controllers: [GitlabController],
      providers: [
        { provide: GitlabApiClientService, useValue: { listProjects: jest.fn().mockResolvedValue([{ id: 1 }]) } },
        { provide: BranchService, useValue: {} },
        { provide: MergeRequestService, useValue: {} },
        { provide: RepositoryService, useValue: {} },
        { provide: GitlabCacheService, useValue: { keyFor: jest.fn(()=>'k'), wrap: (_k: string,_ttl: number, fn: any) => fn() } },
      ],
    }).compile()
    const ctrl = module.get(GitlabController)
    const res = await ctrl.listProjects('', undefined as any, undefined as any)
    expect(res[0].id).toBe(1)
  })
})

