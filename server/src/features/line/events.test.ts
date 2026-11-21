import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobContext } from '../../core';
import { lineEventJob, type LineEventJobPayload } from './events';

const mocks = vi.hoisted(() => ({
  connection: vi.fn(), finish: vi.fn(), upsert: vi.fn(), contact: vi.fn(), profile: vi.fn(),
  save: vi.fn(), settings: vi.fn(), takeover: vi.fn(), request: vi.fn(), notify: vi.fn(),
  hasInbound: vi.fn(), claimNotice: vi.fn(), releaseNotice: vi.fn(), attachment: vi.fn(), postback: vi.fn(), send: vi.fn(),
}));
vi.mock('../../core', () => ({
  config: { LINE_MODE: 'real' },
  decryptSecret: (value: string) => value, sendToCustomer: mocks.send,
  log: { warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('./repo', () => ({
  findJobConnection: mocks.connection, finishEvent: mocks.finish, setFollowing: mocks.upsert,
  findContact: mocks.contact, cacheProfile: mocks.profile, hasSavedInbound: mocks.hasInbound,
  claimAudioNotice: mocks.claimNotice, releaseAudioNotice: mocks.releaseNotice,
}));
vi.mock('./lineApi', () => ({ lineRequest: mocks.request }));
vi.mock('./connection', () => ({ getAccessToken: vi.fn().mockResolvedValue('test-access-token') }));
vi.mock('../inbox/service', () => ({ saveMessage: mocks.save, getCustomerLanguage: async () => 'en' }));
vi.mock('./inboundMedia', () => ({ inboundAttachment: mocks.attachment, lineAttachmentTypes: new Set(['image', 'audio']) }));
vi.mock('./actions', () => ({ consumeLinePostback: mocks.postback }));
vi.mock('../team/service', () => ({ isHumanTakeover: mocks.takeover }));
vi.mock('../business-settings/service', () => ({ getBusinessSettings: mocks.settings }));
vi.mock('../notifications/service', () => ({ notify: mocks.notify }));

function job(overrides: Record<string, unknown> = {}): JobContext<LineEventJobPayload> {
  const now = Date.now();
  const webhookEventId = 'event-1';
  const payload = {
    type: 'message', webhookEventId, timestamp: now,
    source: { type: 'user', userId: 'Utest' },
    replyToken: 'test-reply-token',
    message: { type: 'text', id: '1234567', text: '  Hello สวัสดี  ' },
    ...overrides,
  };
  return {
    id: 'test-job', type: 'line.event', businessId: 'business', attempt: 1, maxAttempts: 5,
    signal: new AbortController().signal, progress: vi.fn(),
    payload: { connectionId: 'connection', event: { webhookEventId, encrypted: JSON.stringify(payload) }, receivedAtMs: now },
  };
}

describe('LINE inbound job', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connection.mockResolvedValue({ id: 'connection', business_id: 'business', business_status: 'active', bot_user_id: 'Ubot' });
    mocks.contact.mockResolvedValue({ display_name: 'Test customer', profile_fetched_at: new Date() });
    mocks.settings.mockResolvedValue({ aiEnabled: true, language: 'en' });
    mocks.takeover.mockResolvedValue(false);
    mocks.hasInbound.mockResolvedValue(false);
    mocks.attachment.mockResolvedValue({ parts: [{ type: 'image', fileId: 'attachment', alt: 'Picture from customer' }], triggerAi: true });
    mocks.postback.mockResolvedValue(null);
    mocks.save.mockResolvedValue({ created: true, aiJobId: 'ai-job', conversation: { id: 'conversation' } });
  });

  it('saves normalized bilingual text and records the provider reply-token window', async () => {
    const task = job();
    await lineEventJob(task);
    const issued = task.payload.receivedAtMs;
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({
      businessId: 'business', externalId: '1234567',
      customer: { channel: 'line', externalId: 'Utest', displayName: 'Test customer', channelAccountId: 'Ubot' },
      parts: [{ type: 'text', text: 'Hello สวัสดี' }],
      providerMeta: { replyToken: 'test-reply-token', replyTokenIssuedAt: new Date(issued).toISOString(),
        replyTokenExpiresAt: new Date(issued + 50_000).toISOString(), lineEventId: 'event-1' },
    }));
    expect(mocks.request).toHaveBeenCalledWith('/v2/bot/chat/loading/start', expect.objectContaining({
      json: { chatId: 'Utest', loadingSeconds: 30 },
    }));
  });

  it('does not show a typing animation for a replay, disabled AI or staff takeover', async () => {
    mocks.save.mockResolvedValueOnce({ created: false, aiJobId: null });
    await lineEventJob(job());
    mocks.settings.mockResolvedValueOnce({ aiEnabled: false });
    await lineEventJob(job());
    mocks.takeover.mockResolvedValueOnce(true);
    await lineEventJob(job());
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it('ignores stale and non-user events, and updates follow status without a message', async () => {
    await lineEventJob(job({ timestamp: Date.now() - 3 * 86_400_000 }));
    await lineEventJob(job({ source: { type: 'group', userId: 'Utest' } }));
    await lineEventJob(job({ type: 'follow' }));
    await lineEventJob(job({ type: 'unfollow' }));
    expect(mocks.finish).toHaveBeenCalledWith('event-1', 'business', 'ignored', 'stale');
    expect(mocks.finish).toHaveBeenCalledWith('event-1', 'business', 'ignored', 'group_source');
    expect(mocks.upsert.mock.calls.map((call) => call[2])).toEqual([true, false]);
    expect(mocks.save).not.toHaveBeenCalled();
  });
});

  it('does not redownload a previously saved attachment and passes newly saved image parts through to the inbox', async () => {
    const message = { id: '1234567', type: 'image' };
    mocks.hasInbound.mockResolvedValueOnce(true);
    await lineEventJob(job({ message }));
    expect(mocks.attachment).not.toHaveBeenCalled();
    await lineEventJob(job({ message }));
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({
      externalId: '1234567', parts: [{ type: 'image', fileId: 'attachment', alt: 'Picture from customer' }],
    }));
  });

  it('saves audio without AI and queues the localized voice notice once per claim', async () => {
    const message = { id: '7654321', type: 'audio' };
    mocks.attachment.mockResolvedValue({ parts: [{ type: 'text', text: '[Voice message]' }], triggerAi: false });
    mocks.save.mockResolvedValue({ created: true, aiJobId: null, conversation: { id: 'conversation' } });
    mocks.claimNotice.mockResolvedValueOnce(new Date()).mockResolvedValueOnce(null);
    await lineEventJob(job({ message }));
    await lineEventJob(job({ message }));
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ triggerAi: false }));
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.send).toHaveBeenCalledWith('conversation', [
      { type: 'text', text: 'Sorry, I cannot listen to voice messages yet. Please type your message.' },
    ], expect.objectContaining({ businessId: 'business', clientRequestId: 'line-audio-notice:event-1' }));
  });

  it('preserves event scope and reply metadata when passing a postback to the action service', async () => {
    await lineEventJob(job({ type: 'postback', postback: { data: 'nl:a:abcDEF123456' } }));
    expect(mocks.postback).toHaveBeenCalledWith(expect.objectContaining({
      data: 'nl:a:abcDEF123456', businessId: 'business', webhookEventId: 'event-1',
      providerMeta: expect.objectContaining({ replyToken: 'test-reply-token' }),
    }));
  });
