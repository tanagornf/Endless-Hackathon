import { afterAll, expect, test } from 'vitest';
import { PERMISSIONS, STAFF_DEFAULT_PERMISSIONS } from '@nless/shared/core/permissions';
import { revokeUserSessionsInTransaction } from './auth';
import { closeDb, db } from './db';
import { seedId } from './seed';
import { createTestAgent, loginAs } from './test-utils';

afterAll(closeDb);

test('development sessions resolve only the user’s active tenant memberships and permissions', async () => {
  const owner = await createTestAgent();
  const staff = await createTestAgent();
  await loginAs(owner, 'owner.a@example.test');
  await loginAs(staff, 'staff.a@example.test');
  expect((await owner.get('/api/v1/me')).body.data.businesses[0].permissions).toEqual(Object.keys(PERMISSIONS));
  expect((await staff.get('/api/v1/me')).body.data.businesses[0].permissions).toEqual(expect.arrayContaining([...STAFF_DEFAULT_PERMISSIONS]));
  expect((await staff.get('/api/v1/me')).body.data.businesses[0].permissions).toHaveLength(STAFF_DEFAULT_PERMISSIONS.length);
  expect((await owner.get('/api/v1/businesses/' + seedId('biz_demo_b'))).status).toBe(404);
  expect((await owner.post('/api/v1/session/logout')).status).toBe(403);
});

test('revoking sessions in a caller transaction rolls back with the caller and stays scoped to the user', async () => {
  const owner = await createTestAgent();
  const anotherOwner = await createTestAgent();
  await loginAs(owner, 'owner.a@example.test');
  await loginAs(anotherOwner, 'owner.b@example.test');

  const userId = seedId('owner_a');
  const failure = new Error('Synthetic caller transaction failure');
  await expect(db.tx(async (tx) => {
    expect(await revokeUserSessionsInTransaction(tx, userId)).toBeGreaterThan(0);
    throw failure;
  })).rejects.toBe(failure);
  await owner.get('/api/v1/me').expect(200);

  const revoked = await db.tx((tx) => revokeUserSessionsInTransaction(tx, userId));
  expect(revoked).toBeGreaterThan(0);
  await owner.get('/api/v1/me').expect(401);
  await anotherOwner.get('/api/v1/me').expect(200);
}, 20_000);
