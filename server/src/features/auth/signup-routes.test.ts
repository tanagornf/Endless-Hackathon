import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config, db } from '../../core';
import { createApp } from '../../core/app';
import { createSignupAccount } from './signup';

const password = '12345678';
const emails: string[] = [];
let nextIp = 1;
let app: Express;

function newEmail() {
  const email = 'f02-s2-' + randomUUID() + '@example.test';
  emails.push(email);
  return email;
}

function post(path: string) {
  return request(app).post(path).set('X-Requested-With', 'nless').set('X-Forwarded-For', '192.0.2.' + nextIp++);
}

function signup(email: string, extra: Record<string, unknown> = {}) {
  return post('/api/v1/auth/signup').send({ email, password, displayName: 'Auth S2 Test', businessName: 'Auth Test Shop', locale: 'en', ...extra });
}

function getCookie(response: request.Response) {
  const entry = ([] as string[]).concat(response.headers['set-cookie'] ?? [])
    .findLast((value) => value.startsWith('nless_session=') && !value.startsWith('nless_session=;'));
  if (!entry) throw new Error('Expected a signup session cookie');
  return entry.split(';')[0];
}

async function noUser(email: string) {
  expect(await db.maybeOne('SELECT id FROM users WHERE email_normalized = $1', [email])).toBeNull();
}

describe('auth signup routes', () => {
  beforeAll(async () => {
    app = await createApp();
    app.set('trust proxy', 1);
  }, 30000);

  afterAll(async () => {
    await db.tx(async (tx) => {
      await tx.query('DELETE FROM email_outbox WHERE to_email_normalized = ANY($1::text[])', [emails]);
      await tx.query('DELETE FROM accounts WHERE owner_user_id IN (SELECT id FROM users WHERE email_normalized = ANY($1::text[]))', [emails]);
      await tx.query('DELETE FROM users WHERE email_normalized = ANY($1::text[])', [emails]);
    });
  }, 30000);

  it('creates one owner account and signs in with an eight-character password without verification mail', async () => {
    const email = newEmail();
    const registered = await signup(' ' + email.toUpperCase() + ' ');
    expect(registered.status).toBe(201);
    expect(registered.body.data).toMatchObject({ emailVerified: false, next: '/' });
    expect(registered.headers['set-cookie'][0]).toMatch(/; HttpOnly;/i);

    const cookie = getCookie(registered);
    const me = await request(app).get('/api/v1/me').set('Cookie', cookie);
    expect(me.body.data.user.sessionKind).toBe('password');
    expect(me.body.data.businesses).toHaveLength(1);
    expect(me.body.data.businesses[0]).toMatchObject({ role: 'owner', business: { name: 'Auth Test Shop', language: 'en' } });
    const businessId = me.body.data.businesses[0].business.id;
    const settings = await request(app).get('/api/v1/businesses/' + businessId + '/settings').set('Cookie', cookie);
    expect(settings.status).toBe(200);
    expect(settings.body.data.settings).toMatchObject({ businessId, aiEnabled: true, answerPolicy: null });

    expect(await db.maybeOne('SELECT 1 FROM email_outbox WHERE to_email_normalized = $1', [email])).toBeNull();
    expect(await db.maybeOne('SELECT 1 FROM auth_tokens WHERE user_id = $1', [registered.body.data.userId])).toBeNull();

    const duplicate = await signup(email);
    expect(duplicate.status).toBe(422);
    expect(duplicate.body.error.details.reason).toBe('email_taken');
    expect((await db.query('SELECT id FROM accounts WHERE owner_user_id = $1', [registered.body.data.userId])).rowCount).toBe(1);

    expect((await post('/api/v1/auth/email/verify').send({ token: 'x'.repeat(43) })).status).toBe(404);
    expect((await post('/api/v1/auth/email/resend').set('Cookie', cookie)).status).toBe(404);
  }, 35000);

  it('accepts a 128-character password with supplementary characters and rejects 129', async () => {
    const email = newEmail();
    const character = String.fromCodePoint(0x1f600);
    const longPassword = (character + 'A\u030a').repeat(64);
    const registered = await signup(email, { password: longPassword });
    expect(registered.status).toBe(201);

    const loggedIn = await post('/api/v1/auth/login').send({ email, password: longPassword });
    expect(loggedIn.status).toBe(200);
    expect(loggedIn.body.data.userId).toBe(registered.body.data.userId);

    const rejected = await signup(newEmail(), { password: longPassword + character });
    expect(rejected.status).toBe(400);
    expect(rejected.body.error.details.issues).toContainEqual({ path: 'password', code: 'too_long' });
  }, 35000);

  it('serializes concurrent requests for the same normalized address', async () => {
    const email = newEmail();
    const responses = await Promise.all([signup(email), signup(email.toUpperCase())]);
    expect(responses.map(({ status }) => status).sort()).toEqual([201, 422]);
    const winner = responses.find(({ status }) => status === 201)!;
    expect((await db.query('SELECT id FROM accounts WHERE owner_user_id = $1', [winner.body.data.userId])).rowCount).toBe(1);
    expect(responses.find(({ status }) => status === 422)?.body.error.details.reason).toBe('email_taken');
  }, 30000);

  it('rejects missing names, short passwords and CSRF, and rolls back the user on provisioning failure', async () => {
    const email = newEmail();
    expect((await signup(email, { businessName: undefined })).status).toBe(400);
    expect((await signup(email, { password: '1234567' })).status).toBe(400);
    expect((await request(app).post('/api/v1/auth/signup').send({ email, password })).status).toBe(403);

    await expect(createSignupAccount({ email, password, displayName: 'Rollback Test', businessName: 'Rollback Shop' }, {
      provisionAccountForUser: async () => { throw new Error('Synthetic provision failure'); },
      acceptInvitation: async () => { throw new Error('Unexpected invitation'); },
      completeInvitationAcceptance: async () => {},
    })).rejects.toThrow('Synthetic provision failure');
    await noUser(email);
  }, 30000);

  it('joins invited staff without provisioning a shop and rolls back failed invitation signups', async () => {
    const ownerSession = await signup(newEmail(), { businessName: 'Auth Invitation Test Shop' });
    expect(ownerSession.status).toBe(201);
    const ownerCookie = getCookie(ownerSession);
    const ownerMe = await request(app).get('/api/v1/me').set('Cookie', ownerCookie);
    const shopId = ownerMe.body.data.businesses[0].business.id as string;
    const invitationsPath = '/api/v1/businesses/' + shopId + '/invitations';

    async function invite(email: string) {
      const response = await post(invitationsPath).set('Cookie', ownerCookie).send({ email, permissions: ['chat.read'] });
      expect(response.status).toBe(201);
      const token = new URL(response.body.data.link).searchParams.get('token');
      if (!token) throw new Error('Expected a test invitation token');
      return { token, id: response.body.data.invitation.id as string };
    }

    const invited = newEmail();
    const { token } = await invite(invited);
    const mismatched = newEmail();
    const wrong = await signup(mismatched, { inviteToken: token, businessName: undefined });
    expect(wrong.status).toBe(403);
    expect(wrong.body.error.details.reason).toBe('email_mismatch');
    await noUser(mismatched);

    const accepted = await signup(invited, { inviteToken: token, businessName: undefined });
    expect(accepted.status).toBe(201);
    expect(accepted.body.data.emailVerified).toBe(false);
    const me = await request(app).get('/api/v1/me').set('Cookie', getCookie(accepted));
    expect(me.body.data.businesses).toHaveLength(1);
    expect(me.body.data.businesses[0]).toMatchObject({ role: 'staff', business: { id: shopId }, permissions: ['chat.read'] });
    expect((await db.query('SELECT id FROM accounts WHERE owner_user_id = $1', [accepted.body.data.userId])).rowCount).toBe(0);
    const replayAddress = newEmail();
    expect((await signup(replayAddress, { inviteToken: token, businessName: undefined })).status).toBe(422);
    await noUser(replayAddress);

    const revoked = newEmail();
    const pending = await invite(revoked);
    expect((await post(invitationsPath + '/' + pending.id + '/revoke')
      .set('Cookie', ownerCookie)).status).toBe(200);
    const rejected = await signup(revoked, { inviteToken: pending.token, businessName: undefined });
    expect(rejected.status).toBe(422);
    expect(rejected.body.error.details.reason).toBe('revoked');
    await noUser(revoked);

    const suspended = newEmail();
    const suspendedInvite = await invite(suspended);
    await db.query("UPDATE businesses SET status = 'suspended' WHERE id = $1", [shopId]);
    try {
      const disabled = await signup(suspended, { inviteToken: suspendedInvite.token, businessName: undefined });
      expect(disabled.status).toBe(403);
      expect(disabled.body.error.code).toBe('BUSINESS_INACTIVE');
      await noUser(suspended);
    } finally {
      await db.query("UPDATE businesses SET status = 'active' WHERE id = $1", [shopId]);
    }

    const expired = newEmail();
    const ttl = config.INVITATION_TTL_HOURS;
    try {
      config.INVITATION_TTL_HOURS = -1;
      const expiredInvite = await invite(expired);
      const rejectedExpired = await signup(expired, { inviteToken: expiredInvite.token, businessName: undefined });
      expect(rejectedExpired.status).toBe(422);
      expect(rejectedExpired.body.error.details.reason).toBe('expired');
      await noUser(expired);
    } finally {
      config.INVITATION_TTL_HOURS = ttl;
    }
  }, 45000);
});
