import type { Channel, DeliveryMode, MessageAuthor, MessagePart } from '@nless/shared/core/types';
import { getConversation, saveMessage } from '../features/inbox/service';
import { db } from './db';
import { AppError } from './errors';
import { jobs, registerJob } from './jobs';
import { log } from './log';
import { publish } from './realtime';
import type { ChannelSender, DeliveryResult, OutboundDelivery, SendReceipt, SendToCustomerOptions } from './types';

const senders = new Map<Channel, ChannelSender>();
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

export class ChannelSendError extends Error {
  constructor(message: string, readonly options: { code: string; definitelyNotSent: boolean; retryable: boolean; providerStatus?: number }) { super(message); }
}

export async function sendToCustomer(conversationId: string, parts: MessagePart[], opts?: SendToCustomerOptions): Promise<SendReceipt> {
  const conversation = await getConversation(conversationId, { businessId: opts?.businessId });
  if (!conversation) throw new AppError('NOT_FOUND', 'Conversation not found');
  const { businessId, channel } = conversation;
  const sender = senders.get(channel);
  if (!sender) throw new AppError('CHANNEL_NOT_CONNECTED', 'Channel is unavailable');
  const messageId = opts?.messageId ?? (await saveMessage({
    businessId, conversationId, parts, direction: 'outbound', author: opts?.author ?? 'ai',
    authorUserId: opts?.authorUserId, origin: opts?.origin, clientRequestId: opts?.clientRequestId,
  })).message.id;
  const stored = await db.query(`UPDATE messages SET delivery_mode=COALESCE(delivery_mode,$4),
    delivery_state=CASE WHEN delivery_state='not_required' THEN 'pending' ELSE delivery_state END
    WHERE id=$1 AND conversation_id=$2 AND business_id=$3 AND direction='outbound'`, [messageId, conversationId, businessId, sender.mode]);
  if (!stored.rowCount) throw new AppError('NOT_FOUND', 'Outbound message not found');
  const job = await jobs.enqueue('core.deliver', { messageId }, { businessId, dedupKey: 'deliver:' + messageId, lockKey: 'conversation:' + conversationId });
  return { messageId, conversationId, channel, jobId: job.jobId, delivery: { mode: sender.mode, state: 'pending' } };
}

registerJob('core.deliver', async ({ payload, businessId, attempt, maxAttempts, signal }) => {
  const messageId = String(payload.messageId);
  const row = await db.maybeOne<Omit<OutboundDelivery, 'messageId' | 'attempt'> & {
    author: MessageAuthor;
    handoffAckVersion: unknown;
  }>(`
    SELECT m.conversation_id AS "conversationId",m.business_id AS "businessId",m.channel,m.parts,m.author,
      m.provider_meta->'nlessHandoffAckVersion' AS "handoffAckVersion",
      u.external_id AS "customerExternalId",u.channel_account_id AS "channelAccountId",
      COALESCE((SELECT inbound.provider_meta FROM messages inbound WHERE inbound.conversation_id=m.conversation_id
        AND inbound.direction='inbound' ORDER BY inbound.seq DESC LIMIT 1),'{}'::jsonb) AS "lastInboundMeta"
    FROM messages m JOIN conversations c ON c.id=m.conversation_id JOIN customers u ON u.id=c.customer_id
    WHERE m.id=$1 AND m.business_id=$2 AND m.delivery_state='pending' AND m.direction='outbound'`, [messageId, businessId]);
  if (!row) return;
  const { author, handoffAckVersion, ...delivery } = row;
  const sender = senders.get(delivery.channel);
  if (!sender) throw new AppError('CHANNEL_NOT_CONNECTED', 'Channel is unavailable');
  signal.throwIfAborted();
  if (author === 'ai') {
    const { getBusinessSettings } = await import('../features/business-settings/service.js');
    const settings = await getBusinessSettings(delivery.businessId);
    const conversation = settings.aiEnabled
      ? await getConversation(delivery.conversationId, { businessId: delivery.businessId })
      : null;
    signal.throwIfAborted();

    // F10's code-authored acknowledgement may follow its own handoff, at that exact assignment version.
    const currentHandoffAck = typeof handoffAckVersion === 'number' && conversation?.version === handoffAckVersion;
    if (conversation?.status !== 'open' || (conversation.handler !== 'ai' && !currentHandoffAck)) {
      const failed = await db.maybeOne<{ mode: DeliveryMode | null }>(`
        UPDATE messages SET delivery_state='failed',delivery_error='AI_DELIVERY_SUPPRESSED'
        WHERE id=$1 AND business_id=$2 AND delivery_state='pending'
        RETURNING delivery_mode AS mode`, [messageId, delivery.businessId]);
      if (failed) publish(delivery.businessId, {
        type: 'message.updated', conversationId: delivery.conversationId, messageId,
        delivery: { state: 'failed', mode: failed.mode },
      });
      return;
    }
  }
  let result: DeliveryResult;
  try {
    result = await sender.send({ ...delivery, messageId, attempt });
  } catch (error) {
    if (error instanceof ChannelSendError && error.options.retryable && error.options.definitelyNotSent && attempt < maxAttempts) {
      throw new AppError('PROVIDER_UNAVAILABLE', 'Channel requested a retry', { retryable: true });
    }
    result = { state: error instanceof ChannelSendError && error.options.definitelyNotSent ? 'failed' : 'unknown', mode: sender.mode, error: 'CHANNEL_DELIVERY_ERROR' };
  }
  if (result.state === 'failed' && result.retryable && attempt < maxAttempts) throw new AppError('PROVIDER_UNAVAILABLE', 'Channel requested a retry', { retryable: true });
  await db.query(`UPDATE messages SET delivery_state=$3,delivery_mode=$4,delivery_external_ref=$5,delivery_error=$6
    WHERE id=$1 AND business_id=$2 AND delivery_state='pending'`, [messageId, row.businessId, result.state,
    result.mode, result.externalRef ?? result.simulatedRef ?? null, result.error ? 'CHANNEL_DELIVERY_ERROR' : null]);
  publish(row.businessId, { type: 'message.updated', conversationId: row.conversationId, messageId, delivery: { state: result.state, mode: result.mode } });
});
