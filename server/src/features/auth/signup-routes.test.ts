import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SEED } from '@nless/shared/core/fixtures';
import { config, db, decryptSecret } from '../../core';
import { createApp } from '../../core/app';
import { createSignupAccount } from './signup';

const owner = SEED.users.find(({ alias }) => alias === 'owner_a')!;
const shop = SEED.businesses.find(({ alias }) => alias === 'biz_demo_a')!;
const password = randomBytes(18).toString('base64url');
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

async function outbox(email: string) {
  const { rows } = await db.query<{ action_url_enc: string; body_text: string; locale: string }>(
    "SELECT action_url_enc, body_text, locale FROM email_outbox WHERE to_email_normalized = $1 AND template = 'verify_email' ORDER BY created_at, id", [email],
  );
  return rows.map(({ action_url_enc, body_text, locale }) => {
    const token = new URL(decryptSecret(action_url_enc)).searchParams.get('token');
    if (!token) throw new Error('Expected a verification token');
    return { token, ciphertext: action_url_enc, body: body_text, locale };
  });
}

function verify(token: string) {
  return post('/api/v1/auth/email/verify').send({ token });
}

async function noUser(email: string) {
  expect(await db.maybeOne('SELECT id FROM users WHERE email_normalized = $1', [email])).toBeNull();
}

async function invite(email: string, cookie: string) {
  const response = await post('/api/v1/businesses/' + shop.id + '/invitations').set('Cookie', cookie)
    .send({ email, permissions: ['chat.read'] });
  expect(response.status).toBe(201);
  const token = new URL(response.body.data.link).searchParams.get('token');
  if (!token) throw new Error('Expected a test invitation token');
  return { token, id: response.body.data.invitation.id as string };
}

describe('auth S2 signup and verification routes', () => {
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

  it('creates one owner account and a password session plus encrypted verification mail', async () => {
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

    const rows = await outbox(email);
    expect(rows).toHaveLength(1);
    const [{ token, ciphertext, body, locale }] = rows;
    expect(locale).toBe('en');
    expect(/^[A-Za-z0-9_-]{43}$/.test(token)).toBe(true);
    expect(ciphertext.includes(token) || body.includes(token)).toBe(false);
    const hash = createHash('sha256').update(token).digest('hex');
    expect(await db.maybeOne('SELECT 1 FROM auth_tokens WHERE token_hash = $1', [hash])).not.toBeNull();

    const duplicate = await signup(email);
    expect(duplicate.status).toBe(422);
    expect(duplicate.body.error.details.reason).toBe('email_taken');
    expect((await db.query('SELECT id FROM accounts WHERE owner_user_id = $1', [registered.body.data.userId])).rowCount).toBe(1);

    const responses = await Promise.all([verify(token), verify(token)]);
    expect(responses.map(({ status }) => status).sort()).toEqual([200, 422]);
    expect(responses.find(({ status }) => status === 422)?.body.error.details.reason).toBe('used');
    expect((await request(app).get('/api/v1/auth/status').set('Cookie', cookie)).body.data.emailVerified).toBe(true);
    expect((await post('/api/v1/auth/email/resend').set('Cookie', cookie)).body.error.details.reason).toBe('already_verified');
  }, 35000);

  it('serializes concurrent requests for the same normalized address', async () => {
    const email = newEmail();
    const responses = await Promise.all([signup(email), signup(email.toUpperCase())]);
    expect(responses.map(({ status }) => status).sort()).toEqual([201, 422]);
    const winner = responses.find(({ status }) => status === 201)!;
    expect((await db.query('SELECT id FROM accounts WHERE owner_user_id = $1', [winner.body.data.userId])).rowCount).toBe(1);
    expect(responses.find(({ status }) => status === 422)?.body.error.details.reason).toBe('email_taken');
    expect(await outbox(email)).toHaveLength(1);
  }, 30000);

  it('rejects missing names, weak passwords and CSRF, and rolls back the user on provisioning failure', async () => {
    const email = newEmail();
    expect((await signup(email, { businessName: undefined })).status).toBe(400);
    expect((await signup(email, { password: 'password123' })).status).toBe(400);
    expect((await request(app).post('/api/v1/auth/signup').send({ email, password })).status).toBe(403);
    expect((await request(app).post('/api/v1/auth/email/verify').send({ token: randomBytes(32).toString('base64url') })).status).toBe(403);

    await expect(createSignupAccount({ email, password, displayName: 'Rollback Test', businessName: 'Rollback Shop' }, {
      provisionAccountForUser: async () => { throw new Error('Synthetic provision failure'); },
      acceptInvitation: async () => { throw new Error('Unexpected invitation'); },
      completeInvitationAcceptance: async () => {},
    })).rejects.toThrow('Synthetic provision failure');
    await noUser(email);
  }, 30000);

  it('invalidates an old or expired verification link and rejects unknown links', async () => {
    const email = newEmail();
    const registered = await signup(email);
    expect(registered.status).toBe(201);
    const cookie = getCookie(registered);
    const [first] = await outbox(email);
    const resent = await post('/api/v1/auth/email/resend').set('Cookie', cookie);
    expect(resent.status).toBe(200);
    const links = await outbox(email);
    expect(links).toHaveLength(2);
    const next = links.find(({ token }) => token !== first.token)!;
    expect((await verify(first.token)).body.error.details.reason).toBe('used');

    await db.query("UPDATE auth_tokens SET expires_at = now() - interval '1 second' WHERE token_hash = $1", [
      createHash('sha256').update(next.token).digest('hex'),
    ]);
    expect((await verify(next.token)).body.error.details.reason).toBe('expired');
    expect((await verify(randomBytes(32).toString('base64url'))).status).toBe(404);
  }, 30000);

  it('joins invited staff without provisioning a shop and rolls back failed invitation signups', async () => {
    const ownerSession = await post('/api/dev/login').send({ email: owner.email });
    expect(ownerSession.status).toBe(200);
    const ownerCookie = getCookie(ownerSession);
    const invited = newEmail();
    const { token } = await invite(invited, ownerCookie);
    const mismatched = newEmail();
    const wrong = await signup(mismatched, { inviteToken: token, businessName: undefined });
    expect(wrong.status).toBe(403);
    expect(wrong.body.error.details.reason).toBe('email_mismatch');
    await noUser(mismatched);

    const accepted = await signup(invited, { inviteToken: token, businessName: undefined });
    expect(accepted.status).toBe(201);
    expect(accepted.body.data.emailVerified).toBe(true);
    const me = await request(app).get('/api/v1/me').set('Cookie', getCookie(accepted));
    expect(me.body.data.businesses).toHaveLength(1);
    expect(me.body.data.businesses[0]).toMatchObject({ role: 'staff', business: { id: shop.id }, permissions: ['chat.read'] });
    expect((await db.query('SELECT id FROM accounts WHERE owner_user_id = $1', [accepted.body.data.userId])).rowCount).toBe(0);
    expect(await outbox(invited)).toHaveLength(0);
    const replayAddress = newEmail();
    expect((await signup(replayAddress, { inviteToken: token, businessName: undefined })).status).toBe(422);
    await noUser(replayAddress);

    const revoked = newEmail();
    const pending = await invite(revoked, ownerCookie);
    expect((await post('/api/v1/businesses/' + shop.id + '/invitations/' + pending.id + '/revoke')
      .set('Cookie', ownerCookie)).status).toBe(200);
    const rejected = await signup(revoked, { inviteToken: pending.token, businessName: undefined });
    expect(rejected.status).toBe(422);
    expect(rejected.body.error.details.reason).toBe('revoked');
    await noUser(revoked);

    const suspended = newEmail();
    const suspendedInvite = await invite(suspended, ownerCookie);
    await db.query("UPDATE businesses SET status = 'suspended' WHERE id = $1", [shop.id]);
    try {
      const disabled = await signup(suspended, { inviteToken: suspendedInvite.token, businessName: undefined });
      expect(disabled.status).toBe(403);
      expect(disabled.body.error.code).toBe('BUSINESS_INACTIVE');
      await noUser(suspended);
    } finally {
      await db.query("UPDATE businesses SET status = 'active' WHERE id = $1", [shop.id]);
    }

    const expired = newEmail();
    const ttl = config.INVITATION_TTL_HOURS;
    try {
      config.INVITATION_TTL_HOURS = -1;
      const expiredInvite = await invite(expired, ownerCookie);
      const rejectedExpired = await signup(expired, { inviteToken: expiredInvite.token, businessName: undefined });
      expect(rejectedExpired.status).toBe(422);
      expect(rejectedExpired.body.error.details.reason).toBe('expired');
      await noUser(expired);
    } finally {
      config.INVITATION_TTL_HOURS = ttl;
    }
  }, 45000);
});
