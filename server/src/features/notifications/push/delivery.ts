import { randomUUID } from 'node:crypto';
import { AppError, assertRateLimit, db, decryptSecret, jobs } from '../../../core';
import type { JobContext } from '../../../core';
import { getNotificationPreference } from '../preferences';
import { pendingNoticeDestination, readPhoneNotice } from './destination';
import { pushCredentials } from './subscriptions';
import { isOpaqueId, sendPrivatePush } from './transport';
import type { PrivatePush, PushOutcome } from './transport';

export const notificationPushJob = 'notifications.push';
const maxAttempts = 3;

type PushJobPayload = { notificationId: string };
type Device = { id: string; endpoint: string; publicKeyEnc: string; authEnc: string };

function devicesFor(userId: string, device?: string) {
  return db.query<Device>(
    'SELECT id, endpoint, p256dh_enc AS "publicKeyEnc", auth_enc AS "authEnc" ' +
    'FROM push_subscriptions WHERE user_id = $1 AND ($2::uuid IS NULL OR id = $2) ORDER BY id',
    [userId, device ?? null],
  );
}

export async function enqueueNotificationPush(notificationId: string, businessId: string): Promise<void> {
  if (!pushCredentials) return;
  await jobs.enqueue(notificationPushJob, { notificationId }, {
    businessId, dedupKey: notificationPushJob + ':' + notificationId, maxAttempts,
  });
}

async function reserveDelivery(noticeId: string | null, device: Device, userId: string) {
  return db.maybeOne<{ id: string; ref: string }>(
    'INSERT INTO push_deliveries (notification_id, subscription_id, user_id, ref, state, attempt_count) ' +
    "SELECT $1, s.id, s.user_id, $6, 'pending', 1 FROM push_subscriptions s " +
    'WHERE s.id = $2 AND s.user_id = $3 AND s.p256dh_enc = $4 AND s.auth_enc = $5 ' +
    'ON CONFLICT (notification_id, subscription_id) WHERE notification_id IS NOT NULL AND subscription_id IS NOT NULL ' +
    "DO UPDATE SET state = 'pending', status_code = NULL, attempt_count = push_deliveries.attempt_count + 1 " +
    "WHERE push_deliveries.state = 'failed' AND push_deliveries.acked_at IS NULL AND push_deliveries.user_id = EXCLUDED.user_id " +
    'AND push_deliveries.attempt_count < $7 AND (push_deliveries.status_code = 429 OR push_deliveries.status_code >= 500) ' +
    'RETURNING id, ref',
    [noticeId, device.id, userId, device.publicKeyEnc, device.authEnc, randomUUID(), maxAttempts],
  );
}

async function persistOutcome(deliveryId: string, userId: string, device: Device, outcome: PushOutcome) {
  // An absent HTTP status cannot prove which side processed the request. Keep the reserved
  // ref eligible for device ACK and prevent an uncertain attempt from sending a second alert.
  if (outcome.state === 'retry' && outcome.status === undefined) return;
  const state = outcome.state === 'retry' ? 'failed' : outcome.state;
  const deviceKey = [device.id, userId, device.publicKeyEnc, device.authEnc];
  const match = 'WHERE id = $1 AND user_id = $2 AND p256dh_enc = $3 AND auth_enc = $4';
  await db.tx(async (tx) => {
    await tx.query('UPDATE push_deliveries SET state = $2, status_code = $3 WHERE id = $1 AND user_id = $4',
      [deliveryId, state, outcome.status ?? null, userId]);
    if (state === 'accepted') {
      await tx.query('UPDATE push_subscriptions SET last_accepted_at = now(), failure_count = 0 ' + match, deviceKey);
    } else if (state === 'gone') {
      await tx.query('DELETE FROM push_subscriptions ' + match, deviceKey);
    } else if (outcome.state === 'failed') {
      await tx.query('UPDATE push_subscriptions SET failure_count = failure_count + 1 ' + match, deviceKey);
      await tx.query('DELETE FROM push_subscriptions ' + match + ' AND failure_count >= 5', deviceKey);
    }
  });
}

async function deliverToDevice(
  userId: string, device: Device, payload: Omit<PrivatePush, 'ref'> & { urgency: 'normal' | 'high' },
): Promise<PushOutcome | null> {
  if (!pushCredentials) return null;
  const delivery = await reserveDelivery(payload.noticeId, device, userId);
  if (!delivery) return null;

  let keys: { p256dh: string; auth: string };
  try {
    keys = { p256dh: decryptSecret(device.publicKeyEnc), auth: decryptSecret(device.authEnc) };
  } catch {
    const outcome = { state: 'failed' } as const;
    await persistOutcome(delivery.id, userId, device, outcome);
    return outcome;
  }
  const outbound = await sendPrivatePush({ endpoint: device.endpoint, keys }, { ...payload, ref: delivery.ref }, pushCredentials);
  await persistOutcome(delivery.id, userId, device, outbound);
  return outbound;
}

export async function handleNotificationPush(job: JobContext<PushJobPayload>): Promise<void> {
  if (!pushCredentials || !job.businessId || !isOpaqueId(job.payload?.notificationId) || job.signal.aborted) return;
  const notice = await readPhoneNotice(job.payload.notificationId, { businessId: job.businessId });
  if (!notice || !await pendingNoticeDestination(notice)) return;
  const preference = await getNotificationPreference(notice.userId, notice.type);
  if (!preference.inApp || !preference.push || job.signal.aborted) return;

  const { rows } = await devicesFor(notice.userId);
  if (job.signal.aborted) return;
  const results = await Promise.allSettled(rows.map((device) => deliverToDevice(notice.userId, device, {
    noticeId: notice.id, language: notice.language,
    urgency: notice.purpose.kind === 'staff-offer' ? 'high' : 'normal',
  })));
  const needsRetry = results.some((result) => result.status === 'rejected' ||
    (result.value?.state === 'retry' && result.value.status !== undefined));
  if (needsRetry) throw new Error('A notification provider delivery needs retry');
}

export async function testPhonePush(userId: string, language: 'th' | 'en', device?: string) {
  assertRateLimit({ key: 'notifications.push.test:' + userId, limit: 5, windowSeconds: 60 });
  if (!pushCredentials) throw new AppError('POLICY_BLOCKED', 'Phone push is not configured');
  const { rows } = await devicesFor(userId, device);
  if (!rows.length) throw new AppError('POLICY_BLOCKED', 'No enrolled push device', { details: { reason: 'no_subscription' } });
  const results = await Promise.all(rows.map((subscription) => deliverToDevice(userId, subscription, {
    noticeId: null, language, urgency: 'normal',
  })));
  return {
    attempted: results.filter(Boolean).length,
    accepted: results.filter((outcome) => outcome?.state === 'accepted').length,
    gone: results.filter((outcome) => outcome?.state === 'gone').length,
    failed: results.filter((outcome) => outcome?.state === 'failed' || outcome?.state === 'retry').length,
    mode: 'real' as const,
  };
}
