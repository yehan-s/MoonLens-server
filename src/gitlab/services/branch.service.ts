import { Injectable } from '@nestjs/common'
import { GitlabApiClientService } from './gitlab-api-client.service'

@Injectable()
export class BranchService {
  constructor(private readonly api: GitlabApiClientService) {}

  async list(projectId: string | number, params: { per_page?: number; page?: number } = {}) {
    const { per_page, page } = params
    return this.api.listProjectBranches(projectId, { perPage: per_page, page })
  }
}

