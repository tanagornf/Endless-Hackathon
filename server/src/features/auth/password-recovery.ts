import { createHmac } from 'node:crypto';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { AppError, assertRateLimit, auditInTransaction, config, createSession, db, log, revokeUserSessionsInTransaction } from '../../core';
import type { DbExecutor } from '../../core';
import { assertSameOriginRequest } from './csrf';
import { hashPassword, PASSWORD_MAX, validatePassword, verifyPassword } from './password';
import { authTokenSchema } from './tokens';

export interface RecoveryPorts {
  issueToken(userId: string, purpose: 'reset_password', tx: DbExecutor): Promise<string>;
  consumeToken(token: string, purpose: 'reset_password', tx: DbExecutor): Promise<string>;
  insertSandboxMail(input: {
    to: string; userId: string; template: 'reset_password'; locale: 'th' | 'en';
    vars: Record<string, string>; actionUrl: string;
  }, tx: DbExecutor): Promise<unknown>;
}

const ForgotBody = z.object({ email: z.string().trim().toLowerCase().email().max(200) }).strict();
const ResetBody = z.object({
  token: authTokenSchema, newPassword: z.string().max(PASSWORD_MAX),
}).strict();
const ChangeBody = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX), newPassword: z.string().max(PASSWORD_MAX),
}).strict();

type PasswordAccount = {
  email: string;
  display_name: string;
  email_normalized: string;
  password_hash: string | null;
  status: 'active' | 'disabled';
};

function validateNewPassword(plain: string, user: Pick<PasswordAccount, 'email' | 'display_name'>) {
  const code = validatePassword(plain, { email: user.email, displayName: user.display_name });
  if (code) throw new AppError('VALIDATION_ERROR', 'Password does not meet requirements', {
    details: { issues: [{ path: 'newPassword', code }] },
  });
}

function invalidCurrentPassword(): AppError {
  return new AppError('AUTH_REQUIRED', 'Current password is incorrect', { details: { reason: 'wrong_current_password' } });
}

export async function forgotPassword(req: Request, input: unknown, ports: RecoveryPorts) {
  assertSameOriginRequest(req);
  assertRateLimit({ key: 'auth.forgot.ip:' + (req.ip ?? 'unknown'), limit: 10, windowSeconds: 3600 });
  const { email } = ForgotBody.parse(input);
  const emailHash = createHmac('sha256', config.SESSION_SECRET).update(email).digest('hex');
  assertRateLimit({ key: 'auth.forgot.email:' + emailHash, limit: 3, windowSeconds: 3600 });

  try {
    await db.tx(async (tx) => {
      const user = await tx.maybeOne<{ id: string; email: string; locale: 'th' | 'en' }>(
        "SELECT id, email, locale FROM users WHERE email_normalized = $1 AND status = 'active' FOR UPDATE", [email],
      );
      if (!user) return;
      const token = await ports.issueToken(user.id, 'reset_password', tx);
      const actionUrl = new URL('/reset-password', config.APP_BASE_URL);
      actionUrl.searchParams.set('token', token);
      await ports.insertSandboxMail({
        to: user.email, userId: user.id, template: 'reset_password', locale: user.locale,
        vars: { minutes: String(config.AUTH_TOKEN_TTL_MINUTES) }, actionUrl: actionUrl.href,
      }, tx);
      await auditInTransaction(tx, [{ action: 'auth.password.forgot', actorUserId: user.id }]);
    });
  } catch {
    // Keep eligibility private even when token or outbox storage fails.
    log.warn('Password reset email could not be queued');
  }
  return { ok: true };
}

export async function resetPassword(req: Request, input: unknown, ports: RecoveryPorts) {
  assertSameOriginRequest(req);
  assertRateLimit({ key: 'auth.reset.ip:' + (req.ip ?? 'unknown'), limit: 20, windowSeconds: 3600 });
  const { token, newPassword } = ResetBody.parse(input);
  await db.tx(async (tx) => {
    // A rejection or failed update rolls back the token consumption as well as the credential change.
    const id = await ports.consumeToken(token, 'reset_password', tx);
    const user = await tx.one<PasswordAccount>(
      'SELECT email, display_name, email_normalized, password_hash, status FROM users WHERE id = $1 FOR UPDATE', [id],
    );
    if (user.status !== 'active') throw new AppError('ACCOUNT_DISABLED', 'Account disabled');
    validateNewPassword(newPassword, user);
    await tx.query('UPDATE users SET password_hash = $2, email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1',
      [id, await hashPassword(newPassword)]);
    await tx.query('DELETE FROM auth_login_attempts WHERE email_normalized = $1', [user.email_normalized]);
    await revokeUserSessionsInTransaction(tx, id);
    await auditInTransaction(tx, [{ action: 'auth.password.reset', actorUserId: id }]);
  });
  return { ok: true };
}

export async function changePassword(req: Request, res: Response, userId: string, input: unknown) {
  assertSameOriginRequest(req);
  assertRateLimit({ key: 'auth.change:' + userId, limit: 5, windowSeconds: 900 });
  const { currentPassword, newPassword } = ChangeBody.parse(input);
  const user = await db.one<PasswordAccount>(
    'SELECT email, display_name, email_normalized, password_hash, status FROM users WHERE id = $1', [userId],
  );
  if (user.status !== 'active') throw new AppError('ACCOUNT_DISABLED', 'Account disabled');
  if (!user.password_hash || !await verifyPassword(currentPassword, user.password_hash)) throw invalidCurrentPassword();
  validateNewPassword(newPassword, user);
  const hash = await hashPassword(newPassword);
  await db.tx(async (tx) => {
    const result = await tx.query(
      "UPDATE users SET password_hash = $2 WHERE id = $1 AND password_hash = $3 AND status = 'active'",
      [userId, hash, user.password_hash],
    );
    if (!result.rowCount) throw invalidCurrentPassword();
    await revokeUserSessionsInTransaction(tx, userId);
    await auditInTransaction(tx, [{ action: 'auth.password.change', actorUserId: userId }]);
  });
  await createSession(userId, 'password', res);
  return { ok: true };
}
