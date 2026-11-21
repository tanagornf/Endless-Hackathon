import type { MessagePart } from '@nless/shared/core/types';
import type { AiGuardAction, AiIntent, AiToolTrace, AiTurnStateName, AiTurnTopic, AiTurnTrace, AiTurnUsage } from '@nless/shared/features/ai-agent/types';
import type { ConversationRecord, MessageRecord } from '@nless/shared/features/inbox/types';
import type { CustomerLanguage } from '@nless/shared/core/language';
import { db } from '../../core';
import type { SkipReason } from './gate';

export const MAX_ATTEMPTS = 3;
export const LEASE_RENEW_MS = 20_000;

export type HandoffReason = 'customer_request' | 'budget_exhausted' | 'ai_failed';
export interface HandoffCheckpoint {
  turnId: string;
  version: number | null;
}

export interface TurnDraft {
  language: CustomerLanguage;
  parts: MessagePart[];
  evidenceIds: string[];
  productRefs: AiTurnTopic['productRefs'];
  tools: AiToolTrace[];
  guardActions: AiGuardAction[];
  usage: AiTurnUsage | null;
  timings: Record<string, number | number[]>;
  retryUsed: boolean;
  errorCode: string | null;
  handoffReason?: HandoffReason | null;
  intent?: AiIntent | null;
  intentSource?: AiTurnTrace['intentSource'];
  intentConfidence?: number | null;
}

interface TurnRow {
  id: string;
  business_id: string;
  conversation_id: string;
  mode: 'reply' | 'suggest';
  state: AiTurnStateName;
  attempts: number;
  retry_after: Date | null;
  reply_language: CustomerLanguage | null;
  reply_parts: MessagePart[] | null;
  evidence_ids: string[];
  product_refs: AiTurnTopic['productRefs'];
  tools: AiToolTrace[];
  guard_actions: AiGuardAction[];
  usage_summary: AiTurnUsage | null;
  timings: Record<string, number | number[]>;
  retry_used: boolean;
  error_code: string | null;
  reply_message_id: string | null;
  handoff_reason: HandoffReason | null;
  handoff_assignment_version: number | null;
  escalated: boolean;
  intent: AiIntent | null;
  intent_source: AiTurnTrace['intentSource'];
  intent_confidence: string | null;
}

export type TurnLease = Pick<TurnRow, 'id' | 'business_id' | 'conversation_id' | 'attempts' | 'mode'>;
type Claim = { status: 'owned' | 'finished'; turn: TurnRow } | { status: 'pending'; turnId: string; retryAt: string };

export async function claimTurn(
  conversation: ConversationRecord,
  inbound: MessageRecord,
  mode: 'reply' | 'suggest',
  delivery: boolean,
): Promise<Claim> {
  const { businessId, id: conversationId } = conversation;
  return db.tx(async (transaction) => {
    // Queue workers already hold a session lock. Only this short transaction
    // takes the F10 lock, leaving a pooled connection available during generation.
    await transaction.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['ai.turn:' + conversationId]);
    const existing = mode === 'reply' ? await transaction.maybeOne<TurnRow & { waiting: boolean }>(
      "SELECT *, retry_after > now() AS waiting FROM ai_turns WHERE business_id = $1 AND conversation_id = $2 AND inbound_message_id = $3 AND mode = 'reply'",
      [businessId, conversationId, inbound.id],
    ) : null;
    const unsent = delivery && existing && (existing.state === 'completed' || existing.state === 'handoff') &&
      !existing.reply_message_id && Boolean(existing.reply_parts?.length);
    if (existing && !unsent && !['running', 'failed'].includes(existing.state)) {
      return { status: 'finished', turn: existing };
    }
    if (existing?.state === 'failed') {
      if (existing.attempts >= MAX_ATTEMPTS || !existing.retry_after) return { status: 'finished', turn: existing };
      if (existing.waiting || existing.reply_message_id && !delivery) {
        return { status: 'pending', turnId: existing.id, retryAt: existing.retry_after.toISOString() };
      }
    }
    const active = await transaction.maybeOne<{ id: string }>(
      "SELECT id FROM ai_turns WHERE business_id = $1 AND conversation_id = $2 AND state = 'running' AND lease_until > now() LIMIT 1",
      [businessId, conversationId],
    );
    if (active) return { status: 'pending', turnId: existing?.id ?? active.id, retryAt: new Date(Date.now() + 5000).toISOString() };
    if (existing) {
      const turn = await transaction.one<TurnRow>(
        "UPDATE ai_turns SET state = 'running', attempts = attempts + 1, lease_until = now() + interval '60 seconds', retry_after = NULL WHERE business_id = $1 AND id = $2 RETURNING *",
        [businessId, existing.id],
      );
      return { status: 'owned', turn };
    }
    const turn = await transaction.one<TurnRow>(
      'INSERT INTO ai_turns (business_id, conversation_id, inbound_message_id, inbound_created_at, mode) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [businessId, conversationId, inbound.id, inbound.createdAt, mode],
    );
    return { status: 'owned', turn };
  });
}

function leaseParams(turn: TurnLease): readonly unknown[] {
  return [turn.business_id, turn.conversation_id, turn.id, turn.attempts];
}

const owned = "business_id = $1 AND conversation_id = $2 AND id = $3 AND attempts = $4 AND state = 'running' AND lease_until > now()";

export async function renewClaim(turn: TurnLease): Promise<boolean> {
  return (await db.query("UPDATE ai_turns SET lease_until = now() + interval '60 seconds' WHERE " + owned, leaseParams(turn))).rowCount === 1;
}

export async function releaseClaim(turn: TurnLease): Promise<void> {
  await db.query('UPDATE ai_turns SET lease_until = now() WHERE ' + owned, leaseParams(turn));
}

export function readDraft(turn: TurnRow): TurnDraft | null {
  if (!turn.reply_language || !turn.reply_parts?.length) return null;
  return {
    language: turn.reply_language,
    parts: turn.reply_parts,
    evidenceIds: turn.evidence_ids,
    productRefs: turn.product_refs,
    tools: turn.tools,
    guardActions: turn.guard_actions,
    usage: turn.usage_summary,
    timings: turn.timings,
    retryUsed: turn.retry_used,
    errorCode: turn.error_code,
    handoffReason: turn.handoff_reason,
    intent: turn.intent,
    intentSource: turn.intent_source,
    intentConfidence: turn.intent_confidence === null ? null : Number(turn.intent_confidence),
  };
}

export async function storeDraft(turn: TurnLease, draft: TurnDraft): Promise<boolean> {
  const result = await db.query(String.raw`
    UPDATE ai_turns SET reply_language = $5, reply_parts = $6::jsonb, evidence_ids = $7,
      product_refs = $8::jsonb, tools = $9::jsonb, guard_actions = $10::jsonb, usage_summary = $11::jsonb,
      timings = $12::jsonb, retry_used = $13, error_code = $14, reply_group_id = id,
      handoff_reason = $15, intent = $16, intent_source = $17, intent_confidence = $18,
      lease_until = now() + interval '60 seconds'
    WHERE ` + owned, [
    ...leaseParams(turn), draft.language, JSON.stringify(draft.parts), draft.evidenceIds, JSON.stringify(draft.productRefs),
    JSON.stringify(draft.tools), JSON.stringify(draft.guardActions), JSON.stringify(draft.usage), JSON.stringify(draft.timings),
    draft.retryUsed, draft.errorCode, draft.handoffReason ?? null, draft.intent ?? null, draft.intentSource ?? null, draft.intentConfidence ?? null,
  ]);
  return result.rowCount === 1;
}

export async function recordHandoff(turn: TurnLease, reason: HandoffReason, version: number | null): Promise<boolean> {
  return db.tx(async (transaction) => {
    const updated = await transaction.query(
      'UPDATE ai_turns SET escalated = true, handoff_assignment_version = $5 WHERE ' + owned + ' AND handoff_reason = $6 AND escalated = false',
      [...leaseParams(turn), version, reason],
    );
    if (!updated.rowCount) return false;
    await transaction.query(
      "INSERT INTO ai_handoff_waits (business_id, conversation_id, turn_id, reason, released_at, release_reason) " +
        "VALUES ($1, $2, $3, $4, CASE WHEN $5::int IS NOT NULL THEN now() END, " +
        "CASE WHEN $5::int IS NOT NULL THEN 'handed_to_team' END) ON CONFLICT DO NOTHING",
      [turn.business_id, turn.conversation_id, turn.id, reason, version],
    );
    return true;
  });
}

export async function finishTurn(turn: TurnLease, outcome: {
  state: Exclude<AiTurnStateName, 'running'>;
  reason?: SkipReason;
  replyMessageId?: string;
  retryAt?: string;
  timings?: TurnDraft['timings'];
  deliveryErrorCode?: string;
}): Promise<boolean> {
  const result = await db.query(String.raw`
    UPDATE ai_turns SET state = $5, skip_reason = $6, reply_message_id = COALESCE($7, reply_message_id),
      reply_parts = CASE WHEN $5 IN ('skipped', 'superseded') THEN NULL ELSE reply_parts END,
      retry_after = $8, timings = COALESCE($9::jsonb, timings), error_code = COALESCE(error_code, $10), finished_at = now(),
      latency_ms = CASE WHEN mode = 'reply' THEN GREATEST(0, EXTRACT(epoch FROM now() - started_at) * 1000)::int END
    WHERE ` + owned, [
    ...leaseParams(turn), outcome.state, outcome.reason ?? null, outcome.replyMessageId ?? null,
    outcome.retryAt ?? null, outcome.timings ? JSON.stringify(outcome.timings) : null, outcome.deliveryErrorCode ?? null,
  ]);
  return result.rowCount === 1;
}
