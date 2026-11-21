import { createHash } from 'node:crypto';
import QRCode from 'qrcode';
import { z } from 'zod';
import { AppError, audit, config, db, decryptSecret, encryptSecret, log, publish } from '../../core';
import type { ConnectLineInput, LineConnectionView } from '@nless/shared/features/line/types';
import { CHANNEL_ID } from './config';
import { lineRequest } from './lineApi';
import { findOutboundConnection, type LineConnection } from './repo';
import { getLineQuota, getPushUsage } from './usage';
import { notify } from '../notifications/service';

const BotInfo = z.object({ userId: z.string(), basicId: z.string(), displayName: z.string() });
const StatelessToken = z.object({ access_token: z.string().min(1), expires_in: z.number().positive() });
const secretPattern = /^[0-9a-f]{32}$/i;

export const ConnectBody = z.object({
  channelId: z.string().regex(CHANNEL_ID),
  channelSecret: z.string().regex(secretPattern),
  accessToken: z.string().min(40).max(400).optional(),
}).strict();

const tokenCache = new Map<string, { generation: number; token: string; expiresAt: number }>();
const qrCache = new Map<string, Promise<string>>();

class RejectedCredential extends Error {}

async function issueStatelessToken(channelId: string, secret: string) {
  const reply = await lineRequest('/oauth2/v3/token', {
    method: 'POST', form: new URLSearchParams({ grant_type: 'client_credentials', client_id: channelId, client_secret: secret }),
  });
  if (reply?.status === 400 || reply?.status === 401 || reply?.status === 403) throw new RejectedCredential();
  const parsed = StatelessToken.safeParse(reply?.body);
  if (reply?.status !== 200 || !parsed.success) throw new AppError('PROVIDER_UNAVAILABLE', 'LINE token endpoint unavailable', { retryable: true });
  return parsed.data;
}

export async function getAccessToken(connection: LineConnection): Promise<string> {
  if (connection.access_token_enc) return decryptSecret(connection.access_token_enc);
  if (!connection.channel_secret_enc) throw new RejectedCredential();
  const previous = tokenCache.get(connection.id);
  if (previous?.generation === connection.generation && previous.expiresAt > Date.now()) return previous.token;
  const result = await issueStatelessToken(connection.channel_id, decryptSecret(connection.channel_secret_enc));
  tokenCache.set(connection.id, {
    generation: connection.generation, token: result.access_token,
    expiresAt: Date.now() + Math.max(0, result.expires_in - 60) * 1_000,
  });
  return result.access_token;
}

async function fetchBotInfo(token: string) {
  const reply = await lineRequest('/v2/bot/info', { token });
  if (reply?.status === 400 || reply?.status === 401 || reply?.status === 403) throw new RejectedCredential();
  const parsed = BotInfo.safeParse(reply?.body);
  if (reply?.status !== 200 || !parsed.success) throw new AppError('PROVIDER_UNAVAILABLE', 'LINE bot information unavailable', { retryable: true });
  return parsed.data;
}

async function changed(action: string, connection: LineConnection, actorUserId: string | null, details: Record<string, unknown>) {
  await audit({
    action, actorUserId, businessId: connection.business_id, targetType: 'line_connection',
    targetId: connection.id, details,
  });
  publish(connection.business_id, { type: 'custom', featureId: 'F17', name: 'line.connection.changed', data: {} });
}

function readConnection(businessId: string) {
  return db.maybeOne<LineConnection>(
    "SELECT * FROM line_connections WHERE business_id = $1 ORDER BY (status IN ('active', 'error')) DESC, updated_at DESC LIMIT 1",
    [businessId],
  );
}

export async function getConnectionView(businessId: string, options: { refreshQuota?: boolean } = {}): Promise<LineConnectionView> {
  const [line, push] = await Promise.all([readConnection(businessId), getPushUsage(businessId)]);
  const live = line?.status === 'active' || line?.status === 'error';
  if (options.refreshQuota !== false && live && config.LINE_MODE === 'real') {
    push.lineQuota = await getAccessToken(line).then(getLineQuota).catch(() => null);
  }
  const basicId = line?.basic_id ?? null;
  const addFriendUrl = basicId ? 'https://line.me/R/ti/p/' + encodeURIComponent(basicId) : null;
  let addFriendQrDataUrl: string | null = null;
  if (addFriendUrl) {
    let qr = qrCache.get(addFriendUrl);
    if (!qr) {
      if (qrCache.size >= 100) qrCache.clear();
      qr = QRCode.toDataURL(addFriendUrl, { width: 200, margin: 1 });
      qrCache.set(addFriendUrl, qr);
      void qr.catch(() => qrCache.delete(addFriendUrl));
    }
    addFriendQrDataUrl = await qr.catch(() => null);
  }
  return {
    connected: line?.status === 'active', status: line?.status ?? 'none', statusReason: line?.status_reason ?? null,
    mode: config.LINE_MODE, channelId: line?.channel_id ?? null, displayName: line?.display_name ?? null, basicId,
    addFriendUrl, addFriendQrDataUrl,
    webhookUrl: line ? (config.PUBLIC_BASE_URL ?? ('http://localhost:' + config.API_PORT)).replace(/\/$/, '') + '/webhooks/line/' + line.channel_id : null,
    hasAccessToken: Boolean(line?.access_token_enc), source: line?.source ?? null,
    connectedAt: line?.connected_at.toISOString() ?? null, lastVerifiedAt: line?.last_verified_at?.toISOString() ?? null,
    lastEventAt: line?.last_event_at?.toISOString() ?? null, eventsTotal: Number(line?.events_total ?? 0), push,
  };
}

function channelTaken() {
  return new AppError('POLICY_BLOCKED', 'This LINE channel is already connected to another shop', { details: { reason: 'channel_in_use' } });
}

export async function connect(businessId: string, userId: string | null, body: ConnectLineInput, source: 'ui' | 'env' = 'ui'): Promise<LineConnectionView> {
  return db.withAdvisoryLock('channel-owner:line:' + body.channelId, async () => {
    const existing = await db.maybeOne<{ business_id: string }>(
      "SELECT business_id FROM line_connections WHERE channel_id = $1 AND status IN ('active', 'error')", [body.channelId],
    );
    if (existing && existing.business_id !== businessId) throw channelTaken();

    let info: { userId: string; basicId: string | null; displayName: string };
    if (config.LINE_MODE === 'sandbox') {
      info = { userId: 'Usandbox' + createHash('sha256').update(body.channelId).digest('hex').slice(0, 25), basicId: null, displayName: 'Sandbox LINE OA' };
    } else {
      try {
        const token = body.accessToken ?? (await issueStatelessToken(body.channelId, body.channelSecret)).access_token;
        info = await fetchBotInfo(token);
      } catch (error) {
        if (error instanceof RejectedCredential) {
          throw new AppError('POLICY_BLOCKED', 'LINE credentials were rejected', {
            details: { reason: body.accessToken ? 'credentials_rejected' : 'secret_mismatch' },
          });
        }
        throw error;
      }
    }
    const line = await db.tx(async (tx) => {
      const business = await tx.maybeOne<{ status: string }>('SELECT status FROM businesses WHERE id = $1 FOR UPDATE', [businessId]);
      if (business?.status !== 'active') throw new AppError('BUSINESS_INACTIVE');
      const current = await tx.maybeOne<LineConnection>("SELECT * FROM line_connections WHERE business_id = $1 AND status IN ('active', 'error')", [businessId]);
      if (source === 'env') {
        if (current) return null;
        const explicitlyDisconnected = await tx.maybeOne(
          "SELECT 1 FROM line_connections WHERE business_id = $1 AND channel_id = $2 AND status = 'inactive' AND status_reason = 'disconnected'",
          [businessId, body.channelId],
        );
        if (explicitlyDisconnected) return null;
      }
      const secret = encryptSecret(body.channelSecret);
      const token = body.accessToken ? encryptSecret(body.accessToken) : null;
      const verified = config.LINE_MODE === 'real' ? new Date() : null;
      if (current?.channel_id === body.channelId) {
        return tx.one<LineConnection>(
          "UPDATE line_connections SET bot_user_id = $3, basic_id = $4, display_name = $5, channel_secret_enc = $6, access_token_enc = $7, source = $8, connected_by = $9, status = 'active', status_reason = NULL, generation = generation + 1, connected_at = now(), last_verified_at = $10, updated_at = now() WHERE id = $1 AND business_id = $2 RETURNING *",
          [current.id, businessId, info.userId, info.basicId, info.displayName, secret, token, source, userId, verified],
        );
      }
      if (current) {
        await tx.query(
          "UPDATE line_connections SET status = 'inactive', status_reason = 'replaced', generation = generation + 1, channel_secret_enc = NULL, access_token_enc = NULL, disconnected_at = now(), updated_at = now() WHERE id = $1 AND business_id = $2",
          [current.id, businessId],
        );
        tokenCache.delete(current.id);
      }
      return tx.one<LineConnection>(
        'INSERT INTO line_connections (business_id, channel_id, bot_user_id, basic_id, display_name, channel_secret_enc, access_token_enc, source, connected_by, last_verified_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *',
        [businessId, body.channelId, info.userId, info.basicId, info.displayName, secret, token, source, userId, verified],
      );
    });
    if (line) {
      tokenCache.delete(line.id);
      await changed('line.connect', line, userId, { channelId: line.channel_id, source });
    }
    return getConnectionView(businessId, { refreshQuota: false });
  });
}

export async function markConnectionError(connection: LineConnection, reason: 'token_rejected' | 'bot_changed', userId: string | null = null) {
  const changedLine = await db.maybeOne<LineConnection>(
    "UPDATE line_connections SET status = 'error', status_reason = $4, generation = generation + 1, updated_at = now() WHERE id = $1 AND business_id = $2 AND generation = $3 AND status IN ('active', 'error') AND status_reason IS DISTINCT FROM $4 RETURNING *",
    [connection.id, connection.business_id, connection.generation, reason],
  );
  if (!changedLine) return;
  tokenCache.delete(connection.id);
  await changed(userId ? 'line.verify' : 'line.connection.error', changedLine, userId, { reason });
  if (reason === 'token_rejected') {
    await notify({
      businessId: connection.business_id, to: { role: 'owners' }, type: 'system',
      title: 'LINE ใช้งานไม่ได้ / LINE unavailable',
      body: 'LINE ปฏิเสธโทเค็น กรุณาเชื่อมต่อใหม่ / LINE rejected the access token. Reconnect the channel.',
      link: '/channels', dedupKey: 'line-token:' + connection.id + ':' + new Date().toISOString().slice(0, 10),
    }).catch(() => log.warn({ connectionId: connection.id }, 'Could not notify owners of LINE credential rejection'));
  }
}

export async function verify(businessId: string, userId: string): Promise<LineConnectionView> {
  const line = await findOutboundConnection(businessId, null);
  if (!line) throw new AppError('CHANNEL_NOT_CONNECTED');
  let info = { userId: line.bot_user_id, basicId: line.basic_id, displayName: line.display_name };
  if (config.LINE_MODE === 'real') {
    try {
      info = await fetchBotInfo(await getAccessToken(line));
    } catch (error) {
      if (error instanceof RejectedCredential) {
        await markConnectionError(line, 'token_rejected', userId);
        throw new AppError('PROVIDER_UNAVAILABLE', 'LINE rejected the access token');
      }
      throw error;
    }
  }
  if (info.userId !== line.bot_user_id) {
    await markConnectionError(line, 'bot_changed', userId);
    return getConnectionView(businessId, { refreshQuota: false });
  }
  const updated = await db.maybeOne<LineConnection>(
    "UPDATE line_connections SET basic_id = $4, display_name = $5, status = 'active', status_reason = NULL, last_verified_at = now(), updated_at = now() WHERE id = $1 AND business_id = $2 AND generation = $3 AND status IN ('active', 'error') RETURNING *",
    [line.id, businessId, line.generation, info.basicId, info.displayName],
  );
  if (!updated) throw new AppError('CHANNEL_NOT_CONNECTED');
  if (line.status !== updated.status) await changed('line.verify', updated, userId, { status: 'active' });
  return getConnectionView(businessId, { refreshQuota: false });
}

export async function disconnect(businessId: string, userId: string): Promise<void> {
  const line = await findOutboundConnection(businessId, null);
  if (!line) throw new AppError('CHANNEL_NOT_CONNECTED');
  await db.withAdvisoryLock('channel-owner:line:' + line.channel_id, async () => {
    const inactive = await db.maybeOne<LineConnection>(
      "UPDATE line_connections SET status = 'inactive', status_reason = 'disconnected', channel_secret_enc = NULL, access_token_enc = NULL, generation = generation + 1, disconnected_at = now(), updated_at = now() WHERE id = $1 AND business_id = $2 AND status IN ('active', 'error') RETURNING *",
      [line.id, businessId],
    );
    if (!inactive) throw new AppError('CHANNEL_NOT_CONNECTED');
    tokenCache.delete(inactive.id);
    await changed('line.disconnect', inactive, userId, { channelId: inactive.channel_id });
  });
}

export function isRejectedCredential(error: unknown): boolean {
  return error instanceof RejectedCredential;
}

export async function bootstrapLineConnection(): Promise<void> {
  const { LINE_MODE, LINE_CHANNEL_ID, LINE_CHANNEL_SECRET, LINE_CHANNEL_ACCESS_TOKEN } = config;
  if (LINE_MODE !== 'real' || !LINE_CHANNEL_ID || !LINE_CHANNEL_SECRET) return;
  try {
    const credentials = ConnectBody.safeParse({
      channelId: LINE_CHANNEL_ID, channelSecret: LINE_CHANNEL_SECRET, accessToken: LINE_CHANNEL_ACCESS_TOKEN || undefined,
    });
    if (!credentials.success) {
      log.warn('LINE environment credentials are invalid');
      return;
    }
    const business = await db.maybeOne<{ id: string }>(
      "SELECT b.id FROM seed_aliases s JOIN businesses b ON b.id = s.id WHERE s.alias = 'biz_demo_a' AND b.status = 'active' AND NOT EXISTS (SELECT 1 FROM line_connections lc WHERE lc.business_id = b.id AND (lc.status IN ('active', 'error') OR (lc.channel_id = $1 AND lc.status_reason = 'disconnected')))",
      [LINE_CHANNEL_ID],
    );
    if (business) await connect(business.id, null, credentials.data, 'env');
  } catch {
    log.warn('LINE demo connection bootstrap could not complete');
  }
}
