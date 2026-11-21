import { createECDH } from 'node:crypto';
import webPush from 'web-push';

const providerDomains = ['push.apple.com', 'push.services.mozilla.com', 'notify.windows.com'];
const providerHosts = ['fcm.googleapis.com'];
const base64url = /^[A-Za-z0-9_-]+$/;
const opaqueId = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

type PushCredentials = NonNullable<webPush.RequestOptions['vapidDetails']>;

const providerTokenLifetime = 60 * 60 * 1000;
const providerTokens = new Map<string, { subject: string; publicKey: string; authorization: string; until: number }>();

function providerAuthorization(endpoint: string, credentials: PushCredentials): string {
  const audience = new URL(endpoint).origin;
  const now = Date.now();
  const existing = providerTokens.get(audience);
  if (existing && existing.until > now && existing.subject === credentials.subject &&
      existing.publicKey === credentials.publicKey) return existing.authorization;

  const { Authorization } = webPush.getVapidHeaders(
    audience, credentials.subject, credentials.publicKey, credentials.privateKey, 'aes128gcm',
  );
  if (providerTokens.size >= 64 && !existing) {
    const oldest = providerTokens.keys().next();
    if (!oldest.done) providerTokens.delete(oldest.value);
  }
  providerTokens.set(audience, {
    subject: credentials.subject, publicKey: credentials.publicKey, authorization: Authorization,
    until: now + providerTokenLifetime,
  });
  return Authorization;
}

const sendWithCachedAuthorization: typeof webPush.sendNotification = (subscription, payload, options) => {
  const { vapidDetails, ...request } = options ?? {};
  if (!vapidDetails) throw new Error('Missing Web Push credentials');
  return webPush.sendNotification(subscription, payload, {
    ...request,
    headers: { ...request.headers, Authorization: providerAuthorization(subscription.endpoint, vapidDetails) },
  });
};

export interface PrivatePush {
  noticeId: string | null;
  ref: string;
  language: 'th' | 'en';
}

export type PushOutcome = {
  state: 'accepted' | 'gone' | 'failed' | 'retry';
  status?: number;
};

export function isOpaqueId(value: unknown): value is string {
  return typeof value === 'string' && opaqueId.test(value);
}

export function normalizePushEndpoint(raw: string): string | null {
  if (raw.length > 1000 || raw !== raw.trim() || raw.includes('\\')) return null;
  try {
    const url = new URL(raw);
    const permitted = providerHosts.includes(url.hostname) ||
      providerDomains.some((domain) => url.hostname === domain || url.hostname.endsWith('.' + domain));
    if (url.protocol !== 'https:' || !permitted || url.port || url.username || url.password || url.hash) return null;
    return url.href;
  } catch {
    return null;
  }
}

function validSubject(subject: string): boolean {
  if (/^mailto:[^\s@]+@[^\s@]+$/.test(subject)) return true;
  try {
    const url = new URL(subject);
    return url.protocol === 'https:' && Boolean(url.hostname) && url.hostname !== 'localhost' &&
      !url.username && !url.password;
  } catch {
    return false;
  }
}

export function readPushCredentials(candidate: PushCredentials): PushCredentials | null {
  const { publicKey, privateKey, subject } = candidate;
  if (!base64url.test(publicKey) || !base64url.test(privateKey) || !validSubject(subject)) return null;
  const publicBytes = Buffer.from(publicKey, 'base64url');
  const privateBytes = Buffer.from(privateKey, 'base64url');
  if (publicBytes.length !== 65 || privateBytes.length !== 32 ||
      publicBytes.toString('base64url') !== publicKey || privateBytes.toString('base64url') !== privateKey) return null;
  try {
    const key = createECDH('prime256v1');
    key.setPrivateKey(privateBytes);
    return key.getPublicKey().equals(publicBytes) ? { publicKey, privateKey, subject } : null;
  } catch {
    return null;
  }
}

function classifyStatus(status: unknown): PushOutcome {
  if (typeof status !== 'number' || !Number.isInteger(status) || status < 100 || status > 599) return { state: 'retry' };
  if (status >= 200 && status < 300) return { state: 'accepted', status };
  if (status === 404 || status === 410) return { state: 'gone', status };
  if (status === 429 || status >= 500) return { state: 'retry', status };
  return { state: 'failed', status };
}

export async function sendPrivatePush(
  subscription: webPush.PushSubscription,
  payload: PrivatePush & { urgency?: 'normal' | 'high' },
  vapidDetails: PushCredentials,
  send = sendWithCachedAuthorization,
): Promise<PushOutcome> {
  const endpoint = normalizePushEndpoint(subscription.endpoint);
  const { noticeId, ref, language, urgency = 'normal' } = payload;
  if (!endpoint || !isOpaqueId(ref) || (noticeId !== null && !isOpaqueId(noticeId)) ||
      (language !== 'th' && language !== 'en')) return { state: 'failed' };

  try {
    const response = await send({ ...subscription, endpoint }, JSON.stringify({ noticeId, ref, language }), {
      vapidDetails,
      contentEncoding: 'aes128gcm',
      urgency,
      TTL: 3600,
      timeout: 8000,
      ...(noticeId ? { topic: noticeId.replaceAll('-', '') } : {}),
    });
    return classifyStatus(response.statusCode);
  } catch (error) {
    return classifyStatus((error as { statusCode?: unknown } | null)?.statusCode);
  }
}
