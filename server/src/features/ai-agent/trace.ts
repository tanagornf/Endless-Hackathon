import type { AiTurnTrace } from '@nless/shared/features/ai-agent/types';
import { db } from '../../core';

type TraceRow = Omit<AiTurnTrace, 'startedAt' | 'finishedAt' | 'intentConfidence' | 'toolCount' | 'evidenceCount' | 'guardCount'> & {
  startedAt: Date;
  finishedAt: Date | null;
  intentConfidence: string | null;
};

export async function readTurnTrace(businessId: string, turnId: string): Promise<AiTurnTrace | null> {
  const trace = await db.maybeOne<TraceRow>(String.raw`
    SELECT id AS "turnId", conversation_id AS "conversationId", inbound_message_id AS "inboundMessageId", state, mode,
      intent, skip_reason AS "skipReason", latency_ms AS "latencyMs", started_at AS "startedAt", reply_language AS "replyLanguage",
      intent_source AS "intentSource", intent_confidence AS "intentConfidence", tools, evidence_ids AS "evidenceIds",
      product_refs AS "productRefs", guard_actions AS "guardActions", reply_message_id AS "replyMessageId",
      handoff_offered AS "handoffOffered", escalated, retry_used AS "retryUsed", usage_summary AS usage, timings,
      error_code AS "errorCode", finished_at AS "finishedAt", attempts
    FROM ai_turns WHERE business_id = $1 AND id = $2
  `, [businessId, turnId]);
  if (!trace) return null;
  return {
    ...trace,
    startedAt: trace.startedAt.toISOString(),
    finishedAt: trace.finishedAt?.toISOString() ?? null,
    intentConfidence: trace.intentConfidence === null ? null : Number(trace.intentConfidence),
    toolCount: trace.tools.length,
    evidenceCount: trace.evidenceIds.length,
    guardCount: trace.guardActions.length,
  };
}
