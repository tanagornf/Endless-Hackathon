export { signedMediaUrl, readChannelMedia } from './media';
export { connect, disconnect, getConnectionView, verify } from './connection';
import { db, type DbExecutor } from '../../core';
import type { LineEventRow } from '@nless/shared/features/line/types';

export async function listEvents(businessId: string, limit: number): Promise<{ items: LineEventRow[] }> {
  const result = await db.query<Omit<LineEventRow, 'receivedAt'> & { receivedAt: Date }>(
    'SELECT webhook_event_id AS "webhookEventId", event_type AS "eventType", message_type AS "messageType", is_redelivery AS "isRedelivery", state, note, received_at AS "receivedAt" FROM line_events WHERE business_id = $1 ORDER BY received_at DESC, webhook_event_id DESC LIMIT $2',
    [businessId, limit],
  );
  return { items: result.rows.map((row) => ({ ...row, receivedAt: row.receivedAt.toISOString() })) };
}

/** Nonsecret eligibility check for a proof-bound voice invitation. */
export async function isLineVoiceConnectionActive(businessId: string, lineBot: string, ex: DbExecutor = db): Promise<boolean> {
  return Boolean(await ex.maybeOne(`
    SELECT 1 FROM line_connections AS connection
    JOIN businesses AS shop ON shop.id = connection.business_id
    JOIN accounts AS account ON account.id = shop.account_id
    WHERE connection.business_id = $1 AND connection.bot_user_id = $2 AND connection.status = 'active'
      AND connection.channel_secret_enc IS NOT NULL AND shop.status = 'active' AND account.status = 'active'
  `, [businessId, lineBot]));
}
