import { afterAll, expect, test } from 'vitest';
import { config } from './config';
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
    expect(state.items.every((row: { placeholder: boolean; visible: boolean }) => row.placeholder && !row.visible)).toBe(true);
  } finally {
    config.HIDDEN_FEATURES = original.hidden;
    config.NODE_ENV = original.env;
  }
});
