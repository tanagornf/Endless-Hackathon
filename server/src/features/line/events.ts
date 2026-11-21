import { config, decryptSecret, log, type JobHandler } from '../../core';
import { saveMessage } from '../inbox/service';
import { isHumanTakeover } from '../team/service';
import { getBusinessSettings } from '../business-settings/service';
import { notify } from '../notifications/service';
import { EVENT_MAX_AGE_MS, PROFILE_TTL_MS, REPLY_TOKEN_TTL_MS } from './config';
import { getAccessToken } from './connection';
import { lineRequest } from './lineApi';
import { inboundTextParts, LineEvent } from './normalize';
import { cacheProfile, findContact, findJobConnection, finishEvent, setFollowing, type LineConnection } from './repo';
import { z } from 'zod';

export type LineEventJobPayload = {
  connectionId: string;
  event: { webhookEventId: string; encrypted: string };
  receivedAtMs: number;
};

const Profile = z.object({ displayName: z.string().min(1).max(256), language: z.string().max(32).optional() });

async function profileName(connection: LineConnection, userId: string, signal: AbortSignal): Promise<string> {
  const contact = await findContact(connection.business_id, userId);
  const fallback = contact?.display_name ?? 'LINE user';
  if (config.LINE_MODE !== 'real' || (contact?.profile_fetched_at && Date.now() - contact.profile_fetched_at.getTime() < PROFILE_TTL_MS)) return fallback;

  let profile: z.infer<typeof Profile> | null = null;
  try {
    const reply = await lineRequest('/v2/bot/profile/' + encodeURIComponent(userId), { token: await getAccessToken(connection), signal });
    const parsed = Profile.safeParse(reply?.body);
    if (reply?.status === 200 && parsed.success) profile = parsed.data;
  } catch {
    log.debug({ connectionId: connection.id }, 'LINE contact profile unavailable');
  }
  await cacheProfile(connection.business_id, userId, profile?.displayName ?? null, profile?.language ?? null,
    new Date(profile ? Date.now() : Date.now() - PROFILE_TTL_MS + 3_600_000));
  return profile?.displayName ?? fallback;
}

async function showTyping(connection: LineConnection, conversationId: string, userId: string, signal: AbortSignal) {
  if (config.LINE_MODE !== 'real') return;
  try {
    const settings = await getBusinessSettings(connection.business_id);
    if (!settings.aiEnabled || await isHumanTakeover(conversationId)) return;
    await lineRequest('/v2/bot/chat/loading/start', {
      method: 'POST', token: await getAccessToken(connection), signal, json: { chatId: userId, loadingSeconds: 30 },
    });
  } catch {
    log.debug({ connectionId: connection.id }, 'LINE typing animation unavailable');
  }
}

export const lineEventJob: JobHandler<LineEventJobPayload> = async (job) => {
  const businessId = job.businessId;
  if (!businessId) throw new Error('LINE event has no business');
  const { connectionId, receivedAtMs } = job.payload;
  const { webhookEventId, encrypted } = job.payload.event;
  const connection = await findJobConnection(businessId, connectionId);
  if (!connection) return finishEvent(webhookEventId, businessId, 'ignored', 'connection_gone');
  if (connection.business_status !== 'active') return finishEvent(webhookEventId, businessId, 'ignored', 'business_inactive');

  let rawEvent: unknown;
  try {
    rawEvent = JSON.parse(decryptSecret(encrypted));
  } catch {
    return finishEvent(webhookEventId, businessId, 'failed', 'invalid_event_payload');
  }
  const parsed = LineEvent.safeParse(rawEvent);
  if (!parsed.success || parsed.data.webhookEventId !== webhookEventId) {
    return finishEvent(webhookEventId, businessId, 'ignored', 'invalid_event');
  }
  const event = parsed.data;
  if (event.timestamp < Date.now() - EVENT_MAX_AGE_MS) return finishEvent(webhookEventId, businessId, 'ignored', 'stale');
  const userId = event.source?.userId;
  if (event.source?.type !== 'user' || !userId) return finishEvent(webhookEventId, businessId, 'ignored', 'group_source');
  const occurredAt = new Date(Math.min(Date.now(), event.timestamp));
  const message = event.message;
  const customer = {
    channel: 'line' as const, externalId: userId, displayName: 'LINE user', channelAccountId: connection.bot_user_id,
  };
  let language: 'th' | 'en' = 'th';

  try {
    if (event.type === 'follow' || event.type === 'unfollow') {
      await setFollowing(businessId, userId, event.type === 'follow', occurredAt);
      if (event.type === 'follow') await profileName(connection, userId, job.signal);
    } else if (event.type === 'message' && message) {
      if (message.type === 'sticker') language = (await getBusinessSettings(businessId)).language;
      const normalized = inboundTextParts(message, language);
      if (!normalized) return finishEvent(webhookEventId, businessId, 'ignored', message.type === 'text' ? 'empty' : 'unsupported_type');

      await setFollowing(businessId, userId, true, occurredAt);
      customer.displayName = await profileName(connection, userId, job.signal);
      const providerMeta: Record<string, unknown> = { lineEventId: webhookEventId };
      if (event.replyToken) {
        providerMeta.replyToken = event.replyToken;
        providerMeta.replyTokenIssuedAt = new Date(receivedAtMs).toISOString();
        providerMeta.replyTokenExpiresAt = new Date(receivedAtMs + REPLY_TOKEN_TTL_MS).toISOString();
      }
      const saved = await saveMessage({
        businessId, customer, direction: 'inbound', author: 'customer', origin: 'live',
        externalId: message.id, occurredAt: occurredAt.toISOString(), providerMeta, ...normalized,
      });
      if (saved.created && saved.aiJobId) await showTyping(connection, saved.conversation.id, userId, job.signal);
    } else {
      return finishEvent(webhookEventId, businessId, 'ignored', 'unsupported_type');
    }
  } catch {
    if (job.attempt < job.maxAttempts) throw new Error('LINE event processing failed');
    if (event.type === 'message' && message) {
      await saveMessage({
        businessId, customer, direction: 'inbound', author: 'customer', origin: 'live',
        externalId: message.id, occurredAt: occurredAt.toISOString(), triggerAi: false,
        parts: [{ type: 'text', text: language === 'en' ? '[LINE message that could not be received]' : '[ข้อความจาก LINE ที่ระบบรับไม่สำเร็จ]' }],
      }).catch(() => log.warn({ connectionId, webhookEventId }, 'Could not store failed LINE event placeholder'));
    }
    await finishEvent(webhookEventId, businessId, 'failed', 'processing_failed');
    await notify({
      businessId, to: { role: 'owners' }, type: 'system', link: '/channels',
      title: 'รับข้อความ LINE ไม่สำเร็จ / LINE event failed',
      body: 'ระบบประมวลผลข้อความ LINE ไม่สำเร็จ / The LINE event could not be processed.',
      dedupKey: 'line-event-failed:' + connection.id + ':' + new Date().toISOString().slice(0, 10),
    }).catch(() => log.warn({ connectionId, webhookEventId }, 'Could not notify owners of failed LINE event'));
    throw new Error('LINE event processing failed permanently');
  }
  await finishEvent(webhookEventId, businessId, 'done');
};
