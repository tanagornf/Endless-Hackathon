import { randomBytes } from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SEED } from '@nless/shared/core/fixtures';
import { config, db } from '../../core';
import { createApp } from '../../core/app';
import { hashPassword, verifyPassword } from './password';
import { seedUserIds, syncSeedPasswords } from './seed-passwords';

const owner = SEED.users.find(({ alias }) => alias === 'owner_a')!;
const otherOwner = SEED.users.find(({ alias }) => alias === 'owner_b')!;
const staff = SEED.users.find(({ alias }) => alias === 'staff_a')!;
const businessA = SEED.businesses.find(({ alias }) => alias === 'biz_demo_a')!;
const businessB = SEED.businesses.find(({ alias }) => alias === 'biz_demo_b')!;
const password = randomBytes(18).toString('base64url');
const wrongPassword = randomBytes(18).toString('base64url');
const previousSeedPassword = config.SEED_USER_PASSWORD;
let app: Express;
let client = 0;
let previous: { id: string; password_hash: string | null; fingerprint: string | null }[] = [];

function authPost(path: string, ip = '192.0.2.' + ++client, target = app) {
  return request(target).post('/api/v1/auth/' + path)
    .set('X-Requested-With', 'nless').set('X-Forwarded-For', ip);
}

async function logIn(email = owner.email, plain = password, ip?: string, target = app) {
  return authPost('login', ip, target).send({ email, password: plain });
}

function sessionCookie(response: request.Response): string {
  const cookies = ([] as string[]).concat(response.headers['set-cookie'] ?? []);
  const entry = cookies.findLast((value) => value.startsWith('nless_session=') && !value.startsWith('nless_session=;'));
  if (!entry) throw new Error('Login did not return a session cookie');
  return entry.split(';')[0];
}

describe('auth S1 routes', () => {
  beforeAll(async () => {
    app = await createApp();
    app.set('trust proxy', 1);
    previous = (await db.query<typeof previous[number]>(
      `SELECT id, password_hash, fingerprint FROM users
       LEFT JOIN auth_seed_password_state ON user_id = id WHERE id = ANY($1::uuid[])`, [seedUserIds],
    )).rows;
    config.SEED_USER_PASSWORD = password;
    await syncSeedPasswords();
  }, 30000);

  afterAll(async () => {
    config.SEED_USER_PASSWORD = previousSeedPassword;
    for (const row of previous) {
      await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [row.password_hash, row.id]);
      if (row.fingerprint === null) await db.query('DELETE FROM auth_seed_password_state WHERE user_id = $1', [row.id]);
      else await db.query('UPDATE auth_seed_password_state SET fingerprint = $1 WHERE user_id = $2', [row.fingerprint, row.id]);
    }
    await db.query('DELETE FROM auth_login_attempts WHERE email_normalized = ANY($1::text[])', [[owner.email, otherOwner.email, staff.email]]);
  });

  it('sets an HttpOnly password session and lists only the owner’s business', async () => {
    const result = await logIn(' ' + owner.email.toUpperCase() + ' ');
    expect(result.status).toBe(200);
    expect(result.body.data).toEqual({ userId: owner.id, emailVerified: true, next: '/' });
    expect(result.headers['set-cookie'][0]).toMatch(/; HttpOnly;/i);
    expect(result.headers['set-cookie'][0]).toMatch(/; SameSite=Lax/i);

    const cookie = sessionCookie(result);
    const me = await request(app).get('/api/v1/me').set('Cookie', cookie);
    expect(me.status).toBe(200);
    expect(me.body.data.user.sessionKind).toBe('password');
    expect(me.body.data.businesses.map(({ business }: { business: { id: string } }) => business.id)).toEqual([businessA.id]);
    const status = await request(app).get('/api/v1/auth/status').set('Cookie', cookie);
    expect(status.body.data).toMatchObject({ userId: owner.id, email: owner.email, emailVerified: true });
    expect((await request(app).get('/api/v1/auth/config')).body.data)
      .toEqual({ emailMode: 'sandbox', passwordMinLength: 10 });
  });

  it('requires the CSRF header and uses the same error for incorrect and unknown accounts', async () => {
    const direct = await request(app).post('/api/v1/auth/login').send({ email: owner.email, password });
    expect(direct.status).toBe(403);
    expect(direct.body.error.details.reason).toBe('csrf');
    const crossOrigin = await authPost('login').set('Origin', 'https://external.example.test')
      .send({ email: owner.email, password });
    expect(crossOrigin.status).toBe(403);

    const wrong = await logIn(owner.email, wrongPassword);
    const unknown = await logIn('auth-unknown@example.test', wrongPassword);
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error).toEqual(unknown.body.error);
    expect(wrong.body.error.details.reason).toBe('invalid_credentials');
    expect((await logIn()).status).toBe(200);
  });

  it('locks after five failures, even for unknown addresses, and clears an expired lock on success', async () => {
    const unknown = 'auth-unknown-lock@example.test';
    for (const email of [otherOwner.email, unknown]) {
      const attempts = await Promise.all(Array.from({ length: 5 }, () => logIn(email, wrongPassword)));
      expect(attempts.map(({ status }) => status)).toEqual(Array(5).fill(401));
      const locked = await logIn(email);
      expect(locked.status).toBe(429);
      expect(Number(locked.headers['retry-after'])).toBeGreaterThan(880);
      expect(locked.body.error.details.retryAfterSeconds).toBeLessThanOrEqual(900);
    }

    await db.query("UPDATE auth_login_attempts SET locked_until = now() - interval '1 second' WHERE email_normalized = $1", [otherOwner.email]);
    expect((await logIn(otherOwner.email)).status).toBe(200);
    expect(await db.maybeOne('SELECT 1 FROM auth_login_attempts WHERE email_normalized = $1', [otherOwner.email])).toBeNull();
  }, 20000);

  it('limits repeated requests from one IP across email addresses', async () => {
    const ip = '198.51.100.24';
    const responses = await Promise.all(Array.from({ length: 21 }, (_, index) =>
      logIn('auth-rate-' + index + '@example.test', wrongPassword, ip)));
    expect(responses.filter(({ status }) => status === 401)).toHaveLength(20);
    const blocked = responses.find(({ status }) => status === 429);
    expect(Number(blocked?.headers['retry-after'])).toBeGreaterThan(0);
  }, 20000);

  it('ignores spoofed tenancy and revokes replaced, logged-out, and expired cookies', async () => {
    const first = sessionCookie(await logIn());
    const replaced = await authPost('login').set('Cookie', first).send({ email: staff.email, password });
    const second = sessionCookie(replaced);
    expect(second).not.toBe(first);
    expect((await request(app).get('/api/v1/me').set('Cookie', first)).status).toBe(401);
    expect((await request(app).get('/api/v1/businesses/' + businessB.id + '/members').set('Cookie', second)).status).toBe(404);

    const logout = await authPost('logout').set('Cookie', second);
    expect(logout.status).toBe(200);
    expect((await request(app).get('/api/v1/me').set('Cookie', second)).status).toBe(401);
    const expired = sessionCookie(await logIn(staff.email));
    await db.query("UPDATE sessions SET expires_at = now() - interval '1 second' WHERE user_id = $1", [staff.id]);
    expect((await request(app).get('/api/v1/me').set('Cookie', expired)).status).toBe(401);
  });

  it('logs the current user out everywhere while preserving other users’ sessions', async () => {
    const first = sessionCookie(await logIn(staff.email));
    const second = sessionCookie(await logIn(staff.email));
    const other = sessionCookie(await logIn(SEED.users.find(({ alias }) => alias === 'staff_b')!.email));
    const response = await authPost('logout-all').set('Cookie', first);
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ ok: true, revoked: 2 });
    for (const cookie of [first, second]) {
      expect((await request(app).get('/api/v1/me').set('Cookie', cookie)).status).toBe(401);
    }
    expect((await request(app).get('/api/v1/me').set('Cookie', other)).status).toBe(200);
  });

  it('reveals a disabled account only after successful password verification', async () => {
    await db.query("UPDATE users SET status = 'disabled' WHERE id = $1", [staff.id]);
    try {
      const wrong = await logIn(staff.email, wrongPassword);
      expect(wrong.status).toBe(401);
      expect(wrong.body.error.details.reason).toBe('invalid_credentials');
      const correct = await logIn(staff.email);
      expect(correct.status).toBe(403);
      expect(correct.body.error.code).toBe('ACCOUNT_DISABLED');
    } finally {
      await db.query("UPDATE users SET status = 'active' WHERE id = $1", [staff.id]);
    }
  });

  it('supports password login when dev login is disabled', async () => {
    const previousDevLogin = config.DEV_LOGIN_ENABLED;
    let productionLike: Express;
    try {
      config.DEV_LOGIN_ENABLED = false;
      productionLike = await createApp();
    } finally {
      config.DEV_LOGIN_ENABLED = previousDevLogin;
    }
    expect((await request(productionLike).post('/api/dev/login').send({ email: staff.email })).status).toBe(404);
    const cookie = sessionCookie(await logIn(staff.email, password, undefined, productionLike));
    expect((await request(productionLike).get('/api/v1/me').set('Cookie', cookie)).status).toBe(200);
  });

  it('syncs seed users idempotently, preserves changed passwords, and revokes sessions on rotation', async () => {
    const readHash = async () => (await db.one<{ password_hash: string }>(
      'SELECT password_hash FROM users WHERE id = $1', [staff.id],
    )).password_hash;
    const seeded = (await db.query('SELECT 1 FROM auth_seed_password_state WHERE user_id = ANY($1::uuid[])', [seedUserIds]));
    expect(seeded.rowCount).toBe(seedUserIds.length);
    const existing = await readHash();
    await syncSeedPasswords();
    expect(await readHash()).toBe(existing);

    const cookie = sessionCookie(await logIn(staff.email));
    const changed = await hashPassword(randomBytes(18).toString('base64url'));
    await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [changed, staff.id]);
    await syncSeedPasswords();
    expect(await readHash()).toBe(changed);

    config.SEED_USER_PASSWORD = 'short';
    await syncSeedPasswords();
    expect(await readHash()).toBe(changed);

    const rotated = randomBytes(18).toString('base64url');
    config.SEED_USER_PASSWORD = rotated;
    await syncSeedPasswords();
    expect(await verifyPassword(rotated, await readHash())).toBe(true);
    expect((await request(app).get('/api/v1/me').set('Cookie', cookie)).status).toBe(401);
  }, 30000);
});
