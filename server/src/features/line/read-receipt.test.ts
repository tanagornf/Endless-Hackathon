import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebhookContext } from '../../core';
import { handleLineWebhook } from './webhook';

const mocks = vi.hoisted(() => ({
  config: { LINE_MODE: 'real', MODEL_MODE: 'openai' },
  connection: vi.fn(),
  record: vi.fn(),
  enqueue: vi.fn(),
  request: vi.fn(),
  warn: vi.fn(),
  encrypt: vi.fn((value: string) => Buffer.from(value).toString('base64')),
}));

vi.mock('./repo', () => ({
  findWebhookConnection: mocks.connection,
  recordWebhookEvent: mocks.record,
}));
vi.mock('./lineApi', () => ({ lineRequest: mocks.request }));
vi.mock('../../core', () => ({
  config: mocks.config,
  decryptSecret: (value: string) => {
    if (!value.startsWith('encrypted:')) throw new Error('Unable to decrypt ' + value);
    return value.slice('encrypted:'.length);
  },
  encryptSecret: mocks.encrypt,
  jobs: { enqueue: mocks.enqueue },
  rateLimit: () => ({ allowed: true }),
  log: { warn: mocks.warn },
}));

const webhookSecret = 'synthetic-webhook-secret';
const accessToken = 'synthetic-shop-access-token';
const readToken = 'synthetic-read-token';
const replyToken = 'synthetic-reply-token';
const connection = {
  id: 'fixture-connection',
  business_id: 'fixture-business',
  bot_user_id: 'Ufixturebot',
  channel_secret_enc: 'encrypted:' + webhookSecret,
  access_token_enc: 'encrypted:' + accessToken,
};

function webhookContext({
  token = readToken,
  source = { type: 'user', userId: 'Ufixturecustomer' },
  eventType = 'message',
  mode = 'active',
  destination = connection.bot_user_id,
  timestamp = Date.now(),
  validSignature = true,
  missingToken = false,
}: {
  token?: unknown;
  source?: { type: string; userId?: string };
  eventType?: string;
  mode?: string;
  destination?: string;
  timestamp?: number;
  validSignature?: boolean;
  missingToken?: boolean;
} = {}): WebhookContext {
  const text = JSON.stringify({
    destination,
    events: [{
      type: eventType, mode, timestamp, webhookEventId: 'fixture-message-event',
      source, replyToken,
      message: { id: '12345', type: 'text', text: 'Fixture customer message', markAsReadToken: missingToken ? undefined : token },
    }],
  });
  const signature = createHmac('sha256', validSignature ? webhookSecret : 'synthetic-wrong-secret')
    .update(text).digest('base64');
  return {
    rawBody: Buffer.from(text), text, get json() { throw new Error('Unexpected eager parse'); },
    headers: { 'x-line-signature': signature }, query: {},
    params: { channelId: '1234567890' }, requestId: 'read-receipt-test',
  };
}

describe('LINE inbound read receipts', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.config.LINE_MODE = 'real';
    mocks.config.MODEL_MODE = 'openai';
    mocks.connection.mockResolvedValue(connection);
    mocks.record.mockResolvedValue(true);
    mocks.enqueue.mockResolvedValue({ jobId: 'fixture-job', deduped: false });
    mocks.request.mockResolvedValue({ status: 200, headers: new Headers(), body: {} });
  });

  it('starts the native receipt with the bound shop credential after accepting the inbound job', async () => {
    const response = await handleLineWebhook(webhookContext());

    expect(response.status).toBe(200);
    expect(mocks.enqueue).toHaveBeenCalledWith('line.event', expect.any(Object), expect.objectContaining({
      businessId: connection.business_id, dedupKey: 'line.event:fixture-message-event',
    }));
    expect(mocks.request).toHaveBeenCalledExactlyOnceWith('/v2/bot/chat/markAsRead', {
      method: 'POST', token: accessToken, json: { markAsReadToken: readToken }, timeoutMs: 1_500,
    });
    expect(mocks.request.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.enqueue.mock.invocationCallOrder[0]);
    const encryptedInput = JSON.parse(mocks.encrypt.mock.calls[0][0]);
    expect(encryptedInput).toMatchObject({ replyToken, message: { text: 'Fixture customer message' } });
    expect(encryptedInput.message).not.toHaveProperty('markAsReadToken');
  });

  it.each([null, '', '   ', { unexpected: true }])('queues inbound without a usable read token (%j)', async (token) => {
    expect((await handleLineWebhook(webhookContext({ token }))).status).toBe(200);
    expect(mocks.enqueue).toHaveBeenCalledOnce();
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it('leaves the inbound job intact when the message has no read token property', async () => {
    expect((await handleLineWebhook(webhookContext({ missingToken: true }))).status).toBe(200);
    expect(mocks.enqueue).toHaveBeenCalledOnce();
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it('does not send a second receipt when LINE replays an event whose job is already queued', async () => {
    mocks.enqueue.mockResolvedValueOnce({ jobId: 'fixture-job', deduped: false })
      .mockResolvedValueOnce({ jobId: 'fixture-job', deduped: true });
    const ctx = webhookContext();
    expect((await handleLineWebhook(ctx)).status).toBe(200);
    expect((await handleLineWebhook(ctx)).status).toBe(200);
    expect(mocks.request).toHaveBeenCalledOnce();
  });

  it.each([
    { validSignature: false },
    { destination: 'Uanotherbot' },
    { source: { type: 'group', userId: 'Ufixturecustomer' } },
    { eventType: 'messageEdited' },
    { mode: 'standby' },
    { timestamp: 1 },
  ])('skips receipts from ineligible inbound events (%j)', async (options) => {
    await handleLineWebhook(webhookContext(options));
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it.each([['sandbox', 'openai'], ['real', 'fake']])('skips the provider in %s/%s mode', async (lineMode, modelMode) => {
    mocks.config.LINE_MODE = lineMode;
    mocks.config.MODEL_MODE = modelMode;
    expect((await handleLineWebhook(webhookContext())).status).toBe(200);
    expect(mocks.enqueue).toHaveBeenCalledOnce();
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it('skips the receipt when the durable inbound job could not be accepted', async () => {
    mocks.enqueue.mockRejectedValueOnce(new Error('Synthetic queue outage'));
    expect((await handleLineWebhook(webhookContext())).status).toBe(500);
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it.each([
    ['timeout', null],
    ['5xx', { status: 503, body: { message: readToken + accessToken } }],
  ])('keeps the response and reply job independent of a pending receipt that ends in %s', async (_label, failure) => {
    let resolveProvider!: (value: unknown) => void;
    const provider = new Promise<unknown>((resolve) => { resolveProvider = resolve; });
    mocks.request.mockReturnValueOnce(provider);

    try {
      expect((await handleLineWebhook(webhookContext())).status).toBe(200);
      expect(mocks.enqueue).toHaveBeenCalledOnce();
      expect(JSON.parse(mocks.encrypt.mock.calls[0][0]).replyToken).toBe(replyToken);
      expect(mocks.request).toHaveBeenCalledOnce();

      resolveProvider(failure);
      await vi.waitFor(() => expect(mocks.warn).toHaveBeenCalledOnce());
      expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain(readToken);
      expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain(accessToken);
      expect(mocks.request).toHaveBeenCalledOnce();
    } finally {
      resolveProvider(failure);
    }
  });

  it('contains credential decoding errors without logging credential contents', async () => {
    mocks.connection.mockResolvedValueOnce({ ...connection, access_token_enc: accessToken });
    expect((await handleLineWebhook(webhookContext())).status).toBe(200);
    expect(mocks.enqueue).toHaveBeenCalledOnce();
    expect(mocks.request).not.toHaveBeenCalled();
    expect(mocks.warn).toHaveBeenCalledOnce();
    expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain(accessToken);
  });
});
