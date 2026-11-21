# F18 meta — Facebook Messenger และ Instagram (Meta Messaging)

| | |
|---|---|
| Lane / คน | **C2** / **C** · ลำดับ 2 ใน lane (F17 → F18 → F21) |
| Tier / เป้า | **P1** · เป้า **R แยกต่อช่อง**: Messenger และ Instagram แต่ละช่องเป็น R เมื่อ test user (ผู้มี role ใน Meta app โหมด development) รับ-ส่งข้อความจริงได้ · ไม่มี test user/Page = รายงาน S หรือ A ตามจริง |
| Timebox | 60–150 นาที |
| เริ่มเมื่อ | หัวหน้าโพสต์ `LEAD: OPEN P1` และ F17 merge แล้ว (ใช้ `signedMediaUrl` ของ F17) |
| พึ่ง | F17 (`service.ts`: `signedMediaUrl`, route `/channel-media`) · F09 `saveMessage`, `getConversation`, `getCustomerLastInboundAt` · F11 `isHumanTakeover` · F04 `getBusinessSettings` · F13 `createOrderFromProposal` · F15 `createBooking` · F31 `notify` · core (`db`, `jobs`, `registerChannelSender`/`sendToCustomer`, `storage`, `rateLimit`/`assertRateLimit`, `encryptSecret`/`decryptSecret`, `audit`, `publish`) |
| ให้ | `registerChannelSender('facebook', …)` และ `registerChannelSender('instagram', …)` · export ภายใน lane C2 ให้ F21 (ไม่ใช่ contract ข้ามคน): `registerCommentHandler`, `sendPrivateReply`, `replyToComment`, `checkPrivateReply`, `getPrivateReplyLock` · F38 ใช้กรอบ 24 ชม. ผ่าน `providerMeta.windowExpiresAt` |
| ใช้ | ดู §4 |
| โฟลเดอร์ | `server/src/features/meta/` · `web/src/features/meta/` · `shared/features/meta/` |
| Web path | `/channels/meta` (เมนูกลุ่ม `settings`) |

อ่าน: `contracts.ts` (`saveMessage`/`providerMeta`, `ChannelSender`/`OutboundDelivery`/`DeliveryResult`, `getCustomerLastInboundAt`, `MessagePart`, `FeatureApi.webhook`) · [F17](F17-line.md) §5.1, §5.7, §5.13 (โครง webhook, postback action, สื่อเซ็น URL ใช้แบบเดียวกัน) · F09 (postback ข้อความ) · F12 (ปุ่ม `message` → postback)

## 1. เป้าหมายและ user stories

ทำไมมี: ลูกค้า Thai ใช้ Messenger และ Instagram DM ซื้อของ (นอก Shopee) · ใช้ Meta developer app **ตัวเดียว** ของทีมในโหมด development (เฉพาะ app roles / test users ส่งข้อความหา Page ได้ จึงไม่ต้องรอ App Review หรือ business verification) · กรรมการไม่ทัก Page จริง: ทีมเดโมให้ดูด้วยบัญชีทดสอบ

User stories:
1. เจ้าของเชื่อม Facebook Page (และ Instagram professional account ที่ผูกกับ Page) ผ่านปุ่มเข้าสู่ระบบ Facebook หรือวาง Page token แล้วเห็นสถานะ, ชื่อ Page/IG, URL webhook และรายการที่ต้องตั้งใน Meta dashboard
2. test user ทัก Page/IG → ข้อความ (ข้อความ, รูป, ไฟล์, ปุ่ม/quick reply) เข้า inbox → AI ตอบกลับในช่องเดิม
3. AI ส่งการ์ดสินค้า (generic template) และสรุปออเดอร์ (ปุ่มยืนยัน/ยกเลิก) ที่กดได้จริงใน Messenger/Instagram
4. พนักงานตอบหลังเกิน 24 ชั่วโมง: ระบบบล็อกพร้อมเหตุผลตรง ๆ (หรือใช้ tag `HUMAN_AGENT` ถ้าเปิดสิทธิ์ไว้ ภายใน 7 วัน)
5. webhook ซ้ำ ไม่สร้างข้อความซ้ำ · ลายเซ็นผิดถูกปฏิเสธ · ข้อความสะท้อนของ Page เอง (echo) ถูกเมิน
6. เจ้าของตัดการเชื่อมต่อ → ข้อความที่ค้างส่งไม่ออก
7. F21 ได้ event คอมเมนต์ และส่ง private reply/public reply ผ่าน F18

นอกขอบเขต: marketing opt-in/subscription (`messaging_optins`), handover protocol / Meta AI, เก็บ echo ของ Page เป็นข้อความ, `RefillMessengerProfiles` ทุก 15 นาที, Instagram Login แบบไม่ผ่าน Page (ใช้เส้นทาง Facebook Login ที่ผูก Page), ส่ง broadcast marketing (F23 ส่งผ่าน `sendToCustomer` และต้องอยู่ในกรอบ 24 ชม.), ข้อความเสียงขาเข้า (stretch `model.transcribe` เหมือน F17 §6) · F18 ไม่เรียก OpenAI

## 2. Data model

`server/src/features/meta/migrations/001_meta.sql`

```sql
-- dependsOn: core
CREATE TABLE meta_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('facebook','instagram')),
  account_id text NOT NULL,                 -- facebook: Page id · instagram: IG professional account id (= entry.id ของ webhook)
  page_id text NOT NULL,                    -- Page ที่ถือ token (facebook = account_id)
  display_name text NOT NULL DEFAULT '',
  username text,                            -- IG username
  token_enc text,                           -- encryptSecret(page access token) · NULL เมื่อ inactive
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','error','inactive')),
  status_reason text,                       -- 'token_invalid' | 'permission_missing' | 'disconnected' | ...
  human_agent_enabled boolean NOT NULL DEFAULT false,   -- เปิดเมื่อแอปได้สิทธิ์ Human Agent แล้วเท่านั้น (§5.9)
  subscribed_fields text[] NOT NULL DEFAULT '{}',
  generation int NOT NULL DEFAULT 1,
  connected_by uuid REFERENCES users(id),
  connected_at timestamptz NOT NULL DEFAULT now(),
  disconnected_at timestamptz,
  last_verified_at timestamptz,
  last_event_at timestamptz,
  events_total bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX meta_connections_account_live ON meta_connections (channel, account_id) WHERE status IN ('active','error');
CREATE UNIQUE INDEX meta_connections_business_live ON meta_connections (business_id, channel) WHERE status IN ('active','error');

-- Page ที่ผู้ใช้เลือกได้หลัง Facebook Login / วาง user token: token เข้ารหัส หมดอายุ 15 นาที
CREATE TABLE meta_pending_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  page_id text NOT NULL,
  page_name text NOT NULL,
  ig_account_id text,
  ig_username text,
  token_enc text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX meta_pending_pages_owner ON meta_pending_pages (business_id, user_id, expires_at);

-- log event (dedup ชั้นที่สอง + หน้า "เหตุการณ์ล่าสุด") เก็บ 14 วัน ไม่เก็บข้อความลูกค้า
CREATE TABLE meta_events (
  event_key text PRIMARY KEY,               -- เช่น 'facebook:mid:<mid>' · 'instagram:cmt:<comment id>' · 'facebook:pb:<sha256>'
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES meta_connections(id) ON DELETE CASCADE,
  channel text NOT NULL,
  event_type text NOT NULL,                 -- message | postback | comment | other
  state text NOT NULL DEFAULT 'received' CHECK (state IN ('received','done','ignored','failed')),
  note text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX meta_events_recent ON meta_events (business_id, received_at DESC);

-- ปุ่ม postback ฝั่งเซิร์ฟเวอร์ (เหมือน line_actions: payload ที่ส่งไป Meta เป็น id สั้น ๆ)
CREATE TABLE meta_actions (
  id text PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9]{12}$'),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('order','booking')),
  proposal_id text NOT NULL,
  version int NOT NULL,
  decision text NOT NULL CHECK (decision IN ('confirm','cancel')),
  review_token_enc text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX meta_actions_expiry ON meta_actions (expires_at);

-- ข้อความย่อยที่ส่งแล้วต่อข้อความหนึ่ง (Send API ไม่มี idempotency key: กัน retry ส่งซ้ำ)
CREATE TABLE meta_delivery_parts (
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  part_index int NOT NULL,
  state text NOT NULL CHECK (state IN ('accepted','unknown')),
  provider_message_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, part_index)
);

-- หลัง private reply: provider อนุญาตข้อความเดียวต่อ comment จนกว่าลูกค้าจะตอบ (F21 อ่านผ่าน getPrivateReplyLock)
CREATE TABLE meta_private_reply_locks (
  connection_id uuid NOT NULL REFERENCES meta_connections(id) ON DELETE CASCADE,
  comment_id text NOT NULL,
  recipient_id text NOT NULL,               -- recipient_id จาก response (PSID/IGSID) = customers.external_id ของแชตนั้น
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  locked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (connection_id, comment_id)
);
CREATE INDEX meta_private_reply_locks_recipient ON meta_private_reply_locks (connection_id, recipient_id, locked_at DESC);
```

กฎ: token ไม่ออกไปถึง browser/log/audit · `meta_pending_pages` ลบเมื่อหมดอายุ/เลือกแล้ว · ไม่แก้ตาราง core

## 3. API endpoints

ทุก path ใต้ `/api/v1` ยกเว้น webhook · `defineFeatureRoutes({ featureId: 'F18', slug: 'meta' })`

| Method | Path | auth | permission | Request | Response | Errors |
|---|---|---|---|---|---|---|
| GET | `/webhooks/meta` | none | — | query `hub.mode`, `hub.verify_token`, `hub.challenge` | `hub.challenge` เป็น text/plain | 403 token ไม่ตรง |
| POST | `/webhooks/meta` | none (signature) | — | raw body | `EVENT_RECEIVED` (text/plain) | 401 · 429 · 500 (enqueue ล้มเท่านั้น) |
| GET | `/businesses/:businessId/channels/meta` | business | `business.read` | — | `MetaChannelsView` | — |
| GET | `/businesses/:businessId/channels/meta/oauth/start` | business | `business.channels` | — | `{ url }` | PROVIDER_UNAVAILABLE (env ไม่ครบ) |
| GET | `/channels/meta/oauth/callback` | user | — | query `code`, `state` (หรือ `error`) | redirect `/channels/meta?pending=1` หรือ `?error=<code>` | — |
| POST | `/businesses/:businessId/channels/meta/connect-token` | business | `business.channels` | `ConnectTokenBody` | `{ connected: MetaConnectionView[] , pending: PendingPageView[] }` | VALIDATION_ERROR, POLICY_BLOCKED (`reason`), PROVIDER_UNAVAILABLE |
| GET | `/businesses/:businessId/channels/meta/pending` | business | `business.channels` | — | `{ items: PendingPageView[] }` | — |
| POST | `/businesses/:businessId/channels/meta/pending/:pendingId/select` | business | `business.channels` | — | `{ connected: MetaConnectionView[] }` | NOT_FOUND (หมดอายุ), POLICY_BLOCKED (`channel_in_use`, `not_test_account`), PROVIDER_UNAVAILABLE |
| POST | `/businesses/:businessId/channels/meta/:channel/verify` | business | `business.channels` | — | `MetaConnectionView` | CHANNEL_NOT_CONNECTED, PROVIDER_UNAVAILABLE |
| PUT | `/businesses/:businessId/channels/meta/:channel/settings` | business | `business.channels` | `SettingsBody` | `MetaConnectionView` | CHANNEL_NOT_CONNECTED, VALIDATION_ERROR |
| DELETE | `/businesses/:businessId/channels/meta/:channel` | business | `business.channels` | — | no_content | CHANNEL_NOT_CONNECTED |
| GET | `/businesses/:businessId/channels/meta/events` | business | `business.channels` | `EventsQuery` | `{ items: MetaEventRow[] }` | — |

`:channel` ∈ `facebook | instagram`

```ts
import { z } from 'zod';
export const ChannelParam = z.enum(['facebook', 'instagram']);
export const ConnectTokenBody = z.object({
  pageAccessToken: z.string().min(20).max(800),             // Page token หรือ long-lived user token
  pageId: z.string().regex(/^[0-9]{5,25}$/).optional(),     // ใช้เฉพาะ META_MODE=sandbox
  igAccountId: z.string().regex(/^[0-9]{5,25}$/).optional(),// ใช้เฉพาะ META_MODE=sandbox
}).strict();
export const SettingsBody = z.object({ humanAgentEnabled: z.boolean() }).strict();
export const EventsQuery = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20), channel: ChannelParam.optional() });
```

```ts
// shared/features/meta/types.ts
export interface MetaConnectionView {
  channel: 'facebook' | 'instagram';
  status: 'active' | 'error' | 'inactive' | 'none';
  statusReason: string | null;
  accountId: string | null;
  displayName: string | null;
  username: string | null;
  humanAgentEnabled: boolean;
  subscribedFields: string[];
  connectedAt: string | null;
  lastVerifiedAt: string | null;
  lastEventAt: string | null;
  eventsTotal: number;
}
export interface PendingPageView { id: string; pageId: string; pageName: string; igAccountId: string | null; igUsername: string | null; expiresAt: string }
export interface MetaChannelsView {
  mode: 'real' | 'sandbox';
  graphVersion: string | null;                  // META_GRAPH_VERSION (ว่าง = ยังตั้งค่าไม่ครบ)
  appConfigured: boolean;                       // META_APP_ID + META_APP_SECRET + META_VERIFY_TOKEN + META_GRAPH_VERSION
  webhookUrl: string;                           // `${PUBLIC_BASE_URL}/webhooks/meta`
  oauthRedirectUri: string;                     // `${PUBLIC_BASE_URL}/api/v1/channels/meta/oauth/callback`
  verifyTokenHint: string;                      // ตัวอักษร 2 ตัวแรก + '…' (ไม่ส่งทั้งค่า)
  testAccountsOnly: boolean;                    // META_TEST_PAGE_ID ตั้งอยู่
  facebook: MetaConnectionView;
  instagram: MetaConnectionView;
}
export interface MetaEventRow { eventKey: string; channel: string; eventType: string; state: string; note: string | null; receivedAt: string }
```

## 4. Service functions และ contracts

ไฟล์ภายใน: `service.ts` · `config.ts` · `routes.ts` · `webhook.ts` · `events.ts` (job `meta.event`) · `normalize.ts` · `graph.ts` (HTTP client: fetch ฉีดได้, `appsecret_proof`, แปลง error) · `sender.ts` · `outbound.ts` · `actions.ts` · `media.ts` (ดาวน์โหลดขาเข้า, allowlist) · `connection.ts` · `oauth.ts` · `comments.ts` (export ให้ F21) · `repo.ts` · `*.test.ts`

ไม่มี contract ใหม่ข้าม lane · ให้: `registerChannelSender('facebook'|'instagram', …)` เมื่อ `META_MODE=real` (sandbox = ไม่ register)

Export ภายใน lane (`server/src/features/meta/service.ts`, ใช้โดย F21):

```ts
export type CommentChannel = 'facebook' | 'instagram';
export interface MetaCommentEvent {
  businessId: string;
  connectionId: string;
  channel: CommentChannel;
  accountId: string;               // Page id / IG account id
  commentId: string;
  postId: string | null;           // Page: post_id · IG: media.id
  scope: 'post' | 'live';          // IG live_comments / media_product_type LIVE = 'live'
  authorId: string;
  authorName: string | null;       // Page: from.name · IG: from.username
  text: string;                    // ตัดที่ 2000
  createdAt: string;               // ISO
}
export type CommentHandler = (event: MetaCommentEvent) => Promise<void>;
/** เรียกครั้งเดียวใน register() ของ F21. handler ต้องเร็ว (enqueue job ของตัวเอง) */
export declare function registerCommentHandler(handler: CommentHandler): void;
export interface PrivateReplyResult {
  state: 'sent' | 'already_replied' | 'failed' | 'unknown';
  recipientId: string | null;      // PSID/IGSID จาก response (ใช้เป็น customers.external_id)
  messageId: string | null;
  error?: string;                  // สั้น ไม่มี token
  retryable: boolean;
}
export declare function sendPrivateReply(input: { businessId: string; channel: CommentChannel; commentId: string; text: string }): Promise<PrivateReplyResult>;
export declare function checkPrivateReply(input: { businessId: string; channel: CommentChannel; commentId: string }): Promise<{ state: 'sent' | 'not_sent' | 'unverifiable' }>;
export declare function replyToComment(input: { businessId: string; channel: CommentChannel; commentId: string; text: string }): Promise<{ state: 'sent' | 'failed' | 'unknown'; replyId: string | null; error?: string; retryable: boolean }>;
export declare function getPrivateReplyLock(businessId: string, customerExternalId: string, channel: CommentChannel): Promise<{ locked: boolean; commentId: string | null; lockedAt: string | null }>;
```

Contract ที่ใช้ (signature ตาม `contracts.ts`): ดูตาราง F17 §4 + `getCustomerLastInboundAt(businessId, customerId): Promise<string | null>` · `getConversation(...)` (ใช้ `customerId`) · F13/F15 stage `confirm` เหมือน F17 §5.7

## 5. Algorithms

### 5.0 ค่าคงที่ (`config.ts`) และ env

| ค่า | ค่า |
|---|---|
| `GRAPH_BASE` | `https://graph.facebook.com/${META_GRAPH_VERSION}` (ไม่มีเลขเวอร์ชันในโค้ด) |
| `WINDOW_MS` | 86 400 000 (24 ชม.) · margin ปลอดภัย 120 000 ms (ถือว่าหมดก่อน 2 นาที) |
| `HUMAN_AGENT_MAX_MS` | 604 800 000 (7 วัน) |
| `FB_TEXT_MAX_CHARS` / `IG_TEXT_MAX_BYTES` | 1 900 อักขระ / 950 ไบต์ UTF-8 (limit จริง 2 000 / 1 000 ตามเอกสารเดิม: UNCONFIRMED §15) |
| `TEMPLATE_MAX_ELEMENTS` | 10 · `TEMPLATE_TITLE_MAX` 80 · `TEMPLATE_BUTTON_MAX` 3 · `BUTTON_TITLE_MAX` 20 · `BUTTON_TEXT_MAX` 640 |
| `QUICK_REPLY_MAX` / `QUICK_TITLE_MAX` | 13 / 20 |
| `PAYLOAD_MAX_BYTES` | 1 000 (postback / quick reply payload) |
| `ATTACHMENTS_PER_MESSAGE_MAX` | 10 (Meta ส่งได้มากกว่า ตัดส่วนเกินพร้อมบันทึกข้อความ `[มีไฟล์แนบเกินกำหนด n รายการ]`) |
| `DOWNLOAD_MAX_BYTES` | `UPLOAD_MAX_MB` ของ core · timeout 15 วินาที · redirect สูงสุด 2 ครั้ง |
| `ALLOWED_MEDIA_HOST_SUFFIXES` | `.fbcdn.net`, `.fbsbx.com`, `.cdninstagram.com` (UNCONFIRMED §15) |
| `HTTP_TIMEOUT_MS` | 10 000 (send) · 3 000 (typing, profile) |
| `WEBHOOK_RATE` | 600 / 60 วินาที ทั้งแอป · ลายเซ็นผิด 30 / 60 วินาที |
| `EVENT_MAX_AGE_MS` | 172 800 000 (2 วัน) |
| `PENDING_TTL_MS` | 900 000 |
| `OAUTH_STATE_TTL_MS` | 600 000 |
| `RETENTION_DAYS` | `meta_events` 14 · `meta_actions` หลังหมดอายุ 2 · pending ตามที่หมดอายุ |

env (ใช้ชื่อที่มีใน `.env.example` เท่านั้น): `META_MODE` (`real` | `sandbox`) · `META_APP_ID` · `META_APP_SECRET` · `META_VERIFY_TOKEN` · `META_GRAPH_VERSION` (**ไม่มีค่าเริ่มต้นในโค้ด**: ว่างในโหมด real = เชื่อมต่อ/ส่งไม่ได้ ตอบ `PROVIDER_UNAVAILABLE` "META_GRAPH_VERSION is not set" และ `appConfigured=false`) · `META_TEST_PAGE_ID` · `META_TEST_IG_ACCOUNT_ID` (ถ้าตั้ง: **อนุญาตเชื่อมเฉพาะ Page/IG นี้** — กันเชื่อมผิดเพจ; ว่าง = เชื่อมได้ทุกเพจที่ token เข้าถึง) · `PUBLIC_BASE_URL` · `SESSION_SECRET` · `TOKEN_ENCRYPTION_KEY`

### 5.1 Webhook GET (handshake)

`api.webhook('GET', '/meta', …)` · `hub.mode === 'subscribe'` และ `hub.verify_token` เทียบกับ `META_VERIFY_TOKEN` ด้วย `timingSafeEqual` (เทียบ sha256 ของทั้งสองฝั่งให้ความยาวเท่ากัน) · ผ่าน → 200 `text/plain` = ค่า `hub.challenge` (ต้องเป็นข้อความ/ตัวเลขเท่านั้น: ตรวจ `^[A-Za-z0-9_-]{1,200}$` ไม่งั้น 403) · ไม่ผ่าน/ไม่ได้ตั้ง `META_VERIFY_TOKEN` → 403 · `assertRateLimit({ key:'webhook:meta:verify', limit: 30, windowSeconds: 60 })`

### 5.2 Webhook POST — ตอบเร็ว งานหนักใน job

1. `assertRateLimit('webhook:meta', 600/60)` · `rawBody.byteLength > 1_000_000` → 413
2. **ลายเซ็นก่อน parse:** header `x-hub-signature-256` ต้องเป็น string เดียวรูป `sha256=<64 hex>` · `expected = 'sha256=' + hex(HMAC_SHA256(META_APP_SECRET, rawBody))` · `timingSafeEqual` บน Buffer (ความยาวไม่เท่า = ไม่ตรง) · ไม่ตรง/ไม่มี/`META_APP_SECRET` ว่าง → นับ `webhook:meta:bad` (30/60) แล้ว **401** (ไม่ log ค่า header/body)
3. parse JSON ด้วย zod `WebhookBody { object: 'page'|'instagram' (อื่น → 200 ทิ้ง), entry: array(passthrough) }` ไม่ตรงรูป → 200
4. ต่อ `entry` (สูงสุด 50): `accountId = entry.id` · หา connection: `object==='page' → channel 'facebook'`, `object==='instagram' → 'instagram'` · `SELECT … WHERE channel=$1 AND account_id=$2 AND status IN ('active','error')` · ไม่พบ → ข้าม entry (200) · business ของ connection ไม่ `active` (`businesses.status`) → ข้าม · **business มาจาก connection เท่านั้น ไม่เคยมาจาก payload**
5. ต่อ item ใน `entry.messaging[]` และ `entry.changes[]` (รวมสูงสุด 200 ต่อ request) สร้าง `eventKey` (§5.3) · ข้ามเมื่อ: `message.is_echo === true`, `sender.id === accountId` (Page ส่งเอง), มีเฉพาะ `delivery`/`read`/`reaction`/`referral`/`messaging_handovers`/`standby`, `timestamp` เก่ากว่า `EVENT_MAX_AGE_MS`
6. `INSERT INTO meta_events … ON CONFLICT DO NOTHING RETURNING` · มีแล้วและ `done|ignored` → ข้าม · แล้ว `jobs.enqueue('meta.event', { connectionId, item, kind, receivedAtMs }, { dedupKey: 'meta.event:' + eventKey, businessId, lockKey: 'meta:' + connectionId + ':' + senderOrCommentAuthorId, maxAttempts: 5 })` + `UPDATE meta_connections SET last_event_at = now(), events_total = events_total + 1`
7. enqueue ล้มเหลว → **500** (Meta redeliver; dedup กันซ้ำ) · ไม่งั้น 200 `EVENT_RECEIVED` ภายใน ~1 วินาที (ไม่เรียกเครือข่ายภายนอกใน handler)

### 5.3 event → `eventKey` และ normalisation (`normalize.ts`, job `meta.event`)

| item | `eventKey` | ผล |
|---|---|---|
| `messaging[i].message` (มี `mid`) | `<channel>:mid:<mid>` · หลาย attachment: ตัวแรก `…:<mid>`, ตัวถัดไป `…:<mid>:2`, `:3` … (เหมือนแบบเดิม: webhook ซ้ำได้ id คงที่) | ข้อความลูกค้า §5.4 |
| `messaging[i].postback` | `<channel>:pb:<sha256(accountId|sender.id|timestamp|payload)[:40]>` | §5.7 |
| `changes[i]` FB `field:'feed'`, `value.item==='comment'`, `value.verb==='add'` | `facebook:cmt:<comment_id>` | comment §5.12 (เฉพาะ top-level: `parent_id === post_id`; ตอบซ้อน = ข้าม; `from.id === accountId` = ข้าม) |
| `changes[i]` IG `field:'comments'` หรือ `'live_comments'` | `instagram:cmt:<value.id>` | comment §5.12 (`parent_id` มีค่า = ตอบซ้อน ข้าม; `from.id === accountId` ข้าม) |
| อื่น (`messaging_optins`, `message_reactions`, `message_deliveries`, `message_reads`, `standby`…) | — | ไม่สร้าง event |

### 5.4 ข้อความเข้า

ใน job `meta.event` (kind `message`): ตรวจ connection/business ยังใช้ได้ (ไม่ → `ignored`) · `customer = { channel, externalId: sender.id, displayName, channelAccountId: accountId }` · `origin: 'live'` · `occurredAt = timestamp` (ไม่เกิน now) · `externalId` = ตาม `eventKey` (ส่วนหลัง channel) · `providerMeta = { windowExpiresAt: <occurredAt+24h ISO>, accountId, mid }`

| ข้อมูล | parts | `triggerAi` |
|---|---|---|
| `message.text` เท่านั้น | text (trim ≤ 2 000) | ค่าเริ่มต้น |
| `message.quick_reply.payload` | ถ้า payload ขึ้นต้น `nl:a:` → action §5.7 · ไม่งั้น text = `message.text` (title ของปุ่ม) | ค่าเริ่มต้น |
| attachment `image` | `ImagePart` (ดาวน์โหลด §5.5) · text ของข้อความ (ถ้ามี) ไปกับรูปแรกเป็น `TextPart` ก่อนรูป | ค่าเริ่มต้น |
| `payload.sticker_id` (สติกเกอร์/ถูกใจ) | text `[สติกเกอร์]` | false |
| attachment `video` / `audio` / `file` | `FilePart` + text `[วิดีโอ]`/`[ข้อความเสียง]` (ข้อความเสียงได้ข้อความแจ้งเหมือน F17 §5.4.1 ครั้งต่อชั่วโมงต่อ customer โดยเก็บเวลาใน `providerMeta` ของข้อความ ไม่มีตารางใหม่: ตรวจจากประวัติ 20 ข้อความล่าสุดผ่าน `getHistory` ว่ามีข้อความแจ้งไปแล้วใน 1 ชม. หรือไม่) | false |
| attachment `location` | text `[ตำแหน่ง] <title> (<lat>, <long>)` | ค่าเริ่มต้น |
| attachment `fallback` (ลิงก์) / `share` / `ig_reel` / `story_mention` / `ig_post` | text `[ลิงก์/โพสต์ที่ลูกค้าแชร์]` + title ถ้ามี (**ไม่ดึง URL**) | false |

ทุก part ในข้อความ Meta หนึ่งข้อความที่มีหลาย attachment แยกเป็นหลาย `saveMessage` ตาม `eventKey` ลำดับ `:2`, `:3`… (ตัวแรกพา text) · ข้อความที่ไม่มีเนื้อหาใช้ได้เลย (เช่นเฉพาะ reaction) → `ignored` `empty`

หลัง `saveMessage` (`created === true` และ `aiJobId !== null`): ตรวจ `aiEnabled` และ `!isHumanTakeover` → **typing indicator** (best effort): `POST /{accountId}/messages { recipient:{id}, sender_action:'typing_on' }` timeout 3 วินาที ล้มก็ข้าม · โปรไฟล์ best effort ก่อน `saveMessage` ครั้งแรกของ customer: Messenger `GET /{psid}?fields=name` · IG `GET /{igsid}?fields=name,username` (ใช้ `name || username`; ล้ม = `'Messenger user'`/`'Instagram user'`)

### 5.5 ดาวน์โหลด attachment (SSRF-safe, `media.ts`)

1. URL มาจาก `attachment.payload.url` เท่านั้น · `new URL()` ต้อง `https:`, ไม่มี username/password, port ว่างหรือ 443, hostname ลงท้ายด้วยหนึ่งใน `ALLOWED_MEDIA_HOST_SUFFIXES` (เทียบแบบ `host === suffix.slice(1) || host.endsWith(suffix)` ตัวพิมพ์เล็ก) และ **ไม่ใช่ IP literal**
2. `fetch(url, { redirect: 'manual' })` ไม่ส่ง `Authorization` (URL ของ Meta เซ็นในตัว) · 3xx → ตรวจ `Location` ด้วยกฎข้อ 1 อีกครั้ง ไม่เกิน 2 hop
3. ตรวจ `Content-Length`/สะสมไบต์ ≤ `DOWNLOAD_MAX_BYTES` · timeout 15 วินาที
4. รูป: ตรวจ magic bytes ด้วย `sharp(bytes).metadata()` (`jpeg|png|gif|webp`) · อื่น ๆ whitelist MIME เหมือน F17 §5.5 ข้อ 3
5. `storage.save({ businessId, uploadedBy: null, purpose:'chat-attachment', originalName:'meta-<mid>-<n>.<ext>', mimeType, bytes })`
6. ล้ม: เครือข่าย/5xx/timeout → throw (job retry delay 5 วินาทีเท่าตัว, ครบ 5 รอบ → text `[ไฟล์แนบที่ระบบดาวน์โหลดไม่สำเร็จ]`) · host ไม่ผ่าน allowlist/ชนิดไม่ถูก/ใหญ่เกิน → ไม่ retry, บันทึก text placeholder ทันที + `meta_events.note='media_blocked'` (ไม่ log URL เต็ม: log เฉพาะ hostname)

### 5.6 Dedup, replay, echo

ชั้น 1 `meta_events.event_key` PK · ชั้น 2 jobs `dedupKey` · ชั้น 3 `saveMessage.externalId` (ไม่ซ้ำต่อ business+channel) · ลายเซ็นไม่มี timestamp จึงใช้ dedup + `EVENT_MAX_AGE_MS` · echo (`is_echo`) และ sender = Page เมินเสมอ (ข้อความของเราที่ส่งออกถูกบันทึกแล้วตอน `sendToCustomer`)

### 5.7 Postback / quick reply (`actions.ts`)

เหมือน F17 §5.7: `payload` (≤ 1 000 ไบต์) ขึ้นต้น `nl:a:` + id 12 ตัว → โหลด `meta_actions` (ต้อง `business_id` ตรง, ไม่หมดอายุ, เจ้าของ conversation = ผู้ส่ง) → บันทึกข้อความลูกค้า `ยืนยัน/ยกเลิก (ออเดอร์|นัดหมาย)` ด้วย `triggerAi:false` (`externalId` = `eventKey`) → `createOrderFromProposal`/`createBooking` stage `confirm` ด้วย `clientRequestId:'meta-action:'+id` → ตอบข้อความคงที่ตามตารางผลลัพธ์ **เดียวกับ F17 §5.7 ข้อ 6** (นำค่าข้อความไปใช้ตรงกัน: เก็บใน `config.ts` ของแต่ละ feature แยกกัน ไม่ import ข้าม feature) ผ่าน `sendToCustomer(..., { author:'ai', origin:'system', clientRequestId:'meta-act-result:'+eventKey, businessId })`
payload อื่น: เป็นข้อความลูกค้า = `postback.payload` เมื่อไม่ตรงรูป `^[A-Z0-9_]+$` (ค่าคงที่ระบบเช่น `GET_STARTED` → ใช้ `postback.title` ถ้ามี ไม่มีก็ข้าม) · ข้อความที่ได้บันทึกด้วย `saveMessage` ปกติ (AI ตอบ)

### 5.8 Sender (`sender.ts`): `facebook` และ `instagram`

`send(delivery)` คืนผลเสมอ:
1. connection: `business_id = delivery.businessId AND channel = <sender channel> AND (delivery.channelAccountId IS NULL OR account_id = delivery.channelAccountId) AND status IN ('active','error')` · ไม่มี/ไม่มี token → `failed` `CHANNEL_NOT_CONNECTED…` retryable false · `META_GRAPH_VERSION` ว่าง → `failed` `meta_graph_version_missing` retryable false
2. **กรอบ 24 ชั่วโมง** (§5.9) → ได้ `sendMode: 'RESPONSE' | 'HUMAN_AGENT'` หรือ failed `window_closed`
3. **ล็อก private reply** (§5.12): `getPrivateReplyLock` ยัง locked (ลูกค้ายังไม่ตอบหลัง private reply) → `failed` `awaiting_customer_reply: Meta allows only one message per comment until the customer replies` retryable false
4. แปลง parts → ข้อความ Send API (`outbound.ts` §5.10) แล้วส่ง **ทีละข้อความตามลำดับ** `POST {GRAPH_BASE}/{connection.account_id}/messages` (Facebook: id ของ Page · Instagram: id ของ IG account) header `Authorization: Bearer <token>` + query `appsecret_proof=<hex HMAC_SHA256(META_APP_SECRET, token)>` · body `{ recipient:{ id: customerExternalId }, messaging_type: 'RESPONSE' | 'MESSAGE_TAG', tag?: 'HUMAN_AGENT', message: {...} }` (Instagram: ไม่ส่ง `messaging_type` เมื่อเป็น RESPONSE; ใส่ `messaging_type:'MESSAGE_TAG'`+`tag` เมื่อ HUMAN_AGENT: UNCONFIRMED §15)
5. ต่อข้อความ `i`: มีแถว `meta_delivery_parts (message_id, i)` `accepted` → ข้าม · `unknown` → คืน `unknown` ทันที · 200 → insert `accepted` พร้อม `message_id` ที่ได้ · timeout/network → insert `unknown` แล้วคืน `{ state:'unknown' }` (ห้ามส่งซ้ำ)
6. แปลง error ของ Graph (`graph.ts`): body `error.code`/`error_subcode`:

| เงื่อนไข | ผล |
|---|---|
| code 10, 100, 200, 551 | `failed` retryable **false** (code 10 = นอกกรอบ/ไม่มีสิทธิ์; 551 = ผู้ใช้รับข้อความไม่ได้) พร้อมเหตุผลสั้น |
| code 190 (token ใช้ไม่ได้) | `markConnectionError('token_invalid')` + notify เจ้าของ (วันละครั้ง) + `failed` retryable false |
| code 4, 17, 32, 613 หรือ HTTP 429 | `failed` retryable **true** (throttle) |
| code 1, 2 หรือ HTTP 5xx | `failed` retryable **true** |
| 400 อื่น | `failed` retryable false |
| ส่งด้วย template แล้ว code 100 | ลองส่ง `altText` เป็น text หนึ่งครั้ง (ลดเฉพาะการ์ดนั้น) ก่อนสรุป failed |

7. ครบทุกข้อความ → `{ state:'sent', mode:'real', externalRef: <message_id ตัวสุดท้าย> }` · ข้อความท้ายล้มหลังข้อความต้น accepted → `failed` พร้อม `partial n/m` (retry จะข้ามที่ accepted)
8. error string สั้น ≤ 200 ไม่มี token/ข้อความลูกค้า

### 5.9 กรอบ 24 ชั่วโมง (A1 `getCustomerLastInboundAt`)

1. `customerId = (await getConversation(delivery.conversationId, { businessId })).customerId` · `lastInbound = await getCustomerLastInboundAt(businessId, customerId)` (ข้ามทุกแชตของลูกค้า) · null → `failed` `window_closed: no inbound message from this customer` retryable false
2. `age = now − lastInbound`
3. `age < WINDOW_MS − 120 000` → `RESPONSE` (Messenger ใส่ `messaging_type:'RESPONSE'`)
4. มิฉะนั้น ถ้า `author` ของข้อความ (`SELECT author FROM messages WHERE id = delivery.messageId`) = `'staff'` และ `connection.human_agent_enabled` และ `age < 7 วัน` → `HUMAN_AGENT` (tag) — `ai`/`system` ไม่มีสิทธิ์ใช้ tag นี้
5. ไม่เข้าข้อ 3–4 → `failed` `window_closed: the 24-hour messaging window is closed` retryable false (ข้อความนี้แสดงต่อ staff ใน inbox ตามที่ F09 แสดง `delivery.error`)
6. ค่าเริ่มต้น `human_agent_enabled = false` · เปิดได้ด้วย `PUT settings` เมื่อแอปได้สิทธิ์ Human Agent แล้ว (ตรวจในวันงาน §15 ข้อ 6)
7. ข้อความใน inbound ใช้ `providerMeta.windowExpiresAt` เป็น hint ให้ F38/F23 เท่านั้น ตัวตัดสินการส่งคือข้อ 1–5

### 5.10 `MessagePart` → Send API (`outbound.ts`)

ข้อความต่อ part เป็น Send API call แยกกัน (ไม่มี batch) · สูงสุด 12 call ต่อ delivery (เกิน → `failed` `too_many_parts`)

| part | Send API `message` | กฎ |
|---|---|---|
| `text` | `{ text }` | ตัดก้อนละ ≤ `FB_TEXT_MAX_CHARS` (FB) หรือ ≤ `IG_TEXT_MAX_BYTES` ไบต์ (IG) ที่ `\n\n` → `\n` → ช่องว่าง → ตัดตรง ๆ ไม่ตัดกลาง surrogate pair/ไบต์ UTF-8 · quick reply ของ `action_buttons` แนบกับข้อความ text สุดท้าย |
| `image` | `{ attachment:{ type:'image', payload:{ url: signedMediaUrl(fileId,{variant:'original',ttlSeconds:3600}), is_reusable:false } } }` | `PUBLIC_BASE_URL` ต้อง https · ใช้ `variant:'original'` (jpeg ≤ 4096) |
| `file` | FB: `{ attachment:{ type:'file', payload:{ url: signed (7 วัน) } } }` · IG: text `<fileName>\n<signed URL>` | |
| `product_card` | `{ attachment:{ type:'template', payload:{ template_type:'generic', image_aspect_ratio:'square', elements:[…≤10] } } }` | ต่อ item: `title = name` (≤ 80), `subtitle = '฿{ราคา}' + (soldOut ? ' · สินค้าหมด' : '')` (≤ 80), `image_url = signedMediaUrl(imageFileId,{variant:'square'})` ถ้ามี, `buttons = soldOut ? [] : [{ type:'postback', title:'สนใจ', payload: ('สนใจ ' + name) ตัดให้ ≤ 1 000 ไบต์ }]` · >10 ใบ → แยกเป็นข้อความถัดไป · `altText` ใช้เมื่อ fallback (§5.8 ข้อ 6) |
| `order_review` | ข้อความที่ 1: text สรุป (บรรทัดละรายการ `{name} × {qty}  ฿{lineTotal}`, ยอดสินค้า/ค่าส่ง/**รวม**, หมดอายุเมื่อ…) · ข้อความที่ 2: `button` template `{ text:'ยืนยันสั่งซื้อ รวม ฿{total} ไหมคะ?', buttons:[ confirm, cancel ] }` | ปุ่ม `postback` title `ยืนยันสั่งซื้อ`/`ยกเลิก` payload `nl:a:<id>` จาก `meta_actions` (2 แถว; `review_token_enc = encryptSecret(reviewToken)`; `expires_at = part.expiresAt`) |
| `booking_review` | text สรุป (บริการ, ผู้ให้บริการ, `localDisplay`) + `button` template `ยืนยันนัดหมายไหมคะ?` ปุ่ม `ยืนยันนัดหมาย`/`ยกเลิก` | เหมือนข้างบน (`kind:'booking'`) |
| `action_buttons` | ถ้ามีปุ่ม `link` หรือ `confirm_proposal` หรือมี `text`: `button` template `{ text (≤ 640, ไม่มี text → 'เลือกได้เลยค่ะ'), buttons ≤ 3 }` (`link` → `web_url` https เท่านั้น, `postback` → `postback` payload = `data` ตัดไม่เกิน 1 000 ไบต์, `confirm_proposal` → `nl:a:<id>` ชนิด `order` ถ้าไม่รู้) · ปุ่มเกิน 3 → ปุ่มที่ 4+ เป็น text ท้ายข้อความ · ถ้าไม่มี `text` และทุกปุ่มเป็น `postback` (≤ 13) → `quick_replies:[{ content_type:'text', title:label≤20, payload }]` แนบข้อความ text สุดท้าย (สร้าง `เลือกได้เลยค่ะ` ถ้าไม่มี) | title ≤ 20 |

ปุ่ม `postback` ที่ `data` เป็นข้อความลูกค้า (ตาม F12) ส่ง payload = ข้อความนั้นตรง ๆ → inbound กลับมาเป็นข้อความลูกค้าปกติตาม §5.7

**ป้ายและข้อความคงที่ของ Messenger/Instagram มีสองภาษา (แก้ 21 พ.ย.):** สตริงที่ F18 เขียนเองถึงลูกค้าเก็บใน `labels.ts` เป็น `{ th, en }` · `lang = await getCustomerLanguage(conversationId, { businessId })` (F09 · contracts.ts) หนึ่งครั้งต่อการส่งและต่อ postback · ใช้ชุดคำเดียวกับตารางสองภาษาของ [F17 §5.11](F17-line.md) (แต่ละฟีเจอร์เก็บสำเนาของตัวเองตามเดิม) และเพิ่มของ Meta:

| ที่ใช้ | th | en |
|---|---|---|
| product_card subtitle / ปุ่ม | ` · สินค้าหมด` · ปุ่ม `สนใจ` (payload `สนใจ {name}`) | ` · Sold out` · ปุ่ม `Interested` (payload `Interested in {name}`) |
| order_review | `ยืนยันสั่งซื้อ รวม ฿{total} ไหมคะ?` · ปุ่ม `ยืนยันสั่งซื้อ` / `ยกเลิก` · บรรทัดสรุป `ยอดสินค้า` / `ค่าส่ง` / `รวม` / `หมดอายุเมื่อ` | `Confirm this order, total ฿{total}?` · ปุ่ม `Confirm order` / `Cancel` · `Items` / `Delivery` / `Total` / `Expires at` |
| booking_review | `ยืนยันนัดหมายไหมคะ?` · ปุ่ม `ยืนยันนัดหมาย` / `ยกเลิก` | `Confirm this booking?` · ปุ่ม `Confirm booking` / `Cancel` |
| action_buttons ไม่มี text | `เลือกได้เลยค่ะ` | `Please choose an option.` |

ป้ายปุ่มอังกฤษทุกตัว ≤ `BUTTON_TITLE_MAX` (20) · ขีดจำกัดข้อความยังนับตามเดิม (Messenger เป็นตัวอักษร, Instagram เป็นไบต์ UTF-8): ข้อความอังกฤษ 1 ตัวอักษร = 1 ไบต์ ข้อความไทย 1 ตัวอักษร = 3 ไบต์ ตัวตัดต้องใช้หน่วยเดียวกับขีดจำกัดของช่องทางนั้นทั้งสองภาษา (test `outbound.test.ts`: ข้อความอังกฤษ 2 500 ตัว และข้อความไทย 700 ตัว บน Instagram ถูกแบ่งโดยไม่มีก้อนไหนเกิน 950 ไบต์) · ป้ายที่พนักงานเห็นใน inbox เท่านั้น (`[สติกเกอร์]`, `[ไฟล์แนบที่ระบบดาวน์โหลดไม่สำเร็จ]`) ใช้ภาษาของร้าน

### 5.11 Connect, token, OAuth (`connection.ts`, `oauth.ts`)

**ค่าที่ขอสิทธิ์ (OAuth scope):** `pages_show_list`, `pages_messaging`, `pages_manage_metadata`, `pages_read_engagement`, `pages_manage_engagement`, `instagram_basic`, `instagram_manage_messages`, `instagram_manage_comments`, `business_management` (ชื่อ scope: UNCONFIRMED §15 · ในโหมด development ผู้มี role ใช้ได้โดยไม่ต้อง review)

**ทางลัด (ทำก่อน = slice M1):** `POST connect-token { pageAccessToken }`
1. `GET /me?fields=id,name,category` ด้วย token (+ `appsecret_proof`) · มี `category` = **Page token** → ข้อ 2 · ไม่มี = **user token** → `GET /me/accounts?fields=id,name,access_token,instagram_business_account{id,username}` → สร้างแถว `meta_pending_pages` ต่อ Page (TTL 15 นาที) แล้วคืน `{ connected: [], pending: […] }` ให้ UI ให้เลือก
2. Page token: `GET /{pageId}?fields=id,name,instagram_business_account{id,username}` → ได้ชื่อ Page + IG ที่ผูก
3. ตรวจ test-only: `META_TEST_PAGE_ID` ตั้งอยู่และ ≠ pageId → `POLICY_BLOCKED` `reason:'not_test_account'` (IG: เทียบ `META_TEST_IG_ACCOUNT_ID` เมื่อตั้งอยู่; ไม่ตรง = เชื่อมเฉพาะ Facebook)
4. ภายใต้ `db.withAdvisoryLock('channel-owner:meta:' + channel + ':' + accountId)`: ถือโดย business อื่นที่ active → `POLICY_BLOCKED` `reason:'channel_in_use'` · business นี้มี connection ช่องเดียวกันคนละบัญชี → ตัวเก่า `inactive`
5. subscribe: `POST /{pageId}/subscribed_apps` form `subscribed_fields=messages,messaging_postbacks,feed` (+ `instagram` ไม่ต้องสมัครแยกรายเพจ: ตั้งที่ระดับแอป ดู §15 ขั้นตอน) → ต้อง `{ success:true }` ไม่งั้น `PROVIDER_UNAVAILABLE`/`POLICY_BLOCKED reason:'permission_missing'` · เก็บ `subscribed_fields`
6. upsert `meta_connections` (facebook) + (instagram ถ้ามี IG ผูกและ `GET /{igId}?fields=username` ผ่าน) ด้วย token เดียวกัน (`token_enc = encryptSecret`) · `audit('meta.connect', { targetId, details:{ channel, accountId } })` · `publish custom meta.connection.changed`
7. `META_MODE=sandbox`: ไม่เรียกเครือข่าย · ใช้ `pageId`/`igAccountId` จาก body (ไม่ใส่ = `META_TEST_PAGE_ID`/`META_TEST_IG_ACCOUNT_ID` หรือ `'sandbox-page'`) · `display_name = 'Sandbox Page'`

**OAuth (slice M3):** `GET oauth/start` → สร้าง `state = base64url(JSON{ businessId, userId, exp:now+10min, nonce }) + '.' + hex(HMAC_SHA256(SESSION_SECRET, payload))` · คืน URL `https://www.facebook.com/{version}/dialog/oauth?client_id=META_APP_ID&redirect_uri=<oauthRedirectUri>&state=<state>&scope=<scopes>&response_type=code` (version = `META_GRAPH_VERSION`) · callback (auth `user`): ตรวจ `state` (ลายเซ็น `timingSafeEqual`, `exp`, `userId === ctx.user.id`, user เป็นสมาชิกของ business พร้อมสิทธิ์ `business.channels` ผ่าน `ctx.requireBusiness`) → `GET /oauth/access_token?client_id&client_secret&redirect_uri&code` → short-lived token → `GET /oauth/access_token?grant_type=fb_exchange_token&client_id&client_secret&fb_exchange_token=<short>` → long-lived user token → ทำตามข้อ 1 (user token → pending pages) แล้ว redirect `/channels/meta?pending=1` · ผิดพลาด/ผู้ใช้ปฏิเสธ (`error=access_denied`) → redirect `?error=<code สั้น>` · token ไม่เคยส่งไป browser · `redirect_uri` ต้องตรงกับที่ตั้งใน Meta dashboard ตัวอักษรต่อตัวอักษร

**select pending:** `POST pending/:id/select` → โหลดแถว (`business_id` + `user_id` ตรง, ไม่หมดอายุ) → ข้อ 2–6 ของทางลัดด้วย token ของแถว → ลบแถว pending ทั้งชุดของผู้ใช้นั้น

**verify:** `GET /{accountId}?fields=id,name` ด้วย token · 200 → `active` + `last_verified_at` · error code 190 → `error` `token_invalid` · 10/200 → `error` `permission_missing`
**disconnect:** `withAdvisoryLock` → `status='inactive'`, `token_enc=NULL`, `generation+1` (ทั้ง facebook และ instagram ที่ใช้ Page เดียวกันเมื่อเลือกปุ่ม "ตัดทั้ง Page"; ปุ่มต่อช่องตัดเฉพาะช่องนั้น) → **ขั้นสุดท้าย** best effort `DELETE /{pageId}/subscribed_apps` ด้วย token เดิมที่ถอดรหัสก่อนล้าง (ล้ม = log ไม่ทำให้ล้มเหลว) · `audit('meta.disconnect')`
**ตัวทำความสะอาด:** schedule `meta.maintenance` ทุก 600 วินาที ลบ pending ที่หมดอายุ, `meta_events` > 14 วัน, `meta_actions` ที่หมดอายุ > 2 วัน

### 5.12 ที่ให้ F21 (`comments.ts`)

- webhook → job `meta.event` (kind `comment`) → สร้าง `MetaCommentEvent` (scope `live` เมื่อ `field==='live_comments'` หรือ `value.media.media_product_type === 'LIVE'`) → เรียก handler ที่ลงทะเบียนทุกตัว (ไม่มี handler = `ignored` `no_comment_handler`) · `text` ตัดที่ 2 000 · ไม่ผ่าน `saveMessage` ที่นี่ (F21 เป็นผู้ตัดสิน)
- **`sendPrivateReply`**: Facebook `POST /{pageId}/messages { recipient:{ comment_id }, message:{ text } }` · Instagram `POST /{igAccountId}/messages { recipient:{ comment_id }, message:{ text } }` · ตรวจ text: ไม่ว่าง, FB ≤ 2 000 อักขระ, IG ≤ 1 000 ไบต์ (เกิน → `failed` `text_too_long` retryable false) · 200 → `{ state:'sent', recipientId: response.recipient_id, messageId: response.message_id }` + insert `meta_private_reply_locks` · timeout/network → `unknown` retryable false · error ที่แปลว่าตอบ comment นี้ไปแล้ว (รายการ `ALREADY_REPLIED_SUBCODES` ใน `config.ts`: UNCONFIRMED §15; ข้อความมีคำว่า `already`) → `already_replied` (ถือเป็นสำเร็จทางฝั่ง F21) · code 10/100/200/551 → `failed` false (รวมเลย 7 วันหลัง comment) · 190 → `markConnectionError` + failed false · throttle/5xx → `failed` retryable true
- **`checkPrivateReply`**: Facebook `GET /{commentId}?fields=private_reply_conversation` → มีค่า = `sent` ไม่มี = `not_sent` · Instagram = `unverifiable` (ไม่มี API ตรวจ: UNCONFIRMED) · F21 reconcile ใช้ผลนี้ร่วมกับการลองส่งซ้ำที่ Meta จำกัดหนึ่งครั้งต่อ comment
- **`replyToComment`**: Facebook `POST /{commentId}/comments { message }` · Instagram `POST /{commentId}/replies { message }` · timeout → `unknown` (F21 ห้ามโพสต์ซ้ำเมื่อ unknown เว้นแต่ตรวจพบว่าไม่มี: ไม่มี API ตรวจ → ไม่ซ้ำเด็ดขาด)
- **`META_MODE=sandbox`:** `sendPrivateReply` / `replyToComment` ไม่เรียกเครือข่าย คืนสำเร็จปลอมที่ติดป้ายชัด (`recipientId = 'sandbox-' + sha256(commentId)[:16]`, `messageId`/`replyId = 'sandbox-' + uuid`) · `checkPrivateReply` คืน `not_sent` · ใช้เฉพาะกับ comment id ที่ขึ้นต้น `sim-` ที่ F21 สร้างจาก endpoint จำลอง (comment id อื่นในโหมด sandbox → `failed` `sandbox_unsupported`) · ผลคือ F21 เป็น S ได้โดยไม่ต้องมี Page จริง และห้ามติดป้ายเป็นของจริง
- **`getPrivateReplyLock(businessId, customerExternalId, channel)`**: มีแถวใน `meta_private_reply_locks` ที่ `recipient_id = customerExternalId` และ `locked_at` ใหม่กว่า `getCustomerLastInboundAt` ของลูกค้านั้น → `locked: true` · ใช้ใน sender ข้อ 3 และให้ F21 แสดงสถานะ

## 6. AI calls

**ไม่มี AI call** ใน F18 · ข้อความตอบมาจาก job `ai.reply` (B2) ผ่าน `sendToCustomer` · ข้อความระบบคงที่ในโค้ด · stretch ถอดเสียงขาเข้าเหมือน F17 §6 (ใช้ `model.transcribe` ของ core เท่านั้น ตัดสินโดย C2 หลัง F18 เป็น R)

## 7. UI

Route `/channels/meta` · `permission:'business.read'` · เมนู `{ path:'/channels/meta', labelKey:'meta:menu.title', group:'settings', icon:'ForumOutlined', order:21, permission:'business.read', searchTerms:['messenger','instagram','facebook','meta','เฟซบุ๊ก','อินสตาแกรม'] }` · หน้า `MetaChannelsPage.tsx` ใช้ UI kit ของ core:

1. `PageHeader` "Messenger และ Instagram" + ลิงก์ไป `/channels` (LINE)
2. Alert เมื่อ `!appConfigured` (บอกตัวแปรที่ขาดโดยไม่แสดงค่า) · Alert ข้อมูล: "Meta app อยู่ในโหมด development: เฉพาะบัญชีที่มี role ในแอป (Admin/Developer/Tester) ทักหาเพจได้" · Alert `sandbox` เมื่อ `mode='sandbox'` (ห้ามขึ้นเมื่อ real)
3. `SectionCard` Facebook Messenger และ `SectionCard` Instagram (แยกกัน): `StatusChip`, ชื่อเพจ/ `@username`, id, event ล่าสุด, จำนวน event, ปุ่ม "ตรวจสอบ", "ตัดการเชื่อมต่อ" (`ConfirmDialog`), Switch "ส่งหลัง 24 ชั่วโมงด้วย Human Agent" (เฉพาะ `business.channels`; มีข้อความอธิบายว่าต้องได้สิทธิ์จาก Meta)
4. `SectionCard` เชื่อมต่อ: ปุ่ม "เข้าสู่ระบบด้วย Facebook" (เปิด `oauth/start` ในหน้าเดิม) และ "วาง Page token" (`FormDialog` ช่อง password) · หลังได้ pending: รายการ Page (radio) + ปุ่ม "เชื่อมต่อ Page นี้" (`?pending=1` โหลดรายการอัตโนมัติ)
5. `SectionCard` ตั้งค่า webhook ใน Meta dashboard: `webhookUrl`, `verifyTokenHint`, `oauthRedirectUri`, ปุ่มคัดลอก, รายการขั้นตอน (ตาม §15 ขั้นตอน)
6. `DataTable` เหตุการณ์ล่าสุด
7. `useRealtime('custom', e => e.featureId==='F18' && reload())` · states: loading/empty (ยังไม่เชื่อมต่อ = `EmptyState` + ปุ่ม)/error + ลองใหม่ · `?error=` แสดง Alert ตามรหัส

i18n namespace `meta` (th / en):

| key | th | en |
|---|---|---|
| `menu.title` | Messenger / Instagram | Messenger / Instagram |
| `page.title` | Messenger และ Instagram | Messenger and Instagram |
| `page.subtitle` | เชื่อม Facebook Page และ Instagram ให้ลูกค้าคุยกับ AI และทีมงาน | Connect a Facebook Page and Instagram so customers can chat with the AI and your team |
| `notConfigured` | ยังตั้งค่าแอป Meta ไม่ครบ ขาด: {{missing}} | The Meta app is not fully configured. Missing: {{missing}} |
| `devMode` | แอป Meta อยู่ในโหมด development: เฉพาะบัญชีที่มี role ในแอปเท่านั้นที่ทักหาเพจได้ | The Meta app is in development mode: only accounts with a role in the app can message the Page |
| `sandbox.notice` | โหมดทดสอบ: ไม่ส่งข้อความจริงไป Meta | Sandbox mode: messages are not sent to Meta |
| `facebook.title` | Facebook Messenger | Facebook Messenger |
| `instagram.title` | Instagram | Instagram |
| `status.active` | เชื่อมต่อแล้ว | Connected |
| `status.error` | ต้องแก้ไข | Needs attention |
| `status.none` | ยังไม่เชื่อมต่อ | Not connected |
| `status.reason.token_invalid` | Token ใช้ไม่ได้ กรุณาเชื่อมต่อใหม่ | The token is no longer valid. Reconnect |
| `status.reason.permission_missing` | ขาดสิทธิ์ที่จำเป็น กรุณาเชื่อมต่อใหม่และอนุญาตทุกสิทธิ์ | Missing permissions. Reconnect and allow all permissions |
| `info.account` | บัญชี | Account |
| `info.lastEvent` | รับข้อความล่าสุด | Last event received |
| `info.eventsTotal` | จำนวนเหตุการณ์ที่รับ | Events received |
| `info.never` | ยังไม่เคยรับ | Never |
| `actions.verify` | ตรวจสอบ | Check |
| `actions.disconnect` | ตัดการเชื่อมต่อ | Disconnect |
| `actions.loginFacebook` | เข้าสู่ระบบด้วย Facebook | Log in with Facebook |
| `actions.pasteToken` | วาง Page token | Paste a Page token |
| `actions.copy` | คัดลอก | Copy |
| `actions.selectPage` | เชื่อมต่อ Page นี้ | Connect this Page |
| `token.title` | วาง Page access token | Paste a Page access token |
| `token.field` | Access token | Access token |
| `token.help` | ใช้ long-lived Page token หรือ user token ของผู้ที่มี role ในแอป ระบบไม่เก็บ token แบบข้อความเปล่า | Use a long-lived Page token or a user token of someone with a role in the app. Tokens are stored encrypted |
| `pending.title` | เลือก Page ที่จะเชื่อมต่อ | Choose a Page to connect |
| `pending.withIg` | มี Instagram: @{{username}} | Instagram: @{{username}} |
| `pending.expired` | รายการหมดอายุแล้ว กรุณาเข้าสู่ระบบใหม่ | The list expired. Please log in again |
| `connected.ok` | เชื่อมต่อแล้ว | Connected |
| `err.channel_in_use` | บัญชีนี้ถูกใช้กับร้านอื่นอยู่ | This account is already used by another shop |
| `err.not_test_account` | ไม่ใช่เพจ/บัญชีทดสอบของทีม | This is not the team's test Page/account |
| `err.permission_missing` | ขาดสิทธิ์: ต้องอนุญาตการจัดการข้อความและ webhook ของเพจ | Missing permission: allow Page messaging and webhook management |
| `err.provider` | ติดต่อ Meta ไม่ได้ ลองใหม่อีกครั้ง | Could not reach Meta. Try again |
| `err.access_denied` | คุณไม่ได้อนุญาตสิทธิ์ | You did not grant the permissions |
| `humanAgent.label` | ส่งหลัง 24 ชั่วโมงด้วย Human Agent | Send after 24 hours with Human Agent |
| `humanAgent.help` | ใช้ได้เมื่อ Meta อนุมัติสิทธิ์ Human Agent ให้แอป และเฉพาะข้อความจากพนักงาน ภายใน 7 วัน | Only when Meta has granted the app Human Agent access; staff messages only, within 7 days |
| `disconnect.title` | ตัดการเชื่อมต่อ? | Disconnect? |
| `disconnect.message` | ข้อความที่รอส่งจะไม่ถูกส่ง และลูกค้าจะทักผ่านช่องนี้ไม่ได้จนกว่าจะเชื่อมใหม่ | Pending messages will not be sent and customers cannot reach you here until you reconnect |
| `webhook.title` | ตั้งค่า Webhook ใน Meta dashboard | Webhook setup in the Meta dashboard |
| `webhook.url` | Callback URL | Callback URL |
| `webhook.verifyToken` | Verify token (ขึ้นต้น {{hint}}) | Verify token (starts with {{hint}}) |
| `webhook.redirect` | Valid OAuth Redirect URI | Valid OAuth Redirect URI |
| `webhook.step1` | Meta for Developers → แอปของทีม → Webhooks → เลือกวัตถุ Page → Edit subscription วาง Callback URL และ Verify token → Verify and save | Meta for Developers → your app → Webhooks → object Page → Edit subscription, paste the Callback URL and Verify token → Verify and save |
| `webhook.step2` | สมัครรับ fields: messages, messaging_postbacks, feed | Subscribe to fields: messages, messaging_postbacks, feed |
| `webhook.step3` | ทำซ้ำกับวัตถุ Instagram: messages, messaging_postbacks, comments | Repeat for object Instagram: messages, messaging_postbacks, comments |
| `webhook.step4` | App roles → เพิ่มบัญชีทดสอบเป็น Tester แล้วให้รับคำเชิญ | App roles → add test accounts as Testers and accept the invitation |
| `webhook.step5` | Facebook Login → Valid OAuth Redirect URIs ใส่ URI ข้างบน | Facebook Login → Valid OAuth Redirect URIs: add the URI above |
| `events.title` | เหตุการณ์ล่าสุด | Recent events |
| `events.time` | เวลา | Time |
| `events.channel` | ช่องทาง | Channel |
| `events.type` | ชนิด | Type |
| `events.state` | สถานะ | State |
| `events.note` | หมายเหตุ | Note |
| `events.empty` | ยังไม่มีเหตุการณ์ | No events yet |
| `readOnly` | คุณดูได้อย่างเดียว ต้องมีสิทธิ์จัดการช่องทาง | View only. You need the channels permission to change this |
| `error.retry` | ลองใหม่ | Retry |

## 8. Jobs, schedules, events

| รายการ | ค่า |
|---|---|
| Job `meta.event` | payload `{ connectionId, kind: 'message'|'postback'|'comment', item, receivedAtMs }` · dedupKey `meta.event:<eventKey>` · lockKey `meta:<connectionId>:<senderId หรือ authorId>` · `maxAttempts: 5` · ล้มถาวร → placeholder `[ข้อความที่ระบบรับไม่สำเร็จ]` (เฉพาะ message) + notify เจ้าของ (dedupKey รายวัน) |
| Schedule `meta.maintenance` | `everySeconds: 600` (§5.11 ตัวทำความสะอาด) |
| Realtime | `publish(businessId, { type:'custom', featureId:'F18', name:'meta.connection.changed', data:{} })` |
| Audit | `meta.connect` · `meta.disconnect` · `meta.settings.update` · `meta.connection.error` (actor null) |
| notify | token ใช้ไม่ได้ · event ล้มถาวร (`type:'system'`, owners, dedupKey รายวัน) |
| `model_usage` | ไม่มี |

## 9. Seed และ fixtures

`seed.ts` (`dependsOn: ['core']`): **ไม่ seed connection** (ต้องผูกด้วยบัญชีทดสอบจริงเท่านั้น) · ไม่มี `runDemo`/`resetDemo`

Fixtures ใน test (สร้างด้วยโค้ด): `signMeta(appSecret, rawBody)` · `META_APP_SECRET`/`META_VERIFY_TOKEN` สุ่มต่อ test file · connection ทดสอบสร้างผ่าน `connect-token` ใน `META_MODE=sandbox` (Page `100000000000001`, IG `170000000000001`, ผูก `biz_demo_a`) · payload ตัวอย่าง: Messenger text, 3 รูป, สติกเกอร์, quick reply, postback (ข้อความ + `nl:a:`), echo, delivery/read, อื่น ๆ; Instagram text/รูป/ story_mention; FB comment add / reply ซ้อน; IG comment · `graph.ts` รับ fetch ฉีดได้ (ตรวจ URL/header/body และตอบ error code ต่าง ๆ) · mid และ id ใหม่ต่อ test

## 10. Tests

| ไฟล์ | case |
|---|---|
| `webhook.test.ts` | GET: token ถูก → 200 challenge · token ผิด/ไม่ได้ตั้ง → 403 · challenge มีอักขระแปลก → 403 · POST: ลายเซ็นถูก → 200 + job · ลายเซ็นผิด/ไม่มี/รูปไม่ใช่ `sha256=<hex>` → 401 และ **ไม่มีแถว/job** · body แก้ 1 byte → 401 · `object` แปลก → 200 ทิ้ง · account ไม่รู้จัก → 200 ไม่มี job · connection inactive → ไม่มี job · business ไม่ active → ไม่มี job · echo → ไม่มี job · delivery/read → ไม่มี job · `sender.id` = Page → ไม่มี job · เหตุการณ์ซ้ำ (mid เดิม) → job เดียว · 3 attachment → 3 eventKey `mid`, `mid:2`, `mid:3` · ลายเซ็นผิดเกิน 30 ครั้ง → 429 · body ใหญ่ → 413 · enqueue ล้ม → 500 |
| `events.test.ts` | text → `saveMessage` (`channel`, `externalId = mid`, `providerMeta.windowExpiresAt` = +24 ชม., `channelAccountId`) · quick reply ธรรมดา → text ตาม title · `nl:a:` → ไม่ใช่ข้อความ AI · image ดาวน์โหลดจากโฮสต์ allowlist → `storage.save` → ImagePart · host นอก allowlist/`http:`/IP literal/มี userinfo/redirect ไป host อื่น → ไม่ fetch ต่อ + placeholder (ตรวจว่า fetch ไม่ถูกเรียกกับ URL ต้องห้าม) · ไฟล์ใหญ่เกิน → placeholder · sticker/share/story_mention → `triggerAi:false` ไม่ดึง URL · location → text · typing indicator เรียกเมื่อ AI เปิด ไม่ takeover และล้มได้ไม่กระทบ · profile ล้ม → ชื่อ fallback · ล้มถาวร → placeholder + notify · IG เหมือนกัน (channel `instagram`) |
| `postback.test.ts` | payload เป็นข้อความ → ข้อความลูกค้า · `GET_STARTED` → ใช้ title/ข้าม · `nl:a:` confirm → `createOrderFromProposal` stage confirm (reviewToken ถอดรหัส, `clientRequestId 'meta-action:<id>'`) · กดซ้ำ → replayed · booking · หมดอายุ · ผู้กดไม่ใช่เจ้าของ → ไม่เรียก · ผลลัพธ์ error ครบตามตาราง F17 §5.7 |
| `sender.test.ts` | ภายใน 24 ชม. → `messaging_type:'RESPONSE'` (FB) · อายุ 23 ชม. 59 นาที → ไม่ส่ง (margin 2 นาที) → `window_closed` · 25 ชม. + author ai → `window_closed` ไม่เรียก Graph · 25 ชม. + staff + `human_agent_enabled=false` → `window_closed` · 25 ชม. + staff + enabled → `tag:'HUMAN_AGENT'` · 8 วัน + staff + enabled → `window_closed` · ไม่มี inbound ของลูกค้า → `window_closed` · ใช้ `getCustomerLastInboundAt` (ลูกค้ามีแชตเก่าที่ทักล่าสุดใหม่กว่า → ส่งได้) · `Authorization: Bearer` + `appsecret_proof` ถูกต้อง ไม่มี token ใน query · `META_GRAPH_VERSION` ว่าง → `failed` · connection ถูกเพิกถอน → `CHANNEL_NOT_CONNECTED` ไม่เรียก Graph · error code 10/100/200/551 → failed ไม่ retry · 190 → connection `error` + notify · 4/17/32/613/1/2/5xx/429 → retryable · timeout → `unknown` ไม่ส่งต่อ · retry หลังข้อความที่ 2 ล้ม → ข้อความ 1 ไม่ส่งซ้ำ · text 5 000 ตัวอักษร → แตกก้อนตาม limit · IG ภาษาไทยยาว → ก้อน ≤ 950 ไบต์ · private-reply ล็อก → `awaiting_customer_reply` และปลดล็อกเมื่อลูกค้าตอบ · string error ไม่มี token |
| `outbound.test.ts` | product_card 3 ใบ → generic template (`image_aspect_ratio:'square'`, title/subtitle ตัด 80, ปุ่ม `สนใจ` payload เป็นข้อความ, ไม่มีปุ่มเมื่อ soldOut) · 12 ใบ → 2 template · order_review → text สรุป + button template 2 ปุ่ม + `meta_actions` 2 แถว token เข้ารหัส · action_buttons: ปุ่ม link http ถูกข้าม · 4 ปุ่ม → 3 ปุ่ม + ต่อท้ายเป็นข้อความ · ปุ่ม postback ล้วน → quick replies ≤ 13 title ≤ 20 · image → URL เซ็น https · template error code 100 → fallback altText ครั้งเดียว · `too_many_parts` |
| `connection.test.ts` | connect-token (sandbox) → facebook + instagram ถูกสร้าง · token เข้ารหัส (`enc:v1:`) และไม่หลุดใน JSON/audit · real mode (fetch ปลอม): page token → subscribe เรียกด้วย fields ที่กำหนด · user token → pending (token เข้ารหัส, หมดอายุ 15 นาที) → select → connected → pending ถูกลบ · pending หมดอายุ → 404 · pending ของผู้ใช้อื่น → 404 · `META_TEST_PAGE_ID` ไม่ตรง → `not_test_account` · บัญชีถือโดย business อื่น → `channel_in_use` · disconnect → token NULL, เรียก unsubscribe หลังล้าง DB, webhook ใหม่ไม่ประมวลผล · verify 190 → `error` · staff ไม่มี `business.channels` → 403 · ร้าน B อ่านของ A ไม่ได้ · OAuth: state ปลอม/หมดอายุ/ผู้ใช้ไม่ตรง → ปฏิเสธ ไม่ exchange · `redirect_uri` ตรง `oauthRedirectUri` |
| `comments.test.ts` | FB comment add → handler ได้ `MetaCommentEvent` (scope post) · IG live_comments → scope live · ตอบซ้อน/ของ Page เอง → ไม่เรียก handler · ไม่มี handler → `ignored` · `sendPrivateReply` FB/IG: URL/body ถูก (`recipient.comment_id`) · 200 → `sent` + `recipientId` + แถวล็อก · timeout → `unknown` · error ตอบไปแล้ว → `already_replied` · text เกิน limit → `text_too_long` · `checkPrivateReply` FB พบ/ไม่พบ, IG `unverifiable` · `replyToComment` FB `/comments` IG `/replies` · `getPrivateReplyLock` |

Playwright smoke `web/src/features/meta/e2e/meta.smoke.spec.ts` (production-safe):
1. `ownerPage` เปิด `/channels/meta` → เห็นการ์ด Facebook และ Instagram, Callback URL ลงท้าย `/webhooks/meta` และสถานะตามจริง (เชื่อมต่อแล้ว หรือ ยังไม่เชื่อมต่อ)
2. ด้วย fixture `api` (ไม่ login): `GET /webhooks/meta?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=x` → **403** · `POST /webhooks/meta` ไม่มีลายเซ็น → **401**
3. ถ้ามี connection จริงอยู่ (ตรวจจาก `GET channels/meta`): กด "ตรวจสอบ" ของช่องที่เชื่อมอยู่ → สำเร็จ (เรียก Graph จริง) · ไม่มี connection → ข้ามข้อนี้ด้วย `test.skip` พร้อมเหตุผล (และ **สถานะ R ไม่ได้จากข้อนี้**)
4. หลักฐาน R ต่อช่องทำด้วยมือ (§11) จดใน `EVIDENCE.md`

## 11. Acceptance: R ตาม D6 (แยกต่อช่อง)

- [ ] webhook: GET handshake ถูกต้อง · ลายเซ็นผิดถูกปฏิเสธ · event ซ้ำไม่สร้างข้อความซ้ำ · echo ถูกเมิน · ข้อความ 3 รูปได้ 3 inbound ที่ id คงที่ · account/connection ไม่รู้จักหรือ business ไม่ active ไม่สร้างข้อความ
- [ ] **Messenger R:** test user (role ในแอป) ทัก Page จริง → ข้อความเข้า inbox → AI ตอบกลับถึง Messenger จริง · การ์ดสินค้า/ปุ่มยืนยันทำงานจริง (ปุ่มยืนยันเมื่อ F13 merge) · จดเวลา/sha/บัญชีแบบย่อใน `EVIDENCE.md`
- [ ] **Instagram R:** test user ทัก IG professional account ที่ผูกกับ Page → ข้อความเข้า → AI ตอบกลับถึง IG DM จริง
- [ ] กรอบ 24 ชม.: ส่งหลังเกิน (จำลองโดยปรับเวลาใน test หรือรอจริง/ใช้บัญชีที่เงียบเกิน 24 ชม.) ถูกบล็อกพร้อมเหตุผลที่ staff เห็นใน inbox (`delivery.error`) · ไม่มีสถานะ "ส่งแล้ว" ปลอม
- [ ] connection ที่ถูกเพิกถอน → `CHANNEL_NOT_CONNECTED` · token เข้ารหัส ไม่ออก API/log/audit
- [ ] webhook ของ Meta app ชี้ **Render** แล้ว (ขั้นตอนสลับท้ายไฟล์) และโพสต์ `DONE F18 …` ระบุการสลับ
- [ ] UI ครบ loading/empty/error, i18n th/en, permission + tenant, audit connect/disconnect/settings · Playwright smoke ผ่านบน production
- **S:** webhook + sender ทำงานกับ fixture/`META_MODE=sandbox` · **A:** มีแต่ replay payload · **R แยกช่อง:** ช่องที่ไม่มี test user ได้ยืนยัน = รายงานเป็น S/A ตามจริง ห้ามรวมเป็น R · ไม่ถึง R ตอน 15:30 → ซ่อน `/channels/meta`

## 12. Security และ privacy

- **ลายเซ็น:** `X-Hub-Signature-256` ด้วย `META_APP_SECRET` ก่อน parse ใด ๆ, `timingSafeEqual` · GET verify token เทียบแบบ constant-time · ไม่ log header/body
- **Tenant:** business จากแถว `meta_connections` ที่หาจาก `object` + `entry.id` เท่านั้น (ไม่เคยจาก payload ที่ผู้ใช้ควบคุม เช่น ข้อความหรือ `recipient.id`) · connection ที่ไม่ active หรือ business ไม่ active = เพิกเฉย · ทุก query มี `business_id` · `meta_actions` ผูก business + เจ้าของ conversation
- **Replay:** `meta_events` PK + jobs dedupKey + `saveMessage.externalId` + `EVENT_MAX_AGE_MS`
- **Token:** `encryptSecret` ทุกแห่ง (`token_enc`, `meta_pending_pages.token_enc`, `review_token_enc`) · ส่งไป Graph ทาง header `Authorization` (ไม่ใส่ใน URL/log) + `appsecret_proof` · ไม่อยู่ใน job payload (เก็บ `connectionId`) · logger redact `authorization`, `x-hub-signature-256`, `access_token`, `client_secret`
- **OAuth:** `state` ลงลายเซ็น (HMAC `SESSION_SECRET`) มีอายุ ผูก `userId` และ business · `redirect_uri` คงที่จาก `PUBLIC_BASE_URL` (ไม่รับจาก client) · token ที่แลกได้ไม่ออกไปถึง browser
- **SSRF:** ดาวน์โหลดสื่อเฉพาะ https + allowlist hostname + ไม่ใช่ IP + redirect ตรวจซ้ำ + ขีดจำกัดขนาด/เวลา · URL ที่ลูกค้าแชร์ (`fallback`, `share`) ไม่ถูกดึง · URL สื่อขาออกเป็นของเรา (เซ็นด้วย `SESSION_SECRET`)
- **Rate limit:** `assertRateLimit` ที่ webhook GET/POST และกรณีลายเซ็นผิด · media route ของ F17
- **สิทธิ์ผู้ใช้:** เชื่อม/ตัด/ตั้งค่า = `business.channels` · อ่านสถานะ = `business.read` · callback OAuth ตรวจสิทธิ์ซ้ำด้วย `requireBusiness`
- **PII:** log ใช้ `connectionId`, `eventKey`, ชนิด event เท่านั้น · ไม่ log ข้อความ/PSID/ชื่อ · `meta_events` ไม่เก็บเนื้อหา
- **บัญชีทดสอบเท่านั้น:** Meta app ของทีมในโหมด development, Page/IG ทดสอบ · ห้ามส่งหาคนนอก role · `META_TEST_PAGE_ID` เป็นตัวกันเชื่อมผิดเพจ

## 13. Edge cases

| กรณี | ผลที่ต้องได้ |
|---|---|
| Meta ส่ง webhook ซ้ำ | ข้อความเดียว (dedup สามชั้น) |
| 3 รูปในข้อความเดียว | 3 inbound: `mid`, `mid:2`, `mid:3` · text ไปกับรูปแรก |
| ข้อความที่ Page ส่งเอง (echo) | เมิน ไม่มีข้อความซ้ำ |
| ลูกค้าไม่ทักเกิน 24 ชม. แล้ว AI/ระบบจะตอบ (เช่น F38/F23) | ถูกบล็อกพร้อมเหตุผล ไม่ส่ง ไม่ retry |
| staff ตอบหลัง 24 ชม. ไม่มีสิทธิ์ Human Agent | บล็อกพร้อมเหตุผล (inbox แสดง error) |
| ส่งการ์ดสินค้าแล้ว Meta ปฏิเสธรูป (URL ไม่ถึง) | code 100 → ส่ง `altText` แทนหนึ่งครั้ง |
| `PUBLIC_BASE_URL` เป็น http | รูป/ไฟล์ล้มด้วย `public_url_not_https`; text ส่งได้ |
| token หมดอายุ/ผู้ใช้เปลี่ยนรหัสผ่าน | code 190 → connection `error` + notify, ส่งไม่ได้จนเชื่อมใหม่ |
| Page เชื่อมกับ business อื่นอยู่ | `channel_in_use` |
| ไม่มี IG ผูกกับ Page | เชื่อมเฉพาะ Facebook; การ์ด Instagram แสดง "ยังไม่เชื่อมต่อ" พร้อมคำอธิบายให้ผูก IG กับ Page |
| user token ที่เห็น Page หลายเพจ | pending list ให้เลือก (หมดอายุ 15 นาที) |
| webhook มาก่อน connection ผูกเสร็จ | entry ไม่รู้จัก → 200 ทิ้ง (Meta ไม่ retry) |
| แอปอยู่โหมด development แต่ผู้ทักไม่มี role | Meta ไม่ส่ง webhook มา (ไม่ใช่บั๊ก): UI บอกในข้อความ `devMode` |
| comment ซ้อน (ตอบ comment) หรือ comment ของ Page เอง | ไม่ส่งให้ F21 |
| private reply แล้วลูกค้ายังไม่ตอบ staff พิมพ์ในแชตนั้น | บล็อก `awaiting_customer_reply` ปลดเมื่อมีข้อความเข้าใหม่ |
| Instagram text ภาษาไทยยาว | แตกก้อนตามไบต์ ไม่ตัดกลางอักขระ |

## 14. Build order (slices ≤ 45 นาที)

| Slice | เวลา | ส่งมอบ |
|---|---|---|
| **M1 หลัก: webhook + text ทั้งสองช่อง + sender** | 45 | migration · `graph.ts` · `connection.ts` ทาง `connect-token` (page token / user token → pending → select) + verify/disconnect · `webhook.ts` GET/POST · job `meta.event` สำหรับ text/quick reply/postback ข้อความ/echo/dedup · profile + typing · `sender.ts` ส่ง **text** + กรอบ 24 ชม. + แปลง error · `registerChannelSender` ทั้งสอง · routes ยกเว้น OAuth · tests webhook/events/sender/connection · **เมื่อ merge: ตั้ง webhook ของ Meta app ชี้ tunnel แล้วทดสอบกับ test user ทั้งสอง** |
| **M2 สื่อและการ์ด** | 40 | `media.ts` (allowlist) + attachments ขาเข้า · `outbound.ts` (รูป, ไฟล์, generic template, button template, quick replies) · `actions.ts` (`nl:a:`) · F17 `signedMediaUrl` · tests media/outbound/postback |
| **M3 UI + OAuth + ให้ F21 + สลับ webhook** | 40 | หน้า `/channels/meta` + i18n · `oauth.ts` · `comments.ts` (`registerCommentHandler`, `sendPrivateReply`, `checkPrivateReply`, `replyToComment`, `getPrivateReplyLock`) + tests · Playwright smoke · `EVIDENCE.md` · **สลับ webhook จาก tunnel ไป Render + โพสต์ `DONE F18 …`** (ขั้นตอนท้ายไฟล์) |

ลำดับ: M3 ส่วน `comments.ts` คือสิ่งที่ F21 รอ (ถ้า F21 ยังไม่เปิด tier ก็ merge ไว้เฉยได้) · ทำ OAuth ท้ายสุด ถ้าเวลาไม่พอใช้ "วาง Page token" ต่อไป (สถานะ R ไม่ขึ้นกับ OAuth)

## 15. UNCONFIRMED และสิ่งที่ต้องตรวจในวันงาน

ผู้เขียน spec เข้าถึงเอกสาร Meta แบบสดไม่ได้ ทุกข้อด้านล่างมาจากความรู้เดิม/know-how ต้องตรวจก่อนหรือระหว่าง M1:

1. **`META_GRAPH_VERSION`:** ไม่ hard-code ในโค้ด · วิธีอ่านค่า: Meta for Developers → แอป → Settings → Advanced → ส่วน "Upgrade API version" (แสดงเวอร์ชัน default และเวอร์ชันล่าสุดที่ใช้ได้) หรือ Graph API Explorer ช่อง version · ใส่ค่ารูป `vNN.0` ใน `.env.local` และ Render env แล้วบันทึกลง `EVIDENCE.md`
2. **รูปร่าง payload:** `object: 'page' | 'instagram'`, `entry[].messaging[]` (`sender.id`, `recipient.id`, `timestamp`, `message.mid/text/attachments/quick_reply/is_echo`, `postback.payload/title`), `entry[].changes[]` (FB `feed` + `value.item/verb/comment_id/post_id/parent_id/from/message`; IG `comments`/`live_comments` + `value.id/text/from/media/parent_id`) — ตรวจจาก "Test" ปุ่ม Send to my server ในหน้า Webhooks ของ dashboard และ log จริงครั้งแรก (ตรวจ `eventKey` ของ IG: `message.mid`)
3. **Endpoint ส่ง:** `POST /{page-id}/messages` (FB) และ `POST /{ig-account-id}/messages` (IG) ด้วย Page token; typing `sender_action:'typing_on'` ใช้ได้กับ IG หรือไม่; IG ใช้ `messaging_type`/`tag` เหมือน FB หรือไม่
4. **limit ข้อความ:** FB text 2 000 อักขระ, IG text 1 000 ไบต์ (ค่าจาก know-how); button template text ≤ 640; generic template ≤ 10 elements, title/subtitle ≤ 80, ปุ่ม ≤ 3, title ปุ่ม ≤ 20; quick replies ≤ 13 และ title ≤ 20; IG รองรับ generic/button template ตามนี้หรือไม่
5. **โฮสต์ของ attachment:** รายการ suffix `.fbcdn.net`, `.fbsbx.com`, `.cdninstagram.com` ครบหรือไม่ — ตรวจจาก URL จริงในข้อความทดสอบ (log เฉพาะ hostname); ถ้าไม่ตรง เพิ่ม suffix ที่ Meta เป็นเจ้าของจริงเท่านั้น (ห้ามเปิดกว้าง)
6. **Human Agent tag:** ต้องมีสิทธิ์ Human Agent สำหรับแอป: ทดลองในโหมด development กับบัญชีทดสอบว่าส่งได้ไหม; ไม่ได้ก็คงปิด `human_agent_enabled`
7. **รหัส error:** 10, 100, 200, 551, 190, 4, 17, 32, 613, 1, 2 ตามความหมายใน §5.8 · subcode ของ "นอกกรอบ 24 ชม." และ **"ตอบ comment นี้ไปแล้ว"** (ใส่ใน `ALREADY_REPLIED_SUBCODES` เมื่อพบ) — ทดสอบจริงด้วย comment ของ test user: ส่ง private reply ซ้ำและดูผล
8. **Private reply ต้องใช้ comment_id ภายใน 7 วัน, หนึ่งข้อความต่อ comment** และ response ให้ `recipient_id` (ใช้เป็น `customers.external_id` ของแชต) — ตรวจว่า `recipient_id` ตรงกับ `sender.id` ที่ลูกค้าส่งตอบกลับมา (ถ้าไม่ตรง ลูกค้าสองแถว: แจ้ง A1)
9. **Instagram ผ่าน Facebook Login (Page-linked):** IG ต้องเป็น Professional account ผูกกับ Page และเปิด "Allow access to messages" ในแอป Instagram (Settings → Messages and story replies → Message controls/Connected tools: ชื่อเมนูอาจต่างตามเวอร์ชันแอป) · ถ้า dashboard บังคับ "Instagram API with Instagram Login" และให้ app secret แยก ต้องเพิ่มการตรวจลายเซ็นด้วย secret ที่สอง (ต้องขอ env ใหม่จาก C1: `META_IG_APP_SECRET`) — ตรวจว่า `X-Hub-Signature-256` ของ webhook IG ผ่านด้วย `META_APP_SECRET` ตั้งแต่ข้อความแรก
10. **Scopes OAuth** ชื่อตาม §5.11 ถูกต้องหรือไม่ และในโหมด development ผู้มี role ให้สิทธิ์ครบโดยไม่ต้อง review · Valid OAuth Redirect URI ต้องใส่ทั้ง `https://<render>/api/v1/channels/meta/oauth/callback` และของ tunnel
11. **Page token จาก long-lived user token ไม่หมดอายุ:** ตรวจด้วย `GET /debug_token?input_token=…` (ใช้ app token) ครั้งหนึ่ง ถ้ามีวันหมดอายุให้เพิ่มฟิลด์ `token_expires_at` ในการแจ้งเตือน (ยังไม่ทำ)
12. **`subscribed_apps` fields:** ชื่อ `messages`, `messaging_postbacks`, `feed` สำหรับ Page และ `messages`, `messaging_postbacks`, `comments`, `live_comments` สำหรับวัตถุ Instagram ในระดับแอป · ตรวจผ่านปุ่ม "Test" ใน dashboard
13. **สถานะ `businesses.status`** ตาม base schema (`active|suspended|deleted`): ตรวจกับ C3 ว่า soft delete (F03) ใช้ค่านี้
14. **`SESSION_SECRET`** ใช้เซ็น state/URL: มีใน Render env แล้ว (ตรวจ)
15. **A1 inbox แสดง `delivery.error`** ของข้อความ failed ให้ staff เห็นเหตุผล window_closed/awaiting_customer_reply: ตรวจกับ A1 (ถ้าไม่ แจ้ง `FIX TO:A1`)

### ขั้นตอนบน Meta for Developers (ตั้งค่าครั้งเดียว + สลับ webhook)

**เตรียมแอป (C ทำก่อนเริ่ม M1):** สร้าง/ใช้แอปของทีม (ประเภทตามตัวเลือกที่ dashboard เสนอสำหรับ Business/Messenger) อยู่โหมด **Development** · เพิ่มผลิตภัณฑ์/use case Messenger + Instagram + Facebook Login · คัดลอก App ID, App Secret ลง `.env.local` (`META_APP_ID`, `META_APP_SECRET` — ห้ามแปะในแชต/บอร์ด) · ตั้ง `META_VERIFY_TOKEN` เป็นสตริงสุ่มยาว ≥ 24 ตัวและ `META_GRAPH_VERSION` ตามข้อ 1 · เพิ่มบัญชีทดสอบที่ **App roles → Roles** (Tester/Developer) และให้รับคำเชิญ · Page ทดสอบ + IG professional account ที่ผูกกับ Page · ตั้ง `META_TEST_PAGE_ID`, `META_TEST_IG_ACCOUNT_ID`

**ตั้ง webhook (ชี้ tunnel ระหว่างทำ M1–M2):**
1. รัน `npm run dev` (API พอร์ต 3002) และ tunnel ที่ terminal อื่น (เช่น `cloudflared tunnel --url http://localhost:3002`) แล้วตั้ง `PUBLIC_BASE_URL=<tunnel URL>` ใน `.env.local` และรีสตาร์ท dev server
2. App Dashboard → **Webhooks** → วัตถุ **Page** → Edit subscription → Callback URL = `<tunnel URL>/webhooks/meta`, Verify token = ค่า `META_VERIFY_TOKEN` → **Verify and save** (เซิร์ฟเวอร์ต้องกำลังรันและตอบ challenge) → สมัคร fields `messages`, `messaging_postbacks`, `feed`
3. ทำซ้ำสำหรับวัตถุ **Instagram**: fields `messages`, `messaging_postbacks`, `comments` (และ `live_comments` ถ้ามี)
4. หน้า `/channels/meta` → เชื่อมต่อ (วาง Page token หรือ Facebook Login) → ตรวจว่า `subscribed_fields` ถูกบันทึก · test user ทักเพจ/IG → เห็นเหตุการณ์ในตาราง

**สลับไป Render (ทำเมื่อ F18 merge + deploy แล้ว และ smoke ผ่าน):**
1. ตั้ง env บน Render: `META_MODE=real`, `META_APP_ID`, `META_APP_SECRET`, `META_VERIFY_TOKEN` (ค่าเดียวกับที่ใช้บน dev), `META_GRAPH_VERSION`, `META_TEST_PAGE_ID`, `META_TEST_IG_ACCOUNT_ID`, `PUBLIC_BASE_URL` (https ของ Render) → redeploy
2. Dashboard → Webhooks → Page → Edit subscription → Callback URL = `https://<render>/webhooks/meta` → Verify and save · ทำซ้ำกับวัตถุ Instagram · Facebook Login → Valid OAuth Redirect URIs เพิ่ม `https://<render>/api/v1/channels/meta/oauth/callback`
3. เข้า `/channels/meta` บน production → เชื่อม Page/IG ทดสอบอีกครั้ง (token ของ DB dev ไม่ย้ายมา production) → test user ทัก Page และ IG → เห็นข้อความใน inbox ร้านเดโมและ AI ตอบ → จดหลักฐานใน `EVIDENCE.md`
4. โพสต์ `DONE F18 meta merged <sha>. Meta webhook switched tunnel -> Render <วันเวลา>. Messenger <R|S> · Instagram <R|S> TO:B2 TO:A1 TO:C1` (ไม่ใส่ URL ของ tunnel/token) · หลังสลับ **ห้ามชี้กลับ tunnel** (จะแย่งกับเดโม) ถ้าต้อง debug ให้ใช้ dev app แยกหรือบอกคนก่อน
