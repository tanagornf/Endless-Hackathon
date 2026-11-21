import { randomUUID } from 'node:crypto';
import { afterAll, expect, test, vi } from 'vitest';
import { closeDb, db } from './db';
import { jobs, registerJob } from './jobs';
import { JOBS_HEARTBEAT_MS } from './jobs-config';
import { drainJobs } from './worker';
import { testGate } from './test-utils';

afterAll(closeDb);

test('the next claim recovers a committed effect and a stale finisher cannot overwrite its result', async () => {
  const entered = testGate();
  const release = testGate();
  const effectKey = 'synthetic-effect:' + randomUUID();
  registerJob('test.worker-crash', async (job) => {
    await jobs.enqueue('test.worker-effect', {}, { dedupKey: effectKey, runAt: '2099-01-01T00:00:00Z' });
    if (job.attempt === 1) {
      entered.resolve();
      await release.promise;
    }
    return { result: { attempt: job.attempt } };
  });
  const queued = await jobs.enqueue('test.worker-crash', {});
  const first = drainJobs({ type: 'test.worker-crash' });
  try {
    await entered.promise;
    expect(await drainJobs({ type: 'test.worker-crash' })).toEqual({ ran: 0, dead: 0 });
    await db.query("UPDATE jobs SET locked_until=now()-interval '1 second' WHERE id=$1", [queued.jobId]);
    expect(await drainJobs({ type: 'test.worker-crash' })).toEqual({ ran: 1, dead: 0 });
  } finally {
    release.resolve();
    await first;
  }
  expect(await jobs.get(queued.jobId)).toMatchObject({ state: 'succeeded', attempts: 2 });
  expect(await db.one('SELECT result FROM jobs WHERE id=$1', [queued.jobId])).toEqual({ result: { attempt: 2 } });
  expect(await db.one('SELECT count(*)::int AS total FROM jobs WHERE dedup_key=$1', [effectKey])).toEqual({ total: 1 });
}, 20000);

test('an expired final lease is reaped without another handler attempt', async () => {
  const job = await jobs.enqueue('test.worker-reap', {}, { maxAttempts: 1 });
  await db.query("UPDATE jobs SET state='running',claim_token=gen_random_uuid(),attempts=1,locked_until=now()-interval '1 second' WHERE id=$1", [job.jobId]);
  expect(await drainJobs({ type: 'test.worker-reap' })).toEqual({ ran: 0, dead: 1 });
  expect(await jobs.get(job.jobId)).toMatchObject({ state: 'dead', lastError: 'lease expired, attempts exhausted' });
});

test('heartbeats extend a live lease and cancellation aborts the handler', async () => {
  const entered = testGate();
  const cancelled = testGate();
  const finish = testGate();
  registerJob('test.worker-heartbeat', async ({ signal }) => {
    signal.addEventListener('abort', () => { cancelled.resolve(); finish.resolve(); }, { once: true });
    entered.resolve();
    await finish.promise;
  });
  const queued = await jobs.enqueue('test.worker-heartbeat', {});
  const leaseTime = async () => (await db.one<{ locked_until: Date }>('SELECT locked_until FROM jobs WHERE id=$1', [queued.jobId])).locked_until.getTime();
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  const running = drainJobs({ type: 'test.worker-heartbeat' });
  try {
    await entered.promise;
    const before = await leaseTime();
    await vi.advanceTimersByTimeAsync(JOBS_HEARTBEAT_MS);
    await vi.waitFor(async () => { expect(await leaseTime()).toBeGreaterThan(before); }, { timeout: 4000 });
    await db.query("UPDATE jobs SET state='cancelled',claim_token=NULL,locked_until=NULL WHERE id=$1", [queued.jobId]);
    await vi.advanceTimersByTimeAsync(JOBS_HEARTBEAT_MS);
    await cancelled.promise;
  } finally {
    finish.resolve();
    await running;
    vi.useRealTimers();
  }
  expect(await jobs.get(queued.jobId)).toMatchObject({ state: 'cancelled', attempts: 1 });
}, 16000);
