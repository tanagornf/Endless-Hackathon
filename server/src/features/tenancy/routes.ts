import { z } from 'zod';
import { defineFeatureRoutes } from '../../core';
import { registerBusinessRoutes } from './business-routes';
import { registerInvitationRoutes } from './invitation-routes';
import { changeMember, listMembers } from './service';

const permissionKeys = z.array(z.string().max(64)).max(40);
const SetPermissionsBody = z.strictObject({ permissions: permissionKeys });
const SetRoleBody = z.strictObject({
  role: z.enum(['owner', 'staff']),
  permissions: permissionKeys.optional(),
});
const membersPath = '/businesses/:businessId/members';
const memberAuth = { auth: 'business', permission: 'account.members' } as const;

export default defineFeatureRoutes({
  featureId: 'F03',
  slug: 'tenancy',
  register(api) {
    registerInvitationRoutes(api);
    registerBusinessRoutes(api);
    api.get(membersPath, { ...memberAuth, summary: 'List business members' },
      async ({ business, user }) => listMembers(business!.id, user!.id));
    api.put(membersPath + '/:userId/permissions', {
      ...memberAuth, body: SetPermissionsBody, summary: 'Set a staff member’s permissions',
    }, async ({ business, user, params, body }) => changeMember(
      business!.id, user!.id, params.userId!, { action: 'permissions', permissions: body.permissions },
    ));
    api.put(membersPath + '/:userId/role', {
      ...memberAuth, body: SetRoleBody, summary: 'Change a business member’s role',
    }, async ({ business, user, params, body }) => changeMember(
      business!.id, user!.id, params.userId!, { action: 'role', ...body },
    ));
    api.post(membersPath + '/:userId/revoke', { ...memberAuth, summary: 'Revoke business access' },
      async ({ business, user, params }) => changeMember(business!.id, user!.id, params.userId!, { action: 'revoke' }));
    api.post(membersPath + '/:userId/restore', { ...memberAuth, summary: 'Restore business access' },
      async ({ business, user, params }) => changeMember(business!.id, user!.id, params.userId!, { action: 'restore' }));
  },
});
