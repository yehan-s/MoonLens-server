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

  /**
   * 幂等发布评论：
   * - 为每条评论附加 [ML-FP:<sha256>] 标记
   * - 若 MR 已存在同指纹评论，则跳过
   */
  async postCommentsIdempotent(
    projectId: string | number,
    mrIid: string | number,
    comments: Array<ReviewComment & { fingerprint?: string; file?: string; line?: number }>,
  ) {
    const fpSet = new Set<string>();
    const discussions = await this.api.listMrDiscussions(projectId, mrIid);
    const fpRegex = /\[ML-FP:([0-9a-f]{64})\]/i;
    for (const d of discussions || []) {
      for (const n of d?.notes || []) {
        const m = typeof n?.body === 'string' ? n.body.match(fpRegex) : null;
        if (m && m[1]) fpSet.add(m[1]);
      }
    }

    let posted = 0;
    for (const c of comments) {
      // 兼容：若未传 fingerprint，则从 body 文本计算（弱化幂等效果）
      const fp = c.fingerprint || this.weakFingerprintFromBody(c.body);
      if (fp && fpSet.has(fp)) continue;
      const body = fp ? `${c.body}\n\n[ML-FP:${fp}]` : c.body;
      const position = c.position || (await this.buildPositionOptional(projectId, mrIid, c.file, c.line));
      if (position) {
        await this.api.addMrDiscussion(projectId, mrIid, { body, position });
      } else {
        await this.api.addMrNote(projectId, mrIid, { body });
      }
      if (fp) fpSet.add(fp);
      posted++;
    }
    return { posted };
  }

  /**
   * 尝试构造 GitLab 行内评论 position（失败则返回 undefined）
   */
  private async buildPositionOptional(projectId: string | number, mrIid: string | number, file?: string, line?: number) {
    try {
      if (!file || !line) return undefined;
      const mr: any = await this.api.getMergeRequest(projectId, mrIid);
      const refs = mr?.diff_refs || { base_sha: mr?.diff_base_sha, head_sha: mr?.sha, start_sha: mr?.start_sha };
      if (!refs?.base_sha || !refs?.head_sha || !refs?.start_sha) return undefined;
      return {
        position_type: 'text',
        base_sha: refs.base_sha,
        head_sha: refs.head_sha,
        start_sha: refs.start_sha,
        new_path: file,
        new_line: line,
      };
    } catch {
      return undefined;
    }
  }

  private weakFingerprintFromBody(body: string): string | undefined {
    try {
      const text = (body || '').toLowerCase().replace(/\s+/g, '').slice(0, 512);
      // 简易 hash（非安全），用于兜底幂等
      let h = 0;
      for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
      return ('00000000' + h.toString(16)).slice(-8).padEnd(64, '0');
    } catch {
      return undefined;
    }
  }

  async applyLabels(projectId: string | number, mrIid: string | number, labels: string[]) {
    const body = { labels: labels.join(',') };
    const res = await this.api.updateMr(projectId, mrIid, body);
    return { ok: true, labels: res?.labels ?? labels };
  }
}
