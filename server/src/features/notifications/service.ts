import type { NotifyInput } from '@nless/shared/features/notifications/types';
import { AppError, db, log, publish } from '../../core';
import { PREF_DEFAULTS, TYPE_PERMISSION } from './defaults';
import { queuePhoneNotification } from './phone-queue';
import { classifyNotificationPush } from './push/provenance';
import { findRecipients } from './recipients';
import { NotifyInputSchema } from './schemas';

interface CreatedRow { id: string; userId: string; pushEligible: boolean }

/** Persists one notification per eligible recipient before publishing its realtime event. */
export async function notify(input: NotifyInput): Promise<{ notificationIds: string[]; mode: 'real' | 'sandbox' }> {
  const parsed = NotifyInputSchema.safeParse(input);
  if (!parsed.success) throw new AppError('VALIDATION_ERROR', 'Invalid notification input');
  const { businessId, to, type, title, body, link } = parsed.data;
  const { dedupKey, purpose } = classifyNotificationPush(parsed.data);
  try {
    const recipients = await findRecipients(parsed.data);
    if (!recipients.length) return { notificationIds: [], mode: 'real' };
    const { rows } = await db.query<CreatedRow>(
      'INSERT INTO notifications (business_id, user_id, type, title, body, link, dedup_key, push_purpose, push_queue_at)'
      + ' SELECT m.business_id, m.user_id, $3, $4, $5, $6, $7, $11::jsonb,'
      + ' CASE WHEN $11::jsonb IS NOT NULL AND COALESCE(p.push, $12::boolean)'
      + ' AND EXISTS (SELECT 1 FROM push_subscriptions ps WHERE ps.user_id = m.user_id) THEN now() END'
      + ' FROM memberships m JOIN users u ON u.id = m.user_id'
      + ' LEFT JOIN notification_preferences p ON p.user_id = m.user_id AND p.type = $3'
      + " WHERE m.business_id = $1 AND m.user_id = ANY($2::uuid[]) AND m.status = 'active' AND u.status = 'active'"
      + " AND (m.role = 'owner' OR $8 = ANY(m.permissions))"
      + " AND ($3 = 'system' OR COALESCE(p.in_app, true))"
      + " AND (NOT $9::boolean OR m.role = 'owner')"
      + " AND ($10::text IS NULL OR m.role = 'owner' OR $10 = ANY(m.permissions))"
      + ' ON CONFLICT (user_id, dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING'
      + ' RETURNING id, user_id AS "userId", (push_queue_at IS NOT NULL) AS "pushEligible"',
      [businessId, recipients, type, title, body ?? null, link ?? null, dedupKey ?? null, TYPE_PERMISSION[type],
        'role' in to, 'permission' in to ? to.permission : null, purpose ? JSON.stringify(purpose) : null, PREF_DEFAULTS[type].push],
    );
    for (const { id, userId } of rows) {
      // The feed rechecks type permissions. The socket should only signal that it needs to reload.
      publish(businessId, { type: 'notification.created', userId, notificationId: id, title: 'Endless' }, { userIds: [userId] });
    }
    if (purpose) {
      await Promise.all(rows.filter(({ pushEligible }) => pushEligible).map(({ id }) => queuePhoneNotification({ id, businessId })));
    }
    return { notificationIds: rows.map(({ id }) => id), mode: 'real' };
  } catch {
    log.error({ type }, 'Notification write failed');
    return { notificationIds: [], mode: 'real' };
  }
}

/** Resolve an uncertain producer retry against a persisted tenant-scoped receipt. */
export async function hasNotificationReceipt(input: { businessId: string; dedupKey: string }): Promise<boolean> {
  const row = await db.maybeOne<{ id: string }>(
    'SELECT id FROM notifications WHERE business_id = $1 AND dedup_key = $2 LIMIT 1',
    [input.businessId, input.dedupKey],
  );
  return row !== null;
}
