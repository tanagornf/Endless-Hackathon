import type { Channel, DeliveryMode, DeliveryState, MessageAuthor, MessageDirection, MessageOrigin, MessagePart } from '@nless/shared/core/types';

export interface ConversationRecord {
  id: string;
  businessId: string;
  customerId: string;
  customer: { displayName: string; externalId: string; channelAccountId: string | null };
  channel: Channel;
  status: 'open' | 'closed';
  handler: 'ai' | 'human';
  assigneeUserId: string | null;
  aiForceOn: boolean;
  lastMessageAt: string | null;
  lastInboundAt: string | null;
  unreadCount: number;
  version: number;
  createdAt: string;
}

export interface MessageRecord {
  id: string;
  businessId: string;
  conversationId: string;
  seq: number;
  direction: MessageDirection;
  author: MessageAuthor;
  authorUserId: string | null;
  parts: MessagePart[];
  /** Plain text of the parts (search, previews, model context). */
  text: string;
  channel: Channel;
  origin: MessageOrigin;
  externalId: string | null;
  groupId: string | null;
  delivery: { mode: DeliveryMode | null; state: DeliveryState; externalRef: string | null; error: string | null };
  createdAt: string;
}

export interface SaveMessageInput {
  businessId: string;
  /** Existing conversation. Omit it for a new inbound contact: give `customer` and core finds/creates customer + open conversation. */
  conversationId?: string;
  customer?: { channel: Channel; externalId: string; displayName?: string; channelAccountId?: string | null };
  direction: MessageDirection;
  author: MessageAuthor;
  authorUserId?: string | null;
  parts: MessagePart[];
  /** Provider message id. Unique per (business, channel): a replayed webhook returns the existing row, created:false. */
  externalId?: string | null;
  /** Default: 'live' (or 'demo' for channel 'web'). */
  origin?: MessageOrigin;
  /**
   * Default true only for direction 'inbound' + author 'customer' + origin 'live'|'demo'. Set false to store without
   * replying (e.g. F30 saves voice transcripts with triggerAi: false — the realtime model already answered).
   */
  triggerAi?: boolean;
  /** Same message from bubble splitting / rich rows shares one groupId. */
  groupId?: string | null;
  /** Provider extras kept on the row, e.g. { replyToken, replyTokenExpiresAt } (LINE), { windowExpiresAt } (Messenger / Instagram 24-hour window). */
  providerMeta?: Record<string, unknown>;
  /** Staff sends from the browser: same id twice → same row. */
  clientRequestId?: string | null;
  occurredAt?: string;
}

export interface SaveMessageResult {
  message: MessageRecord;
  conversation: ConversationRecord;
  /** false = dedup hit (externalId or clientRequestId seen before): nothing inserted, no AI job. */
  created: boolean;
  /** Job id of 'ai.reply' when one was enqueued, else null. */
  aiJobId: string | null;
}

export interface HistoryOptions {
  /** Default 30, max 100. Out of range / not an integer → VALIDATION_ERROR. */
  limit?: number;
  /** Cursor from a previous page: older messages. */
  before?: string | null;
  /** Cursor: newer messages (live refresh). Giving both before and after → VALIDATION_ERROR. */
  after?: string | null;
  businessId?: string;
}

/** Job type enqueued by saveMessage and handled by F10 (B2). */
export const AI_REPLY_JOB = 'ai.reply';

export interface AiReplyJobPayload extends Record<string, unknown> {
  conversationId: string;
  messageId: string;
}

export interface ChatAttachmentRef {
  fileId: string;
  kind: 'image' | 'file';
}

export interface ChatAttachment {
  fileId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  kind: 'image' | 'file';
}

export interface ConversationDetail {
  conversation: ConversationRecord;
  assigneeName: string | null;
  waitingSince: string | null;
  isWaiting: boolean;
  aiPending: boolean;
  aiEnabled: boolean;
}

export type ConversationFilter = 'all' | 'waiting' | 'active' | 'closed';

export interface ListConversationsInput {
  filter: ConversationFilter;
  assignee?: string;
  search?: string;
  cursor?: string;
  limit: number;
}

export interface InboxRow {
  conversationId: string;
  customerId: string;
  customerName: string;
  channel: Channel;
  status: 'open' | 'closed';
  handler: 'ai' | 'human';
  assigneeUserId: string | null;
  assigneeName: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string;
  unreadCount: number;
  waitingSince: string | null;
  isWaiting: boolean;
  version: number;
}

export interface InboxCounts {
  all: number;
  waiting: number;
  active: number;
  closed: number;
}

export interface DemoChatMessage {
  id: string;
  seq: number;
  direction: MessageDirection;
  author: 'customer' | 'ai' | 'staff';
  parts: MessagePart[];
  createdAt: string;
  delivery: DeliveryState | null;
}

export interface DemoChatPoll {
  conversationId: string | null;
  items: DemoChatMessage[];
  cursor: string | null;
  pending: null | { since: string; state: 'typing' | 'failed' };
  closed: boolean;
}

export interface DemoChatSendResult {
  message: DemoChatMessage;
  conversationId: string;
  created: boolean;
}

export interface DemoChatActionResult {
  decision: 'confirm' | 'cancel';
  replayed: boolean;
}

export interface DemoChatShopView {
  shopName: string;
  language: 'th' | 'en';
  welcomeText: string | null;
  suggestedQuestions: string[];
  welcomeTextEn: string | null;
  suggestedQuestionsEn: string[];
  aiEnabled: boolean;
  capReached: boolean;
}

export interface DemoChatSettingsView {
  enabled: boolean;
  publicSlug: string;
  publicUrl: string;
  welcomeText: string | null;
  suggestedQuestions: string[];
  welcomeTextEn: string | null;
  suggestedQuestionsEn: string[];
  todayTurns: number;
  dailyCap: number;
}
