import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import type { JobState } from '@nless/shared/core/types';
import { config } from './config';
import pg from 'pg';
import { db, dbUrl } from './db';
import { AppError } from './errors';
import { log } from './log';
import { publish } from './realtime';
import type { JobHandler, JobsApi, ScheduleDefinition } from './types';

interface JobRow {
  id: string;
  type: string;
  business_id: string | null;
  state: JobState;
  payload: Record<string, unknown>;
  lock_key: string | null;
  locked_by: string;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  progress: { done: number; total: number } | null;
}
const handlers = new Map<string, JobHandler>();
const schedules = new Map<string, ScheduleDefinition>();
let wake: (() => void) | undefined;

export function registerJob(type: string, handler: JobHandler): void {
  if (handlers.has(type)) throw new Error('Duplicate job type: ' + type);
  handlers.set(type, handler);
}
export function registerSchedule(schedule: ScheduleDefinition): void {
  if (schedule.everySeconds < 1) throw new Error('Invalid schedule frequency: ' + schedule.name);
  registerJob(schedule.name, schedule.handler);
  schedules.set(schedule.name, schedule);
}
function changed(job: JobRow, state: JobState, progress?: JobRow['progress']) {
  if (job.business_id) publish(job.business_id, { type: 'job.updated', jobId: job.id, jobType: job.type, state, progress: progress ?? undefined });
}
export const jobs: JobsApi = {
  async enqueue(type, payload, opts) {
    const row = await db.maybeOne<{ id: string }>(`
      INSERT INTO jobs (type,payload,business_id,dedup_key,lock_key,run_at,max_attempts)
      VALUES ($1,$2::jsonb,$3,$4,$5,COALESCE($6,now()),$7)
      ON CONFLICT (dedup_key) DO NOTHING RETURNING id`, [
      type, JSON.stringify(payload), opts?.businessId ?? null, opts?.dedupKey ?? null, opts?.lockKey ?? null,
      opts?.runAt ?? null, opts?.maxAttempts ?? config.JOBS_MAX_ATTEMPTS,
    ]);
    wake?.();
    if (row) return { jobId: row.id, deduped: false };
    const existing = await db.one<{ id: string }>('SELECT id FROM jobs WHERE dedup_key = $1', [opts?.dedupKey]);
    return { jobId: existing.id, deduped: true };
  },
  async get(id) {
    const row = await db.maybeOne<JobRow>('SELECT id,type,state,attempts,last_error,progress FROM jobs WHERE id = $1', [id]);
    return row && { id: row.id, type: row.type, state: row.state, attempts: row.attempts, lastError: row.last_error, progress: row.progress };
  },
};

const claim = (type?: string) => db.maybeOne<JobRow>(`
  UPDATE jobs SET state='running', attempts=attempts+1, locked_by=$1,
    locked_until=now()+$2::int*interval '1 second', updated_at=now()
  WHERE id=(SELECT id FROM jobs WHERE ((state='queued' AND run_at<=now()) OR (state='running' AND locked_until<now()))
    AND ($3::text IS NULL OR type=$3)
    ORDER BY run_at,id LIMIT 1 FOR UPDATE SKIP LOCKED)
  RETURNING *`, [randomUUID(), config.JOBS_LEASE_SECONDS, type ?? null]);

async function execute(job: JobRow, shutdown?: AbortSignal): Promise<boolean> {
  const timeout = AbortSignal.timeout(config.JOBS_LEASE_SECONDS * 1000);
  const signal = shutdown ? AbortSignal.any([timeout, shutdown]) : timeout;
  let state: JobState = 'succeeded';
  let runAt: string | null = null;
  let error: string | null = null;
  let result: Record<string, unknown> | null = null;
  let attempts = job.attempts;
  const handler = handlers.get(job.type);
  changed(job, 'running');
  try {
    if (!handler) throw new AppError('SERVICE_NOT_READY', 'No job handler');
    if (attempts > job.max_attempts) throw new AppError('SERVICE_NOT_READY', 'Job attempts exhausted');
    const run = async () => {
      signal.throwIfAborted();
      return handler({
        id: job.id, type: job.type, payload: job.payload, businessId: job.business_id, attempt: attempts,
        maxAttempts: job.max_attempts, signal,
        async progress(done, total) {
          const progress = { done, total };
          const update = await db.query('UPDATE jobs SET progress=$3::jsonb,updated_at=now() WHERE id=$1 AND locked_by=$2', [job.id, job.locked_by, JSON.stringify(progress)]);
          if (update.rowCount) changed(job, 'running', progress);
        },
      });
    };
    const outcome = job.lock_key ? await db.withAdvisoryLock(job.lock_key, run) : await run();
    if (outcome && 'retryAt' in outcome) {
      state = 'queued';
      runAt = new Date(outcome.retryAt).toISOString();
      attempts--;
    } else if (outcome && 'result' in outcome) result = outcome.result;
  } catch (cause) {
    state = attempts >= job.max_attempts || (cause instanceof AppError && !cause.retryable) ? 'dead' : 'queued';
    error = cause instanceof AppError ? cause.code : 'INTERNAL';
    if (handler === undefined) error = 'no handler';
    if (state === 'queued') runAt = new Date(Date.now() + 5000 * attempts ** 2).toISOString();
  }
  const updated = await db.query(`
    UPDATE jobs SET state=$3, attempts=$4, run_at=COALESCE($5,run_at), last_error=$6, result=$7::jsonb,
      locked_by=NULL, locked_until=NULL, updated_at=now(),
      finished_at=CASE WHEN $3='queued' THEN NULL ELSE now() END
    WHERE id=$1 AND locked_by=$2`, [job.id, job.locked_by, state, attempts, runAt, error, JSON.stringify(result)]);
  if (updated.rowCount) changed(job, state);
  return state === 'dead' && updated.rowCount > 0;
}

export async function drainJobs(opts?: { type?: string; maxMs?: number }): Promise<{ ran: number; dead: number }> {
  let ran = 0;
  let dead = 0;
  const deadline = Date.now() + (opts?.maxMs ?? 10000);
  while (Date.now() < deadline) {
    const job = await claim(opts?.type);
    if (!job) break;
    ran++;
    if (await execute(job)) dead++;
  }
  return { ran, dead };
}

let worker: { controller: AbortController; finished: Promise<void> } | undefined;
export function startWorker(): void {
  if (worker) return;
  const controller = new AbortController();
  const active = new Set<Promise<void>>();
  const loop = async () => {
    while (!controller.signal.aborted) {
      try {
        while (active.size < 4 && !controller.signal.aborted) {
          const job = await claim();
          if (!job) break;
          const done = execute(job, controller.signal).then(() => {}, () => {
            log.warn({ jobId: job.id, type: job.type }, 'Job result could not be saved');
          }).finally(() => { active.delete(done); wake?.(); });
          active.add(done);
        }
      } catch {
        log.warn('Job queue is temporarily unavailable');
      }
      if (controller.signal.aborted) break;
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => { wake = undefined; resolve(); }, config.JOBS_POLL_MS);
        wake = () => { clearTimeout(timer); wake = undefined; resolve(); };
      });
    }
    await Promise.all(active);
  };
  worker = { controller, finished: loop() };
}
export async function stopWorker(): Promise<void> {
  worker?.controller.abort();
  wake?.();
  await worker?.finished;
  worker = undefined;
}

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
            // Verify session ownership before producing another slot batch.
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
