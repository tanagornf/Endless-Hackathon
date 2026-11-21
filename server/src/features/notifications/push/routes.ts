import { z } from 'zod';
import { db } from '../../../core';
import type { FeatureApi, ScheduleDefinition } from '../../../core';
import { resolvePhoneNotice } from './destination';
import { testPhonePush } from './delivery';
import {
  acknowledgePhonePush, acknowledgementBody, enrollPushDevice, pushStatusQuery, readPhonePushStatus,
  removePushDevice, subscribeBody, unsubscribeBody,
} from './subscriptions';
import { pushWorkerScript } from './worker';

const testBody = z.strictObject({ device: z.uuid().optional() }).default({});

export function registerPushRoutes(api: FeatureApi): void {
  api.get('/notifications/sw.js', { auth: 'none', summary: 'Load the private preview notification worker' }, async ({ res }) => {
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.setHeader('Service-Worker-Allowed', '/api/v1/notifications/');
    return { kind: 'file', bytes: new TextEncoder().encode(pushWorkerScript), mimeType: 'text/javascript; charset=utf-8', inline: true };
  });
  api.get('/notifications/push/status', {
    auth: 'user', query: pushStatusQuery, summary: 'Read your enrolled devices and phone notification status',
  }, async ({ user, query, res }) => {
    res.setHeader('Cache-Control', 'private, no-store');
    return readPhonePushStatus(user!.id, query.device);
  });
  api.get('/notifications/push/open/:noticeId', {
    auth: 'user', summary: 'Resolve an opaque notification for the signed-in recipient',
  }, async ({ user, params, res }) => {
    res.setHeader('Cache-Control', 'private, no-store');
    return resolvePhoneNotice(user!.id, params.noticeId!);
  });
  api.post('/notifications/push/subscribe', {
    auth: 'user', body: subscribeBody, summary: 'Enroll the current browser for notifications',
  }, async ({ user, body }) => enrollPushDevice(user!.id, body));
  api.post('/notifications/push/unsubscribe', {
    auth: 'user', body: unsubscribeBody, summary: 'Remove your enrolled browser',
  }, async ({ user, body }) => removePushDevice(user!.id, body.endpoint));
  api.post('/notifications/push/ack', {
    auth: 'user', body: acknowledgementBody, summary: 'Record that your enrolled device displayed a notification',
  }, async ({ user, body }) => acknowledgePhonePush(user!.id, body.ref));
  api.post('/notifications/push/test', {
    auth: 'user', body: testBody, summary: 'Send a generic test notification to your enrolled device',
  }, async ({ user, body }) => testPhonePush(user!.id, user!.locale, body.device));
}

export const notificationPushPurge: ScheduleDefinition = {
  name: 'notifications.purge',
  everySeconds: 86400,
  async handler() {
    await db.tx(async (tx) => {
      await tx.query("DELETE FROM push_deliveries WHERE created_at < now() - interval '30 days'");
      await tx.query(
        "DELETE FROM notifications WHERE read_at < now() - interval '90 days' OR created_at < now() - interval '180 days'",
      );
    });
  },
};
