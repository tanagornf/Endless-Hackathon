import type { Request, Response } from 'express';
import { z } from 'zod';
import { AppError, assertRateLimit, audit, createSession, db, destroySession, log } from '../../core';
import type { DbExecutor } from '../../core';
import type { AuthResult } from '@nless/shared/features/auth/types';
import { ensureBusinessSettings } from '../business-settings/service';
import { assertSameOriginRequest } from './csrf';
import { sendVerificationEmail } from './email-verification';
import { hashPassword, PASSWORD_MAX, validatePassword } from './password';
import { authTokenSchema } from './tokens';

export interface SignupTenancy {
  provisionAccountForUser(
    userId: string,
    input: { businessName: string; timezone?: string; language?: 'th' | 'en' },
    tx: DbExecutor,
  ): Promise<{ accountId: string; businessId: string; created: boolean }>;
  acceptInvitation(userId: string, token: string, tx: DbExecutor): Promise<{ businessId: string }>;
  completeInvitationAcceptance(userId: string, token: string): Promise<void>;
}

const SignupBody = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().max(PASSWORD_MAX),
  displayName: z.string().trim().min(1).max(80),
  businessName: z.string().trim().min(2).max(80).optional(),
  locale: z.enum(['th', 'en']).default('th'),
  inviteToken: authTokenSchema.optional(),
}).strict();

export async function createSignupAccount(input: unknown, tenancy: SignupTenancy) {
  const body = SignupBody.parse(input);
  const { email, locale, displayName, inviteToken } = body;
  const businessName = body.businessName ?? '';
  if (!inviteToken && !businessName) {
    throw new AppError('VALIDATION_ERROR', 'Shop name is required', {
      details: { issues: [{ path: 'businessName', code: 'required' }] },
    });
  }
  const passwordProblem = validatePassword(body.password, { email, displayName });
  if (passwordProblem) {
    throw new AppError('VALIDATION_ERROR', 'Password does not meet requirements', {
      details: { issues: [{ path: 'password', code: passwordProblem }] },
    });
  }
  const hash = await hashPassword(body.password);
  return db.tx(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['auth-email:' + email]);
    if (await tx.maybeOne('SELECT id FROM users WHERE email_normalized = $1', [email])) {
      throw new AppError('POLICY_BLOCKED', 'Email already has an account', { details: { reason: 'email_taken' } });
    }
    const emailVerified = inviteToken !== undefined;
    const { id: userId } = await tx.one<{ id: string }>(
      `INSERT INTO users (email, display_name, locale, password_hash, status, email_verified_at)
       VALUES ($1, $2, $3, $4, 'active', CASE WHEN $5 THEN now() ELSE NULL END) RETURNING id`,
      [email, displayName, locale, hash, emailVerified],
    );
    const { businessId } = inviteToken
      ? await tenancy.acceptInvitation(userId, inviteToken, tx)
      : await tenancy.provisionAccountForUser(userId, { businessName, language: locale }, tx);
    return { userId, businessId, emailVerified, inviteToken };
  });
}

export async function signup(req: Request, res: Response, input: unknown, tenancy: SignupTenancy): Promise<AuthResult> {
  assertSameOriginRequest(req);
  assertRateLimit({ key: 'auth.signup.ip:' + (req.ip ?? 'unknown'), limit: 10, windowSeconds: 3600 });
  const { userId, businessId, emailVerified, inviteToken } = await createSignupAccount(input, tenancy);

  await ensureBusinessSettings(businessId).catch(() => log.warn('Signup settings initialization deferred'));
  if (inviteToken) {
    await tenancy.completeInvitationAcceptance(userId, inviteToken)
      .catch(() => log.warn('Invitation signup follow-up failed'));
  } else {
    await sendVerificationEmail(userId).catch(() => log.warn('Signup verification email could not be queued'));
  }

  if (req.cookies?.nless_session) await destroySession(req, res);
  await createSession(userId, 'password', res);
  await audit({ action: 'auth.signup', actorUserId: userId, businessId, details: { viaInvite: emailVerified } });
  return { userId, emailVerified, next: '/' };
}
