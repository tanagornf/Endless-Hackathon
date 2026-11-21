import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db, decryptSecret, log } from '../../core';
import { createApp } from '../../core/app';

let app: Express;
let uniqueClient = 1;
const emails: string[] = [];

function address() {
  const email = 'f02-s3-' + randomUUID() + '@example.test';
  emails.push(email);
  return email;
}

function password() {
  return randomBytes(18).toString('base64url');
}

function post(path: string) {
  return request(app).post('/api/v1/auth' + path).set('X-Requested-With', 'nless')
    .set('X-Forwarded-For', '198.51.100.' + uniqueClient++);
}

function sessionCookie(response: request.Response) {
  const entry = ([] as string[]).concat(response.headers['set-cookie'] ?? [])
    .findLast((value) => value.startsWith('nless_session=') && !value.startsWith('nless_session=;'));
  if (!entry) throw new Error('Expected a password session cookie');
  return entry.split(';')[0];
}

async function createAccount() {
  const email = address();
  const secret = password();
  const response = await post('/signup').send({
    email, password: secret, displayName: 'Recovery Fixture', businessName: 'Recovery Test Shop', locale: 'en',
  });
  expect(response.status).toBe(201);
  return { email, secret, userId: response.body.data.userId as string, cookie: sessionCookie(response) };
}

function login(email: string, secret: string) {
  return post('/login').send({ email, password: secret });
}

function forgot(email: string) {
  return post('/password/forgot').send({ email });
}

function reset(token: string, newPassword: string) {
  return post('/password/reset').send({ token, newPassword });
}

function me(cookie: string) {
  return request(app).get('/api/v1/me').set('Cookie', cookie);
}

async function resetLinks(email: string) {
  const { rows } = await db.query<{ action_url_enc: string }>(
    "SELECT action_url_enc FROM email_outbox WHERE to_email_normalized = $1 AND template = 'reset_password' ORDER BY created_at, id", [email],
  );
  return rows.map(({ action_url_enc }) => {
    const url = decryptSecret(action_url_enc);
    const token = new URL(url).searchParams.get('token');
    if (!token) throw new Error('Expected a sandbox reset token');
    return { token, url, ciphertext: action_url_enc };
  });
}

describe('auth S3 recovery and mailbox routes', () => {
  beforeAll(async () => {
    app = await createApp();
    app.set('trust proxy', 1);
  }, 30000);

  afterAll(async () => {
    await db.tx(async (tx) => {
      await tx.query('DELETE FROM email_outbox WHERE to_email_normalized = ANY($1::text[])', [emails]);
      await tx.query('DELETE FROM auth_login_attempts WHERE email_normalized = ANY($1::text[])', [emails]);
      await tx.query('DELETE FROM accounts WHERE owner_user_id IN (SELECT id FROM users WHERE email_normalized = ANY($1::text[]))', [emails]);
      await tx.query('DELETE FROM users WHERE email_normalized = ANY($1::text[])', [emails]);
    });
  }, 30000);

  it('keeps account eligibility private and only queues mail for active accounts', async () => {
    const active = await createAccount();
    const disabled = await createAccount();
    const absent = address();
    await db.query("UPDATE users SET status = 'disabled' WHERE id = $1", [disabled.userId]);
    for (const email of [active.email, disabled.email, absent]) {
      const response = await forgot(email);
      expect(response.status).toBe(200);
      expect(response.body.data).toEqual({ ok: true });
    }
    expect(await resetLinks(active.email)).toHaveLength(1);
    expect(await resetLinks(disabled.email)).toHaveLength(0);
    expect(await resetLinks(absent)).toHaveLength(0);
    expect((await request(app).post('/api/v1/auth/password/forgot').send({ email: active.email })).status).toBe(403);
    expect((await request(app).post('/api/v1/auth/password/reset').send({ token: 'x'.repeat(43), newPassword: password() })).status).toBe(403);
  }, 30000);

  it('replaces old links, preserves a valid token after weak input and revokes previous sessions on reset', async () => {
    const user = await createAccount();
    const anotherCookie = sessionCookie(await login(user.email, user.secret));
    expect((await forgot(user.email)).status).toBe(200);
    const [first] = await resetLinks(user.email);
    expect((await forgot(user.email)).status).toBe(200);
    const links = await resetLinks(user.email);
    expect(links).toHaveLength(2);
    const latest = links.find(({ token }) => token !== first.token)!;
    const replacement = password();
    expect((await reset(first.token, replacement)).body.error.details.reason).toBe('used');
    expect((await reset(latest.token, 'password123')).status).toBe(400);

    const responses = await Promise.all([reset(latest.token, replacement), reset(latest.token, replacement)]);
    expect(responses.map(({ status }) => status).sort()).toEqual([200, 422]);
    expect(responses.find(({ status }) => status === 422)?.body.error.details.reason).toBe('used');
    for (const cookie of [user.cookie, anotherCookie]) expect((await me(cookie)).status).toBe(401);
    expect((await login(user.email, user.secret)).status).toBe(401);
    const loggedIn = await login(user.email, replacement);
    expect(loggedIn.status).toBe(200);
    const status = await request(app).get('/api/v1/auth/status').set('Cookie', sessionCookie(loggedIn));
    expect(status.body.data.emailVerified).toBe(true);
  }, 35000);

  it('rejects expired links and limits each normalized address', async () => {
    const user = await createAccount();
    expect((await forgot(user.email)).status).toBe(200);
    const [link] = await resetLinks(user.email);
    await db.query("UPDATE auth_tokens SET expires_at = now() - interval '1 second' WHERE token_hash = $1",
      [createHash('sha256').update(link.token).digest('hex')]);
    const expired = await reset(link.token, password());
    expect(expired.status).toBe(422);
    expect(expired.body.error.details.reason).toBe('expired');
    expect((await forgot(user.email.toUpperCase())).status).toBe(200);
    expect((await forgot(user.email)).status).toBe(200);
    const limited = await forgot(user.email);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
  }, 30000);

  it('changes passwords only with the current password and rotates both existing sessions', async () => {
    const user = await createAccount();
    const anotherCookie = sessionCookie(await login(user.email, user.secret));
    const replacement = password();
    const failed = await post('/password/change').set('Cookie', user.cookie)
      .send({ currentPassword: password(), newPassword: replacement });
    expect(failed.status).toBe(401);
    expect(failed.body.error.details.reason).toBe('wrong_current_password');
    expect((await me(user.cookie)).status).toBe(200);

    const changed = await post('/password/change').set('Cookie', user.cookie)
      .send({ currentPassword: user.secret, newPassword: replacement });
    expect(changed.status).toBe(200);
    expect((await me(sessionCookie(changed))).status).toBe(200);
    for (const cookie of [user.cookie, anotherCookie]) expect((await me(cookie)).status).toBe(401);
    expect((await login(user.email, user.secret)).status).toBe(401);
    expect((await login(user.email, replacement)).status).toBe(200);
  }, 35000);

  it('scopes and expires mailbox messages, prevents caching, and protects admin scope', async () => {
    const reader = await createAccount();
    const other = await createAccount();
    const admin = await createAccount();
    await db.query('UPDATE users SET is_platform_admin = true WHERE id = $1', [admin.userId]);
    await forgot(reader.email);
    await forgot(other.email);

    const mine = await request(app).get('/api/v1/auth/mailbox').set('Cookie', reader.cookie);
    expect(mine.status).toBe(200);
    expect(mine.headers['cache-control']).toContain('no-store');
    expect(mine.body.data.scope).toBe('mine');
    expect(mine.body.data.items).toHaveLength(2);
    expect(mine.body.data.items.every(({ to }: { to: string }) => to === reader.email)).toBe(true);
    const [link] = await resetLinks(reader.email);
    const mail = mine.body.data.items.find(({ template }: { template: string }) => template === 'reset_password');
    expect(mail?.actionUrl === link.url && !link.ciphertext.includes(link.token)).toBe(true);
    expect((await request(app).get('/api/v1/auth/mailbox?scope=all').set('Cookie', reader.cookie)).status).toBe(403);
    expect((await request(app).get('/api/v1/auth/mailbox')).status).toBe(401);

    await db.query("UPDATE email_outbox SET expires_at = now() - interval '1 second' WHERE to_email_normalized = $1", [other.email]);
    const all = await request(app).get('/api/v1/auth/mailbox?scope=all').set('Cookie', admin.cookie);
    expect(all.status).toBe(200);
    const recipients = all.body.data.items.map(({ to }: { to: string }) => to);
    expect(recipients).toContain(reader.email);
    expect(recipients).not.toContain(other.email);
  }, 35000);

  it('updates only the signed-in profile through CSRF-protected routes', async () => {
    const user = await createAccount();
    const profile = () => request(app).patch('/api/v1/auth/profile').set('Cookie', user.cookie);
    expect((await profile().send({ displayName: 'Updated' })).status).toBe(403);
    expect((await profile().set('X-Requested-With', 'nless').send({ displayName: 'Updated', userId: user.userId })).status).toBe(400);
    const result = await profile().set('X-Requested-With', 'nless').send({ displayName: '  Shop Owner  ', locale: 'th' });
    expect(result.status).toBe(200);
    expect(result.body.data).toMatchObject({ userId: user.userId, displayName: 'Shop Owner', locale: 'th' });
    expect((await me(user.cookie)).body.data.user).toMatchObject({ displayName: 'Shop Owner', locale: 'th' });
  }, 30000);

  it('keeps credentials, links and personal addresses out of logs and audit details', async () => {
    const spies = [vi.spyOn(log, 'debug'), vi.spyOn(log, 'info'), vi.spyOn(log, 'warn'), vi.spyOn(log, 'error')];
    try {
      const user = await createAccount();
      expect((await login(user.email, user.secret)).status).toBe(200);
      expect((await forgot(user.email)).status).toBe(200);
      const [link] = await resetLinks(user.email);
      const replacement = password();
      expect((await reset(link.token, replacement)).status).toBe(200);
      const { rows } = await db.query<{ details: unknown }>('SELECT details FROM audit_events WHERE actor_user_id = $1', [user.userId]);
      expect(rows.length).toBeGreaterThan(0);
      const observed = JSON.stringify([rows, spies.flatMap(({ mock }) => mock.calls)]);
      for (const value of [user.secret, replacement, user.email, link.token, link.url]) {
        expect(observed.includes(value)).toBe(false);
      }
    } finally {
      spies.forEach((spy) => spy.mockRestore());
    }
  }, 35000);
});
