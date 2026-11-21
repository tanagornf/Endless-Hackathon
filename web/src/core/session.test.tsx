import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { SessionProvider, useSession } from './session';

const shop = { id: 'fixture-shop', name: 'Fixture shop' };
const user = { id: 'fixture-user', displayName: 'Fixture user' };
const sessionResponse = () => Response.json({
  data: { user, businesses: [{ business: shop, permissions: ['chat.read'] }] },
});
const unavailable = () => new Response('Bad gateway', { status: 502 });

function renderSession(fetch: typeof globalThis.fetch) {
  vi.stubGlobal('fetch', fetch);
  return renderHook(useSession, { wrapper: SessionProvider });
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test.each(['gateway', 'network'])('retries an initial %s failure before exposing the session', async failure => {
  vi.useFakeTimers();
  const fetch = vi.fn<typeof globalThis.fetch>();
  if (failure === 'gateway') fetch.mockResolvedValueOnce(unavailable());
  else fetch.mockRejectedValueOnce(new TypeError('Network unavailable'));
  fetch.mockResolvedValueOnce(sessionResponse());
  const { result } = renderSession(fetch);
  expect(result.current).toMatchObject({ status: 'loading', user: null, currentBusiness: null, permissions: [] });
  await act(async () => { await vi.runAllTimersAsync(); });
  expect(fetch.mock.calls.map(([path]) => path)).toEqual(['/api/v1/me', '/api/v1/me']);
  expect(result.current).toMatchObject({ status: 'ready', user, currentBusiness: shop });
});

test('an initial outage stays closed after the bounded retry budget', async () => {
  vi.useFakeTimers();
  localStorage.setItem('nless.businessId', shop.id);
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => unavailable());
  const { result } = renderSession(fetch);
  await act(async () => { await vi.runAllTimersAsync(); });
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(result.current).toMatchObject({ status: 'loading', user: null, businesses: [], currentBusiness: null, permissions: [] });
});

test('a malformed initial session response cannot unlock a tenant', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(Response.json({
    data: { user: null, businesses: [{ business: shop, permissions: ['chat.read'] }] },
  }));
  const { result } = renderSession(fetch);
  await act(async () => { await fetch.mock.results[0].value; });
  expect(result.current).toMatchObject({ status: 'loading', user: null, currentBusiness: null, permissions: [] });
});

test('a verified session survives a transient outage but immediately clears on 401', async () => {
  vi.useFakeTimers();
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(sessionResponse());
  const { result } = renderSession(fetch);
  await act(async () => { await vi.runAllTimersAsync(); });
  fetch.mockImplementation(async () => unavailable());
  await act(async () => {
    const refresh = result.current.refresh();
    await vi.runAllTimersAsync();
    await refresh;
  });
  expect(fetch).toHaveBeenCalledTimes(4);
  expect(result.current).toMatchObject({ status: 'ready', user, currentBusiness: shop });
  fetch.mockResolvedValueOnce(new Response(null, { status: 401 }));
  await act(async () => {
    await result.current.refresh();
    await vi.runAllTimersAsync();
  });
  expect(fetch).toHaveBeenCalledTimes(5);
  expect(result.current).toMatchObject({ status: 'anonymous', user: null, currentBusiness: null, permissions: [] });
});

test('a refresh response received after successful logout cannot restore a session', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(sessionResponse());
  const { result } = renderSession(fetch);
  await waitFor(() => expect(result.current.status).toBe('ready'));
  let finishRefresh!: (response: Response) => void;
  fetch.mockImplementationOnce(() => new Promise(resolve => { finishRefresh = resolve; }));
  const refresh = result.current.refresh();
  fetch.mockResolvedValueOnce(Response.json({ data: { ok: true } }));
  await act(async () => { await result.current.logout(); });
  expect(result.current.status).toBe('anonymous');
  await act(async () => {
    finishRefresh(sessionResponse());
    await refresh;
  });
  expect(result.current).toMatchObject({ status: 'anonymous', user: null, businesses: [], currentBusiness: null });
});
