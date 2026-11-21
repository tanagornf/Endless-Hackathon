import { randomUUID } from 'node:crypto';
import { afterAll, expect, test } from 'vitest';
import { closeDb, db } from './db';
import { AppError } from './errors';
import { jobs, registerJob } from './jobs';
import { testGate } from './test-utils';
import { drainJobs } from './worker';

afterAll(closeDb);
const now = (value: Date) => value.getTime();

test('two drains claim a single job only once and keep progress and redacted results', async () => {
  const attempts: number[] = [];
  registerJob('test.worker-exclusive', async (job) => {
    attempts.push(job.attempt);
    await job.progress(1, 2);
    return { result: { ok: true, password: 'synthetic fixture' } };
  });
  const result = await jobs.enqueue('test.worker-exclusive', {});
  await Promise.all([drainJobs({ type: 'test.worker-exclusive' }), drainJobs({ type: 'test.worker-exclusive' })]);
  expect(attempts).toEqual([1]);
  expect(await jobs.get(result.jobId)).toMatchObject({ state: 'succeeded', progress: { done: 1, total: 2 } });
  expect(await db.one('SELECT result FROM jobs WHERE id=$1', [result.jobId])).toEqual({ result: { ok: true, password: '[REDACTED]' } });
}, 15000);

test('retry uses database backoff and stops in dead after the configured attempt count', async () => {
  registerJob('test.worker-retries', async () => { throw Error('password=synthetic-credential'); });
  const result = await jobs.enqueue('test.worker-retries', {}, { maxAttempts: 3 });
  for (const [attempt, seconds] of [[1, 5], [2, 20]]) {
    await drainJobs({ type: 'test.worker-retries' });
    const row = await db.one<{ state: string; attempts: number; run_at: Date; updated_at: Date }>('SELECT state,attempts,run_at,updated_at FROM jobs WHERE id=$1', [result.jobId]);
    expect(row).toMatchObject({ state: 'queued', attempts: attempt });
    expect(now(row.run_at) - now(row.updated_at)).toBe(seconds * 1000);
    await db.query('UPDATE jobs SET run_at=now() WHERE id=$1', [result.jobId]);
  }
  expect(await drainJobs({ type: 'test.worker-retries' })).toEqual({ ran: 1, dead: 1 });
  expect(await jobs.get(result.jobId)).toMatchObject({ state: 'dead', attempts: 3, lastError: 'INTERNAL: password=[REDACTED]' });
  expect((await db.one<{ dead_at: Date }>('SELECT dead_at FROM jobs WHERE id=$1', [result.jobId])).dead_at).toBeInstanceOf(Date);
}, 15000);

test('permanent errors are dead after the first attempt', async () => {
  registerJob('test.worker-permanent', async () => { throw new AppError('POLICY_BLOCKED', 'Synthetic rule'); });
  const result = await jobs.enqueue('test.worker-permanent', {});
  expect(await drainJobs({ type: 'test.worker-permanent' })).toEqual({ ran: 1, dead: 1 });
  expect(await jobs.get(result.jobId)).toMatchObject({ attempts: 1, state: 'dead' });
});

test('rescheduling refunds an attempt and has a finite cap', async () => {
  registerJob('test.worker-reschedule', async () => ({ retryAt: new Date(0).toISOString() }));
  const result = await jobs.enqueue('test.worker-reschedule', {});
  await drainJobs({ type: 'test.worker-reschedule' });
  expect(await db.one('SELECT attempts,reschedules,state,run_at>updated_at AS delayed FROM jobs WHERE id=$1', [result.jobId]))
    .toEqual({ attempts: 0, reschedules: 1, state: 'queued', delayed: true });
  await db.query('UPDATE jobs SET run_at=now(),reschedules=500 WHERE id=$1', [result.jobId]);
  expect(await drainJobs({ type: 'test.worker-reschedule' })).toEqual({ ran: 1, dead: 1 });
  expect(await jobs.get(result.jobId)).toMatchObject({ state: 'dead', lastError: 'too many reschedules' });
});

test('a contended advisory lock returns the job without charging an attempt', async () => {
  const lockKey = 'test-worker:' + randomUUID();
  let ran = false;
  registerJob('test.worker-locked', async () => { ran = true; });
  const result = await jobs.enqueue('test.worker-locked', {}, { lockKey });
  await db.withAdvisoryLock(lockKey, () => drainJobs({ type: 'test.worker-locked' }));
  expect(ran).toBe(false);
  expect(await jobs.get(result.jobId)).toMatchObject({ state: 'queued', attempts: 0 });
  await db.query('UPDATE jobs SET run_at=now() WHERE id=$1', [result.jobId]);
  await drainJobs({ type: 'test.worker-locked' });
  expect(ran).toBe(true);
}, 15000);

test('an unregistered production job is dead-lettered', async () => {
  const job = await jobs.enqueue('no.registered-handler', {});
  expect(await drainJobs({ type: 'no.registered-handler' })).toEqual({ ran: 1, dead: 1 });
  expect(await jobs.get(job.jobId)).toMatchObject({ attempts: 1, state: 'dead', lastError: 'no handler for type' });
});

test('two jobs with the same lock key cannot overlap', async () => {
  const key = 'test-worker-shared:' + randomUUID();
  const entered = testGate();
  const release = testGate();
  let count = 0;
  registerJob('test.worker-shared-lock', async () => {
    if (++count !== 1) return;
    entered.resolve();
    await release.promise;
  });
  for (let index = 0; index < 2; index++) await jobs.enqueue('test.worker-shared-lock', {}, { lockKey: key });
  const first = drainJobs({ type: 'test.worker-shared-lock' });
  try {
    await entered.promise;
    expect(await drainJobs({ type: 'test.worker-shared-lock' })).toEqual({ ran: 0, dead: 0 });
    expect(count).toBe(1);
  } finally { release.resolve(); }
  await first;
  expect(count).toBe(2);
}, 15000);
