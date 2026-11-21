import type { ChatTurnResult } from '@nless/shared/core/types';
import type { GenerateReplyOptions } from '@nless/shared/features/ai-agent/types';
import type { ConversationRecord, MessageRecord } from '@nless/shared/features/inbox/types';
import { AppError, log, publish, sendToCustomer } from '../../core';
import { getConversation, getHistory, saveMessage } from '../inbox/service';
import { notify } from '../notifications/service';
import { submitLineSlip } from '../payments/service';
import { openConsultOnShopMiss } from './consultIntake';
import { fallbacks } from './fallbacks';
import { finalSkipReason, isAiAllowed } from './gate';
import { generateDraft } from './generation';
import { beginHandoff, canRequestHandoff, persistHandoff, recoverHandoff, staffHandoffTitle } from './handoff';
import { isOrderSummary, materializeOrder } from './orderProposal';
import { claimTurn, finishTurn, LEASE_RENEW_MS, MAX_ATTEMPTS, readDraft, releaseClaim, renewClaim, storeDraft } from './repo';
import type { HandoffCheckpoint, TurnDraft, TurnLease } from './repo';
import { classifyStaffConsentReply, recordStaffConsentPrompt, resolveStaffConsent } from './staffConsent';
import type { StaffConsentDecision } from './staffConsent';

const delayRetry = (ms: number) => new Date(Date.now() + ms).toISOString();
const elapsed = (start: number) => Math.round(performance.now() - start);

const noDelivery = { mode: 'real', state: 'not_required' } as const;
const enqueueFailureCode = 'DELIVERY_ENQUEUE_FAILED';

function result(
  turnId: string,
  state: ChatTurnResult['state'],
  draft?: TurnDraft | null,
  delivery: ChatTurnResult['delivery'] = noDelivery,
): ChatTurnResult {
  return {
    turnId, state,
    reply: { parts: draft?.parts ?? [], evidenceIds: draft?.evidenceIds ?? [] },
    ...(isOrderSummary(draft?.order) ? { proposal: draft.order } : {}),
    delivery,
  };
}

interface TurnRequest extends GenerateReplyOptions {
  deliver?: boolean;
  businessId?: string;
}

interface TurnExecution {
  response: ChatTurnResult;
  retryAt?: string;
}

async function readSavedDelivery(conversation: ConversationRecord, inbound: MessageRecord, replyMessageId: string) {
  const { id, businessId } = conversation;
  const options = { businessId, limit: 50 };
  let page = await getHistory(id, options);
  for (;;) {
    const message = page.items.find((item) => item.id === replyMessageId && item.author === 'ai' && item.direction === 'outbound');
    if (message) return message.delivery;
    if (!page.nextCursor || page.items.some((item) => item.seq <= inbound.seq)) return null;
    page = await getHistory(id, { ...options, before: page.nextCursor });
  }
}

function deliveryResult(stored: MessageRecord['delivery'] | null): ChatTurnResult['delivery'] {
  return { mode: stored?.mode ?? 'real', state: stored?.state ?? 'unknown' };
}

async function loadInbound(conversation: ConversationRecord, triggerMessageId?: string) {
  const lookup = { businessId: conversation.businessId, limit: 20 };
  let page = await getHistory(conversation.id, lookup);
  let history = page.items.toSorted((left, right) => left.seq - right.seq);
  const find = (items: MessageRecord[]) => triggerMessageId
    ? items.find(({ id }) => id === triggerMessageId)
    : items.findLast(({ author, direction }) => author === 'customer' && direction === 'inbound');
  let inbound = find(history);
  for (let remaining = 4; !inbound && triggerMessageId && page.nextCursor && remaining > 0; remaining -= 1) {
    page = await getHistory(conversation.id, { ...lookup, before: page.nextCursor });
    inbound = find(page.items);
    history = [...page.items.toSorted((left, right) => left.seq - right.seq), ...history];
  }
  return { history, inbound };
}

async function closeTurn(turn: TurnLease, outcome: Parameters<typeof finishTurn>[1]): Promise<void> {
  if (await finishTurn(turn, outcome)) {
    publish(turn.business_id, {
      type: 'custom', featureId: 'F10', name: 'ai.turn', data: { turnId: turn.id, state: outcome.state },
    });
  }
}

async function currentGate(
  conversation: ConversationRecord,
  inbound: MessageRecord,
  mode: 'reply' | 'suggest',
  handoff?: HandoffCheckpoint,
) {
  const { businessId, id } = conversation;
  const [current, latest] = await Promise.all([
    getConversation(id, { businessId }),
    getHistory(id, { businessId, limit: 12 }),
  ]);
  if (!current) return { allowed: false as const, reason: 'business_inactive' as const };
  const gate = await isAiAllowed(current, inbound, latest.items, mode, handoff);
  return gate.allowed ? { ...gate, conversation: current } : gate;
}

export async function runAiTurn(conversationId: string, request: TurnRequest): Promise<TurnExecution> {
  const conversation = await getConversation(conversationId, { businessId: request.businessId });
  if (!conversation) {
    if (request.deliver) return { response: result(request.triggerMessageId ?? conversationId, 'failed') };
    throw new AppError('NOT_FOUND', 'Conversation not found');
  }
  const { history, inbound } = await loadInbound(conversation, request.triggerMessageId);
  if (!inbound) return { response: result(request.triggerMessageId ?? conversationId, 'failed') };
  const mode = request.mode ?? 'reply';
  const claim = await claimTurn(conversation, inbound, mode, request.deliver ?? false);
  if (claim.status === 'pending') {
    return { response: result(claim.turnId, 'pending'), retryAt: claim.retryAt };
  }
  const { turn } = claim;
  const staffScope = { businessId: conversation.businessId, customerId: conversation.customerId, conversationId,
    turnId: turn.id, inboundMessageId: inbound.id };
  const consentText = inbound.parts.length === 1 && inbound.parts[0].type === 'text' ? inbound.parts[0].text : '';
  const consentEnabled = request.deliver && mode === 'reply' && classifyStaffConsentReply(consentText) !== 'continue';
  let handoff: HandoffCheckpoint | undefined = turn.escalated
    ? { turnId: turn.id, version: turn.handoff_assignment_version }
    : undefined;
  let expectedHandoffVersion = turn.handoff_expected_version;
  const previousDraft = readDraft(turn);
  if (claim.status === 'finished') {
    const state = turn.state === 'completed' || turn.state === 'handoff' || turn.state === 'awaiting_confirmation' ? turn.state : 'failed';
    const delivery = request.deliver && turn.reply_message_id
      ? deliveryResult(await readSavedDelivery(conversation, inbound, turn.reply_message_id).catch(() => null))
      : noDelivery;
    return { response: result(turn.id, state, state === 'failed' ? null : previousDraft, delivery) };
  }

  const lease = new AbortController();
  const signal = request.signal ? AbortSignal.any([lease.signal, request.signal]) : lease.signal;
  const heartbeat = setInterval(() => {
    void renewClaim(turn).then((renewed) => { if (!renewed) lease.abort(); }, () => lease.abort());
  }, LEASE_RENEW_MS);
  heartbeat.unref();
  try {
    const start = performance.now();
    const preparedReason = previousDraft?.handoffReason;
    let consent: StaffConsentDecision | undefined;
    if (consentEnabled && preparedReason === 'customer_request' && expectedHandoffVersion !== null) {
      consent = await resolveStaffConsent(staffScope);
    }
    const lineEvidence = (decision?: StaffConsentDecision) =>
      conversation.channel === 'line' && decision?.status === 'confirmed' ? decision.origin : undefined;
    const recovered = request.deliver && !handoff && expectedHandoffVersion !== null && preparedReason
      ? await recoverHandoff(turn, preparedReason, expectedHandoffVersion, lineEvidence(consent)) : null;
    if (recovered) handoff = recovered;
    const gate = recovered
      ? await currentGate(conversation, inbound, mode, recovered)
      : await isAiAllowed(conversation, inbound, history, mode, handoff);
    if (!gate.allowed) {
      await closeTurn(turn, { state: gate.reason === 'superseded' ? 'superseded' : 'skipped', reason: gate.reason, timings: { gate1Ms: elapsed(start) } });
      return { response: result(turn.id, 'failed') };
    }
    if (recovered && preparedReason && !(await persistHandoff(turn, preparedReason, recovered))) {
      return { response: result(turn.id, 'pending'), retryAt: delayRetry(5000) };
    }
    if (consentEnabled && !consent) consent = await resolveStaffConsent(staffScope);
    const gate1Ms = elapsed(start);
    const staleConsentDraft = consent?.status === 'confirmed'
      ? previousDraft?.handoffReason !== 'customer_request'
      : previousDraft?.handoffReason === 'customer_request' && !handoff;
    const generated = previousDraft && !staleConsentDraft
      ? { state: previousDraft.handoffReason ? 'handoff' as const : 'completed' as const, draft: previousDraft }
      : await generateDraft(turn.id, conversation, history, inbound, gate.settings, signal, mode, consent);
    const { draft } = generated;
    draft.timings.gate1Ms = gate1Ms;
    if (signal.aborted) {
      await releaseClaim(turn);
      return { response: result(turn.id, 'pending'), retryAt: delayRetry(5000) };
    }
    if (generated.state === 'skipped') {
      if (await storeDraft(turn, draft)) await closeTurn(turn, { state: 'skipped', reason: generated.reason, timings: draft.timings });
      return { response: result(turn.id, 'failed') };
    }

    let state: 'completed' | 'handoff' | 'awaiting_confirmation' | 'failed' = generated.state;
    if (generated.state === 'failed') {
      const retryAt = generated.retryable && turn.attempts < MAX_ATTEMPTS ? delayRetry(4000 * turn.attempts) : undefined;
      if (retryAt || !request.deliver) {
        if (await storeDraft(turn, draft)) await closeTurn(turn, { state: 'failed', retryAt });
        return { response: result(turn.id, 'failed'), retryAt };
      }
      const canHandoff = await canRequestHandoff(conversation.businessId).catch(() => false);
      state = canHandoff ? 'handoff' : 'completed';
      if (canHandoff) {
        draft.handoffReason = 'ai_failed';
        draft.intent = 'ESCALATION';
      }
      draft.parts = [{ type: 'text', text: fallbacks[canHandoff ? 'ai_failed' : 'ai_failed_retry'][draft.language] }];
      log.error({ turnId: turn.id, errorCode: draft.errorCode }, 'AI turn exhausted its retries');
    }
    if (draft.handoffReason === 'budget_exhausted') {
      draft.intent = 'ESCALATION';
      log.error({ turnId: turn.id, errorCode: draft.errorCode }, 'AI provider budget exhausted');
    }
    if (!(await storeDraft(turn, draft))) {
      return { response: result(turn.id, 'pending'), retryAt: delayRetry(5000) };
    }

    const gate2Start = performance.now();
    const finalGate = await currentGate(conversation, inbound, mode, handoff);
    draft.timings.gate2Ms = elapsed(gate2Start);
    if (!finalGate.allowed) {
      await closeTurn(turn, {
        state: finalGate.reason === 'superseded' ? 'superseded' : 'skipped',
        reason: finalSkipReason(finalGate.reason), timings: draft.timings,
      });
      return { response: result(turn.id, 'failed') };
    }
    if (!(await renewClaim(turn)) || signal.aborted) {
      await releaseClaim(turn);
      return { response: result(turn.id, 'pending'), retryAt: delayRetry(5000) };
    }
    if (request.deliver && draft.pendingSlipFileId) {
      const slipInbound = history.find((message) => message.seq <= inbound.seq && message.author === 'customer' &&
        message.direction === 'inbound' && message.parts.some((part) => part.type === 'image' && part.fileId === draft.pendingSlipFileId));
      const orderNumbers = [...new Set(consentText.toUpperCase().match(/\bNL-\d{2}[A-Z]{3}\d{2}-[A-Z]{4}-[A-Z]{4}\b/g) ?? [])];
      const orderNumber = orderNumbers.length === 1 ? orderNumbers[0] : undefined;
      const matched = slipInbound && await submitLineSlip(
        conversation, slipInbound, draft.pendingSlipFileId, draft.language, signal, orderNumber,
      );
      draft.parts = [{ type: 'text', text: fallbacks[matched ? 'slip_received' : 'slip_order_unclear'][draft.language] }];
      draft.pendingSlipFileId = null;
      if (!(await storeDraft(turn, draft)) || signal.aborted) {
        await releaseClaim(turn);
        return { response: result(turn.id, 'pending'), retryAt: delayRetry(5000) };
      }
      const afterSlip = await currentGate(conversation, inbound, mode);
      if (!afterSlip.allowed) {
        await closeTurn(turn, { state: 'skipped', reason: finalSkipReason(afterSlip.reason), timings: draft.timings });
        return { response: result(turn.id, 'failed') };
      }
    }
    if (draft.order?.kind === 'prepare_order') {
      await materializeOrder(draft, draft.order, conversation.businessId, conversationId, turn.id, signal);
      const afterProposal = await currentGate(conversation, inbound, mode);
      if (!afterProposal.allowed) {
        await closeTurn(turn, { state: afterProposal.reason === 'superseded' ? 'superseded' : 'skipped',
          reason: finalSkipReason(afterProposal.reason), timings: draft.timings });
        return { response: result(turn.id, 'failed') };
      }
      if (!(await storeDraft(turn, draft)) || signal.aborted) {
        await releaseClaim(turn);
        return { response: result(turn.id, 'pending'), retryAt: delayRetry(5000) };
      }
    }
    if (isOrderSummary(draft.order)) state = 'awaiting_confirmation';
    let replyMessageId = turn.reply_message_id ?? undefined;
    let delivery: ChatTurnResult['delivery'] = noDelivery;
    let deliveryErrorCode: string | undefined;
    if (request.deliver) {
      if (draft.handoffReason && !handoff) {
        if (await canRequestHandoff(conversation.businessId).catch(() => false)) {
          expectedHandoffVersion ??= finalGate.conversation.version;
          const transfer = await beginHandoff(
            turn, finalGate.conversation, draft.handoffReason, expectedHandoffVersion, finalGate.settings.language, signal,
            draft.handoffReason === 'customer_request' ? lineEvidence(consent) : undefined,
          );
          if (transfer.status === 'lost') return { response: result(turn.id, 'pending'), retryAt: delayRetry(5000) };
          if (transfer.status === 'stale') {
            await closeTurn(turn, { state: 'skipped', reason: 'takeover_during_generation', timings: draft.timings });
            return { response: result(turn.id, 'failed') };
          }
          handoff = transfer.checkpoint;
        } else {
          const fallback = draft.handoffReason === 'customer_request' ? 'contact_hidden' : 'ai_failed_retry';
          draft.parts = [{ type: 'text', text: fallbacks[fallback][draft.language] }];
          draft.handoffReason = null;
          state = 'completed';
          if (!(await storeDraft(turn, draft))) return { response: result(turn.id, 'pending'), retryAt: delayRetry(5000) };
        }
      }
      if (handoff && draft.handoffReason) {
        if (handoff.version !== null && expectedHandoffVersion !== null &&
            (await recoverHandoff(turn, draft.handoffReason, expectedHandoffVersion,
              draft.handoffReason === 'customer_request' ? lineEvidence(consent) : undefined))?.version !== handoff.version) {
          await closeTurn(turn, { state: 'skipped', reason: 'takeover_during_generation', timings: draft.timings });
          return { response: result(turn.id, 'failed') };
        }
        const ackGate = await currentGate(conversation, inbound, mode, handoff);
        if (!ackGate.allowed) {
          await closeTurn(turn, { state: 'skipped', reason: finalSkipReason(ackGate.reason), timings: draft.timings });
          return { response: result(turn.id, 'failed') };
        }
        if (!(await renewClaim(turn)) || signal.aborted) {
          await releaseClaim(turn);
          return { response: result(turn.id, 'pending'), retryAt: delayRetry(5000) };
        }
        if (!replyMessageId) {
          await saveMessage({
            businessId: conversation.businessId, conversationId, direction: 'outbound', author: 'system', origin: 'system',
            triggerAi: false, clientRequestId: 'ai.handoff.note:' + turn.id,
            parts: [{ type: 'text', text: staffHandoffTitle(draft.handoffReason, ackGate.settings.language) }],
          });
        }
      }
      const apology = draft.parts.length === 1 && draft.parts[0].type === 'text'
        && draft.parts[0].text === fallbacks.ai_failed_retry[draft.language];
      if (!replyMessageId && apology && draft.errorCode && draft.errorCode !== 'PROVIDER_BUDGET_EXHAUSTED') {
        await notify({
          businessId: conversation.businessId, to: { role: 'owners' }, type: 'system',
          title: staffHandoffTitle('ai_failed', finalGate.settings.language),
          link: '/chat?c=' + conversationId, dedupKey: 'ai-failed:' + turn.id,
        }).catch(() => log.warn({ turnId: turn.id }, 'Owner notification after exhausted model retries failed'));
      }
      let parts = draft.parts;
      if (!replyMessageId) {
        const consultOpened = await openConsultOnShopMiss(finalGate.conversation, inbound, draft, signal);
        if (signal.aborted) {
          await releaseClaim(turn);
          return { response: result(turn.id, 'pending'), retryAt: delayRetry(5000) };
        }
        if (consultOpened) {
          // The owner can answer this case without a separate staff handoff.
          draft.parts = [{ type: 'text', text: fallbacks.no_answer[draft.language] }];
          draft.handoffOffered = false;
          draft.staffConsentKind = null;
          if (!(await storeDraft(turn, draft))) {
            return { response: result(turn.id, 'pending'), retryAt: delayRetry(5000) };
          }
          parts = draft.parts;
        }
        const persistStart = performance.now();
        const saved = await saveMessage({
          businessId: conversation.businessId, conversationId, direction: 'outbound', author: 'ai',
          parts, origin: conversation.channel === 'web' ? 'demo' : 'live',
          triggerAi: false, groupId: turn.id, clientRequestId: 'ai.reply:' + turn.id,
          ...(handoff?.version != null ? { providerMeta: { nlessHandoffAckVersion: handoff.version } } : {}),
        });
        replyMessageId = saved.message.id;
        parts = saved.message.parts;
        draft.timings.persistMs = elapsed(persistStart);
      }
      if (draft.staffConsentKind && !(await recordStaffConsentPrompt(staffScope, draft.staffConsentKind, replyMessageId))) {
        await closeTurn(turn, { state: 'skipped', reason: 'superseded', replyMessageId, timings: draft.timings });
        return { response: result(turn.id, 'failed') };
      }
      if (signal.aborted) {
        await releaseClaim(turn);
        return { response: result(turn.id, 'pending'), retryAt: delayRetry(5000) };
      }
      const sendStart = performance.now();
      try {
        const receipt = await sendToCustomer(conversationId, parts, { businessId: conversation.businessId, messageId: replyMessageId });
        delivery = receipt.delivery;
      } catch (error) {
        // Enqueue can commit even when its acknowledgement fails. Only report
        // failure if the scoped message carries core's definitive marker.
        const stored = await readSavedDelivery(conversation, inbound, replyMessageId).catch(() => null);
        delivery = deliveryResult(stored);
        const accepted = stored?.state === 'pending' || stored?.state === 'sent' || stored?.state === 'unknown';
        if (stored?.state === 'failed' && stored.error === enqueueFailureCode) deliveryErrorCode = enqueueFailureCode;
        log.warn({ turnId: turn.id, replyMessageId, state: delivery.state }, 'Delivery enqueue did not return a receipt');
        if (!accepted && turn.attempts < MAX_ATTEMPTS && (!(error instanceof AppError) || error.retryable)) {
          const retryAt = delayRetry(4000 * turn.attempts);
          draft.timings.sendMs = elapsed(sendStart);
          await closeTurn(turn, { state: 'failed', replyMessageId, retryAt, timings: draft.timings });
          return { response: result(turn.id, 'pending'), retryAt };
        }
      }
      draft.timings.sendMs = elapsed(sendStart);
    }
    await closeTurn(turn, { state, replyMessageId, timings: draft.timings, deliveryErrorCode });
    return { response: result(turn.id, state, draft, delivery) };
  } catch (error) {
    await releaseClaim(turn).catch(() => undefined);
    throw error;
  } finally {
    clearInterval(heartbeat);
  }
}
