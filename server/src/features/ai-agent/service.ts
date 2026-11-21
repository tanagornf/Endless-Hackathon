import { AppError } from '../../core';
import { fakeReply, runFakeReplyJob } from './setup';
import type { AiTurnMetrics, AiTurnTopic, GenerateReplyOptions } from '@nless/shared/features/ai-agent/types';
import type { ChatTurnResult, MetricsRange } from '@nless/shared/core/types';
import type { JobHandler } from '../../core';
import type { AiReplyJobPayload } from '@nless/shared/features/inbox/types';

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
 * @fake deterministic, no model call, Thai reply (the fake is not bilingual; the 13:00 gate needs the real one):
 *   1. last customer message text = q (from getHistory); business from getConversation.
 *   2. a SEED.catalog item of that business whose sku or name/nameEn appears in q (case-insensitive) →
 *      getPrice → "<name> (<sku>) ราคา <฿x,xxx> ค่ะ" (+ " ตอนนี้สินค้าหมดค่ะ" when soldOut);
 *      evidenceIds [`catalog:<itemId>:v<version>`].
 *   3. else searchKnowledge(businessId, q) top hit → "จากข้อมูลร้าน: <snippet>" ; evidenceIds [`knowledge:<id>:r<revision>`].
 *   4. else "ขออภัยค่ะ ยังไม่มีข้อมูลเรื่องนี้ เดี๋ยวให้พนักงานช่วยตอบนะคะ", state 'handoff', evidenceIds [].
 *   turnId = `fake-turn-<triggerMessageId ?? conversationId>`; delivery { mode: 'real', state: 'not_required' }.
 */
export async function generateReply(conversationId: string, opts?: GenerateReplyOptions): Promise<ChatTurnResult> {
  return fakeReply(conversationId, opts);
}

/**
 * ai.reply job handler (F10 owns it, declared in features/ai-agent/routes.ts `jobs`). Order is fixed:
 *   1 getBusinessSettings(businessId).aiEnabled  2 isHumanTakeover(conversationId) false
 *   3 serialisation: the job's lockKey `conversation:<id>` already guarantees one ai.reply per conversation (the worker
 *     holds that advisory lock for the whole job). The handler must NOT take `conversation:<id>` again from another
 *     connection (it would wait on itself); when it needs its own lock it uses db.withAdvisoryLock(`ai.turn:<id>`).
 *     Turn claim/dedup = unique row in the F10 `ai_turns` table per inbound message.
 *   4 generateReply(conversationId, { triggerMessageId }) — state 'failed' or empty parts → stop (nothing saved) and
 *     retry the job (at most 3 attempts). After the last attempt, or on a non-retryable provider error, the customer is
 *     not left in silence: the handler sends one fixed apology in the customer's language and calls
 *     requestHumanHandoff(reason 'ai_failed') (F10 spec §5.9). The apology is code text, never a model answer.
 *   5 re-check 1+2 (state may have changed during the model call)
 *   6 saveMessage({ direction: 'outbound', author: 'ai', parts, origin, groupId }) → messageId (one groupId per reply)
 *   7 sendToCustomer(conversationId, parts, { messageId }).
 *   Any "no" in 1–2/5 → return quietly (message stays stored, no reply, no error). No plan or quota check: unlimited
 *   (core model.* already wrote the cost rows to model_usage).
 * @fake C1 ships exactly this handler using the fakes, so the loop works at SETUP READY.
 */
export const aiReplyJobHandler: JobHandler<AiReplyJobPayload> = async (job) => {
  await runFakeReplyJob(job);
};


export async function getAiTurnMetrics(businessId: string, range: MetricsRange): Promise<AiTurnMetrics> {
  throw new AppError("SERVICE_NOT_READY", "getAiTurnMetrics is not implemented");
}


export async function listAiTurnTopics(businessId: string, opts: { finishedFrom: string; finishedTo: string; limit?: number }): Promise<AiTurnTopic[]> {
  throw new AppError("SERVICE_NOT_READY", "listAiTurnTopics is not implemented");
}
