import { afterAll, expect, test, vi } from 'vitest';
import { config } from './config';
import * as registry from './features';
import { visiblePublicFeatures } from './features';
import { createHttpApp } from './http';
import { closeDb, db } from './db';
import { createTestAgent, loginAs } from './test-utils';

afterAll(closeDb);
test('feature flag updates require platform administration and hide menus for an owner', async () => {
  const owner = await createTestAgent();
  const admin = await createTestAgent();
  await loginAs(owner, 'owner.a@example.test');
  await loginAs(admin, 'admin@example.test');
  const state = await owner.get('/api/v1/features');
  expect(state.body.data.items).toHaveLength(29);
  expect((await owner.put('/api/v1/ops/features/F13').set('X-Requested-With', 'nless').send({ hidden: true })).status).toBe(403);
  const changed = await admin.put('/api/v1/ops/features/F13').set('X-Requested-With', 'nless').send({ hidden: true });
  expect(changed.body.data).toMatchObject({ visible: false, hidden: true });
  expect((await owner.get('/api/v1/features')).body.data.items.find((row: { featureId: string }) => row.featureId === 'F13')).toMatchObject({ visible: false });
});

test('initializes env flags once and defaults all production placeholders to hidden', async () => {
  const original = { hidden: config.HIDDEN_FEATURES, env: config.NODE_ENV };
  const loadFeatures = registry.loadFeatures;
  const fixture = vi.spyOn(registry, 'loadFeatures').mockImplementation(async (http) => {
    const loaded = await loadFeatures(http);
    http.api('F05').get('/_test/published-knowledge', { auth: 'user' }, async () => ({ ok: true }));
    return loaded;
  });
  try {
    config.HIDDEN_FEATURES = 'F14';
    const owner = await createTestAgent();
    await loginAs(owner, 'owner.a@example.test');
    expect((await owner.get('/api/v1/features')).body.data.items.find((row: { featureId: string }) => row.featureId === 'F14')).toMatchObject({ hidden: true });
    await db.query('UPDATE feature_flags SET hidden=false WHERE feature_id=$1', ['F14']);
    await createTestAgent();
    expect((await owner.get('/api/v1/features')).body.data.items.find((row: { featureId: string }) => row.featureId === 'F14')).toMatchObject({ hidden: false });
    config.NODE_ENV = 'production';
    const state = (await owner.get('/api/v1/features')).body.data;
    expect(state.production).toBe(true);
    const placeholders = state.items.filter((row: { placeholder: boolean }) => row.placeholder);
    expect(placeholders.every((row: { visible: boolean }) => !row.visible)).toBe(true);
    const realFeature = state.items.find((row: { featureId: string }) => row.featureId === 'F05');
    expect(realFeature).toMatchObject({ placeholder: false, hidden: false, visible: true });

    const admin = await createTestAgent();
    await loginAs(admin, 'admin@example.test');
    try {
      const flagged = await admin.put('/api/v1/ops/features/F05').set('X-Requested-With', 'nless').send({ hidden: true });
      expect(flagged.body.data).toMatchObject({ placeholder: false, hidden: true, visible: false });
    } finally {
      await db.query("DELETE FROM feature_flags WHERE feature_id='F05'");
    }
  } finally {
    fixture.mockRestore();
    config.HIDDEN_FEATURES = original.hidden;
    config.NODE_ENV = original.env;
  }
});

test('anonymous flags expose only visible features with public API routes', async () => {
  const http = createHttpApp();
  http.api('F09').get('/public/demo-chat/:slug', { auth: 'none' }, async () => ({}));
  http.api('F08').get('/businesses/:businessId/example-catalog', { auth: 'business' }, async () => ({}));
  http.api('F14').get('/features/payments/status', { auth: 'none', summary: 'placeholder status' }, async () => ({}));
  expect(await visiblePublicFeatures(http.routes)).toEqual(['F09']);
  await db.query("INSERT INTO feature_flags (feature_id,hidden) VALUES ('F09',true) ON CONFLICT (feature_id) DO UPDATE SET hidden=true");
  try { expect(await visiblePublicFeatures(http.routes)).toEqual([]); }
  finally { await db.query("DELETE FROM feature_flags WHERE feature_id='F09'"); }
});

test('the public feature flags route leaves merchant and administrative routes protected', async () => {
  const agent = await createTestAgent();
  const flags = await agent.get('/api/v1/features/visible');
  expect(flags.status).toBe(200);
  expect(flags.body.data).toEqual({ visibleFeatureIds: expect.any(Array) });
  expect((await agent.get('/api/v1/features')).status).toBe(401);
  expect((await agent.put('/api/v1/ops/features/F13').set('X-Requested-With','nless').send({ hidden: false })).status).toBe(401);
});
