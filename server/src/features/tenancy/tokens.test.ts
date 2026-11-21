import { describe, expect, it } from 'vitest';
import { createInvitationToken, hashInvitationToken, maskInvitationEmail } from './tokens';

describe('invitation tokens', () => {
  it('generates independent 32-byte URL-safe tokens and stores their SHA-256 digests', () => {
    const first = createInvitationToken();
    const second = createInvitationToken();
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(first);
    expect(hashInvitationToken(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashInvitationToken(first)).toBe(hashInvitationToken(first));
    expect(hashInvitationToken(first)).not.toBe(hashInvitationToken(second));
  });

  it('masks the local part without disclosing short mailbox names', () => {
    expect(maskInvitationEmail('abcd@example.test')).toBe('ab**@example.test');
    expect(maskInvitationEmail('a@example.test')).toBe('*@example.test');
    expect(maskInvitationEmail('ab@example.test')).toBe('**@example.test');
  });
});
