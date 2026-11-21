import { z } from 'zod';
import type { CustomerLanguage } from '@nless/shared/core/language';
import type { AiTurnUsage } from '@nless/shared/features/ai-agent/types';
import type { BusinessSettings } from '@nless/shared/features/business-settings/types';
import type { ConversationRecord, MessageRecord } from '@nless/shared/features/inbox/types';
import { AppError, config, model } from '../../core';
import type { ModelChatInput, ModelChatResult } from '../../core';
import { getBusinessOpenState } from '../business-settings/service';
import { casualIntent, catalogPriceIntent, classifyIntent, unknownIntent } from './classifier';
import type { IntentScore } from './classifier';
import { buildReplyContext, turnLanguage, unansweredCustomerMessages, unansweredInbounds } from './context';
import type { ReplyContext } from './context';
import { fallbacks } from './fallbacks';
import { codeFallback, inspectReply, isPriceQuestion, mentionsProduct, receiptText, renderCatalogQuotes, shapeReply, stripUnsafeSentences } from './guards';
import { canRequestHandoff } from './handoff';
import { explicitlyRequestsStaff, replyToStaffOffer } from './intents';
import { runModelLoop } from './loop';
import { arabicDigits, maskCardNumbers } from './mask';
import { moneyMentions } from './money';
import { currentAvailabilityReply, currentPhotoRequest, getReplyProductImages } from './productMedia';
import { repairPrompt } from './prompt';
import { customerInboundsHeldByStaff, priorSavedReply } from './repo';
import type { TurnDraft } from './repo';
import { productFactQuestion, replyWithProductFact } from './product-facts';

type Generation =
  | { state: 'completed' | 'handoff'; draft: TurnDraft }
  | { state: 'skipped'; draft: TurnDraft; reason: 'non_text_repeat' }
  | { state: 'failed'; draft: TurnDraft; retryable: boolean };

const output = z.string().max(8000);
const segmenter = new Intl.Segmenter('th', { granularity: 'word' });
const commonEvidenceWords = new Set(['ราคา', 'สินค้า', 'ค่ะ', 'ครับ', 'บาท', 'baht', 'price', 'costs', 'shop']);
const elapsed = (start: number) => Math.round(performance.now() - start);
const ungroundedOfferIntents = new Set(['QUESTION', 'STATUS_CHECK', 'PRICE_CALC', 'PRODUCT_FILTER', 'BOOKING_AVAILABILITY', 'FEEDBACK']);

function rememberIntent(draft: TurnDraft, { label, source, confidence }: IntentScore): void {
  draft.intent = label;
  draft.intentSource = source;
  draft.intentConfidence = confidence;
}

function staffAcknowledgement(draft: TurnDraft, score: IntentScore, shopOpen: boolean | null): Generation {
  rememberIntent(draft, score);
  draft.handoffReason = 'customer_request';
  draft.parts = [{ type: 'text', text: fallbacks[shopOpen === false ? 'escalation_ack_closed' : 'escalation_ack'][draft.language] }];
  return { state: 'handoff', draft };
}

function appendHandoffOffer(draft: TurnDraft): void {
  const offer = fallbacks.handoff_offer[draft.language];
  const last = draft.parts.at(-1);
  if (draft.parts.length >= 4 && last?.type === 'text') {
    last.text = [...last.text].slice(0, 998 - [...offer].length).join('') + '\n\n' + offer;
  } else {
    draft.parts.push({ type: 'text', text: offer });
  }
  draft.handoffOffered = true;
}

function summarizeUsage(calls: readonly Pick<ModelChatResult, 'usage'>[]): AiTurnUsage | null {
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

function usedEvidence(text: string, context: ReplyContext, receipt: string | null): Pick<TurnDraft, 'evidenceIds' | 'productRefs'> {
  const priceText = receipt ? text + '\n' + receipt : text;
  const amounts = new Set(moneyMentions(priceText).map(({ minor }) => minor));
  const modelAmounts = new Set(moneyMentions(text).map(({ minor }) => minor));
  const prices = context.prices.filter((price) => mentionsProduct(priceText, price) ||
    context.prices.length === 1 && (amounts.has(price.quote.unitPriceMinor) || amounts.has(price.quote.subtotalMinor)) ||
    context.totals.some(({ subtotalMinor, lines }) => amounts.has(subtotalMinor) && lines.some((line) => line.id === price.id)));
  const quoteNames = prices.flatMap(({ quote, names }) => [quote.sku, ...names]).sort((left, right) => right.length - left.length);
  const replyWithoutProducts = quoteNames.reduce(
    (value, name) => value.replaceAll(name.toLocaleLowerCase(), ' '), text.toLocaleLowerCase(),
  );
  const terms = (value: string) => [...segmenter.segment(value.toLocaleLowerCase())].flatMap(({ segment, isWordLike }) =>
    isWordLike && segment.length >= 3 && /\p{L}/u.test(segment) && !commonEvidenceWords.has(segment) ? [segment] : [],
  );
  const replyTerms = new Set(terms(replyWithoutProducts));
  const catalogAmounts = new Set(prices.flatMap(({ quote }) => [quote.unitPriceMinor, quote.subtotalMinor]));
  const days = (value: string) => [...arabicDigits(value).matchAll(/\b(\d+)\s*(?:วัน|days?\b)/giu)].map((match) => Number(match[1]));
  const replyDays = new Set(days(text));
  const knowledge = context.knowledge.filter(({ snippet }) => {
    const overlap = new Set(terms(snippet).filter((term) => replyTerms.has(term)));
    return overlap.size >= 2 ||
      overlap.size > 0 && days(snippet).some((value) => replyDays.has(value)) ||
      /คืนสินค้า|\breturns?\b/iu.test(snippet) && /คืนสินค้า|\breturns?\b/iu.test(text) && days(snippet).some((value) => replyDays.has(value)) ||
      moneyMentions(snippet).some(({ minor }) => modelAmounts.has(minor) && !catalogAmounts.has(minor));
  });
  return {
    evidenceIds: [...new Set([...prices.map(({ id }) => id), ...knowledge.map(({ id }) => id)])],
    productRefs: [...new Map(prices.map(({ quote, name }) => [quote.itemId, { itemId: quote.itemId, sku: quote.sku, name }])).values()],
  };
}

function draftText(response: ModelChatResult): string {
  const parsed = output.safeParse(response.text);
  return parsed.success && response.finishReason === 'stop' ? parsed.data : '';
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
  inboxHistory: readonly MessageRecord[],
  inbound: MessageRecord,
  settings: BusinessSettings,
  cancellation: AbortSignal,
  mode: 'reply' | 'suggest',
): Promise<Generation> {
  const started = performance.now();
  const signal = AbortSignal.any([cancellation, AbortSignal.timeout(config.MODEL_TIMEOUT_MS)]);
  const language = turnLanguage(inboxHistory, inbound, settings.language);
  const draft = emptyDraft(language);
  const calls: Pick<ModelChatResult, 'usage'>[] = [];
  const modelMs: number[] = [];
  let context: ReplyContext | undefined;
  try {
    signal.throwIfAborted();
    const backlog = unansweredInbounds(inboxHistory, inbound).filter(({ id }) => id !== inbound.id);
    const held = mode === 'reply' && backlog.length
      ? await withinDeadline(customerInboundsHeldByStaff(conversation, backlog.map(({ id }) => id)), signal)
      : null;
    const history = held?.size ? inboxHistory.filter(({ id }) => !held.has(id)) : inboxHistory;
    const unanswered = unansweredCustomerMessages(history, inbound);
    const prior = mode === 'reply' ? await withinDeadline(priorSavedReply(conversation, inbound), signal) : null;
    const previousAnswer = history.findLast((message) => message.seq < inbound.seq && message.direction === 'outbound' &&
      (message.author === 'ai' || message.author === 'staff'));
    const matchingPrior = previousAnswer && previousAnswer.id === prior?.replyMessageId && previousAnswer.delivery.state !== 'failed'
      ? prior : null;
    const offerPending = matchingPrior?.offeredHandoff === true;
    const offerReply = offerPending && unanswered.length === 1 ? replyToStaffOffer(unanswered[0]) : null;
    if (mode === 'reply' && (explicitlyRequestsStaff(unanswered.join('\n')) || offerReply === 'accepted') &&
        await withinDeadline(canRequestHandoff(conversation.businessId), signal)) {
      const opening = await withinDeadline(getBusinessOpenState(conversation.businessId).catch(() => null), signal);
      return staffAcknowledgement(draft, { label: 'ESCALATION', source: 'regex', confidence: 1 }, opening?.open ?? null);
    }
    const casual = casualIntent(unanswered);
    if (mode === 'reply' && !unanswered.length && prior?.recentlySentNonTextNotice) {
      return { state: 'skipped', draft, reason: 'non_text_repeat' };
    }
    const factQuestion = casual ? null : productFactQuestion(unanswered);
    context = await withinDeadline(buildReplyContext(conversation, history, inbound, settings, language, signal, {
      skipLookups: Boolean(casual) || !unanswered.length || Boolean(factQuestion), offerPending,
      previousProductSkus: matchingPrior?.productRefs.map(({ sku }) => sku),
    }), signal);
    draft.timings.contextMs = elapsed(started);
    draft.tools = context.tools;
    if (context.cardMasked) draft.timings.cardMasked = 1;
    const canEscalate = mode === 'reply' && context.rules.handoff && process.env.ESCALATION_ENABLED !== '0';
    if (!context.unanswered.length) {
      draft.timings.nonTextNotice = 1;
      draft.parts = shapeReply(fallbacks[inbound.parts.some(({ type }) => type === 'image') ? 'image_only' : 'text_only'][language]);
      if (canEscalate && !offerPending) appendHandoffOffer(draft);
      return { state: 'completed', draft };
    }
    const fact = factQuestion && await withinDeadline(replyWithProductFact({
      question: factQuestion, context, signal, deadline: started + config.MODEL_TIMEOUT_MS, suggestDraft: mode === 'reply',
      usage: { businessId: conversation.businessId, conversationId: conversation.id, turnId, featureId: 'F10', purpose: 'product_fact' },
      noteUsage: (result) => { calls.push(result); modelMs.push(result.latencyMs); },
    }), signal);
    if (fact) {
      rememberIntent(draft, { label: 'QUESTION', source: 'regex', confidence: 1 });
      draft.parts = fact.parts;
      draft.productRefs = fact.productRefs;
      draft.evidenceIds = fact.evidenceIds;
      if (fact.offerStaff && canEscalate && !offerPending) appendHandoffOffer(draft);
      return { state: 'completed', draft };
    }
    const draftContext = context;
    const modelAbort = new AbortController();
    const modelSignal = AbortSignal.any([signal, modelAbort.signal]);
    const call = (purpose: 'reply' | 'repair') => async (
      round: Pick<ModelChatInput, 'messages' | 'tools' | 'toolChoice' | 'providerState'>,
    ) => {
      modelSignal.throwIfAborted();
      const requestedAt = performance.now();
      try {
        const response = await withinDeadline(model.chat({
          usage: { featureId: 'F10', purpose, businessId: conversation.businessId, conversationId: conversation.id, turnId },
          model: purpose === 'reply' ? 'chat' : 'strong',
          reasoningEffort: purpose === 'reply' ? 'low' : 'medium',
          maxOutputTokens: 2000,
          timeoutMs: Math.max(1, config.MODEL_TIMEOUT_MS - elapsed(started)),
          signal: modelSignal,
          fake: {
            text: casual ? fallbacks[casual.label === 'GREETING' ? 'greeting' : 'goodbye'][language] : codeFallback(draftContext, true),
          },
          ...round,
        }), modelSignal);
        calls.push(response);
        return response;
      } finally {
        modelMs.push(elapsed(requestedAt));
      }
    };
    const loop = { messages: [...context.messages], executedCalls: 0 };
    const toolOptions = { tools: !casual, handoff: canEscalate };
    const firstReply = runModelLoop(loop, context, conversation.businessId, call('reply'), started, modelSignal, toolOptions)
      .then((response) => ({ response } as const), (error: unknown) => ({ error } as const));
    const priceText = context.catalogRequest.linkedSameProduct
      ? context.catalogRequest.text + ' ' + context.catalogRequest.skus[0]
      : context.catalogRequest.text;
    const price = catalogPriceIntent(priceText, context.prices.map(({ quote }) => quote));
    const classifierTimeout = Math.min(8000, config.MODEL_TIMEOUT_MS - elapsed(started) - 1500);
    let score = casual ?? price ?? unknownIntent;
    if (!casual && !price && classifierTimeout > 0) {
      const classifyStarted = performance.now();
      const classifierSignal = AbortSignal.any([signal, AbortSignal.timeout(classifierTimeout)]);
      score = await withinDeadline(classifyIntent({
        turnId, businessId: conversation.businessId, conversationId: conversation.id, history, inbound, offerPending,
        timeoutMs: classifierTimeout, signal: classifierSignal,
      }), classifierSignal).catch(() => unknownIntent);
      draft.timings.classifyMs = elapsed(classifyStarted);
      if (score.response) calls.push(score.response);
    }
    rememberIntent(draft, score);
    if (canEscalate && offerReply !== 'declined' && score.label === 'ESCALATION' && (score.confidence ?? 0) >= 0.85) {
      modelAbort.abort();
      await firstReply;
      draft.tools = [];
      return staffAcknowledgement(draft, score, context.shopOpen);
    }
    const first = await firstReply;
    if ('error' in first) throw first.error;
    let raw = draftText(first.response);
    const guardStart = performance.now();
    let checked = inspectReply(raw, context);
    draft.guardActions.push(...checked.actions);
    if ((checked.violations.length || !checked.text) && elapsed(started) < 12000) {
      draft.retryUsed = true;
      draft.guardActions.push(...checked.violations.map((violation) => ({ ...violation, action: 'repair' as const })));
      const problems = checked.violations.map(({ detail }) => '- ' + detail).join('\n') || '- Return a complete reply supported by the shop evidence.';
      const note = repairPrompt.replace('{{problems}}', problems);
      try {
        if (raw) loop.messages.push({ role: 'assistant', content: maskCardNumbers(raw) });
        loop.messages.push({ role: 'developer', content: note });
        raw = draftText(await runModelLoop(loop, context, conversation.businessId, call('repair'), started, modelSignal, toolOptions));
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
      text = codeFallback(context, true);
    }
    const catalogText = renderCatalogQuotes(context, text);
    if (catalogText) {
      text = catalogText;
      draft.guardActions.push({ guard: 'price', action: 'fallback', detail: 'Rendered catalog prices by SKU' });
    }
    if (!context.prices.length && context.tools.some(({ name, error, prefetch }) =>
      name === 'get_price' && error === 'NOT_FOUND' &&
      (prefetch ? draftContext.catalogRequest.skus.length > 0 : !draftContext.knowledge.length),
    )) {
      text = fallbacks.product_not_found[language];
    }
    const oneCatalogQuestion = context.unanswered.length === 1 && !isPriceQuestion(context) &&
      !/\b(?:and|also)\b|และ|อีกอย่าง/iu.test(context.unanswered[0]);
    const availability = currentAvailabilityReply(context);
    if (availability && (oneCatalogQuestion || text === fallbacks.no_answer[language])) text = availability;
    const receipt = receiptText(context, text);
    Object.assign(draft, usedEvidence(text, context, receipt));
    draft.parts = shapeReply(text);
    if (receipt) draft.parts.push({ type: 'text', text: receipt });
    const noGrounding = !draft.evidenceIds.length && !context.tools.some(({ ok }) => ok) &&
      ungroundedOfferIntents.has(score.label) && !/[?？]$/u.test(text.trim());
    if (canEscalate && !offerPending && !casual && (context.offeredByTool || score.label === 'ESCALATION' ||
        text === fallbacks.no_answer[language] || noGrounding)) {
      appendHandoffOffer(draft);
    }
    draft.timings.guardMs = elapsed(guardStart);
    const photo = mode === 'reply' ? currentPhotoRequest(context) : null;
    const directPhoto = photo && oneCatalogQuestion && !availability;
    if (mode === 'reply' && (draft.productRefs.length || photo)) {
      const photoRef = photo && { itemId: photo.quote.itemId, sku: photo.quote.sku, name: photo.name };
      const mediaSignal = AbortSignal.any([signal, AbortSignal.timeout(1200)]);
      const images = await withinDeadline(getReplyProductImages(conversation.businessId, context, {
        productRefs: photoRef ? [photoRef] : draft.productRefs,
        parts: directPhoto ? [] : draft.parts,
      }, mediaSignal), mediaSignal)
        .catch(() => []);
      if (directPhoto && photo && photoRef) {
        const caption = language === 'th'
          ? images.length ? 'นี่คือ ' + photo.name + ' ค่ะ' : 'ยังไม่พบรูปสินค้าของ ' + photo.name + ' ค่ะ'
          : images.length ? 'This is ' + photo.name + '.' : 'I could not find a shop photo for ' + photo.name + '.';
        draft.parts = shapeReply(caption);
        draft.evidenceIds = [photo.id];
        draft.productRefs = [photoRef];
        draft.handoffOffered = false;
      } else if (images.length && photo && photoRef && !draft.productRefs.some(({ itemId }) => itemId === photoRef.itemId)) {
        draft.evidenceIds = [...new Set([...draft.evidenceIds, photo.id])];
        draft.productRefs.push(photoRef);
      }
      draft.parts.push(...images);
    }
    return { state: 'completed', draft };
  } catch (error) {
    const timedOut = signal.aborted && !cancellation.aborted;
    draft.errorCode = error instanceof AppError ? error.code : timedOut ? 'PROVIDER_UNAVAILABLE' : 'INTERNAL';
    if (draft.errorCode === 'PROVIDER_BUDGET_EXHAUSTED') {
      const canHandoff = mode === 'reply' && context?.rules.handoff && process.env.ESCALATION_ENABLED !== '0';
      draft.parts = shapeReply(fallbacks[canHandoff ? 'budget_handoff' : 'ai_failed_retry'][language]);
      if (canHandoff) draft.handoffReason = 'budget_exhausted';
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
