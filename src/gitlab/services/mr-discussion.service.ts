import { Injectable } from '@nestjs/common';
import { GitlabApiClientService } from './gitlab-api-client.service';

@Injectable()
export class MrDiscussionService {
  constructor(private readonly api: GitlabApiClientService) {}

  async list(projectId: string | number, mrIid: string | number) {
    return this.api.listMrDiscussions(projectId, mrIid);
  }

  async addNote(projectId: string | number, mrIid: string | number, text: string, position?: any) {
    return this.api.addMrNote(projectId, mrIid, { body: text, position });
  }

  async reply(projectId: string | number, mrIid: string | number, discussionId: string, text: string) {
    return this.api.replyMrDiscussion(projectId, mrIid, discussionId, { body: text });
  }
}

