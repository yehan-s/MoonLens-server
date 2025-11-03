/**
 * 指纹工具：根据文件、行号与建议文本生成稳定的 SHA-256 指纹
 * 目的：用于审查建议去重与在 MR 评论中做幂等标记（例如 [ML-FP:<fp>]）
 */
import crypto from 'crypto';

/**
 * 规范化文本：
 * - 去除所有空白字符
 * - 转小写
 * - 去掉常见无意义标点（可按需扩展）
 */
export function normalizeText(text: string): string {
  if (!text) return '';
  const stripped = text
    .toLowerCase()
    .replace(/[\s\t\r\n]+/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // 零宽字符
    .replace(/[\p{P}\p{S}]/gu, ''); // 标点与符号
  return stripped.slice(0, 2000); // 防止过长
}

export function fingerprint(file: string, line: number | undefined, comment: string): string {
  const ln = line ?? 0;
  const key = `${file || ''}:${ln}:${normalizeText(comment || '')}`;
  return crypto.createHash('sha256').update(key).digest('hex');
}

export default fingerprint;

