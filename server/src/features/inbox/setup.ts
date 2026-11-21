import { SEED } from '@nless/shared/core/fixtures';
import { detectTextLanguage } from '@nless/shared/core/language';
import type { CustomerLanguage } from '@nless/shared/core/language';
import type { MessagePart, Page } from '@nless/shared/core/types';
import { AppError, db, jobs, publish } from '../../core';
import type { DbExecutor } from '../../core';
import { AI_REPLY_JOB } from '@nless/shared/features/inbox/types';
import type { ConversationRecord, HistoryOptions, MessageRecord, SaveMessageInput, SaveMessageResult } from '@nless/shared/features/inbox/types';

const conversationColumns = `c.id,c.business_id AS "businessId",c.customer_id AS "customerId",
  jsonb_build_object('displayName',u.display_name,'externalId',u.external_id,'channelAccountId',u.channel_account_id) AS customer,
  c.channel,c.status,c.handler,c.assignee_user_id AS "assigneeUserId",c.ai_force_on AS "aiForceOn",
  c.last_message_at AS "lastMessageAt",c.last_inbound_at AS "lastInboundAt",c.unread_count AS "unreadCount",
  c.version,c.created_at AS "createdAt"`;
const messageColumns = `id,business_id AS "businessId",conversation_id AS "conversationId",seq::int,direction,author,
  author_user_id AS "authorUserId",parts,text,channel,origin,external_id AS "externalId",group_id AS "groupId",
  jsonb_build_object('mode',delivery_mode,'state',delivery_state,'externalRef',delivery_external_ref,'error',delivery_error) AS delivery,
  created_at AS "createdAt"`;
type DbMessage = Omit<MessageRecord, 'createdAt'> & { createdAt: Date };
type DbConversation = Omit<ConversationRecord, 'createdAt' | 'lastMessageAt' | 'lastInboundAt'> &
  Record<'createdAt' | 'lastMessageAt' | 'lastInboundAt', Date | null>;
const formatMessage = (row: DbMessage): MessageRecord => ({ ...row, createdAt: row.createdAt.toISOString() });
const iso = (value: Date | null): string | null => value?.toISOString() ?? null;

export async function readConversation(tx: DbExecutor, id: string, businessId?: string): Promise<ConversationRecord | null> {
  const row = await tx.maybeOne<DbConversation>(`SELECT ${conversationColumns} FROM conversations c JOIN customers u ON u.id=c.customer_id
    WHERE c.id=$1 AND ($2::uuid IS NULL OR c.business_id=$2)`, [id, businessId ?? null]);
  return row ? { ...row, createdAt: row.createdAt!.toISOString(), lastMessageAt: iso(row.lastMessageAt), lastInboundAt: iso(row.lastInboundAt) } : null;
}

export async function persistMessage(input: SaveMessageInput): Promise<SaveMessageResult> {
  if (!input.parts.length) throw new AppError('VALIDATION_ERROR', 'Message must contain content');
  const result = await db.tx(async (tx) => {
    let id = input.conversationId;
    let channel = input.customer?.channel;
    if (id) {
      const existing = await tx.maybeOne<{ channel: MessageRecord['channel'] }>(
        'SELECT channel FROM conversations WHERE id=$1 AND business_id=$2 FOR UPDATE', [id, input.businessId]);
      if (!existing) throw new AppError('NOT_FOUND', 'Conversation not found');
      channel = existing.channel;
    } else {
      const customer = input.customer;
      if (!customer || input.direction !== 'inbound') throw new AppError('VALIDATION_ERROR', 'A conversation or inbound customer is required');
      const row = await tx.one<{ id: string }>(`INSERT INTO customers (business_id,channel,external_id,display_name,channel_account_id)
        VALUES ($1,$2,$3,$4,$5) ON CONFLICT (business_id,channel,external_id) DO UPDATE SET last_seen_at=now()
        RETURNING id`, [input.businessId, customer.channel, customer.externalId, customer.displayName ?? '', customer.channelAccountId ?? null]);
      const open = await tx.maybeOne<{ id: string }>("SELECT id FROM conversations WHERE customer_id=$1 AND business_id=$2 AND status='open' FOR UPDATE", [row.id, input.businessId]);
      id = open?.id ?? (await tx.one<{ id: string }>('INSERT INTO conversations (business_id,customer_id,channel) VALUES ($1,$2,$3) RETURNING id', [input.businessId, row.id, channel])).id;
    }
    const existing = await tx.maybeOne<DbMessage>(`SELECT ${messageColumns} FROM messages
      WHERE business_id=$1 AND ((channel=$2 AND external_id=$3) OR (conversation_id=$4 AND client_request_id=$5))`,
      [input.businessId, channel, input.externalId ?? null, id, input.clientRequestId ?? null]);
    if (existing) return { message: formatMessage(existing), conversation: (await readConversation(tx, existing.conversationId, input.businessId))!, created: false };
    const text = input.parts.filter((part): part is Extract<MessagePart, { type: 'text' }> => part.type === 'text').map((part) => part.text).join(' ');
    const inbound = input.direction === 'inbound';
    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
    if (!Number.isFinite(occurredAt.getTime())) throw new AppError('VALIDATION_ERROR', 'Invalid message time');
    const seq = await tx.one<{ seq: number }>(`UPDATE conversations SET next_seq=next_seq+1,last_message_at=GREATEST(last_message_at,$2),
      last_message_preview=CASE WHEN last_message_at IS NULL OR last_message_at<=$2 THEN $3 ELSE last_message_preview END,
      last_inbound_at=CASE WHEN $4 THEN GREATEST(last_inbound_at,$2) ELSE last_inbound_at END,
      unread_count=unread_count+CASE WHEN $4 THEN 1 ELSE 0 END,updated_at=now()
      WHERE id=$1 RETURNING (next_seq-1)::int AS seq`, [id, occurredAt, text.slice(0, 250), inbound]);
    const origin = input.origin ?? (channel === 'web' ? 'demo' : 'live');
    const message = await tx.one<DbMessage>(`INSERT INTO messages
      (business_id,conversation_id,seq,direction,author,author_user_id,parts,text,channel,origin,external_id,group_id,provider_meta,client_request_id,created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13::jsonb,$14,$15) RETURNING ` + messageColumns, [
      input.businessId, id, seq.seq, input.direction, input.author, input.authorUserId ?? null, JSON.stringify(input.parts),
      text, channel, origin, input.externalId ?? null, input.groupId ?? null, JSON.stringify(input.providerMeta ?? {}), input.clientRequestId ?? null, occurredAt,
    ]);
    return { message: formatMessage(message), conversation: (await readConversation(tx, id, input.businessId))!, created: true };
  });
  const { message } = result;
  const trigger = input.triggerAi ?? (message.direction === 'inbound' && message.author === 'customer' && ['live', 'demo'].includes(message.origin));
  const aiJobId = trigger && result.created ? (await jobs.enqueue(AI_REPLY_JOB, { conversationId: message.conversationId, messageId: message.id }, {
    dedupKey: AI_REPLY_JOB + ':' + message.id, businessId: message.businessId, lockKey: 'conversation:' + message.conversationId,
  })).jobId : null;
  if (result.created) publish(message.businessId, { type: 'message.created', conversationId: message.conversationId, message });
  return { ...result, aiJobId };
}

export async function readHistory(conversationId: string, opts?: HistoryOptions): Promise<Page<MessageRecord>> {
  const limit = opts?.limit ?? 30;
  const before = opts?.before;
  const after = opts?.after;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || (before && after)) throw new AppError('VALIDATION_ERROR', 'Invalid history pagination');
  const decode = (cursor?: string | null) => {
    if (!cursor) return null;
    const value = Buffer.from(cursor, 'base64url').toString('utf8');
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new AppError('VALIDATION_ERROR', 'Invalid history cursor');
    return Number(value);
  };
  if (!(await readConversation(db, conversationId, opts?.businessId))) throw new AppError('NOT_FOUND', 'Conversation not found');
  const { rows } = await db.query<DbMessage>(`SELECT ${messageColumns} FROM messages WHERE conversation_id=$1
    AND ($2::bigint IS NULL OR seq < $2) AND ($3::bigint IS NULL OR seq > $3)
    AND ($4::uuid IS NULL OR business_id=$4) ORDER BY seq ${after ? 'ASC' : 'DESC'} LIMIT $5`,
    [conversationId, decode(before), decode(after), opts?.businessId ?? null, limit + 1]);
  const page = rows.slice(0, limit).map(formatMessage);
  return { items: page, nextCursor: rows.length > limit ? Buffer.from(String(page.at(-1)!.seq)).toString('base64url') : null };
}

export async function customerLanguage(conversationId: string, businessId?: string): Promise<CustomerLanguage> {
  const conversation = await readConversation(db, conversationId, businessId);
  if (!conversation) throw new AppError('NOT_FOUND', 'Conversation not found');
  const { rows } = await db.query<{ text: string }>(`SELECT text FROM messages WHERE conversation_id=$1 AND business_id=$2
    AND direction='inbound' AND author='customer' ORDER BY seq DESC LIMIT 5`, [conversationId, conversation.businessId]);
  for (const message of rows) {
    const lang = detectTextLanguage(message.text);
    if (lang) return lang;
  }
  const business = await db.maybeOne<{ language: CustomerLanguage }>('SELECT language FROM businesses WHERE id=$1', [conversation.businessId]);
  return business?.language ?? SEED.businesses.find((fixture) => fixture.id === conversation.businessId)?.language ?? 'th';
}
