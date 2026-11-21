import { randomUUID } from 'node:crypto';
import { SEED } from '@nless/shared/core/fixtures';
import type { InvitationCreated } from '@nless/shared/features/tenancy/types';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { config, createSession, db } from '../../core';
import { createTestAgent, loginAs } from '../../core/test-utils';
import { acceptInvitation, completeInvitationAcceptance } from './service';
import { hashInvitationToken } from './tokens';

const ownerA = SEED.users.find((user) => user.alias === 'owner_a')!;
const ownerB = SEED.users.find((user) => user.alias === 'owner_b')!;
const staffA = SEED.users.find((user) => user.alias === 'staff_a')!;
const requestHeader = ['X-Requested-With', 'nless'] as const;
const publicPath = '/api/v1/invitations';
const invitationsPath = (id: string) => '/api/v1/businesses/' + id + '/invitations';
const tokenOf = (invitation: InvitationCreated) => new URL(invitation.link).searchParams.get('token')!;
const reason = (status: string) => ({ details: { reason: status } });
type Agent = Awaited<ReturnType<typeof createTestAgent>>;
const businessIds: string[] = [];
const accountIds: string[] = [];
const userIds: string[] = [];

let owner: Agent;
let otherOwner: Agent;
let staff: Agent;
let anonymous: Agent;

beforeAll(async () => {
  [owner, otherOwner, staff, anonymous] = await Promise.all([
    createTestAgent(), createTestAgent(), createTestAgent(), createTestAgent(),
  ]);
  await Promise.all([loginAs(owner, ownerA.email), loginAs(otherOwner, ownerB.email), loginAs(staff, staffA.email)]);
});

afterEach(async () => {
  await db.tx(async (tx) => {
    await tx.query('DELETE FROM audit_events WHERE business_id=ANY($1::uuid[]) OR actor_user_id=ANY($2::uuid[])',
      [businessIds.splice(0), userIds]);
    await tx.query('DELETE FROM accounts WHERE id=ANY($1::uuid[])', [accountIds.splice(0)]);
    await tx.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [userIds.splice(0)]);
  });
});

async function shop(accountOwner = ownerA.id) {
  const accountId = randomUUID();
  const id = randomUUID();
  await db.tx(async (tx) => {
    await tx.query('INSERT INTO accounts(id,name,owner_user_id) VALUES($1,$2,$3)', [accountId, 'Invitation test account', accountOwner]);
    await tx.query('INSERT INTO businesses(id,account_id,name) VALUES($1,$2,$3)', [id, accountId, 'Invitation test shop']);
    await tx.query("INSERT INTO memberships(business_id,user_id,role) VALUES($1,$2,'owner')", [id, accountOwner]);
  });
  accountIds.push(accountId);
  businessIds.push(id);
  return { id, accountId, path: invitationsPath(id) };
}

async function recipient() {
  const id = randomUUID();
  const email = 'invite-' + id + '@example.test';
  await db.query('INSERT INTO users(id,email,display_name) VALUES($1,$2,$3)', [id, email, 'Invitation test recipient']);
  userIds.push(id);
  let cookie = '';
  // The dev login endpoint accepts only the built-in seed identities.
  const response = { cookie(name: string, value: string) { cookie = name + '=' + value; } };
  await createSession(id, 'password', response as Parameters<typeof createSession>[2]);
  return { id, email, cookie };
}

async function create(path: string, email: string, sender = owner, permissions = ['chat.read', 'orders.read']) {
  const response = await sender.post(path).set(...requestHeader).send({ email, permissions });
  expect(response.status).toBe(201);
  return response.body.data as InvitationCreated;
}

function preview(token: string) {
  return anonymous.get(publicPath + '/preview').set(...requestHeader).query({ token });
}

function accept(token: string, cookie: string) {
  return anonymous.post(publicPath + '/accept').set(...requestHeader).set('Cookie', cookie).send({ token });
}

function revoke(path: string, id: string) {
  return owner.post(path + '/' + id + '/revoke').set(...requestHeader);
}

async function stored(id: string) {
  return db.one<{ status: string; token_hash: string; expires_at: Date; accepted_by: string | null }>(
    'SELECT status,token_hash,expires_at,accepted_by FROM invitations WHERE id=$1', [id],
  );
}

describe('F03 invitation routes', { timeout: 20_000 }, () => {
  it('normalizes the email, stores only the digest, masks preview data and rotates an expired link', async () => {
    const { path } = await shop();
    const email = 'abcd@example.test';
    const created = await create(path, ' AbCd@example.test ');
    const token = tokenOf(created);
    const row = await stored(created.invitation.id);
    expect(created.delivery).toBe('email_sandbox');
    expect(created.invitation.email).toBe(email);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(row.token_hash).toBe(hashInvitationToken(token));
    expect(await db.maybeOne('SELECT id FROM invitations WHERE token_hash=$1', [token])).toBeNull();
    expect(Math.abs(row.expires_at.getTime() - Date.now() - config.INVITATION_TTL_HOURS * 3_600_000)).toBeLessThan(10_000);
    const duplicate = await owner.post(path).set(...requestHeader).send({ email });
    expect(duplicate.status).toBe(422);
    expect(duplicate.body.error).toMatchObject(reason('already_invited'));
    const shown = await preview(token);
    expect(shown.status).toBe(200);
    expect(shown.headers['cache-control']).toBe('no-store');
    expect(shown.body.data).toEqual({
      businessName: 'Invitation test shop', emailMasked: 'ab**@example.test',
      role: 'staff', expiresAt: row.expires_at.toISOString(), permissionsCount: 2,
    });
    await db.query("UPDATE invitations SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [created.invitation.id]);
    expect((await owner.get(path + '?status=pending')).body.data.items).toEqual([]);
    expect((await owner.get(path + '?status=expired')).body.data.items).toEqual([
      expect.objectContaining({ id: created.invitation.id, status: 'expired' }),
    ]);
    const rotated = await owner.post(path + '/' + created.invitation.id + '/resend').set(...requestHeader);
    expect(rotated.status).toBe(200);
    expect(rotated.body.data.delivery).toBe('email_sandbox');
    expect(rotated.body.data.invitation.id).toBe(created.invitation.id);
    expect((await preview(token)).status).toBe(404);
    expect((await preview(tokenOf(rotated.body.data))).status).toBe(200);
    expect((await preview('invalid')).body.error).toEqual((await preview(token)).body.error);
    await db.query("UPDATE invitations SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [created.invitation.id]);
    const replacement = await create(path, email);
    expect(replacement.invitation.id).not.toBe(created.invitation.id);
    expect((await stored(created.invitation.id)).status).toBe('revoked');
  });

  it('blocks staff, forbidden grants and foreign invitation IDs', async () => {
    const [first, second] = await Promise.all([shop(), shop(ownerB.id)]);
    await db.query("INSERT INTO memberships(business_id,user_id,role) VALUES($1,$2,'staff')", [first.id, staffA.id]);
    const invitation = await create(second.path, 'foreign@example.test', otherOwner);
    const foreign = invitation.invitation.id;
    expect((await staff.get(first.path)).status).toBe(403);
    expect((await staff.post(first.path).set(...requestHeader).send({ email: 'new@example.test' })).status).toBe(403);
    expect((await owner.get(second.path)).status).toBe(404);
    expect((await revoke(first.path, foreign)).status).toBe(404);
    expect((await owner.post(first.path + '/' + foreign + '/resend').set(...requestHeader)).status).toBe(404);
    expect((await owner.post(first.path).set(...requestHeader)
      .send({ email: 'invalid-grant@example.test', permissions: ['account.members'] })).status).toBe(400);
    expect((await stored(foreign)).status).toBe('pending');
  });

  it('rejects the wrong user, then grants exact staff rights once under concurrent acceptance', async () => {
    const { id, path } = await shop();
    const [invitee, wrong] = await Promise.all([recipient(), recipient()]);
    const created = await create(path, invitee.email);
    const token = tokenOf(created);
    const wrongEmail = await accept(token, wrong.cookie);
    expect(wrongEmail.status).toBe(403);
    expect(wrongEmail.body.error).toMatchObject(reason('email_mismatch'));
    expect((await stored(created.invitation.id)).status).toBe('pending');
    const results = await Promise.all([accept(token, invitee.cookie), accept(token, invitee.cookie)]);
    expect(results.map(({ status }) => status).sort()).toEqual([200, 422]);
    expect(results.find(({ status }) => status === 200)?.body.data).toEqual({ businessId: id });
    expect(results.find(({ status }) => status === 422)?.body.error).toMatchObject(reason('accepted'));
    expect(await db.one('SELECT role,status,permissions FROM memberships WHERE business_id=$1 AND user_id=$2', [id, invitee.id]))
      .toEqual({ role: 'staff', status: 'active', permissions: ['chat.read', 'orders.read'] });
    const cancel = await revoke(path, created.invitation.id);
    expect(cancel.status).toBe(422);
    expect(cancel.body.error).toMatchObject(reason('already_accepted'));
    expect(await db.one('SELECT details FROM audit_events WHERE business_id=$1 AND action=$2', [id, 'tenancy.invitation.accept']))
      .toEqual({ details: { invitationId: created.invitation.id, businessId: id, userId: invitee.id } });
  });

  it('keeps expired links unusable and blocks inactive shops and other-account owners', async () => {
    const { id, path } = await shop();
    const invitee = await recipient();
    const created = await create(path, invitee.email);
    const token = tokenOf(created);
    await db.query("UPDATE businesses SET status='suspended' WHERE id=$1", [id]);
    expect((await accept(token, invitee.cookie)).body.error.code).toBe('BUSINESS_INACTIVE');
    await db.query("UPDATE businesses SET status='active' WHERE id=$1", [id]);
    await shop(invitee.id);
    const other = await accept(token, invitee.cookie);
    expect(other.status).toBe(422);
    expect(other.body.error).toMatchObject(reason('user_in_other_account'));
    await db.query("UPDATE invitations SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [created.invitation.id]);
    const expired = await accept(token, invitee.cookie);
    expect(expired.status).toBe(422);
    expect(expired.body.error).toMatchObject(reason('expired'));
  });

  it('preserves an active membership and restores a revoked one with only invited permissions', async () => {
    const { id, path } = await shop();
    const invitee = await recipient();
    const token = tokenOf(await create(path, invitee.email, owner, ['orders.read']));
    await db.query("INSERT INTO memberships(business_id,user_id,role,permissions) VALUES($1,$2,'staff',ARRAY['chat.read'])",
      [id, invitee.id]);
    const active = await accept(token, invitee.cookie);
    expect(active.status).toBe(422);
    expect(active.body.error).toMatchObject(reason('already_member'));
    expect(await db.one('SELECT permissions FROM memberships WHERE business_id=$1 AND user_id=$2', [id, invitee.id]))
      .toEqual({ permissions: ['chat.read'] });
    await db.query("UPDATE memberships SET status='revoked' WHERE business_id=$1 AND user_id=$2", [id, invitee.id]);
    expect((await accept(token, invitee.cookie)).status).toBe(200);
    expect(await db.one('SELECT role,status,permissions FROM memberships WHERE business_id=$1 AND user_id=$2', [id, invitee.id]))
      .toEqual({ role: 'staff', status: 'active', permissions: ['orders.read'] });
  });

  it('serializes concurrent acceptance across accounts and revokes the competing invitation', async () => {
    const [first, second, invitee] = await Promise.all([shop(), shop(ownerB.id), recipient()]);
    const invitations = await Promise.all([create(first.path, invitee.email), create(second.path, invitee.email, otherOwner)]);
    const responses = await Promise.all(invitations.map((invitation) => accept(tokenOf(invitation), invitee.cookie)));
    expect(responses.map(({ status }) => status).sort()).toEqual([200, 422]);
    expect(responses.find(({ status }) => status === 422)?.body.error).toMatchObject(reason('revoked'));
    const states = await Promise.all(invitations.map((entry) => stored(entry.invitation.id)));
    expect(states.map(({ status }) => status).sort()).toEqual(['accepted', 'revoked']);
  });

  it('rolls acceptance back with the F02 transaction and completes the audit after commit', async () => {
    const { id, path } = await shop();
    const invitee = await recipient();
    const invitation = await create(path, invitee.email);
    const token = tokenOf(invitation);
    await expect(db.tx(async (tx) => {
      await acceptInvitation(invitee.id, token, tx);
      throw new Error('signup rollback');
    })).rejects.toThrow('signup rollback');
    expect((await stored(invitation.invitation.id)).status).toBe('pending');
    expect(await db.maybeOne('SELECT role FROM memberships WHERE business_id=$1 AND user_id=$2', [id, invitee.id])).toBeNull();
    await db.tx((tx) => acceptInvitation(invitee.id, token, tx));
    await completeInvitationAcceptance(invitee.id, token);
    expect((await stored(invitation.invitation.id)).accepted_by).toBe(invitee.id);
    expect(await db.one('SELECT action FROM audit_events WHERE business_id=$1 AND action=$2', [id, 'tenancy.invitation.accept']))
      .toEqual({ action: 'tenancy.invitation.accept' });
  });

  it('revokes idempotently and lets an anonymous invitee decline', async () => {
    const { path } = await shop();
    const invitee = await recipient();
    const cancelled = await create(path, invitee.email);
    const id = cancelled.invitation.id;
    expect((await revoke(path, id)).status).toBe(200);
    expect((await revoke(path, id)).status).toBe(200);
    expect((await accept(tokenOf(cancelled), invitee.cookie)).body.error).toMatchObject(reason('revoked'));
    const invitation = await create(path, invitee.email);
    const token = tokenOf(invitation);
    expect((await anonymous.post(publicPath + '/decline').send({ token })).status).toBe(403);
    const response = await anonymous.post(publicPath + '/decline').set(...requestHeader).send({ token });
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ ok: true });
    expect((await preview(token)).body.error).toMatchObject(reason('declined'));
  });

  it('limits owner sends and anonymous previews', async () => {
    const { path } = await shop();
    const invitation = await create(path, 'rate-limit@example.test');
    // Rotations and creation consume the same per-business bucket.
    for (let index = 0; index < 29; index++) {
      const response = await owner.post(path + '/' + invitation.invitation.id + '/resend').set(...requestHeader);
      expect(response.status).toBe(200);
    }
    const limited = await owner.post(path).set(...requestHeader).send({ email: 'limited@example.test' });
    expect(limited.status).toBe(429);
    const later = Date.now() + 120_000;
    const clock = vi.spyOn(Date, 'now').mockReturnValue(later);
    try {
      for (let index = 0; index < 30; index++) expect((await preview('invalid')).status).toBe(404);
      expect((await preview('invalid')).status).toBe(429);
    } finally {
      clock.mockRestore();
    }
  }, 45_000);
});
