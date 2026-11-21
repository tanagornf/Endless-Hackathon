import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NotificationPushCard from './NotificationPushCard';

const { subscribe, enroll, reload } = vi.hoisted(() => ({ subscribe: vi.fn(), enroll: vi.fn(), reload: vi.fn() }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../../core', () => ({
  SectionCard: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  formatDateTime: (date: string) => date,
  useSession: () => ({ user: { id: 'fixture-owner' } }),
  useApiQuery: () => ({ data: { configured: true, publicKey: 'AQID', subscriptions: 0 }, reload }),
  useApiMutation: (_method: string, path: string) => ({
    run: path.endsWith('/subscribe') && !path.endsWith('/unsubscribe') ? enroll : vi.fn(), running: false,
  }),
}));

const serviceWorker = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
const register = vi.fn();

function setupBrowser(permission: NotificationPermission) {
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('PushManager', function TestPushManager() {});
  vi.stubGlobal('Notification', { permission });
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { register } });
}

describe('notification device enrollment', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    register.mockResolvedValue({
      active: { state: 'activated' },
      pushManager: { getSubscription: async () => null, subscribe },
    });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    localStorage.clear();
    if (serviceWorker) Object.defineProperty(navigator, 'serviceWorker', serviceWorker);
    else Reflect.deleteProperty(navigator, 'serviceWorker');
  });

  it('uses the tap to initiate subscription directly after the scoped worker is ready', async () => {
    setupBrowser('default');
    subscribe.mockResolvedValue({
      endpoint: 'https://web.push.apple.com/fixture',
      toJSON: () => ({ keys: { p256dh: 'fixture-public', auth: 'fixture-auth' } }),
    });
    enroll.mockResolvedValue({ ok: true, deviceId: 'fixture-device' });
    render(<NotificationPushCard />);
    const enable = await screen.findByRole<HTMLButtonElement>('button', { name: 'push.enable' });
    await waitFor(() => expect(enable.disabled).toBe(false));
    expect(register).toHaveBeenCalledWith('/api/v1/notifications/sw.js', { scope: '/api/v1/notifications/' });
    expect(subscribe).not.toHaveBeenCalled();
    fireEvent.click(enable);
    expect(subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: new Uint8Array([1, 2, 3]).buffer });
    await waitFor(() => expect(enroll).toHaveBeenCalledWith({
      endpoint: 'https://web.push.apple.com/fixture', keys: { p256dh: 'fixture-public', auth: 'fixture-auth' },
    }));
  });

  it('keeps a denied prompt closed and renders the actionable blocked state', () => {
    setupBrowser('denied');
    render(<NotificationPushCard />);
    expect(screen.getByText('push.denied')).toBeDefined();
    expect(register).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'push.enable' })).toBeNull();
  });
});
