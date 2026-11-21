import { afterAll, expect, test, vi } from 'vitest';
import request from 'supertest';
import { createApp } from './app';
import { closeDb } from './db';
import * as migrations from './migrate';
import * as worker from './worker';

afterAll(closeDb);
test('reports health and deployment identity without server credentials', async () => {
  const agent = request(await createApp());
  expect((await agent.get('/healthz')).body).toEqual({ status: 'ok', db: 'ok' });
  const ready = await agent.get('/readyz');
  expect(ready.status).toBe(200);
  expect(ready.body).toMatchObject({
    status: 'ready', worker: { enabled: false, running: false }, scheduler: { enabled: false, holdsLock: false },
    migrations: { pending: 0 }, uploadDir: 'ok',
  });
  const info = (await agent.get('/build-info')).body;
  expect(info).toMatchObject({ env: 'test', modelMode: 'fake', featuresLoaded: 31, sha: expect.any(String) });
  expect(Object.keys(info)).toEqual(['sha', 'startedAt', 'lane', 'env', 'schema', 'modelMode', 'models', 'featuresLoaded', 'providerModes']);
}, 15_000);

test('readiness rejects pending schema work', async () => {
  const pending = vi.spyOn(migrations, 'migrationStatus').mockResolvedValue({ schema: null, pending: 1 });
  try {
    expect((await request(await createApp()).get('/readyz')).status).toBe(503);
  } finally { pending.mockRestore(); }
});

test('readiness reports an enabled worker whose poll is stale', async () => {
  const state = vi.spyOn(worker, 'workerState').mockReturnValue({
    enabled: true, running: true, inFlight: 0, concurrency: 4, instanceId: 'test',
    lastPollAt: '2000-01-01T00:00:00.000Z',
  });
  try {
    const ready = await request(await createApp()).get('/readyz');
    expect(ready.status).toBe(503);
    expect(ready.body).toMatchObject({ error: { code: 'SERVICE_NOT_READY', details: { failed: ['worker'] } } });
  } finally { state.mockRestore(); }
});
