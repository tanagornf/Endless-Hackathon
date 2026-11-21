import type { Request, RequestHandler } from 'express';
import { AppError, toApiFailure } from './errors';
import { requestContext } from './log';

interface RateInput { key: string; limit: number; windowSeconds: number }
const windows = new Map<string, { used: number; end: number }>();
let sweepAt = 0;

export function rateLimit({ key, limit, windowSeconds }: RateInput): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
  const now = Date.now();
  if (now >= sweepAt || windows.size >= 10000) {
    for (const [id, window] of windows) if (window.end <= now) windows.delete(id);
    sweepAt = now + 60000;
  }
  let bucket = windows.get(key);
  if (!bucket || bucket.end <= now) {
    if (!bucket && windows.size >= 10000) return { allowed: false, remaining: 0, retryAfterSeconds: windowSeconds };
    bucket = { used: 0, end: now + 1000 * windowSeconds };
    windows.set(key, bucket);
  }
  const allowed = bucket.used < limit;
  if (allowed) bucket.used++;
  return { allowed, remaining: Math.max(0, limit - bucket.used), retryAfterSeconds: Math.ceil((bucket.end - now) / 1000) };
}

export function assertRateLimit(input: RateInput): void {
  const result = rateLimit(input);
  if (!result.allowed) throw new AppError('RATE_LIMITED', 'Too many requests', { retryable: true, details: { retryAfterSeconds: result.retryAfterSeconds } });
}

export function rateLimited(input: Omit<RateInput, 'key'> & { name: string; key?(req: Request): string }): RequestHandler {
  return (req, res, next) => {
    const data = rateLimit({ ...input, key: input.name + ':' + (input.key?.(req) ?? req.ip ?? 'unknown') });
    if (data.allowed) return next();
    res.setHeader('Retry-After', data.retryAfterSeconds);
    const err = new AppError('RATE_LIMITED', 'Too many requests', { retryable: true, details: { retryAfterSeconds: data.retryAfterSeconds } });
    res.status(429).json(toApiFailure(err, requestContext.getStore()?.requestId ?? ''));
  };
}
