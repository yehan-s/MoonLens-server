import { Injectable } from '@nestjs/common';
import { GitlabApiClientService } from './gitlab-api-client.service';

type ReviewComment = { body: string; position?: any };

@Injectable()
export class ReviewSyncService {
  constructor(private readonly api: GitlabApiClientService) {}

  async postComments(projectId: string | number, mrIid: string | number, comments: ReviewComment[]) {
    for (const c of comments) {
      await this.api.addMrNote(projectId, mrIid, { body: c.body, position: c.position });
    }
    return { posted: comments.length };
  }

  async applyLabels(projectId: string | number, mrIid: string | number, labels: string[]) {
    const body = { labels: labels.join(',') };
    const res = await this.api.updateMr(projectId, mrIid, body);
    return { ok: true, labels: res?.labels ?? labels };
  }
}

