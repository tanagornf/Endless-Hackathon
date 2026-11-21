import { afterAll, expect, test } from 'vitest';
import { PERMISSIONS, STAFF_DEFAULT_PERMISSIONS } from '@nless/shared/core/permissions';
import { closeDb } from './db';
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
