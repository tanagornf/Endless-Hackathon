import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { decryptSecret, encryptSecret, jobs, log, rateLimit, type WebhookHandler } from '../../core';
import { CHANNEL_ID, LINE_EVENT_JOB } from './config';
import { detachLineReadToken, markLineMessageAsRead } from './read-receipt';
import { findWebhookConnection, recordWebhookEvent } from './repo';

const WebhookBody = z.object({
  destination: z.string(),
  events: z.array(z.record(z.string(), z.unknown())),
});
const EventHeader = z.object({
  webhookEventId: z.string().min(1).max(128),
  mode: z.string().optional(),
  type: z.string().max(100).optional(),
  message: z.object({ type: z.string().max(100).optional() }).optional(),
  source: z.object({ userId: z.string().min(1).max(128).optional() }).optional(),
  deliveryContext: z.object({ isRedelivery: z.boolean().optional() }).optional(),
});
const acknowledged = { status: 200, body: {} };

function validSignature(rawBody: Uint8Array, signature: string | string[] | undefined, secret: string): boolean {
  if (typeof signature !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(signature)) return false;
  const received = Buffer.from(signature, 'base64');
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  return received.length === expected.length && timingSafeEqual(expected, received);
}

const limited = { status: 429, body: { error: 'rate_limited' } };

export const handleLineWebhook: WebhookHandler = async (ctx) => {
  const channelId = ctx.params.channelId;
  if (!CHANNEL_ID.test(channelId)) return acknowledged;
  if (!rateLimit({ key: 'webhook:line:' + channelId, limit: 300, windowSeconds: 60 }).allowed) return limited;
  const receivedAtMs = Date.now();
  try {
    const connection = await findWebhookConnection(channelId);
    if (!connection?.channel_secret_enc) return acknowledged;
    if (ctx.rawBody.byteLength > 1_000_000) return { status: 413, body: { error: 'body_too_large' } };
    if (!validSignature(ctx.rawBody, ctx.headers['x-line-signature'], decryptSecret(connection.channel_secret_enc))) {
      if (!rateLimit({ key: 'webhook:line:bad:' + channelId, limit: 30, windowSeconds: 60 }).allowed) return limited;
      return { status: 401, body: { error: 'invalid_signature' } };
    }

    let json: unknown;
    try {
      json = JSON.parse(Buffer.from(ctx.rawBody).toString('utf8'));
    } catch {
      log.warn({ connectionId: connection.id }, 'Invalid signed LINE webhook JSON');
      return acknowledged;
    }
    const body = WebhookBody.safeParse(json);
    if (!body.success) {
      log.warn({ connectionId: connection.id }, 'Invalid signed LINE webhook body');
      return acknowledged;
    }
    if (body.data.destination !== connection.bot_user_id) return acknowledged;
    if (body.data.events.length > 100) {
      log.warn({ connectionId: connection.id }, 'LINE webhook contained more than 100 events');
    }

    for (const event of body.data.events.slice(0, 100)) {
      const parsed = EventHeader.safeParse(event);
      if (!parsed.success || parsed.data.mode === 'standby') continue;
      const header = parsed.data;
      const shouldQueue = await recordWebhookEvent({
        eventId: header.webhookEventId, businessId: connection.business_id, connectionId: connection.id,
        eventType: header.type ?? 'other', messageType: header.message?.type ?? null,
        redelivery: header.deliveryContext?.isRedelivery === true,
      });
      if (!shouldQueue) continue;
      const lockKey = ['line', connection.id, header.source?.userId].filter(Boolean).join(':');
      const inbound = detachLineReadToken(event, receivedAtMs);
      // The durable job keeps the event encrypted, including any customer text and reply token.
      const queued = await jobs.enqueue(LINE_EVENT_JOB, {
        connectionId: connection.id,
        event: { webhookEventId: header.webhookEventId, encrypted: encryptSecret(JSON.stringify(inbound.event)) },
        receivedAtMs,
      }, {
        dedupKey: 'line.event:' + header.webhookEventId,
        businessId: connection.business_id, lockKey, maxAttempts: 5,
      });
      if (!queued.deduped && inbound.markAsReadToken) {
        void markLineMessageAsRead(connection.access_token_enc, inbound.markAsReadToken);
      }
    }
    return acknowledged;
  } catch {
    log.warn({ requestId: ctx.requestId }, 'Could not accept LINE webhook');
    return { status: 500, body: { error: 'line_event_unavailable' } };
  }
};
