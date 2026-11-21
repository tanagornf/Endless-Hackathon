import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, expect, it, vi } from 'vitest';
import type { MerchantReport } from '@nless/shared/features/insights/merchant';
import MerchantPage from './MerchantPage';
import en from './i18n/en.json';
import th from './i18n/th.json';

const fixture = vi.hoisted(() => ({
  query: vi.fn(), reload: vi.fn(), loading: false, error: false,
  report: {
    since: '2026-11-14T17:00:00.000Z', until: '2026-11-21T08:00:00.000Z',
    conversations: 2, customers: 2, orders: 1, handoffs: 1, pendingSupport: 1,
    products: [{ sku: 'A-CARD-01', name: 'Demo cards', conversations: 2, withoutOrder: 1 }],
  } as MerchantReport,
}));

vi.mock('../../core', async original => ({
  ...await original<typeof import('../../core')>(),
  useSession: () => ({ currentBusiness: { id: 'synthetic-shop' } }),
  useApiQuery: (path: string) => {
    fixture.query(path);
    return {
      data: fixture.loading || fixture.error ? undefined : fixture.report,
      loading: fixture.loading, error: fixture.error ? Error('synthetic error') : null, reload: fixture.reload,
    };
  },
}));
afterEach(cleanup);

async function show(locale: 'en' | 'th') {
  const i18n = createInstance();
  await i18n.init({ lng: locale, resources: { en: { insights: en }, th: { insights: th } } });
  render(<I18nextProvider i18n={i18n}><MerchantPage /></I18nextProvider>);
}

it.each(['en', 'th'] as const)('shows source rows and masks incomplete counts in %s', async locale => {
  fixture.report.orders = 1;
  await show(locale);
  expect(screen.getByTestId('merchant-period').textContent).toContain(locale === 'en' ? 'Source period' : 'ช่วงข้อมูล');
  expect(screen.getByTestId('merchant-metric-orders').textContent).toBe('1');
  expect(screen.getByTestId('merchant-metric-pendingSupport').textContent).toBe('1');
  expect(screen.getByText('Demo cards · A-CARD-01')).toBeTruthy();
  expect(screen.getByText(locale === 'en' ? /It appeared in 1 chats/ : /มี 1 แชต/)).toBeTruthy();

  fixture.report.orders = null;
  fixture.report.products = null;
  fireEvent.mouseDown(screen.getByRole('combobox', { name: locale === 'en' ? 'Reporting period' : 'ช่วงเวลา' }));
  fireEvent.click(screen.getByRole('option', { name: /30/ }));
  expect(fixture.query).toHaveBeenLastCalledWith('/insights/merchant?days=30');
  expect(screen.getByTestId('merchant-metric-orders').textContent).toBe(locale === 'en' ? 'Unavailable' : 'ไม่ทราบ');
  expect(screen.queryByText('Demo cards · A-CARD-01')).toBeNull();
  fixture.report.products = [{ sku: 'A-CARD-01', name: 'Demo cards', conversations: 2, withoutOrder: 1 }];
});

it('shows distinct loading, empty and retry states', async () => {
  fixture.loading = true;
  await show('en');
  expect(screen.getByRole('progressbar')).toBeTruthy();
  cleanup();
  fixture.loading = false;
  fixture.error = true;
  await show('en');
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(fixture.reload).toHaveBeenCalledOnce();
  cleanup();
  fixture.error = false;
  fixture.report.conversations = 0;
  await show('en');
  expect(screen.getByText('No live customer chats in this period.')).toBeTruthy();
});
