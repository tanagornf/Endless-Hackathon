import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { AppError, config } from '../../core';

const visitorAgeSeconds = 30 * 24 * 60 * 60;
const refreshWindowSeconds = 7 * 24 * 60 * 60;
const visitorIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

function digest(visitorId: string, issuedAt: number): Buffer {
  return createHmac('sha256', config.SESSION_SECRET).update('demo-visitor:' + visitorId + '.' + issuedAt).digest();
}

export function signVisitorToken(visitorId: string, issuedAt = Math.floor(Date.now() / 1000)): string {
  return [Buffer.from(visitorId).toString('base64url'), issuedAt, digest(visitorId, issuedAt).toString('base64url')].join('.');
}

export function verifyVisitorToken(value?: string): { visitorId: string; age: number } | null {
  if (!value || value.length > 160) return null;
  const match = /^([\w-]{48})\.(\d{1,11})\.([\w-]{43})$/u.exec(value);
  if (!match) return null;
  const encoded = Buffer.from(match[1], 'base64url');
  const visitorId = encoded.toString();
  const issuedAt = Number(match[2]);
  const age = Math.floor(Date.now() / 1000) - issuedAt;
  if (encoded.toString('base64url') !== match[1] || !visitorIdPattern.test(visitorId)
    || String(issuedAt) !== match[2] || age < 0 || age > visitorAgeSeconds) return null;
  const signature = Buffer.from(match[3], 'base64url');
  if (signature.toString('base64url') !== match[3] || !timingSafeEqual(signature, digest(visitorId, issuedAt))) return null;
  return { visitorId, age };
}

export function visitorSession(previous?: string): string {
  const valid = verifyVisitorToken(previous);
  if (!valid) return signVisitorToken(randomUUID());
  return valid.age < visitorAgeSeconds - refreshWindowSeconds ? previous! : signVisitorToken(valid.visitorId);
}

export function requireVisitor(token?: string): string {
  const valid = verifyVisitorToken(token);
  if (!valid) throw new AppError('AUTH_REQUIRED', 'Demo Chat session required');
  return valid.visitorId;
}
