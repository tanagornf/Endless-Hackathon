import type { FeatureId } from '@nless/shared/core/features';
import type { JobState } from '@nless/shared/core/types';
import { config } from './config';
import { db } from './db';
import { AppError } from './errors';
import { JOBS_PAYLOAD_MAX_BYTES } from './jobs-config';
import { log } from './log';
import { redactText } from './redact';
import { publish } from './realtime';
import type { EnqueueOptions, JobHandler, JobsApi, ScheduleDefinition } from './types';

const handlers = new Map<string, JobHandler>();
interface RegisteredSchedule extends ScheduleDefinition { ownerFeature: FeatureId }
const schedules = new Map<string, RegisteredSchedule>();
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
export function registerSchedule(schedule: ScheduleDefinition, ownerFeature: FeatureId): void {
  if (!Number.isInteger(schedule.everySeconds) || schedule.everySeconds < 10 || schedule.everySeconds > 604_800) {
    throw new Error('Invalid schedule frequency: ' + schedule.name);
  }
  if (!/^[a-z][a-z0-9_.-]{1,79}$/.test(schedule.name)) throw new Error('Invalid schedule job type: ' + schedule.name);
  const previous = schedules.get(schedule.name);
  if (previous) throw new Error('Duplicate schedule ' + schedule.name + ' from ' + previous.ownerFeature + ' and ' + ownerFeature);
  registerJob(schedule.name, schedule.handler);
  schedules.set(schedule.name, { ...schedule, ownerFeature });
}

export function registeredSchedules(): readonly RegisteredSchedule[] {
  return [...schedules.values()];
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
