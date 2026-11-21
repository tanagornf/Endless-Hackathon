import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';
import App from './App';
import { i18nReady } from './i18n';
import { SessionProvider } from './session';

vi.mock('./registry', () => ({
  registryErrors: [],
  featurePages: [
    { featureId: 'F09', slug: 'inbox', routes: [
      { path: '/demo-chat/s/:slug', layout: 'public', auth: 'none', load: async () => ({ default: () => <h1>Customer chat</h1> }) },
      { path: '/demo-chat', layout: 'app', auth: 'business', load: async () => ({ default: () => <h1>Shop chat</h1> }) },
    ] },
    { featureId: 'F02', slug: 'auth', routes: [
      { path: '/login', layout: 'public', auth: 'none', load: async () => ({ default: () => <h1>Sign in</h1> }) },
    ] },
  ],
}));

beforeAll(async () => { await i18nReady; });
afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

function visit(path: string, visibleFeatureIds: string[]) {
  vi.stubEnv('PROD', true);
  const fetch = vi.fn(async (path: string) => {
    if (path === '/api/v1/me') return Response.json({}, { status: 401 });
    if (path === '/api/v1/features/visible') return Response.json({ data: { visibleFeatureIds } });
    throw new Error('Unexpected request: ' + path);
  });
  vi.stubGlobal('fetch', fetch);
  render(<MemoryRouter initialEntries={[path]}><SessionProvider><App /></SessionProvider></MemoryRouter>);
  return fetch;
}

test('allows anonymous visitors to open a published production Demo Chat page', async () => {
  const fetch = visit('/demo-chat/s/demo-boardgame', ['F09']);
  expect(await screen.findByRole('heading', { name: 'Customer chat' })).toBeTruthy();
  expect(fetch.mock.calls.map(([path]) => path)).toContain('/api/v1/features/visible');
});

test('anonymous flags do not unlock the merchant Demo Chat page', async () => {
  visit('/demo-chat', ['F09']);
  expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Shop chat' })).toBeNull();
});

test('an unlisted production Demo Chat page stays hidden', async () => {
  const fetch = visit('/demo-chat/s/demo-boardgame', []);
  await waitFor(() => expect(fetch.mock.calls.map(([path]) => path)).toContain('/api/v1/features/visible'));
  expect(screen.queryByRole('heading', { name: 'Customer chat' })).toBeNull();
});
