import type { MembershipRole, PermissionKey } from '@nless/shared/core/permissions';
import type { FeatureId } from '@nless/shared/core/features';

/** JSON Schema object (OpenAI tools / structured output). Build it from zod with `z.toJSONSchema()`. */
export type JsonSchema = Record<string, unknown>;

/** 02 §5. Every HTTP success body. Built by core from the handler's return value. */
export interface ApiMeta {
  requestId: string;
  schemaVersion: 1;
  serverTime: string;
}

export interface ApiResult<T> {
  data: T;
  meta: ApiMeta;
}

/** 02 §5. Every HTTP error body. Built by core from a thrown AppError (anything else → INTERNAL). */
export interface ApiFailure {
  error: {
    code: ErrorCode;
    message: string;
    retryable: boolean;
    details?: Record<string, unknown>;
  };
  meta: ApiMeta;
}

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'AUTH_REQUIRED'
  | 'PERMISSION_DENIED'
  | 'BUSINESS_INACTIVE'
  | 'ACCOUNT_DISABLED'
  | 'NOT_FOUND'
  | 'VERSION_CONFLICT'
  | 'IDEMPOTENCY_CONFLICT'
  | 'SLOT_FULL'
  | 'SOLD_OUT'
  | 'CHANNEL_NOT_CONNECTED'
  | 'PROPOSAL_EXPIRED'
  | 'POLICY_BLOCKED'
  | 'KNOWLEDGE_NOT_READY'
  | 'RATE_LIMITED'
  | 'INTERNAL'
  | 'PROVIDER_UNAVAILABLE'
  /** OpenAI 429 `insufficient_quota` family (credits gone / project hard limit hit). Always retryable: false. */
  | 'PROVIDER_BUDGET_EXHAUSTED'
  | 'SERVICE_NOT_READY';

/** There are no plans or quotas in the app (everything is unlimited), so there is no QUOTA_EXCEEDED code. */
export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  AUTH_REQUIRED: 401,
  PERMISSION_DENIED: 403,
  BUSINESS_INACTIVE: 403,
  ACCOUNT_DISABLED: 403,
  NOT_FOUND: 404,
  VERSION_CONFLICT: 409,
  IDEMPOTENCY_CONFLICT: 409,
  SLOT_FULL: 409,
  SOLD_OUT: 409,
  CHANNEL_NOT_CONNECTED: 409,
  PROPOSAL_EXPIRED: 422,
  POLICY_BLOCKED: 422,
  KNOWLEDGE_NOT_READY: 422,
  RATE_LIMITED: 429,
  INTERNAL: 500,
  PROVIDER_UNAVAILABLE: 502,
  PROVIDER_BUDGET_EXHAUSTED: 503,
  SERVICE_NOT_READY: 503,
};

/** Cursor page. `nextCursor` is opaque; null = no more rows. Never offset paging on live data. */
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/**
 * A reporting range in UTC ISO-8601, half-open [from, to). Used by every `get…Metrics` contract (F27 seller impact
 * metrics read other features' numbers only through those contracts, never through their tables).
 */
export interface MetricsRange {
  from: string;
  to: string;
}

/** One row of GET /api/v1/features (core). The web shell hides menu entries and routes where `visible` is false. */
export interface FeatureFlagView {
  featureId: string;
  slug: string;
  lane: string;
  tier: 'P0' | 'P1' | 'P2' | 'P3';
  /** From the core `feature_flags` table (ops page toggle, initial value from HIDDEN_FEATURES). */
  hidden: boolean;
  reason: string | null;
  /** The feature still has only the scaffold's placeholder route (not built yet). */
  placeholder: boolean;
  /** !hidden && !(placeholder && production): no placeholder page is ever shown on production (D6). */
  visible: boolean;
}

/** Body of PUT /api/v1/ops/features/:featureId (platform admin; the toggle UI lives on the F35 ops page). */
export interface SetFeatureFlagBody {
  hidden: boolean;
  reason?: string;
}

/**
 * 02 §5, extended (role, isPlatformAdmin). Built ONLY by core after it checks session + membership.
 * Never taken from a request body. isPlatformAdmin only unlocks F35 ops tools (/ops); there is no admin feature.
 */
export interface AuthScope {
  userId: string;
  accountId: string;
  businessId?: string;
  permissions: PermissionKey[];
  role?: MembershipRole;
  isPlatformAdmin: boolean;
}

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  status: 'active' | 'disabled';
  isPlatformAdmin: boolean;
  locale: 'th' | 'en';
  /** How the current session was created. 'dev' = DEV LOGIN (setup); F02 adds 'password'. */
  sessionKind: 'dev' | 'password' | 'oauth';
}

export interface BusinessRecord {
  id: string;
  accountId: string;
  name: string;
  status: 'active' | 'suspended' | 'deleted';
  timezone: string;
  language: 'th' | 'en';
  version: number;
}

/** 'web' = Demo Chat (core sender). 'line' = F17, 'facebook' (Messenger) + 'instagram' = F18 (C2). No other channel. */
export type Channel = 'web' | 'line' | 'facebook' | 'instagram';

export type JobState = 'queued' | 'running' | 'succeeded' | 'failed' | 'dead' | 'cancelled';

export type KnowledgeStatus = 'draft' | 'reviewed' | 'active' | 'inactive' | 'deleted';

export type KnowledgeIndexState = 'not_started' | 'indexing' | 'ready' | 'failed';

/** Broadcast opt-in/opt-out kept by F24 crm and re-checked by F23 broadcast at send time (not a legal consent record). */
export type MarketingConsent = 'granted' | 'revoked' | 'unknown';

export type ShippingRule =
  | { kind: 'threshold'; feeMinor: number; freeFromSubtotalMinor: number }
  | { kind: 'flat'; feeMinor: number };

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

/** Local times in the business timezone, 'HH:mm'. Empty array = closed. Used by F04 settings and F15 booking. */
export type WeeklyHours = Record<Weekday, { open: string; close: string }[]>;

export type DeliveryMode = 'real' | 'sandbox';

export type DeliveryState = 'not_required' | 'pending' | 'sent' | 'failed' | 'unknown';

export type MessageDirection = 'inbound' | 'outbound';

export type MessageAuthor = 'customer' | 'ai' | 'staff' | 'system';

export type MessageOrigin = 'live' | 'demo' | 'broadcast' | 'comment' | 'system';

export interface TextPart {
  type: 'text';
  text: string;
}

/** Image by canonical upload reference (core `files` row). `url` is filled by the server for display. */
export interface ImagePart {
  type: 'image';
  fileId: string;
  alt?: string;
  url?: string;
}

export interface FilePart {
  type: 'file';
  fileId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  url?: string;
}

export interface ProductCardItem {
  itemId: string;
  variantId: string | null;
  sku: string;
  name: string;
  unitPriceMinor: number;
  currency: 'THB';
  available: number | null;
  soldOut: boolean;
  imageFileId?: string;
  /** Catalog version the price came from (evidence). */
  version: number;
}

export interface ProductCardPart {
  type: 'product_card';
  items: ProductCardItem[];
  /** Plain-text fallback for channels that cannot render cards (LINE altText, SMS-like). */
  altText: string;
}

export interface ReviewLine {
  itemId: string;
  variantId: string | null;
  sku: string;
  name: string;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
}

export interface OrderReviewPart {
  type: 'order_review';
  proposalId: string;
  version: number;
  lines: ReviewLine[];
  subtotalMinor: number;
  deliveryFeeMinor: number;
  totalMinor: number;
  currency: 'THB';
  expiresAt: string;
  /** Opaque server token; the customer's confirm action must send it back. Not a secret key. */
  reviewToken: string;
}

export interface BookingReviewPart {
  type: 'booking_review';
  proposalId: string;
  version: number;
  serviceName: string;
  resourceName: string;
  startAt: string;
  endAt: string;
  timezone: string;
  /** e.g. "22 พ.ย. 2569 10:00 Asia/Bangkok" — rendered by the server, not by the model. */
  localDisplay: string;
  expiresAt: string;
  reviewToken: string;
}

export type ButtonAction =
  | { kind: 'postback'; data: string }
  | { kind: 'link'; url: string }
  | { kind: 'confirm_proposal'; proposalId: string; version: number; reviewToken: string; decision: 'confirm' | 'cancel' };

export interface ActionButtonsPart {
  type: 'action_buttons';
  text?: string;
  /** Max 4 (LINE limit). `link` URLs must be server-generated (e.g. the F14 payment page), never model text. */
  buttons: { id: string; label: string; action: ButtonAction }[];
}

export type MessagePart =
  | TextPart
  | ImagePart
  | FilePart
  | ProductCardPart
  | OrderReviewPart
  | BookingReviewPart
  | ActionButtonsPart;

export interface ChatTurnRequest {
  clientRequestId: string;
  text: string;
  attachmentIds?: string[];
}

export type ProposalKind = 'order.create' | 'appointment.create' | 'appointment.reschedule' | 'appointment.cancel';

export interface ProposalSummary {
  id: string;
  kind: ProposalKind;
  version: number;
  expiresAt: string;
  summary: string;
  reviewToken: string;
}

export interface ChatTurnResult {
  turnId: string;
  state: 'completed' | 'awaiting_confirmation' | 'handoff' | 'pending' | 'failed';
  reply: { parts: MessagePart[]; evidenceIds: string[] };
  proposal?: ProposalSummary;
  /** generateReply() does not send, so it returns { mode, state: 'not_required' }. */
  delivery: { mode: DeliveryMode; state: DeliveryState };
}

/** The customer's consent action (button / postback). Model text saying "confirmed" is NOT consent. */
export interface ConfirmRequest {
  clientRequestId: string;
  proposalId: string;
  version: number;
  reviewToken: string;
  decision: 'confirm' | 'cancel';
}

export type RealtimeEvent =
  | { type: 'message.created'; conversationId: string; message: MessageRecordLite }
  | { type: 'message.updated'; conversationId: string; messageId: string; delivery: { mode: DeliveryMode | null; state: DeliveryState } }
  | { type: 'conversation.updated'; conversationId: string; handler: 'ai' | 'human'; assigneeUserId: string | null; status: 'open' | 'closed'; version: number }
  | { type: 'notification.created'; userId: string; notificationId: string; title: string }
  | { type: 'knowledge.status'; knowledgeItemId: string; indexState: KnowledgeIndexState }
  | { type: 'job.updated'; jobId: string; jobType: string; state: JobState; progress?: { done: number; total: number } }
  | { type: 'custom'; featureId: FeatureId; name: string; data: Record<string, unknown> };

/** Small message shape for realtime payloads (full MessageRecord lives in shared/features/inbox). */
export interface MessageRecordLite {
  id: string;
  seq: number;
  direction: MessageDirection;
  author: MessageAuthor;
  parts: MessagePart[];
  createdAt: string;
}
