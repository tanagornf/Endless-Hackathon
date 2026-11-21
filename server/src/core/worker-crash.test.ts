import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { afterAll, expect, test, vi } from 'vitest';
import { closeDb, db, dbPool } from './db';
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

const hungJobProcess = `
  import { registerJob } from './server/src/core/jobs.ts';
  import { drainJobs } from './server/src/core/worker.ts';
  const type = process.argv[1];
  const realSetTimeout = globalThis.setTimeout;
  // Shorten only the handler watchdog timers in this isolated child.
  globalThis.setTimeout = (callback, ms, ...args) =>
    realSetTimeout(callback, ms === 120_000 ? 500 : ms === 5_000 ? 250 : ms, ...args);
  registerJob(type, async ({ signal }) => {
    signal.addEventListener('abort', () => process.send?.('aborted'), { once: true });
    process.send?.('entered');
    await new Promise(() => {});
  });
  process.on('message', (message) => { if (message === 'terminate') process.exit(23); });
  await drainJobs({
    type,
    maxMs: 60_000,
    onStuckHandler: (event) => process.send?.({ state: 'stuck', ...event }),
  });
`;

test('reports a stalled handler while retaining its advisory lock until the child exits', async () => {
  const lockKey = 'worker-stall:' + randomUUID();
  const originalType = 'test.worker-stall-original';
  const nextType = 'test.worker-stall-next';
  const unrelatedType = 'test.worker-stall-unrelated';
  const first = await jobs.enqueue(originalType, {}, { lockKey });
  const jobIds = [first.jobId];
  const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', hungJobProcess, originalType], {
    cwd: fileURLToPath(new URL('../../../', import.meta.url)),
    env: { ...process.env, NODE_ENV: 'test', MODEL_MODE: 'fake' },
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  const signals: unknown[] = [];
  child.on('message', (message) => signals.push(message));
  const exited = once(child, 'exit');
  try {
    await vi.waitFor(() => expect(signals).toContain('entered'), { timeout: 10_000 });
    await vi.waitFor(() => expect(signals).toContain('aborted'), { timeout: 3_000 });
    await vi.waitFor(() => expect(signals).toContainEqual({
      state: 'stuck', jobId: first.jobId, type: originalType, attempts: 1,
    }), { timeout: 3_000 });

    const recovered = vi.fn(async () => {});
    const unrelated = vi.fn(async () => {});
    registerJob(nextType, recovered);
    registerJob(unrelatedType, unrelated);
    const second = await jobs.enqueue(nextType, {}, { lockKey });
    jobIds.push(second.jobId);
    const other = await jobs.enqueue(unrelatedType, {}, { lockKey: lockKey + ':other' });
    jobIds.push(other.jobId);

    const canTakeLock = async () => {
      const contender = await dbPool().connect();
      try {
        const result = await contender.query<{ held: boolean }>('SELECT pg_try_advisory_lock(hashtext($1)) AS held', [lockKey]);
        const held = result.rows[0].held;
        if (held) await contender.query('SELECT pg_advisory_unlock(hashtext($1))', [lockKey]);
        return held;
      } finally { contender.release(); }
    };
    expect(await canTakeLock()).toBe(false);

    expect(await drainJobs({ type: nextType })).toEqual({ ran: 0, dead: 0 });
    expect(recovered).not.toHaveBeenCalled();
    expect(await drainJobs({ type: unrelatedType })).toEqual({ ran: 1, dead: 0 });
    expect(unrelated).toHaveBeenCalledTimes(1);
    expect(await jobs.get(first.jobId)).toMatchObject({ state: 'running' });
    expect(signals.slice(0, 2)).toEqual(['entered', 'aborted']);
    expect(signals).toHaveLength(3);

    child.send('terminate');
    await vi.waitFor(() => expect(child.exitCode).toBe(23), { timeout: 5_000 });
    expect((await exited)[0]).toBe(23);
    await vi.waitFor(async () => expect(await canTakeLock()).toBe(true), { timeout: 3_000 });
    // Simulate the original claim expiring after its session releases the lock.
    await db.query("UPDATE jobs SET locked_until=now()-interval '1 second' WHERE id=$1", [first.jobId]);
    expect(await drainJobs({ type: nextType })).toEqual({ ran: 1, dead: 0 });
    expect(recovered).toHaveBeenCalledTimes(1);
    expect(await jobs.get(second.jobId)).toMatchObject({ state: 'succeeded' });
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await exited.catch(() => {});
    await db.query('DELETE FROM jobs WHERE id=ANY($1::uuid[])', [jobIds]);
  }
}, 30_000);
