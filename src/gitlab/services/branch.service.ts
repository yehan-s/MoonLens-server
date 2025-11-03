import { Injectable } from '@nestjs/common'
import { GitlabApiClientService } from './gitlab-api-client.service'

@Injectable()
export class BranchService {
  constructor(private readonly api: GitlabApiClientService) {}

  async list(projectId: string | number, params: { per_page?: number; page?: number } = {}) {
    const { per_page, page } = params
    return this.api.listProjectBranches(projectId, { perPage: per_page, page })
  }

  async create(projectId: string | number, branch: string, ref: string) {
    // 安全约束：仅允许包含 "yehan" 关键词的分支
    if (!branch || branch.toLowerCase().indexOf('yehan') === -1) {
      throw new Error('branch name must include keyword "yehan"')
    }
    return this.api.createBranch(projectId, branch, ref)
  }
}
