import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { SEED } from '@nless/shared/core/fixtures';
import type { CreateOrderFromProposalInput } from '@nless/shared/features/orders/types';
import { AppError, db, type JobContext } from '../../core';
import { closeDb } from '../../core/db';
import { createTestAgent, drainJobs, loginAs } from '../../core/test-utils';
import { getProduct } from '../catalog/service';
import * as catalogue from '../catalog/service';
import { getHistory, saveMessage } from '../inbox/service';
import { createOrderFromProposal, getOrderMetrics, listOrdersByCustomer, setPaymentState } from './service';
import { registerOrderHook } from './order-repo';
import { orderOutbox } from './outbox';
const [shopA, shopB] = SEED.businesses;
const sku = 'F13-' + randomUUID();
let admin: Awaited<ReturnType<typeof createTestAgent>>;
let itemId: string;
beforeAll(async () => {
  admin = await createTestAgent();
  await loginAs(admin, 'owner.a@example.test');
  const added = await admin.post('/api/v1/businesses/' + shopA.id + '/catalog/items').set('X-Requested-With', 'nless')
    .send({ sku, kind: 'product', name: 'เกมทดสอบ', nameEn: 'Game fixture', priceMinor: 149000, stock: 100, shippable: true });
  expect(added.status).toBe(201);
  itemId = added.body.data.id;
}, 45000);
async function conversation(lang: 'en' | 'th' = 'en') {
  const row = await saveMessage({ businessId: shopA.id, customer: { channel: 'web', externalId: 'order-confirm-' + randomUUID() }, direction: 'inbound',
    author: 'customer', parts: [{ type: 'text', text: lang === 'en' ? 'How much is this game?' : 'ขอดูราคาค่ะ' }], triggerAi: false });
  return row.conversation;
}
async function fixture(lang: 'en' | 'th' = 'en') {
  const c = await conversation(lang);
  const p = await createOrderFromProposal({ stage: 'propose', businessId: shopA.id, conversationId: c.id, items: [{ ref: { sku }, quantity: 2 }],
    deliveryMethod: 'shipping', clientRequestId: 'ai:' + randomUUID() });
  if (p.stage !== 'propose')
    throw Error('Expected order quote');
  const input: Extract<CreateOrderFromProposalInput, {
    stage: 'confirm';
  }> = { stage: 'confirm', businessId: shopA.id, conversationId: c.id, actor: { kind: 'customer' },
    proposalId: p.proposal.id, version: p.proposal.version, reviewToken: p.proposal.reviewToken, clientRequestId: 'action:' + randomUUID(), decision: 'confirm' };
  return { input, c, p };
}
async function decide(input: Extract<CreateOrderFromProposalInput, {
  stage: 'confirm';
}>) {
  const result = await createOrderFromProposal(input);
  if (result.stage !== 'confirm')
    throw Error('Expected receipt');
  return result;
}
function job(orderId: string): JobContext<{
  orderId: string;
}> {
  return { id: randomUUID(), type: 'orders.outbox', businessId: shopA.id, payload: { orderId },
    attempt: 1, maxAttempts: 6, signal: new AbortController().signal, progress: async () => { } };
}
async function finishOutbox(orderId: string) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const waiting = await orderOutbox(job(orderId));
    if (!waiting)
      return;
    await drainJobs({ type: 'core.deliver' });
  }
  throw Error('Outbox did not finish');
}
afterAll(async () => {
  if (itemId)
    await admin.delete('/api/v1/businesses/' + shopA.id + '/catalog/items/' + itemId).set('X-Requested-With', 'nless');
  await closeDb();
}, 30000);
describe('F13 consent, stock and order outbox', { timeout: 90000 }, () => {
  it('creates once, debits once and links receipts for independent concurrent requests', async () => {
    const { input, c } = await fixture();
    const item = await getProduct(shopA.id, { sku });
    const before = item!.stock!;
    const [left, right] = await Promise.all([decide(input), decide({ ...input, clientRequestId: 'action:' + randomUUID() })]);
    expect(left.order?.id).toBe(right.order?.id);
    expect([left.replayed, right.replayed].sort()).toEqual([false, true]);
    const same = await decide(input);
    expect(same.receiptId).toBe(left.receiptId);
    expect(same.order).toMatchObject({ businessId: shopA.id, conversationId: c.id, totalMinor: 298000, status: 'awaiting_payment', paymentState: 'unpaid' });
    expect((await getProduct(shopA.id, { sku }))!.stock).toBe(before - 2);
    await expect(decide({ ...input, decision: 'cancel' })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    const rows = await db.one<{
      n: number;
    }>('SELECT count(*)::int AS n FROM order_outbox WHERE business_id=$1 AND order_id=$2', [shopA.id, same.order!.id]);
    expect(rows.n).toBe(3);
    const summaries = await listOrdersByCustomer(shopA.id, c.customerId);
    expect(summaries[0].id).toBe(same.order!.id);
    expect(await listOrdersByCustomer(shopB.id, c.customerId)).toEqual([]);
    const range = { from: '2000-01-01T00:00:00Z', to: '2100-01-01T00:00:00Z' };
    await setPaymentState({ businessId: shopA.id, orderId: same.order!.id, to: 'pending_verification', actor: { kind: 'system' } });
    await setPaymentState({ businessId: shopA.id, orderId: same.order!.id, to: 'paid', actor: { kind: 'staff', userId: SEED.users[0].id } });
    const metrics = await getOrderMetrics(shopA.id, range);
    expect(metrics.ordersFromChat).toBeGreaterThan(0);
    expect(metrics.revenueMinor).toBeGreaterThanOrEqual(298000);
    await expect(setPaymentState({ businessId: shopA.id, orderId: same.order!.id, to: 'unpaid', actor: { kind: 'system' } })).rejects.toMatchObject({ code: 'POLICY_BLOCKED' });
  });
  it('rejects wrong tokens, unrelated conversations, expired quotes, and free-text confirmation', async () => {
    const { input, c } = await fixture();
    await expect(decide({ ...input, reviewToken: 'wrong-token' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR', details: { reason: 'bad_review_token' } });
    await expect(decide({ ...input, conversationId: randomUUID() })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(decide({ ...input, businessId: shopB.id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await saveMessage({ businessId: shopA.id, conversationId: c.id, direction: 'inbound', author: 'customer', parts: [{ type: 'text', text: 'ยืนยันแล้ว' }], triggerAi: false });
    expect(await listOrdersByCustomer(shopA.id, c.customerId)).toEqual([]);
    await db.query("UPDATE order_proposals SET expires_at=now()-interval '1 second' WHERE business_id=$1 AND id=$2", [shopA.id, input.proposalId]);
    await expect(decide(input)).rejects.toMatchObject({ code: 'PROPOSAL_EXPIRED' });
  });
  it('cancels an unconfirmed proposal without any order and replays it safely', async () => {
    const { input, c } = await fixture();
    const action = { ...input, decision: 'cancel' as const };
    const result = await decide(action);
    expect(result).toMatchObject({ order: null, decision: 'cancel', replayed: false });
    expect((await decide(action)).replayed).toBe(true);
    await expect(decide({ ...input, clientRequestId: 'next:' + randomUUID() })).rejects.toMatchObject({ code: 'POLICY_BLOCKED', details: { reason: 'proposal_cancelled' } });
    expect(await listOrdersByCustomer(shopA.id, c.customerId)).toEqual([]);
  });
  it('records only actual debits, and restores only earlier debited lines when another item sells out', async () => {
    const c = await conversation();
    const req = { stage: 'propose' as const, businessId: shopA.id, conversationId: c.id, deliveryMethod: 'pickup' as const,
      items: [{ ref: { sku }, quantity: 1 }, { ref: { sku: 'A-CARD-01' }, quantity: 1 }], clientRequestId: 'ai:' + randomUUID() };
    const p = await createOrderFromProposal(req);
    if (p.stage !== 'propose')
      throw Error('Expected quote');
    const input = { stage: 'confirm' as const, businessId: shopA.id, conversationId: c.id, actor: { kind: 'customer' as const }, decision: 'confirm' as const,
      version: p.proposal.version, proposalId: p.proposal.id, reviewToken: p.proposal.reviewToken, clientRequestId: 'action:' + randomUUID() };
    const initial = await getProduct(shopA.id, { sku });
    const card = await getProduct(shopA.id, { sku: 'A-CARD-01' });
    const real = catalogue.adjustCatalogStock;
    const spy = vi.spyOn(catalogue, 'adjustCatalogStock').mockImplementation(async (value) => {
      if (value.itemId === card!.id && value.reason === 'order')
        throw new AppError('SOLD_OUT', 'Race with another buyer');
      return real(value);
    });
    try {
      await expect(decide(input)).rejects.toMatchObject({ code: 'SOLD_OUT' });
      expect((await getProduct(shopA.id, { sku }))!.stock).toBe(initial!.stock);
      expect(spy.mock.calls.filter(([call]) => call.reason === 'order_cancel').map(([call]) => call.itemId)).toEqual([initial!.id]);
      expect(await listOrdersByCustomer(shopA.id, c.customerId)).toEqual([]);
    }
    finally {
      spy.mockRestore();
    }
    const legacy = vi.spyOn(catalogue, 'adjustCatalogStock').mockResolvedValue({ applied: false, stockAfter: null, version: 1 });
    try {
      const { order } = await decide(input);
      const event = await db.one<{
        details: {
          debited: unknown[];
        };
      }>("SELECT details FROM order_events WHERE business_id=$1 AND order_id=$2 AND action='order.create'", [shopA.id, order!.id]);
      expect(event.details.debited).toEqual([]);
    }
    finally {
      legacy.mockRestore();
    }
  });
  it('sends a new card after a price change and replays the same conflict', async () => {
    await createTestAgent();
    const { input, c } = await fixture();
    const original = catalogue.getPrice;
    const quotation = vi.spyOn(catalogue, 'getPrice').mockImplementation(async (...args) => {
      const q = await original(...args);
      return { ...q, unitPriceMinor: 159000, subtotalMinor: 159000 * q.quantity, version: q.version + 1 };
    });
    try {
      const error = await decide(input).catch(e => e);
      expect(error).toMatchObject({ code: 'VERSION_CONFLICT', details: { reason: 'price_changed', requoteVersion: 2 } });
      await expect(decide(input)).rejects.toMatchObject({ code: 'VERSION_CONFLICT', details: { requoteProposalId: error.details.requoteProposalId } });
      expect(await listOrdersByCustomer(shopA.id, c.customerId)).toEqual([]);
      expect((await getHistory(c.id, { businessId: shopA.id })).items.some(m => m.parts.some(p => p.type === 'order_review' && p.totalMinor === 318000))).toBe(true);
    }
    finally {
      quotation.mockRestore();
    }
  });
  it.each(['en', 'th'] as const)('delivers one localized confirmation and fallback, only marking rows done after delivery (%s)', async (lang) => {
    await createTestAgent();
    const { input, c } = await fixture(lang);
    const { order } = await decide(input);
    await finishOutbox(order!.id);
    await finishOutbox(order!.id);
    const history = await getHistory(c.id, { businessId: shopA.id });
    const outgoing = history.items.filter(m => m.author === 'ai');
    expect(outgoing).toHaveLength(2);
    expect(outgoing.every(m => m.delivery.state === 'sent')).toBe(true);
    expect(outgoing[0].text).toContain(lang === 'en' ? 'Total 2,980 baht' : 'ยอดรวม 2,980 บาท');
    expect(outgoing[1].text).toBe(lang === 'en' ? 'The shop will send you the payment details here.' : 'ทางร้านจะแจ้งวิธีชำระเงินให้อีกครั้งนะคะ');
  });
  it('preserves other confirmed listeners across unavailable payments and a successful payment hook suppresses fallback', async () => {
    await createTestAgent();
    const notifyObserver = vi.fn(async () => { });
    const offObserver = registerOrderHook('confirmed', notifyObserver, 'observer');
    const unavailable = registerOrderHook('confirmed', async () => { throw new AppError('POLICY_BLOCKED', 'No payment setup', { details: { reason: 'payments_not_configured' } }); });
    try {
      const { input } = await fixture();
      const { order } = await decide(input);
      await finishOutbox(order!.id);
      expect(notifyObserver).toHaveBeenCalledTimes(1);
    }
    finally {
      unavailable();
      offObserver();
    }
    const paid = vi.fn(async () => { });
    const off = registerOrderHook('confirmed', paid);
    try {
      const { input, c } = await fixture();
      const { order } = await decide(input);
      await finishOutbox(order!.id);
      expect(paid).toHaveBeenCalledTimes(1);
      expect((await getHistory(c.id, { businessId: shopA.id })).items.filter(m => m.author === 'ai')).toHaveLength(1);
    }
    finally {
      off();
    }
  });
});
