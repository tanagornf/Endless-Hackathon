import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobContext } from '../../core';
import { lineEventJob, type LineEventJobPayload } from './events';

const mocks = vi.hoisted(() => ({
  connection: vi.fn(), finish: vi.fn(), upsert: vi.fn(), contact: vi.fn(), profile: vi.fn(),
  save: vi.fn(), settings: vi.fn(), takeover: vi.fn(), request: vi.fn(), notify: vi.fn(),
}));
vi.mock('../../core', () => ({
  config: { LINE_MODE: 'real' },
  decryptSecret: (value: string) => value,
  log: { warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('./repo', () => ({
  findJobConnection: mocks.connection, finishEvent: mocks.finish, setFollowing: mocks.upsert,
  findContact: mocks.contact, cacheProfile: mocks.profile,
}));
vi.mock('./lineApi', () => ({ lineRequest: mocks.request }));
vi.mock('./connection', () => ({ getAccessToken: vi.fn().mockResolvedValue('test-access-token') }));
vi.mock('../inbox/service', () => ({ saveMessage: mocks.save }));
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
