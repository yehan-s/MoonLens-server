import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

function getAesKey(): Buffer {
  const keyB64 = process.env.GITLAB_ENC_KEY;
  if (!keyB64) {
    throw new Error('缺少 GITLAB_ENC_KEY 环境变量（Base64-encoded 32 bytes）');
  }
  const key = Buffer.from(keyB64, 'base64');
  if (key.length !== 32) {
    throw new Error('GITLAB_ENC_KEY 长度错误，需为 32 字节（Base64 编码）');
  }
  return key;
}

export function encryptSecret(plain: string): string {
  const key = getAesKey();
  const iv = randomBytes(12); // GCM 建议 12 字节 IV
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // 存储格式：v1:gcm:<ivB64>:<tagB64>:<ctB64>
  return `v1:gcm:${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
}

export function decryptSecret(packed: string): string {
  const [v, mode, ivB64, tagB64, ctB64] = packed.split(':');
  if (v !== 'v1' || mode !== 'gcm' || !ivB64 || !tagB64 || !ctB64) {
    throw new Error('密文格式不正确');
  }
  const key = getAesKey();
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const ct = Buffer.from(ctB64, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
  return plain.toString('utf8');
}

