import type { NotifyInput } from '@nless/shared/features/notifications/types';
import { AppError, db, log, publish } from '../../core';
import { TYPE_PERMISSION } from './defaults';
import { findRecipients } from './recipients';
import { NotifyInputSchema } from './schemas';

interface CreatedRow { id: string; userId: string }

/** Persists one notification per eligible recipient before publishing its realtime event. */
export async function notify(input: NotifyInput): Promise<{ notificationIds: string[]; mode: 'real' | 'sandbox' }> {
  const parsed = NotifyInputSchema.safeParse(input);
  if (!parsed.success) throw new AppError('VALIDATION_ERROR', 'Invalid notification input');
  const { businessId, type, title, body, link, dedupKey } = parsed.data;
  try {
    const recipients = await findRecipients(parsed.data);
    if (!recipients.length) return { notificationIds: [], mode: 'real' };
    const { rows } = await db.query<CreatedRow>(
      'INSERT INTO notifications (business_id, user_id, type, title, body, link, dedup_key)'
      + ' SELECT m.business_id, m.user_id, $3, $4, $5, $6, $7'
      + ' FROM memberships m JOIN users u ON u.id = m.user_id'
      + " WHERE m.business_id = $1 AND m.user_id = ANY($2::uuid[]) AND m.status = 'active' AND u.status = 'active'"
      + " AND (m.role = 'owner' OR $8 = ANY(m.permissions))"
      + ' ON CONFLICT (user_id, dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING'
      + ' RETURNING id, user_id AS "userId"',
      [businessId, recipients, type, title, body ?? null, link ?? null, dedupKey ?? null, TYPE_PERMISSION[type]],
    );
    for (const { id, userId } of rows) {
      publish(businessId, { type: 'notification.created', userId, notificationId: id, title }, { userIds: [userId] });
    }
    return { notificationIds: rows.map(({ id }) => id), mode: 'real' };
  } catch {
    log.error({ type }, 'Notification write failed');
    return { notificationIds: [], mode: 'real' };
  }
}
