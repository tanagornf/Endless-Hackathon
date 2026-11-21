import type { ConversationDetail } from '@nless/shared/features/inbox/types';
import { AppError, db, defineFeatureRoutes, publish } from '../../core';
import type { RouteContext } from '../../core';
import { getBusinessSettings } from '../business-settings/service';
import { historyQuery } from './schemas';
import { getConversation, getHistory } from './service';

async function authorizeConversation(ctx: RouteContext<unknown, unknown>) {
  const conversation = await getConversation(ctx.params.conversationId);
  if (!conversation) throw new AppError('NOT_FOUND', 'Conversation not found');
  await ctx.requireBusiness(conversation.businessId, 'chat.read');
  return conversation;
}

export default defineFeatureRoutes({
  featureId: 'F09',
  slug: 'inbox',
  register(api) {
    api.get('/conversations/:conversationId', { auth: 'user', summary: 'Read conversation detail' }, async (ctx): Promise<ConversationDetail> => {
      const conversation = await authorizeConversation(ctx);
      const { id, businessId, assigneeUserId } = conversation;
      const [settings, state] = await Promise.all([
        getBusinessSettings(businessId),
        db.one<{ assigneeName: string | null; waitingSince: Date | null; aiPending: boolean }>(`WITH awaiting AS (
          SELECT m.id, m.created_at FROM messages m
          WHERE m.business_id=$1 AND m.conversation_id=$2 AND m.direction='inbound' AND m.author='customer'
            AND m.seq > COALESCE((SELECT max(o.seq) FROM messages o WHERE o.business_id=$1
              AND o.conversation_id=$2 AND o.direction='outbound' AND o.author IN ('ai','staff')), 0)
          ORDER BY m.seq DESC
        )
        SELECT (SELECT u.display_name FROM memberships ms JOIN users u ON u.id=ms.user_id
          WHERE ms.business_id=$1 AND ms.user_id=$3 AND ms.status='active' AND u.status='active') AS "assigneeName",
          (SELECT min(created_at) FROM awaiting) AS "waitingSince",
          EXISTS (SELECT 1 FROM jobs WHERE business_id=$1 AND state IN ('queued','running')
            AND dedup_key='ai.reply:'||(SELECT id::text FROM awaiting LIMIT 1)) AS "aiPending"`,
        [businessId, id, assigneeUserId]),
      ]);
      const isWaiting = conversation.status === 'open' && state.waitingSince !== null
        && (conversation.handler === 'human' || !settings.aiEnabled || Date.now() - state.waitingSince.getTime() > 120000);
      return {
        conversation, assigneeName: state.assigneeName, waitingSince: state.waitingSince?.toISOString() ?? null,
        isWaiting, aiPending: state.aiPending, aiEnabled: settings.aiEnabled,
      };
    });

    api.get('/conversations/:conversationId/messages', {
      auth: 'user', query: historyQuery, summary: 'Read conversation history',
    }, async (ctx) => {
      const { id, businessId } = await authorizeConversation(ctx);
      return getHistory(id, { ...ctx.query, businessId });
    });

    api.post('/conversations/:conversationId/read', { auth: 'user', summary: 'Mark conversation read' }, async (ctx) => {
      const { id, businessId } = await authorizeConversation(ctx);
      await db.query('UPDATE conversations SET unread_count=0 WHERE id=$1 AND business_id=$2 AND unread_count>0',
        [id, businessId]);
      publish(businessId, { type: 'custom', featureId: 'F09', name: 'inbox.read', data: { conversationId: id } });
      return { unreadCount: 0 };
    });
  },
});
