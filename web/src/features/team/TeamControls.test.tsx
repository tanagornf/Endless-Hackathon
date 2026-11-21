import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { ConversationTeamState } from '@nless/shared/features/team/types';
import i18n, { i18nReady } from '../../core/i18n';
import { TeamControls } from './TeamControls';

const session = vi.hoisted(() => ({ user: { id: 'staff' }, currentBusiness: { id: 'shop-a' } }));
vi.mock('../../core/session', async (original) => ({
  ...await original<typeof import('../../core/session')>(),
  useSession: () => session,
}));

function snapshot(handler: 'human' | 'ai', conversationId = 'chat-a'): Response {
  const data: ConversationTeamState = {
    conversationId, handler, assigneeUserId: handler === 'human' ? 'staff' : null,
    assigneeName: handler === 'human' ? 'Staff A' : null, status: 'open', version: handler === 'human' ? 1 : 2,
    isQueued: false, canTakeover: true, candidates: [],
  };
  return Response.json({ data });
}

beforeEach(async () => {
  await i18nReady;
  await i18n.changeLanguage('en');
  session.currentBusiness.id = 'shop-a';
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test('recovers a missed handback on focus and keeps the last handler visible during the read', async () => {
  const fetch = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>();
  let finish!: (response: Response) => void;
  fetch.mockResolvedValueOnce(snapshot('human')).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  vi.stubGlobal('fetch', fetch);
  render(<TeamControls conversationId="chat-a" compact />);
  await screen.findByTestId('team-release');

  // A teammate handed back this chat while its conversation.updated event was missed.
  fireEvent.focus(window);
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  expect(screen.getByTestId('team-handler-chip').getAttribute('data-handler')).toBe('human');
  expect((screen.getByTestId('team-release') as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByTestId('team-release'));
  await act(async () => finish(snapshot('ai')));
  await screen.findByTestId('team-takeover');
  expect(screen.queryByTestId('team-release')).toBeNull();
  expect(fetch.mock.calls.every(([, init]) => init?.method === 'GET')).toBe(true);
  expect(fetch.mock.calls.map(([path]) => path)).toEqual(Array(2).fill('/api/v1/conversations/chat-a/team?businessId=shop-a'));
});

test('rechecks a continuously visible tab, skips hidden tabs, and reads again on return', async () => {
  const intervals = vi.spyOn(window, 'setInterval');
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  const fetch = vi.fn().mockResolvedValueOnce(snapshot('ai')).mockResolvedValueOnce(snapshot('human'))
    .mockResolvedValueOnce(snapshot('ai'));
  vi.stubGlobal('fetch', fetch);
  render(<TeamControls conversationId="chat-a" compact />);
  await screen.findByTestId('team-takeover');
  const tick = () => {
    const poll = intervals.mock.calls.filter(([, ms]) => ms === 15000).at(-1)?.[0];
    if (typeof poll !== 'function') throw new Error('Missing visible-tab refresh timer');
    act(() => poll());
  };

  visibility.mockReturnValue('hidden');
  tick();
  expect(fetch).toHaveBeenCalledTimes(1);
  visibility.mockReturnValue('visible');
  tick();
  await screen.findByTestId('team-release');
  fireEvent(document, new Event('visibilitychange'));
  await screen.findByTestId('team-takeover');
  expect(fetch).toHaveBeenCalledTimes(3);
});

test('discards pending reads and cached controls on a business or conversation change', async () => {
  let finish!: (response: Response) => void;
  const fetch = vi.fn().mockResolvedValueOnce(snapshot('human'))
    .mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; }))
    .mockResolvedValueOnce(Response.json({ error: { code: 'NOT_FOUND' }, meta: {} }, { status: 404 }))
    .mockResolvedValueOnce(snapshot('ai', 'chat-b'));
  vi.stubGlobal('fetch', fetch);
  const view = render(<TeamControls conversationId="chat-a" compact />);
  await screen.findByTestId('team-release');
  fireEvent(window, new Event('online'));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));

  session.currentBusiness.id = 'shop-b';
  view.rerender(<TeamControls conversationId="chat-a" compact />);
  expect(screen.queryByTestId('team-release')).toBeNull();
  await screen.findByRole('alert');
  expect(fetch.mock.calls[2][0]).toBe('/api/v1/conversations/chat-a/team?businessId=shop-b');
  view.rerender(<TeamControls conversationId="chat-b" compact />);
  await screen.findByTestId('team-takeover');
  await act(async () => finish(snapshot('human')));
  expect(screen.getByTestId('team-handler-chip').getAttribute('data-handler')).toBe('ai');
  expect(fetch.mock.calls[3][0]).toBe('/api/v1/conversations/chat-b/team?businessId=shop-b');
});
