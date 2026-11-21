import type { Channel, DeliveryMode, DeliveryState } from '@nless/shared/core/types';
import { audit } from './audit';
import { db } from './db';
import { log } from './log';
import { publish } from './realtime';
import type { ChannelSender, DbExecutor, DeliveryResult, OutboundDelivery } from './types';

const DELIVERY_TIMEOUT_MS = 15_000;
export const INTERRUPTED_DELIVERY = 'interrupted: previous attempt may have been sent';
const AMBIGUOUS_RETRY_CODE = /^(?:UNCERTAIN_|line_5[0-9][0-9]|line_delivery_unavailable)/i;

export function isAmbiguousRetry(marker?: string | null): boolean {
  return Boolean(marker?.startsWith('retry:') && AMBIGUOUS_RETRY_CODE.test(marker.slice(6)));
}

export function isAmbiguousLineFailure(channel: Channel, result: DeliveryResult): boolean {
  if (channel !== 'line' || result.state !== 'failed' || !result.error) return false;
  return AMBIGUOUS_RETRY_CODE.test(result.error) || / partial: [0-9]+\/[0-9]+$/.test(result.error);
}

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
  return error?.match(/^[A-Za-z][A-Za-z0-9_]{0,63}(?=$|[ :])/)?.[0] ?? 'CHANNEL_DELIVERY_ERROR';
}

export async function markInflight({ messageId, businessId }: DeliveryKey, attempt: number): Promise<string | null> {
  const checkpoint = 'inflight:' + attempt;
  const changed = await db.query(`
    UPDATE messages SET delivery_error=$3
    WHERE id=$1 AND business_id=$2 AND delivery_state='pending'
      AND (delivery_error IS NULL OR delivery_error LIKE 'retry:%')`, [messageId, businessId, checkpoint]);
  return changed.rowCount ? checkpoint : null;
}

type DeliveryJob = { id: string; type: string; business_id: string | null; attempts: number };
export type SettledDeliveryJob = DeliveryJob & { delivery: DeliveryChange | null };

// The caller defines settled_jobs with the job transition. Both updates commit together.
export const SETTLE_DEAD_DELIVERIES_SQL = `
  , dead_delivery AS (
    UPDATE messages m
    SET delivery_state=CASE WHEN m.delivery_error IS NULL OR (
      m.delivery_error LIKE 'retry:%' AND m.delivery_error !~* '^retry:(UNCERTAIN_|LINE_5[0-9][0-9]|LINE_DELIVERY_UNAVAILABLE)'
    ) THEN 'failed' ELSE 'unknown' END,
    delivery_error=CASE WHEN m.delivery_error IS NULL THEN 'DELIVERY_JOB_ENDED_BEFORE_DISPATCH'
      WHEN m.delivery_error LIKE 'retry:%' AND m.delivery_error !~* '^retry:(UNCERTAIN_|LINE_5[0-9][0-9]|LINE_DELIVERY_UNAVAILABLE)'
        THEN substring(m.delivery_error FROM 7)
      ELSE '${INTERRUPTED_DELIVERY}' END
    FROM settled_jobs j
    WHERE j.state IN ('dead','cancelled') AND j.type='core.deliver' AND m.business_id=j.business_id
      AND m.id::text=(j.payload->>'messageId') AND m.direction='outbound' AND m.delivery_state='pending'
    RETURNING j.id AS "jobId", m.id AS "messageId", m.business_id AS "businessId",
      m.conversation_id AS "conversationId", m.channel, m.delivery_state AS state, m.delivery_mode AS mode, m.delivery_error AS error
  )
  SELECT j.id,j.type,j.business_id,j.attempts,to_jsonb(d) AS delivery FROM settled_jobs j
    LEFT JOIN dead_delivery d ON d."jobId"=j.id
`;

export async function settleCancelledDelivery(transaction: DbExecutor, jobId: string): Promise<DeliveryChange | null> {
  const settled = await transaction.maybeOne<SettledDeliveryJob>(`
    WITH settled_jobs AS (SELECT id,type,business_id,attempts,payload,state FROM jobs WHERE id=$1 AND state='cancelled')
    ${SETTLE_DEAD_DELIVERIES_SQL}`, [jobId]);
  return settled?.delivery ?? null;
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
