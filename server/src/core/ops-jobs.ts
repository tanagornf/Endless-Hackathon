import type { JobsQuery, OpsJobDetail, OpsJobRow, OpsSummary, RetryDeadBody } from '@nless/shared/core/ops';
import type { Page } from '@nless/shared/core/types';
import { JOB_STATES } from '@nless/shared/core/ops';
import type { z } from 'zod';
import { db } from './db';
import { AppError } from './errors';
import { publishJob } from './jobs';
import { opsAudit, opsPolicy, safeOpsText } from './ops-audit';
import { createdAtForCursor, cursorPage, readOpsCursor } from './ops-page';
import { publishDeliveryChange, settleCancelledDelivery } from './outbox';
import { redactObject } from './redact';

const jobColumns = `j.id,j.type,j.state,j.business_id AS "businessId",
  j.attempts,j.max_attempts AS "maxAttempts",j.run_at AS "runAt",j.started_at AS "startedAt",
  j.finished_at AS "finishedAt",j.lock_key AS "lockKey",j.dedup_key AS "dedupKey",j.last_error AS "lastError",
  j.progress,j.reschedules,${createdAtForCursor('j.created_at')}`;
const resetJob = `state='queued',run_at=now(),updated_at=now(),attempts=0,reschedules=0,
  started_at=NULL,finished_at=NULL,dead_at=NULL,progress=NULL,result=NULL,last_error=NULL,
  claim_token=NULL,locked_by=NULL,locked_until=NULL`;
const deliveryCanRetry = `j.type<>'core.deliver' OR EXISTS (
  SELECT 1 FROM messages m WHERE m.id=CASE
    WHEN (j.payload->>'messageId') ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
      THEN (j.payload->>'messageId')::uuid END
    AND m.business_id=j.business_id AND m.direction='outbound' AND m.delivery_state='pending'
)`;
type JobState = OpsJobRow['state'];

function safeJob<T extends OpsJobRow>(row: T): T {
  return {
    ...row,
    lastError: safeOpsText(row.lastError),
    lockKey: safeOpsText(row.lockKey),
    dedupKey: safeOpsText(row.dedupKey),
  };
}

export async function listOpsJobs(query: z.output<typeof JobsQuery>): Promise<Page<OpsJobRow>> {
  const cursor = query.cursor === undefined ? null : readOpsCursor(query.cursor);
  const { rows } = await db.query<OpsJobRow>(`SELECT ${jobColumns} FROM jobs j
    WHERE ($1::text IS NULL OR j.state=$1) AND ($2::text IS NULL OR j.type=$2)
      AND ($3::uuid IS NULL OR j.business_id=$3)
      AND ($4::text IS NULL OR strpos(lower(j.type), lower($4))>0
        OR strpos(lower(j.last_error), lower($4))>0)
      AND ($5::timestamptz IS NULL OR (j.created_at,j.id)<($5::timestamptz,$6::uuid))
    ORDER BY j.created_at DESC,j.id DESC LIMIT $7`, [
    query.state ?? null, query.type ?? null, query.businessId ?? null, query.q || null,
    cursor?.createdAt ?? null, cursor?.id ?? null, query.limit + 1,
  ]);
  return cursorPage(rows, query.limit, safeJob);
}

export async function getOpsJob(id: string): Promise<OpsJobDetail> {
  const job = await db.maybeOne<OpsJobDetail>(`SELECT ${jobColumns},
    j.payload AS "payloadView",j.result,j.locked_by AS "lockedBy",
    j.locked_until AS "lockedUntil",j.retried_by AS "retriedBy" FROM jobs j WHERE j.id=$1`, [id]);
  if (!job) throw new AppError('NOT_FOUND', 'Job not found');
  return {
    ...safeJob(job), payloadView: redactObject(job.payloadView, { maxStringLen: 300 }),
    result: redactObject(job.result), lockedBy: safeOpsText(job.lockedBy),
  };
}

export async function changeOpsJob(id: string, kind: 'retry' | 'cancel', actorUserId: string): Promise<OpsJobRow> {
  const retry = kind === 'retry';
  const { row, delivery } = await db.tx(async (tx) => {
    const current = await tx.maybeOne<{ state: JobState; canRetry: boolean }>(
      `SELECT j.state,(${deliveryCanRetry}) AS "canRetry" FROM jobs j WHERE j.id=$1 FOR UPDATE`, [id]);
    if (!current) throw new AppError('NOT_FOUND', 'Job not found');
    if (retry && (current.state === 'running' || current.state === 'succeeded')) throw opsPolicy('job_running');
    if (retry && !current.canRetry) throw opsPolicy('delivery_not_pending');
    if (!retry && current.state !== 'queued' && current.state !== 'running') throw opsPolicy('job_finished');
    const updated = retry
      ? await tx.one<OpsJobRow>(`UPDATE jobs j SET ${resetJob},retried_by=$2 WHERE j.id=$1 RETURNING ${jobColumns}`, [id, actorUserId])
      : await tx.one<OpsJobRow>(`UPDATE jobs j SET state='cancelled',updated_at=now(),finished_at=now(),
          claim_token=NULL,locked_by=NULL,locked_until=NULL WHERE j.id=$1 RETURNING ${jobColumns}`, [id]);
    const delivery = retry ? null : await settleCancelledDelivery(tx, id);
    await opsAudit(tx, {
      action: retry ? 'ops.job.retry' : 'ops.job.cancel', actorUserId,
      businessId: updated.businessId, targetType: 'job', targetId: id,
    });
    return { row: updated, delivery };
  });
  publishJob({ id: row.id, type: row.type, business_id: row.businessId }, row.state);
  if (delivery) await publishDeliveryChange(delivery);
  return safeJob(row);
}

export async function retryDeadOpsJobs(query: z.output<typeof RetryDeadBody>, actorUserId: string) {
  const rows = await db.tx(async (tx) => {
    const changed = await tx.query<{ id: string; type: string; business_id: string | null }>(`WITH candidates AS (
      SELECT j.id FROM jobs j WHERE j.state='dead' AND ($1::text IS NULL OR j.type=$1)
        AND ($2::uuid IS NULL OR j.business_id=$2) AND (${deliveryCanRetry})
      ORDER BY j.created_at,j.id LIMIT $3 FOR UPDATE SKIP LOCKED
    ) UPDATE jobs j SET ${resetJob},retried_by=$4 FROM candidates c WHERE j.id=c.id
      RETURNING j.id,j.type,j.business_id`, [query.type ?? null, query.businessId ?? null, query.limit, actorUserId]);
    await opsAudit(tx, {
      action: 'ops.job.retry-dead', actorUserId, businessId: query.businessId,
      details: { type: safeOpsText(query.type ?? null, 80), count: changed.rowCount },
    });
    return changed.rows;
  });
  for (const row of rows) publishJob(row, 'queued');
  return { retried: rows.length };
}

type Stats = Pick<OpsSummary, 'now' | 'counts' | 'oldestQueuedAgeSeconds' | 'dead24h' | 'byType24h'>;

export async function summarizeOpsJobs(): Promise<Stats> {
  const metrics = await db.one<Omit<Stats, 'counts' | 'byType24h'> & { counts: Partial<Stats['counts']> }>(`
    WITH counts AS (SELECT state,count(*)::int AS count FROM jobs GROUP BY state)
    SELECT now() AS "now",
      COALESCE((SELECT jsonb_object_agg(state,count) FROM counts),'{}') AS counts,
      (SELECT extract(epoch FROM now()-min(run_at))::float8 FROM jobs WHERE state='queued' AND run_at<=now())
        AS "oldestQueuedAgeSeconds",
      (SELECT count(*)::int FROM jobs WHERE state='dead' AND COALESCE(dead_at,finished_at)>=now()-interval '24 hours')
        AS "dead24h"`);
  const { rows } = await db.query<Stats['byType24h'][number]>(`SELECT type,
    count(*) FILTER (WHERE state='succeeded')::int AS succeeded,
    count(*) FILTER (WHERE state='dead')::int AS dead,
    avg(extract(epoch FROM finished_at-started_at)*1000)::float8 AS "avgMs"
    FROM jobs WHERE state IN ('succeeded','dead')
      AND COALESCE(finished_at,dead_at)>=now()-interval '24 hours' GROUP BY type ORDER BY type`);
  const counts = Object.fromEntries(JOB_STATES.map((state) => [state, metrics.counts[state] ?? 0])) as Stats['counts'];
  return { ...metrics, counts, byType24h: rows };
}
