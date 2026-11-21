import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConversationRecord, MessageRecord } from '@nless/shared/features/inbox/types';
import { sendToCustomer } from '../../core';
import { getEffectiveAnswerRules } from '../business-settings/service';
import { getConversation, getHistory } from '../inbox/service';
import { isAiAllowed } from './gate';
import { createOwnerConsultResumeHandler, OWNER_CONSULT_RESUME_JOB } from './ownerConsult';

vi.mock('../../core', () => ({ sendToCustomer: vi.fn() }));
vi.mock('../business-settings/service', () => ({ getEffectiveAnswerRules: vi.fn() }));
vi.mock('../inbox/service', () => ({ getConversation: vi.fn(), getHistory: vi.fn() }));
vi.mock('../catalog/service', () => ({}));
vi.mock('../knowledge-search/service', () => ({}));
vi.mock('./gate', () => ({ isAiAllowed: vi.fn() }));

const businessId = randomUUID();
const conversationId = randomUUID();
const triggerMessageId = randomUUID();
const answerReceiptId = randomUUID();
const caseId = randomUUID();
const receivedAt = '2026-11-21T07:50:00.000Z';
const payload = { businessId, caseId, actionStepId: 'initial', answerReceiptId };
const conversation: ConversationRecord = {
  id: conversationId, businessId, customerId: randomUUID(),
  customer: { displayName: 'Fixture', externalId: 'fixture', channelAccountId: null },
  channel: 'line', status: 'open', handler: 'ai', assigneeUserId: null, aiForceOn: false,
  lastMessageAt: receivedAt, lastInboundAt: receivedAt, unreadCount: 1, version: 1, createdAt: receivedAt,
};
const trigger: MessageRecord = {
  id: triggerMessageId, businessId, conversationId, seq: 1, direction: 'inbound', author: 'customer',
  authorUserId: null, parts: [{ type: 'text', text: 'Do you gift wrap?' }], text: 'Do you gift wrap?',
  channel: 'line', origin: 'live', externalId: null, groupId: null,
  delivery: { mode: null, state: 'not_required', externalRef: null, error: null }, createdAt: receivedAt,
};
const receipt = {
  conversationId, triggerMessageId, answer: 'We can gift wrap your order.', language: 'en' as const,
  reuse: 'case_only' as const, version: 2,
};

const readAnswer = vi.fn<Parameters<typeof createOwnerConsultResumeHandler>[0]>();
const handler = createOwnerConsultResumeHandler(readAnswer);
const job = {
  id: randomUUID(), type: OWNER_CONSULT_RESUME_JOB, payload, businessId,
  attempt: 1, maxAttempts: 5, signal: new AbortController().signal, progress: vi.fn(),
};

beforeEach(() => {
  vi.resetAllMocks();
  readAnswer.mockResolvedValue(receipt);
  vi.mocked(getConversation).mockResolvedValue(conversation);
  vi.mocked(getHistory).mockResolvedValue({ items: [trigger], nextCursor: null });
  vi.mocked(getEffectiveAnswerRules).mockResolvedValue({
    price: 'always', stock: 'always', contact: 'always', generalKnowledge: false,
    booking: false, orders: false, handoff: false,
  });
  vi.mocked(isAiAllowed).mockResolvedValue({ allowed: true, settings: {} as never });
});

describe('F10 owner consultation resume', () => {
  it('uses the exact committed receipt and scoped latest LINE inbound and sends the guarded Thai answer', async () => {
    readAnswer.mockResolvedValue({ ...receipt, answer: '**ทางร้านห่อของขวัญให้ได้ค่ะ**', language: 'th' });
    await handler(job);
    expect(readAnswer).toHaveBeenCalledExactlyOnceWith(payload);
    expect(getConversation).toHaveBeenCalledWith(conversationId, { businessId });
    expect(getHistory).toHaveBeenCalledExactlyOnceWith(conversationId, { businessId, limit: 24 });
    expect(isAiAllowed).toHaveBeenCalledExactlyOnceWith(conversation, trigger, [trigger], 'reply');
    expect(sendToCustomer).toHaveBeenCalledExactlyOnceWith(conversationId, [{ type: 'text', text: 'ทางร้านห่อของขวัญให้ได้ค่ะ' }], {
      businessId, author: 'ai', clientRequestId: 'ai.owner_consult.resume:' + answerReceiptId,
    });
  });

  it('reuses the same outbound idempotency key and parts after an enqueue error, including propose_draft receipts', async () => {
    readAnswer.mockResolvedValue({ ...receipt, reuse: 'propose_draft' });
    vi.mocked(sendToCustomer).mockRejectedValueOnce(new Error('Synthetic enqueue failure'));
    await expect(handler(job)).rejects.toThrow('Synthetic enqueue failure');
    await handler({ ...job, attempt: 2 });
    expect(sendToCustomer).toHaveBeenCalledTimes(2);
    expect(vi.mocked(sendToCustomer).mock.calls[1]).toEqual(vi.mocked(sendToCustomer).mock.calls[0]);
  });

  it('ignores invalid, cross-tenant and cancelled jobs before reading the receipt', async () => {
    await handler({ ...job, payload: { ...payload, actionStepId: 'invalid step' } });
    await handler({ ...job, businessId: randomUUID() });
    await handler({ ...job, signal: AbortSignal.abort() });
    expect(readAnswer).not.toHaveBeenCalled();
    expect(sendToCustomer).not.toHaveBeenCalled();
  });

  it('suppresses missing or uncommitted receipts and never trusts the payload for the answer', async () => {
    readAnswer.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...receipt, version: 1 });
    await handler(job);
    await handler(job);
    expect(getConversation).not.toHaveBeenCalled();
    expect(sendToCustomer).not.toHaveBeenCalled();
  });

  it.each<Partial<ConversationRecord>>([
    { businessId: randomUUID() }, { channel: 'web' }, { status: 'closed' },
    { handler: 'human' }, { assigneeUserId: randomUUID() },
  ])('suppresses an ineligible conversation %j', async (change) => {
    vi.mocked(getConversation).mockResolvedValue({ ...conversation, ...change });
    await handler(job);
    expect(getHistory).not.toHaveBeenCalled();
    expect(sendToCustomer).not.toHaveBeenCalled();
  });

  it.each<Partial<MessageRecord>>([
    { id: randomUUID() }, { businessId: randomUUID() }, { conversationId: randomUUID() }, { channel: 'web' },
  ])('suppresses an unrelated original inbound %j', async (change) => {
    vi.mocked(getHistory).mockResolvedValue({ items: [{ ...trigger, ...change }], nextCursor: null });
    await handler(job);
    expect(sendToCustomer).not.toHaveBeenCalled();
  });

  it('suppresses a consultation after a newer customer message or staff reply', async () => {
    const newer = { ...trigger, id: randomUUID(), seq: 2 };
    vi.mocked(getHistory)
      .mockResolvedValueOnce({ items: [trigger, newer], nextCursor: null })
      .mockResolvedValueOnce({ items: [trigger, { ...newer, author: 'staff', direction: 'outbound' }], nextCursor: null });
    await handler(job);
    await handler(job);
    expect(sendToCustomer).not.toHaveBeenCalled();
  });

  it('suppresses changed conversation and an AI-off gate after checking the answer', async () => {
    vi.mocked(getConversation).mockResolvedValueOnce(conversation).mockResolvedValueOnce({ ...conversation, version: 2 });
    vi.mocked(isAiAllowed).mockResolvedValueOnce({ allowed: false, reason: 'ai_off' });
    await handler(job);
    await handler(job);
    expect(isAiAllowed).toHaveBeenCalledTimes(1);
    expect(sendToCustomer).not.toHaveBeenCalled();
  });

  it.each([
    'The item costs 990 baht.', 'Yes, it is in stock.', 'See https://example.test for details.',
    'ทางร้านสามารถห่อของขวัญได้ค่ะ', 'ได้ค่ะ', 'Use the card 4111 1111 1111 1111.',
  ])('rejects a guarded owner answer %s', async (answer) => {
    readAnswer.mockResolvedValue({ ...receipt, answer });
    await handler(job);
    expect(sendToCustomer).not.toHaveBeenCalled();
  });
});
