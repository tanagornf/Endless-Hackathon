import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { CustomerLanguage } from '@nless/shared/core/language';
import { formatMoneyText } from '@nless/shared/core/language';
import type { ReviewLine } from '@nless/shared/core/types';
import type { CreateOrderFromProposalInput, CreateOrderFromProposalResult } from '@nless/shared/features/orders/types';
import type { PriceQuote } from '@nless/shared/features/catalog/types';
import { AppError, db, type DbExecutor } from '../../core';
import { getPrice, getProduct } from '../catalog/service';
import { getConversation, getCustomerLanguage } from '../inbox/service';
import { getOrderSettings, shippingRule } from './settings';
import { computeShipping } from './shipping';

type Input = Extract<CreateOrderFromProposalInput, { stage: 'propose' }>;
type Result = Extract<CreateOrderFromProposalResult, { stage: 'propose' }>;
export type StoredLine = ReviewLine & { catalogVersion: number };
interface ProposalRow {
  id: string; version: number; reply_language: CustomerLanguage; expires_at: Date; lines: StoredLine[]; review_token: string;
  subtotal_minor: string; delivery_fee_minor: string; total_minor: string; request_hash: string;
}
const request = z.strictObject({
  stage: z.literal('propose'), businessId: z.string().uuid(), conversationId: z.string().uuid(),
  clientRequestId: z.string().min(8).max(80), deliveryMethod: z.enum(['shipping','pickup']),
  items: z.array(z.strictObject({
    ref: z.union([z.strictObject({ itemId: z.string().uuid() }), z.strictObject({ sku: z.string().trim().min(1).max(80) }),
      z.strictObject({ name: z.string().trim().min(1).max(255) })]),
    variantId: z.string().uuid().nullish(), quantity: z.number().int().min(1).max(99),
  })).min(1).max(20),
});
const columns = 'id,version,reply_language,expires_at,lines,review_token,subtotal_minor,delivery_fee_minor,total_minor,request_hash';

function fromRow(row: ProposalRow): Result {
  const lines = row.lines.map(({ catalogVersion: _version, ...line }) => line);
  const expiresAt = row.expires_at.toISOString();
  const totalMinor = Number(row.total_minor);
  const common = { version: row.version, expiresAt, reviewToken: row.review_token };
  return {
    stage: 'propose', state: 'awaiting_confirmation',
    proposal: { ...common, id: row.id, kind: 'order.create',
      summary: row.reply_language === 'en'
        ? 'Order of ' + lines.length + (lines.length === 1 ? ' item, total ' : ' items, total ') + formatMoneyText(totalMinor, 'en')
        : 'สั่งซื้อ ' + lines.length + ' รายการ ยอดรวม ' + formatMoneyText(totalMinor, 'th') },
    review: { ...common, type: 'order_review', proposalId: row.id, lines, subtotalMinor: Number(row.subtotal_minor),
      deliveryFeeMinor: Number(row.delivery_fee_minor), totalMinor, currency: 'THB' },
  };
}

async function replay(ex: DbExecutor, input: Input, hash: string): Promise<Result | null> {
  const row = await ex.maybeOne<ProposalRow>(`SELECT ${columns} FROM order_proposals
    WHERE business_id=$1 AND client_request_id=$2`, [input.businessId,input.clientRequestId]);
  if (!row) return null;
  if (row.request_hash !== hash) throw new AppError('IDEMPOTENCY_CONFLICT', 'Request ID already used for a different proposal');
  return fromRow(row);
}

async function quoteLines(input: Input, language: CustomerLanguage): Promise<StoredLine[]> {
  const quotes = new Map<string, PriceQuote>();
  for (const line of input.items) {
    const item = await getProduct(input.businessId, line.ref);
    const sku = 'sku' in line.ref ? line.ref.sku : item?.sku;
    if (!item) throw new AppError('NOT_FOUND', 'Product not found', { details: { sku } });
    if (item.kind === 'service' || (input.deliveryMethod === 'shipping' && !item.shippable)) {
      throw new AppError('VALIDATION_ERROR', 'Product cannot be ordered with this delivery method',
        { details: { sku, reason: item.kind === 'service' ? 'service_not_orderable' : 'not_shippable' } });
    }
    const quote = await getPrice(input.businessId, { ...line.ref, variantId: line.variantId, quantity: line.quantity });
    const key = quote.itemId + ':' + (quote.variantId ?? '');
    const prior = quotes.get(key);
    const quantity = line.quantity + (prior?.quantity ?? 0);
    if (quantity > 99) throw new AppError('VALIDATION_ERROR', 'Combined quantity exceeds 99', { details: { field: 'quantity' } });
    const combined = prior ? await getPrice(input.businessId, { itemId: quote.itemId, variantId: quote.variantId, quantity }) : quote;
    if (combined.soldOut) throw new AppError('SOLD_OUT', 'Insufficient stock', { details: { sku: combined.sku, available: combined.available } });
    const variant = item.variants.find(v => v.id === combined.variantId);
    const localizedName = language === 'en' && item.nameEn ? item.nameEn + (variant ? ' — ' + variant.name : '') : combined.name;
    quotes.set(key, { ...combined, name: localizedName });
  }
  return [...quotes.values()].map(q => ({ itemId: q.itemId, variantId: q.variantId, name: q.name, sku: q.sku,
    quantity: q.quantity, unitPriceMinor: q.unitPriceMinor, lineTotalMinor: q.subtotalMinor, catalogVersion: q.version }));
}

export async function propose(raw: Input): Promise<Result> {
  const parsed = request.safeParse(raw);
  if (!parsed.success) throw new AppError('VALIDATION_ERROR', 'Invalid order proposal',
    { details: { field: parsed.error.issues[0]?.path.at(-1) } });
  const input = parsed.data;
  const { businessId, conversationId, clientRequestId, deliveryMethod } = input;
  const conversation = await getConversation(conversationId, { businessId });
  if (!conversation) throw new AppError('NOT_FOUND', 'Conversation not found');
  const items = input.items.map(line => JSON.stringify([line.ref, line.variantId ?? null, line.quantity])).sort();
  const hash = createHash('sha256').update(JSON.stringify([conversationId, items, deliveryMethod])).digest('hex');
  const previous = await replay(db, input, hash);
  if (previous) return previous;
  if (conversation.status === 'closed') throw new AppError('POLICY_BLOCKED', 'Conversation is closed', { details: { reason: 'conversation_closed' } });
  const settings = await getOrderSettings(businessId);
  if (!settings.enabled || (deliveryMethod === 'pickup' && !settings.pickupEnabled)) {
    throw new AppError('POLICY_BLOCKED', 'Order settings disallow proposal',
      { details: { reason: !settings.enabled ? 'orders_disabled' : 'pickup_disabled' } });
  }
  const language = await getCustomerLanguage(conversationId, { businessId });
  const lines = await quoteLines(input, language);
  const rule = shippingRule(settings);
  const subtotal = lines.reduce((total, line) => total + line.lineTotalMinor, 0);
  const fee = computeShipping(rule, subtotal, deliveryMethod);
  const prefix = clientRequestId.split(':')[0];
  const origin = ['ai','staff','live'].includes(prefix) ? prefix : 'other';
  return db.tx(async tx => {
    // Different conversations can reuse an idempotency key concurrently. Acquire both locks in a fixed order.
    await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['order-request:' + businessId + ':' + clientRequestId]);
    await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['order-conversation:' + businessId + ':' + conversationId]);
    const winner = await replay(tx, input, hash);
    if (winner) return winner;
    await tx.query("UPDATE order_proposals SET state='superseded',decided_at=now() WHERE business_id=$1 AND conversation_id=$2 AND state='open'",
      [businessId, conversationId]);
    const row = await tx.one<ProposalRow>(`INSERT INTO order_proposals
      (business_id,conversation_id,customer_id,version,origin,lines,delivery_method,shipping_rule,subtotal_minor,
       delivery_fee_minor,total_minor,review_token,expires_at,client_request_id,request_hash,reply_language)
      SELECT $1,$2,$3,1+COALESCE(MAX(version),0),$4,$5::jsonb,$6,$7::jsonb,$8,$9,$10,$11,
        now()+make_interval(mins=>$12),$13,$14,$15 FROM order_proposals WHERE business_id=$1 AND conversation_id=$2 RETURNING ${columns}`,
    [businessId, conversationId, conversation.customerId, origin, JSON.stringify(lines), deliveryMethod, JSON.stringify(rule), subtotal, fee,
      subtotal + fee, randomBytes(24).toString('base64url'), settings.proposalTtlMinutes, clientRequestId, hash, language]);
    return fromRow(row);
  });
}
