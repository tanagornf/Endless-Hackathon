import { createHash, randomBytes } from 'node:crypto';

export function createInvitationToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashInvitationToken(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function maskInvitationEmail(email: string): string {
  const at = email.lastIndexOf('@');
  const local = Array.from(email.slice(0, at));
  const visible = Math.min(2, Math.max(0, local.length - 2));
  return local.slice(0, visible).join('') + '*'.repeat(local.length - visible) + email.slice(at);
}
