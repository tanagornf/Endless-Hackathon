import type { DemoChatMessage, DemoChatPoll, DemoChatSendResult, DemoChatShopView, MessageRecord } from '@nless/shared/features/inbox/types';
import { AppError, assertRateLimit, db, log, model } from '../../core';
import { getBusinessSettings } from '../business-settings/service';
import { messageColumns, formatMessage } from './mappers';
import type { DbMessage } from './mappers';
import { saveMessage } from './service';
import { readDemoHistory } from './demoHistory';
import { watchDemoConversation } from './demoSignal';

const settingsColumns = `s.business_id AS "businessId", s.public_slug AS "publicSlug", s.enabled,
  s.welcome_text AS "welcomeText", s.welcome_text_en AS "welcomeTextEn",
  s.suggested_questions AS "suggestedQuestions", s.suggested_questions_en AS "suggestedQuestionsEn"`;

export type DemoSettingsRow = Pick<DemoChatShopView, 'welcomeText' | 'welcomeTextEn' | 'suggestedQuestions' | 'suggestedQuestionsEn'> & {
  businessId: string;
  publicSlug: string;
  enabled: boolean;
};
export type DemoShop = DemoSettingsRow & { shopName: string; language: 'th' | 'en' };
export type DemoIdentity = { businessId: string; externalId: string; visitorId?: string; userId?: string };
type DailyRateReason = 'visitor' | 'ip' | 'daily_cap' | 'visitor_daily';

export const publicTextLimit = 500;
export const testerTextLimit = 2000;
const visitorDailyLimit = 40;
const pendingAge = 180_000;
const timeZone = 'Asia/Bangkok';
const dayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });

export function capacity() {
  const value = process.env.DEMO_CHAT_DAILY_TURN_CAP?.trim();
  const configured = value ? Number(value) : 300;
  return Number.isSafeInteger(configured) && configured >= 0 && configured <= 2_147_483_647 ? configured : 300;
}

function currentDay() {
  const parts = dayFormatter.formatToParts();
  return ['year', 'month', 'day'].map((kind) => parts.find(({ type }) => type === kind)?.value).join('-');
}

export async function getPublicShop(slug: string): Promise<DemoShop> {
  const shop = await db.maybeOne<DemoShop>(`SELECT ${settingsColumns}, b.name AS "shopName", b.language
    FROM demo_chat_settings s JOIN businesses b ON b.id=s.business_id
    WHERE s.public_slug=$1 AND s.enabled AND b.status='active'`, [slug]);
  if (!shop) throw new AppError('NOT_FOUND', 'Demo Chat link not found');
  return shop;
}

export async function getTodayTurns(businessId: string, day = currentDay()): Promise<number> {
  const row = await db.maybeOne<{ turns: number }>('SELECT turns FROM demo_chat_daily_turns WHERE business_id=$1 AND day=$2',
    [businessId, day]);
  return row?.turns ?? 0;
}

export async function getPublicShopView(shop: DemoShop): Promise<DemoChatShopView> {
  const [settings, turns] = await Promise.all([getBusinessSettings(shop.businessId), getTodayTurns(shop.businessId)]);
  return {
    shopName: shop.shopName, language: shop.language, aiEnabled: settings.aiEnabled, capReached: turns >= capacity(),
    welcomeText: shop.welcomeText, welcomeTextEn: shop.welcomeTextEn,
    suggestedQuestions: shop.suggestedQuestions, suggestedQuestionsEn: shop.suggestedQuestionsEn,
  };
}

export function publicIdentity(shop: DemoShop, visitorId: string): DemoIdentity {
  return { businessId: shop.businessId, externalId: 'demo-visitor:' + visitorId, visitorId };
}

export function testerIdentity(businessId: string, userId: string): DemoIdentity {
  return { businessId, externalId: 'demo:' + userId, userId };
}

function rate(key: string, limit: number, windowSeconds: number, reason: DailyRateReason) {
  try { assertRateLimit({ key, limit, windowSeconds }); }
  catch (error) {
    if (!(error instanceof AppError) || error.code !== 'RATE_LIMITED') throw error;
    throw new AppError('RATE_LIMITED', 'Demo Chat rate limit reached', {
      retryable: error.retryable, details: { ...error.details, reason },
    });
  }
}

export function rateDemoSession(ip: string) { rate('demo-chat:session:' + ip, 20, 60, 'ip'); }

export function rateDemoPoll(identity: DemoIdentity, ip: string) {
  if (identity.visitorId) {
    rate('demo-chat:poll-ip:' + ip, 600, 60, 'ip');
    rate('demo-chat:poll:' + identity.visitorId, 120, 60, 'visitor');
  } else rate('demo-chat:tester-poll:' + identity.userId, 120, 60, 'visitor');
}

function normalizeText(value: string, maximum: number) {
  const text = value.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/gu, '').replace(/[^\S\n]+/gu, ' ').trim();
  if (!text || [...text].length > maximum) throw new AppError('VALIDATION_ERROR', 'Invalid Demo Chat text', {
    details: { max: maximum },
  });
  return text;
}

export async function conversationFor(identity: DemoIdentity, openOnly = false) {
  return db.maybeOne<{ id: string; status: 'open' | 'closed' }>(`SELECT c.id, c.status FROM conversations c
    JOIN customers cu ON cu.id=c.customer_id AND cu.business_id=c.business_id
    WHERE c.business_id=$1 AND cu.channel='web' AND cu.external_id=$2 AND (NOT $3 OR c.status='open')
    ORDER BY c.created_at DESC, c.id DESC LIMIT 1`, [identity.businessId, identity.externalId, openOnly]);
}

function customerMessage(message: MessageRecord & { clientRequestId?: string | null }): DemoChatMessage | null {
  if (message.author === 'system' || (message.direction === 'outbound' && message.author === 'ai' && message.delivery.state !== 'sent')) return null;
  const { id, seq, direction, author, parts, createdAt, delivery } = message;
  return {
    id, seq, direction, author,
    ...(direction === 'inbound' && author === 'customer' && message.clientRequestId ? { clientRequestId: message.clientRequestId } : {}),
    parts: parts.map((part) => {
      if (part.type !== 'image' && part.type !== 'file') return part;
      const { url: _url, ...attachment } = part;
      return attachment;
    }), createdAt, delivery: direction === 'outbound' ? delivery.state : null,
  };
}

async function recordBlocked(businessId: string, day: string) {
  await db.query(`INSERT INTO demo_chat_daily_turns (business_id,day,blocked) VALUES ($1,$2,1)
    ON CONFLICT (business_id,day) DO UPDATE SET blocked=demo_chat_daily_turns.blocked+1,updated_at=now()`, [businessId, day]);
}

async function reserveTurn(businessId: string, day: string) {
  return db.maybeOne<{ turns: number }>(`INSERT INTO demo_chat_daily_turns (business_id,day,turns)
    SELECT $1::uuid,$2::date,1 WHERE $3::int>0
    ON CONFLICT (business_id,day) DO UPDATE SET turns=demo_chat_daily_turns.turns+1,updated_at=now()
    WHERE demo_chat_daily_turns.turns<$3 RETURNING turns`, [businessId, day, capacity()]);
}

async function refundTurn(businessId: string, day: string) {
  await db.query(`UPDATE demo_chat_daily_turns SET turns=turns-1,updated_at=now() WHERE business_id=$1 AND day=$2 AND turns>0`,
    [businessId, day]);
}

async function persistDemoMessage(identity: DemoIdentity, text: string, clientRequestId: string, conversationId?: string) {
  const result = await saveMessage({
    businessId: identity.businessId, conversationId,
    customer: { channel: 'web', externalId: identity.externalId, displayName: 'ผู้ทดลอง ' + identity.externalId.slice(-4) },
    direction: 'inbound', author: 'customer', parts: [{ type: 'text', text }], origin: 'demo', clientRequestId,
  });
  return { message: customerMessage({ ...result.message, clientRequestId })!, conversationId: result.conversation.id, created: result.created };
}

const activeTurns = new Map<string, Promise<unknown>>();

async function inVisitorOrder<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const prior = activeTurns.get(key);
  const next = (prior ?? Promise.resolve()).catch(() => {}).then(operation);
  activeTurns.set(key, next);
  try { return await next; }
  finally { if (activeTurns.get(key) === next) activeTurns.delete(key); }
}

async function publicSend(identity: DemoIdentity, text: string, clientRequestId: string, day: string) {
  const { businessId } = identity;
  const active = await conversationFor(identity, true);
  const replay = active ? await db.maybeOne<DbMessage>(`SELECT ${messageColumns} FROM messages
    WHERE business_id=$1 AND conversation_id=$2 AND client_request_id=$3 AND author='customer'`,
    [businessId, active.id, clientRequestId]) : null;
  if (replay && active) {
    const saved = formatMessage(replay);
    if (saved.text !== text) throw new AppError('IDEMPOTENCY_CONFLICT', 'Demo Chat request already used');
    return persistDemoMessage(identity, text, clientRequestId, active.id);
  }

  const { turns } = await db.one<{ turns: number }>(`SELECT count(*)::int AS turns FROM messages m
    JOIN conversations c ON c.id=m.conversation_id AND c.business_id=m.business_id
    JOIN customers cu ON cu.id=c.customer_id AND cu.business_id=c.business_id
    WHERE m.business_id=$1 AND cu.channel='web' AND cu.external_id=$2
      AND m.author='customer' AND m.direction='inbound' AND m.created_at>=($3::date::timestamp AT TIME ZONE 'Asia/Bangkok')`,
    [businessId, identity.externalId, day]);
  if (turns >= visitorDailyLimit) {
    await recordBlocked(businessId, day);
    throw new AppError('RATE_LIMITED', 'Demo Chat visitor daily limit reached', { details: { reason: 'visitor_daily' } });
  }

  let flagged = false;
  try { ({ flagged } = await model.moderate({ usage: { featureId: 'F09', purpose: 'moderate', businessId }, text })); }
  catch { log.warn({ businessId }, 'Demo Chat moderation provider unavailable'); }
  if (flagged) {
    await recordBlocked(businessId, day);
    throw new AppError('POLICY_BLOCKED', 'Demo Chat message blocked', { details: { reason: 'moderation' } });
  }
  if (!await reserveTurn(businessId, day)) {
    await recordBlocked(businessId, day);
    throw new AppError('RATE_LIMITED', 'Demo Chat daily cap reached', { details: { reason: 'daily_cap' } });
  }
  let result: DemoChatSendResult;
  try { result = await persistDemoMessage(identity, text, clientRequestId); }
  catch (error) {
    await refundTurn(businessId, day).catch(() => log.warn({ businessId }, 'Demo Chat reservation refund failed'));
    throw error;
  }
  if (!result.created) await refundTurn(businessId, day);
  return result;
}

export async function sendDemoMessage(identity: DemoIdentity, raw: string, clientRequestId: string, ip?: string): Promise<DemoChatSendResult> {
  const text = normalizeText(raw, identity.visitorId ? publicTextLimit : testerTextLimit);
  if (!identity.visitorId) {
    rate('demo-chat:staff:' + identity.userId, 30, 60, 'visitor');
    return persistDemoMessage(identity, text, clientRequestId);
  }

  const day = currentDay();
  try {
    rate('demo-chat:ip:' + ip, 60, 60, 'ip');
    rate('demo-chat:ip-h:' + ip, 600, 3600, 'ip');
    rate('demo-chat:visitor:' + identity.visitorId, 6, 60, 'visitor');
    rate('demo-chat:visitor-h:' + identity.visitorId, 40, 3600, 'visitor');
  } catch (error) {
    await recordBlocked(identity.businessId, day);
    throw error;
  }
  return inVisitorOrder(identity.businessId + ':' + identity.visitorId,
    () => publicSend(identity, text, clientRequestId, day));
}

async function pending(identity: DemoIdentity, conversationId: string): Promise<DemoChatPoll['pending']> {
  const row = await db.maybeOne<{ since: Date; state: string | null }>(`SELECT m.created_at AS since, j.state
    FROM messages m LEFT JOIN jobs j ON j.business_id=m.business_id AND j.dedup_key='ai.reply:'||m.id::text
    WHERE m.business_id=$1 AND m.conversation_id=$2 AND m.direction='inbound' AND m.author='customer'
      AND NOT EXISTS (SELECT 1 FROM messages o WHERE o.business_id=m.business_id AND o.conversation_id=m.conversation_id
        AND o.direction='outbound' AND o.author IN ('staff','ai') AND o.seq>m.seq)
    ORDER BY m.seq DESC LIMIT 1`, [identity.businessId, conversationId]);
  if (!row || !row.state || row.state === 'succeeded' || row.state === 'cancelled') return null;
  return { since: row.since.toISOString(),
    state: row.state === 'dead' || Date.now() - row.since.getTime() > pendingAge ? 'failed' : 'typing' };
}

async function readPoll(identity: DemoIdentity, conversation: { id: string; status: 'open' | 'closed' }, after?: string) {
  const [history, ai] = await Promise.all([
    readDemoHistory(identity.businessId, conversation.id, after), pending(identity, conversation.id),
  ]);
  const { waitingSince } = history;
  const recentWait = waitingSince && Date.now() - Date.parse(waitingSince) < pendingAge;
  const page: DemoChatPoll = {
    conversationId: conversation.id, items: history.items.flatMap((message) => customerMessage(message) ?? []),
    cursor: history.cursor, pending: recentWait ? { since: waitingSince, state: 'typing' } : ai,
    closed: conversation.status === 'closed',
  };
  return { page, immediate: history.immediate, revisiting: history.revisiting };
}

export async function demoPoll(identity: DemoIdentity, after: string | undefined, waitMs: number): Promise<DemoChatPoll> {
  const conversation = await conversationFor(identity);
  if (!conversation) return { conversationId: null, items: [], cursor: null, pending: null, closed: false };
  // Register before the database reads: a staff message committed during those reads must wake this request.
  const watcher = waitMs > 0 ? watchDemoConversation(identity.businessId + ':' + identity.externalId, conversation.id) : null;
  try {
    const first = await readPoll(identity, conversation, after);
    if (first.immediate || first.page.closed || !watcher) return first.page;
    const recheckMs = first.page.pending?.state === 'typing' ? (first.revisiting ? 2000 : 1000) : waitMs;
    await watcher.wait(Math.min(waitMs, recheckMs));
    const current = await conversationFor(identity);
    if (!current) return { conversationId: null, items: [], cursor: null, pending: null, closed: false };
    return (await readPoll(identity, current, current.id === conversation.id ? after : undefined)).page;
  } finally { watcher?.finish(); }
}
