import { z } from 'zod';
import type { AiIntent } from '@nless/shared/features/ai-agent/types';
import type { MessageRecord } from '@nless/shared/features/inbox/types';
import { model } from '../../core';
import type { ModelChatResult } from '../../core';
import type { PriceQuote } from '@nless/shared/features/catalog/types';
import { maskCardNumbers } from './mask';
import { skuPattern } from './money';
import { classifierPrompt } from './prompt';

const labels = [
  'GREETING', 'GOODBYE', 'QUESTION', 'REQUEST', 'STATUS_CHECK', 'FEEDBACK', 'CLARIFICATION',
  'ESCALATION', 'OFF_TOPIC', 'PRICE_CALC', 'PRODUCT_FILTER', 'BUSINESS_HOURS', 'BOOKING_AVAILABILITY',
] as const;
const responseSchema = {
  type: 'object',
  properties: {
    label: { type: 'string', enum: [...labels] },
    confidence: { type: 'number' },
    price_items: {
      type: ['array', 'null'],
      items: {
        type: 'object', properties: { ref: { type: 'string' }, quantity: { type: 'integer' } },
        required: ['ref', 'quantity'], additionalProperties: false,
      },
    },
    max_price_baht: { type: ['integer', 'null'] },
    query: { type: ['string', 'null'] },
  },
  required: ['label', 'confidence', 'price_items', 'max_price_baht', 'query'],
  additionalProperties: false,
};
const classification = z.strictObject({
  label: z.enum(labels),
  confidence: z.number().min(0).max(1),
  price_items: z.array(z.strictObject({ ref: z.string().max(200), quantity: z.number().int().min(1).max(99) })).max(10).nullable(),
  max_price_baht: z.number().int().nonnegative().nullable(),
  query: z.string().max(200).nullable(),
});

export interface IntentScore {
  label: AiIntent;
  source: 'regex' | 'classifier' | 'fallback';
  confidence: number | null;
  response?: ModelChatResult;
}

export const unknownIntent: IntentScore = { label: 'UNKNOWN', source: 'fallback', confidence: null };
const greeting = /^(?:สวัสดี|หวัดดี|ดีค่ะ|ดีครับ|ดีจ้า|ดีคะ|hello|hi|hey|good (?:morning|afternoon|evening)|sawasdee)[\s!.,ค่ะครับคะจ้านะ]*$/iu;
const goodbye = /^(?:บาย|บ๊ายบาย|ไว้คุยกันใหม่|แค่นี้(?:ก่อน)?|ขอบคุณ(?:ค่ะ|ครับ|คะ)?(?:มาก)?(?:ค่ะ|ครับ|คะ|นะ)*|ขอบใจ|bye|goodbye|thanks?|thank you)[\s!.,]*$/iu;

export function casualIntent(unanswered: readonly string[]): IntentScore | null {
  if (unanswered.length !== 1) return null;
  const message = unanswered[0].normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  if (message.length <= 25 && greeting.test(message)) return { label: 'GREETING', source: 'regex', confidence: 1 };
  if (message.length <= 30 && goodbye.test(message)) return { label: 'GOODBYE', source: 'regex', confidence: 1 };
  return null;
}

export function catalogPriceIntent(text: string, quotes: readonly PriceQuote[]): IntentScore | null {
  if (!/(?:ราคา|เท่าไหร่|เท่าไร|กี่บาท|กี่บ\.?|how much|price|รวม|ทั้งหมด)/iu.test(text)) return null;
  const skus = new Set([...text.matchAll(skuPattern)].map(([sku]) => sku.toUpperCase()));
  const quote = quotes.find(({ sku }) => skus.has(sku.toUpperCase()));
  return quote ? { label: quote.quantity > 1 ? 'PRICE_CALC' : 'QUESTION', source: 'regex', confidence: 1 } : null;
}

function textOf(message: MessageRecord, limit: number): string {
  return maskCardNumbers(message.parts.filter((part) => part.type === 'text').map(({ text }) => text).join('\n')).slice(0, limit);
}

export async function classifyIntent(input: {
  turnId: string;
  businessId: string;
  conversationId: string;
  inbound: MessageRecord;
  history: readonly MessageRecord[];
  offerPending: boolean;
  timeoutMs: number;
  signal: AbortSignal;
}): Promise<IntentScore> {
  if (input.signal.aborted || input.timeoutMs <= 0) return unknownIntent;
  const prior = input.history.filter((message) => message.seq < input.inbound.seq && message.author !== 'system')
    .map((message) => ({ role: message.author === 'customer' ? 'customer' : 'shop', text: textOf(message, 500) }))
    .filter(({ text }) => text).slice(-2).map(({ role, text }) => role + ': ' + text);
  const prompt = 'previous messages:\n' + (prior.join('\n') || 'none') + '\n\nlatest customer message:\n' +
    textOf(input.inbound, 1000) + '\n\nthe shop asked the customer whether to bring in staff in its previous turn: ' +
    (input.offerPending ? 'yes' : 'no');
  try {
    const reply = await model.chat({
      usage: { featureId: 'F10', purpose: 'classify', businessId: input.businessId, conversationId: input.conversationId, turnId: input.turnId },
      model: 'fast', reasoningEffort: 'low', maxOutputTokens: 600,
      responseFormat: { name: 'intent', schema: responseSchema },
      messages: [{ role: 'developer', content: classifierPrompt }, { role: 'user', content: prompt }],
      timeoutMs: Math.min(8000, input.timeoutMs), signal: input.signal,
    });
    const parsed = classification.safeParse(reply.json);
    if (!parsed.success || reply.finishReason !== 'stop') return { ...unknownIntent, response: reply };
    return { label: parsed.data.label, confidence: parsed.data.confidence, source: 'classifier', response: reply };
  } catch {
    return unknownIntent;
  }
}
