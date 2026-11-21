export { connect, disconnect, getConnectionView, verify } from './connection';
import { db } from '../../core';
import type { LineEventRow } from '@nless/shared/features/line/types';

export async function listEvents(businessId: string, limit: number): Promise<{ items: LineEventRow[] }> {
  const result = await db.query<Omit<LineEventRow, 'receivedAt'> & { receivedAt: Date }>(
    'SELECT webhook_event_id AS "webhookEventId", event_type AS "eventType", message_type AS "messageType", is_redelivery AS "isRedelivery", state, note, received_at AS "receivedAt" FROM line_events WHERE business_id = $1 ORDER BY received_at DESC, webhook_event_id DESC LIMIT $2',
    [businessId, limit],
  );
  return { items: result.rows.map((row) => ({ ...row, receivedAt: row.receivedAt.toISOString() })) };
}
