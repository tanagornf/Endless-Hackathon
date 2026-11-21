import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../core/errors';
import { consumeLinePostback } from './actions';

const mocks = vi.hoisted(() => ({
  action: vi.fn(), conversation: vi.fn(), language: vi.fn(), save: vi.fn(),
  order: vi.fn(), booking: vi.fn(), send: vi.fn(), notify: vi.fn(),
}));
vi.mock('../../core', async () => ({
  AppError: (await import('../../core/errors')).AppError,
  db: { maybeOne: mocks.action },
  decryptSecret: (value: string) => value.replace('fixture:', ''),
  sendToCustomer: mocks.send,
  log: { warn: vi.fn() },
}));
vi.mock('../inbox/service', () => ({
  getConversation: mocks.conversation, getCustomerLanguage: mocks.language, saveMessage: mocks.save,
}));
vi.mock('../business-settings/service', () => ({ getBusinessSettings: async () => ({ language: 'en' }) }));
vi.mock('../orders/service', () => ({ createOrderFromProposal: mocks.order }));
vi.mock('../booking/service', () => ({ createBooking: mocks.booking }));
vi.mock('../notifications/service', () => ({ notify: mocks.notify }));

const input = {
  businessId: 'shop', customer: { channel: 'line' as const, externalId: 'Ucustomer', channelAccountId: 'Uoa', displayName: 'Test Customer' },
  webhookEventId: 'fixture-event', occurredAt: '2026-11-21T05:00:00.000Z',
  providerMeta: { lineEventId: 'fixture-event' }, data: 'nl:a:abcDEF123456',
};
const action = {
  conversation_id: 'conversation', kind: 'order', proposal_id: 'p1', version: 2,
  decision: 'confirm', review_token_enc: 'fixture:review-token', expires_at: new Date(Date.now() + 60_000),
};

describe('LINE server-owned postbacks', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.action.mockResolvedValue(action);
    mocks.conversation.mockResolvedValue({ id: 'conversation', channel: 'line', customer: input.customer });
    mocks.save.mockResolvedValue({ conversation: { id: 'conversation' } });
    mocks.language.mockResolvedValue('en');
    mocks.order.mockResolvedValue({ stage: 'confirm', replayed: false, decision: 'confirm' });
    mocks.booking.mockResolvedValue({ stage: 'confirm', replayed: false, decision: 'confirm' });
  });

  it('treats a normal postback as inbound customer text and deduplicates by webhook ID', async () => {
    expect(await consumeLinePostback({ ...input, data: 'Interested in Demo Quest' })).toBeNull();
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({
      businessId: input.businessId, externalId: 'pb:fixture-event',
      parts: [{ type: 'text', text: 'Interested in Demo Quest' }], triggerAi: true,
    }));
    expect(mocks.order).not.toHaveBeenCalled();
  });

  it('checks a signed action lookup against tenant and conversation ownership before recording consent', async () => {
    await consumeLinePostback(input);
    expect(mocks.action).toHaveBeenCalledWith(expect.any(String), ['abcDEF123456', 'shop']);
    expect(mocks.conversation).toHaveBeenCalledWith('conversation', { businessId: 'shop' });
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: 'conversation', triggerAi: false, externalId: 'pb:fixture-event',
      parts: [{ type: 'text', text: 'Confirm (order)' }],
    }));
    expect(mocks.order).toHaveBeenCalledWith({
      actor: { kind: 'customer' }, businessId: 'shop', conversationId: 'conversation',
      decision: 'confirm', stage: 'confirm', clientRequestId: 'line-action:abcDEF123456',
      proposalId: 'p1', reviewToken: 'review-token', version: 2,
    });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('does not invoke commerce or write consent when someone else presses the button', async () => {
    mocks.conversation.mockResolvedValue({ channel: 'line', customer: { ...input.customer, externalId: 'Uother' } });
    expect(await consumeLinePostback(input)).toBe('action_owner_mismatch');
    expect(mocks.order).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('handles booking, expired and replayed actions in the customer language', async () => {
    mocks.action.mockResolvedValueOnce({ ...action, kind: 'booking' });
    expect(await consumeLinePostback(input)).toBeNull();
    expect(mocks.booking).toHaveBeenCalledOnce();
    mocks.action.mockResolvedValueOnce({ ...action, expires_at: new Date(0) });
    await consumeLinePostback(input);
    expect(mocks.send).toHaveBeenLastCalledWith('conversation', [{ type: 'text', text: 'This item has expired. Please type your order again.' }], expect.any(Object));
    mocks.order.mockResolvedValueOnce({ stage: 'confirm', replayed: true, decision: 'confirm' });
    await consumeLinePostback(input);
    expect(mocks.send).toHaveBeenLastCalledWith('conversation', [{ type: 'text', text: 'This was already confirmed.' }], expect.any(Object));
  });

  it('rejects malformed action IDs and oversized data without handing them to AI', async () => {
    expect(await consumeLinePostback({ ...input, data: 'nl:a:bad' })).toBe('invalid_postback');
    expect(await consumeLinePostback({ ...input, data: 'x'.repeat(301) })).toBe('invalid_postback');
    expect(mocks.action).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });
});

  it('uses the localized expired notice when an action is absent from this tenant', async () => {
    mocks.action.mockResolvedValueOnce(null);
    expect(await consumeLinePostback(input)).toBeNull();
    expect(mocks.conversation).not.toHaveBeenCalled();
    expect(mocks.order).not.toHaveBeenCalled();
    expect(mocks.send).toHaveBeenCalledWith('conversation', [
      { type: 'text', text: 'This item has expired. Please type your order again.' },
    ], expect.objectContaining({ businessId: 'shop' }));
  });

  it('routes a missing commerce implementation to a localized notice and the owners', async () => {
    mocks.order.mockRejectedValueOnce(new AppError('SERVICE_NOT_READY'));
    await consumeLinePostback(input);
    expect(mocks.send).toHaveBeenCalledWith('conversation', [
      { type: 'text', text: 'This service is not available yet. Our team will get back to you.' },
    ], expect.any(Object));
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ businessId: 'shop', to: { role: 'owners' } }));
  });
