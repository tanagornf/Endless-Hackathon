import { randomUUID } from 'node:crypto';
import type { AiTurnTopic } from '@nless/shared/features/ai-agent/types';
import { afterAll, beforeEach, expect, it, vi } from 'vitest';
import { closeDb } from '../../core/db';
import { seedId } from '../../core/seed';
import { createTestAgent, loginAs } from '../../core/test-utils';
import { listAiTurnTopics } from '../ai-agent/service';
import { saveMessage } from '../inbox/service';
import { createOrderFromProposal, listOrdersByCustomer } from '../orders/service';
import { assignConversation, requestHumanHandoff } from '../team/service';
import { merchantReport } from './merchant';

vi.mock('../ai-agent/service', async original => ({
  ...await original<typeof import('../ai-agent/service')>(), listAiTurnTopics: vi.fn(),
}));
vi.mock('../orders/service', async original => {
  const source = await original<typeof import('../orders/service')>();
  return { ...source, listOrdersByCustomer: vi.fn(source.listOrdersByCustomer) };
});

const shop = seedId('biz_demo_a');
const other = seedId('biz_demo_b');
afterAll(closeDb);
beforeEach(() => {
  vi.mocked(listAiTurnTopics).mockReset().mockResolvedValue([]);
  vi.mocked(listOrdersByCustomer).mockReset();
});

function message(businessId: string, input: { channel?: 'line' | 'web'; externalId?: string; occurredAt?: string; origin?: 'live' | 'demo' } = {}) {
  return saveMessage({ businessId, customer: { channel: input.channel ?? 'line', externalId: input.externalId ?? randomUUID() },
    direction: 'inbound', author: 'customer', origin: input.origin ?? 'live', occurredAt: input.occurredAt,
    parts: [{ type: 'text', text: 'Can I order the cards?' }], triggerAi: false });
}

function topic(msg: Awaited<ReturnType<typeof message>>, name = 'Demo cards'): AiTurnTopic {
  const product = { sku: 'A-CARD-01', name, itemId: randomUUID() };
  return {
    turnId: randomUUID(), businessId: msg.conversation.businessId, conversationId: msg.conversation.id,
    customerId: msg.conversation.customerId, inboundMessageId: msg.message.id, inboundCreatedAt: msg.message.createdAt,
    intent: null, productRefs: [product, product], replyMessageId: randomUUID(), finishedAt: msg.message.createdAt,
  };
}

it('counts distinct live LINE chats and buyers, confirmed matching orders, and pending staff support', { timeout: 25_000 }, async () => {
  const buyer = randomUUID();
  const bought = await message(shop, { externalId: buyer });
  await message(shop, { externalId: buyer });
  const waiting = await message(shop);
  const demo = await message(shop, { channel: 'web', origin: 'demo' });
  const liveWeb = await message(shop, { channel: 'web', origin: 'live' });
  const evalMsg = await message(shop, { externalId: 'eval-' + randomUUID() });
  const simulated = await message(shop, { externalId: 'live-sim:' + randomUUID() });
  const foreign = await message(other);
  vi.mocked(listAiTurnTopics).mockResolvedValue([
    topic(bought), topic(waiting), topic(demo), topic(liveWeb), topic(evalMsg), topic(simulated), topic(foreign),
  ]);

  const proposed = await createOrderFromProposal({
    stage: 'propose', businessId: shop, conversationId: bought.conversation.id,
    items: [{ ref: { sku: 'A-CARD-01' }, quantity: 1 }], deliveryMethod: 'shipping', clientRequestId: randomUUID(),
  });
  if (proposed.stage !== 'propose') throw new Error('Expected a proposal');
  const confirmed = await createOrderFromProposal({
    stage: 'confirm', businessId: shop, conversationId: bought.conversation.id, actor: { kind: 'customer' },
    proposalId: proposed.proposal.id, version: proposed.proposal.version, reviewToken: proposed.proposal.reviewToken, decision: 'confirm',
    clientRequestId: randomUUID(),
  });
  if (confirmed.stage !== 'confirm' || !confirmed.order) throw new Error('Expected a confirmed order');
  await requestHumanHandoff(waiting.conversation.id, { reason: 'customer needs help', actor: 'customer' }, { businessId: shop });
  const snapshot = new Date(Date.now() + 2000);
  const report = await merchantReport(shop, 7, snapshot);
  expect(report).toMatchObject({
    conversations: 2, customers: 2, orders: 1, handoffs: 1, pendingSupport: 1,
    products: [{ sku: 'A-CARD-01', conversations: 2, withoutOrder: 1 }],
  });
  expect(vi.mocked(listOrdersByCustomer).mock.calls.every(([id]) => id === shop)).toBe(true);
  const cancelled = { ...confirmed.order, status: 'cancelled' as const };
  vi.mocked(listOrdersByCustomer).mockImplementation(async (_business, customerId) =>
    customerId === bought.conversation.customerId ? [cancelled] : []);
  expect(await merchantReport(shop, 7, snapshot)).toMatchObject({ orders: 0, products: [{ withoutOrder: 2 }] });
  await assignConversation(waiting.conversation.id, null, { businessId: shop });
  expect(await merchantReport(shop, 7, new Date(Date.now() + 2000))).toMatchObject({ handoffs: 1, pendingSupport: 0 });
});

it('includes Bangkok midnight and excludes the preceding millisecond and exclusive end', async () => {
  const now = new Date('2026-10-21T08:00:00.000Z');
  await message(other, { occurredAt: '2026-10-14T16:59:59.999Z' });
  const first = await message(other, { occurredAt: '2026-10-14T17:00:00.000Z' });
  await message(other, { occurredAt: now.toISOString() });
  vi.mocked(listOrdersByCustomer).mockResolvedValue([]);
  vi.mocked(listAiTurnTopics).mockResolvedValue([topic(first)]);
  expect(await merchantReport(other, 7, now)).toMatchObject({
    since: '2026-10-14T17:00:00.000Z', until: now.toISOString(),
    customers: 1, conversations: 1, handoffs: 0, pendingSupport: 0, orders: 0,
    products: [{ conversations: 1, withoutOrder: 1 }],
  });
  expect(await merchantReport(other, 30, now)).toMatchObject({ customers: 2, conversations: 2 });
  expect(await merchantReport(other, 7, new Date('2024-10-21T08:00:00Z'))).toMatchObject({
    customers: 0, conversations: 0, orders: 0, pendingSupport: 0, products: [],
  });
});

it('suppresses unsupported figures and SKU suggestions when a service read is capped', async () => {
  const now = new Date('2026-09-17T01:00:00Z');
  const inbound = await message(shop, { occurredAt: '2026-09-16T17:00:00Z' });
  vi.mocked(listOrdersByCustomer).mockResolvedValue(Array(100).fill(null));
  expect(await merchantReport(shop, 7, now)).toMatchObject({ conversations: 1, orders: null, products: null });
  vi.mocked(listOrdersByCustomer).mockResolvedValue([]);
  vi.mocked(listAiTurnTopics).mockResolvedValue(Array(500).fill(topic(inbound)));
  expect(await merchantReport(shop, 7, now)).toMatchObject({ conversations: 1, orders: 0, products: null });
});

it('requires shop access and validates the report window at the HTTP boundary', { timeout: 15_000 }, async () => {
  const agent = await createTestAgent();
  const path = (id: string) => '/api/v1/businesses/' + id + '/insights/merchant';
  expect((await agent.get(path(shop))).status).toBe(401);
  await loginAs(agent, 'owner.a@example.test');
  expect((await agent.get(path(shop) + '?days=7')).status).toBe(200);
  expect((await agent.get(path(shop) + '?days=365')).status).toBe(400);
  expect((await agent.get(path(other))).status).toBe(404);
  await loginAs(agent, 'staff.a@example.test');
  expect((await agent.get(path(shop) + '?days=30')).status).toBe(403);
});
