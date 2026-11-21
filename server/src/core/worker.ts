import type { JobState } from '@nless/shared/core/types';
import { audit } from './audit';
import { config } from './config';
import { db, dbPool } from './db';
import { DEMO_BUSINESS_IDS, DEMO_RESET_LOCK } from './demo-scope';
import { AppError } from './errors';
import { getJobHandler, publishJob, subscribeJobWake } from './jobs';
import {
  instanceId, JOBS_CONCURRENCY, JOBS_HANDLER_SOFT_TIMEOUT_MS, JOBS_HEARTBEAT_MS, JOBS_LEASE_SECONDS,
  JOBS_MAX_RESCHEDULES, JOBS_POLL_MS, JOBS_RESULT_MAX_BYTES, JOBS_SHUTDOWN_GRACE_MS,
} from './jobs-config';
import { jobContext, log } from './log';
import { redactObject, redactText } from './redact';

interface JobIdentity { id: string; type: string; business_id: string | null; attempts: number }
interface JobClaim extends JobIdentity {
  payload: Record<string, unknown>;
  lock_key: string | null;
  claim_token: string;
  max_attempts: number;
  reschedules: number;
}
interface ActiveClaim {
  job: JobClaim;
  controller: AbortController;
  result: Promise<boolean>;
}
interface Worker {
  active: Map<string, ActiveClaim>;
  polling: Promise<void>;
  stop?: Promise<void>;
  stopping: boolean;
  wake?: () => void;
  lastPollAt: string | null;
}
let worker: Worker | undefined;

const shuttingDown = new DOMException('Worker is shutting down', 'AbortError');
const ownershipLost = new DOMException('Job ownership was lost', 'AbortError');
const handlerTimeout = new DOMException('Job handler timed out', 'TimeoutError');
const exhausted = 'lease expired, attempts exhausted';

async function onDead(job: JobIdentity, lastError: string) {
  log.error({ jobId: job.id, type: job.type, attempts: job.attempts, lastError }, 'Job is dead');
  publishJob(job, 'dead');
  await audit({
    action: 'core.job.dead', actorUserId: null, businessId: job.business_id,
    targetType: 'job', targetId: job.id, details: { type: job.type, attempts: job.attempts },
  }).catch(() => log.warn({ jobId: job.id, type: job.type }, 'Dead job audit could not be written'));
}
async function reap(type?: string): Promise<number> {
  const { rows } = await db.query<JobIdentity>(
    "UPDATE jobs SET state='dead',dead_at=now(),finished_at=now(),updated_at=now(),claim_token=NULL, " +
    "locked_until=NULL,locked_by=NULL,last_error=$2 WHERE state='running' AND locked_until<now() " +
    "AND attempts>=max_attempts AND ($1::text IS NULL OR type=$1) RETURNING id,type,business_id,attempts",
    [type ?? null, exhausted],
  );
  for (const row of rows) await onDead(row, exhausted);
  return rows.length;
}

function claimOne(type?: string): Promise<JobClaim | null> {
  return db.maybeOne<JobClaim>(
    "UPDATE jobs SET state='running',attempts=attempts+1,claim_token=gen_random_uuid(),locked_by=$1," +
    "started_at=now(),updated_at=now(),locked_until=now()+make_interval(secs=>$2::double precision) WHERE id=(" +
    "SELECT j.id FROM jobs j WHERE ((j.state='queued' AND j.run_at<=now()) OR " +
    "(j.state='running' AND j.locked_until<now() AND j.attempts<j.max_attempts)) " +
    "AND ($3::text IS NULL OR j.type=$3) " +
    "AND CASE WHEN j.business_id=ANY($4::uuid[]) THEN pg_try_advisory_xact_lock_shared(hashtext($5)) ELSE true END " +
    "AND (j.lock_key IS NULL OR NOT EXISTS (" +
    "SELECT 1 FROM jobs r WHERE r.lock_key=j.lock_key AND r.id<>j.id AND r.state='running' AND r.locked_until>=now())) " +
    "ORDER BY j.run_at,j.created_at,j.id LIMIT 1 FOR UPDATE OF j SKIP LOCKED) RETURNING *",
    [instanceId, JOBS_LEASE_SECONDS, type ?? null, DEMO_BUSINESS_IDS, DEMO_RESET_LOCK],
  );
}

async function releaseClaims(claims: readonly JobClaim[], delaySeconds = 0): Promise<void> {
  if (!claims.length) return;
  const response = await db.query<JobIdentity>(
    "UPDATE jobs j SET state='queued',attempts=GREATEST(attempts-1,0),claim_token=NULL,locked_until=NULL," +
    "locked_by=NULL,run_at=now()+make_interval(secs=>$3::double precision),updated_at=now() " +
    "FROM unnest($1::uuid[],$2::uuid[]) AS release(id,token) " +
    "WHERE j.id=release.id AND j.claim_token=release.token AND j.state='running' " +
    "RETURNING j.id,j.type,j.business_id,j.attempts",
    [claims.map((item) => item.id), claims.map((item) => item.claim_token), delaySeconds],
  );
  for (const changed of response.rows) publishJob(changed, 'queued');
}

async function renewClaim(job: JobClaim): Promise<boolean> {
  const result = await db.query(
    "UPDATE jobs SET locked_until=now()+make_interval(secs=>$3::double precision) " +
    "WHERE id=$1 AND claim_token=$2 AND state='running' AND locked_until>=now()",
    [job.id, job.claim_token, JOBS_LEASE_SECONDS],
  );
  return result.rowCount === 1;
}

interface Settlement {
  state: 'queued' | 'succeeded' | 'dead';
  rescheduleAt?: Date;
  backoffSeconds?: number;
  error?: string;
  payload?: string;
}
async function settle(job: JobClaim, outcome: Settlement): Promise<boolean> {
  const changed = await db.query(
    "UPDATE jobs SET state=$3::text,claim_token=NULL,locked_until=NULL,locked_by=NULL,updated_at=now()," +
    "attempts=attempts-CASE WHEN $4::timestamptz IS NULL THEN 0 ELSE 1 END," +
    "reschedules=reschedules+CASE WHEN $4::timestamptz IS NULL THEN 0 ELSE 1 END," +
    "run_at=CASE WHEN $4::timestamptz IS NOT NULL THEN GREATEST($4,now()+interval '1 second') " +
    "WHEN $5::double precision IS NOT NULL THEN now()+make_interval(secs=>$5) ELSE run_at END," +
    "finished_at=CASE WHEN $3::text='queued' THEN NULL ELSE now() END," +
    "dead_at=CASE WHEN $3::text='dead' THEN now() ELSE NULL END,last_error=$6,result=$7::jsonb " +
    "WHERE id=$1 AND claim_token=$2 AND state='running'",
    [job.id, job.claim_token, outcome.state, outcome.rescheduleAt ?? null, outcome.backoffSeconds ?? null,
      outcome.error ?? null, outcome.payload ?? null],
  );
  if (!changed.rowCount) {
    log.debug('Discarded result for an inactive job claim');
    return false;
  }
  if (outcome.state === 'dead') await onDead(job, outcome.error ?? 'job failed');
  else publishJob(job, outcome.state);
  return outcome.state === 'dead';
}

function fromFailure(job: JobClaim, error: unknown, timedOut = false): Settlement {
  const appError = error instanceof AppError ? error : null;
  const retryable = timedOut || (appError?.retryable ?? true);
  const message = timedOut ? 'handler timeout' : redactText(
    (appError?.code ?? 'INTERNAL') + ': ' + (error instanceof Error ? error.message : 'Job handler failed'),
  );
  if (retryable && job.attempts < job.max_attempts) {
    return { state: 'queued', backoffSeconds: 5 * job.attempts ** 2, error: message };
  }
  return { state: 'dead', error: message };
}

async function runHandler(job: JobClaim, controller: AbortController): Promise<boolean> {
  const { signal } = controller;
  let renewInFlight = false;
  let renewedAt = Date.now();
  const heartbeat = setInterval(() => {
    if (signal.aborted || renewInFlight) return;
    renewInFlight = true;
    void renewClaim(job).then((valid) => {
      if (valid) renewedAt = Date.now();
      else controller.abort(ownershipLost);
    }).catch(() => {
      if (Date.now() - renewedAt >= JOBS_LEASE_SECONDS * 1000) controller.abort(ownershipLost);
    }).finally(() => { renewInFlight = false; });
  }, JOBS_HEARTBEAT_MS);
  const timeout = setTimeout(() => controller.abort(handlerTimeout), JOBS_HANDLER_SOFT_TIMEOUT_MS);
  const stopHeartbeat = () => { clearInterval(heartbeat); clearTimeout(timeout); };
  signal.addEventListener('abort', stopHeartbeat, { once: true });

  try {
    signal.throwIfAborted();
    const handler = getJobHandler(job.type);
    if (!handler) return await settle(job, { state: 'dead', error: 'no handler for type' });
    publishJob(job, 'running');
    let lastProgressAt = -Infinity;
    let outcome: Settlement;
    try {
      const result = await handler({
        id: job.id, type: job.type, businessId: job.business_id, payload: job.payload,
        attempt: job.attempts, maxAttempts: job.max_attempts, signal,
        async progress(done, total) {
          signal.throwIfAborted();
          const counts = { done, total };
          const update = await db.query(
            "UPDATE jobs SET progress=$3::jsonb,updated_at=now() WHERE id=$1 AND claim_token=$2 AND state='running'",
            [job.id, job.claim_token, JSON.stringify(counts)],
          );
          if (!update.rowCount) {
            controller.abort(ownershipLost);
            throw ownershipLost;
          }
          const now = performance.now();
          if (now - lastProgressAt >= 1000) {
            lastProgressAt = now;
            publishJob(job, 'running', counts);
          }
        },
      });
      signal.throwIfAborted();
      if (result && 'retryAt' in result) {
        const at = new Date(result.retryAt);
        if (job.reschedules >= JOBS_MAX_RESCHEDULES) outcome = { state: 'dead', error: 'too many reschedules' };
        else if (Number.isFinite(at.valueOf())) outcome = { state: 'queued', rescheduleAt: at };
        else outcome = { state: 'dead', error: 'invalid reschedule time' };
      } else {
        const data = result && 'result' in result ? JSON.stringify(redactObject(result.result)) : undefined;
        const payload = data && Buffer.byteLength(data) > JOBS_RESULT_MAX_BYTES ? '{"truncated":true}' : data;
        outcome = { state: 'succeeded', payload };
      }
    } catch (error) {
      if (signal.reason === shuttingDown) {
        await releaseClaims([job]);
        return false;
      }
      if (signal.reason === ownershipLost) return false;
      outcome = fromFailure(job, error, signal.reason === handlerTimeout);
      log.warn({ lastError: outcome.error }, 'Job handler failed');
    }
    return await settle(job, outcome);
  } finally {
    stopHeartbeat();
    signal.removeEventListener('abort', stopHeartbeat);
  }
}

async function perform(job: JobClaim, controller: AbortController): Promise<boolean> {
  const client = job.lock_key ? await dbPool().connect() : null;
  let locked = false;
  let destroy = false;
  const disconnected = () => { destroy = true; controller.abort(ownershipLost); };
  client?.on('error', disconnected);
  try {
    if (controller.signal.reason === shuttingDown) {
      await releaseClaims([job]);
      return false;
    }
    if (client) {
      const lock = await client.query<{ held: boolean }>('SELECT pg_try_advisory_lock(hashtext($1)) AS held', [job.lock_key]);
      locked = Boolean(lock.rows[0]?.held);
      if (!locked) {
        await releaseClaims([job], 2);
        return false;
      }
    }
    if (!(await renewClaim(job))) return false;
    if (controller.signal.reason === shuttingDown) {
      await releaseClaims([job]);
      return false;
    }
    return await runHandler(job, controller);
  } finally {
    if (client) {
      if (locked && !destroy) await client.query('SELECT pg_advisory_unlock(hashtext($1))', [job.lock_key]).catch(() => { destroy = true; });
      client.off('error', disconnected);
      client.release(destroy);
    }
  }
}

function activate(job: JobClaim): ActiveClaim {
  const controller = new AbortController();
  const result = jobContext.run({ jobId: job.id, type: job.type }, async () => {
    try { return await perform(job, controller); }
    catch {
      log.warn('Job execution could not be recorded; the lease will recover it');
      return false;
    }
  });
  return { job, controller, result };
}

async function waitFor<T>(promise: Promise<T>, milliseconds: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const limit = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), Math.max(0, milliseconds)); });
    return await Promise.race([promise, limit]);
  } finally { clearTimeout(timer); }
}

export async function drainJobs(opts?: { type?: string; maxMs?: number }): Promise<{ ran: number; dead: number }> {
  if (config.NODE_ENV === 'production' || (config.NODE_ENV !== 'test' && config.MODEL_MODE !== 'fake')) {
    throw new AppError('POLICY_BLOCKED', 'Jobs can only be drained in tests or fake development mode');
  }
  const end = Date.now() + (opts?.maxMs ?? 20000);
  let ran = 0;
  let dead = await reap(opts?.type);
  while (Date.now() < end) {
    const job = await claimOne(opts?.type);
    if (!job) break;
    ran++;
    const active = activate(job);
    const result = await waitFor(active.result, end - Date.now());
    if (result === null) {
      active.controller.abort(shuttingDown);
      await releaseClaims([job]);
      break;
    }
    if (result) dead++;
  }
  return { ran, dead };
}

function sleepOrWake(current: Worker, time: number): Promise<void> {
  return new Promise((resolve) => {
    const ready = () => { clearTimeout(timer); current.wake = undefined; resolve(); };
    const timer = setTimeout(ready, time);
    current.wake = ready;
    if (current.stopping) ready();
  });
}
async function poll(current: Worker): Promise<void> {
  const unsubscribe = subscribeJobWake(() => current.wake?.());
  try {
    while (!current.stopping) {
      try {
        await reap();
        current.lastPollAt = new Date().toISOString();
        let added = 0;
        while (!current.stopping && current.active.size < JOBS_CONCURRENCY) {
          const job = await claimOne();
          if (!job) break;
          if (current.stopping) {
            await releaseClaims([job]);
            break;
          }
          const active = activate(job);
          current.active.set(job.claim_token, active);
          void active.result.then(() => {
            current.active.delete(job.claim_token);
            current.wake?.();
          });
          added++;
        }
        if (added === 0) await sleepOrWake(current, JOBS_POLL_MS);
      } catch {
        log.warn('Job queue temporarily unavailable');
        await sleepOrWake(current, 5000);
      }
    }
  } finally { unsubscribe(); }
}

export function startWorker(): void {
  if (worker) return;
  const current: Worker = { active: new Map(), polling: Promise.resolve(), stopping: false, lastPollAt: null };
  worker = current;
  current.polling = poll(current);
}

export function workerState() {
  return {
    enabled: config.RUN_WORKER, running: Boolean(worker && !worker.stopping), inFlight: worker?.active.size ?? 0,
    concurrency: JOBS_CONCURRENCY, lastPollAt: worker?.lastPollAt ?? null, instanceId,
  };
}

export function stopWorker(graceMs = JOBS_SHUTDOWN_GRACE_MS): Promise<void> {
  const current = worker;
  if (!current) return Promise.resolve();
  if (current.stop) return current.stop;
  current.stopping = true;
  current.wake?.();
  const finishActive = async () => {
    await current.polling;
    await Promise.all([...current.active.values()].map(({ result }) => result));
    return true;
  };
  current.stop = (async () => {
    try {
      const complete = finishActive();
      if (await waitFor(complete, graceMs)) return;
      for (const entry of current.active.values()) entry.controller.abort(shuttingDown);
      if (await waitFor(complete, 2000)) return;
      await releaseClaims([...current.active.values()].map(({ job }) => job));
    } finally {
      if (worker === current) worker = undefined;
    }
  })();
  return current.stop;
}
