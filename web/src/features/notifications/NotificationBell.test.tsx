import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import NotificationBell from './NotificationBell';

const { state, reload } = vi.hoisted(() => ({
  state: { count: 0, feedError: false },
  reload: vi.fn(),
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }) }));
vi.mock('../../core', () => ({
  useSession: () => ({ currentBusiness: { id: 'shop' }, user: { id: 'owner' } }),
  useApiQuery: (path: string | null) => ({
    data: path === '/notifications/unread-count' ? { count: state.count, elsewhere: 0 } : undefined,
    error: path === '/notifications?limit=10' && state.feedError ? { code: 'INTERNAL_ERROR' } : null,
    loading: false,
    reload,
  }),
  useRealtime: () => {},
  useApiMutation: () => ({ run: vi.fn(), running: false }),
}));

beforeEach(() => { state.count = 0; state.feedError = false; reload.mockReset(); });
afterEach(cleanup);

test('caps the unread badge at 99+ and omits it at zero', () => {
  const view = render(<MemoryRouter><NotificationBell /></MemoryRouter>);
  expect(screen.queryByTestId('notif-badge')).toBeNull();
  state.count = 104;
  view.rerender(<MemoryRouter><NotificationBell /></MemoryRouter>);
  expect(screen.getByTestId('notif-badge').textContent).toBe('99+');
});

test('shows a retry action when the feed is unavailable', () => {
  state.feedError = true;
  render(<MemoryRouter><NotificationBell /></MemoryRouter>);
  fireEvent.click(screen.getByTestId('notif-bell'));
  expect(screen.getByText('bell.error')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'common.retry' }));
  expect(reload).toHaveBeenCalled();
});
