import { randomUUID } from 'node:crypto';
import { SEED } from '@nless/shared/core/fixtures';
import { STAFF_DEFAULT_PERMISSIONS } from '@nless/shared/core/permissions';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from '../../core';
import { createTestAgent, loginAs } from '../../core/test-utils';
import type { MemberRow } from '@nless/shared/features/tenancy/types';

const ownerA = SEED.users.find(({ alias }) => alias === 'owner_a')!;
const ownerB = SEED.users.find(({ alias }) => alias === 'owner_b')!;
const staffA = SEED.users.find(({ alias }) => alias === 'staff_a')!;
const admin = SEED.users.find(({ alias }) => alias === 'platform_admin')!;
const pendingCleanup: string[] = [];
const businessPath = (id: string) => '/api/v1/businesses/' + id;
const memberPath = (businessId: string, userId: string) => businessPath(businessId) + '/members/' + userId;

type TestSession = Awaited<ReturnType<typeof createTestAgent>>;
const sessions = new Map<string, Promise<TestSession>>();

function login(email: string): Promise<TestSession> {
  const existing = sessions.get(email);
  if (existing) return existing;

  const signedIn = createTestAgent().then(async (agent) => {
    await loginAs(agent, email);
    return agent;
  });
  sessions.set(email, signedIn);
  return signedIn;
}

async function testBusiness(secondOwner = false, useAccountOwner = true) {
  const accountId = randomUUID();
  const businessId = randomUUID();
  await db.tx(async (tx) => {
    await tx.query('INSERT INTO accounts (id,name,owner_user_id) VALUES ($1,$2,$3)',
      [accountId, 'Tenancy test account', useAccountOwner ? ownerA.id : admin.id]);
    await tx.query('INSERT INTO businesses (id,account_id,name) VALUES ($1,$2,$3)',
      [businessId, accountId, 'Tenancy test business']);
    await tx.query("INSERT INTO memberships (business_id,user_id,role,permissions) VALUES ($1,$2,'owner','{}'),($1,$3,'staff',$4)",
      [businessId, ownerA.id, staffA.id, STAFF_DEFAULT_PERMISSIONS]);
    if (secondOwner) {
      await tx.query("INSERT INTO memberships (business_id,user_id,role) VALUES ($1,$2,'owner')", [businessId, ownerB.id]);
    }
  });
  pendingCleanup.push(accountId);
  return businessId;
}

afterEach(async () => {
  if (pendingCleanup.length) {
    await db.query('DELETE FROM accounts WHERE id=ANY($1::uuid[])', [pendingCleanup.splice(0)]);
  }
});

describe('F03 membership routes', () => {
  it('updates staff permissions and makes /me report exactly the saved permissions', async () => {
    const businessId = await testBusiness();
    const [owner, staff] = await Promise.all([login(ownerA.email), login(staffA.email)]);
    const members = (await owner.get(businessPath(businessId) + '/members'));
    expect(members.status).toBe(200);
    expect(members.body.data.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ userId: ownerA.id, isSelf: true, isAccountOwner: true, role: 'owner' }),
      expect.objectContaining({ userId: staffA.id, isSelf: false, permissions: STAFF_DEFAULT_PERMISSIONS }),
    ]));

    const updated = await owner.put(memberPath(businessId, staffA.id) + '/permissions')
      .set('X-Requested-With', 'nless').send({ permissions: ['business.read', 'chat.reply', 'chat.reply'] });
    expect(updated.status).toBe(200);
    expect(updated.body.data.permissions).toEqual(['chat.reply', 'business.read']);
    const me = await staff.get('/api/v1/me');
    const shop = me.body.data.businesses.find((row: { business: { id: string } }) => row.business.id === businessId);
    expect(shop.permissions).toEqual(updated.body.data.permissions);

    const audits = await db.query('SELECT details FROM audit_events WHERE business_id=$1 AND action=$2',
      [businessId, 'tenancy.member.permissions']);
    expect(audits.rows).toEqual([{
      details: { userId: staffA.id, before: STAFF_DEFAULT_PERMISSIONS, after: ['chat.reply', 'business.read'] },
    }]);
  });

  it('rejects owner-only and unknown grants, and a staff caller cannot view members', async () => {
    const businessId = await testBusiness();
    const [owner, staff] = await Promise.all([login(ownerA.email), login(staffA.email)]);
    const updated = await owner.put(memberPath(businessId, staffA.id) + '/permissions')
      .set('X-Requested-With', 'nless').send({ permissions: ['account.members', 'unknown.permission'] });
    expect(updated.status).toBe(400);
    expect(updated.body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: { issues: [
        { path: 'permissions', code: 'unknown_permission', keys: ['unknown.permission'] },
        { path: 'permissions', code: 'forbidden_permission', keys: ['account.members'] },
      ] },
    });
    const denied = await staff.get(businessPath(businessId) + '/members');
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('PERMISSION_DENIED');
  });

  it('revokes permission for the very next request on the same session and restores the original grants', async () => {
    const businessId = await testBusiness();
    const [owner, staff] = await Promise.all([login(ownerA.email), login(staffA.email)]);
    const path = memberPath(businessId, staffA.id);
    expect((await staff.get(businessPath(businessId) + '/settings')).status).toBe(200);
    const revoked = await owner.post(path + '/revoke').set('X-Requested-With', 'nless');
    expect(revoked.status).toBe(200);
    expect(revoked.body.data.status).toBe('revoked');
    const denied = await staff.get(businessPath(businessId) + '/settings');
    expect(denied.status).toBe(404);
    const me = await staff.get('/api/v1/me');
    expect(me.body.data.businesses.map((row: { business: { id: string } }) => row.business.id)).not.toContain(businessId);
    const restored = await owner.post(path + '/restore').set('X-Requested-With', 'nless');
    expect(restored.status).toBe(200);
    expect(restored.body.data).toMatchObject({ status: 'active', permissions: STAFF_DEFAULT_PERMISSIONS });
    expect((await staff.get(businessPath(businessId) + '/settings')).status).toBe(200);
  });

  it('protects self and the account owner, then promotes and demotes another member', async () => {
    const businessId = await testBusiness(true);
    const [owner, second] = await Promise.all([login(ownerA.email), login(ownerB.email)]);
    const ownPath = memberPath(businessId, ownerA.id);
    const revoke = await owner.post(ownPath + '/revoke').set('X-Requested-With', 'nless');
    expect(revoke.status).toBe(422);
    expect(revoke.body.error.details.reason).toBe('self_change');
    const selfDemotion = await owner.put(ownPath + '/role').set('X-Requested-With', 'nless').send({ role: 'staff' });
    expect(selfDemotion.status).toBe(422);
    expect(selfDemotion.body.error.details.reason).toBe('self_change');
    const ownerDemotion = await second.put(ownPath + '/role').set('X-Requested-With', 'nless').send({ role: 'staff' });
    expect(ownerDemotion.status).toBe(422);
    expect(ownerDemotion.body.error.details.reason).toBe('account_owner');

    const secondPath = memberPath(businessId, ownerB.id);
    const demoted = await owner.put(secondPath + '/role').set('X-Requested-With', 'nless').send({ role: 'staff' });
    expect(demoted.status).toBe(200);
    expect(demoted.body.data).toMatchObject({ role: 'staff', permissions: STAFF_DEFAULT_PERMISSIONS });
    const promoted = await owner.put(secondPath + '/role').set('X-Requested-With', 'nless').send({ role: 'owner' });
    expect(promoted.status).toBe(200);
    expect(promoted.body.data).toMatchObject({ role: 'owner', permissions: expect.arrayContaining(['account.members']) });
    const stored = await db.one<{ permissions: string[] }>('SELECT permissions FROM memberships WHERE business_id=$1 AND user_id=$2',
      [businessId, ownerB.id]);
    expect(stored.permissions).toEqual([]);
  });

  it('keeps one active owner when two owners concurrently revoke each other', async () => {
    const businessId = await testBusiness(true, false);
    const [first, second] = await Promise.all([login(ownerA.email), login(ownerB.email)]);
    const replies = await Promise.all([
      first.post(memberPath(businessId, ownerB.id) + '/revoke').set('X-Requested-With', 'nless'),
      second.post(memberPath(businessId, ownerA.id) + '/revoke').set('X-Requested-With', 'nless'),
    ]);
    expect(replies.map(({ status }) => status).filter((status) => status === 200)).toHaveLength(1);
    expect(replies.find(({ status }) => status !== 200)?.status).toBeOneOf([404, 422]);
    const ownerCount = await db.one<{ count: number }>(
      "SELECT count(*)::int AS count FROM memberships WHERE business_id=$1 AND role='owner' AND status='active'", [businessId],
    );
    expect(ownerCount.count).toBe(1);
    const changedMember = replies.find(({ status }) => status === 200)!.body.data as MemberRow;
    expect(changedMember.status).toBe('revoked');
  });

  it('keeps staff in the tenant with empty grants and denies routes that need a permission', async () => {
    const businessId = await testBusiness();
    const [owner, staff] = await Promise.all([login(ownerA.email), login(staffA.email)]);
    const updated = await owner.put(memberPath(businessId, staffA.id) + '/permissions')
      .set('X-Requested-With', 'nless').send({ permissions: [] });
    expect(updated.status).toBe(200);
    expect(updated.body.data.permissions).toEqual([]);
    expect((await staff.get(businessPath(businessId))).status).toBe(200);
    const denied = await staff.get(businessPath(businessId) + '/settings');
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('PERMISSION_DENIED');
    const me = await staff.get('/api/v1/me');
    const shop = me.body.data.businesses.find((row: { business: { id: string } }) => row.business.id === businessId);
    expect(shop.permissions).toEqual([]);
  });

  it('serializes concurrent demotions so only one active owner loses their role', async () => {
    const businessId = await testBusiness(true, false);
    const [first, second] = await Promise.all([login(ownerA.email), login(ownerB.email)]);
    const replies = await Promise.all([
      first.put(memberPath(businessId, ownerB.id) + '/role').set('X-Requested-With', 'nless').send({ role: 'staff' }),
      second.put(memberPath(businessId, ownerA.id) + '/role').set('X-Requested-With', 'nless').send({ role: 'staff' }),
    ]);
    expect(replies.filter(({ status }) => status === 200)).toHaveLength(1);
    expect(replies.find(({ status }) => status !== 200)?.status).toBeOneOf([403, 422]);
    const roles = await db.query<{ role: string }>(
      "SELECT role FROM memberships WHERE business_id=$1 AND user_id=ANY($2::uuid[]) AND status='active' ORDER BY role",
      [businessId, [ownerA.id, ownerB.id]],
    );
    expect(roles.rows).toEqual([{ role: 'owner' }, { role: 'staff' }]);
  });
});
