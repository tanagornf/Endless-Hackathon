import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { SessionProvider } from '../session';
import { useApiMutation, useApiQuery } from './apiHooks';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function installApi(hasBusiness: boolean) {
  const fetch = vi.fn(async (path: string, init?: RequestInit) => {
    if (path.endsWith('/me')) {
      return Response.json({ data: { user: { id: 'seed-owner' }, businesses: hasBusiness ? [
        { business: { id: 'selected-shop' }, role: 'owner', permissions: [] },
      ] : [] } });
    }
    return Response.json({ data: { path, method: init?.method } });
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

test('opted-out conversation queries use the resource route even without a selected shop', async () => {
  const fetch = installApi(false);
  const path = '/conversations/demo/messages';
  const { result } = renderHook(() => useApiQuery<{ path: string }>(path, { businessScoped: false }), { wrapper: SessionProvider });
  await waitFor(() => expect(result.current.data?.path).toBe('/api/v1' + path));
  expect(fetch.mock.calls.some(([requested]) => requested.includes('/businesses/'))).toBe(false);
});

test('queries use the selected business URL by default', async () => {
  installApi(true);
  const { result } = renderHook(() => useApiQuery<{ path: string }>('/catalog/items'), { wrapper: SessionProvider });
  await waitFor(() => expect(result.current.data?.path).toBe('/api/v1/businesses/selected-shop/catalog/items'));
});

test('opted-out mutations use the resource route without choosing a shop', async () => {
  installApi(false);
  const path = '/conversations/demo/reply';
  const { result } = renderHook(() => useApiMutation<{ text: string }, { path: string; method: string }>('POST', path, { businessScoped: false }), { wrapper: SessionProvider });
  await act(async () => {
    await expect(result.current.run({ text: 'synthetic fixture' })).resolves.toMatchObject({ path: '/api/v1' + path, method: 'POST' });
  });
});
