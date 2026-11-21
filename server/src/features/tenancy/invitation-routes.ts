import { z } from 'zod';
import { AppError, assertRateLimit } from '../../core';
import type { FeatureApi, RouteContext } from '../../core';
import { listInvitations, parseInvitationToken } from './invitation-repo';
import { acceptInvitation, createInvitation, declineInvitation, previewInvitation, resendInvitation, revokeInvitation } from './invitations';

const path = '/businesses/:businessId/invitations';
const owner = { auth: 'business', permission: 'account.members' } as const;
const createBody = z.strictObject({
  email: z.string().trim().toLowerCase().email().max(200),
  permissions: z.array(z.string().max(64)).max(40).optional(),
});
const listQuery = z.object({ status: z.enum(['pending', 'accepted', 'revoked', 'declined', 'expired']).optional() });

function publicTokenRequest({ req, res }: Pick<RouteContext, 'req' | 'res'>, operation: 'preview' | 'decline'): void {
  res.setHeader('Cache-Control', 'no-store');
  if (req.get('X-Requested-With') !== 'nless') throw new AppError('PERMISSION_DENIED', 'Request header required');
  assertRateLimit({ key: 'tenancy.invite.' + operation + ':' + (req.ip ?? 'unknown'), limit: 30, windowSeconds: 60 });
}

export function registerInvitationRoutes(api: FeatureApi): void {
  api.get(path, { ...owner, query: listQuery, summary: 'List staff invitations' },
    async ({ business, query }) => listInvitations(business!.id, query.status));
  api.post(path, { ...owner, body: createBody, summary: 'Create a staff invitation' },
    async ({ business, user, body, res }) => {
      res.setHeader('Cache-Control', 'no-store');
      return { kind: 'json', status: 201, data: await createInvitation(business!.id, user!.id, body) };
    });
  api.post(path + '/:invitationId/resend', { ...owner, summary: 'Rotate a staff invitation link' },
    async ({ business, user, params, res }) => {
      res.setHeader('Cache-Control', 'no-store');
      return resendInvitation(business!.id, user!.id, params.invitationId!);
    });
  api.post(path + '/:invitationId/revoke', { ...owner, summary: 'Revoke a staff invitation' },
    async ({ business, user, params }) => revokeInvitation(business!.id, user!.id, params.invitationId!));
  api.get('/invitations/preview', { auth: 'none', summary: 'Preview a staff invitation' },
    async (ctx) => {
      publicTokenRequest(ctx, 'preview');
      return previewInvitation(parseInvitationToken({ token: ctx.req.query.token }));
    });
  api.post('/invitations/accept', { auth: 'user', summary: 'Accept a staff invitation' },
    async ({ req, res, user }) => {
      res.setHeader('Cache-Control', 'no-store');
      assertRateLimit({ key: 'tenancy.invite.accept:' + user!.id, limit: 20, windowSeconds: 60 });
      return acceptInvitation(user!.id, parseInvitationToken(req.body));
    });
  api.post('/invitations/decline', { auth: 'none', summary: 'Decline a staff invitation' },
    async (ctx) => {
      publicTokenRequest(ctx, 'decline');
      await declineInvitation(parseInvitationToken(ctx.req.body));
      return { ok: true };
    });
}
