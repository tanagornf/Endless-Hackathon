import type { DashboardData } from '@nless/shared/features/analytics/types';
import { fireEvent, cleanup, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, expect, it, vi } from 'vitest';
import DashboardPage from './DashboardPage';
import en from './i18n/en.json';
import th from './i18n/th.json';

const fixture = vi.hoisted(() => ({ loading: false, error: false, query: vi.fn(), reload: vi.fn(), data: null as DashboardData | null }));
vi.mock('../../core', async original => ({
  ...await original<typeof import('../../core')>(),
  useSession: () => ({ currentBusiness: { id: 'synthetic-shop' } }),
  useSlot: () => [],
  useCan: () => false,
  useApiQuery: (path: string | null) => {
    if (path) fixture.query(path);
    return { data: fixture.loading || fixture.error || !path ? undefined : fixture.data,
      loading: fixture.loading && Boolean(path), error: fixture.error ? Error('synthetic') : null, reload: fixture.reload };
  },
}));

afterEach(() => {
  cleanup();
  fixture.loading = fixture.error = false;
  fixture.reload.mockClear();
});

async function show(language: 'th' | 'en') {
  const i18n = createInstance();
  await i18n.init({ lng: language, resources: { th: { analytics: th }, en: { analytics: en } } });
  render(<I18nextProvider i18n={i18n}><DashboardPage /></I18nextProvider>);
}

const range = { from: '2026-11-15', to: '2026-11-21', timezone: 'Asia/Bangkok', fromUtc: '2026-11-14T17:00:00Z', toUtc: '2026-11-21T17:00:00Z' };
const summary = { n: 0, medianSeconds: null };
const computedAt = '2026-11-21T08:00:00Z';

it.each(['th','en'] as const)('shows actual figures and unavailable values in %s', async language => {
  fixture.data = {
    range, computedAt, conversations: { active: 3, customersActive: 2, newCustomers: 1 },
    messages: { customer: 0, ai: 0, staff: 0 }, now: { openConversations: 2, waitingForStaff: 1 },
    daily: [], hourly: [], channels: [{ channel: 'line', conversations: 3 }],
    impact: {
      range, computedAt, activeConversations: 3, autoResolved: { count: 0, pct: 0 },
      handoff: { count: 1, ratePct: 100 / 3 }, staffTouched: 0,
      firstResponse: { ai: summary, staff: summary, all: summary, unanswered: 3 },
      orders: { available: false, reason: 'not_built' }, followUps: { available: false, reason: 'not_built' },
      aiCost: { basis: 'none', calls: 0, knownUsdMicros: null, unknownRows: 0, perAutoResolvedUsdMicros: null, isEstimate: true },
      staffMinutesSaved: { minutes: null, minutesPerConversation: 3, isEstimate: true },
    },
  };
  await show(language);
  expect(screen.getByRole('heading', { name: language === 'en' ? 'Shop overview' : 'ภาพรวมร้าน' })).toBeTruthy();
  expect(screen.getByTestId('overview-active').textContent).toBe('3');
  expect(screen.getByTestId('overview-aiReplies').textContent).toBe('0');
  expect(screen.getByTestId('overview-aiCost').textContent).toBe(language === 'en' ? 'Unknown' : 'ไม่ทราบ');
  expect(screen.getByTestId('overview-orders').textContent).toBe(language === 'en' ? 'Unavailable' : 'ยังไม่มีข้อมูล');
  expect(screen.getByText(language === 'en' ? 'No LINE messages in this period.' : 'ยังไม่มีข้อความ LINE ในช่วงนี้')).toBeTruthy();
  fireEvent.mouseDown(screen.getByRole('combobox', { name: language === 'en' ? 'Preset period' : 'ช่วงสรุป' }));
  fireEvent.click(screen.getByRole('option', { name: /30/ }));
  expect(fixture.query).toHaveBeenLastCalledWith('/analytics/dashboard?from=2026-10-23&to=2026-11-21');
});

it('shows loading and retry states', async () => {
  fixture.loading = true;
  await show('en');
  expect(screen.getByLabelText('Loading overview')).toBeTruthy();
  cleanup();
  fixture.loading = false;
  fixture.error = true;
  await show('en');
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(fixture.reload).toHaveBeenCalledOnce();
});
