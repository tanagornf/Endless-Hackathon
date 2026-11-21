import { afterAll, expect, test } from 'vitest';
import { closeDb } from './db';
import { jobs, registerJob } from './jobs';
import { markDraining } from './meta';
import { createTestAgent, testGate } from './test-utils';
import { drainJobs, startWorker, stopWorker } from './worker';

afterAll(async () => { await stopWorker(0); await closeDb(); });

test('shutdown waits for short work and is safe to call repeatedly', async () => {
  const started = testGate();
  const complete = testGate();
  registerJob('test.shutdown-short', async () => { started.resolve(); await complete.promise; });
  const queued = await jobs.enqueue('test.shutdown-short', {});
  startWorker();
  await started.promise;
  const stopped = stopWorker(1000);
  const duplicate = stopWorker(1000);
  complete.resolve();
  await Promise.all([stopped, duplicate]);
  expect(await jobs.get(queued.jobId)).toMatchObject({ state: 'succeeded', attempts: 1 });
}, 12000);

test('shutdown aborts long work and promptly returns the uncharged claim', async () => {
  const started = testGate();
  let invoked = 0;
  let aborted = false;
  registerJob('test.shutdown-long', async ({ signal }) => {
    if (++invoked > 1) return;
    started.resolve();
    await new Promise<void>((_resolve, reject) => signal.addEventListener('abort', () => {
      aborted = true;
      reject(signal.reason);
    }, { once: true }));
  });
  const queued = await jobs.enqueue('test.shutdown-long', {});
  startWorker();
  await started.promise;
  await stopWorker(15);
  expect(aborted).toBe(true);
  expect(await jobs.get(queued.jobId)).toMatchObject({ state: 'queued', attempts: 0 });
  expect(await drainJobs({ type: 'test.shutdown-long' })).toEqual({ ran: 1, dead: 0 });
  expect(await jobs.get(queued.jobId)).toMatchObject({ state: 'succeeded', attempts: 1 });
}, 12000);

test('draining service stops answering ready while remaining healthy', async () => {
  const agent = await createTestAgent();
  markDraining();
  expect((await agent.get('/readyz')).status).toBe(503);
  expect((await agent.get('/healthz')).status).toBe(200);
});
