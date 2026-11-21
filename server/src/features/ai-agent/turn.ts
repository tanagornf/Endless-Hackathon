import type { ChatTurnResult } from '@nless/shared/core/types';
import type { GenerateReplyOptions } from '@nless/shared/features/ai-agent/types';
import type { ConversationRecord, MessageRecord } from '@nless/shared/features/inbox/types';
import { AppError, log, publish, sendToCustomer } from '../../core';
import { getConversation, getHistory, saveMessage } from '../inbox/service';
import { fallbacks } from './fallbacks';
import { finalSkipReason, isAiAllowed } from './gate';
import { generateDraft } from './generation';
import { beginHandoff, canRequestHandoff, staffHandoffTitle } from './handoff';
import { claimTurn, finishTurn, LEASE_RENEW_MS, MAX_ATTEMPTS, readDraft, releaseClaim, renewClaim, storeDraft } from './repo';
import type { HandoffCheckpoint, TurnDraft, TurnLease } from './repo';

const delayRetry = (ms: number) => new Date(Date.now() + ms).toISOString();
const elapsed = (start: number) => Math.round(performance.now() - start);

function result(turnId: string, state: ChatTurnResult['state'], draft?: TurnDraft | null): ChatTurnResult {
  return {
    turnId, state,
    reply: { parts: draft?.parts ?? [], evidenceIds: draft?.evidenceIds ?? [] },
    delivery: { mode: 'real', state: 'not_required' },
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
  let handoff: HandoffCheckpoint | undefined = turn.escalated
    ? { turnId: turn.id, version: turn.handoff_assignment_version }
    : undefined;
  const previousDraft = readDraft(turn);
  if (claim.status === 'finished') {
    const state = turn.state === 'completed' || turn.state === 'handoff' || turn.state === 'awaiting_confirmation' ? turn.state : 'failed';
    return { response: result(turn.id, state, state === 'failed' ? null : previousDraft) };
  }

  const lease = new AbortController();
  const signal = request.signal ? AbortSignal.any([lease.signal, request.signal]) : lease.signal;
  const heartbeat = setInterval(() => {
    void renewClaim(turn).then((renewed) => { if (!renewed) lease.abort(); }, () => lease.abort());
  }, LEASE_RENEW_MS);
  heartbeat.unref();
  try {
    const start = performance.now();
    const gate = await isAiAllowed(conversation, inbound, history, mode, handoff);
    if (!gate.allowed) {
      await closeTurn(turn, { state: gate.reason === 'superseded' ? 'superseded' : 'skipped', reason: gate.reason, timings: { gate1Ms: elapsed(start) } });
      return { response: result(turn.id, 'failed') };
    }
    const gate1Ms = elapsed(start);
    const generated = previousDraft
      ? { state: previousDraft.handoffReason ? 'handoff' as const : 'completed' as const, draft: previousDraft }
      : await generateDraft(turn.id, conversation, history, inbound, gate.settings, signal, mode);
    const { draft } = generated;
    draft.timings.gate1Ms = gate1Ms;
    if (signal.aborted) {
      await releaseClaim(turn);
      return { response: result(turn.id, 'pending'), retryAt: delayRetry(5000) };
    }

    let state = generated.state;
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
    let replyMessageId = turn.reply_message_id ?? undefined;
    if (request.deliver) {
      if (draft.handoffReason && !handoff) {
        if (await canRequestHandoff(conversation.businessId).catch(() => false)) {
          const transfer = await beginHandoff(turn, finalGate.conversation, draft.handoffReason, finalGate.settings.language, signal);
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
      let parts = draft.parts;
      if (!replyMessageId) {
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
      const sendStart = performance.now();
      try {
        await sendToCustomer(conversationId, parts, { businessId: conversation.businessId, messageId: replyMessageId });
      } catch (error) {
        log.warn({ turnId: turn.id, replyMessageId }, 'Saved AI reply could not be queued for delivery');
        if (turn.attempts < MAX_ATTEMPTS && (!(error instanceof AppError) || error.retryable)) {
          const retryAt = delayRetry(4000 * turn.attempts);
          draft.timings.sendMs = elapsed(sendStart);
          await closeTurn(turn, { state: 'failed', replyMessageId, retryAt, timings: draft.timings });
          return { response: result(turn.id, 'pending'), retryAt };
        }
      }
      draft.timings.sendMs = elapsed(sendStart);
    }
    await closeTurn(turn, { state, replyMessageId, timings: draft.timings });
    return { response: result(turn.id, state, draft) };
  } catch (error) {
    await releaseClaim(turn).catch(() => undefined);
    throw error;
  } finally {
    clearInterval(heartbeat);
  }
}
