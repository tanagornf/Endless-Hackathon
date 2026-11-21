import type { Request } from 'express';
import { z } from 'zod';
import { AppError, assertRateLimit, audit, config, db } from '../../core';
import { assertSameOriginRequest } from './csrf';
import { insertSandboxMail } from './mail';
import { authTokenSchema, consumeToken, issueToken } from './tokens';

type EmailAccount = {
  email: string;
  display_name: string;
  email_verified_at: Date | null;
  locale: 'th' | 'en';
};

export async function sendVerificationEmail(userId: string) {
  await db.tx(async (tx) => {
    const user = await tx.one<EmailAccount>(
      'SELECT email, display_name, email_verified_at, locale FROM users WHERE id = $1 FOR UPDATE', [userId],
    );
    if (user.email_verified_at) {
      throw new AppError('POLICY_BLOCKED', 'Email already confirmed', { details: { reason: 'already_verified' } });
    }
    const token = await issueToken(userId, 'verify_email', tx);
    const actionUrl = new URL('/verify-email', config.APP_BASE_URL);
    actionUrl.searchParams.set('token', token);
    await insertSandboxMail({
      to: user.email,
      userId,
      template: 'verify_email',
      locale: user.locale,
      vars: { name: user.display_name, minutes: String(config.AUTH_TOKEN_TTL_MINUTES) },
      actionUrl: actionUrl.href,
    }, tx);
  });
}

const VerifyBody = z.object({ token: authTokenSchema }).strict();

export async function verifyEmail(req: Request, input: unknown) {
  assertSameOriginRequest(req);
  assertRateLimit({ key: 'auth.verify.ip:' + (req.ip ?? 'unknown'), limit: 30, windowSeconds: 3600 });
  const { token } = VerifyBody.parse(input);
  const result = await db.tx(async (tx) => {
    const userId = await consumeToken(token, 'verify_email', tx);
    const { email } = await tx.one<{ email: string }>(
      'UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1 RETURNING email', [userId],
    );
    return { userId, email };
  });
  await audit({ action: 'auth.email.verify', actorUserId: result.userId });
  return { ok: true, email: result.email };
}

export async function resendVerification(req: Request, userId: string) {
  assertSameOriginRequest(req);
  assertRateLimit({ key: 'auth.resend:' + userId, limit: 3, windowSeconds: 3600 });
  await sendVerificationEmail(userId);
  return { ok: true };
}
