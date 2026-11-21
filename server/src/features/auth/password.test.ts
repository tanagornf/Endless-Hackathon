import { describe, expect, it } from 'vitest';
import { hashPassword, needsRehash, validatePassword, verifyPassword } from './password';

describe('passwords', () => {
  it('hashes normalized passwords with independent salts', async () => {
    const first = await hashPassword('รหัสผ่าน１２３４５');
    const second = await hashPassword('รหัสผ่าน１２３４５');

    expect(first).toMatch(/^scrypt\$N=16384,r=8,p=1\$[\w-]{22}\$[\w-]{86}$/);
    expect(first).not.toBe(second);
    expect(await verifyPassword('รหัสผ่าน12345', first)).toBe(true);
    expect(await verifyPassword('another password', first)).toBe(false);
    expect(needsRehash(first)).toBe(false);
  });

  it('rejects malformed or excessive work factors', async () => {
    const stored = await hashPassword('correct-horse-battery');

    expect(needsRehash(stored.replace('16384', '8192'))).toBe(true);
    expect(await verifyPassword('correct-horse-battery', stored.replace('16384', '1073741824'))).toBe(false);
    expect(await verifyPassword('correct-horse-battery', stored + '$extra')).toBe(false);
    expect(await verifyPassword('correct-horse-battery', 'broken')).toBe(false);
  });

  it('uses length alone and counts Unicode characters', () => {
    expect(validatePassword('a'.repeat(7))).toBe('too_short');
    expect(validatePassword('a'.repeat(129))).toBe('too_long');
    expect(validatePassword('12345678')).toBeNull();
    expect(validatePassword('password123')).toBeNull();
    expect(validatePassword('😀'.repeat(7))).toBe('too_short');
    expect(validatePassword('😀'.repeat(8))).toBeNull();
  });
});
