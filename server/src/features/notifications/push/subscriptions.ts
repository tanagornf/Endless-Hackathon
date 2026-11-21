import { z } from 'zod';
import { AppError, assertRateLimit, auditInTransaction, config, db } from '../../../core';
import { encryptSecret } from '../../../core';
import { normalizePushEndpoint, readPushCredentials } from './transport';

const maxDevices = 10;
const encoded = /^[A-Za-z0-9_-]+$/;
const browserKey = (bytes: number) => z.string().regex(encoded).refine((value) => {
  const decoded = Buffer.from(value, 'base64url');
  return decoded.length === bytes && decoded.toString('base64url') === value;
});
const endpointInput = z.string().min(1).max(1000);

export const subscribeBody = z.strictObject({
  endpoint: endpointInput,
  keys: z.strictObject({
    p256dh: browserKey(65).refine((value) => Buffer.from(value, 'base64url')[0] === 4),
    auth: browserKey(16),
  }),
  userAgent: z.string().max(300).optional(),
});
export const unsubscribeBody = z.strictObject({ endpoint: endpointInput });
export const acknowledgementBody = z.strictObject({ ref: z.uuid() });
export const pushStatusQuery = z.strictObject({ device: z.uuid().optional() });

export const pushCredentials = readPushCredentials({
  publicKey: config.VAPID_PUBLIC_KEY,
  privateKey: config.VAPID_PRIVATE_KEY,
  subject: config.VAPID_SUBJECT,
});

type SubscriptionInput = z.infer<typeof subscribeBody>;

export async function enrollPushDevice(userId: string, input: SubscriptionInput) {
  if (!pushCredentials) throw new AppError('POLICY_BLOCKED', 'Phone push is not configured');
  assertRateLimit({ key: 'notifications.push.subscribe:' + userId, limit: 10, windowSeconds: 3600 });
  const endpoint = normalizePushEndpoint(input.endpoint);
  if (!endpoint) throw new AppError('POLICY_BLOCKED', 'Push endpoint is not permitted', { details: { reason: 'endpoint_not_allowed' } });

  return db.tx(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(hashtext('notifications.push.devices:' || $1::text))", [userId]);
    const row = await tx.one<{ id: string }>(
      "INSERT INTO push_subscriptions (user_id, endpoint, p256dh_enc, auth_enc, user_agent) VALUES ($1, $2, $3, $4, $5) " +
      'ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh_enc = EXCLUDED.p256dh_enc, ' +
      'auth_enc = EXCLUDED.auth_enc, user_agent = EXCLUDED.user_agent, failure_count = 0, created_at = now(), ' +
      'last_accepted_at = CASE WHEN push_subscriptions.user_id = EXCLUDED.user_id THEN push_subscriptions.last_accepted_at END ' +
      'RETURNING id',
      [userId, endpoint, encryptSecret(input.keys.p256dh), encryptSecret(input.keys.auth), input.userAgent ?? null],
    );
    await tx.query(
      'DELETE FROM push_subscriptions WHERE id IN (' +
      'SELECT id FROM push_subscriptions WHERE user_id = $1 ORDER BY created_at DESC, id DESC OFFSET $2)',
      [userId, maxDevices],
    );
    await auditInTransaction(tx, [{ actorUserId: userId, action: 'notifications.push.subscribe', targetType: 'push_subscription', targetId: row.id }]);
    return { ok: true, deviceId: row.id };
  });
}

export async function removePushDevice(userId: string, rawEndpoint: string) {
  const endpoint = normalizePushEndpoint(rawEndpoint);
  if (!endpoint) return { ok: true };
  await db.tx(async (tx) => {
    const row = await tx.maybeOne<{ id: string }>(
      'DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2 RETURNING id', [userId, endpoint],
    );
    if (row) await auditInTransaction(tx, [
      { actorUserId: userId, action: 'notifications.push.unsubscribe', targetType: 'push_subscription', targetId: row.id },
    ]);
  });
  return { ok: true };
}

export async function readPhonePushStatus(userId: string, device?: string) {
  const subscriptions = await db.one<{ count: number; lastAcceptedAt: Date | null; hasDevice: boolean }>(
    'SELECT count(*)::int AS count, max(last_accepted_at) FILTER (WHERE $2::uuid IS NULL OR id = $2) AS "lastAcceptedAt", ' +
    'coalesce(bool_or(id = $2), false) AS "hasDevice" FROM push_subscriptions WHERE user_id = $1',
    [userId, device ?? null],
  );
  const ack = await db.maybeOne<{ ref: string; notificationId: string | null; at: Date }>(
    'SELECT d.ref, d.notification_id AS "notificationId", d.acked_at AS at FROM push_deliveries d ' +
    'JOIN push_subscriptions s ON s.id = d.subscription_id AND s.user_id = d.user_id ' +
    'WHERE d.user_id = $1 AND ($2::uuid IS NULL OR d.subscription_id = $2) AND d.acked_at IS NOT NULL ' +
    'ORDER BY d.acked_at DESC, d.id DESC LIMIT 1',
    [userId, device ?? null],
  );
  return {
    configured: Boolean(pushCredentials),
    mode: pushCredentials ? 'real' as const : 'sandbox' as const,
    publicKey: pushCredentials?.publicKey ?? null,
    subscriptions: subscriptions.count,
    enrolledOnDevice: subscriptions.hasDevice,
    lastAcceptedAt: subscriptions.lastAcceptedAt?.toISOString() ?? null,
    lastAckAt: ack?.at.toISOString() ?? null,
    lastAckRef: ack?.ref ?? null,
    lastAckNoticeId: ack?.notificationId ?? null,
  };
}

export async function acknowledgePhonePush(userId: string, ref: string) {
  await db.query(
    'UPDATE push_deliveries AS d SET acked_at = now() FROM push_subscriptions AS s ' +
    'WHERE d.ref = $1 AND d.user_id = $2 AND d.acked_at IS NULL ' +
    "AND d.state IN ('pending', 'accepted') AND s.id = d.subscription_id AND s.user_id = d.user_id",
    [ref, userId],
  );
  return { ok: true };
}
