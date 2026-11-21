import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { AiTurnMetrics, AiTurnTrace } from '@nless/shared/features/ai-agent/types';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import i18n, { i18nReady } from '../../core/i18n';
import AiTurnsPage from './AiTurnsPage';
import pages from './pages';

const fixtures = vi.hoisted(() => ({
  businessId: 'shop-one',
  loading: false,
  failing: false,
  reload: vi.fn(),
  trace: {
    turnId: 'turn-1', conversationId: 'chat-1', inboundMessageId: 'inbound-1', replyMessageId: 'reply-1',
    state: 'completed', mode: 'reply', intent: 'PRICE_CALC', skipReason: null, replyLanguage: 'en',
    startedAt: '2026-11-21T07:00:00Z', finishedAt: '2026-11-21T07:00:02Z', latencyMs: 2000,
    toolCount: 1, evidenceCount: 1, guardCount: 0, intentSource: 'regex', intentConfidence: 1,
    tools: [{ name: 'get_price', ok: true, ms: 4 }], evidenceIds: ['catalog:demo:v1'],
    productRefs: [{ itemId: 'item-1', sku: 'DEMO-1', name: 'Demo game' }], guardActions: [],
    handoffOffered: false, escalated: false, retryUsed: false, usage: null, timings: { contextMs: 6 }, errorCode: null, attempts: 1,
  } satisfies AiTurnTrace,
  metrics: {
    turns: 1, completed: 1, awaitingConfirmation: 0, handoff: 0, skipped: 0, failed: 0, medianLatencyMs: 2000,
  } satisfies AiTurnMetrics,
}));

vi.mock('../../core', async () => ({
  ...await import('../../core/ui'),
  ...await import('../../core/layout/PageHeader'),
  ...await import('../../core/format'),
  defineFeaturePages: (value: unknown) => value,
  useApiQuery: (path: string | null) => ({
    data: fixtures.loading || fixtures.failing ? undefined
      : path === '/ai/metrics' ? fixtures.metrics
      : path === '/ai/turns/turn-1' ? fixtures.trace
      : path?.startsWith('/ai/turns?') ? { items: fixtures.businessId === 'shop-one' ? [fixtures.trace] : [], nextCursor: null }
      : undefined,
    error: fixtures.failing && path ? { error: { code: 'INTERNAL' } } : null,
    loading: fixtures.loading,
    reload: fixtures.reload,
  }),
  useRealtime: vi.fn(),
  useSession: () => ({ currentBusiness: { id: fixtures.businessId } }),
}));

const view = () => <MemoryRouter><AiTurnsPage /></MemoryRouter>;

beforeEach(async () => {
  await i18nReady;
  await i18n.changeLanguage('en');
  fixtures.businessId = 'shop-one';
  fixtures.loading = false;
  fixtures.failing = false;
  fixtures.reload.mockClear();
});

afterEach(cleanup);

it('registers a permissioned page and renders bilingual summaries and safe details', async () => {
  expect(pages.routes[0]).toMatchObject({ path: '/ai-settings', permission: 'chat.read' });
  const mounted = render(view());
  expect(screen.getByRole('heading', { name: 'AI replies' })).toBeTruthy();
  expect(screen.getByText('2.0 s')).toBeTruthy();
  expect(screen.getByText('English')).toBeTruthy();
  fireEvent.click(screen.getByRole('row', { name: /Price or total/ }));
  const detail = await screen.findByText('Turn details');
  expect(detail).toBeTruthy();
  expect(screen.getByText('catalog:demo:v1')).toBeTruthy();
  expect(screen.getAllByRole('link', { name: 'Open chat' }).map((link) => link.getAttribute('href'))).toEqual([
    '/chat?c=chat-1', '/chat?c=chat-1',
  ]);
  await i18n.changeLanguage('th');
  expect(await screen.findByRole('heading', { name: 'การตอบของ AI' })).toBeTruthy();
  expect(screen.getByText('2.0 วินาที')).toBeTruthy();
  expect(screen.getByText('รายละเอียดการตอบ')).toBeTruthy();
  fixtures.businessId = 'shop-two';
  mounted.rerender(view());
  expect(screen.queryByText('catalog:demo:v1')).toBeNull();
  expect(screen.getByText('ไม่พบการตอบที่ตรงกับตัวกรอง')).toBeTruthy();
});

it('shows loading and retry states through the shared UI kit', async () => {
  fixtures.loading = true;
  const mounted = render(view());
  expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(4);
  fixtures.loading = false;
  fixtures.failing = true;
  mounted.rerender(view());
  const buttons = await screen.findAllByRole('button', { name: 'Retry' });
  expect(buttons).toHaveLength(2);
  fireEvent.click(buttons[0]!);
  expect(fixtures.reload).toHaveBeenCalledOnce();
});
