import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { SlotContribution } from '@nless/shared/core/loader';
import type { ConversationDetail, MessageRecord } from '@nless/shared/features/inbox/types';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import i18n, { i18nReady } from '../../core/i18n';
import InboxPage from './InboxPage';

const fixtures = vi.hoisted(() => ({
  slots: [] as SlotContribution[],
  history: undefined as { items: MessageRecord[]; nextCursor: null } | undefined,
  refresh: vi.fn(),
  run: vi.fn(async () => ({ unreadCount: 0 })),
  detail: {
    conversation: {
      id: 'conversation-1', businessId: 'shop-1', customerId: 'customer-1',
      customer: { displayName: 'Demo Customer', externalId: 'visitor', channelAccountId: null },
      channel: 'web', status: 'open', handler: 'ai', assigneeUserId: null, aiForceOn: false,
      lastMessageAt: null, lastInboundAt: null, unreadCount: 0, version: 1,
      createdAt: '2026-11-21T05:00:00.000Z',
    },
    assigneeName: null, waitingSince: null, isWaiting: false, aiPending: false, aiEnabled: true,
  } satisfies ConversationDetail,
}));

vi.mock('../../core', async () => ({
  ...await import('../../core/ui'),
  ...await import('../../core/layout/PageHeader'),
  ...await import('../../core/format'),
  useApiQuery: (path: string | null) => ({
    data: path === '/conversations/conversation-1' ? fixtures.detail
      : path === '/conversations/conversation-1/messages' ? fixtures.history : undefined,
    error: null, loading: false, reload: fixtures.refresh,
  }),
  useApiMutation: () => ({ run: fixtures.run, running: false, error: null }),
  useCan: () => true,
  useRealtime: vi.fn(),
  useSession: () => ({ currentBusiness: { id: 'shop-1' } }),
  useSlot: (name: SlotContribution['slot']) => fixtures.slots.filter((slot) => slot.slot === name),
}));

function panel(id: string, title: string): SlotContribution {
  return { id, order: 10, slot: 'chatSidePanels', load: async () => ({ default: () => <p>{title}</p> }) };
}

function openThread(desktop = false) {
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: desktop, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })));
  render(<MemoryRouter initialEntries={['/chat?c=conversation-1']}><InboxPage /></MemoryRouter>);
}

beforeEach(async () => {
  await i18nReady;
  await i18n.changeLanguage('en');
  fixtures.slots = [panel('team.panel', 'Desktop team panel')];
  fixtures.history = undefined;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test('the staff inbox exposes the same outgoing source as a keyboard-accessible link', async () => {
  const url = 'https://example.org/rules?lang=th&version=2';
  fixtures.history = { items: [{
    id: 'ai-source', businessId: 'shop-1', conversationId: 'conversation-1', seq: 1,
    direction: 'outbound', author: 'ai', authorUserId: null, parts: [{ type: 'text', text: 'Source: ' + url }],
    text: 'Source: ' + url, channel: 'web', origin: 'demo', externalId: null, groupId: null,
    delivery: { mode: null, state: 'sent', externalRef: null, error: null }, createdAt: '2026-11-21T05:00:00Z',
  }], nextCursor: null };
  openThread();
  const link = await screen.findByRole('link', { name: url });
  expect(link.getAttribute('href')).toBe(url);
  link.focus();
  expect(document.activeElement).toBe(link);
});

test('mobile omits Details when only the desktop Team panel is registered', async () => {
  openThread();
  await screen.findByRole('heading', { name: 'Demo Customer' });
  expect(screen.queryByRole('button', { name: 'Conversation details' })).toBeNull();
  expect(screen.getByRole('log', { name: 'Conversation messages' })).toBeTruthy();
});

test('mobile opens a mobile-capable side panel without mounting the desktop Team panel', async () => {
  fixtures.slots.push(panel('crm.panel', 'Mobile customer panel'));
  openThread();
  const details = await screen.findByRole('button', { name: 'Conversation details' });
  fireEvent.click(details);
  expect(await screen.findByText('Mobile customer panel')).toBeTruthy();
  expect(screen.queryByText('Desktop team panel')).toBeNull();
  expect(details.getAttribute('aria-expanded')).toBe('true');
});

test('desktop keeps the Team panel available', async () => {
  openThread(true);
  expect(await screen.findByText('Desktop team panel')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Conversation details' })).toBeNull();
});
