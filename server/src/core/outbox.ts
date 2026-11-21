import type { Channel, DeliveryMode, DeliveryState } from '@nless/shared/core/types';
import { audit } from './audit';
import { db } from './db';
import { log } from './log';
import { publish } from './realtime';
import type { ChannelSender, DeliveryResult, OutboundDelivery } from './types';

const DELIVERY_TIMEOUT_MS = 15_000;
export const INTERRUPTED_DELIVERY = 'interrupted: previous attempt may have been sent';

interface DeliveryKey { messageId: string; businessId: string }
export interface DeliveryChange extends DeliveryKey {
  conversationId: string;
  channel: Channel;
  mode: DeliveryMode | null;
  state: DeliveryState;
  error: string | null;
}

export class ChannelSendError extends Error {
  constructor(message: string, readonly options: { code: string; definitelyNotSent: boolean; retryable: boolean; providerStatus?: number }) { super(message); }
}

export function deliveryErrorCode(error?: string): string {
  return error && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(error) ? error : 'CHANNEL_DELIVERY_ERROR';
}

export async function markInflight({ messageId, businessId }: DeliveryKey, attempt: number): Promise<string | null> {
  const checkpoint = 'inflight:' + attempt;
  const changed = await db.query(`
    UPDATE messages SET delivery_error=$3
    WHERE id=$1 AND business_id=$2 AND delivery_state='pending'
      AND (delivery_error IS NULL OR delivery_error LIKE 'retry:%')`, [messageId, businessId, checkpoint]);
  return changed.rowCount ? checkpoint : null;
}

export async function publishDeliveryChange(change: DeliveryChange): Promise<void> {
  const { businessId, conversationId, messageId, state, mode, channel, error } = change;
  if (state === 'unknown') await audit({
    action: 'core.delivery.unknown', actorUserId: null, businessId, targetType: 'message', targetId: messageId,
    details: { channel, error },
  }).catch(() => log.warn({ messageId }, 'Delivery audit could not be written'));
  publish(businessId, { type: 'message.updated', conversationId, messageId, delivery: { state, mode } });
}

export async function settleDelivery(
  { messageId, businessId }: DeliveryKey, checkpoint: string | null,
  result: { state: Exclude<DeliveryState, 'not_required'>; error: string | null; mode?: DeliveryMode; externalRef?: string | null },
): Promise<void> {
  const changed = await db.maybeOne<DeliveryChange>(`
    UPDATE messages
    SET delivery_state=$3,delivery_mode=COALESCE($4,delivery_mode),delivery_error=$5,delivery_external_ref=$6
    WHERE id=$1 AND business_id=$2 AND delivery_state='pending' AND delivery_error LIKE 'inflight:%'
      AND ($7::text IS NULL OR delivery_error=$7)
    RETURNING id AS "messageId", business_id AS "businessId", conversation_id AS "conversationId",
      channel, delivery_state AS state, delivery_mode AS mode, delivery_error AS error`,
    [messageId, businessId, result.state, result.mode ?? null, result.error, result.externalRef ?? null, checkpoint]);
  if (changed) await publishDeliveryChange(changed);
}

export function resolveAmbiguous(key: DeliveryKey): Promise<void> {
  return settleDelivery(key, null, { state: 'unknown', error: INTERRUPTED_DELIVERY });
}

export async function attemptDelivery(sender: ChannelSender, delivery: OutboundDelivery): Promise<DeliveryResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<DeliveryResult>((resolve) => {
    timer = setTimeout(() => resolve({ state: 'unknown', mode: sender.mode, error: 'PROVIDER_TIMEOUT' }), DELIVERY_TIMEOUT_MS);
  });
  try {
    return await Promise.race([sender.send(delivery), deadline]);
  } catch (error) {
    const failure = error instanceof ChannelSendError ? error.options : undefined;
    const state = failure?.definitelyNotSent ? 'failed' : 'unknown';
    return { state, mode: sender.mode, error: failure?.code, retryable: state === 'failed' && failure?.retryable };
  } finally {
    clearTimeout(timer);
  }
}
