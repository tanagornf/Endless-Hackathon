import { formatMoneyText } from '@nless/shared/core/language';
import type { MessagePart } from '@nless/shared/core/types';
import type { ConversationRecord, MessageRecord } from '@nless/shared/features/inbox/types';

export const conversationColumns = `c.id, c.business_id AS "businessId", c.customer_id AS "customerId",
  jsonb_build_object('displayName', u.display_name, 'externalId', u.external_id,
    'channelAccountId', u.channel_account_id) AS customer,
  c.channel, c.status, c.handler, c.assignee_user_id AS "assigneeUserId", c.ai_force_on AS "aiForceOn",
  c.last_message_at AS "lastMessageAt", c.last_inbound_at AS "lastInboundAt", c.unread_count AS "unreadCount",
  c.version, c.created_at AS "createdAt"`;

export const messageColumns = `id, business_id AS "businessId", conversation_id AS "conversationId",
  seq::float8 AS seq, direction, author, author_user_id AS "authorUserId", parts, text, channel, origin,
  external_id AS "externalId", group_id AS "groupId",
  jsonb_build_object('mode', delivery_mode, 'state', delivery_state, 'externalRef', delivery_external_ref,
    'error', delivery_error) AS delivery, created_at AS "createdAt"`;

export type DbMessage = Omit<MessageRecord, 'createdAt'> & { createdAt: Date };
export type DbConversation = Omit<ConversationRecord, 'createdAt' | 'lastMessageAt' | 'lastInboundAt'> & {
  createdAt: Date;
  lastMessageAt: Date | null;
  lastInboundAt: Date | null;
};

export function formatMessage(row: DbMessage): MessageRecord {
  const parts = row.parts.map((part) => {
    if (part.type !== 'image' && part.type !== 'file') return part;
    return { ...part, url: '/api/v1/businesses/' + row.businessId + '/chat/files/' + part.fileId };
  });
  return { ...row, parts, createdAt: row.createdAt.toISOString() };
}

export function formatConversation(row: DbConversation): ConversationRecord {
  return {
    ...row, createdAt: row.createdAt.toISOString(),
    lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
    lastInboundAt: row.lastInboundAt?.toISOString() ?? null,
  };
}

function partText(part: MessagePart): string {
  switch (part.type) {
    case 'text': return part.text;
    case 'image': return part.alt || '[รูปภาพ]';
    case 'file': return '[ไฟล์: ' + part.fileName + ']';
    case 'product_card': return part.altText;
    case 'order_review': return '[สรุปออเดอร์ ยอดรวม ' + formatMoneyText(part.totalMinor, 'th') + ']';
    case 'booking_review': return '[สรุปการจอง ' + part.localDisplay + ']';
    case 'action_buttons': return [part.text, '[ปุ่ม: ' + part.buttons.map(({ label }) => label).join(' / ') + ']'].filter(Boolean).join('\n');
  }
}

export function partsToText(parts: MessagePart[]): string {
  return [...parts.map(partText).join('\n')].slice(0, 4000).join('');
}
