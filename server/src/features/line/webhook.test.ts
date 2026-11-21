import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebhookContext } from '../../core';
import { handleLineWebhook } from './webhook';

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  record: vi.fn(),
  enqueue: vi.fn(),
  rate: vi.fn(),
}));

vi.mock('./repo', () => ({
  findWebhookConnection: mocks.connection,
  recordWebhookEvent: mocks.record,
}));

vi.mock('../../core', () => ({
  decryptSecret: (secret: string) => secret,
  encryptSecret: (text: string) => Buffer.from(text).toString('base64'),
  jobs: { enqueue: mocks.enqueue },
  rateLimit: mocks.rate,
  log: { warn: vi.fn(), info: vi.fn() },
}));

const secret = 'synthetic-line-fixture';
const body = JSON.stringify({
  destination: 'Ufixture',
  events: [
    {
      type: 'message', mode: 'active', webhookEventId: 'fixture-event-1',
      source: { type: 'user', userId: 'Utest' },
      message: { id: '123456', type: 'text', text: 'Hello เล่นเกม' },
      replyToken: 'test-reply-token',
    },
  ],
});

function context(signature?: string | string[], value = body): WebhookContext {
  return {
    rawBody: Buffer.from(value), text: value, get json() { throw new Error('unexpected eager parse'); },
    headers: { 'x-line-signature': signature }, query: {},
    params: { channelId: '1234567890' }, requestId: 'test',
  };
}

const signed = (value = body) => createHmac('sha256', secret).update(value).digest('base64');

describe('LINE signed webhook', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.connection.mockResolvedValue({ id: 'connection', business_id: 'business', channel_secret_enc: secret, bot_user_id: 'Ufixture' });
    mocks.record.mockResolvedValue(true);
    mocks.rate.mockReturnValue({ allowed: true });
    mocks.enqueue.mockResolvedValue({ jobId: 'job', deduped: false });
  });

  it('accepts valid raw bytes and enqueues the event using a scoped deduplication key', async () => {
    expect(await handleLineWebhook(context(signed()))).toEqual({ status: 200, body: {} });
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ eventId: 'fixture-event-1', businessId: 'business' }));
    expect(mocks.enqueue).toHaveBeenCalledWith('line.event', expect.objectContaining({
      connectionId: 'connection', event: expect.objectContaining({ webhookEventId: 'fixture-event-1' }),
    }), {
      dedupKey: 'line.event:fixture-event-1', businessId: 'business', lockKey: 'line:connection:Utest', maxAttempts: 5,
    });
    expect(JSON.stringify(mocks.enqueue.mock.calls)).not.toContain('test-reply-token');
    expect(JSON.stringify(mocks.enqueue.mock.calls)).not.toContain('Hello');
  });

  it.each([undefined, '', 'invalid', [signed(), signed()], signed() + ', ' + signed()])(
    'rejects missing, invalid and duplicate signatures before writing',
    async (signature) => {
      expect((await handleLineWebhook(context(signature))).status).toBe(401);
      expect(mocks.record).not.toHaveBeenCalled();
      expect(mocks.enqueue).not.toHaveBeenCalled();
    },
  );

  it('rejects changes to the signed body and verifies before parsing malformed JSON', async () => {
    expect((await handleLineWebhook(context(signed(), body + ' '))).status).toBe(401);
    expect((await handleLineWebhook(context('invalid', '{'))).status).toBe(401);
    expect((await handleLineWebhook(context(signed('{'), '{'))).status).toBe(200);
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it('acknowledges an unknown or inactive connection without enqueuing anything', async () => {
    mocks.connection.mockResolvedValue(null);
    expect((await handleLineWebhook(context())).status).toBe(200);
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it('ignores a different destination, empty verification events and completed redeliveries', async () => {
    const other = body.replace('Ufixture', 'another');
    const verify = '{"destination":"Ufixture","events":[]}';
    expect((await handleLineWebhook(context(signed(other), other))).status).toBe(200);
    expect((await handleLineWebhook(context(signed(verify), verify))).status).toBe(200);
    mocks.record.mockResolvedValue(false);
    expect((await handleLineWebhook(context(signed()))).status).toBe(200);
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it('returns 413 for an oversized body, 429 for rate limits and 500 for enqueue failure', async () => {
    expect((await handleLineWebhook(context(undefined, 'x'.repeat(1_000_001)))).status).toBe(413);
    mocks.rate.mockReturnValueOnce({ allowed: false, retryAfterSeconds: 60 });
    expect((await handleLineWebhook(context(signed()))).status).toBe(429);
    mocks.rate.mockReturnValueOnce({ allowed: true }).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 60 });
    expect((await handleLineWebhook(context('invalid'))).status).toBe(429);
    mocks.enqueue.mockRejectedValueOnce(new Error('DB unavailable'));
    expect((await handleLineWebhook(context(signed()))).status).toBe(500);
  });
});
