import { AppError } from '../../core';
import { runAiTurn } from './turn';
import type { AiTurnMetrics, AiTurnTopic, GenerateReplyOptions } from '@nless/shared/features/ai-agent/types';
import type { ChatTurnResult, MetricsRange } from '@nless/shared/core/types';
import type { JobHandler } from '../../core';
import type { AiReplyJobPayload } from '@nless/shared/features/inbox/types';

export { readTurnTrace as getTurnTrace } from './trace';

/**
 * @owner F10 ai-agent · B2 · consumers: B2 ai.reply handler, A1 (suggest), B2 voice
 * Reads getHistory, getBusinessSettings, searchKnowledge, getProduct/getPrice; calls model.chat model 'chat' with
 * bounded tools (max 4 tool calls per turn incl. parallel, loop via providerState, MODEL_TIMEOUT_MS); classifier /
 * extraction use model 'fast' + strict json_schema; at most one retry of the turn with model 'strong'.
 * Prices/stock only from getPrice/getProduct. Card numbers in customer text are masked before any model call or trace.
 * Answer first, then offer staff (handoff-offer) instead of handing off on the first unclear message.
 * LANGUAGE: the reply is in the language of the customer's latest message, Thai or English, decided per message
 * (docs/specs/F10-ai-agent.md §5.13). BusinessSettings.language is only the default for a message with no letters.
 * Every text written by code (fallbacks, handoff notice, receipt, card altText, formatted amounts) follows the same language.
 * Does NOT save or send (delivery { mode: 'real', state: 'not_required' }). Writes its own turn trace (F10 table).
 * Model timeout/error → returns state 'failed' with reply.parts [] (nothing is saved for that attempt).
 * PROVIDER_BUDGET_EXHAUSTED (team credits / hard limit gone) → state 'handoff' with the fixed handoff text of
 * fake step 4 in the customer's language (no model text), so staff take over. It does not throw for model/provider
 * errors and never causes a side effect. Unknown conversation → AppError('NOT_FOUND').
 */
export async function generateReply(conversationId: string, opts?: GenerateReplyOptions): Promise<ChatTurnResult> {
  return (await runAiTurn(conversationId, opts ?? {})).response;
}

/**
 * ai.reply job handler (F10 owns it, declared in features/ai-agent/routes.ts `jobs`). Order is fixed:
 *   1 getBusinessSettings(businessId).aiEnabled  2 isHumanTakeover(conversationId) false
 *   3 serialisation: the job's lockKey `conversation:<id>` already guarantees one ai.reply per conversation (the worker
 *     holds that advisory lock for the whole job). The F10 claim takes a short transaction lock scoped to
 *     `ai.turn:<id>`. Queued and direct turns use the same fenced lease and deduplicate by inbound message.
 *   4 generateReply(conversationId, { triggerMessageId }) — state 'failed' or empty parts → stop (nothing saved) and
 *     retry the job (at most 3 attempts). After the last attempt, or on a non-retryable provider error, the customer is
 *     not left in silence: the handler sends one fixed apology in the customer's language and calls
 *     requestHumanHandoff(reason 'ai_failed') (F10 spec §5.9). The apology is code text, never a model answer.
 *   5 re-check 1+2 (state may have changed during the model call)
 *   6 saveMessage({ direction: 'outbound', author: 'ai', parts, origin, groupId }) → messageId (one groupId per reply)
 *   7 sendToCustomer(conversationId, parts, { messageId }).
 *   Any "no" in 1–2/5 → return quietly (message stays stored, no reply, no error). No plan or quota check: unlimited
 *   (core model.* already wrote the cost rows to model_usage).
 */
export const aiReplyJobHandler: JobHandler<AiReplyJobPayload> = async (job) => {
  const turn = await runAiTurn(job.payload.conversationId, {
    businessId: job.businessId ?? undefined,
    triggerMessageId: job.payload.messageId,
    signal: job.signal,
    deliver: true,
  });
  return turn.retryAt ? { retryAt: turn.retryAt } : undefined;
};


export async function getAiTurnMetrics(businessId: string, range: MetricsRange): Promise<AiTurnMetrics> {
  throw new AppError("SERVICE_NOT_READY", "getAiTurnMetrics is not implemented");
}


export async function listAiTurnTopics(businessId: string, opts: { finishedFrom: string; finishedTo: string; limit?: number }): Promise<AiTurnTopic[]> {
  throw new AppError("SERVICE_NOT_READY", "listAiTurnTopics is not implemented");
}
