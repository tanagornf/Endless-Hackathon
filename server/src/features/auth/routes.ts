import { audit, defineFeatureRoutes, destroySession, log } from '../../core';
import { acceptInvitation, completeInvitationAcceptance, provisionAccountForUser } from '../tenancy/service';
import { assertSameOriginRequest } from './csrf';
import { resendVerification, verifyEmail } from './email-verification';
import { login } from './login';
import { insertSandboxMail } from './mail';
import { listMailbox, MailboxQuery } from './mailbox';
import { outboxPurge } from './outbox-purge';
import { PASSWORD_MIN } from './password';
import { changePassword, forgotPassword, resetPassword } from './password-recovery';
import { readAuthStatus, updateProfile } from './profile';
import { syncSeedPasswords } from './seed-passwords';
import { revokeAllSessions } from './sessions-port';
import { signup } from './signup';
import { consumeToken, issueToken } from './tokens';

let bootSync: Promise<void> | undefined;
const signupTenancy = { acceptInvitation, completeInvitationAcceptance, provisionAccountForUser };
const recovery = { consumeToken, issueToken, insertSandboxMail };

export default defineFeatureRoutes({
  featureId: 'F02',
  slug: 'auth',
  schedules: [outboxPurge],
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
    api.post('/auth/password/forgot', { auth: 'none', summary: 'Request a password reset in the sandbox' },
      ({ req, body }) => forgotPassword(req, body, recovery));
    api.post('/auth/password/reset', { auth: 'none', summary: 'Reset a password with a one-time link' },
      ({ req, body }) => resetPassword(req, body, recovery));
    api.post('/auth/password/change', { auth: 'user', summary: 'Change the current user password and rotate sessions' },
      ({ req, res, user, body }) => changePassword(req, res, user!.id, body));
    api.get('/auth/mailbox', { auth: 'user', query: MailboxQuery, summary: 'Read authorized sandbox email' },
      async ({ query, res, user }) => {
        res.setHeader('Cache-Control', 'private, no-store');
        return listMailbox(user!, query.scope);
      });
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
      ({ user }) => readAuthStatus(user!.id));
    api.patch('/auth/profile', { auth: 'user', summary: 'Update the current user display name and language' },
      ({ req, user, body }) => updateProfile(req, user!.id, body));
  },
});
