import { formatMoneyText } from '@nless/shared/core/language';
import type { CustomerLanguage } from '@nless/shared/core/language';
import type { AiToolTrace } from '@nless/shared/features/ai-agent/types';
import type { BusinessSettings, EffectiveAnswerRules } from '@nless/shared/features/business-settings/types';
import type { PriceQuote } from '@nless/shared/features/catalog/types';
import type { ConversationRecord, MessageRecord } from '@nless/shared/features/inbox/types';
import { db } from '../../core';
import type { ModelMessage } from '../../core';
import { getBusinessOpenState, getBusinessProfile, getEffectiveAnswerRules } from '../business-settings/service';
import { getPrice, getProduct } from '../catalog/service';
import { searchKnowledge } from '../knowledge-search/service';
import { detectReplyLanguage } from './fallbacks';
import { arabicDigits, maskCardNumbers } from './mask';
import { moneyInWords, moneyMentions, skuPattern } from './money';
import { contextPrompt, developerPrompt } from './prompt';

export interface PriceEvidence {
  id: string;
  quote: PriceQuote;
  name: string;
  names: string[];
}

export interface KnowledgeEvidence {
  id: string;
  title: string;
  snippet: string;
}

export interface ReplyContext {
  language: CustomerLanguage;
  unanswered: string[];
  rules: EffectiveAnswerRules;
  knowledge: KnowledgeEvidence[];
  prices: PriceEvidence[];
  tools: AiToolTrace[];
  messages: ModelMessage[];
  contact: string;
  cardMasked: boolean;
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

function quantityFor(text: string): number {
  const normalized = arabicDigits(text).normalize('NFKC');
  const match = /(?:^|[^\d-])(\d{1,2})\s*(?:ชิ้น|กล่อง|ชุด|อัน|เกม|ใบ|\b(?:items?|boxes?|sets?|copies?)\b|[x×])|(?:[x×])\s*(\d{1,2})(?!\d)/iu.exec(normalized);
  return Number(match?.[1] ?? match?.[2] ?? 1) || 1;
}

async function prefetch(businessId: string, sku: string, quantity: number, language: CustomerLanguage) {
  const start = performance.now();
  let evidence: PriceEvidence | null = null;
  try {
    const item = await getProduct(businessId, { sku });
    if (item) {
      const variant = item.variants.find((candidate) => candidate.sku?.toUpperCase() === sku);
      const quote = await getPrice(businessId, { itemId: item.id, variantId: variant?.id, quantity });
      const name = (language === 'en' ? item.nameEn : item.name) || item.name;
      evidence = {
        id: 'catalog:' + quote.itemId + ':v' + quote.version, quote, name,
        names: [...new Set([item.name, item.nameEn, variant?.name, quote.name].filter((value): value is string => Boolean(value)))],
      };
    }
  } catch {
    const tool: AiToolTrace = { name: 'get_price', ok: false, prefetch: true, ms: Math.round(performance.now() - start), error: 'LOOKUP_FAILED' };
    return { evidence, tool };
  }
  const tool: AiToolTrace = { name: 'get_price', ok: Boolean(evidence), prefetch: true, ms: Math.round(performance.now() - start) };
  return { evidence, tool };
}

function quoteForPrompt(evidence: PriceEvidence, language: CustomerLanguage, rules: EffectiveAnswerRules) {
  const { quote, name } = evidence;
  return {
    ok: true, itemId: quote.itemId, variantId: quote.variantId, sku: quote.sku, name, quantity: quote.quantity,
    unitPriceMinor: quote.unitPriceMinor, subtotalMinor: quote.subtotalMinor, currency: quote.currency,
    unitPrice: formatMoneyText(quote.unitPriceMinor, language), subtotal: formatMoneyText(quote.subtotalMinor, language),
    soldOut: quote.soldOut, ...(rules.stock === 'always' ? { available: quote.available } : {}),
  };
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
): Promise<ReplyContext> {
  const { businessId } = conversation;
  const partition = contextHistory(history, inbound);
  const textRows = partition.messages.map((message) => ({ message, text: textOf(message) }));
  const mask = ({ message, text }: (typeof textRows)[number]) => message.author === 'customer' ? maskCardNumbers(text) : text;
  const contextRows = textRows.map((row) => ({ ...row, masked: mask(row) }));
  const unansweredIds = new Set(partition.unanswered.map((message) => message.id));
  const unanswered = contextRows.filter((row) => unansweredIds.has(row.message.id)).map((row) => row.masked).filter(Boolean);
  const prior = contextRows.findLast((row) => row.message.author === 'customer' && !unansweredIds.has(row.message.id))?.masked;
  const fullQuery = unanswered.join(' ');
  const query = (fullQuery.length < 12 && prior ? fullQuery + ' ' + prior : fullQuery).slice(-500).trim();
  const customerTail = contextRows.filter((row) => row.message.author === 'customer').slice(-3).reverse();
  const skus = [...new Set(customerTail.flatMap(({ masked }) => [...masked.matchAll(skuPattern)].map(([sku]) => sku.toUpperCase())))].slice(0, 3);
  const [rules, business, open] = await Promise.all([
    getEffectiveAnswerRules(businessId),
    db.maybeOne<{ name: string }>('SELECT name FROM businesses WHERE id = $1', [businessId]),
    getBusinessOpenState(businessId).catch(() => null),
  ]);
  signal.throwIfAborted();
  const [knowledgeSearch, quotes, profile] = await Promise.all([
    query ? searchKnowledge(businessId, query, { topK: 6 }).catch(() => null) : null,
    rules.price === 'always' ? Promise.all(skus.map((sku) => prefetch(businessId, sku, quantityFor(customerTail[0]?.masked ?? ''), language))) : [],
    rules.contact === 'always' ? getBusinessProfile(businessId).catch(() => null) : null,
  ]);
  signal.throwIfAborted();
  const knowledge = (knowledgeSearch?.hits ?? []).flatMap((hit) => {
    if (rules.price !== 'always' && [hit.title, hit.snippet].some((text) => moneyMentions(text).length || moneyInWords.test(text))) return [];
    return [{ id: 'knowledge:' + hit.knowledgeItemId + ':r' + hit.revision, title: hit.title, snippet: hit.snippet }];
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
    handoffState: 'none',
    knowledgeBlock: knowledge.map((item, index) => '[K' + (index + 1) + '] id=' + item.id + ' | ' + item.title + '\n' + item.snippet).join('\n\n') || 'No knowledge excerpt matched this question.',
    prefetchBlock: prices.map((item) => JSON.stringify({ tool: 'get_price', result: quoteForPrompt(item, language, rules) })).join('\n') || 'none',
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
  return { language, unanswered, rules, knowledge, prices, tools: quotes.map(({ tool }) => tool), messages, contact, cardMasked: contextRows.some((row) => row.text !== row.masked) };
}
