import i18next from 'i18next';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import type { PermissionKey } from '@nless/shared/core/permissions';
import App from './App';
import { i18nReady } from './i18n';
import { ToastProvider } from './ui/toast';

const session = vi.hoisted(() => ({
  status: 'ready', admin: false, permissions: ['chat.read'] as PermissionKey[], flagsPending: false, chatVisible: true,
}));
const shop = { id: 'business', name: 'Synthetic shop' };

vi.mock('./registry', () => ({
  registryErrors: [],
  featurePages: [{
    featureId: 'F09', slug: 'inbox',
    menu: [{ path: '/chat', labelKey: 'common:pages.menu', group: 'chat', icon: 'ForumOutlined', order: 10, permission: 'chat.read' }],
    routes: [{ path: '/chat', layout: 'app', auth: 'business', permission: 'chat.read',
      load: async () => ({ default: () => <h1>Native shop chat</h1> }) }],
  }],
}));
vi.mock('./session', () => ({
  useSession: () => ({
    status: session.status, user: { id: 'user', displayName: 'Synthetic user', isPlatformAdmin: session.admin },
    currentBusiness: shop, businesses: [{ business: shop }], permissions: session.permissions,
  }),
}));
vi.mock('./featureFlags', () => ({
  useFeatures: () => ({
    flags: session.flagsPending ? null : { production: true, items: [] },
    error: false, publicLoading: false, visible: () => session.chatVisible,
  }),
}));
vi.mock('./slots', () => ({ useSlot: () => [] }));
vi.mock('./realtime', () => ({ useRealtimeConnection: () => {} }));

beforeAll(async () => {
  await i18nReady;
  await i18next.changeLanguage('en');
});
beforeEach(() => {
  session.status = 'ready';
  session.admin = false;
  session.permissions = ['chat.read'];
  session.flagsPending = false;
  session.chatVisible = true;
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

test.each([
  { path: '/', heading: 'Home' },
  { path: '/?view=workspace', heading: 'Shop workspace' },
])('$path keeps its explicit landing without redirecting to a feature', async ({ path, heading }) => {
  render(<MemoryRouter initialEntries={[path]}><ToastProvider><App /></ToastProvider></MemoryRouter>);
  expect(await screen.findByRole('heading', { name: heading })).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Native shop chat' })).toBeNull();
  expect(screen.getByRole('link', { name: 'Open inbox' }).getAttribute('href')).toBe('/chat');
  expect(screen.getByRole('combobox', { name: 'Select a shop' }).textContent).toBe(shop.name);
  expect(Boolean(screen.queryByRole('heading', { name: 'All tools' }))).toBe(path !== '/');
});

test.each(['hidden', 'permission'] as const)('chat %s removes the Home action and blocks Chat', async reason => {
  if (reason === 'hidden') session.chatVisible = false;
  else session.permissions = [];
  const home = render(<MemoryRouter initialEntries={['/']}><ToastProvider><App /></ToastProvider></MemoryRouter>);
  expect(screen.queryByRole('link', { name: 'Open inbox' })).toBeNull();
  expect(screen.queryByRole('link', { name: 'Jobs' })).toBeNull();
  home.unmount();
  render(<MemoryRouter initialEntries={['/chat']}><ToastProvider><App /></ToastProvider></MemoryRouter>);
  expect(await screen.findByRole('heading', { name: reason === 'hidden' ? 'Page not found' : 'You don’t have access to this page' })).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Native shop chat' })).toBeNull();
});

test('an administrator can open operations from compact navigation', async () => {
  session.admin = true;
  render(<MemoryRouter initialEntries={['/']}><ToastProvider><App /></ToastProvider></MemoryRouter>);
  expect(screen.getByRole('link', { name: 'Jobs' }).getAttribute('href')).toBe('/ops');
});

test('private feature visibility stays pending during the initial production flag load', async () => {
  vi.stubEnv('PROD', true);
  session.flagsPending = true;
  session.chatVisible = false;
  render(<MemoryRouter initialEntries={['/chat']}><ToastProvider><App /></ToastProvider></MemoryRouter>);
  expect(await screen.findByRole('progressbar', { name: 'Loading' })).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Page not found' })).toBeNull();
});

test('the signed-out account redirect passes the internal destination to Login', async () => {
  session.status = 'anonymous';
  function Destination() {
    const { pathname, search } = useLocation();
    return <output aria-label="Destination">{pathname + ' ' + new URLSearchParams(search).get('next')}</output>;
  }
  render(<MemoryRouter initialEntries={['/account?tab=security#password']}>
    <Destination /><ToastProvider><App /></ToastProvider>
  </MemoryRouter>);
  expect(await screen.findByText('/login /account?tab=security#password')).toBeTruthy();
});
