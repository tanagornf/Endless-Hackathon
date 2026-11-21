import { db, log } from '../../core';
import type { ScheduleDefinition } from '../../core';
import { enqueueNotificationPush } from './push/delivery';

interface PendingPhoneNotification { id: string; businessId: string }

export async function queuePhoneNotification({ id, businessId }: PendingPhoneNotification): Promise<void> {
  try {
    if (!await enqueueNotificationPush(id, businessId)) return;
    await db.query(
      'UPDATE notifications SET push_queue_at = NULL WHERE id = $1 AND business_id = $2 AND push_queue_at IS NOT NULL',
      [id, businessId],
    );
  } catch {
    log.warn('Notification phone enqueue failed and will be retried');
  }
}

export async function reconcilePhonePushQueue(signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return;
  const { rows } = await db.query<PendingPhoneNotification>(
    'WITH due AS (SELECT id FROM notifications WHERE push_queue_at <= now()'
    + ' ORDER BY push_queue_at, id LIMIT 50 FOR UPDATE SKIP LOCKED)'
    + " UPDATE notifications n SET push_queue_at = now() + interval '30 seconds' FROM due WHERE n.id = due.id"
    + ' RETURNING n.id, n.business_id AS "businessId"',
  );
  if (!signal?.aborted) await Promise.all(rows.map(queuePhoneNotification));
}

export const phonePushQueueSchedule: ScheduleDefinition = {
  name: 'notifications.reconcile-phone-queue',
  everySeconds: 30,
  handler: async ({ signal }) => reconcilePhonePushQueue(signal),
};
