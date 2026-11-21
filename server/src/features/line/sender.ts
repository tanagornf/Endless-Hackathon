import { createHash } from 'node:crypto';
import { z } from 'zod';
import { log, type ChannelSender, type DeliveryResult } from '../../core';
import { MAX_MESSAGES_PER_CALL, MAX_MESSAGES_PER_DELIVERY } from './config';
import { getAccessToken, isRejectedCredential, markConnectionError } from './connection';
import { lineErrorMessage, lineRequest, type LineResponse } from './lineApi';
import { toLineText } from './outbound';
import { clearReplyBatch, completeDeliveryBatch, findContact, findDeliveryBatch, findOutboundConnection, reservePushBatch, reserveReplyBatch } from './repo';
import { notifyQuota } from './usage';

function retryKeyFor(messageId: string, index: number) {
  const hash = createHash('sha256').update(messageId + ':' + index).digest();
  hash[6] = (hash[6] & 0x0f) | 0x40;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}

const Sent = z.object({ sentMessages: z.array(z.object({ id: z.union([z.string(), z.number()]) })) });
const InboundMeta = z.object({
  replyToken: z.string().optional(),
  replyTokenIssuedAt: z.string().optional(),
  replyTokenExpiresAt: z.string().optional(),
});

function acknowledgedBatch(response: LineResponse) {
  const parsed = Sent.safeParse(response.body);
  const sent = parsed.success ? parsed.data.sentMessages.map((message) => String(message.id)) : [];
  const requestId = response.headers.get('x-line-accepted-request-id') ?? response.headers.get('x-line-request-id');
  return { state: 'accepted' as const, sent_ids: sent, request_id: requestId };
}

function fail(error: string, retryable = false): DeliveryResult {
  return { mode: 'real', state: 'failed', error, retryable };
}

const PUSH_RETRY_TTL_MS = 24 * 60 * 60 * 1_000;
const unknown: DeliveryResult = { mode: 'real', state: 'unknown', error: 'line_delivery_unknown' };

export function makeLineSender(now = Date.now): ChannelSender {
  return {
    channel: 'line', mode: 'real',
    async send(delivery) {
      let ambiguousDelivery = false;
      try {
        const connection = await findOutboundConnection(delivery.businessId, delivery.channelAccountId);
        if (!connection) return fail('CHANNEL_NOT_CONNECTED: line connection missing or disconnected');
        if (connection.status_reason === 'bot_changed') return fail('CHANNEL_NOT_CONNECTED: LINE bot identity changed');
        const meta = InboundMeta.safeParse(delivery.lastInboundMeta).data;
        const issued = Date.parse(meta?.replyTokenIssuedAt ?? '');
        const contact = await findContact(delivery.businessId, delivery.customerExternalId);
        if (contact?.is_following === false && (Number.isNaN(issued) || !contact.unfollowed_at || contact.unfollowed_at.getTime() >= issued)) {
          return fail('recipient_unfollowed');
        }

        const messages = toLineText(delivery.parts);
        if (!messages.length) return fail('unsupported_part');
        if (messages.length > MAX_MESSAGES_PER_DELIVERY) return fail('too_many_parts');
        const batchCount = Math.ceil(messages.length / MAX_MESSAGES_PER_CALL);
        let externalRef: string | null = null;
        let token: string | undefined;

        for (let index = 0; index < batchCount; index++) {
          const key = { businessId: delivery.businessId, messageId: delivery.messageId, index, retryKey: retryKeyFor(delivery.messageId, index) };
          const prior = await findDeliveryBatch(key);
          if (prior?.state === 'unknown') return unknown;
          if (prior?.state === 'accepted') {
            externalRef = prior.sent_ids[0] ?? prior.request_id;
            continue;
          }
          if (!token) {
            try {
              token = await getAccessToken(connection);
            } catch (error) {
              if (isRejectedCredential(error)) {
                await markConnectionError(connection, 'token_rejected');
                return fail('token_rejected');
              }
              return fail('line_token_unavailable', true);
            }
          }

          const batch = messages.slice(index * MAX_MESSAGES_PER_CALL, (index + 1) * MAX_MESSAGES_PER_CALL);
          const replyToken = meta?.replyToken;
          const replyUntil = Date.parse(meta?.replyTokenExpiresAt ?? '');
          let mode: 'reply' | 'push' = 'push';
          let response: LineResponse | null = null;
          if (!prior && index === 0 && replyToken && now() < replyUntil &&
            await reserveReplyBatch(key, createHash('sha256').update(replyToken).digest('hex'))) {
            mode = 'reply';
            ambiguousDelivery = true;
            response = await lineRequest('/v2/bot/message/reply', { method: 'POST', token, timeoutMs: 10_000, json: { replyToken, messages: batch } });
            // An upstream 5xx can arrive after LINE accepted a Reply. Keep the reservation and never fall back to Push.
            if (!response || response.status >= 500) return unknown;
            if (response.status !== 200) {
              ambiguousDelivery = false;
              await clearReplyBatch(key);
              if (response.status === 400 && /reply token/i.test(lineErrorMessage(response.body))) mode = 'push';
            }
          }
          if (mode === 'push') {
            // A reservation pins the batch to Push before LINE can accept it.
            const pending = await reservePushBatch(key);
            if (!pending) return unknown;
            key.retryKey = pending.retry_key;
            if (now() - pending.created_at.getTime() >= PUSH_RETRY_TTL_MS) {
              ambiguousDelivery = true;
              await completeDeliveryBatch(key, mode, { state: 'unknown', sent_ids: [], request_id: null });
              return unknown;
            }
            response = await lineRequest('/v2/bot/message/push', {
              method: 'POST', token, timeoutMs: 10_000, retryKey: key.retryKey, json: { to: delivery.customerExternalId, messages: batch },
            });
            if (!response) {
              ambiguousDelivery = true;
              await completeDeliveryBatch(key, mode, { state: 'unknown', sent_ids: [], request_id: null });
              return unknown;
            }
          }
          if (!response) return unknown;

          const status = response.status;
          if (status === 200 || (mode === 'push' && status === 409 && response.headers.has('x-line-accepted-request-id'))) {
            const accepted = acknowledgedBatch(response);
            await completeDeliveryBatch(key, mode, accepted, mode === 'push' && status === 200 ? batch.length : 0);
            ambiguousDelivery = false;
            externalRef = accepted.sent_ids[0] ?? accepted.request_id;
            continue;
          }
          const partial = index ? ' partial: ' + index + '/' + batchCount : '';
          if (status === 401 || status === 403) {
            await markConnectionError(connection, 'token_rejected');
            return fail('token_rejected' + partial);
          }
          if (status === 429) {
            if (/monthly limit/i.test(lineErrorMessage(response.body))) {
              await notifyQuota(delivery.businessId);
              return fail('line_quota_exhausted' + partial);
            }
            const retryAfter = response.headers.get('retry-after');
            return fail('line_rate_limited' + (retryAfter && /^\d{1,6}$/.test(retryAfter) ? ' retry_after=' + retryAfter : '') + partial, true);
          }
          return fail('line_' + status + partial, status >= 500);
        }
        return { mode: 'real', state: 'sent', externalRef };
      } catch {
        log.warn({ messageId: delivery.messageId }, 'LINE delivery state could not be persisted');
        return ambiguousDelivery ? unknown : fail('line_delivery_unavailable', true);
      }
    },
  };
}
