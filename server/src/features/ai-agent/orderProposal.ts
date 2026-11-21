import type { CustomerLanguage } from '@nless/shared/core/language';
import type { ProposalSummary } from '@nless/shared/core/types';
import type { CreateOrderFromProposalInput } from '@nless/shared/features/orders/types';
import { AppError } from '../../core';
import { getEffectiveAnswerRules } from '../business-settings/service';
import { createOrderFromProposal } from '../orders/service';
import type { PriceEvidence } from './context';
import { arabicDigits } from './mask';
import { skuPattern } from './money';
import type { TurnDraft } from './repo';
import { lookupQuote } from './tools';

type ProposalInput = Extract<CreateOrderFromProposalInput, { stage: 'propose' }>;
export type PurchaseLine = { sku: string | null; name: string | null; variant_name: string | null; quantity: number };
export type PurchaseArguments = { items: PurchaseLine[]; delivery_method: ProposalInput['deliveryMethod'] };
export type OrderDraft = { kind: 'prepare_order'; items: ProposalInput['items']; deliveryMethod: ProposalInput['deliveryMethod'] };

const orderText = {
  review: { th: 'กรุณาตรวจรายการในสรุปคำสั่งซื้อ แล้วกดยืนยันหากต้องการสั่งซื้อค่ะ', en: 'Please review the order summary, then press confirm if you want to place the order.' },
  cancel: { th: 'หากยังไม่ได้กดยืนยัน สามารถข้ามสรุปคำสั่งซื้อนี้ได้ค่ะ', en: 'If you have not pressed confirm, you can ignore the order summary.' },
  unconfirmed: { th: 'กรุณาตรวจสรุปคำสั่งซื้อและกดยืนยันเพื่อสั่งซื้อค่ะ', en: 'An order is placed when you press confirm on its order summary.' },
  unavailable: { th: 'ตอนนี้ทำสรุปคำสั่งซื้อไม่ได้ กรุณาติดต่อร้านเพื่อให้ช่วยสั่งซื้อนะคะ', en: 'I could not prepare the order summary. Please contact the shop for help placing the order.' },
  soldOut: { th: 'สินค้าในรายการมีไม่พอตามจำนวนที่ขอ กรุณาเปลี่ยนสินค้า หรือระบุจำนวนน้อยลงค่ะ', en: 'An item in the request has insufficient stock. Please choose another item or request fewer units.' },
};

const normalize = (value: string) => arabicDigits(value.normalize('NFKC')).replaceAll('’', "'").replace(/\s+/gu, ' ').trim().toLowerCase();
const explicitOrder = /^(?:(?:hi[,!]?\s+)?(?:please\s+)?(?:buy\b|order\b|place an order\b|i(?:'d| would) like to (?:buy|order)\b|i want to (?:buy|order)\b|i(?:'ll| will) take\b)|(?:สวัสดี(?:ค่ะ|ครับ)?\s*)?(?:ขอสั่ง(?:ซื้อ)?|สั่งซื้อ|ซื้อ|เอา|รับ))/iu;
const pricingOrConditional = /(?:\b(?:what if|if|how much|quote|estimate|pretend|discount|do not|don't|maybe)\b|สมมติ|ถ้า|ราคาเท่า|กี่บาท|ไม่(?:เอา|ซื้อ|สั่ง)|ขอราคา)/iu;

export function explicitOrderMethod(text: string): OrderDraft['deliveryMethod'] | null {
  const current = normalize(text);
  if (!explicitOrder.test(current) || pricingOrConditional.test(current)) return null;
  const shipping = /\b(?:ship(?:ping)?|deliver(?:y)?|send it)\b|ส่ง(?:ที่บ้าน|ถึงบ้าน|ให้|พัสดุ)|จัดส่ง/iu.test(current);
  const pickup = /\b(?:pick[- ]?up|collect)\b|รับที่ร้าน|รับเอง/iu.test(current);
  return shipping === pickup ? null : shipping ? 'shipping' : 'pickup';
}

function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function exactLabel(label: string): RegExp {
  return new RegExp('(?<![\\p{L}\\p{N}-])' + escaped(normalize(label)) + '(?![\\p{L}\\p{N}-])', 'giu');
}

function quantityBindings(text: string, labels: readonly string[]): number[] {
  const quantities: number[] = [];
  for (const label of labels.filter(Boolean).map(normalize)) {
    for (const match of text.matchAll(exactLabel(label))) {
      const left = text.slice(0, match.index);
      const right = text.slice(match.index + match[0].length);
      const before = /(?:^|[^\d-])(?:x\s*)?(\d{1,2})\s*(?:(?:boxes?|copies|sets?|items?|units?|pieces?)\s+(?:of\s+)?|of\s+|(?:กล่อง|ชิ้น|ชุด|อัน)\s*)?$/iu.exec(left);
      const after = /^\s*(?:[x×]\s*(\d{1,2})(?!\d)|(\d{1,2})\s*(?:กล่อง|ชิ้น|ชุด|อัน|เกม|boxes?\b|copies\b|sets?\b|items?\b|units?\b|pieces?\b))/iu.exec(right);
      const quantity = Number(after?.[1] ?? after?.[2] ?? before?.[1]);
      if (Number.isInteger(quantity)) quantities.push(quantity);
    }
  }
  return [...new Set(quantities)];
}

export async function prepareOrder(input: {
  businessId: string; language: CustomerLanguage; text: string; args: PurchaseArguments;
}): Promise<{ order: OrderDraft; prices: PriceEvidence[] } | { error: string }> {
  const { businessId, language, args } = input;
  const text = normalize(input.text);
  if (explicitOrderMethod(text) !== args.delivery_method) return { error: 'NOT_A_PURCHASE_REQUEST' };
  const explicitQuantities = [...text.replace(skuPattern, ' ').matchAll(/\b(?:x\s*)?([1-9]\d?)\b/gu)];
  if (explicitQuantities.length !== args.items.length) return { error: 'UNVERIFIED_ORDER_ITEMS' };
  const prices: PriceEvidence[] = [];
  const mentionedSkus = [...text.matchAll(skuPattern)].map(([sku]) => normalize(sku));
  const coveredSkus = new Set<string>();
  const distinct = new Set<string>();
  for (const line of args.items) {
    // An explicit model SKU is exact. A name may not rescue a missing SKU.
    const lookup = await lookupQuote(businessId, language, line.sku ? { ...line, name: null } : line);
    if ('error' in lookup) return { error: lookup.error.error };
    const { evidence } = lookup;
    const { quote } = evidence;
    const labels = [quote.sku, evidence.itemSku, ...evidence.itemNames];
    const quantities = quantityBindings(text, labels);
    if (quantities.length !== 1 || quantities[0] !== line.quantity) return { error: 'UNVERIFIED_ORDER_ITEMS' };
    const requestedVariantSku = quote.sku !== evidence.itemSku && mentionedSkus.includes(normalize(quote.sku));
    if (evidence.variant && !requestedVariantSku && !exactLabel(evidence.variant).test(text)) {
      return { error: 'UNVERIFIED_ORDER_ITEMS' };
    }
    if (quote.soldOut) return { error: 'SOLD_OUT' };
    const key = quote.itemId + ':' + (quote.variantId ?? '');
    if (distinct.has(key)) return { error: 'UNVERIFIED_ORDER_ITEMS' };
    distinct.add(key);
    coveredSkus.add(normalize(quote.sku));
    coveredSkus.add(normalize(evidence.itemSku));
    prices.push(evidence);
  }
  if (mentionedSkus.some((sku) => !coveredSkus.has(sku))) return { error: 'UNVERIFIED_ORDER_ITEMS' };
  return {
    order: { kind: 'prepare_order', deliveryMethod: args.delivery_method,
      items: prices.map(({ quote }) => ({ ref: { itemId: quote.itemId }, variantId: quote.variantId, quantity: quote.quantity })) },
    prices,
  };
}

export async function materializeOrder(
  draft: TurnDraft, order: OrderDraft, businessId: string, conversationId: string, turnId: string, signal: AbortSignal,
): Promise<void> {
  try {
    const rules = await getEffectiveAnswerRules(businessId);
    signal.throwIfAborted();
    if (!rules.orders || rules.price !== 'always') throw new AppError('POLICY_BLOCKED', 'Order policy changed');
    const result = await createOrderFromProposal({
      stage: 'propose', businessId, conversationId, items: order.items, deliveryMethod: order.deliveryMethod,
      clientRequestId: 'ai:' + turnId + ':order',
    });
    if (result.stage !== 'propose') throw new AppError('INTERNAL', 'Invalid order response');
    draft.parts = [{ type: 'text', text: orderText.review[draft.language] }, result.review];
    draft.order = result.proposal;
  } catch (error) {
    if (signal.aborted || !(error instanceof AppError) || error.retryable) throw error;
    draft.parts = [{ type: 'text', text: orderText[error.code === 'SOLD_OUT' ? 'soldOut' : 'unavailable'][draft.language] }];
    draft.order = null;
    draft.errorCode = error.code;
    draft.evidenceIds = [];
    draft.productRefs = [];
  }
}

export function isOrderSummary(order: TurnDraft['order']): order is ProposalSummary {
  return order?.kind === 'order.create';
}

export function typedOrderDecision(text: string, language: CustomerLanguage): string | null {
  const value = normalize(text).replace(/[.!]+$/u, '');
  if (/^(?:confirm(?: the order)?|yes|ok(?:ay)?|ยืนยัน(?:คำสั่งซื้อ)?|ตกลง|ได้)(?:\s*(?:ครับ|ค่ะ|คะ))?$/iu.test(value)) return orderText.review[language];
  if (/^(?:cancel(?: the order)?|no thanks|ยกเลิก(?:คำสั่งซื้อ)?|ไม่เอา)(?:\s*(?:ครับ|ค่ะ|คะ))?$/iu.test(value)) return orderText.cancel[language];
  return null;
}

export function safeUnreviewedOrderText(text: string, language: CustomerLanguage): string {
  const claimed = /\b(?:(?:your|this|the) order (?:is|was|has been) (?:placed|confirmed|created|processed)|(?:i|we)(?:'ve| have)? (?:placed|confirmed|created|processed) (?:your|the) order|order (?:confirmed|placed))\b|(?:คำสั่งซื้อ|ออเดอร์).{0,28}(?:ยืนยันแล้ว|เรียบร้อยแล้ว|สำเร็จแล้ว)|(?:ยืนยัน|สั่งซื้อ)เรียบร้อยแล้ว/iu;
  const absentCard = /\b(?:review|check|see|open) (?:your|the|this) (?:order summary|order card)\b|(?:ดู|ตรวจ)(?:ที่|ใน)?(?:การ์ด|สรุปคำสั่งซื้อ)/iu;
  const normalized = normalize(text);
  if (claimed.test(normalized)) return orderText.unconfirmed[language];
  return absentCard.test(normalized) ? orderText.unavailable[language] : text;
}

export function soldOutOrderText(language: CustomerLanguage): string {
  return orderText.soldOut[language];
}
