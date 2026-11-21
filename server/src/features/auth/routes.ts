import type { AuthStatus } from '@nless/shared/features/auth/types';
import { audit, db, defineFeatureRoutes, destroySession, log } from '../../core';
import { acceptInvitation, completeInvitationAcceptance, provisionAccountForUser } from '../tenancy/service';
import { assertSameOriginRequest } from './csrf';
import { resendVerification, verifyEmail } from './email-verification';
import { login } from './login';
import { PASSWORD_MIN } from './password';
import { syncSeedPasswords } from './seed-passwords';
import { revokeAllSessions } from './sessions-port';
import { signup } from './signup';

let bootSync: Promise<void> | undefined;
const signupTenancy = { acceptInvitation, completeInvitationAcceptance, provisionAccountForUser };

export default defineFeatureRoutes({
  featureId: 'F02',
  slug: 'auth',
  register(api) {
    bootSync ??= syncSeedPasswords().catch(() => {
      log.warn('Seed password sync failed');
      bootSync = undefined;
    });

    api.get('/auth/config', { auth: 'none', summary: 'Read public authentication settings' },
      async () => ({ emailMode: 'sandbox' as const, passwordMinLength: PASSWORD_MIN }));
    api.post('/auth/login', { auth: 'none', summary: 'Sign in with email and password' },
      ({ req, res, body }) => login(req, res, body));
    api.post('/auth/signup', { auth: 'none', summary: 'Create an account or join an invited business' },
      async ({ req, res, body }) => ({
        kind: 'json' as const,
        status: 201 as const,
        data: await signup(req, res, body, signupTenancy),
      }));
    api.post('/auth/email/verify', { auth: 'none', summary: 'Confirm an email address from a one-time link' },
      ({ req, body }) => verifyEmail(req, body));
    api.post('/auth/email/resend', { auth: 'user', summary: 'Queue a new email confirmation link' },
      ({ req, user }) => resendVerification(req, user!.id));
    api.post('/auth/logout', { auth: 'user', summary: 'Revoke the current session' }, async ({ req, res, user }) => {
      assertSameOriginRequest(req);
      await destroySession(req, res);
      await audit({ action: 'auth.logout', actorUserId: user!.id });
      return { ok: true };
    });
    api.post('/auth/logout-all', { auth: 'user', summary: 'Revoke all sessions for the current user' }, async ({ req, res, user }) => {
      assertSameOriginRequest(req);
      const revoked = await revokeAllSessions(user!.id);
      await destroySession(req, res);
      await audit({ action: 'auth.logout-all', actorUserId: user!.id, details: { revoked } });
      return { ok: true, revoked };
    });
    api.get('/auth/status', { auth: 'user', summary: 'Read the current user and email verification status' },
      async ({ user }): Promise<AuthStatus> => {
        const { id, email, displayName, locale, isPlatformAdmin } = user!;
        const { verified } = await db.one<{ verified: boolean }>(
          'SELECT email_verified_at IS NOT NULL AS verified FROM users WHERE id = $1', [id],
        );
        return { userId: id, email, displayName, locale, isPlatformAdmin, emailVerified: verified };
      });
  },
});
