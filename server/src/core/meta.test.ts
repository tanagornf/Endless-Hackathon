import { afterAll, expect, test, vi } from 'vitest';
import request from 'supertest';
import { createApp } from './app';
import { closeDb } from './db';
import * as migrations from './migrate';

afterAll(closeDb);
test('reports health and deployment identity without server credentials', async () => {
  const agent = request(await createApp());
  expect((await agent.get('/healthz')).body).toEqual({ status: 'ok', db: 'ok' });
  expect((await agent.get('/readyz')).status).toBe(200);
  const info = (await agent.get('/build-info')).body;
  expect(info).toMatchObject({ env: 'test', modelMode: 'fake', featuresLoaded: 31, sha: expect.any(String) });
  expect(Object.keys(info)).toEqual(['sha', 'lane', 'env', 'schema', 'modelMode', 'models', 'featuresLoaded', 'providerModes']);
});

test('readiness rejects pending schema work', async () => {
  const pending = vi.spyOn(migrations, 'migrationStatus').mockResolvedValue({ schema: null, pending: 1 });
  try {
    expect((await request(await createApp()).get('/readyz')).status).toBe(503);
  } finally { pending.mockRestore(); }
});
