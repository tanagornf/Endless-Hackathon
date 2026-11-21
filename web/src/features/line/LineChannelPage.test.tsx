import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { LineConnectionView } from '@nless/shared/features/line/types';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import i18n, { i18nReady } from '../../core/i18n';
import LineChannelPage from './LineChannelPage';

const fixtures = vi.hoisted(() => ({ canManage: true, view: null as unknown, reload: vi.fn(), run: vi.fn() }));
vi.mock('../../core', async () => ({
  ...await import('../../core/ui'),
  ...await import('../../core/layout/PageHeader'),
  ...await import('../../core/format'),
  useCan: () => fixtures.canManage,
  useSession: () => ({ currentBusiness: { id: 'shop' } }),
  useRealtime: vi.fn(),
  useApiQuery: (path: string | null) => ({
    data: path === '/channels/line' ? fixtures.view : { items: [] },
    error: null, loading: false, reload: fixtures.reload,
  }),
  useApiMutation: () => ({ run: fixtures.run, running: false, error: null }),
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

const connected: LineConnectionView = {
  connected: true, status: 'active', statusReason: null, mode: 'real', channelId: '1234567890',
  displayName: 'Test OA', basicId: '@fixture', addFriendUrl: 'https://line.me/R/ti/p/%40fixture',
  addFriendQrDataUrl: 'data:image/png;base64,fixture',
  webhookUrl: 'https://example.test/webhooks/line/1234567890', hasAccessToken: true, source: 'env',
  connectedAt: '2026-11-21T05:00:00.000Z', lastVerifiedAt: null, lastEventAt: null, eventsTotal: 0,
  push: { month: '2026-11-01', calls: 2, messages: 4, quotaAlertedAt: null, lineQuota: null },
};

beforeEach(async () => {
  await i18nReady;
  fixtures.canManage = true;
  fixtures.view = connected;
  fixtures.run.mockResolvedValue(connected);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

test('shows the production channel controls and bilingual page copy', async () => {
  await i18n.changeLanguage('en');
  const view = render(<LineChannelPage />);
  expect(screen.getByRole('heading', { name: 'LINE channel' })).toBeDefined();
  expect(screen.getByText('Test OA')).toBeDefined();
  expect(screen.getByDisplayValue('https://example.test/webhooks/line/1234567890')).toBeDefined();
  expect(screen.getByText('No events yet')).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: 'Check connection' }));
  await waitFor(() => expect(fixtures.run).toHaveBeenCalledTimes(1));
  view.unmount();

  await i18n.changeLanguage('th');
  render(<LineChannelPage />);
  expect(screen.getByRole('heading', { name: 'ช่องทาง LINE' })).toBeDefined();
  expect(screen.getByText('เชื่อมต่อแล้ว')).toBeDefined();
});

test('shows read-only status without management controls or the events table', async () => {
  fixtures.canManage = false;
  await i18n.changeLanguage('en');
  render(<LineChannelPage />);
  expect(screen.getByText('View only. You need the channels permission to change this')).toBeDefined();
  expect(screen.queryByRole('button', { name: 'Check connection' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Disconnect' })).toBeNull();
  expect(screen.queryByRole('table')).toBeNull();
});
