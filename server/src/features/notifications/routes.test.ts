import { randomUUID } from 'node:crypto';
import { SEED } from '@nless/shared/core/fixtures';
import type { NotificationFeed } from '@nless/shared/features/notifications/types';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { db } from '../../core';
import { createTestAgent, loginAs } from '../../core/test-utils';
import { notify } from './service';

const owner = SEED.users.find(({ alias }) => alias === 'owner_a')!;
const staff = SEED.users.find(({ alias }) => alias === 'staff_a')!;
const other = SEED.users.find(({ alias }) => alias === 'owner_b')!;
const shopA = randomUUID();
const shopB = randomUUID();
const accountId = randomUUID();
const path = (businessId: string) => '/api/v1/businesses/' + businessId + '/notifications';
const header = ['X-Requested-With', 'nless'] as const;

let ownerAgent: Awaited<ReturnType<typeof createTestAgent>>;
let staffAgent: Awaited<ReturnType<typeof createTestAgent>>;

beforeAll(async () => {
  await db.tx(async (tx) => {
    await tx.query("INSERT INTO accounts (id,name,owner_user_id) VALUES ($1,'Notifications test account',$2)", [accountId, owner.id]);
    await tx.query("INSERT INTO businesses (id,account_id,name,language) VALUES ($1,$3,'Shop a','en'),($2,$3,'Shop b','th')",
      [shopA, shopB, accountId]);
    await tx.query("INSERT INTO memberships (business_id,user_id,role,permissions) VALUES "
      + "($1,$3,'owner','{}'),($2,$3,'owner','{}'),($1,$4,'staff',ARRAY['chat.read','chat.takeover','business.read'])",
      [shopA, shopB, owner.id, staff.id]);
  });
  ownerAgent = await createTestAgent();
  staffAgent = await createTestAgent();
  await loginAs(ownerAgent, owner.email);
  await loginAs(staffAgent, staff.email);
});

beforeEach(async () => {
  await db.query('DELETE FROM notifications WHERE business_id = ANY($1::uuid[])', [[shopA, shopB]]);
});

afterAll(async () => { await db.query('DELETE FROM accounts WHERE id = $1', [accountId]); });

test('real store deduplicates concurrent writes and scopes feed and read mutations to tenant and recipient', async () => {
  const [ownerCount, staffCount] = await Promise.all([
    ownerAgent.get(path(shopA) + '/unread-count').expect(200),
    staffAgent.get(path(shopA) + '/unread-count').expect(200),
  ]);
  const ownerElsewhere: number = ownerCount.body.data.elsewhere;
  const staffElsewhere: number = staffCount.body.data.elsewhere;
  const input = {
    businessId: shopA, type: 'chat.handoff', title: 'Staff requested',
    to: { userIds: [owner.id, staff.id, other.id] }, dedupKey: 'handoff:' + shopA,
  } as const;
  const first = await Promise.all([1, 2].map(() => notify({ ...input, to: { userIds: [...input.to.userIds] } })));
  expect(first.flatMap(({ notificationIds }) => notificationIds)).toHaveLength(2);
  await notify({ ...input, businessId: shopB, to: { role: 'owners' }, dedupKey: 'handoff:' + shopB });

  const { body: { data: mine } } = await ownerAgent.get(path(shopA)).expect(200);
  const { body: { data: theirs } } = await staffAgent.get(path(shopA)).expect(200);
  expect(mine).toMatchObject({ unreadCount: 1, unreadElsewhere: ownerElsewhere + 1, items: [{ read: false }] });
  expect(theirs).toMatchObject({ unreadCount: 1, unreadElsewhere: staffElsewhere, items: [{ read: false }] });
  expect(theirs.items[0].id).not.toEqual(mine.items[0].id);
  await staffAgent.get(path(shopB)).expect(404);
  const crossRead = await staffAgent.post(path(shopA) + '/read').set(...header).send({ ids: [mine.items[0].id] });
  expect(crossRead.body.data).toEqual({ updated: 0 });

  await db.query("UPDATE memberships SET permissions = ARRAY['chat.takeover','business.read'] WHERE business_id = $1 AND user_id = $2",
    [shopA, staff.id]);
  const revokedGrant = await staffAgent.get(path(shopA)).expect(200);
  expect(revokedGrant.body.data).toMatchObject({ items: [], unreadCount: 0 });
  const marked = await ownerAgent.post(path(shopA) + '/read').set(...header).send({ all: true }).expect(200);
  expect(marked.body.data).toEqual({ updated: 1 });
  const retry = await ownerAgent.post(path(shopA) + '/read').set(...header).send({ all: true }).expect(200);
  expect(retry.body.data).toEqual({ updated: 0 });
  const readBack = await ownerAgent.get(path(shopA)).expect(200);
  expect(readBack.body.data).toMatchObject({ unreadCount: 0, unreadElsewhere: ownerElsewhere + 1, items: [{ read: true }] });
});

test('uses a stable cursor for rows with the same timestamp and only sends tests to the caller', async () => {
  const created = await ownerAgent.post(path(shopA) + '/test').set(...header).send({}).expect(200);
  expect(created.body.data.notificationId).toEqual(expect.any(String));
  const staffRead = await staffAgent.get(path(shopA)).expect(200);
  expect(staffRead.body.data.items.some((item: { id: string }) => item.id === created.body.data.notificationId)).toBe(false);
  await db.query(
    "INSERT INTO notifications(business_id,user_id,type,title,created_at) SELECT $1,$2,'system','Cursor case',now() FROM generate_series(1,5)",
    [shopA, owner.id],
  );
  const ids: string[] = [];
  let cursor: string | null = null;
  do {
    const response = await ownerAgent.get(path(shopA)).query({ unread: 'true', limit: 2, ...(cursor ? { cursor } : {}) }).expect(200);
    const feed: NotificationFeed = response.body.data;
    ids.push(...feed.items.map(({ id }) => id));
    cursor = feed.nextCursor;
    expect(ids.length).toBeLessThan(8);
  } while (cursor);
  expect(ids).toHaveLength(6);
  expect(new Set(ids).size).toBe(6);
  await ownerAgent.get(path(shopA)).query({ cursor: 'bad_cursor' }).expect(400);
});


test('stores preferences only for the caller and honors their in-app opt-out', async () => {
  const prefix = '/api/v1/notification-preferences';
  const report = { type: 'report', inApp: false, push: true };
  try {
    const updated = await ownerAgent.put(prefix).set(...header).send({ items: [report] }).expect(200);
    expect(updated.body.data.items).toContainEqual({ ...report, forcedInApp: false });
    const other = await staffAgent.get(prefix).expect(200);
    expect(other.body.data.items).toContainEqual({ type: 'report', inApp: true, push: false, forcedInApp: false });
    await ownerAgent.put(prefix).set(...header).send({ items: [{ ...report, type: 'system' }] }).expect(400);
    const result = await notify({ businessId: shopA, to: { role: 'owners' }, type: 'report', title: 'Muted report' });
    expect(result.notificationIds).toEqual([]);
  } finally {
    await db.query("DELETE FROM notification_preferences WHERE user_id = $1 AND type = 'report'", [owner.id]);
  }
});
