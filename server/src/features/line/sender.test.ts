import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OutboundDelivery } from '../../core';
import { makeLineSender } from './sender';

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  contact: vi.fn(),
  batch: vi.fn(),
  reserve: vi.fn(),
  finish: vi.fn(),
  clear: vi.fn(),
  request: vi.fn(),
  token: vi.fn(),
  markError: vi.fn(),
  quota: vi.fn(),
}));

vi.mock('./repo', () => ({
  findOutboundConnection: mocks.find,
  findContact: mocks.contact,
  findDeliveryBatch: mocks.batch,
  reserveReplyBatch: mocks.reserve,
  completeDeliveryBatch: mocks.finish,
  clearReplyBatch: mocks.clear,
}));
vi.mock(import('./lineApi'), async (importOriginal) => ({ ...await importOriginal(), lineRequest: mocks.request }));
vi.mock('./connection', () => ({ getAccessToken: mocks.token, markConnectionError: mocks.markError }));
vi.mock('./usage', () => ({ notifyQuota: mocks.quota }));

const messageId = '10000000-0000-4000-8000-000000000002';
const now = 1_800_000_000_000;
const sender = makeLineSender(() => now);
const delivery = (age = 10_000): OutboundDelivery => ({
  businessId: 'shop', conversationId: 'conversation', channel: 'line', customerExternalId: 'Utest',
  channelAccountId: 'Ubot', messageId, attempt: 1,
  parts: [{ type: 'text', text: 'สวัสดี Hello' }],
  lastInboundMeta: {
    replyToken: 'test-reply-token', replyTokenIssuedAt: new Date(now - age).toISOString(),
    replyTokenExpiresAt: new Date(now - age + 50_000).toISOString(),
  },
});

function response(status: number, body: unknown = {}, headers: Record<string, string> = {}) {
  return { status, body, headers: new Headers(headers) };
}

describe('LINE channel sender', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.find.mockResolvedValue({ id: 'connection' });
    mocks.contact.mockResolvedValue(null);
    mocks.batch.mockResolvedValue(null);
    mocks.token.mockResolvedValue('test-access-token');
    mocks.reserve.mockResolvedValue(true);
    mocks.request.mockResolvedValue(response(200, { sentMessages: [{ id: '1234567' }] }));
  });

  it('uses reply before the 50 second cutoff', async () => {
    expect(await sender.send(delivery(49_000))).toEqual({ state: 'sent', mode: 'real', externalRef: '1234567' });
    expect(mocks.request).toHaveBeenCalledWith('/v2/bot/message/reply', expect.objectContaining({
      json: { replyToken: 'test-reply-token', messages: [{ type: 'text', text: 'สวัสดี Hello' }] },
    }));
  });

  it('uses a stable push retry key for older or already claimed reply tokens', async () => {
    await sender.send(delivery(51_000));
    mocks.reserve.mockResolvedValue(false);
    await sender.send(delivery(1_000));
    const [first, second] = mocks.request.mock.calls;
    expect(first[0]).toBe('/v2/bot/message/push');
    expect(second[0]).toBe(first[0]);
    expect(second[1].retryKey).toBe(first[1].retryKey);
    expect(first[1].retryKey).toMatch(/^[a-f0-9-]{36}$/);
  });

  it('falls back to push only when LINE explicitly rejects the reply token', async () => {
    mocks.request.mockResolvedValueOnce(response(400, { message: 'Invalid reply token' }));
    expect((await sender.send(delivery())).state).toBe('sent');
    expect(mocks.request.mock.calls.map((call) => call[0])).toEqual(['/v2/bot/message/reply', '/v2/bot/message/push']);
    mocks.request.mockClear().mockResolvedValueOnce(response(400, { message: 'Invalid message, token=private' }));
    expect(await sender.send(delivery())).toMatchObject({ state: 'failed', retryable: false, error: 'line_400' });
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });

  it('does not send after a disconnect or when a previous attempt has unknown outcome', async () => {
    mocks.find.mockResolvedValueOnce(null);
    expect(await sender.send(delivery())).toMatchObject({ state: 'failed', retryable: false });
    mocks.batch.mockResolvedValueOnce({ state: 'unknown' });
    expect(await sender.send(delivery())).toMatchObject({ state: 'unknown' });
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it('records an uncertain reply without pushing and recognizes accepted push retries', async () => {
    mocks.request.mockResolvedValueOnce(null);
    expect(await sender.send(delivery())).toMatchObject({ state: 'unknown' });
    expect(mocks.request).toHaveBeenCalledTimes(1);
    mocks.request.mockResolvedValueOnce(response(409, {}, { 'x-line-accepted-request-id': 'prior-request' }));
    expect(await sender.send(delivery(51_000))).toMatchObject({ state: 'sent', externalRef: 'prior-request' });
  });

  it('splits batches at five messages and skips already accepted batches on retry', async () => {
    const input = { ...delivery(), parts: Array.from({ length: 7 }, (_, index) => ({ type: 'text' as const, text: String(index) })) };
    mocks.request.mockResolvedValueOnce(response(200)).mockResolvedValueOnce(response(500));
    expect(await sender.send(input)).toMatchObject({ state: 'failed', retryable: true });
    expect(mocks.request.mock.calls.map((call) => call[1].json.messages.length)).toEqual([5, 2]);
    mocks.request.mockClear();
    mocks.batch.mockResolvedValueOnce({ state: 'accepted', sent_ids: [], request_id: 'first' });
    expect((await sender.send(input)).state).toBe('sent');
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(mocks.request.mock.calls[0][1].json.messages).toHaveLength(2);
  });
});
