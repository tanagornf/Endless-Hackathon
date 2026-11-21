import { AppError } from '../../core';
import { db } from '../../core';
import { deliverStaffMessage } from './staff';
import { customerLanguage, persistMessage, readConversation, readHistory } from './setup';
import type { ChatAttachment, ChatAttachmentRef, ConversationRecord, HistoryOptions, MessageRecord, SaveMessageInput, SaveMessageResult } from '@nless/shared/features/inbox/types';
import type { MessagePart, Page } from '@nless/shared/core/types';
import type { SendReceipt } from '../../core';
import type { CustomerLanguage } from '@nless/shared/core/language';

/**
 * @owner F09 inbox · A1 · consumers: C2 (webhooks, comments), B2 (ai.reply, voice transcripts), A1 Demo Chat, core sendToCustomer, A2, A3
 * Persist one message. Finds/creates customer + open conversation when conversationId is omitted.
 * Assigns the next per-conversation seq atomically (conversations.next_seq). Updates last_message_at /
 * last_inbound_at / unread_count, publishes 'message.created'. When triggerAi resolves true it enqueues
 * jobs.enqueue(AI_REPLY_JOB, { conversationId, messageId }, { dedupKey: `ai.reply:${messageId}`,
 * businessId, lockKey: `conversation:${conversationId}` }). It does NOT check aiEnabled/takeover: the
 * ai.reply handler does (so inbound is always stored).
 * Errors: conversation of another business → NOT_FOUND; empty parts → VALIDATION_ERROR.
 * @fake C1 ships this REAL and minimal over the core tables (customers, conversations, messages). A1 extends
 *   it (attachments, unread rules, previews) without changing the signature.
 */
export async function saveMessage(input: SaveMessageInput): Promise<SaveMessageResult> {
  return persistMessage(input);
}

/**
 * @owner F09 inbox · A1. Null when missing or (opts.businessId given) another tenant's (R3).
 * @fake real minimal SELECT over core conversations + customers.
 */
export async function getConversation(conversationId: string, opts?: { businessId?: string }): Promise<ConversationRecord | null> {
  return readConversation(db, conversationId, opts?.businessId);
}

/**
 * @owner F09 inbox · A1. The newest `limit` messages (or the page before/after a cursor), returned in ASCENDING
 * seq order (ready for model context and chat UI). nextCursor pages to older messages. Unknown conversation →
 * { items: [], nextCursor: null }.
 * @fake real minimal SELECT … ORDER BY seq DESC LIMIT n, reversed; cursor = base64url(seq); `after` = seq > cursor ASC.
 */
export async function getHistory(conversationId: string, opts?: HistoryOptions): Promise<Page<MessageRecord>> {
  return readHistory(conversationId, opts);
}

/**
 * @owner F09 inbox · A1 · consumers: A1 F12 (composer, template send), F09 routes
 * The only way staff send a message from the web. Checks the conversation belongs to the business; takeover rule:
 * handler 'ai' or no assignee → assignConversation(actorUserId) first (unless autoTakeover false); held by someone
 * else → VERSION_CONFLICT (details.holder). Builds the parts on the server (text + image/file whose ownership was
 * checked) or accepts `parts` already validated by F12 (text, image, file, product_card, action_buttons only), then
 * sendToCustomer(..., { author: 'staff', authorUserId, clientRequestId, businessId }). Closed conversation → POLICY_BLOCKED.
 * @fake real implementation from the start (it may call the F11 fake).
 */
export async function sendStaffMessage(input: {
  businessId: string;
  conversationId: string;
  actorUserId: string;
  clientRequestId: string;
  text?: string;
  attachments?: ChatAttachmentRef[];
  parts?: MessagePart[];
  /** false = do not take the conversation over automatically. Default true. */
  autoTakeover?: boolean;
}): Promise<SendReceipt> {
  return deliverStaffMessage(input);
}

/**
 * @owner F09 inbox · A1 · consumers: A1 F23 broadcast and B2 F38 follow-ups (Messenger/Instagram 24-hour window)
 * Latest last_inbound_at of this customer across all of the business's conversations (open or closed).
 * No conversation, or a customer of another business → null (R3).
 * @fake real: SELECT max(last_inbound_at) FROM conversations WHERE business_id = $1 AND customer_id = $2.
 */
export async function getCustomerLastInboundAt(businessId: string, customerId: string): Promise<string | null> {
  const value = await db.maybeOne<{ last: Date | null }>(
    'SELECT max(last_inbound_at) AS last FROM conversations WHERE business_id=$1 AND customer_id=$2', [businessId, customerId]);
  return value?.last?.toISOString() ?? null;
}

/**
 * @owner F09 inbox · A1 · consumers: every lane that sends a code-written text to a customer (A2 F13/F14, A3 F15,
 *   C2 F17/F18/F21 card labels and notices, B2 F38, C1 F39)
 * The language to use for a code-written message in this conversation: detectTextLanguage() of the customer's
 * messages, newest first, over at most the last 6 customer messages that have text; the first non-null result wins.
 * No such message → the business's `language` (BusinessSettings.language is a default, not a lock). Unknown
 * conversation, or another tenant's when opts.businessId is given → the language of opts.businessId's business, or 'th'.
 * Never throws. F10 does not call this: it decides per turn from the same detectTextLanguage (F10 spec §5.13).
 * @fake real minimal: SELECT text FROM messages WHERE conversation_id = $1 AND author = 'customer' ORDER BY seq DESC
 *   LIMIT 6, then detectTextLanguage; fallback businesses.language.
 */
export async function getCustomerLanguage(conversationId: string, opts?: { businessId?: string }): Promise<CustomerLanguage> {
  return customerLanguage(conversationId, opts?.businessId);
}

/**
 * @owner F09 inbox · A1 · consumers: A1 F12 (template assets), F09 routes
 * Checks MIME type, size and file signature, then storage.save. Images go through model.moderate
 * (flagged → VALIDATION_ERROR details.reason 'moderation_flagged'; provider failure → accepted and logged).
 * @fake real implementation from the start.
 */
export async function saveChatAttachment(input: {
  businessId: string;
  uploadedBy: string;
  originalName: string;
  mimeType: string;
  bytes: Uint8Array;
  purpose?: 'chat-attachment' | 'template-asset';
}): Promise<ChatAttachment> {
  throw new AppError("SERVICE_NOT_READY", "saveChatAttachment is not implemented");
}

/**
 * @owner F09 inbox · A1 · consumer: C1 F39 (MCP tool propose_order)
 * Creates the identity of a brand-new Demo Chat visitor for this business and returns a link that opens the public
 * Demo Chat as that visitor: the page reads `#v=<visitorToken>` from the URL fragment, verifies it through its session
 * route, stores the visitor cookie and removes the fragment. `customerExternalId` is `demo-visitor:<visitorId>`, so the
 * caller can saveMessage({ customer: { channel: 'web', externalId, displayName } }). Null when the business has no
 * enabled Demo Chat. The token can only read / write that one visitor's chat.
 * @fake { visitorId: uuid, customerExternalId, url: `${PUBLIC_BASE_URL}/demo-chat/s/<SEED slug>#v=fake-token`, publicSlug }
 *   for SEED shops, else null.
 */
export async function getDemoChatHandoff(
  businessId: string,
): Promise<{ visitorId: string; customerExternalId: string; url: string; publicSlug: string } | null> {
  throw new AppError("SERVICE_NOT_READY", "getDemoChatHandoff is not implemented");
}
