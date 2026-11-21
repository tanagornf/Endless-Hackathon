import { config, log } from '../../core';
import { EVENT_MAX_AGE_MS } from './config';
import { getAccessToken } from './connection';
import { lineRequest } from './lineApi';
import { LineEvent } from './normalize';
import type { LineConnection } from './repo';

const READ_RECEIPT_TIMEOUT_MS = 1_500;

/** Keep the read token solely in the request path, outside durable job payloads. */
export function detachLineReadToken(event: Record<string, unknown>, receivedAtMs: number) {
  const message = event.message;
  if (!message || typeof message !== 'object' || !('markAsReadToken' in message)) {
    return { event, markAsReadToken: undefined };
  }

  const { markAsReadToken, ...messageWithoutToken } = message;
  const inboundEvent = { ...event, message: messageWithoutToken };
  const parsed = LineEvent.safeParse(inboundEvent);
  if (!parsed.success || parsed.data.type !== 'message' || !parsed.data.message
    || parsed.data.source?.type !== 'user' || !parsed.data.source.userId
    || parsed.data.timestamp < receivedAtMs - EVENT_MAX_AGE_MS
    || typeof markAsReadToken !== 'string' || !/^\S+$/u.test(markAsReadToken)) {
    return { event: inboundEvent, markAsReadToken: undefined };
  }
  return { event: inboundEvent, markAsReadToken };
}

export async function markLineMessageAsRead(connection: LineConnection, markAsReadToken: string): Promise<void> {
  if (config.LINE_MODE !== 'real' || config.MODEL_MODE === 'fake' || connection.status_reason === 'bot_changed') return;

  try {
    const token = await getAccessToken(connection);
    if (!token) return;
    const response = await lineRequest('/v2/bot/chat/markAsRead', {
      method: 'POST',
      token,
      json: { markAsReadToken },
      timeoutMs: READ_RECEIPT_TIMEOUT_MS,
    });
    if (response?.status === 200) return;
    // A subsequent receipt covers earlier messages in the chat after a timeout or failure.
    log.warn({ upstreamStatus: response?.status ?? null }, 'LINE read receipt was not acknowledged');
  } catch {
    log.warn({}, 'LINE read receipt request failed');
  }
}
