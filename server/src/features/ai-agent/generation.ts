import { z } from 'zod';
import type { CustomerLanguage } from '@nless/shared/core/language';
import type { AiTurnUsage } from '@nless/shared/features/ai-agent/types';
import type { BusinessSettings } from '@nless/shared/features/business-settings/types';
import type { ConversationRecord, MessageRecord } from '@nless/shared/features/inbox/types';
import { AppError, config, model } from '../../core';
import type { ModelChatResult, ModelMessage } from '../../core';
import { buildReplyContext, turnLanguage } from './context';
import type { ReplyContext } from './context';
import { fallbacks } from './fallbacks';
import { codeFallback, inspectReply, isPriceQuestion, mentionsProduct, renderCatalogQuotes, shapeReply, stripUnsafeSentences } from './guards';
import { maskCardNumbers } from './mask';
import { moneyMentions } from './money';
import { repairPrompt } from './prompt';
import type { TurnDraft } from './repo';

type Generation =
  | { state: 'completed' | 'handoff'; draft: TurnDraft }
  | { state: 'failed'; draft: TurnDraft; retryable: boolean };

const output = z.string().max(8000);
const segmenter = new Intl.Segmenter('th', { granularity: 'word' });
const commonEvidenceWords = new Set(['ราคา', 'สินค้า', 'ค่ะ', 'ครับ', 'บาท', 'baht', 'price', 'costs', 'shop']);
const elapsed = (start: number) => Math.round(performance.now() - start);

function summarizeUsage(calls: readonly ModelChatResult[]): AiTurnUsage | null {
  if (!calls.length) return null;
  const total = (key: 'inputTokens' | 'outputTokens' | 'cachedInputTokens' | 'costUsdMicros') => {
    const values = calls.map((call) => call.usage?.[key] ?? null);
    return values.every((value) => value !== null) ? values.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null;
  };
  return {
    calls: calls.length,
    inputTokens: total('inputTokens'),
    outputTokens: total('outputTokens'),
    cachedTokens: total('cachedInputTokens'),
    costUsdMicros: total('costUsdMicros'),
  };
}

function usedEvidence(text: string, context: ReplyContext): Pick<TurnDraft, 'evidenceIds' | 'productRefs'> {
  const amounts = new Set(moneyMentions(text).map(({ minor }) => minor));
  const prices = context.prices.filter((price) => mentionsProduct(text, price) ||
    context.prices.length === 1 && (amounts.has(price.quote.unitPriceMinor) || amounts.has(price.quote.subtotalMinor)));
  const quoteNames = prices.flatMap(({ quote, names }) => [quote.sku, ...names]).sort((left, right) => right.length - left.length);
  const replyWithoutProducts = quoteNames.reduce(
    (value, name) => value.replaceAll(name.toLocaleLowerCase(), ' '), text.toLocaleLowerCase(),
  );
  const terms = (value: string) => [...segmenter.segment(value.toLocaleLowerCase())].flatMap(({ segment, isWordLike }) =>
    isWordLike && segment.length >= 3 && /\p{L}/u.test(segment) && !commonEvidenceWords.has(segment) ? [segment] : [],
  );
  const replyTerms = new Set(terms(replyWithoutProducts));
  const catalogAmounts = new Set(prices.flatMap(({ quote }) => [quote.unitPriceMinor, quote.subtotalMinor]));
  const knowledge = context.knowledge.filter(({ snippet }) => {
    const overlap = new Set(terms(snippet).filter((term) => replyTerms.has(term)));
    return overlap.size >= 2 || moneyMentions(snippet).some(({ minor }) => amounts.has(minor) && !catalogAmounts.has(minor));
  });
  return {
    evidenceIds: [...new Set([...prices.map(({ id }) => id), ...knowledge.map(({ id }) => id)])],
    productRefs: prices.map(({ quote, name }) => ({ itemId: quote.itemId, sku: quote.sku, name })),
  };
}

function withinDeadline<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

export function emptyDraft(language: CustomerLanguage): TurnDraft {
  return {
    language, parts: [], evidenceIds: [], productRefs: [], tools: [], guardActions: [],
    usage: null, timings: {}, retryUsed: false, errorCode: null,
  };
}

export async function generateDraft(
  turnId: string,
  conversation: ConversationRecord,
  history: readonly MessageRecord[],
  inbound: MessageRecord,
  settings: BusinessSettings,
  cancellation: AbortSignal,
): Promise<Generation> {
  const started = performance.now();
  const signal = AbortSignal.any([cancellation, AbortSignal.timeout(config.MODEL_TIMEOUT_MS)]);
  const language = turnLanguage(history, inbound, settings.language);
  const draft = emptyDraft(language);
  const calls: ModelChatResult[] = [];
  const modelMs: number[] = [];
  let context: ReplyContext | undefined;
  try {
    signal.throwIfAborted();
    context = await withinDeadline(buildReplyContext(conversation, history, inbound, settings, language, signal), signal);
    draft.timings.contextMs = elapsed(started);
    draft.tools = context.tools;
    if (context.cardMasked) draft.timings.cardMasked = 1;
    if (!context.unanswered.length) {
      draft.parts = shapeReply(fallbacks.text_only[language]);
      return { state: 'completed', draft };
    }
    const replyFallback = codeFallback(context, true);
    const call = async (messages: ModelMessage[], purpose: 'reply' | 'repair') => {
      signal.throwIfAborted();
      const requestedAt = performance.now();
      try {
        const response = await withinDeadline(model.chat({
          usage: { featureId: 'F10', purpose, businessId: conversation.businessId, conversationId: conversation.id, turnId },
          model: purpose === 'reply' ? 'chat' : 'strong',
          reasoningEffort: purpose === 'reply' ? 'low' : 'medium',
          toolChoice: 'none',
          maxOutputTokens: 2000,
          timeoutMs: Math.max(1, config.MODEL_TIMEOUT_MS - elapsed(started)),
          signal,
          fake: { text: replyFallback },
          messages,
        }), signal);
        calls.push(response);
        const parsed = output.safeParse(response.text);
        return parsed.success && response.finishReason === 'stop' ? parsed.data : '';
      } finally {
        modelMs.push(elapsed(requestedAt));
      }
    };
    let raw = await call(context.messages, 'reply');
    const guardStart = performance.now();
    let checked = inspectReply(raw, context);
    draft.guardActions.push(...checked.actions);
    if (checked.violations.length && elapsed(started) < 12000) {
      draft.retryUsed = true;
      draft.guardActions.push(...checked.violations.map((violation) => ({ ...violation, action: 'repair' as const })));
      const note = repairPrompt.replace('{{problems}}', checked.violations.map(({ detail }) => '- ' + detail).join('\n'));
      try {
        raw = await call([...context.messages, { role: 'assistant', content: maskCardNumbers(raw) }, { role: 'developer', content: note }], 'repair');
        checked = inspectReply(raw, context);
        draft.guardActions.push(...checked.actions);
      } catch (error) {
        if (signal.aborted || error instanceof AppError && error.code === 'PROVIDER_BUDGET_EXHAUSTED') throw error;
      }
    }
    let text = checked.text;
    if (checked.violations.length) {
      draft.guardActions.push(...checked.violations.map((violation) => ({ ...violation, action: 'strip' as const })));
      const wrongLanguage = checked.violations.some(({ guard }) => guard === 'language');
      text = wrongLanguage ? fallbacks.no_answer[language] : stripUnsafeSentences(text, context);
    }
    const onlyQuote = context.prices.length === 1 ? context.prices[0].quote : null;
    const includesQuotedPrice = onlyQuote && moneyMentions(text).some(({ minor }) =>
      minor === onlyQuote.unitPriceMinor || minor === onlyQuote.subtotalMinor,
    );
    if (!text || onlyQuote && isPriceQuestion(context) && !includesQuotedPrice) {
      text = replyFallback;
    }
    const catalogText = renderCatalogQuotes(context, text);
    if (catalogText) {
      text = catalogText;
      draft.guardActions.push({ guard: 'price', action: 'fallback', detail: 'Rendered catalog prices by SKU' });
    }
    Object.assign(draft, usedEvidence(text, context));
    draft.parts = shapeReply(text);
    draft.timings.guardMs = elapsed(guardStart);
    return { state: 'completed', draft };
  } catch (error) {
    const timedOut = signal.aborted && !cancellation.aborted;
    draft.errorCode = error instanceof AppError ? error.code : timedOut ? 'PROVIDER_UNAVAILABLE' : 'INTERNAL';
    if (draft.errorCode === 'PROVIDER_BUDGET_EXHAUSTED') {
      const canHandoff = context?.rules.handoff && process.env.ESCALATION_ENABLED !== '0';
      draft.parts = shapeReply(fallbacks[canHandoff ? 'budget_handoff' : 'ai_failed_retry'][language]);
      draft.guardActions.push({ guard: 'budget', action: 'fallback', detail: 'Provider budget exhausted' });
      return { state: canHandoff ? 'handoff' : 'completed', draft };
    }
    return { state: 'failed', draft, retryable: timedOut || cancellation.aborted ||
      error instanceof AppError && (error.retryable || error.code === 'SERVICE_NOT_READY') };
  } finally {
    draft.usage = summarizeUsage(calls);
    draft.timings.modelMs = modelMs;
  }
}
