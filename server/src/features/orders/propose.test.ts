import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { SEED } from '@nless/shared/core/fixtures';
import type { CreateOrderFromProposalInput } from '@nless/shared/features/orders/types';
import { db } from '../../core';
import { closeDb } from '../../core/db';
import { createTestAgent, loginAs } from '../../core/test-utils';
import { getProduct } from '../catalog/service';
import { saveMessage } from '../inbox/service';
import { createOrderFromProposal } from './service';

const [shopA, shopB] = SEED.businesses;
const convA = SEED.conversations.find(row => row.alias === 'conv_a_ai')!.id;
const convB = SEED.conversations.find(row => row.alias === 'conv_b_ai')!.id;
type Input = Extract<CreateOrderFromProposalInput, { stage: 'propose' }>;
const product = (sku: string, quantity = 1) => ({ ref: { sku }, quantity });
function input(overrides: Partial<Input> = {}): Input {
  return { stage: 'propose', businessId: shopA.id, conversationId: convA, clientRequestId: 'ai:' + randomUUID(),
    deliveryMethod: 'shipping', items: [product('A-GAME-01', 2)], ...overrides };
}
async function propose(value: Input) {
  const out = await createOrderFromProposal(value);
  if (out.stage !== 'propose') throw Error('Unexpected confirmation');
  return out;
}
afterAll(closeDb);

describe('F13 immutable order proposals', { timeout: 30000 }, () => {
  it.each([
    [shopA.id, convA, 'A-GAME-01', 2, 298000, 0],
    [shopA.id, convA, 'A-CARD-01', 2, 29800, 10000],
    [shopB.id, convB, 'B-KIT-01', 1, 44000, 5000],
  ] as const)('quotes the seeded catalog and shipping for %s %s %s', async (businessId, conversationId, sku, qty, totalMinor, fee) => {
    const result = await propose(input({ businessId, conversationId, items: [product(sku, qty)] }));
    expect(result.review).toMatchObject({ totalMinor, deliveryFeeMinor: fee, lines: [{ sku, quantity: qty }] });
    expect(result.proposal.reviewToken).toMatch(/^[\w-]{32}$/);
    expect(result.review.expiresAt).toBe(result.proposal.expiresAt);
    expect(result.review.lines[0]).not.toHaveProperty('catalogVersion');
    expect(await db.one('SELECT count(*)::int AS n FROM orders WHERE business_id=$1 AND proposal_id=$2', [businessId, result.proposal.id])).toEqual({ n: 0 });
  });

  it('rejects unknown stock, services, bad variants and cross-tenant product/conversation references', async () => {
    for (const [sku, code] of [['A-SOLD-01','SOLD_OUT'],['A-SERVICE-01','VALIDATION_ERROR'],['B-KIT-01','NOT_FOUND']]) {
      await expect(propose(input({ items: [product(sku)] }))).rejects.toMatchObject({ code });
    }
    await expect(propose(input({ items: [{ ...product('A-GAME-01'), variantId: randomUUID() }] }))).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(propose(input({ conversationId: convB }))).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it.each([0,-1,1.5,'2',100])('rejects quantity %s before reading the catalog', async value => {
    await expect(propose(input({ items: [product('unknown', value as number)] }))).rejects.toMatchObject({
      code: 'VALIDATION_ERROR', details: { field: 'quantity' },
    });
  });

  it('merges aliases on the resolved item, and validates combined stock and quantity', async () => {
    const item = (await getProduct(shopA.id, { sku: 'A-GAME-01' }))!;
    const result = await propose(input({ items: [product(item.sku), { ref: { itemId: item.id }, quantity: 1 }] }));
    expect(result.review.lines).toHaveLength(1);
    expect(result.review.lines[0]).toMatchObject({ itemId: item.id, quantity: 2, lineTotalMinor: 298000 });
    const card = (await getProduct(shopA.id, { sku: 'A-CARD-01' }))!;
    const first = Math.min(card.stock!, 99);
    const code = first === 99 ? 'VALIDATION_ERROR' : 'SOLD_OUT';
    await expect(propose(input({ items: [product(card.sku, first), product(card.sku, 1)] }))).rejects.toMatchObject({ code });
  });

  it('returns the exact same token and expiry on a concurrent replay, and rejects changed payload', async () => {
    const req = input({ items: [product('A-GAME-01'), product('A-CARD-01')] });
    const [first, replayed] = await Promise.all([propose(req), propose({ ...req, items: [...req.items].reverse() })]);
    expect(replayed).toEqual(first);
    await db.query("UPDATE order_proposals SET expires_at=now()-interval '1 second' WHERE id=$1 AND business_id=$2", [first.proposal.id, shopA.id]);
    expect((await propose(req)).review.reviewToken).toBe(first.proposal.reviewToken);
    await expect(propose({ ...req, deliveryMethod: 'pickup' })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });

  it('keeps an English quote immutable after the customer changes to Thai', async () => {
    const original = await saveMessage({ businessId: shopA.id, customer: { channel: 'web', externalId: 'f13-' + randomUUID() },
      direction: 'inbound', author: 'customer', parts: [{ type: 'text', text: 'Can I buy this game?' }], triggerAi: false });
    const req = input({ conversationId: original.conversation.id });
    const english = await propose(req);
    const item = (await getProduct(shopA.id, { sku: 'A-GAME-01' }))!;
    expect(english.proposal.summary).toContain('2,980 baht');
    expect(english.review.lines[0].name).toBe(item.nameEn);
    await saveMessage({ businessId: shopA.id, conversationId: original.conversation.id,
      direction: 'inbound', author: 'customer', parts: [{ type: 'text', text: 'ขอดูราคาค่ะ' }], triggerAi: false });
    expect(await propose(req)).toEqual(english);
    expect((await propose({ ...req, clientRequestId: 'ai:' + randomUUID() })).proposal.summary).toContain('2,980 บาท');
  });

  it('serializes simultaneous new quotes for one conversation and leaves only the latest open', async () => {
    const { conversation } = await saveMessage({ businessId: shopA.id,
      customer: { channel: 'web', externalId: 'f13-' + randomUUID(), displayName: 'Order test' },
      direction: 'inbound', author: 'customer', parts: [{ type: 'text', text: 'Test' }], triggerAi: false });
    await Promise.all([propose(input({ conversationId: conversation.id })), propose(input({ conversationId: conversation.id }))]);
    const rows = await db.query('SELECT state, version FROM order_proposals WHERE business_id=$1 AND conversation_id=$2 ORDER BY version',
      [shopA.id,conversation.id]);
    expect(rows.rows).toEqual([{ state: 'superseded', version: 1 }, { state: 'open', version: 2 }]);
    await db.query("UPDATE conversations SET status='closed' WHERE business_id=$1 AND id=$2", [shopA.id,conversation.id]);
    await expect(propose(input({ conversationId: conversation.id }))).rejects.toMatchObject({ code: 'POLICY_BLOCKED', details: { reason: 'conversation_closed' } });
  });
});

describe('F13 settings route', { timeout: 30000 }, () => {
  it('checks tenant, permissions, version and audit, and enforces the updated pickup rule', async () => {
    const owner = await createTestAgent();
    const staff = await createTestAgent();
    await loginAs(owner, 'owner.a@example.test');
    await loginAs(staff, 'staff.a@example.test');
    const path = '/api/v1/businesses/' + shopA.id + '/orders/settings';
    expect((await owner.get('/api/v1/businesses/' + shopB.id + '/orders/settings')).status).toBe(404);
    const response = await staff.get(path);
    expect(response.status).toBe(200);
    const initial = response.body.data;
    const body = { expectedVersion: initial.version, enabled: true, shippingKind: 'threshold',
      shippingFeeBaht: 100, freeFromSubtotalBaht: 2000, pickupEnabled: false, proposalTtlMinutes: 15, orderExpiryDays: 7 };
    const put = (agent: typeof owner, value: object) => agent.put(path).set('X-Requested-With', 'nless').send(value);
    expect((await put(staff, body)).status).toBe(403);
    expect((await put(owner, { ...body, freeFromSubtotalBaht: null })).status).toBe(400);
    try {
      expect((await put(owner, body)).body.data).toMatchObject({ pickupEnabled: false, version: initial.version+1 });
      expect((await put(owner, body)).status).toBe(409);
      await expect(propose(input({ deliveryMethod: 'pickup' }))).rejects.toMatchObject({ code: 'POLICY_BLOCKED', details: { reason: 'pickup_disabled' } });
      const audit = await db.one<{ n: number }>("SELECT count(*)::int AS n FROM audit_events WHERE business_id=$1 AND action='orders.settings.update'", [shopA.id]);
      expect(audit.n).toBeGreaterThan(0);
    } finally {
      await put(owner, { ...body, expectedVersion: initial.version+1, pickupEnabled: true });
    }
  });
});
