import { formatMoneyText } from '@nless/shared/core/language';
import type { AiGuardAction } from '@nless/shared/features/ai-agent/types';
import type { MessagePart } from '@nless/shared/core/types';
import type { PriceEvidence, ReplyContext } from './context';
import { fallbacks } from './fallbacks';
import { maskCardNumbers } from './mask';
import { moneyContextMatches, moneyInWords, moneyMentions, skuPattern } from './money';

type Violation = Pick<AiGuardAction, 'guard' | 'detail'>;
const urlPattern = /https?:\/\/[^\s<>]+|www\.[^\s<>]+/giu;
const contactPattern = /[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+66|\b0)[ -]?\d(?:[ -]?\d){7,9}\b/giu;
const soldOutPattern = /หมด|sold out|out of stock|ไม่มีสินค้า|ไม่สามารถสั่ง|ไม่มีของ|unavailable|not available|not in stock/iu;
const stockPattern = /สินค้าคงเหลือ|เหลือ\s*\d|มี(?:สินค้า|ของ)|ยังมี|พร้อมส่ง|\bin stock\b|\bavailable\b|\bstock left\b|\binventory\b/iu;
const priceQuestion = /ราคา|เท่า(?:ไหร่|ไร)|ลด(?:เหลือ|ราคา)|\b(?:price|priced|cost|costs|how much|discount)\b/iu;

export function isPriceQuestion(context: ReplyContext): boolean {
  return priceQuestion.test(context.unanswered.join(' '));
}

function stripMarkdown(text: string): string {
  return text.replace(/^\s*#{1,6}\s+|^\s*\|.*\|\s*$|[*_]{2}|[\x60]/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
}

function linkKey(value: string): string | null {
  const clean = value.replace(/[.,!?;:)]+$/, '');
  try {
    const url = new URL(clean.startsWith('www.') ? 'https://' + clean : clean);
    return url.host.toLowerCase() + url.pathname;
  } catch {
    return null;
  }
}

export function mentionsProduct(text: string, price: PriceEvidence): boolean {
  const normalized = text.toLocaleLowerCase();
  return [price.quote.sku, ...price.names].some((value) => value && normalized.includes(value.toLocaleLowerCase()));
}

export function inspectReply(draft: string, context: ReplyContext): { text: string; actions: AiGuardAction[]; violations: Violation[] } {
  const evidence = context.knowledge.map(({ snippet }) => snippet);
  const sources = [...evidence, context.contact].join('\n');
  const links = new Set([...sources.matchAll(urlPattern)].map(([link]) => linkKey(link)));
  const violations: Violation[] = [];
  const actions: AiGuardAction[] = [];
  const markdownFree = stripMarkdown(draft);
  if (markdownFree !== draft.trim()) actions.push({ guard: 'markdown', action: 'strip', detail: 'Removed markdown formatting' });
  const text = maskCardNumbers(markdownFree).replace(/\[บัตร •••• \d{4}\]/gu, '').replace(urlPattern, (url) => {
    const key = linkKey(url);
    if (key && links.has(key)) return url;
    actions.push({ guard: 'url', action: 'strip', detail: 'Removed a link without shop evidence' });
    return '';
  }).replace(contactPattern, (value) => {
    if (context.rules.contact === 'always' && sources.includes(value)) return value;
    actions.push({ guard: 'policy_contact', action: 'strip', detail: 'Removed unsupported contact details' });
    return '';
  }).replace(/\[(?:K\d+|(?:knowledge|catalog):[^\]\r\n]+)\]/gi, '').trim();

  const amounts = moneyMentions(text);
  const allowed = new Set([0, ...context.prices.flatMap(({ quote }) => [quote.unitPriceMinor, quote.subtotalMinor])]);
  const customerAmounts = new Set(context.unanswered.flatMap(moneyMentions).map(({ minor }) => minor));
  if (moneyInWords.test(text)) violations.push({ guard: 'money_words', detail: 'Use digits for currency amounts.' });
  if (amounts.length && context.rules.price !== 'always') {
    violations.push({ guard: 'policy_price', detail: 'Do not show currency amounts for this shop.' });
  } else {
    for (const amount of amounts) {
      const hasEvidence = allowed.has(amount.minor) || evidence.some((source) =>
        moneyMentions(source).some((candidate) => moneyContextMatches(amount, candidate, source, context.language, customerAmounts)),
      );
      if (!hasEvidence) violations.push({ guard: 'price', detail: 'A currency amount is unsupported. Copy the amount from current-turn evidence.' });
    }
  }

  const mentioned = context.prices.filter((price) => mentionsProduct(text, price));
  const referenced = mentioned.length ? mentioned : context.prices.length === 1 && stockPattern.test(text) ? context.prices : [];
  if (referenced.some(({ quote }) => quote.soldOut) && !soldOutPattern.test(text)) {
    violations.push({ guard: 'sold_out', detail: 'A mentioned product is sold out. Say it is sold out.' });
  }
  if (!context.prices.length && stockPattern.test(text) &&
      /\b(?:yes|certainly)[,!.]|\b(?:it is|we have it|it's) in stock\b|(?:มีของ|พร้อมส่ง)(?:ค่ะ|นะคะ)/iu.test(text)) {
    violations.push({ guard: 'sold_out', detail: 'Confirm stock only when a current catalog result supports it.' });
  }
  const stockAmount = /(?:คงเหลือ|เหลือ|\bstock\s*[:=]?|\bonly|\bhas)\s*(\d+)\s*(?:ชิ้น|กล่อง|ชุด|ใบ|units?\b|boxes\b|items?\b|left\b)|(\d+)\s*(?:ชิ้น|กล่อง|ชุด|ใบ|units?|boxes|items)\s*(?:คงเหลือ|\bleft\b|\bin stock\b)/giu;
  for (const match of text.matchAll(stockAmount)) {
    const count = Number(match[1] ?? match[2]);
    const candidates = mentioned.length ? mentioned : context.prices;
    if (context.rules.stock !== 'always' || !candidates.some(({ quote }) => quote.available === count)) {
      violations.push({ guard: 'sold_out', detail: 'Do not state an unsupported remaining stock count.' });
    }
  }

  if (text.length > 20 || amounts.length) {
    const names = context.prices.flatMap(({ names }) => names).sort((left, right) => right.length - left.length);
    const clean = names.reduce((line, name) => line.replaceAll(name.toLocaleLowerCase(), ''), text.toLocaleLowerCase())
      .replace(skuPattern, '').replace(urlPattern, '');
    const thai = clean.match(/\p{Script=Thai}/gu)?.length ?? 0;
    const latin = clean.match(/[a-z]/g)?.length ?? 0;
    const wrongCurrencyLanguage = amounts.length > 0 && (context.language === 'en' ? /บาท/u.test(clean) : /\bbaht\b/u.test(clean));
    if (wrongCurrencyLanguage || (context.language === 'th' && thai === 0 && latin > 0) || (context.language === 'en' && thai > latin)) {
      violations.push({ guard: 'language', detail: context.language === 'th' ? 'The reply must be in Thai.' : 'The reply must be in English.' });
    }
  }
  return { text, actions, violations };
}

export function stripUnsafeSentences(text: string, context: ReplyContext): string {
  return text.split(/\n+|(?<=[.!?])\s+|(?<=ค่ะ|คะ|ครับ)\s+/u)
    .map((sentence) => inspectReply(sentence, context))
    .filter((sentence) => !sentence.violations.length)
    .map((sentence) => sentence.text)
    .join('\n');
}

export function codeFallback(context: ReplyContext, allowPrice: boolean): string {
  if (!isPriceQuestion(context)) return fallbacks.no_answer[context.language];
  if (context.rules.price !== 'always') return fallbacks.price_hidden[context.language];
  if (!allowPrice || context.prices.length !== 1) return fallbacks.no_answer[context.language];
  return formatCatalogQuote(context.prices[0], context.language, false);
}

function formatCatalogQuote({ quote, name }: PriceEvidence, language: ReplyContext['language'], showSku: boolean): string {
  const label = showSku ? name + ' (' + quote.sku + ')' : name;
  const price = formatMoneyText(quote.unitPriceMinor, language);
  return language === 'en'
    ? label + ' costs ' + price + (quote.soldOut ? ' and is sold out.' : '.')
    : label + ' ราคา ' + price + (quote.soldOut ? ' และสินค้าหมดค่ะ' : ' ค่ะ');
}

export function renderCatalogQuotes(context: ReplyContext, text: string): string | null {
  if (context.rules.price !== 'always') return null;
  const quotes = [...new Map(context.prices.map((price) => [price.quote.itemId + ':' + price.quote.variantId, price])).values()];
  if (quotes.length < 2) return null;
  const amounts = new Set(quotes.flatMap(({ quote }) => [quote.unitPriceMinor, quote.subtotalMinor]));
  if (!isPriceQuestion(context) && !moneyMentions(text).some(({ minor }) => amounts.has(minor))) return null;
  const explicitlyRequested = quotes.filter((price) => context.unanswered.some((message) => mentionsProduct(message, price)));
  const requested = explicitlyRequested.length ? explicitlyRequested : quotes;
  const lines = requested.map((price) => formatCatalogQuote(price, context.language, true));
  const independentFacts = text.split(/\n+|(?<=[.!?])\s+|(?<=ค่ะ|คะ|ครับ)\s+/u).filter((line) =>
    line.trim() && !moneyMentions(line).length && !quotes.some((price) => mentionsProduct(line, price)) &&
    line !== fallbacks.no_answer[context.language],
  );
  return [...lines, ...independentFacts].join('\n');
}

export function shapeReply(text: string): MessagePart[] {
  const textLength = [...text].length;
  if (textLength <= 160 || /^\s*(?:1\.|\- )/m.test(text)) return [{ type: 'text', text: [...text].slice(0, 1000).join('') }];
  const bubbles: string[] = [];
  let remaining = text.trim();
  while (remaining.length && bubbles.length < 3) {
    const paragraphEnd = remaining.indexOf('\n\n');
    if (paragraphEnd > 0 && paragraphEnd <= 160) {
      bubbles.push(remaining.slice(0, paragraphEnd).trim());
      remaining = remaining.slice(paragraphEnd).trim();
    } else if (remaining.length > 160) {
      const candidate = remaining.slice(0, 161);
      const boundary = Math.max(candidate.lastIndexOf(' '), candidate.lastIndexOf('\n'));
      const end = boundary < 80 ? [...candidate].slice(0, 160).join('').length : boundary;
      bubbles.push(remaining.slice(0, end).trim());
      remaining = remaining.slice(end).trim();
    } else {
      break;
    }
  }
  if (remaining) bubbles.push([...remaining].slice(0, 1000).join(''));
  return bubbles.map((bubble) => ({ type: 'text', text: bubble }));
}
