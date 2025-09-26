import { Injectable } from '@nestjs/common'
import { GitlabApiClientService } from './gitlab-api-client.service'

@Injectable()
export class RepositoryService {
  constructor(private readonly api: GitlabApiClientService) {}

  async tree(projectId: string | number, params: { path?: string; ref?: string; recursive?: boolean } = {}) {
    return this.api.getRepositoryTree(projectId, params)
  }

  async fileRaw(projectId: string | number, filePath: string, ref: string) {
    return this.api.getFileRaw(projectId, filePath, ref)
  }
}

