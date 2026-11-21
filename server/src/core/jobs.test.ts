import { randomUUID } from 'node:crypto';
import { afterAll, expect, test } from 'vitest';
import { closeDb, db } from './db';
import { jobs } from './jobs';
import { drainJobs } from './worker';

afterAll(closeDb);

test('persists a job and preserves its deduplication key after it is dead', async () => {
  const key = 'jobs-test:' + randomUUID();
  const first = await jobs.enqueue('test.jobs-dedup', { key }, { dedupKey: key });
  expect(first.deduped).toBe(false);
  expect(await jobs.get(first.jobId)).toMatchObject({ state: 'queued', attempts: 0 });
  await db.query("UPDATE jobs SET state='dead' WHERE id=$1", [first.jobId]);
  expect(await jobs.enqueue('test.jobs-dedup', {}, { dedupKey: key })).toEqual({ jobId: first.jobId, deduped: true });
});

test.each([
  ['malformed type', 'Bad/type', {}, {}],
  ['oversize UTF-8 data', 'test.jobs-large', { field: 'ก'.repeat(6000) }, {}],
  ['credential field', 'test.jobs-secret', { fields: [{ apiKey: 'synthetic fixture' }] }, {}],
  ['attempts outside limits', 'test.jobs-attempts', {}, { maxAttempts: 21 }],
  ['malformed date', 'test.jobs-date', {}, { runAt: 'next time' }],
  ['long lock key', 'test.jobs-lock', {}, { lockKey: 'x'.repeat(201) }],
] as const)('rejects %s before enqueue', async (_name, type, payload, options) => {
  await expect(jobs.enqueue(type, payload, options)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
});

test('accepts the LINE replyToken exception without claiming future work early', async () => {
  const result = await jobs.enqueue('test.jobs-in-future', { events: [{ replyToken: 'synthetic expiring token' }] }, {
    runAt: '2099-01-01T00:00:00Z',
  });
  expect(await drainJobs({ type: 'test.jobs-in-future' })).toEqual({ ran: 0, dead: 0 });
  expect(await jobs.get(result.jobId)).toMatchObject({ state: 'queued', attempts: 0 });
});
