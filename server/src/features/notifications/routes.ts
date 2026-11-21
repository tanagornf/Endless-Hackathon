import { AppError, assertRateLimit, defineFeatureRoutes, isFeatureHidden } from '../../core';
import type { RouteContext } from '../../core';
import { markRead, notificationFeed, unreadCount } from './repo';
import { FeedQuery, ReadBody } from './schemas';
import { notify } from './service';

const path = '/businesses/:businessId/notifications';

function recipient(ctx: RouteContext<unknown, unknown>) {
  return { ...ctx.scope!, businessId: ctx.business!.id, userId: ctx.user!.id };
}

export default defineFeatureRoutes({
  featureId: 'F31',
  slug: 'notifications',
  register(api) {
    api.get(path, { auth: 'business', query: FeedQuery, summary: 'List my notifications' },
      async (ctx) => notificationFeed(recipient(ctx), ctx.query));
    api.get(path + '/unread-count', { auth: 'business', summary: 'Count my unread notifications' },
      async (ctx) => {
        if (await isFeatureHidden('F31')) throw new AppError('NOT_FOUND', 'Notifications are unavailable');
        return unreadCount(recipient(ctx));
      });
    api.post(path + '/read', { auth: 'business', body: ReadBody, summary: 'Mark my notifications read' },
      async (ctx) => markRead(recipient(ctx), ctx.body));
    api.post(path + '/test', { auth: 'business', summary: 'Send myself a test notification' },
      async (ctx) => {
        const scope = recipient(ctx);
        assertRateLimit({ key: 'notifications:test:' + scope.userId, limit: 5, windowSeconds: 60 });
        const th = ctx.business!.language === 'th';
        const result = await notify({
          businessId: scope.businessId, to: { userIds: [scope.userId] }, type: 'system',
          title: th ? 'ทดสอบการแจ้งเตือน' : 'Test notification',
          body: th ? 'ถ้าเห็นข้อความนี้ กระดิ่งทำงานปกติ' : 'If you see this, the bell works.',
        });
        return { notificationId: result.notificationIds[0] ?? null };
      });
  },
});
