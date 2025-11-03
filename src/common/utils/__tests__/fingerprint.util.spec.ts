import { fingerprint, normalizeText } from '../fingerprint.util';

describe('fingerprint.util', () => {
  it('normalizeText removes whitespace/symbols and lowercases', () => {
    expect(normalizeText(' A-b\nC ')).toBe('abc');
  });

  it('fingerprint equal for semantically same suggestions', () => {
    const fp1 = fingerprint('src/a.ts', 10, '建议: 请优化 循环!');
    const fp2 = fingerprint('src/a.ts', 10, '  建议：请优化循环  ');
    expect(fp1).toBe(fp2);
  });
});
