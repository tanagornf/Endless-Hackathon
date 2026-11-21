import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { pushWorkerScript } from './worker';

const origin = 'https://endless.example.test';
const noticeId = '6f4f637d-4909-4d33-8a25-78e5748a4e14';
const ref = '99bb9603-452f-4ae9-8a9c-01a1c76dc4f5';

function loadWorker() {
  const listeners = new Map<string, (event: Record<string, unknown>) => void>();
  const visible = vi.fn(async () => {});
  const ack = vi.fn(async () => {});
  const openWindow = vi.fn(async () => {});
  const focus = vi.fn(async () => {});
  const navigate = vi.fn(async () => ({ focus }));
  const clients = { matchAll: vi.fn(async () => [] as { url: string; navigate: typeof navigate }[]), openWindow };
  const self = {
    location: { origin }, registration: { showNotification: visible }, clients,
    addEventListener: (name: string, listener: (event: Record<string, unknown>) => void) => listeners.set(name, listener),
  };
  runInNewContext(pushWorkerScript, { self, fetch: ack, URL });
  function dispatch(name: string, event: Record<string, unknown>) {
    let completed: Promise<unknown> | undefined;
    listeners.get(name)!({ ...event, waitUntil: (promise: Promise<unknown>) => { completed = promise; } });
    return completed;
  }
  return { dispatch, visible, ack, openWindow, navigate, focus, clients };
}

describe('notification service worker', () => {
  it('shows generic notification copy before acknowledging only the opaque ref', async () => {
    const { dispatch, visible, ack } = loadWorker();
    await dispatch('push', { data: { json: () => ({ noticeId, ref, language: 'en', body: 'PRIVATE', url: '//evil.example' }) } });
    expect(visible).toHaveBeenCalledWith('Endless', {
      body: 'Open Endless to view your notification.',
      tag: noticeId,
      data: { noticeId },
    });
    expect(ack).toHaveBeenCalledWith('/api/v1/notifications/push/ack', {
      method: 'POST', credentials: 'include', redirect: 'error',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'nless' },
      body: JSON.stringify({ ref }),
    });
    expect(visible.mock.invocationCallOrder[0]).toBeLessThan(ack.mock.invocationCallOrder[0]!);
  });

  it('displays generic Thai copy for an unrecognized payload and emits no acknowledgement', async () => {
    const { dispatch, visible, ack } = loadWorker();
    await dispatch('push', { data: { json: () => { throw new Error('invalid push JSON'); } } });
    expect(visible).toHaveBeenCalledWith('Endless', expect.objectContaining({
      body: 'เปิด Endless เพื่อดูการแจ้งเตือน',
      data: { noticeId: null },
    }));
    expect(ack).not.toHaveBeenCalled();
  });

  it('does not post an acknowledgement when display fails', async () => {
    const { dispatch, visible, ack } = loadWorker();
    visible.mockRejectedValueOnce(new Error('Could not display notification'));
    await expect(dispatch('push', { data: { json: () => ({ noticeId, ref }) } })).rejects.toThrow();
    expect(ack).not.toHaveBeenCalled();
  });

  it('opens a same-origin authenticated destination using only the opaque notice ID', async () => {
    const { dispatch, clients, navigate, focus, openWindow } = loadWorker();
    const close = vi.fn();
    clients.matchAll.mockResolvedValue([{ url: origin + '/home', navigate }]);
    await dispatch('notificationclick', { notification: { close, data: { noticeId, url: '//evil.example' } } });
    expect(close).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(origin + '/notifications/open/' + noticeId);
    expect(focus).toHaveBeenCalled();
    expect(openWindow).not.toHaveBeenCalled();
  });

  it('does not open an off-origin window or interpret an invalid ID as a redirect', async () => {
    const { dispatch, clients, navigate, openWindow } = loadWorker();
    clients.matchAll.mockResolvedValue([{ url: 'https://evil.example/home', navigate }]);
    await dispatch('notificationclick', { notification: { close() {}, data: { noticeId: '//evil.example' } } });
    expect(navigate).not.toHaveBeenCalled();
    expect(openWindow).toHaveBeenCalledWith(origin + '/notifications');
  });
});
