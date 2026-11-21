import { setTimeout as sleep } from 'node:timers/promises';
import pg from 'pg';
import type { JobState } from '@nless/shared/core/types';
import { config } from './config';
import { db, dbUrl } from './db';
import { AppError } from './errors';
import { JOBS_PAYLOAD_MAX_BYTES } from './jobs-config';
import { log } from './log';
import { redactText } from './redact';
import { publish } from './realtime';
import type { EnqueueOptions, JobHandler, JobsApi, ScheduleDefinition } from './types';

const handlers = new Map<string, JobHandler>();
const schedules = new Map<string, ScheduleDefinition>();
const wakeListeners = new Set<() => void>();

export function registerJob(type: string, handler: JobHandler): void {
  if (handlers.has(type)) throw new Error('Duplicate job type: ' + type);
  handlers.set(type, handler);
}
export function getJobHandler(type: string): JobHandler | undefined {
  return handlers.get(type);
}
export function subscribeJobWake(listener: () => void): () => void {
  wakeListeners.add(listener);
  return () => { wakeListeners.delete(listener); };
}
export function registerSchedule(schedule: ScheduleDefinition): void {
  if (schedule.everySeconds < 1) throw new Error('Invalid schedule frequency: ' + schedule.name);
  registerJob(schedule.name, schedule.handler);
  schedules.set(schedule.name, schedule);
}
export function publishJob(job: { id: string; type: string; business_id: string | null },
  state: JobState, progress?: { done: number; total: number }): void {
  if (job.business_id) publish(job.business_id, { type: 'job.updated', jobId: job.id, jobType: job.type, state, progress });
}

const sensitivePayloadKey = /token|secret|password|authorization|api[_-]?key|cookie/i;
function findSensitiveKey(root: object): string | undefined {
  const pending: object[] = [root];
  while (pending.length) {
    const node = pending.pop()!;
    for (const [key, value] of Object.entries(node)) {
      if (key !== 'replyToken' && sensitivePayloadKey.test(key)) return key;
      if (value && typeof value === 'object') pending.push(value);
    }
  }
}
function validate(type: string, payload: object, options?: EnqueueOptions) {
  if (!/^[a-z][a-z0-9_.-]{1,79}$/.test(type)) throw new AppError('VALIDATION_ERROR', 'Invalid job type');
  if (!payload || ![Object.prototype, null].includes(Object.getPrototypeOf(payload))) {
    throw new AppError('VALIDATION_ERROR', 'Job payload must be a plain object');
  }
  let encoded: string;
  let decoded: object;
  try {
    encoded = JSON.stringify(payload);
    decoded = JSON.parse(encoded) as object;
    if (!decoded || Array.isArray(decoded) || typeof decoded !== 'object') throw new Error('invalid payload');
  } catch {
    throw new AppError('VALIDATION_ERROR', 'Job payload is not serializable');
  }
  if (Buffer.byteLength(encoded) > JOBS_PAYLOAD_MAX_BYTES) throw new AppError('VALIDATION_ERROR', 'Job payload is too large');
  const maxAttempts = options?.maxAttempts ?? config.JOBS_MAX_ATTEMPTS;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 20) {
    throw new AppError('VALIDATION_ERROR', 'Invalid job attempt limit');
  }
  const runAt = options?.runAt === undefined ? null : new Date(options.runAt);
  if (runAt && !Number.isFinite(runAt.getTime())) throw new AppError('VALIDATION_ERROR', 'Invalid job run time');
  if ((options?.lockKey?.length ?? 0) > 200) throw new AppError('VALIDATION_ERROR', 'Job lock key is too long');
  const sensitive = findSensitiveKey(decoded);
  if (sensitive) {
    log.warn({ type, field: redactText(sensitive, 100) }, 'Sensitive field name in job payload');
    if (config.NODE_ENV === 'test') throw new AppError('VALIDATION_ERROR', 'Sensitive job payload field');
  }
  return { encoded, maxAttempts, runAt };
}

export const jobs: JobsApi = {
  async enqueue(type, payload, opts) {
    const { encoded, maxAttempts, runAt } = validate(type, payload, opts);
    const business_id = opts?.businessId ?? null;
    const row = await db.maybeOne<{ id: string }>(
      'INSERT INTO jobs (type,payload,business_id,dedup_key,lock_key,run_at,max_attempts) ' +
      'VALUES ($1,$2::jsonb,$3,$4,$5,COALESCE($6::timestamptz,now()),$7) ON CONFLICT (dedup_key) DO NOTHING RETURNING id',
      [type, encoded, business_id, opts?.dedupKey ?? null, opts?.lockKey ?? null, runAt, maxAttempts],
    );
    if (!row) {
      const existing = await db.one<{ id: string }>('SELECT id FROM jobs WHERE dedup_key=$1', [opts?.dedupKey]);
      return { jobId: existing.id, deduped: true };
    }
    if (!runAt || runAt.getTime() <= Date.now()) for (const listener of wakeListeners) listener();
    publishJob({ id: row.id, type, business_id }, 'queued');
    return { jobId: row.id, deduped: false };
  },
  async get(id) {
    return db.maybeOne<NonNullable<Awaited<ReturnType<JobsApi['get']>>>>(
      'SELECT id,type,state,attempts,last_error AS "lastError",progress FROM jobs WHERE id=$1', [id],
    );
  },
};

let scheduler: { controller: AbortController; finished: Promise<void> } | undefined;
export function startScheduler(): void {
  if (scheduler) return;
  const controller = new AbortController();
  const run = async () => {
    while (!controller.signal.aborted) {
      try {
        const client = new pg.Client({ connectionString: dbUrl(), connectionTimeoutMillis: 10000, statement_timeout: config.DB_STATEMENT_TIMEOUT_MS });
        let locked = false;
        let destroy = false;
        const markLost = () => { destroy = true; };
        client.on('error', markLost);
        try {
          await client.connect();
          const value = await client.query("SELECT pg_try_advisory_lock(hashtext('nless.scheduler')) AS locked");
          locked = Boolean(value.rows[0]?.locked);
          log.info({ locked }, 'Scheduler lock');
          while (locked && !destroy && !controller.signal.aborted) {
            await client.query('SELECT 1');
            for (const schedule of schedules.values()) {
              const interval = schedule.everySeconds * 1000;
              const slot = new Date(Math.floor(Date.now() / interval) * interval).toISOString();
              await jobs.enqueue(schedule.name, { slot }, { dedupKey: schedule.name + '@' + slot });
            }
            await sleep(30000, undefined, { signal: controller.signal });
          }
        } finally {
          if (locked && !destroy) await client.query("SELECT pg_advisory_unlock(hashtext('nless.scheduler'))").catch(() => { destroy = true; });
          client.off('error', markLost);
          await client.end().catch(() => {});
        }
      } catch {
        if (!controller.signal.aborted) log.warn('Scheduler will retry');
      }
      if (!controller.signal.aborted) await sleep(30000, undefined, { signal: controller.signal }).catch(() => {});
    }
  };
  scheduler = { controller, finished: run() };
}
export async function stopScheduler(): Promise<void> {
  scheduler?.controller.abort();
  await scheduler?.finished;
  scheduler = undefined;
}
