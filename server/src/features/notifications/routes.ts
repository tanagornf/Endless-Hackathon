import { AppError, assertRateLimit, defineFeatureRoutes, isFeatureHidden } from '../../core';
import type { RouteContext } from '../../core';
import { markRead, notificationFeed, unreadCount } from './repo';
import { listPreferences, savePreferences } from './preferences';
import { handleNotificationPush, notificationPushJob } from './push/delivery';
import { registerOwnerConsultLookup } from './push/destination';
import { notificationPushPurge, registerPushRoutes } from './push/routes';
import { FeedQuery, PreferencesBody, ReadBody } from './schemas';
import { notify } from './service';

const path = '/businesses/:businessId/notifications';

registerOwnerConsultLookup(async (input) => {
  // Optional until the separate F04 producer is released. Consult push fails closed.
  const producer = await import('../business-settings/service');
  const lookup: unknown = Reflect.get(producer, 'isOwnerConsultActionPending');
  return typeof lookup === 'function' && await lookup(input) === true;
});

function recipient(ctx: RouteContext<unknown, unknown>) {
  return { ...ctx.scope!, businessId: ctx.business!.id, userId: ctx.user!.id };
}

export default defineFeatureRoutes({
  featureId: 'F31',
  slug: 'notifications',
  jobs: { [notificationPushJob]: handleNotificationPush },
  schedules: [notificationPushPurge],
  register(api) {
    registerPushRoutes(api);
    api.get('/notification-preferences', { auth: 'user', summary: 'List my notification preferences' },
      async (ctx) => ({ items: await listPreferences(ctx.user!.id) }));
    api.put('/notification-preferences', { auth: 'user', body: PreferencesBody, summary: 'Update my notification preferences' },
      async (ctx) => ({ items: await savePreferences(ctx.user!.id, ctx.body.items) }));
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
