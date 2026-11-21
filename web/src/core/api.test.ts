import { afterEach, expect, test, vi } from 'vitest';
import { apiRequest } from './index';

afterEach(() => vi.unstubAllGlobals());
function rejectRequest() {
  return Response.json({
    error: { code: 'AUTH_REQUIRED', message: 'No visitor session', retryable: false },
    meta: { requestId: 'test-request', schemaVersion: 1, serverTime: '2026-11-21T00:00:00Z' },
  }, { status: 401 });
}

test('preserves the public visitor header and returns a 401 without navigating away', async () => {
  const assign = vi.fn();
  const fetch = vi.fn(async (_path: string, _init?: RequestInit) => rejectRequest());
  vi.stubGlobal('location', { pathname: '/demo-chat/s/demo-boardgame', assign });
  vi.stubGlobal('fetch', fetch);
  await expect(apiRequest('/api/v1/public/demo-chat/demo-boardgame/messages', {
    redirectOnUnauthorized: false,
    headers: { 'X-Demo-Visitor-Token': 'synthetic-visitor-token' },
  })).rejects.toMatchObject({ status: 401, code: 'AUTH_REQUIRED' });
  const init = fetch.mock.calls[0][1];
  expect(new Headers(init?.headers).get('X-Demo-Visitor-Token')).toBe('synthetic-visitor-token');
  expect(init).not.toHaveProperty('redirectOnUnauthorized');
  expect(assign).not.toHaveBeenCalled();
});

test('ordinary unauthorized requests retain the app sign-in redirect', async () => {
  const assign = vi.fn();
  vi.stubGlobal('location', { pathname: '/chat', assign });
  vi.stubGlobal('fetch', vi.fn(async () => rejectRequest()));
  await expect(apiRequest('/api/v1/conversations/demo')).rejects.toMatchObject({ status: 401 });
  expect(assign).toHaveBeenCalledWith('/login');
});
