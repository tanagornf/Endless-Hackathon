import { afterEach, expect, test, vi } from 'vitest';
import { rateLimit } from './ratelimit';

afterEach(() => vi.useRealTimers());

test('denies the first request beyond the window limit', () => {
  vi.useFakeTimers();
  const key = { key: 'test:limit', limit: 1, windowSeconds: 15 };
  expect(rateLimit(key)).toMatchObject({ allowed: true, remaining: 0 });
  expect(rateLimit(key)).toMatchObject({ allowed: false, remaining: 0, retryAfterSeconds: 15 });
});

test('opens a new window after the window expires', () => {
  vi.useFakeTimers();
  const key = { key: 'test:expiry', limit: 1, windowSeconds: 8 };
  expect(rateLimit(key).allowed).toBe(true);
  vi.advanceTimersByTime(8000);
  expect(rateLimit(key).allowed).toBe(true);
});
