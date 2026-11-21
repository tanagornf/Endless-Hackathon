import type { PermissionKey } from '@nless/shared/core/permissions';
import { z } from 'zod';
import { AppError, defineFeatureRoutes } from '../../core';
import type { RouteContext } from '../../core';
import { getConversation } from '../inbox/service';
import { retryDueAiHandoffNotifications } from './aiHandoff';
import { getConversationTeamState, releaseConversation, takeoverConversation } from './service';
import { ReleaseBody, TakeoverBody, uuid } from './validation';

const scopeQuery = z.object({ businessId: uuid.optional() });

async function authorize(
  ctx: Pick<RouteContext<unknown, z.infer<typeof scopeQuery>>, 'params' | 'query' | 'requireBusiness'>,
  permission: PermissionKey,
) {
  const { conversationId } = ctx.params;
  const conversation = uuid.safeParse(conversationId).success ? await getConversation(conversationId, ctx.query) : null;
  if (!conversation) throw new AppError('NOT_FOUND', 'Conversation not found');
  const context = await ctx.requireBusiness(conversation.businessId, permission);
  return { ...context, conversationId: conversation.id };
}

const root = '/conversations/:conversationId';

export default defineFeatureRoutes({
  featureId: 'F11',
  slug: 'team',
  schedules: [{ name: 'team.handoff-notifications', everySeconds: 60, handler: retryDueAiHandoffNotifications }],
  register(api) {
    api.get(root + '/team', { auth: 'user', query: scopeQuery }, async (ctx) => {
      const { conversationId, business, scope } = await authorize(ctx, 'chat.read');
      return getConversationTeamState(conversationId, business.id, scope.permissions.includes('chat.takeover'));
    });

    api.post(root + '/takeover', { auth: 'user', body: TakeoverBody, query: scopeQuery }, async (ctx) => {
      const { conversationId, business, user } = await authorize(ctx, 'chat.takeover');
      return takeoverConversation(conversationId, user.id, { businessId: business.id, ...ctx.body });
    });

    api.post(root + '/release', { auth: 'user', body: ReleaseBody, query: scopeQuery }, async (ctx) => {
      const { conversationId, business, user } = await authorize(ctx, 'chat.takeover');
      return releaseConversation(conversationId, { businessId: business.id, actorUserId: user.id, note: ctx.body.note });
    });
  },
});
