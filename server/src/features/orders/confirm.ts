import { createHash, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { CreateOrderFromProposalInput, CreateOrderFromProposalResult } from '@nless/shared/features/orders/types';
import { AppError, auditInTransaction, config, db, jobs, log, publish, sendToCustomer, type DbExecutor } from '../../core';
import { getBusinessSettings } from '../business-settings/service';
import { adjustCatalogStock, getPrice } from '../catalog/service';
import { getCustomerLanguage } from '../inbox/service';
import { getOrder } from './order-repo';
import { propose, type StoredLine } from './propose';
import { getOrderSettings, shippingRule } from './settings';
import { computeShipping } from './shipping';
type Input = Extract<CreateOrderFromProposalInput, {
  stage: 'confirm';
}>;
type Result = Extract<CreateOrderFromProposalResult, {
  stage: 'confirm';
}>;
type Receipt = {
  id: string;
  request_hash: string;
  order_id: string | null;
  decision: Input['decision'];
  conflict_details: Record<string, unknown> | null;
};
type Proposal = {
  id: string;
  state: 'open' | 'cancelled' | 'superseded' | 'expired' | 'confirmed';
  version: number;
  review_token: string;
  customer_id: string;
  expires_at: Date;
  lines: StoredLine[];
  origin: string;
  delivery_method: 'shipping' | 'pickup';
  subtotal_minor: string;
  delivery_fee_minor: string;
  total_minor: string;
};
const shape = z.strictObject({ stage: z.literal('confirm'), businessId: z.string().uuid(), conversationId: z.string().uuid(), proposalId: z.string().uuid(),
  version: z.number().int().positive(), decision: z.enum(['confirm', 'cancel']), clientRequestId: z.string().min(8).max(80), reviewToken: z.string().min(1).max(200),
  actor: z.strictObject({ kind: z.enum(['customer', 'staff']), userId: z.string().uuid().nullish() }) });
const conflict = (reason: string, details: Record<string, unknown> = {}) => new AppError('VERSION_CONFLICT', 'Proposal changed', { details: { reason, ...details } });
const policy = (reason: string) => new AppError('POLICY_BLOCKED', 'Decision is unavailable', { details: { reason } });
const tokenMatches = (actual: string, expected: string) => {
  const a = Buffer.from(actual), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};
async function proposal(input: Input, ex: DbExecutor = db, lock = false) {
  const row = await ex.maybeOne<Proposal>(`SELECT id,state,version,review_token,customer_id,expires_at,lines,origin,
  delivery_method,subtotal_minor,delivery_fee_minor,total_minor FROM order_proposals
  WHERE business_id=$1 AND conversation_id=$2 AND id=$3` + (lock ? ' FOR UPDATE' : ''), [input.businessId, input.conversationId, input.proposalId]);
  if (!row)
    throw new AppError('NOT_FOUND', 'Proposal not found');
  if (!tokenMatches(input.reviewToken, row.review_token))
    throw new AppError('VALIDATION_ERROR', 'Invalid review token', { details: { reason: 'bad_review_token' } });
  return row;
}
async function receiptFor(input: Input, ex: DbExecutor = db) {
  return ex.maybeOne<Receipt>('SELECT id,request_hash,order_id,decision,conflict_details FROM order_receipts WHERE business_id=$1 AND client_request_id=$2', [input.businessId, input.clientRequestId]);
}
async function receiptResult(input: Input, r: Receipt, hash: string, replayed: boolean): Promise<Result> {
  if (r.request_hash !== hash)
    throw new AppError('IDEMPOTENCY_CONFLICT', 'Request ID already used for a different decision');
  if (!r.order_id && r.decision === 'confirm') {
    if (r.conflict_details)
      throw conflict('price_changed', r.conflict_details);
    const replacement = await db.maybeOne<{
      id: string;
      version: number;
    }>('SELECT id,version FROM order_proposals WHERE business_id=$1 AND client_request_id=$2', [input.businessId, 'requote:' + input.proposalId]);
    throw conflict('price_changed', { requoteProposalId: replacement?.id, requoteVersion: replacement?.version });
  }
  const order = r.order_id ? await getOrder(input.businessId, r.order_id) : null;
  if (order)
    await jobs.enqueue('orders.outbox', { orderId: order.id }, { businessId: input.businessId, dedupKey: 'orders.outbox:' + order.id + ':create', lockKey: 'order:' + order.id, maxAttempts: 6 });
  return { stage: 'confirm', receiptId: r.id, order, replayed, decision: r.decision };
}
async function recordReceipt(ex: DbExecutor, input: Input, hash: string, orderId: string | null, conflictDetails: Record<string, unknown> | null = null) {
  const row = await ex.maybeOne<Receipt>(`INSERT INTO order_receipts(business_id,client_request_id,request_hash,proposal_id,decision,order_id,conflict_details)
  VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb) ON CONFLICT (business_id,client_request_id) DO NOTHING RETURNING id,request_hash,order_id,decision,conflict_details`, [input.businessId, input.clientRequestId, hash, input.proposalId, input.decision, orderId, conflictDetails && JSON.stringify(conflictDetails)]);
  if (row)
    return row;
  const prev = await receiptFor(input, ex);
  if (!prev || prev.request_hash !== hash)
    throw new AppError('IDEMPOTENCY_CONFLICT', 'Request ID already used');
  return prev;
}
const alphabet = 'ABCDEFGHJKMNPQRSTVWXYZ';
function orderNumber(timezone: string) {
  const date = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: '2-digit', timeZone: timezone }).formatToParts(new Date());
  const part = (type: string) => date.find(x => x.type === type)!.value.toUpperCase().slice(0, type === 'month' ? 3 : 2);
  const letters = () => Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join('');
  return 'NL-' + part('day') + part('month') + part('year') + '-' + letters() + '-' + letters();
}
async function pricesChanged(input: Input, p: Proposal) {
  const changes: Record<string, unknown>[] = [];
  for (const line of p.lines) {
    let q;
    try {
      q = await getPrice(input.businessId, { itemId: line.itemId, variantId: line.variantId, quantity: line.quantity });
    }
    catch (err) {
      if (err instanceof AppError && err.code === 'NOT_FOUND')
        throw new AppError('SOLD_OUT', 'Product unavailable', { details: { sku: line.sku, reason: 'unavailable' } });
      throw err;
    }
    if (q.soldOut)
      throw new AppError('SOLD_OUT', 'Insufficient stock', { details: { sku: line.sku, available: q.available } });
    if (q.unitPriceMinor !== line.unitPriceMinor)
      changes.push({ field: 'price', sku: line.sku, old: line.unitPriceMinor, current: q.unitPriceMinor });
  }
  const settings = await getOrderSettings(input.businessId);
  if (!settings.enabled)
    throw policy('orders_disabled');
  if (p.delivery_method === 'pickup' && !settings.pickupEnabled)
    throw policy('pickup_disabled');
  const fee = computeShipping(shippingRule(settings), Number(p.subtotal_minor), p.delivery_method);
  if (fee !== Number(p.delivery_fee_minor))
    changes.push({ field: 'delivery_fee', old: Number(p.delivery_fee_minor), current: fee });
  return changes;
}
async function freshQuote(input: Input, p: Proposal, hash: string, changes: Record<string, unknown>[]) {
  await db.query("UPDATE order_proposals SET state='superseded',decided_at=now() WHERE business_id=$1 AND id=$2 AND state='open'", [input.businessId, p.id]);
  const next = await propose({ stage: 'propose', businessId: input.businessId, conversationId: input.conversationId, deliveryMethod: p.delivery_method,
    clientRequestId: 'requote:' + p.id, items: p.lines.map(l => ({ ref: { itemId: l.itemId }, variantId: l.variantId, quantity: l.quantity })) }, { id: p.id, origin: p.origin });
  const lang = await getCustomerLanguage(input.conversationId, { businessId: input.businessId });
  const text = lang === 'en' ? 'The price or delivery fee has changed. Please check the new summary.' : 'ราคาหรือค่าจัดส่งมีการเปลี่ยนแปลงค่ะ รบกวนตรวจสอบใบสรุปใหม่อีกครั้งนะคะ';
  await sendToCustomer(input.conversationId, [{ type: 'text', text }, next.review], { businessId: input.businessId, author: 'ai', origin: 'system', clientRequestId: 'requote-msg:' + p.id });
  const details = { changes, requoteProposalId: next.proposal.id, requoteVersion: next.proposal.version };
  await recordReceipt(db, input, hash, null, details);
  throw conflict('price_changed', details);
}
async function createOrder(input: Input, p: Proposal, hash: string) {
  const orderId = randomUUID();
  const timezone = (await getBusinessSettings(input.businessId)).timezone;
  const debited: StoredLine[] = [];
  let receipt: Receipt;
  try {
    for (const line of p.lines) {
      const moved = await adjustCatalogStock({ businessId: input.businessId, itemId: line.itemId, variantId: line.variantId, delta: -line.quantity,
        reason: 'order', refType: 'order', refId: orderId, actorUserId: null });
      if (moved.stockAfter !== null)
        debited.push(line);
    }
    receipt = await db.tx(async (tx) => {
      const locked = await proposal(input, tx, true);
      if (locked.state !== 'open')
        throw conflict('superseded');
      if (locked.expires_at.getTime() <= Date.now())
        throw new AppError('PROPOSAL_EXPIRED', 'Proposal expired');
      let number = '';
      for (let n = 0; n < 5; n++) {
        number = orderNumber(timezone);
        const row = await tx.maybeOne(`INSERT INTO orders(id,business_id,order_number,conversation_id,customer_id,proposal_id,origin,delivery_method,
     subtotal_minor,delivery_fee_minor,total_minor) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (business_id,order_number) DO NOTHING RETURNING id`, [orderId, input.businessId, number, input.conversationId, p.customer_id, p.id, p.origin, p.delivery_method, p.subtotal_minor, p.delivery_fee_minor, p.total_minor]);
        if (row)
          break;
        if (n === 4)
          throw new AppError('INTERNAL', 'Could not allocate an order number', { retryable: true });
      }
      for (const [index, l] of p.lines.entries())
        await tx.query(`INSERT INTO order_items(order_id,business_id,line_no,item_id,variant_id,sku,name,
    quantity,unit_price_minor,line_total_minor,catalog_version) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [orderId, input.businessId, index + 1, l.itemId, l.variantId, l.sku, l.name, l.quantity, l.unitPriceMinor, l.lineTotalMinor, l.catalogVersion]);
      const details = { debited: debited.map(({ itemId, variantId, quantity }) => ({ itemId, variantId, quantity })) };
      await tx.query(`INSERT INTO order_events(business_id,order_id,action,to_status,to_payment,actor_kind,actor_user_id,details)
    VALUES ($1,$2,'order.create','awaiting_payment','unpaid',$3,$4,$5::jsonb)`, [input.businessId, orderId, input.actor.kind, input.actor.userId ?? null, JSON.stringify(details)]);
      await tx.query("UPDATE order_proposals SET state='confirmed',decided_at=now() WHERE business_id=$1 AND id=$2", [input.businessId, p.id]);
      await tx.query(`INSERT INTO order_outbox(business_id,order_id,kind) VALUES ($1,$2,'confirmation'),($1,$2,'payment_request'),($1,$2,'staff_notify')`, [input.businessId, orderId]);
      await auditInTransaction(tx, [{ action: 'orders.order.create', actorUserId: input.actor.userId ?? null, businessId: input.businessId, targetType: 'order',
          targetId: orderId, details: { orderNumber: number, totalMinor: Number(p.total_minor), origin: p.origin, lineCount: p.lines.length } }]);
      return recordReceipt(tx, input, hash, orderId);
    });
  }
  catch (error) {
    for (const line of debited)
      await adjustCatalogStock({ businessId: input.businessId, itemId: line.itemId, variantId: line.variantId, delta: line.quantity,
        reason: 'order_cancel', refType: 'order_cancel', refId: orderId, actorUserId: null });
    throw error;
  }
  publish(input.businessId, { type: 'custom', featureId: 'F13', name: 'orders.changed', data: { orderId } });
  return receiptResult(input, receipt, hash, false);
}
async function decide(input: Input, hash: string): Promise<Result> {
  const p = await proposal(input);
  const existing = await receiptFor(input);
  if (existing)
    return receiptResult(input, existing, hash, true);
  if (input.version !== p.version || p.state === 'superseded') {
    const latest = await db.maybeOne<{
      id: string;
      client_request_id: string;
    }>('SELECT id,client_request_id FROM order_proposals WHERE business_id=$1 AND conversation_id=$2 ORDER BY version DESC LIMIT 1', [input.businessId, input.conversationId]);
    if (input.version === p.version && input.decision === 'confirm' && latest?.client_request_id === 'requote:' + p.id) {
      await freshQuote(input, p, hash, await pricesChanged(input, p));
    }
    throw conflict('superseded', { latestProposalId: latest?.id });
  }
  if (p.state === 'confirmed' || p.state === 'cancelled') {
    if (p.state === 'confirmed' && input.decision === 'cancel')
      throw policy('already_confirmed');
    if (p.state === 'cancelled' && input.decision === 'confirm')
      throw policy('proposal_cancelled');
    const order = await db.maybeOne<{
      id: string;
    }>('SELECT id FROM orders WHERE business_id=$1 AND proposal_id=$2', [input.businessId, p.id]);
    return receiptResult(input, await recordReceipt(db, input, hash, order?.id ?? null), hash, true);
  }
  if (p.state === 'expired' || p.expires_at.getTime() <= Date.now()) {
    await db.query("UPDATE order_proposals SET state='expired',decided_at=now() WHERE business_id=$1 AND id=$2 AND state='open'", [input.businessId, p.id]);
    throw new AppError('PROPOSAL_EXPIRED', 'Proposal expired');
  }
  if (input.decision === 'cancel') {
    const r = await db.tx(async (tx) => {
      const changed = await tx.query("UPDATE order_proposals SET state='cancelled',decided_at=now() WHERE business_id=$1 AND id=$2 AND state='open'", [input.businessId, p.id]);
      if (!changed.rowCount)
        throw conflict('superseded');
      return recordReceipt(tx, input, hash, null);
    });
    try {
      const lang = await getCustomerLanguage(input.conversationId, { businessId: input.businessId });
      const text = lang === 'en' ? 'Your order request has been cancelled.' : 'ยกเลิกรายการสั่งซื้อให้แล้วค่ะ';
      await sendToCustomer(input.conversationId, [{ type: 'text', text }], { businessId: input.businessId, author: 'ai', origin: 'system', clientRequestId: 'proposal-cancel:' + p.id });
    }
    catch {
      log.warn({ proposalId: p.id }, 'Proposal cancelled; notice delivery unavailable');
    }
    return receiptResult(input, r, hash, false);
  }
  const changes = await pricesChanged(input, p);
  if (changes.length)
    await freshQuote(input, p, hash, changes);
  return createOrder(input, p, hash);
}
// An advisory lock uses a pooled connection. Bound simultaneous holders so catalog and inbox calls can still obtain one.
const active = new Set<Promise<unknown>>();
async function serializedDecision(input: Input, hash: string) {
  const capacity = Math.max(1, Math.floor(config.DB_POOL_MAX / 2));
  while (active.size >= capacity)
    await Promise.race(active).catch(() => { });
  const pending = db.withAdvisoryLock('order-decision:' + input.businessId + ':' + input.proposalId, () => decide(input, hash));
  active.add(pending);
  try {
    return await pending;
  }
  finally {
    active.delete(pending);
  }
}
export async function confirm(input: Input): Promise<Result> {
  if (!shape.safeParse(input).success || (input.actor.kind === 'staff' && !input.actor.userId))
    throw new AppError('VALIDATION_ERROR', 'Invalid order decision');
  const hash = createHash('sha256').update(JSON.stringify([input.proposalId, input.version, input.decision, input.reviewToken])).digest('hex');
  return serializedDecision(input, hash);
}
