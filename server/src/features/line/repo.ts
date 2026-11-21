import { db } from '../../core';

export interface LineConnection {
  id: string;
  business_id: string;
  channel_id: string;
  bot_user_id: string | null;
  basic_id: string | null;
  display_name: string;
  channel_secret_enc: string | null;
  access_token_enc: string | null;
  source: 'ui' | 'env';
  status: 'active' | 'error' | 'inactive';
  status_reason: string | null;
  generation: number;
  connected_at: Date;
  disconnected_at: Date | null;
  last_verified_at: Date | null;
  last_event_at: Date | null;
  events_total: string;
}

export function findWebhookConnection(channelId: string) {
  return db.maybeOne<LineConnection>(
    "SELECT lc.* FROM line_connections lc JOIN businesses b ON b.id = lc.business_id WHERE lc.channel_id = $1 AND lc.status IN ('active', 'error') AND b.status = 'active'",
    [channelId],
  );
}

export function findOutboundConnection(businessId: string, channelAccountId: string | null) {
  return db.maybeOne<LineConnection>(
    "SELECT lc.* FROM line_connections lc JOIN businesses b ON b.id = lc.business_id WHERE lc.business_id = $1 AND b.status = 'active' AND lc.status IN ('active', 'error') AND ($2::text IS NULL OR lc.bot_user_id = $2)",
    [businessId, channelAccountId],
  );
}

export function findJobConnection(businessId: string, connectionId: string) {
  return db.maybeOne<LineConnection & { business_status: string }>(
    "SELECT lc.*, b.status AS business_status FROM line_connections lc JOIN businesses b ON b.id = lc.business_id WHERE lc.id = $1 AND lc.business_id = $2 AND lc.status IN ('active', 'error')",
    [connectionId, businessId],
  );
}

interface WebhookEventRecord {
  eventId: string;
  businessId: string;
  connectionId: string;
  eventType: string;
  messageType: string | null;
  redelivery: boolean;
}

export function recordWebhookEvent(event: WebhookEventRecord): Promise<boolean> {
  return db.tx(async (tx) => {
    const created = await tx.query(
      "INSERT INTO line_events (webhook_event_id, business_id, connection_id, event_type, message_type, is_redelivery) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING",
      [event.eventId, event.businessId, event.connectionId, event.eventType, event.messageType, event.redelivery],
    );
    if (created.rowCount) {
      await tx.query(
        'UPDATE line_connections SET events_total = events_total + 1, last_event_at = now() WHERE id = $1 AND business_id = $2',
        [event.connectionId, event.businessId],
      );
      return true;
    }
    const stored = await tx.maybeOne<{ state: string }>(
      'SELECT state FROM line_events WHERE webhook_event_id = $1 AND business_id = $2 AND connection_id = $3',
      [event.eventId, event.businessId, event.connectionId],
    );
    return stored?.state === 'received';
  });
}

export async function finishEvent(eventId: string, businessId: string, state: 'done' | 'ignored' | 'failed', note: string | null = null) {
  await db.query("UPDATE line_events SET state = $3, note = $4, processed_at = now() WHERE webhook_event_id = $1 AND business_id = $2 AND state = 'received'", [eventId, businessId, state, note]);
}

export interface LineContact {
  is_following: boolean;
  unfollowed_at: Date | null;
  display_name: string | null;
  profile_fetched_at: Date | null;
}

export function findContact(businessId: string, userId: string) {
  return db.maybeOne<LineContact>('SELECT is_following, unfollowed_at, display_name, profile_fetched_at FROM line_contacts WHERE business_id = $1 AND line_user_id = $2', [businessId, userId]);
}

export async function setFollowing(businessId: string, userId: string, following: boolean, occurredAt: Date) {
  await db.query(
    "INSERT INTO line_contacts (business_id, line_user_id, is_following, followed_at, unfollowed_at) VALUES ($1, $2, $3, CASE WHEN $3 THEN $4::timestamptz END, CASE WHEN NOT $3 THEN $4::timestamptz END) " +
      "ON CONFLICT (business_id, line_user_id) DO UPDATE SET is_following = EXCLUDED.is_following, followed_at = COALESCE(EXCLUDED.followed_at, line_contacts.followed_at), unfollowed_at = COALESCE(EXCLUDED.unfollowed_at, line_contacts.unfollowed_at), updated_at = now() " +
      "WHERE $4 >= COALESCE(GREATEST(line_contacts.followed_at, line_contacts.unfollowed_at), '-infinity'::timestamptz)",
    [businessId, userId, following, occurredAt],
  );
}

export async function cacheProfile(businessId: string, userId: string, name: string | null, language: string | null, fetchedAt: Date) {
  await db.query(
    'UPDATE line_contacts SET display_name = COALESCE($3, display_name), language = COALESCE($4, language), profile_fetched_at = $5, updated_at = now() WHERE business_id = $1 AND line_user_id = $2',
    [businessId, userId, name, language, fetchedAt],
  );
}

export interface DeliveryBatch {
  state: 'accepted' | 'unknown';
  sent_ids: string[];
  request_id: string | null;
}

interface BatchKey {
  businessId: string;
  messageId: string;
  index: number;
  retryKey: string;
}

export function findDeliveryBatch(key: BatchKey) {
  return db.maybeOne<DeliveryBatch>(
    'SELECT b.state, b.sent_ids, b.request_id FROM line_delivery_batches b JOIN messages m ON m.id = b.message_id WHERE b.message_id = $1 AND b.batch_index = $2 AND m.business_id = $3',
    [key.messageId, key.index, key.businessId],
  );
}

export async function reserveReplyBatch(key: BatchKey, tokenHash: string) {
  return db.tx(async (tx) => {
    const token = await tx.query('INSERT INTO line_reply_tokens_used (token_hash) VALUES ($1) ON CONFLICT DO NOTHING', [tokenHash]);
    if (!token.rowCount) return false;
    // A crash or network timeout after the reply starts must never cause an automatic push.
    const batch = await tx.query(
      "INSERT INTO line_delivery_batches (message_id, batch_index, mode, retry_key, state) SELECT id, $2, 'reply', $3, 'unknown' FROM messages WHERE id = $1 AND business_id = $4 ON CONFLICT DO NOTHING",
      [key.messageId, key.index, key.retryKey, key.businessId],
    );
    if (!batch.rowCount) throw new Error('LINE reply batch is unavailable');
    return true;
  });
}

export async function clearReplyBatch(key: BatchKey) {
  await db.query(
    "DELETE FROM line_delivery_batches b USING messages m WHERE m.id = b.message_id AND b.message_id = $1 AND b.batch_index = $2 AND m.business_id = $3 AND b.mode = 'reply' AND b.state = 'unknown'",
    [key.messageId, key.index, key.businessId],
  );
}

export async function completeDeliveryBatch(key: BatchKey, mode: 'reply' | 'push', batch: DeliveryBatch, pushCount = 0) {
  await db.tx(async (tx) => {
    const saved = await tx.query(
      "INSERT INTO line_delivery_batches (message_id, batch_index, mode, retry_key, state, sent_ids, request_id) SELECT id, $2, $3, $4, $5, $6, $7 FROM messages WHERE id = $1 AND business_id = $8 ON CONFLICT (message_id, batch_index) DO UPDATE SET state = EXCLUDED.state, sent_ids = EXCLUDED.sent_ids, request_id = EXCLUDED.request_id WHERE line_delivery_batches.state = 'unknown' AND line_delivery_batches.mode = 'reply' AND EXCLUDED.mode = 'reply'",
      [key.messageId, key.index, mode, key.retryKey, batch.state, batch.sent_ids, batch.request_id, key.businessId],
    );
    if (saved.rowCount && pushCount) {
      await tx.query(
        "INSERT INTO line_push_usage (business_id, month, push_calls, push_messages) VALUES ($1, date_trunc('month', now() AT TIME ZONE 'Asia/Bangkok')::date, 1, $2) ON CONFLICT (business_id, month) DO UPDATE SET push_calls = line_push_usage.push_calls + 1, push_messages = line_push_usage.push_messages + EXCLUDED.push_messages",
        [key.businessId, pushCount],
      );
    }
  });
}
