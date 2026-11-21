import { detectTextLanguage } from '@nless/shared/core/language';
import type { CustomerLanguage } from '@nless/shared/core/language';
import type { MessagePart, Page } from '@nless/shared/core/types';
import { AI_REPLY_JOB } from '@nless/shared/features/inbox/types';
import type { ConversationRecord, HistoryOptions, MessageRecord, SaveMessageInput, SaveMessageResult } from '@nless/shared/features/inbox/types';
import { AppError, db, jobs, log, publish } from '../../core';
import type { DbExecutor } from '../../core';
import { signalDemoConversation } from './demoSignal';
import { GROUP_EXTEND_MAX, HISTORY_DEFAULT, HISTORY_MAX, PREVIEW_CHARS, REPLAY_HEAL_MS } from './limits';
import { conversationColumns, formatConversation, formatMessage, messageColumns, partsToText } from './mappers';
import type { DbConversation, DbMessage } from './mappers';
import { messagePartsSchema, uuidPattern } from './schemas';

type Stored = Pick<SaveMessageResult, 'message' | 'conversation' | 'created'>;
type Channel = MessageRecord['channel'];

class MessageCollision extends Error {}

export async function readConversation(tx: DbExecutor, id: string, businessId?: string): Promise<ConversationRecord | null> {
  if (!uuidPattern.test(id) || (businessId !== undefined && !uuidPattern.test(businessId))) return null;
  const row = await tx.maybeOne<DbConversation>(`SELECT ${conversationColumns} FROM conversations c
    JOIN customers u ON u.id=c.customer_id AND u.business_id=c.business_id
    WHERE c.id=$1 AND ($2::uuid IS NULL OR c.business_id=$2)`, [id, businessId ?? null]);
  return row ? formatConversation(row) : null;
}

async function conversationOrThrow(tx: DbExecutor, id: string, businessId: string) {
  const conversation = await readConversation(tx, id, businessId);
  if (!conversation) throw new AppError('NOT_FOUND', 'Conversation not found');
  return conversation;
}

async function findReplay(tx: DbExecutor, input: SaveMessageInput, channel: Channel, conversationId?: string): Promise<Stored | null> {
  const original = input.externalId ? await tx.maybeOne<DbMessage>(`SELECT ${messageColumns} FROM messages
    WHERE business_id=$1 AND channel=$2 AND external_id=$3`, [input.businessId, channel, input.externalId]) : null;
  const row = original ?? (input.clientRequestId && conversationId ? await tx.maybeOne<DbMessage>(
    `SELECT ${messageColumns} FROM messages WHERE business_id=$1 AND conversation_id=$2 AND client_request_id=$3`,
    [input.businessId, conversationId, input.clientRequestId],
  ) : null);
  if (!row) return null;
  return { message: formatMessage(row), conversation: await conversationOrThrow(tx, row.conversationId, input.businessId), created: false };
}

async function lockOpenConversation(tx: DbExecutor, businessId: string, customerId: string, channel: Channel) {
  const find = () => tx.maybeOne<{ id: string }>(`SELECT id FROM conversations
    WHERE business_id=$1 AND customer_id=$2 AND status='open' FOR UPDATE`, [businessId, customerId]);
  const current = await find();
  if (current) return { id: current.id, created: false };

  const inserted = await tx.maybeOne<{ id: string }>(`INSERT INTO conversations (business_id, customer_id, channel)
    VALUES ($1,$2,$3) ON CONFLICT (customer_id) WHERE status='open' DO NOTHING RETURNING id`, [businessId, customerId, channel]);
  if (inserted) return { id: inserted.id, created: true };
  const winner = await find();
  if (!winner) throw new AppError('SERVICE_NOT_READY', 'Conversation changed while saving', { retryable: true });
  return { id: winner.id, created: false };
}

async function upsertCustomer(tx: DbExecutor, input: SaveMessageInput) {
  const customer = input.customer;
  if (!customer) throw new AppError('VALIDATION_ERROR', 'A conversation or customer is required');
  return tx.one<{ id: string }>(`INSERT INTO customers (business_id,channel,external_id,display_name,channel_account_id)
    VALUES ($1,$2,$3,$4,$5) ON CONFLICT (business_id,channel,external_id)
    DO UPDATE SET last_seen_at=now(),
      channel_account_id=COALESCE(EXCLUDED.channel_account_id, customers.channel_account_id),
      display_name=CASE WHEN EXCLUDED.display_name <> '' AND $6='customer' THEN EXCLUDED.display_name ELSE customers.display_name END
    RETURNING id`, [input.businessId, customer.channel, customer.externalId,
    customer.displayName?.trim() ?? '', customer.channelAccountId ?? null, input.author]);
}

function shouldReply(input: SaveMessageInput, message: MessageRecord): boolean {
  return input.triggerAi ?? (message.direction === 'inbound' && message.author === 'customer'
    && (message.origin === 'live' || message.origin === 'demo'));
}

async function enqueueReply(message: MessageRecord, checkExisting: boolean): Promise<string | null> {
  const dedupKey = AI_REPLY_JOB + ':' + message.id;
  try {
    if (checkExisting && await db.maybeOne('SELECT id FROM jobs WHERE business_id=$1 AND dedup_key=$2',
      [message.businessId, dedupKey])) return null;
    return (await jobs.enqueue(AI_REPLY_JOB, { conversationId: message.conversationId, messageId: message.id }, {
      dedupKey, businessId: message.businessId, lockKey: 'conversation:' + message.conversationId,
    })).jobId;
  } catch {
    log.warn({ messageId: message.id, businessId: message.businessId }, 'AI reply enqueue failed after message commit');
    return null;
  }
}

export async function persistMessage(input: SaveMessageInput): Promise<SaveMessageResult> {
  const validated = messagePartsSchema.safeParse(input.parts);
  if (!validated.success) throw new AppError('VALIDATION_ERROR', 'Invalid message content');
  const parts: MessagePart[] = validated.data;
  const explicit = input.conversationId ? await conversationOrThrow(db, input.conversationId, input.businessId) : null;
  const channel = explicit?.channel ?? input.customer?.channel;
  if (!channel) throw new AppError('VALIDATION_ERROR', 'A conversation or customer is required');
  const occurredAt = input.occurredAt === undefined ? null : new Date(input.occurredAt);
  if (occurredAt && !Number.isFinite(occurredAt.getTime())) throw new AppError('VALIDATION_ERROR', 'Invalid message time');

  const inbound = input.direction === 'inbound' && input.author === 'customer';
  const staffSent = input.direction === 'outbound' && input.author === 'staff';
  const origin = input.origin ?? (channel === 'web' ? 'demo' : 'live');
  const plainText = partsToText(parts);
  let opened = false;
  let conversationId = explicit?.id;
  let result = await findReplay(db, input, channel, conversationId);

  if (!result) {
    try {
      result = await db.tx(async (tx): Promise<Stored> => {
        if (explicit) {
          const current = await tx.maybeOne<{ status: ConversationRecord['status']; customer_id: string }>(
            'SELECT status, customer_id FROM conversations WHERE id=$1 AND business_id=$2 FOR UPDATE',
            [explicit.id, input.businessId],
          );
          if (!current) throw new AppError('NOT_FOUND', 'Conversation not found');
          if (inbound && current.status === 'closed') {
            const replacement = await lockOpenConversation(tx, input.businessId, current.customer_id, channel);
            conversationId = replacement.id;
            opened = replacement.created;
          }
        } else {
          const customer = await upsertCustomer(tx, input);
          const open = await lockOpenConversation(tx, input.businessId, customer.id, channel);
          conversationId = open.id;
          opened = open.created;
        }

        const id = conversationId!;
        const replay = await findReplay(tx, input, channel, id);
        if (replay) {
          if (opened) throw new MessageCollision();
          return replay;
        }
        const message = await tx.maybeOne<DbMessage>(`INSERT INTO messages (
          business_id,conversation_id,seq,direction,author,author_user_id,parts,text,channel,origin,
          external_id,group_id,provider_meta,client_request_id,created_at)
          SELECT c.business_id,c.id,c.next_seq,$3,$4,$5,$6::jsonb,$7,c.channel,$8,$9,$10,$11::jsonb,$12,
            LEAST(COALESCE($13::timestamptz, now()),now())
          FROM conversations c WHERE c.id=$1 AND c.business_id=$2
          ON CONFLICT DO NOTHING RETURNING ${messageColumns}`, [
          id, input.businessId, input.direction, input.author, input.authorUserId ?? null, JSON.stringify(parts),
          plainText, origin, input.externalId ?? null, input.groupId ?? null, JSON.stringify(input.providerMeta ?? {}),
          input.clientRequestId ?? null, occurredAt,
        ]);
        if (!message) throw new MessageCollision();
        await tx.query(`UPDATE conversations SET next_seq=next_seq+1,
          last_message_at=GREATEST(last_message_at,$3),
          last_message_preview=CASE WHEN last_message_at IS NULL OR last_message_at<=$3 THEN left($4,$5) ELSE last_message_preview END,
          last_inbound_at=CASE WHEN $6 THEN GREATEST(last_inbound_at,$3) ELSE last_inbound_at END,
          unread_count=CASE WHEN $6 THEN unread_count+1 WHEN $7 THEN 0 ELSE unread_count END, updated_at=now()
          WHERE id=$1 AND business_id=$2`, [
          id, input.businessId, message.createdAt, plainText, PREVIEW_CHARS, inbound, staffSent,
        ]);
        return { message: formatMessage(message), conversation: await conversationOrThrow(tx, id, input.businessId), created: true };
      });
    } catch (error) {
      if (!(error instanceof MessageCollision)) throw error;
      result = await findReplay(db, input, channel, conversationId);
      if (!result) throw new AppError('SERVICE_NOT_READY', 'Message changed while saving', { retryable: true });
    }
  }

  const { message, conversation } = result;
  if (!result.created) {
    const recentInbound = message.direction === 'inbound' && message.author === 'customer'
      && Date.now() - Date.parse(message.createdAt) < REPLAY_HEAL_MS;
    if (recentInbound && shouldReply(input, message)) await enqueueReply(message, true);
    return { ...result, aiJobId: null };
  }

  publish(message.businessId, { type: 'message.created', conversationId: message.conversationId, message });
  if (opened) publish(message.businessId, {
    type: 'conversation.updated', conversationId: conversation.id, handler: conversation.handler,
    assigneeUserId: conversation.assigneeUserId, status: conversation.status, version: conversation.version,
  });
  signalDemoConversation(message.conversationId);
  const aiJobId = shouldReply(input, message) ? await enqueueReply(message, false) : null;
  return { ...result, aiJobId };
}

function decodeCursor(cursor?: string | null): number | null {
  if (cursor == null) return null;
  if (!/^[\w-]{1,100}$/u.test(cursor)) throw new AppError('VALIDATION_ERROR', 'Invalid history cursor');
  const bytes = Buffer.from(cursor, 'base64url');
  const text = bytes.toString('utf8');
  const seq = Number(text);
  if (bytes.toString('base64url') !== cursor || !/^[1-9]\d*$/u.test(text) || !Number.isSafeInteger(seq)) {
    throw new AppError('VALIDATION_ERROR', 'Invalid history cursor');
  }
  return seq;
}

export async function readHistory(conversationId: string, opts?: HistoryOptions): Promise<Page<MessageRecord>> {
  const limit = opts?.limit ?? HISTORY_DEFAULT;
  const before = decodeCursor(opts?.before);
  const after = decodeCursor(opts?.after);
  if (!Number.isInteger(limit) || limit < 1 || limit > HISTORY_MAX || (before !== null && after !== null)) {
    throw new AppError('VALIDATION_ERROR', 'Invalid history pagination');
  }

  const conversation = await readConversation(db, conversationId, opts?.businessId);
  if (!conversation) return { items: [], nextCursor: null };
  const { businessId } = conversation;
  const { rows } = await db.query<DbMessage>(`SELECT ${messageColumns} FROM messages
    WHERE conversation_id=$1 AND business_id=$2
      AND ($3::bigint IS NULL OR seq<$3) AND ($4::bigint IS NULL OR seq>$4)
    ORDER BY seq ${after === null ? 'DESC' : 'ASC'} LIMIT $5`, [conversationId, businessId, before, after, limit + 1]);
  const page = rows.slice(0, limit);
  let hasMore = rows.length > limit;
  const boundary = page.at(-1);
  if (after === null && hasMore && boundary?.groupId) {
    const { rows: older } = await db.query<DbMessage>(`SELECT ${messageColumns} FROM messages
      WHERE conversation_id=$1 AND business_id=$2 AND seq<$3 ORDER BY seq DESC LIMIT $4`,
      [conversationId, businessId, boundary.seq, GROUP_EXTEND_MAX + 1]);
    const lastOfGroup = older.slice(0, GROUP_EXTEND_MAX).findLastIndex((row) => row.groupId === boundary.groupId);
    page.push(...older.slice(0, lastOfGroup + 1));
    hasMore = older.length > lastOfGroup + 1;
  }
  const cursorSeq = page.at(-1)?.seq;
  if (after === null) page.reverse();
  return {
    items: page.map(formatMessage),
    nextCursor: hasMore && cursorSeq !== undefined ? Buffer.from(String(cursorSeq)).toString('base64url') : null,
  };
}

export async function customerLanguage(conversationId: string, businessId?: string): Promise<CustomerLanguage> {
  if (businessId !== undefined && !uuidPattern.test(businessId)) return 'th';
  const id = uuidPattern.test(conversationId) ? conversationId : null;
  try {
    const candidates = await db.query<{ parts: MessagePart[] | null; language: CustomerLanguage }>(`SELECT b.language, recent.parts
      FROM businesses b
      LEFT JOIN conversations c ON c.id=$1 AND c.business_id=b.id
      LEFT JOIN LATERAL (
        SELECT m.parts, m.seq FROM messages m WHERE m.conversation_id=c.id AND m.business_id=b.id
          AND m.author='customer' AND m.text <> ''
          AND jsonb_path_exists(m.parts,'$[*] ? (@.type == "text")')
        ORDER BY m.seq DESC LIMIT 6
      ) recent ON true
      WHERE b.id=COALESCE($2::uuid, (SELECT business_id FROM conversations WHERE id=$1))
      ORDER BY recent.seq DESC`, [id, businessId ?? null]);
    for (const { parts } of candidates.rows) {
      const text = parts?.flatMap((part) => part.type === 'text' ? [part.text] : []).join(' ');
      const language = text ? detectTextLanguage(text) : null;
      if (language) return language;
    }
    return candidates.rows[0]?.language ?? 'th';
  } catch {
    log.warn({ businessId }, 'Customer language lookup failed');
    return 'th';
  }
}
