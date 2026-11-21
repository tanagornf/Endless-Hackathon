import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { EffectiveAnswerRules } from '@nless/shared/features/business-settings/types';
import type { SaveMessageResult } from '@nless/shared/features/inbox/types';
import { AppError, drainJobs, model, type ModelChatInput } from '../../core';
import { closeDb } from '../../core/db';
import { seedId } from '../../core/seed';
import * as settings from '../business-settings/service';
import { getHistory, saveMessage } from '../inbox/service';
import * as orders from '../orders/service';
import { getTurnTrace } from './service';
import { runAiTurn } from './turn';

const shop = seedId('biz_demo_a');
const otherShop = seedId('biz_demo_b');
const allow: EffectiveAnswerRules = {
  price: 'always', stock: 'always', contact: 'always', generalKnowledge: false, booking: false, orders: true, handoff: false,
};
const original = model.chat.bind(model);
const openProposal = orders.createOrderFromProposal;
const line = (sku = 'A-GAME-01', quantity = 2) => ({ sku, name: null, variant_name: null, quantity });

function scripted(args: Record<string, unknown>, final = 'Your order has been confirmed.') {
  const orderCall = { id: 'call-order', name: 'propose_order', arguments: args };
  return vi.spyOn(model, 'chat').mockImplementation((input: ModelChatInput) =>
    input.usage.purpose === 'classify' ? original(input) : original({
      ...input, fake: input.messages.some(({ role }) => role === 'tool') ? { text: final } : { toolCalls: [orderCall] },
    }));
}

function incoming(text: string, prior?: SaveMessageResult) {
  return saveMessage({
    businessId: shop, conversationId: prior?.conversation.id,
    customer: prior ? undefined : { channel: 'web', externalId: 'order-f10-' + randomUUID() },
    direction: 'inbound', author: 'customer', triggerAi: false, parts: [{ type: 'text', text }],
  });
}

const run = (input: SaveMessageResult, businessId = shop, deliver = true) => runAiTurn(input.conversation.id, {
  businessId, triggerMessageId: input.message.id, deliver,
});

beforeEach(() => { vi.spyOn(settings, 'getEffectiveAnswerRules').mockResolvedValue(allow); });
afterEach(() => vi.restoreAllMocks());
afterAll(closeDb);

it('saves and delivers the same Thai F13 order review once and never confirms from typed text', async () => {
  const calls = vi.spyOn(orders, 'createOrderFromProposal');
  const chat = scripted({ items: [line()], delivery_method: 'shipping' });
  const input = await incoming('เอา A-GAME-01 2 กล่อง ส่งที่บ้าน');
  const first = await run(input);
  await drainJobs({ type: 'core.deliver' });
  const second = await run(input);
  const { response } = first;
  expect(response.state).toBe('awaiting_confirmation');
  expect(response.reply.parts[0]).toMatchObject({ type: 'text', text: expect.stringContaining('กดยืนยัน') });
  const card = response.reply.parts.find(({ type }) => type === 'order_review');
  expect(card).toMatchObject({
    subtotalMinor: 298000, proposalId: response.proposal?.id,
    lines: [expect.objectContaining({ sku: 'A-GAME-01', quantity: 2, unitPriceMinor: 149000 })],
  });
  expect(second.response.proposal).toEqual(response.proposal);
  expect(second.response.reply).toEqual(response.reply);
  expect(calls).toHaveBeenCalledTimes(1);
  expect(calls).toHaveBeenCalledWith(expect.objectContaining({
    stage: 'propose', clientRequestId: 'ai:' + response.turnId + ':order', businessId: shop, deliveryMethod: 'shipping',
  }));
  expect(chat.mock.calls.flatMap(([request]) => request.messages).map((message) => JSON.stringify(message)).join()).not.toContain(response.proposal!.reviewToken);
  const history = await getHistory(input.conversation.id, { businessId: shop });
  expect(history.items.filter(({ author, parts }) => author === 'ai' && parts.some(({ type }) => type === 'order_review'))).toHaveLength(1);
  const trace = await getTurnTrace(shop, response.turnId);
  expect(trace).toMatchObject({ state: 'awaiting_confirmation', intent: 'REQUEST', replyLanguage: 'th', replyMessageId: expect.any(String) });
  const decision = await run(await incoming('ยืนยันค่ะ', input));
  expect(decision.response.reply.parts).toMatchObject([{ type: 'text', text: expect.stringContaining('กดยืนยัน') }]);
  expect(calls).toHaveBeenCalledTimes(1);
  await drainJobs({ type: 'core.deliver' });
}, 20_000);

it('recovers a committed English proposal after a lost acknowledgement on the same F10 turn', async () => {
  const chat = scripted({ items: [line()], delivery_method: 'pickup' });
  const committedIds: string[] = [];
  const operation = vi.spyOn(orders, 'createOrderFromProposal').mockImplementation(async (request) => {
    const saved = await openProposal(request);
    if (saved.stage !== 'propose') throw new Error('Unexpected confirmation');
    committedIds.push(saved.proposal.id);
    if (committedIds.length === 1) throw new AppError('SERVICE_NOT_READY', 'Lost the proposal acknowledgement', { retryable: true });
    return saved;
  });
  const input = await incoming('Please order 2 A-GAME-01 for pickup.');
  await expect(run(input, shop, false)).rejects.toThrow('Lost the proposal acknowledgement');
  const originalCallCount = chat.mock.calls.length;
  const recovered = await run(input, shop, false);
  expect(recovered.response.state).toBe('awaiting_confirmation');
  expect(recovered.response.reply.parts[0]).toMatchObject({ text: expect.stringContaining('press confirm') });
  expect(recovered.response.reply.parts[1]).toMatchObject({ type: 'order_review', deliveryFeeMinor: 0, totalMinor: 298000 });
  expect(committedIds).toEqual([recovered.response.proposal?.id, recovered.response.proposal?.id]);
  expect(operation.mock.calls[0]).toEqual(operation.mock.calls[1]);
  expect(chat).toHaveBeenCalledTimes(originalCallCount);
  const sent = await run(input);
  expect(sent.response.proposal).toEqual(recovered.response.proposal);
  expect(operation).toHaveBeenCalledTimes(2);
  await drainJobs({ type: 'core.deliver' });
}, 20_000);

it.each([
  ['quote only', 'How much is A-GAME-01 for shipping?', [line()]],
  ['conditional', 'Please order A-GAME-01 x2 for shipping if I say yes.', [line()]],
  ['wrong item', 'Please order A-CARD-01 x2 for shipping.', [line()]],
  ['wrong quantity', 'Please order A-GAME-01 x3 for shipping.', [line()]],
  ['partial basket', 'Please order A-GAME-01 x2 and 3 card boxes for shipping.', [line()]],
  ['sold out', 'Please order A-SOLD-01 x1 for shipping.', [line('A-SOLD-01', 1)]],
])('rejects a model proposal for %s', async (_case, text, items) => {
  const calls = vi.spyOn(orders, 'createOrderFromProposal');
  scripted({ items, delivery_method: 'shipping' });
  const result = await run(await incoming(text), shop, false);
  expect(result.response.proposal).toBeUndefined();
  expect(result.response.reply.parts.some(({ type }) => type === 'order_review')).toBe(false);
  expect(calls).not.toHaveBeenCalled();
}, 15_000);

it('blocks cross-tenant, staff suggestion and policy-hidden proposal paths before F13', async () => {
  const calls = vi.spyOn(orders, 'createOrderFromProposal');
  scripted({ items: [line()], delivery_method: 'pickup' });
  const input = await incoming('Please order 2 A-GAME-01 for pickup.');
  expect((await run(input, otherShop)).response.state).toBe('failed');
  const suggestion = await runAiTurn(input.conversation.id, { mode: 'suggest', businessId: shop, triggerMessageId: input.message.id });
  expect(suggestion.response.proposal).toBeUndefined();
  vi.mocked(settings.getEffectiveAnswerRules).mockResolvedValue({ ...allow, orders: false });
  expect((await run(input, shop, false)).response.proposal).toBeUndefined();
  expect(calls).not.toHaveBeenCalled();
}, 15_000);

it('never converts a previous buy request into a proposal on a new neutral trigger', async () => {
  const calls = vi.spyOn(orders, 'createOrderFromProposal');
  scripted({ items: [line()], delivery_method: 'pickup' }, 'Please review your order summary.');
  const previous = await incoming('Please order 2 A-GAME-01 for pickup.');
  const latest = await incoming('👍', previous);
  const result = await run(latest, shop, false);
  expect(calls).not.toHaveBeenCalled();
  expect(result.response.proposal).toBeUndefined();
  expect(result.response.reply.parts).not.toContainEqual({ type: 'text', text: 'Please review your order summary.' });
}, 15_000);
