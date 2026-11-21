import { randomUUID } from 'node:crypto';
import type { NotifyInput } from '@nless/shared/features/notifications/types';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { db } from '../../core';
import vectors from './fixtures/consent-delivery.json';
import { enqueueNotificationPush } from './push/delivery';
import { hasNotificationReceipt, notify } from './service';

vi.mock('./push/delivery', () => ({ enqueueNotificationPush: vi.fn() }));

const users = new Map(vectors.memberships.map((member) => [member.userId, member]));
const shops = [...new Set(vectors.memberships.map(({ businessId }) => businessId))];
const shopAccounts = new Map(shops.map((businessId) => [businessId, randomUUID()]));

beforeAll(async () => {
  await db.tx(async (tx) => {
    for (const { userId, userStatus, devicePushEnabled } of users.values()) {
      await tx.query('INSERT INTO users (id,email,display_name,status) VALUES ($1,$2,$3,$4)',
        [userId, userId + '@notifications.example.test', 'Synthetic notification recipient', userStatus]);
      await tx.query("INSERT INTO push_subscriptions (user_id,endpoint,p256dh_enc,auth_enc) VALUES ($1,$2,'synthetic','synthetic')",
        [userId, 'https://web.push.apple.com/mock/' + userId]);
      if (!devicePushEnabled) {
        await tx.query("INSERT INTO notification_preferences (user_id,type,in_app,push) VALUES ($1,'system',true,false),($1,'chat.handoff',true,false)", [userId]);
      }
    }
    for (const [businessId, accountId] of shopAccounts) {
      const ownerId = vectors.memberships.find((member) => member.businessId === businessId && member.role === 'owner')!.userId;
      await tx.query('INSERT INTO accounts (id,name,owner_user_id) VALUES ($1,$2,$3)', [accountId, 'Synthetic case account', ownerId]);
      await tx.query('INSERT INTO businesses (id,account_id,name) VALUES ($1,$2,$3)', [businessId, accountId, 'Synthetic case shop']);
    }
    for (const member of vectors.memberships) {
      await tx.query('INSERT INTO memberships (business_id,user_id,role,permissions,status) VALUES ($1,$2,$3,$4,$5)',
        [member.businessId, member.userId, member.role, member.staffPermissions, member.membershipStatus]);
    }
  });
}, 20000);

afterAll(async () => {
  await db.query('DELETE FROM accounts WHERE id = ANY($1::uuid[])', [[...shopAccounts.values()]]);
  await db.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[...users.keys()]]);
});

test('stores authorized consent receipts and private owner questions once across the 28 case vectors', async () => {
  const prior = new Map<string, NotifyInput>();
  const mockedEnqueue = vi.mocked(enqueueNotificationPush);
  for (const vector of vectors.cases) {
    mockedEnqueue.mockClear();
    if (vector.replayKey) {
      const existing = prior.get(vector.replayKey);
      if (!existing) throw new Error('Missing fixture receipt for ' + vector.id);
      expect(await notify(existing), vector.id).toMatchObject({ notificationIds: [] });
      expect(mockedEnqueue, vector.id).not.toHaveBeenCalled();
    }
    if (!vector.receipt) continue;

    const { notificationType, selector, key, link } = vector.receipt;
    const input: NotifyInput = {
      businessId: vector.businessId,
      type: notificationType === 'system' ? 'system' : 'chat.handoff',
      to: selector === 'owners' ? { role: 'owners' } : { permission: 'chat.takeover' },
      dedupKey: selector === 'owners' ? key : 'staff-offer-accepted:' + vector.businessId + ':' + key.slice('handoff:'.length),
      link,
      title: 'Synthetic notification',
    };
    if (prior.has(key)) {
      // Two independent confirmations in the vectors intentionally share one conversation/version.
      await db.query('DELETE FROM notifications WHERE business_id = $1 AND dedup_key = $2', [vector.businessId, key]);
    }
    prior.set(key, input);
    const results = await Promise.all([notify(input), notify(input)]);
    expect(results.flatMap(({ notificationIds }) => notificationIds), vector.id).toHaveLength(vector.bellUserIds.length);
    const stored = await db.query<{ id: string; userId: string; link: string }>(
      'SELECT id, user_id AS "userId", link FROM notifications WHERE business_id = $1 AND dedup_key = $2 ORDER BY user_id',
      [vector.businessId, key],
    );
    expect(stored.rows.map(({ userId }) => userId), vector.id).toEqual([...vector.bellUserIds].sort());
    expect(stored.rows.every((row) => row.link === link), vector.id).toBe(true);
    const byId = new Map(stored.rows.map(({ id, userId }) => [id, userId]));
    expect(mockedEnqueue.mock.calls.map(([id, businessId]) => {
      expect(businessId).toBe(vector.businessId);
      return byId.get(id);
    }).sort(), vector.id).toEqual([...vector.pushUserIds].sort());
    expect(await hasNotificationReceipt({ businessId: vector.businessId, dedupKey: key })).toBe(true);
    const otherShop = shops.find((id) => id !== vector.businessId)!;
    expect(await hasNotificationReceipt({ businessId: otherShop, dedupKey: key })).toBe(false);
  }
  const summary = await db.query<{ count: number; type: string }>(
    'SELECT count(*)::int AS count, type FROM notifications WHERE business_id = ANY($1::uuid[]) GROUP BY type ORDER BY type',
    [shops],
  );
  expect(vectors.cases.filter(({ receipt }) => !receipt)).toHaveLength(21);
  expect(summary.rows).toEqual([{ type: 'chat.handoff', count: 11 }, { type: 'system', count: 10 }]);
}, 20000);
