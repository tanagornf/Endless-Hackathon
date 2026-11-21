import { z } from 'zod';
import type { MetricsRange, Page } from '@nless/shared/core/types';
import type { AiTurnMetrics, AiTurnSummary, AiTurnTopic, AiTurnTrace } from '@nless/shared/features/ai-agent/types';
import { AppError, db } from '../../core';

const cursorSchema = z.object({ startedAt: z.string().datetime(), id: z.string().uuid() });

export const listTurnsQuery = z.object({
  cursor: z.string().min(1).max(200).regex(/^[A-Za-z0-9_-]+$/).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  state: z.enum(['running', 'completed', 'awaiting_confirmation', 'handoff', 'failed', 'skipped', 'superseded']).optional(),
  intent: z.string().max(40).optional(),
  conversationId: z.string().uuid().optional(),
});

function decodeCursor(cursor: string): z.infer<typeof cursorSchema> {
  try {
    return cursorSchema.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')));
  } catch {
    throw new AppError('VALIDATION_ERROR', 'Invalid AI turn cursor');
  }
}

export async function listTurns(businessId: string, query: z.output<typeof listTurnsQuery>): Promise<Page<AiTurnSummary>> {
  const cursor = query.cursor ? decodeCursor(query.cursor) : null;
  const { rows } = await db.query<AiTurnSummary>(String.raw`
    SELECT id AS "turnId", conversation_id AS "conversationId", state, mode, intent,
      skip_reason AS "skipReason", reply_language AS "replyLanguage", latency_ms AS "latencyMs",
      jsonb_array_length(tools) AS "toolCount", cardinality(evidence_ids) AS "evidenceCount",
      jsonb_array_length(guard_actions) AS "guardCount",
      to_char(started_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "startedAt"
    FROM ai_turns WHERE business_id = $1
      AND ($2::text IS NULL OR state = $2)
      AND ($3::text IS NULL OR intent = $3)
      AND ($4::uuid IS NULL OR conversation_id = $4)
      AND ($5::timestamptz IS NULL OR (started_at, id) < ($5, $6::uuid))
    ORDER BY started_at DESC, id DESC LIMIT $7
  `, [businessId, query.state ?? null, query.intent ?? null, query.conversationId ?? null, cursor?.startedAt ?? null, cursor?.id ?? null, query.limit + 1]);
  const items = rows.slice(0, query.limit);
  const last = items.at(-1);
  return {
    items,
    nextCursor: rows.length > query.limit && last
      ? Buffer.from(JSON.stringify({ startedAt: last.startedAt, id: last.turnId })).toString('base64url')
      : null,
  };
}

export async function getAiTurnMetrics(businessId: string, range: MetricsRange): Promise<AiTurnMetrics> {
  return db.one<AiTurnMetrics>(String.raw`
    SELECT count(*)::int AS turns,
      count(*) FILTER (WHERE state = 'completed')::int AS completed,
      count(*) FILTER (WHERE state = 'awaiting_confirmation')::int AS "awaitingConfirmation",
      count(*) FILTER (WHERE state = 'handoff')::int AS handoff,
      count(*) FILTER (WHERE state = 'failed')::int AS failed,
      count(*) FILTER (WHERE state IN ('superseded', 'skipped'))::int AS skipped,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms)
        FILTER (WHERE state IN ('completed', 'awaiting_confirmation', 'handoff')) AS "medianLatencyMs"
    FROM ai_turns WHERE business_id = $1 AND mode = 'reply' AND started_at >= $2 AND started_at < $3
  `, [businessId, range.from, range.to]);
}

export async function listAiTurnTopics(businessId: string, opts: { finishedFrom: string; finishedTo: string; limit?: number }): Promise<AiTurnTopic[]> {
  const limit = z.number().int().min(1).max(500).safeParse(opts.limit ?? 100);
  if (!limit.success) throw new AppError('VALIDATION_ERROR', 'Invalid AI topic limit');
  const { rows } = await db.query<Omit<AiTurnTopic, 'inboundCreatedAt' | 'finishedAt'> & { inboundCreatedAt: Date; finishedAt: Date }>(String.raw`
    SELECT t.id AS "turnId", t.business_id AS "businessId", t.conversation_id AS "conversationId",
      c.customer_id AS "customerId", t.inbound_message_id AS "inboundMessageId", t.inbound_created_at AS "inboundCreatedAt",
      t.intent, t.product_refs AS "productRefs", t.reply_message_id AS "replyMessageId", t.finished_at AS "finishedAt"
    FROM ai_turns t JOIN conversations c ON c.business_id = t.business_id AND c.id = t.conversation_id
    WHERE t.business_id = $1 AND t.mode = 'reply' AND t.state IN ('completed', 'awaiting_confirmation')
      AND t.reply_message_id IS NOT NULL AND t.finished_at >= $2 AND t.finished_at < $3
    ORDER BY t.finished_at, t.id LIMIT $4
  `, [businessId, opts.finishedFrom, opts.finishedTo, limit.data]);
  return rows.map((row) => ({ ...row, inboundCreatedAt: row.inboundCreatedAt.toISOString(), finishedAt: row.finishedAt.toISOString() }));
}

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
