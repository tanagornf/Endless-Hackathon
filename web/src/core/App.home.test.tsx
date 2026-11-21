import i18next from 'i18next';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';
import App from './App';
import { i18nReady } from './i18n';
import { ToastProvider } from './ui/toast';

vi.mock('./registry', () => ({
  registryErrors: [],
  featurePages: [{
    featureId: 'F09', slug: 'inbox',
    menu: [{ path: '/demo-chat', labelKey: 'common:pages.menu', group: 'chat', icon: 'ForumOutlined', order: 10, permission: 'chat.read' }],
    routes: [{ path: '/demo-chat', layout: 'app', auth: 'business', load: async () => ({ default: () => <h1>Native shop chat</h1> }) }],
  }],
}));
vi.mock('./session', () => ({
  useSession: () => ({
    status: 'ready', user: { id: 'user', displayName: 'Synthetic user', isPlatformAdmin: false },
    currentBusiness: { id: 'business', name: 'Synthetic shop' }, businesses: [], permissions: ['chat.read'],
  }),
}));
vi.mock('./featureFlags', () => ({
  useFeatures: () => ({ flags: { production: true, items: [] }, error: false, publicLoading: false, visible: () => true }),
}));
vi.mock('./slots', () => ({ useSlot: () => [] }));
vi.mock('./realtime', () => ({ useRealtimeConnection: () => {} }));

beforeAll(async () => {
  await i18nReady;
  await i18next.changeLanguage('en');
});
afterEach(cleanup);

test.each([
  { path: '/', heading: 'Home' },
  { path: '/?view=workspace', heading: 'Shop workspace' },
])('$path keeps its explicit landing without redirecting to a feature', async ({ path, heading }) => {
  render(<MemoryRouter initialEntries={[path]}><ToastProvider><App /></ToastProvider></MemoryRouter>);
  expect(await screen.findByRole('heading', { name: heading })).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Native shop chat' })).toBeNull();
});
