import { randomUUID } from 'node:crypto';
import { SEED } from '@nless/shared/core/fixtures';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createSession, db } from '../../core';
import type { DbExecutor } from '../../core';
import { createTestAgent, loginAs } from '../../core/test-utils';
import { getBusinessSettings } from '../business-settings/service';
import { provisionAccountForUser } from './service';

const businessPath = '/api/v1/businesses';
const ownerA = SEED.users.find(({ alias }) => alias === 'owner_a')!;
const staffA = SEED.users.find(({ alias }) => alias === 'staff_a')!;
const shopA = SEED.businesses.find(({ alias }) => alias === 'biz_demo_a')!;
const shopB = SEED.businesses.find(({ alias }) => alias === 'biz_demo_b')!;
const requestHeader = ['X-Requested-With', 'nless'] as const;
const syntheticUsers: string[] = [];
const extraBusinesses: string[] = [];

type Agent = Awaited<ReturnType<typeof createTestAgent>>;
let owner: Agent;
let staff: Agent;
let client: Agent;

beforeAll(async () => {
  [owner, staff, client] = await Promise.all([createTestAgent(), createTestAgent(), createTestAgent()]);
  await Promise.all([loginAs(owner, ownerA.email), loginAs(staff, staffA.email)]);
});

afterEach(async () => {
  await db.tx(async (tx) => {
    await tx.query(
      'DELETE FROM audit_events WHERE business_id=ANY($1::uuid[]) OR actor_user_id=ANY($2::uuid[])',
      [extraBusinesses, syntheticUsers],
    );
    await tx.query('DELETE FROM businesses WHERE id=ANY($1::uuid[])', [extraBusinesses.splice(0)]);
    await tx.query('DELETE FROM accounts WHERE owner_user_id=ANY($1::uuid[])', [syntheticUsers]);
    await tx.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [syntheticUsers.splice(0)]);
  });
});

async function newUser() {
  const id = randomUUID();
  await db.query('INSERT INTO users(id,email,display_name) VALUES($1,$2,$3)', [id, id + '@example.test', 'Test owner']);
  syntheticUsers.push(id);
  return id;
}

async function sessionCookie(userId: string) {
  let cookie = '';
  const response = { cookie(name: string, value: string) { cookie = name + '=' + value; } };
  await createSession(userId, 'password', response as Parameters<typeof createSession>[2]);
  return cookie;
}

function removeShop(agent: Agent, businessId: string, confirmName: string) {
  return agent.delete(businessPath + '/' + businessId).set(...requestHeader).query({ confirmName });
}

describe('F03 business lifecycle', () => {
  it('lists memberships only and limits creation to the account owner', async () => {
    const [owned, staffed] = await Promise.all([owner.get(businessPath), staff.get(businessPath)]);
    expect(owned.status).toBe(200);
    expect(staffed.status).toBe(200);
    expect(owned.body.data.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ businessId: shopA.id, role: 'owner', isCurrentAccount: true }),
    ]));
    expect(owned.body.data.items.map((row: { businessId: string }) => row.businessId)).not.toContain(shopB.id);
    expect(staffed.body.data.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ businessId: shopA.id, role: 'staff', isCurrentAccount: false }),
    ]));
    expect((await staff.post(businessPath).set(...requestHeader).send({ name: 'Denied shop' })).status).toBe(403);
    const user = await newUser();
    const noAccount = await client.post(businessPath).set(...requestHeader).set('Cookie', await sessionCookie(user))
      .send({ name: 'No account shop' });
    expect(noAccount.status).toBe(422);
    expect(noAccount.body.error.details.reason).toBe('no_account');
  });

  it('creates an owner membership with defaults and soft-deletes only after exact confirmation', async () => {
    const name = 'e2e-tenancy-' + randomUUID();
    const response = await owner.post(businessPath).set(...requestHeader).send({ name, language: 'en' });
    expect(response.status).toBe(201);
    const { businessId } = response.body.data;
    extraBusinesses.push(businessId);
    expect(response.body.data).toEqual({ businessId, name, status: 'active', role: 'owner', isCurrentAccount: true });
    expect(await db.one('SELECT role,status,permissions FROM memberships WHERE business_id=$1 AND user_id=$2',
      [businessId, ownerA.id])).toEqual({ role: 'owner', status: 'active', permissions: [] });
    const settings = await getBusinessSettings(businessId);
    expect(settings).toMatchObject({
      businessId, language: 'en', timezone: 'Asia/Bangkok', aiEnabled: true, answerPolicy: null,
    });
    const hours = [{ open: '09:00', close: '18:00' }];
    expect(settings.hours).toEqual({ mon: hours, tue: hours, wed: hours, thu: hours, fri: hours, sat: hours, sun: [] });
    const mismatch = await removeShop(owner, businessId, ' ' + name);
    expect(mismatch.status).toBe(400);
    expect(mismatch.body.error.details.issues).toEqual([{ path: 'confirmName', code: 'confirm_name_mismatch' }]);
    expect((await removeShop(staff, businessId, name)).status).toBe(404);
    const deleted = await removeShop(owner, businessId, name);
    expect(deleted.status).toBe(204);
    expect(await db.one('SELECT status,version FROM businesses WHERE id=$1', [businessId])).toEqual({ status: 'deleted', version: 2 });
    expect((await owner.get(businessPath + '/' + businessId)).body.error.code).toBe('BUSINESS_INACTIVE');
    expect((await getBusinessSettings(businessId)).aiEnabled).toBe(false);
    const audits = await db.query('SELECT action FROM audit_events WHERE business_id=$1 ORDER BY action', [businessId]);
    expect(audits.rows).toEqual([{ action: 'tenancy.business.create' }, { action: 'tenancy.business.delete' }]);
  });

  it('protects demo shops and serializes deletion of the last active shops', async () => {
    const protectedShop = await removeShop(owner, shopA.id, shopA.name);
    expect(protectedShop.status).toBe(422);
    expect(protectedShop.body.error.details.reason).toBe('seed_business');
    const user = await newUser();
    const first = await provisionAccountForUser(user, { businessName: 'First test business' });
    const cookie = await sessionCookie(user);
    const last = await removeShop(client, first.businessId, 'First test business').set('Cookie', cookie);
    expect(last.status).toBe(422);
    expect(last.body.error.details.reason).toBe('last_business');
    const second = await client.post(businessPath).set(...requestHeader).set('Cookie', cookie)
      .send({ name: 'Second test business' });
    expect(second.status).toBe(201);
    const results = await Promise.all([
      removeShop(client, first.businessId, 'First test business').set('Cookie', cookie),
      removeShop(client, second.body.data.businessId, 'Second test business').set('Cookie', cookie),
    ]);
    expect(results.map(({ status }) => status).sort()).toEqual([204, 422]);
    expect(results.find(({ status }) => status === 422)?.body.error.details.reason).toBe('last_business');
    expect(await db.one("SELECT count(*)::int AS total FROM businesses WHERE account_id=$1 AND status='active'", [first.accountId]))
      .toEqual({ total: 1 });
  });

  it('provisions the first shop idempotently and rejects an existing staff membership', async () => {
    const user = await newUser();
    const results = await Promise.all([
      provisionAccountForUser(user, { businessName: 'First test shop', timezone: 'Europe/London' }),
      provisionAccountForUser(user, { businessName: 'First test shop', timezone: 'Europe/London' }),
    ]);
    expect(results.filter(({ created }) => created)).toHaveLength(1);
    expect(results[0]).toMatchObject({ accountId: results[1].accountId, businessId: results[1].businessId });
    expect(await getBusinessSettings(results[0].businessId)).toMatchObject({ timezone: 'Europe/London', aiEnabled: true });
    await expect(provisionAccountForUser(staffA.id, { businessName: 'Staff provision' }))
      .rejects.toMatchObject({ code: 'POLICY_BLOCKED', details: { reason: 'already_member' } });
  });

  it('rolls account and shop creation back when membership insertion fails on the caller executor', async () => {
    const user = await newUser();
    const businessName = 'rollback-' + user;
    await expect(db.tx((tx) => {
      const executor: DbExecutor = {
        ...tx,
        query(sql, params) {
          if (sql.startsWith('INSERT INTO memberships')) throw new Error('membership write failed');
          return tx.query(sql, params);
        },
      };
      return provisionAccountForUser(user, { businessName }, executor);
    })).rejects.toThrow('membership write failed');
    expect(await db.maybeOne('SELECT id FROM accounts WHERE owner_user_id=$1', [user])).toBeNull();
    expect(await db.maybeOne('SELECT id FROM businesses WHERE name=$1', [businessName])).toBeNull();
  });
});
