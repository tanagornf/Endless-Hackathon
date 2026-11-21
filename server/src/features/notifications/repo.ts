import type {
  MarkReadInput, NotificationFeed, NotificationItem, UnreadCount,
} from '@nless/shared/features/notifications/types';
import { db } from '../../core';
import { allowedTypes, TYPE_PERMISSION } from './defaults';
import type { Grants } from './defaults';
import { readCursor } from './schemas';
import type { FeedOptions } from './schemas';

export interface RecipientScope extends Grants { businessId: string; userId: string }

export async function unreadCount(scope: RecipientScope): Promise<UnreadCount> {
  const { businessId, userId } = scope;
  return db.one<UnreadCount>(
    "SELECT count(*) FILTER (WHERE n.business_id = $2 AND n.type = ANY($3::text[]))::int AS count,"
    + ' count(*) FILTER (WHERE n.business_id <> $2)::int AS elsewhere'
    + ' FROM notifications n JOIN memberships m ON m.business_id = n.business_id AND m.user_id = n.user_id'
    + ' JOIN businesses b ON b.id = n.business_id JOIN accounts a ON a.id = b.account_id'
    + ' JOIN unnest($4::text[], $5::text[]) AS p(type, permission) ON p.type = n.type'
    + " WHERE n.user_id = $1 AND n.read_at IS NULL AND m.status = 'active' AND b.status = 'active' AND a.status = 'active'"
    + " AND (m.role = 'owner' OR p.permission = ANY(m.permissions))",
    [userId, businessId, allowedTypes(scope), Object.keys(TYPE_PERMISSION), Object.values(TYPE_PERMISSION)],
  );
}

export async function notificationFeed(scope: RecipientScope, options: FeedOptions): Promise<NotificationFeed> {
  const cursor = readCursor(options.cursor);
  const [result, unread] = await Promise.all([
    db.query<Omit<NotificationItem, 'read' | 'readAt'> & { readAt: Date | null }>(
      'SELECT id, type, title, body, link, read_at AS "readAt",'
      + ` to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAt"`
      + ' FROM notifications WHERE user_id = $1 AND business_id = $2 AND type = ANY($3::text[])'
      + ' AND (NOT $4::boolean OR read_at IS NULL)'
      + ' AND ($5::timestamptz IS NULL OR (created_at, id) < ($5::timestamptz, $6::uuid))'
      + ' ORDER BY created_at DESC, id DESC LIMIT $7',
      [scope.userId, scope.businessId, allowedTypes(scope), options.unread === 'true', cursor?.createdAt ?? null,
        cursor?.id ?? null, options.limit + 1],
    ),
    unreadCount(scope),
  ]);
  const items = result.rows.slice(0, options.limit).map((row) => ({
    ...row, read: row.readAt !== null, readAt: row.readAt?.toISOString() ?? null,
  }));
  const last = items.at(-1);
  const nextCursor = result.rows.length > options.limit && last
    ? Buffer.from(JSON.stringify({ createdAt: last.createdAt, id: last.id })).toString('base64url')
    : null;
  return { items, nextCursor, unreadCount: unread.count, unreadElsewhere: unread.elsewhere };
}

export async function markRead(scope: RecipientScope, input: MarkReadInput): Promise<{ updated: number }> {
  const ids = 'ids' in input ? input.ids : null;
  const result = await db.query(
    'UPDATE notifications SET read_at = now() WHERE user_id = $1 AND business_id = $2 AND read_at IS NULL'
    + ' AND type = ANY($3::text[]) AND ($4::uuid[] IS NULL OR id = ANY($4::uuid[]))',
    [scope.userId, scope.businessId, allowedTypes(scope), ids],
  );
  return { updated: result.rowCount };
}
