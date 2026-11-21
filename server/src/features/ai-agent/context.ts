import type { CustomerLanguage } from '@nless/shared/core/language';
import type { AiToolTrace } from '@nless/shared/features/ai-agent/types';
import type { BusinessSettings, EffectiveAnswerRules } from '@nless/shared/features/business-settings/types';
import type { PriceQuote } from '@nless/shared/features/catalog/types';
import type { ConversationRecord, MessageRecord } from '@nless/shared/features/inbox/types';
import { db } from '../../core';
import type { ModelMessage } from '../../core';
import { getBusinessOpenState, getBusinessProfile, getEffectiveAnswerRules } from '../business-settings/service';
import { searchKnowledge } from '../knowledge-search/service';
import { detectReplyLanguage } from './fallbacks';
import { arabicDigits, maskCardNumbers } from './mask';
import { skuPattern } from './money';
import { contextPrompt, developerPrompt } from './prompt';
import { asKnowledgeEvidence, lookupQuote, quoteForModel } from './tools';
import type { TotalEvidence } from './tools';

export interface PriceEvidence {
  id: string;
  quote: PriceQuote;
  name: string;
  variant: string | null;
  names: string[];
  itemSku: string;
  itemNames: string[];
}

export interface KnowledgeEvidence {
  id: string;
  title: string;
  snippet: string;
  score: number;
}

export interface ReplyContext {
  language: CustomerLanguage;
  unanswered: string[];
  rules: EffectiveAnswerRules;
  knowledge: KnowledgeEvidence[];
  prices: PriceEvidence[];
  totals: TotalEvidence[];
  tools: AiToolTrace[];
  messages: ModelMessage[];
  contact: string;
  cardMasked: boolean;
  shopOpen: boolean | null;
  offeredByTool?: boolean;
  catalogRequest: { text: string; skus: string[]; previousSkus: string[]; linkedSameProduct: boolean };
}

const weekdayNames = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
  fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
} as const;

function textOf(message: MessageRecord): string {
  return message.parts.flatMap((part) => {
    if (part.type === 'text') return [part.text];
    if (part.type === 'order_review' || part.type === 'booking_review') return ['[การ์ดสรุป]'];
    return [];
  }).join('\n').trim();
}

function contextHistory(history: readonly MessageRecord[], inbound: MessageRecord) {
  const messages = history.filter((message) => message.seq <= inbound.seq).slice(-12);
  const lastAnswered = messages.findLastIndex((message) => message.author === 'ai' || message.author === 'staff');
  const unanswered = messages.slice(lastAnswered + 1).filter((message) => message.author === 'customer');
  return { messages, unanswered, previous: messages.slice(0, lastAnswered + 1).filter((message) => message.author === 'customer') };
}

export function turnLanguage(history: readonly MessageRecord[], inbound: MessageRecord, language: CustomerLanguage): CustomerLanguage {
  const context = contextHistory(history, inbound);
  return detectReplyLanguage(context.unanswered.map(textOf), context.previous.map(textOf), language);
}

export function unansweredCustomerMessages(history: readonly MessageRecord[], inbound: MessageRecord): string[] {
  return contextHistory(history, inbound).unanswered.map(textOf).filter(Boolean);
}

function catalogText(text: string): string {
  return arabicDigits(text).normalize('NFKC').replaceAll('’', "'").replace(/\s+/gu, ' ').trim().toLowerCase();
}

function catalogSkus(text: string): string[] {
  return [...new Set([...text.matchAll(skuPattern)].map(([sku]) => sku.toUpperCase()))];
}

export function isCatalogPriceFollowUp(text: string): boolean {
  const request = catalogText(text).replace(/[.!?？]+$/u, '').trim();
  const english = /^(?:how much(?: is (?:it|this(?: one)?|that(?: one)?|(?:the )?same (?:one|item|game|product))| does it cost)?|what(?:'s| is) (?:its|the) price)$/u;
  const thai = /^(?:แล้ว\s*)?(?:(?:อัน|ตัว|ชุด|เกม|กล่อง|สินค้า)\s*(?:นี้|นั้น|เดิม(?:นี้|นั้น)?)\s*)?(?:ราคา(?:เท่า(?:ไหร่|ไร))?|เท่า(?:ไหร่|ไร)|กี่บาท)(?:นะ|คะ|ค่ะ|ครับ)*$/u;
  const negotiation = /^(?:(?:the page says it(?:'s| is) [\d,.]+(?: baht)? today[.!]\s*)?can i get it for [\d,.]+(?: baht)?|(?:(?:ระบบ)?สั่งให้|ขอ|ช่วย)?\s*ลด(?:ราคา)?(?:ให้)?(?:เหลือ)?\s*[\d,.]+\s*(?:บาท|บ\.?)(?:นะ|คะ|ค่ะ|ครับ)*)$/u;
  const quantity = /^(?:and\s+|for\s+|ขอ\s*|เอา\s*)?(?:[x×]\s*)?\d{1,2}\s*(?:ชิ้น|กล่อง|ชุด|อัน|เกม|ใบ|items?|boxes?|sets?|copies?)(?:,?\s*(?:please|how much|เท่า(?:ไหร่|ไร)|ค่ะ|ครับ|คะ))?$/u;
  return english.test(request) || thai.test(request) || negotiation.test(request) || quantity.test(request);
}

function isCatalogFollowUp(text: string): boolean {
  const stock = /^(?:is (?:it|this one|that one) (?:still )?in stock|(?:อัน|ตัว|ชุด|เกม|สินค้า)(?:นี้|นั้น)(?:ยัง)?มี(?:ของ)?ไหม(?:คะ|ค่ะ|ครับ)*)[?!？]*$/iu;
  return isCatalogPriceFollowUp(text) || stock.test(catalogText(text));
}

export function quoteMatchesCatalogRequest(price: PriceEvidence, { catalogRequest }: ReplyContext): boolean {
  const skus = [price.quote.sku.toUpperCase(), price.itemSku.toUpperCase()];
  if (skus.some((sku) => catalogRequest.skus.includes(sku))) return true;
  const request = catalogText(catalogRequest.text);
  const named = price.itemNames.some((name) => request.includes(catalogText(name)));
  if (catalogRequest.skus.length > 0) {
    const comparison = /[,，]|\b(?:and|plus|versus|vs\.?)\b|และ|กับ|เทียบ/u.test(request);
    return comparison && named;
  }
  return named || !skus.some((sku) => catalogRequest.previousSkus.includes(sku));
}

function quantityFor(text: string): number {
  const normalized = arabicDigits(text).normalize('NFKC');
  const match = /(?:^|[^\d-])(\d{1,2})\s*(?:ชิ้น|กล่อง|ชุด|อัน|เกม|ใบ|\b(?:items?|boxes?|sets?|copies?)\b|[x×])|(?:[x×])\s*(\d{1,2})(?!\d)/iu.exec(normalized);
  return Number(match?.[1] ?? match?.[2] ?? 1) || 1;
}

async function prefetch(businessId: string, sku: string, quantity: number, language: CustomerLanguage) {
  const start = performance.now();
  try {
    const found = await lookupQuote(businessId, language, { sku, name: null, variant_name: null, quantity });
    const evidence = 'evidence' in found ? found.evidence : null;
    const tool: AiToolTrace = {
      name: 'get_price', ok: Boolean(evidence), prefetch: true, ms: Math.round(performance.now() - start),
      ...('error' in found ? { error: found.error.error } : {}),
    };
    return { evidence, tool };
  } catch {
    const tool: AiToolTrace = { name: 'get_price', ok: false, prefetch: true, ms: Math.round(performance.now() - start), error: 'LOOKUP_FAILED' };
    return { evidence: null, tool };
  }
}

function directivesOf(rules: EffectiveAnswerRules): string {
  const directives = [];
  if (rules.price !== 'always') directives.push('Do not state, estimate, compare or compute any price or amount. Tell the customer to ask the shop directly. Do not mention numbers with a currency.');
  if (rules.stock !== 'always') directives.push('Never state remaining stock counts. You may say an item is sold out when a tool result says soldOut.');
  if (rules.contact === 'never') directives.push('Never give phone numbers, addresses or emails yourself; say to contact the shop directly.');
  directives.push(rules.generalKnowledge
    ? 'You may use common general knowledge only for harmless explanations that do not state shop facts.'
    : "Answer only from the shop's knowledge and catalog. Do not use general world knowledge.");
  if (!rules.booking) directives.push('Do not offer times or accept bookings; say the shop arranges appointments directly.');
  if (!rules.handoff || process.env.ESCALATION_ENABLED === '0') directives.push('Do not promise to transfer to a human; keep helping yourself.');
  return directives.join('\n');
}

export async function buildReplyContext(
  conversation: ConversationRecord,
  history: readonly MessageRecord[],
  inbound: MessageRecord,
  settings: BusinessSettings,
  language: CustomerLanguage,
  signal: AbortSignal,
  options: { skipLookups?: boolean; offerPending?: boolean; previousProductSkus?: readonly string[] } = {},
): Promise<ReplyContext> {
  const { businessId } = conversation;
  const partition = contextHistory(history, inbound);
  const textRows = partition.messages.map((message) => ({ message, text: textOf(message) }));
  const mask = ({ message, text }: (typeof textRows)[number]) => message.author === 'customer' ? maskCardNumbers(text) : text;
  const contextRows = textRows.map((row) => ({ ...row, masked: mask(row) }));
  const unansweredIds = new Set(partition.unanswered.map((message) => message.id));
  const unanswered = contextRows.filter((row) => unansweredIds.has(row.message.id)).map((row) => row.masked).filter(Boolean);
  const previous = contextRows.filter((row) => row.message.author === 'customer' && !unansweredIds.has(row.message.id));
  const prior = previous.at(-1)?.masked;
  const fullQuery = unanswered.join(' ');
  const query = (fullQuery.length < 12 && prior ? fullQuery + ' ' + prior : fullQuery).slice(-500).trim();
  const requestedSkus = catalogSkus(fullQuery);
  const directLastSkus = catalogSkus(prior ?? '');
  const previousProductSkus = options.previousProductSkus ?? [];
  const lastSkus = !directLastSkus.length && isCatalogFollowUp(prior ?? '') ? [...previousProductSkus] : directLastSkus;
  const isFollowUp = !requestedSkus.length && isCatalogFollowUp(fullQuery);
  const sameProduct = isFollowUp && /(?:อัน|ตัว|ชุด|เกม|กล่อง|สินค้า)\s*เดิม|\bsame (?:one|item|game|product)\b/iu.test(fullQuery);
  // A bare follow-up carries the immediate subject. Explicit "same item" wording can bridge one unrelated turn.
  const nearbySkus = sameProduct && !lastSkus.length ? previous.slice(-2).map(({ masked }) => catalogSkus(masked))
    .findLast((candidate) => candidate.length > 0) ?? [] : lastSkus;
  const skus = isFollowUp && nearbySkus.length === 1 ? nearbySkus : requestedSkus;
  const [rules, business, open] = await Promise.all([
    getEffectiveAnswerRules(businessId),
    db.maybeOne<{ name: string }>('SELECT name FROM businesses WHERE id = $1', [businessId]),
    getBusinessOpenState(businessId).catch(() => null),
  ]);
  signal.throwIfAborted();
  const [knowledgeSearch, quotes, profile] = await Promise.all([
    !options.skipLookups && query ? searchKnowledge(businessId, query, { topK: 6 }).catch(() => null) : null,
    !options.skipLookups && rules.price === 'always'
      ? Promise.all(skus.slice(0, 3).map((sku) => prefetch(businessId, sku, quantityFor(unanswered.at(-1) ?? ''), language))) : [],
    rules.contact === 'always' ? getBusinessProfile(businessId).catch(() => null) : null,
  ]);
  signal.throwIfAborted();
  const knowledge = (knowledgeSearch?.hits ?? []).flatMap((hit) => {
    const item = asKnowledgeEvidence(hit, rules);
    return item ? [item] : [];
  });
  const prices = quotes.flatMap(({ evidence }) => evidence ? [evidence] : []);
  const contact = profile
    ? [profile.contactPhone && 'phone ' + profile.contactPhone, profile.contactEmail && 'email ' + profile.contactEmail, profile.address && 'address ' + profile.address].filter(Boolean).join(' | ')
    : '';
  const now = new Date();
  const localTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' }).format(now);
  const weekday = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', weekday: 'long' }).format(now);
  const openReason = { outside_hours: 'outside opening hours', closed_day: 'closed today', closure: 'temporary closure', open: 'open' };
  const values: Record<string, string> = {
    shopName: business?.name ?? profile?.name ?? '',
    replyLanguage: language === 'en' ? 'en (English)' : 'th (Thai)',
    language: settings.language,
    nowLocal: localTime,
    weekday,
    openNow: open ? open.open ? 'yes' : 'no (' + openReason[open.reason] + ')' : 'unknown',
    hoursLines: Object.entries(weekdayNames).map(([day, name]) => {
      const hours = settings.hours[day as keyof typeof weekdayNames] ?? [];
      return name + ' ' + (hours.map(({ open: start, close }) => start + '-' + close).join(', ') || 'closed');
    }).join('\n'),
    contactLine: contact || 'not available',
    directives: directivesOf(rules),
    handoffState: options.offerPending ? 'staff help was offered in the previous reply' : 'none',
    knowledgeBlock: knowledge.map((item, index) => '[K' + (index + 1) + '] id=' + item.id + ' | ' + item.title + '\n' + item.snippet).join('\n\n') || 'No knowledge excerpt matched this question.',
    prefetchBlock: prices.map((item) => JSON.stringify({ tool: 'get_price', result: quoteForModel(item, language, rules) })).join('\n') || 'none',
  };
  const messages: ModelMessage[] = [
    { role: 'developer', content: developerPrompt },
    { role: 'developer', content: contextPrompt.replace(/\{\{(\w+)\}\}/g, (_variable, key: string) => values[key] ?? '') },
  ];
  let remaining = 6000;
  const chat: ModelMessage[] = [];
  for (const { message, masked } of contextRows.toReversed()) {
    if (message.author === 'system' || !masked || remaining <= 0) continue;
    const content = masked.slice(0, Math.min(1000, remaining));
    chat.unshift({ role: message.author === 'customer' ? 'user' : 'assistant', content });
    remaining -= content.length;
  }
  messages.push(...chat);
  return {
    language, unanswered, rules, knowledge, prices, totals: [], tools: quotes.map(({ tool }) => tool), messages,
    contact, cardMasked: contextRows.some((row) => row.text !== row.masked), shopOpen: open?.open ?? null,
    catalogRequest: {
      text: fullQuery, skus, linkedSameProduct: sameProduct && skus.length === 1,
      previousSkus: [...new Set([...previousProductSkus, ...catalogSkus(previous.map(({ masked }) => masked).join(' '))])],
    },
  };
}
