import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isOwnerConsultActionPending } from './owner-consult';

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), conversation: vi.fn() }));
vi.mock('../../core', () => ({ db: { maybeOne: mocks.lookup } }));
vi.mock('../inbox/service', () => ({ getConversation: mocks.conversation }));

const key = { businessId: randomUUID(), caseId: randomUUID(), actionStepId: 'initial' };
const conversationId = randomUUID();

beforeEach(() => {
  vi.resetAllMocks();
  mocks.lookup.mockResolvedValue({ conversationId });
});

describe('owner consultation eligibility', () => {
  it.each([
    { handler: 'human', status: 'open' },
    { handler: 'ai', status: 'closed' },
    null,
  ])('rejects a pending owner action after the conversation is unavailable: %j', async (conversation) => {
    mocks.conversation.mockResolvedValue(conversation);
    await expect(isOwnerConsultActionPending(key)).resolves.toBe(false);
    expect(mocks.conversation).toHaveBeenCalledExactlyOnceWith(conversationId, { businessId: key.businessId });
  });

  it('keeps an open AI-handled LINE conversation actionable', async () => {
    mocks.conversation.mockResolvedValue({ handler: 'ai', status: 'open', channel: 'line' });
    await expect(isOwnerConsultActionPending(key)).resolves.toBe(true);
  });
});
