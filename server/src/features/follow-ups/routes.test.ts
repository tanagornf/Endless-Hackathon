import { afterAll, beforeAll, expect, it } from 'vitest';
import { db } from '../../core';
import { closeDb } from '../../core/db';
import { seedId } from '../../core/seed';
import { createTestAgent, loginAs } from '../../core/test-utils';

const businessA = seedId('biz_demo_a');
const businessB = seedId('biz_demo_b');
const path = (businessId: string) => '/api/v1/businesses/' + businessId + '/follow-ups/settings';
type Agent = Awaited<ReturnType<typeof createTestAgent>>;
let owner: Agent;
let otherOwner: Agent;
let staff: Agent;

const settings = { expectedVersion: 1, enabled: true, delayHours: 5, quietStart: '20:35', quietEnd: '08:10', allowedChannels: ['web', 'line'] };
const update = (agent: Agent, businessId: string, body: unknown) =>
  agent.put(path(businessId)).set('X-Requested-With', 'nless').send(body as Record<string, unknown>);

beforeAll(async () => {
  [owner, otherOwner, staff] = await Promise.all([createTestAgent(), createTestAgent(), createTestAgent()]);
  await Promise.all([
    loginAs(owner, 'owner.a@example.test'),
    loginAs(otherOwner, 'owner.b@example.test'),
    loginAs(staff, 'staff.a@example.test'),
  ]);
});
afterAll(async () => {
  await db.query('DELETE FROM follow_up_settings WHERE business_id=$1', [businessA]);
  await closeDb();
});

it('starts disabled and keeps shop settings scoped through concurrent versioned writes', async () => {
  const { body } = await owner.get(path(businessA)).expect(200);
  expect(body.data).toEqual({
    businessId: businessA, enabled: false, delayHours: 4, quietStart: '21:00', quietEnd: '08:00',
    allowedChannels: ['web'], version: 1, timezone: 'Asia/Bangkok',
  });
  await update(owner, businessA, { ...settings, expectedVersion: 2 }).expect(409);
  const results = await Promise.all([update(owner, businessA, settings), update(owner, businessA, settings)]);
  expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
  const persisted = await owner.get(path(businessA)).expect(200);
  expect(persisted.body.data).toMatchObject({ enabled: true, delayHours: 5, allowedChannels: ['web', 'line'], version: 2 });
  const edited = await update(owner, businessA, { ...settings, expectedVersion: 2, enabled: false }).expect(200);
  expect(edited.body.data).toMatchObject({ enabled: false, version: 3 });
  const later = await staff.get(path(businessA)).expect(200);
  expect(later.body.data.version).toBe(3);
  const other = await otherOwner.get(path(businessB)).expect(200);
  expect(other.body.data).toMatchObject({ businessId: businessB, enabled: false, delayHours: 4, version: 1 });
  await otherOwner.get(path(businessA)).expect(404);
  await update(otherOwner, businessA, settings).expect(404);
});

it('requires bot settings permission and validates bounds and supported channels', async () => {
  await update(staff, businessA, settings).expect(403);
  for (const invalid of [
    { delayHours: 0 }, { delayHours: 49 }, { quietStart: '24:01' }, { allowedChannels: ['facebook'] }, { expectedVersion: 0 },
  ]) {
    await update(owner, businessA, { ...settings, ...invalid }).expect(400);
  }
});
