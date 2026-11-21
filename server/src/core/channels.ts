import type { Channel, MessageAuthor, MessagePart } from '@nless/shared/core/types';
import { getConversation, saveMessage } from '../features/inbox/service';
import { db } from './db';
import { AppError } from './errors';
import { enqueueJob, notifyJobEnqueued, registerJob } from './jobs';
import { log } from './log';
import { attemptDelivery, deliveryErrorCode, isAmbiguousLineFailure, isAmbiguousRetry, markInflight, publishDeliveryChange, resolveAmbiguous, settleDelivery } from './outbox';
import type { DeliveryChange } from './outbox';
import type { ChannelSender, OutboundDelivery, SendReceipt, SendToCustomerOptions } from './types';

const senders = new Map<Channel, ChannelSender>();

function canDispatch(channel: Channel): boolean {
  return channel === 'line' || channel === 'web';
}
export function registerChannelSender(channel: Channel, sender: ChannelSender): void {
  if (channel !== sender.channel) throw new Error('Sender channel does not match registration');
  if (senders.has(channel)) log.warn({ channel }, 'Replacing channel sender');
  senders.set(channel, sender);
}
for (const channel of ['web', 'line', 'facebook', 'instagram'] as const) {
  const mode = channel === 'web' ? 'real' : 'sandbox';
  senders.set(channel, {
    channel,
    mode,
    async send(delivery) {
      return { state: 'sent', mode, simulatedRef: mode === 'sandbox' ? 'sandbox-' + delivery.messageId : null };
    },
  });
}

export { ChannelSendError } from './outbox';

const DELIVERY_ENQUEUE_FAILED = 'DELIVERY_ENQUEUE_FAILED';

async function recoverDeliveryEnqueue(
  messageId: string, conversationId: string, businessId: string,
): Promise<string | null> {
  const disposition = await db.tx(async (transaction) => {
    const scope = [messageId, conversationId, businessId];
    // Serialize the recovery check with any retry that could commit a competing delivery.
    const message = await transaction.maybeOne(`
      SELECT id FROM messages WHERE id=$1 AND conversation_id=$2 AND business_id=$3
        AND direction='outbound' FOR UPDATE`, scope);
    if (!message) return null;
    const accepted = await transaction.maybeOne<{ id: string }>(`
      SELECT id FROM jobs WHERE business_id=$1 AND type='core.deliver'
        AND payload->>'messageId'=$2 AND state IN ('queued','running','succeeded')
      ORDER BY (state='succeeded') DESC, created_at LIMIT 1`, [businessId, messageId]);
    if (accepted) return { jobId: accepted.id, change: null };
    const terminalCanonical = await transaction.maybeOne(`
      SELECT id FROM jobs WHERE business_id=$1 AND type='core.deliver' AND payload->>'messageId'=$2
        AND dedup_key=$3 AND state NOT IN ('queued','running','succeeded')`,
    [businessId, messageId, 'deliver:' + messageId]);
    if (terminalCanonical) return null;
    const change = await transaction.maybeOne<DeliveryChange>(`
      UPDATE messages SET delivery_state='failed',delivery_error=$4
      WHERE id=$1 AND conversation_id=$2 AND business_id=$3 AND direction='outbound'
        AND delivery_state IN ('not_required','pending') AND delivery_error IS NULL AND delivery_external_ref IS NULL
      RETURNING id AS "messageId",conversation_id AS "conversationId",business_id AS "businessId",
        channel,delivery_state AS state,delivery_mode AS mode,delivery_error AS error`, [...scope, DELIVERY_ENQUEUE_FAILED]);
    return { jobId: null, change };
  });
  if (disposition?.change) await publishDeliveryChange(disposition.change);
  return disposition?.jobId ?? null;
}

export async function sendToCustomer(conversationId: string, parts: MessagePart[], opts?: SendToCustomerOptions): Promise<SendReceipt> {
  const conversation = await getConversation(conversationId, { businessId: opts?.businessId });
  if (!conversation) throw new AppError('NOT_FOUND', 'Conversation not found');
  const { businessId, channel } = conversation;
  if (!canDispatch(channel)) throw new AppError('POLICY_BLOCKED', 'This messaging channel is deferred for the release', {
    details: { reason: 'channel_deferred' },
  });
  const sender = senders.get(channel);
  if (!sender) throw new AppError('CHANNEL_NOT_CONNECTED', 'Channel is unavailable');
  const messageId = opts?.messageId ?? (await saveMessage({
    businessId, conversationId, parts, direction: 'outbound', author: opts?.author ?? 'ai',
    authorUserId: opts?.authorUserId, origin: opts?.origin, clientRequestId: opts?.clientRequestId,
  })).message.id;
  const enqueueOptions = { businessId, dedupKey: 'deliver:' + messageId, lockKey: 'conversation:' + conversationId, maxAttempts: 5 };
  let jobId: string;
  try {
    const job = await db.tx(async (transaction) => {
      const scope = [messageId, conversationId, businessId];
      const stored = await transaction.maybeOne(`
        SELECT id FROM messages WHERE id=$1 AND conversation_id=$2 AND business_id=$3
          AND direction='outbound' FOR UPDATE`, scope);
      if (!stored) throw new AppError('NOT_FOUND', 'Outbound message not found');

      const job = await enqueueJob(transaction, 'core.deliver', { messageId }, enqueueOptions);
      if (job.deduped) {
        const existing = await transaction.one<{ state: string }>(
          'SELECT state FROM jobs WHERE id=$1 AND business_id=$2 AND type=$3', [job.jobId, businessId, 'core.deliver'],
        );
        if (!['queued', 'running', 'succeeded'].includes(existing.state)) {
          throw new AppError('POLICY_BLOCKED', 'The canonical delivery job is already terminal', {
            details: { reason: 'delivery_job_terminal' },
          });
        }
        return job;
      }
      await transaction.query(`UPDATE messages SET delivery_mode=COALESCE(delivery_mode,$4),
        delivery_error=CASE WHEN delivery_state='failed' AND delivery_error=$5 THEN NULL ELSE delivery_error END,
        delivery_state=CASE WHEN delivery_state='not_required' OR (delivery_state='failed' AND delivery_error=$5)
          THEN 'pending' ELSE delivery_state END
        WHERE id=$1 AND conversation_id=$2 AND business_id=$3 AND direction='outbound'`,
      [...scope, sender.mode, DELIVERY_ENQUEUE_FAILED]);
      return job;
    });
    jobId = job.jobId;
    notifyJobEnqueued('core.deliver', job, enqueueOptions);
  } catch (error) {
    const accepted = await recoverDeliveryEnqueue(messageId, conversationId, businessId).catch(() => {
      log.warn({ messageId }, 'Could not reconcile a failed delivery enqueue');
      return null;
    });
    if (!accepted) throw error;
    jobId = accepted;
  }
  return { messageId, conversationId, channel, jobId, delivery: { mode: sender.mode, state: 'pending' } };
}

async function aiDeliveryAllowed(delivery: Pick<OutboundDelivery, 'businessId' | 'conversationId'>, handoffAckVersion: unknown) {
  const { getBusinessSettings } = await import('../features/business-settings/service.js');
  if (!(await getBusinessSettings(delivery.businessId)).aiEnabled) return false;
  const conversation = await getConversation(delivery.conversationId, { businessId: delivery.businessId });
  // F10's code-authored acknowledgement may follow its own handoff, at that exact assignment version.
  if (conversation?.status !== 'open') return false;
  if (handoffAckVersion == null) return conversation.handler === 'ai';
  return typeof handoffAckVersion === 'number' && conversation.version === handoffAckVersion;
}

registerJob('core.deliver', async ({ payload, businessId, attempt, maxAttempts, signal }) => {
  const messageId = String(payload.messageId);
  const row = await db.maybeOne<Omit<OutboundDelivery, 'messageId' | 'attempt'> & {
    author: MessageAuthor;
    handoffAckVersion: unknown;
    previousError: string | null;
  }>(`
    SELECT m.conversation_id AS "conversationId",m.business_id AS "businessId",m.channel,m.parts,m.author,m.delivery_error AS "previousError",
      m.provider_meta->'nlessHandoffAckVersion' AS "handoffAckVersion",
      u.external_id AS "customerExternalId",u.channel_account_id AS "channelAccountId",
      COALESCE((SELECT inbound.provider_meta FROM messages inbound WHERE inbound.conversation_id=m.conversation_id
        AND inbound.direction='inbound' ORDER BY inbound.seq DESC LIMIT 1),'{}'::jsonb) AS "lastInboundMeta"
    FROM messages m JOIN conversations c ON c.id=m.conversation_id JOIN customers u ON u.id=c.customer_id
    WHERE m.id=$1 AND m.business_id=$2 AND m.delivery_state='pending' AND m.direction='outbound'`, [messageId, businessId]);
  if (!row) return;
  const { author, handoffAckVersion, previousError, ...delivery } = row;
  const previousAmbiguity = isAmbiguousRetry(previousError);
  const key = { messageId, businessId: delivery.businessId };
  signal.throwIfAborted();
  const checkpoint = await markInflight(key, attempt);
  if (!checkpoint) return resolveAmbiguous(key);
  if (!canDispatch(delivery.channel)) {
    if (previousAmbiguity) return resolveAmbiguous(key);
    return settleDelivery(key, checkpoint, { state: 'failed', error: 'CHANNEL_DEFERRED' });
  }
  const sender = senders.get(delivery.channel);
  if (!sender) throw new AppError('CHANNEL_NOT_CONNECTED', 'Channel is unavailable');

  let allowed: boolean;
  try {
    allowed = author !== 'ai' || await aiDeliveryAllowed(delivery, handoffAckVersion);
  } catch (error) {
    const retryable = attempt < maxAttempts && (!(error instanceof AppError) || error.retryable);
    if (retryable) {
      await settleDelivery(key, checkpoint, { state: 'pending', error: previousAmbiguity ? previousError : 'retry:PREFLIGHT_UNAVAILABLE' });
    } else if (previousAmbiguity) {
      await resolveAmbiguous(key);
    } else {
      await settleDelivery(key, checkpoint, { state: 'failed', error: 'PREFLIGHT_UNAVAILABLE' });
    }
    throw error;
  }
  signal.throwIfAborted();
  if (!allowed) {
    if (previousAmbiguity) return resolveAmbiguous(key);
    return settleDelivery(key, checkpoint, { state: 'failed', error: 'AI_DELIVERY_SUPPRESSED' });
  }

  const result = await attemptDelivery(sender, { ...delivery, messageId, attempt });
  signal.throwIfAborted();
  const error = result.state === 'sent' ? null : deliveryErrorCode(result.error);
  const ambiguous = previousAmbiguity || isAmbiguousLineFailure(delivery.channel, result);
  if (result.state === 'failed' && result.retryable && attempt < maxAttempts) {
    await settleDelivery(key, checkpoint, { state: 'pending', mode: result.mode, error: 'retry:' + (ambiguous ? 'UNCERTAIN_' : '') + error });
    throw new AppError('PROVIDER_UNAVAILABLE', 'Channel requested a retry', { retryable: true });
  }
  await settleDelivery(key, checkpoint, {
    state: result.state === 'failed' && ambiguous ? 'unknown' : result.state, mode: result.mode, error, externalRef: result.externalRef ?? result.simulatedRef ?? null,
  });
});
