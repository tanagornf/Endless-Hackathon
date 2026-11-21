import type { Page } from '@nless/shared/core/types';
import type { InboxCounts, InboxRow, ListConversationsInput } from '@nless/shared/features/inbox/types';
import { AppError, db } from '../../core';
import { getBusinessSettings } from '../business-settings/service';
import { uuidPattern } from './schemas';

const conversationRank = `WITH latest AS (
  SELECT c.* FROM conversations c WHERE c.business_id=$1 AND NOT EXISTS (
    SELECT 1 FROM conversations n WHERE n.business_id=c.business_id AND n.customer_id=c.customer_id
      AND (n.created_at,n.id)>(c.created_at,c.id)
  )
), enriched AS (
  SELECT l.*, cu.display_name, cu.external_id,
    (SELECT min(m.created_at) FROM messages m
      WHERE m.business_id=l.business_id AND m.conversation_id=l.id
        AND m.direction='inbound' AND m.author='customer'
        AND m.seq > COALESCE((SELECT max(o.seq) FROM messages o WHERE o.business_id=l.business_id
          AND o.conversation_id=l.id AND o.direction='outbound' AND o.author IN ('staff','ai')),0)) AS awaiting_since,
    (SELECT u.display_name FROM memberships ms JOIN users u ON u.id=ms.user_id
      WHERE ms.business_id=l.business_id AND ms.user_id=l.assignee_user_id AND ms.status='active' AND u.status='active')
      AS assignee_name
  FROM latest l JOIN customers cu ON cu.id=l.customer_id AND cu.business_id=l.business_id
  WHERE cu.external_id NOT LIKE 'eval-%' AND cu.external_id NOT LIKE 'live-sim:%'
), waiting AS (
  SELECT e.*, (e.status='open' AND e.awaiting_since IS NOT NULL AND
    (e.handler='human' OR $2::boolean OR e.awaiting_since < now()-interval '120 seconds')) AS is_waiting
  FROM enriched e
), ranked AS (
  SELECT w.*, CASE WHEN is_waiting THEN 0 WHEN status='open' THEN 1 ELSE 2 END AS bucket,
    CASE WHEN is_waiting THEN extract(epoch FROM awaiting_since)::float8
      ELSE -extract(epoch FROM COALESCE(last_message_at,created_at))::float8 END AS sort_key
  FROM waiting w
)`;

type InboxCursor = [number, number, string];
type InboxSqlRow = Omit<InboxRow, 'lastMessageAt' | 'waitingSince'> & {
  lastMessageAt: Date | null;
  waitingSince: Date | null;
  bucket: number;
  sortKey: number;
};

function parseCursor(cursor?: string): InboxCursor | null {
  if (cursor === undefined) return null;
  try {
    const decoded = Buffer.from(cursor, 'base64url');
    const value: unknown = JSON.parse(decoded.toString('utf8'));
    if (decoded.toString('base64url') === cursor && Array.isArray(value) && value.length === 3
      && [0, 1, 2].includes(value[0]) && typeof value[1] === 'number' && Number.isFinite(value[1])
      && typeof value[2] === 'string' && uuidPattern.test(value[2])) return [value[0], value[1], value[2]];
  } catch { /* Malformed cursors are reported uniformly. */ }
  throw new AppError('VALIDATION_ERROR', 'Invalid conversation cursor');
}

export async function listConversations(
  businessId: string, actorUserId: string, input: ListConversationsInput,
): Promise<Page<InboxRow>> {
  const { filter, assignee, search, limit } = input;
  if (assignee && assignee !== 'me' && assignee !== 'unassigned' && !uuidPattern.test(assignee)) {
    throw new AppError('VALIDATION_ERROR', 'Invalid assignee filter');
  }
  const cursor = parseCursor(input.cursor);
  const escaped = search ? '%' + search.replace(/[\\%_]/gu, (character) => '\\' + character) + '%' : null;
  const { aiEnabled } = await getBusinessSettings(businessId);
  const { rows } = await db.query<InboxSqlRow>(conversationRank + `
    SELECT id AS "conversationId", customer_id AS "customerId",
      COALESCE(NULLIF(display_name,''), right(external_id,4)) AS "customerName",
      channel,status,handler,assignee_user_id AS "assigneeUserId",assignee_name AS "assigneeName",
      last_message_at AS "lastMessageAt",COALESCE(last_message_preview,'') AS "lastMessagePreview",
      unread_count AS "unreadCount",awaiting_since AS "waitingSince",is_waiting AS "isWaiting",version,
      bucket,sort_key AS "sortKey"
    FROM ranked
    WHERE ($3='all' OR ($3='waiting' AND is_waiting) OR ($3='active' AND status='open') OR ($3='closed' AND status='closed'))
      AND (NOT $4::boolean OR assignee_name IS NULL)
      AND ($5::uuid IS NULL OR assignee_user_id=$5)
      AND ($6::text IS NULL OR display_name ILIKE $6 OR last_message_preview ILIKE $6)
      AND ($7::int IS NULL OR (bucket,sort_key,id)>($7,$8::float8,$9::uuid))
    ORDER BY bucket,sort_key,id LIMIT $10`,
  [businessId, !aiEnabled, filter, assignee === 'unassigned',
    assignee === 'me' ? actorUserId : (assignee === 'unassigned' ? null : assignee || null),
    escaped, cursor?.[0] ?? null, cursor?.[1] ?? null, cursor?.[2] ?? null, limit + 1]);
  const page = rows.slice(0, limit);
  const boundary = page.at(-1);
  return {
    items: page.map(({ bucket, sortKey, lastMessageAt, waitingSince, ...row }) => ({
      ...row, lastMessageAt: lastMessageAt?.toISOString() ?? null, waitingSince: waitingSince?.toISOString() ?? null,
    })),
    nextCursor: rows.length > limit && boundary ? Buffer.from(JSON.stringify([
      boundary.bucket, boundary.sortKey, boundary.conversationId,
    ])).toString('base64url') : null,
  };
}

export async function countConversations(businessId: string): Promise<InboxCounts> {
  const { aiEnabled } = await getBusinessSettings(businessId);
  return db.one<InboxCounts>(conversationRank + `
    SELECT count(*)::int AS "all", count(*) FILTER (WHERE is_waiting)::int AS waiting,
      count(*) FILTER (WHERE status='open')::int AS active, count(*) FILTER (WHERE status='closed')::int AS closed
    FROM ranked`, [businessId, !aiEnabled]);
}
