import { Injectable } from '@nestjs/common'
import { GitlabApiClientService } from './gitlab-api-client.service'
import { GitlabCacheService } from '../cache/gitlab.cache'

@Injectable()
export class MergeRequestService {
  constructor(private readonly api: GitlabApiClientService, private readonly cache: GitlabCacheService) {}

  async list(projectId: string | number, params: { state?: 'opened' | 'closed' | 'merged'; per_page?: number; page?: number } = {}) {
    const key = this.cache.keyFor('project', projectId, `mr:list:${JSON.stringify(params)}`)
    return this.cache.wrap(key, 30, () => this.api.listMergeRequests(projectId, params))
  }

  async get(projectId: string | number, mergeRequestIid: number | string) {
    const key = this.cache.keyFor('project', projectId, `mr:get:${mergeRequestIid}`)
    return this.cache.wrap(key, 30, () => this.api.getMergeRequest(projectId, mergeRequestIid))
  }

  async diffs(projectId: string | number, mergeRequestIid: number | string) {
    const key = this.cache.keyFor('project', projectId, `mr:diffs:${mergeRequestIid}`)
    return this.cache.wrap(key, 30, () => this.api.listMergeRequestDiffs(projectId, mergeRequestIid))
  }
}
