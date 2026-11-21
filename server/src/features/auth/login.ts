import { createHmac, randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { AppError, assertRateLimit, audit, config, createSession, db, destroySession } from '../../core';
import type { DbExecutor } from '../../core';
import type { AuthResult } from '@nless/shared/features/auth/types';
import { assertSameOriginRequest } from './csrf';
import { hashPassword, needsRehash, PASSWORD_MAX, verifyPassword } from './password';

const LoginBody = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(PASSWORD_MAX),
}).strict();
const LOGIN_MAX_FAILS = 5;
const LOGIN_WINDOW_MIN = 15;
const LOCK_MIN = 15;
const dummyHash = hashPassword(randomBytes(32).toString('base64url'));

type LoginUser = {
  id: string;
  password_hash: string | null;
  status: 'active' | 'disabled';
  email_verified_at: Date | null;
};

function digest(value: string) {
  return createHmac('sha256', config.SESSION_SECRET).update(value).digest('hex');
}

async function assertUnlocked(executor: DbExecutor, email: string) {
  const lock = await executor.maybeOne<{ seconds: number }>(
    `SELECT ceil(extract(epoch FROM locked_until - clock_timestamp()))::int AS seconds
     FROM auth_login_attempts WHERE email_normalized = $1 AND locked_until > clock_timestamp()`,
    [email],
  );
  if (lock) throw new AppError('RATE_LIMITED', 'Too many requests', {
    retryable: true, details: { retryAfterSeconds: Math.max(1, lock.seconds) },
  });
}

async function recordFailure(tx: DbExecutor, email: string): Promise<number> {
  const { failed_count } = await tx.one<{ failed_count: number }>(
    `INSERT INTO auth_login_attempts AS attempts (email_normalized, window_started_at, failed_count)
     VALUES ($1, statement_timestamp(), 1)
     ON CONFLICT (email_normalized) DO UPDATE SET
       failed_count = CASE WHEN attempts.window_started_at <= statement_timestamp() - make_interval(mins => $2)
         THEN 1 ELSE attempts.failed_count + 1 END,
       window_started_at = CASE WHEN attempts.window_started_at <= statement_timestamp() - make_interval(mins => $2)
         THEN statement_timestamp() ELSE attempts.window_started_at END,
       locked_until = CASE WHEN attempts.window_started_at > statement_timestamp() - make_interval(mins => $2)
         AND attempts.failed_count + 1 >= $3 THEN statement_timestamp() + make_interval(mins => $4) ELSE NULL END,
       updated_at = statement_timestamp()
     RETURNING failed_count`,
    [email, LOGIN_WINDOW_MIN, LOGIN_MAX_FAILS, LOCK_MIN],
  );
  return failed_count;
}

export async function login(req: Request, res: Response, input: unknown): Promise<AuthResult> {
  assertSameOriginRequest(req);
  const ip = req.ip ?? 'unknown';
  assertRateLimit({ key: 'auth.login.ip:' + ip, limit: 20, windowSeconds: 60 });
  const { email, password } = LoginBody.parse(input);
  const emailHash = digest(email);
  assertRateLimit({ key: 'auth.login.email:' + emailHash, limit: 10, windowSeconds: 60 });

  await assertUnlocked(db, email);
  const user = await db.maybeOne<LoginUser>(
    'SELECT id, password_hash, status, email_verified_at FROM users WHERE email_normalized = $1',
    [email],
  );
  const observedHash = user?.password_hash;
  const verified = await verifyPassword(password, observedHash ?? await dummyHash);
  const valid = Boolean(observedHash && verified);
  const rehashed = valid && user?.status === 'active' && observedHash && needsRehash(observedHash)
    ? await hashPassword(password) : null;

  const result = await db.tx(async (tx) => {
    // Serialize same-email writes and recheck the lock after the expensive verification.
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['auth-email:' + email]);
    await assertUnlocked(tx, email);
    if (valid && user) {
      const current = await tx.maybeOne<LoginUser>(
        'SELECT id, password_hash, status, email_verified_at FROM users WHERE id = $1 AND email_normalized = $2 FOR UPDATE',
        [user.id, email],
      );
      if (current && current.password_hash === observedHash) {
        if (current.status === 'disabled') throw new AppError('ACCOUNT_DISABLED', 'Account disabled');
        await tx.query('DELETE FROM auth_login_attempts WHERE email_normalized = $1', [email]);
        if (rehashed) await tx.query('UPDATE users SET password_hash = $1 WHERE id = $2', [rehashed, current.id]);
        return { user: current } as const;
      }
    }
    return { count: await recordFailure(tx, email) } as const;
  });

  if (!result.user) {
    await audit({ action: 'auth.login.failed', actorUserId: null, details: { emailHash, count: result.count } });
    throw new AppError('AUTH_REQUIRED', 'Wrong email or password', { details: { reason: 'invalid_credentials' } });
  }

  if (req.cookies?.nless_session) await destroySession(req, res);
  await createSession(result.user.id, 'password', res);
  await audit({ action: 'auth.login.success', actorUserId: result.user.id, details: { ipHash: digest(ip) } });
  return { userId: result.user.id, emailVerified: result.user.email_verified_at !== null, next: '/' };
}
