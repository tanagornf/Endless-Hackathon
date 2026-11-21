import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { DemoChatMessage, DemoChatPoll, DemoChatSendResult } from '@nless/shared/features/inbox/types';
import i18n, { i18nReady } from '../../core/i18n';
import CustomerChatView from './CustomerChatView';
import type { ChatTransport } from './demoTransport';

const text = 'The same question';
function saved(id: string, seq: number, clientRequestId: string): DemoChatMessage {
  return { id, clientRequestId, seq, author: 'customer', direction: 'inbound', parts: [{ type: 'text', text }],
    delivery: null, createdAt: '2026-11-21T05:00:00Z' };
}

async function startChat() {
  let items: DemoChatMessage[] = [];
  let rejectSend!: (cause: Error) => void;
  const send = vi.fn((_text: string, _id: string) =>
    new Promise<DemoChatSendResult>((_resolve, reject) => { rejectSend = reject; }));
  const transport: ChatTransport = {
    send, poll: vi.fn(async (): Promise<DemoChatPoll> => ({
      conversationId: 'conversation', items, cursor: 'cursor', pending: null, closed: false,
    })), action: vi.fn(), reset: vi.fn(), fileUrl: vi.fn(),
  };
  render(<CustomerChatView transport={transport} greeting="Welcome" suggestions={[]} limit={500} />);
  await screen.findByText('Welcome');
  const input = screen.getByTestId('demo-chat-input');
  fireEvent.change(input, { target: { value: text } });
  fireEvent.click(screen.getByTestId('demo-chat-send'));
  expect(send).toHaveBeenCalledTimes(1);
  const requestId = send.mock.calls[0][1];
  return {
    input, requestId, send,
    loseResponse: () => act(async () => { rejectSend(new Error('Connection lost')); }),
    poll: async (rows: DemoChatMessage[]) => {
      items = rows;
      await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    },
  };
}

beforeEach(async () => {
  await i18nReady;
  await i18n.changeLanguage('en');
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('renders outgoing HTTPS sources as accessible links while preserving customer and message text', async () => {
  const source = 'https://example.org/ไทย_(คู่มือ)?edition=en&part=2#rules';
  const next = 'https://example.org/reference';
  const body = 'คู่มือเกม / Game rules (' + source + ').\nแหล่งที่สอง: ' + next + '!';
  const unsupported = '<em>Example</em> http://example.org mailto:demo@example.org /relative https://account@example.org';
  const items: DemoChatMessage[] = [
    { ...saved('customer', 1, '1'), parts: [{ type: 'text', text: next }] },
    { ...saved('ai', 2, '2'), direction: 'outbound', author: 'ai',
      parts: [{ type: 'text', text: body }, { type: 'text', text: unsupported }] },
  ];
  const poll = vi.fn(async (): Promise<DemoChatPoll> => ({
    conversationId: 'conversation', items, cursor: 'cursor', pending: null, closed: false,
  }));
  render(<CustomerChatView transport={{ poll, send: vi.fn(), action: vi.fn(), reset: vi.fn(), fileUrl: vi.fn() }}
    greeting="Welcome" suggestions={[]} limit={500} />);
  const first = await screen.findByRole('link', { name: source });
  expect(first.getAttribute('href')).toBe(source);
  expect(first.getAttribute('rel')).toContain('noreferrer');
  expect(first.parentElement?.textContent).toBe(body);
  expect(screen.getByRole('link', { name: next }).getAttribute('href')).toBe(next);
  expect(screen.getAllByRole('link')).toHaveLength(2);
  expect(screen.getByText(unsupported).querySelector('em')).toBeNull();
});

it('reconciles a lost send acknowledgement only with the same request and preserves a newer draft', async () => {
  const chat = await startChat();
  await chat.loseResponse();
  const other = saved('other-tab', 1, 'another-request');
  await chat.poll([other]);
  expect(screen.getAllByTestId('demo-chat-message')).toHaveLength(2);
  expect(screen.getByRole('alert')).toBeTruthy();
  fireEvent.change(chat.input, { target: { value: 'My next question' } });
  await chat.poll([other, saved('mine', 2, chat.requestId)]);
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  expect(screen.getAllByTestId('demo-chat-message').map((node) => node.dataset.messageId)).toEqual(['other-tab', 'mine']);
  expect((chat.input as HTMLTextAreaElement).value).toBe('My next question');
  expect(chat.send).toHaveBeenCalledTimes(1);
});

it('keeps the saved row when polling acknowledges a send before its request rejects', async () => {
  const chat = await startChat();
  await chat.poll([saved('mine', 1, chat.requestId)]);
  expect(screen.getAllByTestId('demo-chat-message')).toHaveLength(1);
  await chat.loseResponse();
  expect(screen.getAllByTestId('demo-chat-message').map((node) => node.dataset.messageId)).toEqual(['mine']);
  expect(screen.queryByRole('alert')).toBeNull();
  expect((chat.input as HTMLTextAreaElement).value).toBe('');
});

it('starts a fresh poll when another tab replaces the conversation behind an old cursor', async () => {
  let switched = false;
  const oldRow = { ...saved('old-history', 100, 'old-id'), parts: [{ type: 'text' as const, text: 'Old conversation' }] };
  const newRow = { ...saved('new-history', 1, 'new-id'), parts: [{ type: 'text' as const, text: 'New conversation' }] };
  const poll = vi.fn(async (after: string | null): Promise<DemoChatPoll> => ({
    conversationId: switched ? 'new-conversation' : 'old-conversation',
    items: switched ? (after ? [] : [newRow]) : [oldRow],
    cursor: switched ? (after ?? 'new-cursor') : 'old-cursor', pending: null, closed: false,
  }));
  render(<CustomerChatView transport={{ poll, send: vi.fn(), action: vi.fn(), reset: vi.fn(), fileUrl: vi.fn() }}
    greeting="Welcome" suggestions={[]} limit={500} />);
  await screen.findByText('Old conversation');
  switched = true;
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
  await screen.findByText('New conversation');
  expect(screen.queryByText('Old conversation')).toBeNull();
  const argumentsAfterSwitch = poll.mock.calls.map(([after]) => after);
  expect(argumentsAfterSwitch.slice(argumentsAfterSwitch.indexOf('old-cursor') + 1)).toContain(null);
});
