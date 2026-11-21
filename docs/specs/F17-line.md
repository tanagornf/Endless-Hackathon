# F17 line — ช่องทาง LINE (LINE Messaging API)

| | |
|---|---|
| Lane / คน | **C2** / **C** · ลำดับ 1 ใน lane (F17 → F18 → F21) |
| Tier / เป้า | **P0** (golden path) · เป้า **R**: ข้อความจริงเข้า-ออกกับ OA ทดสอบของทีม (*NLess Demo* บน production) ภายใน **14:30** |
| Timebox | 45–120 นาที |
| เริ่มเมื่อ | `SETUP READY` (P0) |
| พึ่ง | F09 `saveMessage`, `getConversation` · F11 `isHumanTakeover` · F04 `getBusinessSettings` · F13 `createOrderFromProposal` (stage `confirm`) · F15 `createBooking` (stage `confirm`) · F31 `notify` · core (`db`, `jobs`, `sendToCustomer`/`registerChannelSender`, `storage`, `rateLimit`/`assertRateLimit`, `encryptSecret`/`decryptSecret`, `audit`, `publish`) |
| ให้ | `registerChannelSender('line', …)` (แทน sandbox capture ของ core) · `service.ts` ภายใน lane: `signedMediaUrl()` + route สื่อสาธารณะ (F18 ใช้ต่อ) · ไม่มี contract ใหม่ข้าม lane |
| ใช้ | ดู §4 |
| โฟลเดอร์ | `server/src/features/line/` · `web/src/features/line/` · `shared/features/line/` |
| Web path | `/channels` (เมนูกลุ่ม `settings`) |

อ่าน: `contracts.ts` (`saveMessage`/`SaveMessageInput.providerMeta`, `ChannelSender`/`OutboundDelivery`/`DeliveryResult`, `MessagePart`, `FeatureApi.webhook`, `createOrderFromProposal`, `createBooking`, `rateLimit`, `encryptSecret`) · [COOKBOOK](../COOKBOOK.md) §6, §8 · [F09 §5.7 และหัวข้อ postback](F09-inbox.md) · F12 (ปุ่ม `message` → postback) · [F01 §4](F01-core.md) (webhook raw body, `core.deliver`)

## 1. เป้าหมายและ user stories

ทำไมมี: LINE OA คือช่องทางหลักของ demo (กรรมการสแกน QR ของ *NLess Demo* แล้วคุยกับ AI) ฟีเจอร์นี้เชื่อม OA จริงเข้ากับ core loop: ข้อความเข้า → `saveMessage` → job `ai.reply` (B2) → `sendToCustomer` → sender ของเรา → ลูกค้าเห็นใน LINE · อยู่บน golden path 13:00 ต้อง merge ได้เร็วและไม่พังช่วง 12:30–13:00

ผู้ใช้: เจ้าของร้าน (เชื่อมต่อ/ตัดการเชื่อมต่อ OA, ดูสถานะ) · ลูกค้า LINE (คุย, กดปุ่มยืนยันออเดอร์/นัดหมาย) · staff (เห็นข้อความใน inbox ของ F09)

User stories:
1. เจ้าของใส่ Channel ID + Channel secret (+ access token) แล้วเห็นสถานะ "เชื่อมต่อแล้ว" พร้อมชื่อ OA, URL ของ webhook ที่ต้องวางใน LINE Developers Console, QR/ลิงก์เพิ่มเพื่อน
2. ลูกค้าพิมพ์ข้อความ/ส่งรูป/สติกเกอร์ใน OA → เห็นใน inbox ภายในไม่กี่วินาที → AI ตอบกลับใน LINE (ใช้ reply ภายใน 50 วินาที ไม่งั้น Push)
3. AI ส่งการ์ดสินค้า/สรุปออเดอร์/สรุปนัดหมาย → ลูกค้าเห็นเป็น Flex message กดปุ่ม "ยืนยัน/ยกเลิก" ได้จริงใน LINE (ไม่ผ่านโมเดล)
4. webhook ซ้ำ/ส่งใหม่ (redelivery) ไม่ทำให้ข้อความหรือการตอบซ้ำ · ลายเซ็นผิดถูกปฏิเสธ
5. เจ้าของตัดการเชื่อมต่อ → ข้อความที่ค้างส่งไม่ออก, webhook ถูกเพิกเฉย
6. เจ้าของเห็นจำนวน Push ที่ใช้เดือนนี้ (Push กินโควตาของ OA) และแจ้งเตือนเมื่อโควตาเต็ม

นอกขอบเขต: ประวัติ LINE ย้อนหลัง/OA Manager crawl, กลุ่ม/ห้อง (รับเฉพาะแชต 1:1), rich menu (ข้อ "ถ้ามีเวลา" ท้าย §5.11), sticker pack ของร้าน, LINE Login/LIFF, การส่ง broadcast (F23 ส่งผ่าน `sendToCustomer`) · ถอดเสียง `model.transcribe` เป็น stretch (§6)

## 2. Data model

`server/src/features/line/migrations/001_line.sql` (ไม่แก้ตาราง core · อ่านตาราง core `businesses`, `files`, `messages`, `seed_aliases` แบบอ่านอย่างเดียวได้)

```sql
-- dependsOn: core
CREATE TABLE line_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  channel_id text NOT NULL CHECK (channel_id ~ '^[0-9]{5,20}$'),      -- Channel ID (ตัวเลข) = ค่าใน path ของ webhook
  bot_user_id text,                                                    -- "destination" ใน webhook (U + 32 hex) ได้จาก GET /v2/bot/info
  basic_id text,                                                       -- เช่น @123abcde (ใช้ทำลิงก์เพิ่มเพื่อน)
  display_name text NOT NULL DEFAULT '',
  channel_secret_enc text,                                             -- encryptSecret(...) · NULL เมื่อ inactive
  access_token_enc text,                                               -- encryptSecret(...) · NULL = ใช้ stateless token (§5.9)
  source text NOT NULL DEFAULT 'ui' CHECK (source IN ('ui','env')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','error','inactive')),
  status_reason text,                                                  -- 'token_rejected' | 'secret_mismatch' | 'disconnected' | ...
  generation int NOT NULL DEFAULT 1,                                   -- +1 เมื่อ credential/สถานะเปลี่ยน (ล้าง cache token)
  connected_by uuid REFERENCES users(id),
  connected_at timestamptz NOT NULL DEFAULT now(),
  disconnected_at timestamptz,
  last_verified_at timestamptz,
  last_event_at timestamptz,
  events_total bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- OA หนึ่งตัวถูกผูกกับ business เดียวที่ active; business หนึ่งมี LINE ที่ active/error ได้ตัวเดียว
CREATE UNIQUE INDEX line_connections_channel_live ON line_connections (channel_id) WHERE status IN ('active','error');
CREATE UNIQUE INDEX line_connections_business_live ON line_connections (business_id) WHERE status IN ('active','error');
CREATE INDEX line_connections_business ON line_connections (business_id);

-- ผู้ติดต่อ LINE ต่อ business: สถานะเพื่อน/บล็อก + แคชโปรไฟล์ + กันแจ้ง "ฟังเสียงไม่ได้" ซ้ำ
CREATE TABLE line_contacts (
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  line_user_id text NOT NULL,
  is_following boolean NOT NULL DEFAULT true,
  followed_at timestamptz,
  unfollowed_at timestamptz,
  display_name text,
  language text,
  profile_fetched_at timestamptz,
  audio_notice_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, line_user_id)
);

-- log event ที่รับ (dedup ชั้นที่สอง + หน้า "เหตุการณ์ล่าสุด") · เก็บ 14 วัน · ไม่เก็บข้อความลูกค้า
CREATE TABLE line_events (
  webhook_event_id text PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES line_connections(id) ON DELETE CASCADE,
  event_type text NOT NULL,                 -- message | follow | unfollow | postback | other
  message_type text,                        -- text | image | sticker | audio | video | file | location
  is_redelivery boolean NOT NULL DEFAULT false,
  state text NOT NULL DEFAULT 'received' CHECK (state IN ('received','done','ignored','failed')),
  note text,                                -- เหตุผลสั้น ๆ เช่น 'group_source', 'business_inactive' (ห้ามใส่ข้อความลูกค้า)
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX line_events_recent ON line_events (business_id, received_at DESC);

-- reply token ที่ใช้แล้ว (ใช้ได้ครั้งเดียว) เก็บเฉพาะ hash
CREATE TABLE line_reply_tokens_used (
  token_hash text PRIMARY KEY,
  used_at timestamptz NOT NULL DEFAULT now()
);

-- ปุ่ม postback ฝั่งเซิร์ฟเวอร์: data ที่ส่งไป LINE เป็นแค่ id สั้น ๆ ส่วน reviewToken เก็บที่นี่ (เข้ารหัส)
CREATE TABLE line_actions (
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
CREATE INDEX line_actions_expiry ON line_actions (expires_at);

-- batch ที่ส่งแล้วต่อข้อความ (กันส่งซ้ำเมื่อ core retry)
CREATE TABLE line_delivery_batches (
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  batch_index int NOT NULL,
  mode text NOT NULL CHECK (mode IN ('reply','push')),
  retry_key uuid NOT NULL,
  state text NOT NULL CHECK (state IN ('accepted','unknown')),
  sent_ids text[] NOT NULL DEFAULT '{}',
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, batch_index)
);

-- ใช้ Push เท่าไรต่อเดือน (เวลา Asia/Bangkok) เพื่อแสดงและเตือน · reply ไม่นับ
CREATE TABLE line_push_usage (
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  month date NOT NULL,                      -- วันที่ 1 ของเดือน
  push_calls int NOT NULL DEFAULT 0,
  push_messages int NOT NULL DEFAULT 0,
  quota_alerted_at timestamptz,             -- ครั้งล่าสุดที่ notify() ว่าโควตาเต็ม
  PRIMARY KEY (business_id, month)
);
```

กฎ: `channelId` ใน path ของ webhook ไม่ใช่ความลับ (แต่ signature ต้องผ่านเสมอ) · secret/token ไม่เคยออกไปถึง browser, log หรือ audit · `line_events.note` ห้ามมีข้อความลูกค้า

## 3. API endpoints

ทุก path ใต้ `/api/v1` ยกเว้น webhook (`/webhooks/line/:channelId` ตาม `api.webhook`) · `defineFeatureRoutes({ featureId: 'F17', slug: 'line' })`

| Method | Path | auth | permission | Request | Response | Errors |
|---|---|---|---|---|---|---|
| POST | `/webhooks/line/:channelId` | none (signature) | — | raw body | `{}` | 401 ลายเซ็นผิด/ไม่มี · 429 · 500 (enqueue ล้มเหลวเท่านั้น) |
| GET | `/businesses/:businessId/channels/line` | business | `business.read` | — | `LineConnectionView` | — |
| POST | `/businesses/:businessId/channels/line/connect` | business | `business.channels` | `ConnectBody` | `LineConnectionView` | VALIDATION_ERROR, POLICY_BLOCKED (`details.reason`: `channel_in_use` · `credentials_rejected` · `secret_mismatch`), PROVIDER_UNAVAILABLE |
| POST | `/businesses/:businessId/channels/line/verify` | business | `business.channels` | — | `LineConnectionView` | CHANNEL_NOT_CONNECTED, PROVIDER_UNAVAILABLE |
| DELETE | `/businesses/:businessId/channels/line` | business | `business.channels` | — | no_content | CHANNEL_NOT_CONNECTED |
| GET | `/businesses/:businessId/channels/line/events` | business | `business.channels` | `EventsQuery` | `{ items: LineEventRow[] }` | — |
| GET | `/channel-media/:fileId` | none (signed URL) | — | query `exp`, `v`, `sig` | `HttpResponse file` | NOT_FOUND (ทุกกรณีไม่ผ่าน), RATE_LIMITED |

```ts
import { z } from 'zod';
export const ConnectBody = z.object({
  channelId: z.string().regex(/^[0-9]{5,20}$/),
  channelSecret: z.string().regex(/^[0-9a-f]{32}$/i),          // LINE channel secret = 32 hex
  accessToken: z.string().min(40).max(400).optional(),         // long-lived token จาก Console; ไม่ใส่ = ใช้ stateless (§5.9)
}).strict();
export const EventsQuery = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) });
```

```ts
// shared/features/line/types.ts
export interface LineConnectionView {
  connected: boolean;
  status: 'active' | 'error' | 'inactive' | 'none';
  statusReason: string | null;
  mode: 'real' | 'sandbox';                       // LINE_MODE ของเซิร์ฟเวอร์
  channelId: string | null;
  displayName: string | null;
  basicId: string | null;
  addFriendUrl: string | null;                    // https://line.me/R/ti/p/%40xxxx
  addFriendQrDataUrl: string | null;              // data:image/png;base64 สร้างด้วยไลบรารี qrcode ฝั่ง server
  webhookUrl: string | null;                      // `${PUBLIC_BASE_URL}/webhooks/line/${channelId}`
  hasAccessToken: boolean;
  source: 'ui' | 'env' | null;
  connectedAt: string | null;
  lastVerifiedAt: string | null;
  lastEventAt: string | null;
  eventsTotal: number;
  push: { month: string; calls: number; messages: number; quotaAlertedAt: string | null; lineQuota: { type: string; value: number | null; used: number | null } | null };
}
export interface LineEventRow { webhookEventId: string; eventType: string; messageType: string | null; isRedelivery: boolean; state: string; note: string | null; receivedAt: string }
```

หมายเหตุ: `lineQuota` ดึงสดจาก LINE (`message/quota` + `message/quota/consumption`) ด้วย timeout 3 วินาที ล้ม = `null` (ไม่ทำให้ GET ล้ม) · `GET` ไม่เรียก LINE ถ้า `LINE_MODE=sandbox` · `addFriendQrDataUrl` สร้างสดจาก `basicId` (cache ใน memory ต่อ `basicId`)

## 4. Service functions และ contracts

ไฟล์ภายใน: `service.ts` (public ของฟีเจอร์) · `config.ts` · `routes.ts` · `webhook.ts` (verify + enqueue) · `events.ts` (job `line.event`) · `normalize.ts` (event → parts) · `lineApi.ts` (HTTP client: fetch ฉีดได้เพื่อ test) · `sender.ts` (`ChannelSender`) · `outbound.ts` (`MessagePart` → LINE message) · `flex.ts` · `actions.ts` (postback) · `media.ts` · `connection.ts` · `usage.ts` · `repo.ts` · `*.test.ts`

ไม่มี contract ใหม่ข้าม lane · F17 **ให้**:
- `registerChannelSender('line', sender)` ใน `register()` เมื่อ `LINE_MODE=real` (ไม่ register เมื่อ `sandbox`: ปล่อย sandbox capture ของ core)
- ภายใน lane C2 (ไม่ใช่ contract): `signedMediaUrl(fileId, opts: { variant: 'original'|'preview'|'square'; ttlSeconds: number }): string` · `mediaRouteHandler` ที่ F18 ใช้ซ้ำ (route `/channel-media/:fileId` เป็นของ F17 ตัวเดียว)

Contract ที่ใช้ (signature ตาม `contracts.ts`):
- core: `registerChannelSender`, `sendToCustomer`, `storage.save/read`, `jobs.enqueue`, `db`, `rateLimit`/`assertRateLimit`, `encryptSecret`/`decryptSecret`, `audit`, `publish`, `AppError`
- F09 `saveMessage(input)` → `{ message, conversation, created, aiJobId }` · `getConversation(id, { businessId })` · F11 `isHumanTakeover(conversationId)` · F04 `getBusinessSettings(businessId)` → `aiEnabled`
- F13 `createOrderFromProposal({ stage:'confirm', businessId, conversationId, actor:{kind:'customer'}, clientRequestId, proposalId, version, reviewToken, decision })` · F15 `createBooking({ stage:'confirm', … })` (รูปแบบเดียวกัน) — ผลลัพธ์ `{ stage:'confirm', receiptId, replayed, order|appointment, decision }`
- F31 `notify({ businessId, to:{ role:'owners' }, type:'system', title, body, link, dedupKey })`

พฤติกรรมของฟังก์ชันใน `service.ts`: `getConnectionView(businessId)` · `connect(businessId, userId, body)` · `verify(businessId, userId)` · `disconnect(businessId, userId)` · `listEvents(businessId, limit)` · `signedMediaUrl` · ทุกฟังก์ชันรับ `businessId` จาก `getBusiness()` ของ route เท่านั้น

## 5. Algorithms

### 5.0 ค่าคงที่ (`config.ts`)

| ค่า | ค่า | หมายเหตุ |
|---|---|---|
| `LINE_API` | `https://api.line.me` | host ของ Messaging API |
| `LINE_DATA_API` | `https://api-data.line.me` | host เดียวที่โหลด content ของข้อความได้ (SSRF: ค่าคงที่ ไม่รับจาก payload) |
| `REPLY_TOKEN_TTL_MS` | 50 000 | D13: ใช้ reply token ได้ไม่เกิน 50 วินาทีหลังได้ event (เวลาที่ **เรา** รับ ไม่ใช่ `timestamp` ของ LINE) |
| `MAX_MESSAGES_PER_CALL` | 5 | ข้อจำกัดของ LINE ต่อ reply/push |
| `MAX_MESSAGES_PER_DELIVERY` | 15 | เกิน = `failed` `too_many_parts` (ไม่ retry) |
| `TEXT_CHUNK` | 4 800 | อักขระต่อข้อความ text (LINE รับ 5 000) |
| `FLEX_MAX_BYTES` | 45 000 | JSON ของ flex หนึ่งข้อความ (LINE: bubble ≤ 30 KB, carousel ≤ 50 KB: UNCONFIRMED ตรวจ §15) |
| `CAROUSEL_MAX_BUBBLES` | 10 | (LINE รับ 12) เผื่อ byte |
| `ALT_TEXT_MAX` | 400 | altText ของ flex |
| `QUICK_REPLY_MAX` / `QUICK_LABEL_MAX` | 13 / 20 | |
| `POSTBACK_DATA_MAX` | 300 | |
| `LOADING_SECONDS` | 30 | ต้องเป็น 5–60 หาร 5 ลงตัว |
| `HTTP_TIMEOUT_MS` | 10 000 (reply/push) · 3 000 (loading/profile/quota) · 15 000 (content) | |
| `EVENT_MAX_AGE_MS` | 172 800 000 (2 วัน) | event เก่ากว่านี้ทิ้ง (`stale`) |
| `WEBHOOK_RATE` | 300 ครั้ง / 60 วินาที ต่อ `channelId` · 30 ครั้ง / 60 วินาที สำหรับลายเซ็นผิด | |
| `MEDIA_TTL_SECONDS` | 3 600 (รูป) · 604 800 (ไฟล์ที่ส่งเป็นลิงก์) | |
| `PROFILE_TTL_DAYS` | 7 | |
| `RETENTION_DAYS` | 14 (`line_events`), 1 (`line_reply_tokens_used`), 2 (`line_actions` หลังหมดอายุ) | |

env: `LINE_MODE` (`real` | `sandbox`) · `LINE_CHANNEL_ID`, `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN` (ใช้ bootstrap connection ของร้านเดโม A ดู §5.10) · `PUBLIC_BASE_URL` · `TOKEN_ENCRYPTION_KEY` · `SESSION_SECRET` (เซ็น URL สื่อ) · ห้ามตั้งชื่อ env ใหม่

### 5.1 Webhook (`webhook.ts`) — ตอบเร็ว ทำงานหนักใน job

`api.webhook('POST', '/line/:channelId', handler)`; handler ต้องไม่ throw ออกนอกกรณีที่ระบุ

1. `channelId = ctx.params.channelId` · ไม่ตรง `^[0-9]{5,20}$` → 200 `{}` (ไม่บอกว่าไม่มี)
2. `assertRateLimit({ key: 'webhook:line:' + channelId, limit: 300, windowSeconds: 60 })` → เกินตอบ 429 (LINE ไม่ retry สำหรับ 429 ปกติ; ตั้งเพดานสูงเกินการใช้งานจริงมาก)
3. หา connection: `SELECT … FROM line_connections WHERE channel_id = $1 AND status IN ('active','error')` · ไม่มี → 200 `{}` (OA ไม่รู้จัก/ถูกตัด: LINE ไม่ต้อง retry · บันทึก log ระดับ info ไม่มีเนื้อหา)
4. ตรวจ business: `SELECT status FROM businesses WHERE id = connection.business_id` ≠ `active` (ร้านถูกลบ/ระงับ ตาม F03) → 200 `{}` **ไม่ประมวลผล** (นับเป็น `ignored` ใน log ระดับ info)
5. **ลายเซ็นก่อน parse ทุกอย่าง:** header `x-line-signature` ต้องมี (string เดียว) · `secret = decryptSecret(connection.channel_secret_enc)` · `expected = base64(HMAC_SHA256(secret, rawBodyBytes))` · เทียบด้วย `crypto.timingSafeEqual` บน Buffer ของ base64-decode ทั้งสองฝั่ง (ความยาวไม่เท่า = ไม่ตรง) · ไม่ตรง/ไม่มี header → `assertRateLimit({ key: 'webhook:line:bad:' + channelId, limit: 30, windowSeconds: 60 })` แล้วตอบ **401** `{ error: 'invalid_signature' }` (ไม่ log body หรือ header ค่าลายเซ็น)
6. `rawBody.byteLength > 1_000_000` → 413 (ก่อนข้อ 5 เพื่อไม่ HMAC ข้อมูลใหญ่) · ไม่ใช่ JSON/ไม่ตรง zod `WebhookBody` → 200 `{}` (ลายเซ็นถูกแต่รูปร่างแปลก: ไม่ให้ LINE retry วน) พร้อม log ระดับ warn ไม่มีเนื้อหา
7. `body.destination !== connection.bot_user_id` → 200 `{}` (OA คนละตัวส่งมาที่ URL นี้; `bot_user_id` เป็น NULL ก็ทิ้ง) · `events.length === 0` (ปุ่ม Verify ของ Console) → 200 `{}`
8. ต่อ event (สูงสุด 100 ต่อ request; เกินทิ้งส่วนเกินพร้อม log):
   - ไม่มี `webhookEventId` → ข้าม · `mode === 'standby'` → ข้าม
   - `INSERT INTO line_events (webhook_event_id, …, state 'received') ON CONFLICT DO NOTHING` · ถ้าแถวมีอยู่แล้วและ `state IN ('done','ignored')` → ข้าม (redelivery ที่ทำเสร็จแล้ว)
   - `jobs.enqueue('line.event', { connectionId, event, receivedAtMs: Date.now() }, { dedupKey: 'line.event:' + webhookEventId, businessId, lockKey: 'line:' + connection.id + ':' + userId, maxAttempts: 5 })` · `userId = event.source?.userId` (ไม่มี → ใช้ `line:<connection.id>`)
   - `UPDATE line_connections SET last_event_at = now(), events_total = events_total + 1`
9. enqueue ล้มเหลว (DB) → ตอบ **500** (LINE จะ redeliver ถ้าเปิดไว้; dedup ด้วย `line_events`/dedupKey จึงปลอดภัย) · ไม่งั้น 200 `{}`
10. ตอบภายใน ~1 วินาทีเสมอ: ไม่เรียกเครือข่ายภายนอกใน handler

zod `WebhookBody`: `{ destination: string, events: array(passthrough object) }` · `event` ตรวจรูปร่างจริงใน job (§5.2) เพราะ event type ใหม่ของ LINE เพิ่มได้ จึงใช้ passthrough และทิ้งชนิดที่ไม่รู้จัก

### 5.2 Job `line.event` (`events.ts`)

payload `{ connectionId, event, receivedAtMs }` · `lockKey` ทำให้ event ของผู้ใช้คนเดียวเรียงตามลำดับ

1. โหลด connection (ต้อง `active|error`; ไม่ใช่ → mark `ignored` `connection_gone` แล้วจบ) · ตรวจ business active อีกครั้ง (ไม่ → `ignored` `business_inactive`)
2. `event.timestamp` เก่ากว่า `now − EVENT_MAX_AGE_MS` → `ignored` `stale`
3. `source.type !== 'user'` (กลุ่ม/ห้อง) หรือไม่มี `source.userId` → `ignored` `group_source`
4. แยกตามชนิด:
   - `follow` → `upsertContact(is_following = true, followed_at = now)` + ดึงโปรไฟล์ (§5.3) · ไม่สร้างข้อความ · `done`
   - `unfollow` → `is_following = false, unfollowed_at = now` · `done`
   - `message` → §5.4
   - `postback` → §5.7
   - อื่น (`join`, `memberJoined`, `beacon`, `videoPlayComplete`…) → `ignored` `unsupported_type`
5. สำเร็จ → `line_events.state='done', processed_at=now()` · error ที่ retry ได้ (DB/เครือข่าย) → throw ให้ job retry (core backoff) · ครบ `maxAttempts` แล้วยังล้ม (`failed`): ถ้า event เป็น message ที่ยังไม่ถูกบันทึก ให้บันทึกข้อความ placeholder `[ข้อความจาก LINE ที่ระบบรับไม่สำเร็จ]` ด้วย `saveMessage(triggerAi:false)` เพื่อไม่ให้ลูกค้า "หาย" แล้ว `failed` + `notify` เจ้าของ (dedupKey รายวันต่อ connection)

### 5.3 โปรไฟล์ลูกค้า (best effort)

ก่อน `saveMessage` ครั้งแรก (ไม่มีแถว `line_contacts` หรือ `profile_fetched_at` เก่ากว่า 7 วัน): `GET {LINE_API}/v2/bot/profile/{userId}` (timeout 3 วินาที) → `displayName`, `language` (ไม่เก็บ `pictureUrl`: ไม่ดึงรูปโปรไฟล์ใน v1) · สำเร็จ → upsert `line_contacts` · ล้ม/404 (ผู้ใช้ไม่ได้เป็นเพื่อน) → ใช้ชื่อเดิมใน contacts หรือ `'LINE user'` แล้วลองใหม่ตอนข้อความถัดไปหลังผ่านไป 1 ชั่วโมง (`profile_fetched_at` ตั้ง = now − 6 วัน 23 ชม.) · ห้ามทำให้ event ล้ม

### 5.4 ข้อความเข้า (`normalize.ts`)

`customer = { channel: 'line', externalId: userId, displayName, channelAccountId: connection.bot_user_id }` · `externalId = message.id` (dedup ของ `saveMessage`) · `providerMeta = { replyToken, replyTokenIssuedAt: <ISO ของ receivedAtMs>, replyTokenExpiresAt: <issued + 50 วินาที> , lineEventId: webhookEventId }` (ไม่มี `replyToken` ใน event = ไม่ใส่) · `occurredAt` = `event.timestamp` ถ้าไม่เกิน now (ไม่งั้น now) · `origin: 'live'`

| `message.type` | parts | `triggerAi` | หมายเหตุ |
|---|---|---|---|
| `text` | `[{ type:'text', text }]` (ตัด NUL, trim, ≤ 5 000) | ค่าเริ่มต้น | ข้อความว่างหลัง trim → ข้าม (`ignored` `empty`) |
| `image` | `ImagePart { fileId, alt: 'รูปภาพจากลูกค้า' }` | ค่าเริ่มต้น (สลิป/รูปสินค้าให้ F10/F14 จัดการ) | ดาวน์โหลด §5.5 · `contentProvider.type='external'` → **ไม่โหลด URL ภายนอก** บันทึกเป็น text `[รูปภาพ (ลิงก์ภายนอก)]` |
| `sticker` | text `[สติกเกอร์]` (+ `: <keywords แรกสุด 3 คำ>` ถ้ามี `keywords`) | **false** | ไม่ให้บอทตอบสติกเกอร์ |
| `audio` | `FilePart` (audio/mp4 หรือที่ตรวจได้) + text `[ข้อความเสียง]` | **false** | แล้วส่งข้อความแจ้ง (§5.4.1) |
| `video` | `FilePart` (video/mp4) + text `[วิดีโอ]` | **false** | ถ้า content ยังไม่พร้อม/ใหญ่เกิน → เฉพาะ text |
| `file` | `FilePart { fileName: message.fileName, … }` | **false** | |
| `location` | text `[ตำแหน่ง] <title> <address> (<lat>, <lng>)` | ค่าเริ่มต้น | พิกัดเป็นตัวเลขธรรมดาใน text |

หลัง `saveMessage`:
1. `created === false` → ถือเป็น redelivery/ซ้ำ: `done` ไม่ทำอะไรต่อ (ไม่โหลดซ้ำ ไม่ loading animation)
2. `created === true` และ `aiJobId !== null` → **loading animation** (best effort): ตรวจ `getBusinessSettings(businessId).aiEnabled` และ `!(await isHumanTakeover(conversationId))` ทั้งสองต้องผ่าน → `POST {LINE_API}/v2/bot/chat/loading/start` body `{ chatId: userId, loadingSeconds: 30 }` timeout 3 วินาที · error ทุกชนิดถูกกลืน (log ระดับ debug) · ไม่ใช้ reply token (animation ไม่กิน token)

#### 5.4.1 ข้อความเสียง
บันทึกแล้ว ถ้า AI เปิดและไม่ takeover และ `line_contacts.audio_notice_at` ว่างหรือเก่ากว่า 1 ชั่วโมง → `sendToCustomer(conversationId, [text 'ขออภัยค่ะ ตอนนี้ยังฟังข้อความเสียงไม่ได้ รบกวนพิมพ์ข้อความมาได้เลยนะคะ'], { author:'ai', origin:'system', clientRequestId:'line-audio-notice:'+webhookEventId, businessId })` แล้วอัปเดต `audio_notice_at` · (stretch ถอดเสียง: §6)

### 5.5 ดาวน์โหลด content (รูป/ไฟล์) → `storage`

1. URL = `LINE_DATA_API + '/v2/bot/message/' + encodeURIComponent(message.id) + '/content'` (message.id ต้องตรง `^[0-9]{6,30}$` ไม่งั้น `ignored` `bad_message_id`) · header `Authorization: Bearer <token>` (§5.9) · **ไม่ตาม redirect** (`redirect: 'manual'`; 3xx = ล้ม)
2. ตรวจ `Content-Length` ถ้ามี ≤ `UPLOAD_MAX_MB` ของ core ก่อนอ่าน body · อ่านแบบ stream สะสมไม่เกินเพดานเดียวกัน (เกิน = ยกเลิก) · timeout 15 วินาที
3. ชนิด: รูป = ตรวจ magic bytes ด้วย `sharp(bytes).metadata()` ต้องเป็น `jpeg|png|gif|webp` (ไม่ใช้ `Content-Type` เพียงอย่างเดียว) · ไฟล์/เสียง/วิดีโอ = ใช้ MIME จาก header แล้ว whitelist (`audio/*`, `video/mp4`, `application/pdf`, `image/*`, `text/plain`, office docs `application/vnd.*`) นอกนั้น `application/octet-stream` + บันทึกเป็นไฟล์ได้แต่ไม่แสดง inline
4. `storage.save({ businessId, uploadedBy: null, purpose: 'chat-attachment', originalName, mimeType, bytes })` (`originalName` = `line-<messageId>.<ext>` หรือ `message.fileName` ที่ลบ `/\` และ control characters, ≤ 120 ตัว)
5. ผลลัพธ์ 404/409 (content ยังไม่พร้อม — พบกับวิดีโอ/เสียงใหญ่) หรือ 5xx/timeout → throw (job retry; delay เริ่ม 5 วินาที เพิ่มเท่าตัว) · 401/403 → connection `error` `token_rejected` + บันทึก placeholder · `VALIDATION_ERROR` จาก storage (ใหญ่เกิน) → text `[ไฟล์ใหญ่เกินกำหนด ระบบไม่ได้บันทึก]` แทน (ไม่ retry)
6. ไม่ผ่าน moderation ในเส้นทางนี้ (ไม่มีค่าใช้จ่าย OpenAI) · รูปที่ AI ต้องดู (สลิป) ผ่าน F14

### 5.6 Dedup และ redelivery

- ชั้น 1: `line_events.webhook_event_id` PK (webhook) · ชั้น 2: `jobs.dedup_key = line.event:<id>` · ชั้น 3: `saveMessage.externalId = message.id` → `created:false` · postback ใช้ `externalId = 'pb:' + webhookEventId`
- `deliveryContext.isRedelivery === true` เก็บลง `line_events.is_redelivery` เพื่อดูใน UI เท่านั้น ไม่เปลี่ยนตรรกะ (dedup เป็นตัวตัดสิน)
- ลูกค้ายกเลิกส่ง (unsend event): ไม่รองรับ (`ignored`)

### 5.7 Postback (`actions.ts`)

`event.postback.data` (string ≤ 300) →
1. ขึ้นต้น `nl:a:` + id 12 ตัว → **action ปุ่ม** (ข้อ 2) · ไม่งั้น → **ข้อความของลูกค้า**: `saveMessage({ customer, parts:[text data], externalId:'pb:'+webhookEventId, providerMeta, origin:'live' })` (ใช้ `triggerAi` ค่าเริ่มต้น = AI ตอบ; ตรงกับข้อตกลงกับ F09/F12) · data ว่าง/ยาวเกิน 300 → ข้าม `ignored`
2. action: โหลด `line_actions` ตาม id **และ** `business_id = connection.business_id` · ไม่พบ/หมดอายุ (`expires_at < now`) → ตอบด้วย `sendToCustomer` ข้อความ `รายการนี้หมดอายุแล้วค่ะ พิมพ์สั่งใหม่ได้เลยนะคะ` (author `ai`, origin `system`, `clientRequestId:'line-act-expired:'+eventId`) แล้ว `done`
3. ตรวจเจ้าของ: `getConversation(action.conversation_id, { businessId })` ต้องมี และ `conversation.customer.externalId === userId` (กันคนอื่นกดปุ่มที่ forward มา) · ไม่ตรง → `ignored` `action_owner_mismatch`
4. บันทึกการกดเป็นข้อความลูกค้า (เพื่อ audit/ประวัติ): `saveMessage({ conversationId, parts:[text label], externalId:'pb:'+eventId, triggerAi:false, providerMeta })` โดย label = `ยืนยัน` / `ยกเลิก` + ` (ออเดอร์|นัดหมาย)` ตาม `decision`/`kind`
5. เรียกเจ้าของ: `kind==='order'` → `createOrderFromProposal({ stage:'confirm', businessId, conversationId, actor:{ kind:'customer' }, clientRequestId:'line-action:'+action.id, proposalId, version, reviewToken: decrypt(...), decision })` · `kind==='booking'` → `createBooking({ stage:'confirm', … })` · `clientRequestId` คงที่ต่อปุ่ม → กดซ้ำ = `replayed:true` ไม่สร้างซ้ำ
6. ผล (ข้อความตอบเป็นข้อความคงที่จากโค้ด ไม่ผ่านโมเดล; ส่งด้วย `sendToCustomer` author `ai`, origin `system`, `clientRequestId:'line-act-result:'+eventId`):

| ผลลัพธ์ | ข้อความถึงลูกค้า |
|---|---|
| `decision confirm`, สำเร็จ ไม่ replay | **ไม่ส่งอะไรจาก C2**: เจ้าของฟีเจอร์เป็นผู้ส่งข้อความยืนยันเองผ่าน `sendToCustomer` (F13 ส่งเลขออเดอร์ + ยอดรวม แล้ว F14 ส่ง QR ชำระเงิน · F15 ส่งวันเวลานัด) ถ้า C2 ส่งด้วยลูกค้าจะได้ข้อความซ้ำ |
| `replayed: true` | `รายการนี้ยืนยันไปแล้วค่ะ` |
| `decision cancel` | `ยกเลิกรายการให้แล้วค่ะ ถ้าต้องการสั่งใหม่บอกได้เลยนะคะ` |
| `PROPOSAL_EXPIRED` | `รายการนี้หมดอายุแล้วค่ะ พิมพ์สั่งใหม่ได้เลยนะคะ` |
| `VERSION_CONFLICT` | `ราคาหรือสต็อกมีการเปลี่ยนแปลงค่ะ ขอสรุปรายการใหม่ให้นะคะ` แล้ว `saveMessage` ข้อความลูกค้า `ขอสรุปรายการใหม่` (triggerAi ค่าเริ่มต้น) ให้ AI ทำ proposal ใหม่ |
| `SOLD_OUT` / `SLOT_FULL` | `ขออภัยค่ะ รายการนี้ไม่ว่างแล้ว เดี๋ยวช่วยเสนอทางเลือกให้นะคะ` + `saveMessage` ข้อความลูกค้า `ขอทางเลือกอื่น` |
| `SERVICE_NOT_READY` (owner ยังไม่ merge) | `ระบบรับออเดอร์ยังไม่พร้อมใช้งานค่ะ รบกวนรอทีมงานติดต่อกลับนะคะ` + `requestHumanHandoff` **ไม่ใช้** (ไม่ใช่ contract ของเรา): ใช้ `notify` เจ้าของ (`type 'system'`, dedupKey รายวัน) |
| error อื่น | log ระดับ error (ไม่มีข้อความลูกค้า) · ข้อความ `ขออภัยค่ะ เกิดข้อผิดพลาด รบกวนลองใหม่อีกครั้งนะคะ` · ไม่ retry job อัตโนมัติ (กันตอบซ้ำ) |

ข้อความตอบของข้อ 6 ไม่ผ่าน `ai.reply` · รายละเอียดชำระเงินของ F14 จะมากับขั้นตอนของ A2 (ดู §15 ข้อ 6)

### 5.8 Sender (`sender.ts`): `registerChannelSender('line', { channel:'line', mode:'real', send })`

`send(delivery: OutboundDelivery): Promise<DeliveryResult>` — คืนผลเสมอ ไม่ throw (ยกเว้นบั๊กจริง)

1. หา connection: `SELECT … WHERE business_id = delivery.businessId AND status IN ('active','error') AND (delivery.channelAccountId IS NULL OR bot_user_id = delivery.channelAccountId)` · ไม่มี → `{ state:'failed', mode:'real', error:'CHANNEL_NOT_CONNECTED: line connection missing or disconnected', retryable:false }` (งานที่ค้างหลัง disconnect จึงไม่ถูกส่ง)
2. contact บล็อกอยู่: `line_contacts.is_following = false` **และ** `unfollowed_at` ใหม่กว่า `lastInboundMeta.replyTokenIssuedAt` (หรือไม่มี meta) → `failed` `recipient_unfollowed` retryable false (ผู้ใช้บล็อกแล้ว; ถ้าเขากลับมาทัก `follow`/ข้อความใหม่จะตั้ง `is_following = true`)
3. แปลง parts → LINE messages (`outbound.ts` §5.11) · ผิดข้อจำกัด (เกิน 15 ข้อความ) → `failed` `too_many_parts` · จัดกลุ่มเป็น batch ละ ≤ 5 ตามลำดับ (`batches[i]`)
4. token: `getAccessToken(connection)` (§5.9)
5. ต่อ batch `i` ตามลำดับ:
   - มีแถว `line_delivery_batches (message_id, i)` state `accepted` → ข้าม (retry ไม่ส่งซ้ำ) · state `unknown` → คืน `{ state:'unknown' }` ทันที (ห้ามเดา)
   - **เลือก reply หรือ push** (เฉพาะ batch ที่ 0 พิจารณา reply; batch อื่นเป็น push เสมอ เพราะ token ใช้ครั้งเดียว):
     `useReply = i === 0 && meta.replyToken && Date.now() < Date.parse(meta.replyTokenExpiresAt) && !(await consumeReplyToken(hash(meta.replyToken)))` โดย `consumeReplyToken` = `INSERT … ON CONFLICT DO NOTHING RETURNING` (ได้แถว = ยังไม่เคยใช้ และตอนนี้จองแล้ว; ไม่ได้แถว = ใช้ไปแล้ว → push) · `meta = delivery.lastInboundMeta`
   - **reply:** `POST /v2/bot/message/reply { replyToken, messages }` timeout 10 วินาที
     - 200 → บันทึก batch `accepted` (`mode:'reply'`, `sent_ids` จาก `sentMessages[].id`, `request_id` จาก header `x-line-request-id`)
     - 400 และ body.message มีคำว่า `reply token` (invalid/expired/used; เทียบแบบไม่สนตัวพิมพ์) → **fallback push** batch เดิม (ข้อ push) · 400 อื่น (ข้อความผิดรูปแบบ) → `failed` `line_400: <message ≤ 200>` retryable false
     - 401/403 → `markConnectionError('token_rejected')` + `failed` retryable false + `notify` (§5.12)
     - 429 → §429 ด้านล่าง · 5xx → `failed` retryable true (รอบถัดไป token มักหมดอายุแล้วและใช้ push) · network error/timeout ไม่มี response → batch `unknown` + คืน `{ state:'unknown' }` (ไม่ push ซ้ำ: อาจถึงแล้ว)
   - **push:** `POST /v2/bot/message/push { to: userId, messages }` header `X-Line-Retry-Key: <retry_key>` โดย `retry_key = uuid จาก sha256(messageId + ':' + i)` (UUID รูปแบบ 8-4-4-4-12 ที่ derive แบบ deterministic) · เก็บแถว batch ก่อนเรียก **ไม่ทำ** (ใช้ retry key แทน) · timeout 10 วินาที
     - 200 → `accepted` + `usage.recordPush(businessId, messages.length)`
     - **409** → request นี้เคยถูกยอมรับแล้ว (header `x-line-accepted-request-id`) → ถือเป็น `accepted` (ไม่นับ usage ซ้ำ)
     - 400 → `failed` retryable false · 401/403 → เหมือน reply · 429 → ด้านล่าง · 5xx → `failed` retryable true (retry key กันซ้ำ) · timeout/network → `unknown` (บันทึก batch `unknown` พร้อม retry key; ถ้าเจ้าของกด "ส่งใหม่" ในอนาคตจะใช้ key เดิม)
   - **429:** อ่าน body.message: มี `monthly limit` → `failed` `line_quota_exhausted` retryable false + `notifyQuota()` (วันละครั้งต่อ business ด้วย `line_push_usage.quota_alerted_at` และ dedupKey `line-quota:<businessId>:<yyyy-mm-dd>`) · อื่น (rate) → `failed` retryable true (เคารพ `Retry-After` ถ้ามี โดยใส่ใน error string) 
6. ครบทุก batch `accepted` → `{ state:'sent', mode:'real', externalRef: <sent id แรกของ batch สุดท้าย หรือ request id> }` · batch ก่อนหน้า accepted แล้วแต่ batch ท้ายล้ม → `failed` พร้อม `error` มี `partial: n/m` (retryable ตามชนิด error; retry จะข้าม batch ที่ accepted)
7. ทุก error string ที่คืนต้องสะอาด: ไม่มี token, ไม่มีเนื้อข้อความลูกค้า, ยาว ≤ 200

### 5.9 Token (`connection.ts`)

- มี `access_token_enc` → `decryptSecret` ใช้ตรง (long-lived token จาก Console · ไม่หมดอายุจนกว่าจะ reissue)
- ไม่มี → **stateless token**: `POST {LINE_API}/oauth2/v3/token` (form: `grant_type=client_credentials`, `client_id=<channelId>`, `client_secret=<secret>`) → `{ access_token, expires_in }` (≈ 900 วินาที) · cache ใน memory ต่อ `connection.id + generation` จนก่อนหมดอายุ 60 วินาที · ขอไม่ผ่าน = `error` (UNCONFIRMED path/ชนิดข้อมูล: ตรวจ §15 ข้อ 2; ถ้าไม่ตรงให้บังคับกรอก `accessToken` ตอน connect)
- `markConnectionError(reason)` = `status='error'`, `status_reason`, `generation+1`, ล้าง cache · `verify()` สำเร็จ → `active`
- ห้ามเก็บ token ลง log, `audit.details`, error message, job payload

### 5.10 Connect / verify / disconnect (`connection.ts`)

**connect(businessId, userId, body)** ภายใต้ `db.withAdvisoryLock('channel-owner:line:' + channelId, …)`:
1. `channel_id` ถูกถือโดย business อื่นที่ `active|error` → `POLICY_BLOCKED` `reason:'channel_in_use'` · business นี้มี LINE active อยู่แล้วคนละ OA → ปิดอันเก่า (`inactive`) ก่อนใน transaction เดียวกัน (UI ยืนยันก่อนผ่าน `ConfirmDialog`)
2. `LINE_MODE=real`: เรียก `GET /v2/bot/info` ด้วย token (ของ body หรือ stateless) → `userId`, `basicId`, `displayName` · 401 → `POLICY_BLOCKED` `reason:'credentials_rejected'` · ล้มชั่วคราว → `PROVIDER_UNAVAILABLE` (ไม่บันทึกอะไร)
3. ตรวจ secret: LINE ไม่มี endpoint ตรวจ secret ตรง ๆ — ผ่านเมื่อ stateless-token ขอได้ (ถ้าไม่ได้ใส่ `accessToken`) · ถ้าใส่ `accessToken` เอง: secret ถูกตรวจจริงตอน webhook แรก (ลายเซ็นผ่าน) และตอนกด "ทดสอบ webhook" ใน Console · UI จึงบอกให้กด Verify ของ Console ทันที (§7) · คืน `last_verified_at` เฉพาะเมื่อ info สำเร็จ
4. `LINE_MODE=sandbox`: ไม่เรียกเครือข่าย · `bot_user_id = 'Usandbox' + sha256(channelId).slice(0,25)` (รวม 32 ตัว) · `display_name='Sandbox LINE OA'` · `basic_id = null`
5. upsert แถว (`status 'active'`, `generation = generation + 1`, secret/token เข้ารหัส) · `audit('line.connect', { businessId, targetId: connection.id, details:{ channelId, source } })` (ไม่มี secret) · `publish` custom `line.connection.changed`
6. คืน `LineConnectionView` (พร้อม `webhookUrl`)

**verify:** เรียก `GET /v2/bot/info` ใหม่ → อัปเดต `display_name/basic_id/last_verified_at`, ถ้า `userId` ≠ `bot_user_id` เดิม → `error` `bot_changed` · 401 → `error` `token_rejected` · สำเร็จ → `active`, `status_reason = null` · ไม่ได้พิสูจน์ว่า webhook ตั้งถูก (ตรวจที่ Console) — UI แสดง `lastEventAt` เป็นหลักฐานจริง

**disconnect:** `withAdvisoryLock('channel-owner:line:' + channelId)` → `status='inactive'`, `status_reason='disconnected'`, `channel_secret_enc=NULL`, `access_token_enc=NULL`, `generation+1`, `disconnected_at=now()` · ลบ cache token · `audit('line.disconnect')` · ไม่เรียก LINE เพิ่ม (ไม่มี revoke ที่จำเป็น; token ของ Console เจ้าของจัดการเอง) · งานค้างส่ง/ webhook ใหม่ถูกปฏิเสธโดยข้อ 3 ของ §5.1 และข้อ 1 ของ §5.8

**Env bootstrap (`line.maintenance` schedule ทุก 600 วินาที + ตอน boot เมื่อ `LINE_MODE=real`):** ถ้า `LINE_CHANNEL_ID`, `LINE_CHANNEL_SECRET` ครบ และ business alias `biz_demo_a` (`seed_aliases`) **ไม่มี** LINE connection ที่ `active|error` → เรียก `connect` ภายในแบบ `source:'env'` (`LINE_CHANNEL_ACCESS_TOKEN` ถ้ามี) · มีของ `ui` อยู่แล้ว → ไม่ทำอะไร · ผลคือ production มี OA *NLess Demo* ผูกกับร้านเดโมโดยไม่ต้องกด UI และเครื่อง dev ผูก *NLess Dev* เข้า DB ของตัวเองด้วย env ของ `.env.local` · schedule เดียวกันทำความสะอาด (§5.0 `RETENTION_DAYS`) วันละครั้ง (ตรวจจาก `now() - last cleanup` เก็บใน memory + SQL idempotent)

### 5.11 `MessagePart` → LINE messages (`outbound.ts`, `flex.ts`)

ลำดับ parts = ลำดับข้อความ · ข้อความ text ยาว > 4 800 แตกหลายข้อความ (ตัดที่ `\n\n`, `\n`, ช่องว่าง, ไม่งั้นตัดตรง ๆ; ห้ามตัดกลาง surrogate pair)

| part | LINE | ข้อกำหนด |
|---|---|---|
| `text` | `{ type:'text', text }` | ตัดเป็นก้อน ≤ 4 800 · ข้อความว่าง = ข้าม |
| `image` | `{ type:'image', originalContentUrl, previewImageUrl }` | `signedMediaUrl(fileId, { variant:'original', ttlSeconds: 3600 })` และ `variant:'preview'` · ต้อง HTTPS (`PUBLIC_BASE_URL` ต้องขึ้นต้น `https://` ไม่งั้น `failed` `public_url_not_https`) · ไฟล์ไม่พบ → ข้ามรูปนั้น + ใส่ text `[รูปภาพ]` |
| `file` | `{ type:'text', text:'<fileName>\n<signed URL อายุ 7 วัน>' }` | LINE ส่งไฟล์เองไม่ได้ในข้อความ bot · URL เซ็นโดยเซิร์ฟเวอร์ |
| `product_card` | Flex `carousel` (หรือ `bubble` ถ้า 1 ใบ) | ดูด้านล่าง · `altText = part.altText` ตัด 400 |
| `order_review` | Flex `bubble` | ดูด้านล่าง |
| `booking_review` | Flex `bubble` | ดูด้านล่าง |
| `action_buttons` | quick reply หรือ Flex `bubble` | ดูด้านล่าง |

**product_card:** ต่อ item (สูงสุด 10 ใบต่อ carousel; เกินแตกเป็น flex ข้อความถัดไป): bubble `size:'kilo'` · `hero` = รูปจาก `imageFileId` (`variant:'square'`, `aspectRatio:'1:1'`, `aspectMode:'cover'`) ถ้ามี · `body`: ชื่อ (`weight:'bold'`, `wrap:true`, `maxLines:2`), ราคา `฿{n}` (ใช้ `formatMoney` ฝั่ง server ที่ใช้ร่วมกับ core: ถ้าไม่มีให้ `Intl.NumberFormat('th-TH')` + `฿`), บรรทัดสต็อก: `soldOut` → `สินค้าหมด` (สีแดง) · `available` 1–5 → `เหลือ {n} ชิ้น` · `footer`: ถ้าไม่ `soldOut` ปุ่ม `message` action ป้าย `สนใจ` (≤ 20) ข้อความ `สนใจ {name}` (ตัด 300) — เป็นข้อความลูกค้าปกติจึงเข้า `message` event (ไม่ต้องมี postback) · สีโทน: ใช้ค่าคงที่ใน `flex.ts` (ไม่ดึงจากข้อมูลผู้ใช้) · ข้อความทุกช่องมาจาก DB/โค้ด ไม่มี markup

**order_review:** bubble: header `สรุปออเดอร์` · body: ต่อบรรทัด `{name} × {quantity}` + `฿{lineTotal}` (สูงสุด 8 บรรทัด, เกิน = `และอีก n รายการ`) → separator → ยอดสินค้า / ค่าส่ง / **รวม** (ตัวหนา) → บรรทัดเล็ก `ยืนยันได้ถึง {expiresAt แปลงเวลา Asia/Bangkok รูปแบบ dd MMM HH:mm}` · footer 2 ปุ่ม `postback`: `ยืนยันสั่งซื้อ` (primary) และ `ยกเลิก` โดย `createAction(...)` สองแถวใน `line_actions` (`decision` confirm/cancel; `expires_at = part.expiresAt`; `review_token_enc = encryptSecret(part.reviewToken)`) และ `data = 'nl:a:' + id` · `displayText` = ป้ายปุ่ม (ให้ลูกค้าเห็นว่ากดอะไร) · altText `สรุปออเดอร์ รวม ฿{total} เปิดดูในแอป LINE เพื่อยืนยัน`

**booking_review:** bubble: header `สรุปนัดหมาย` · body: บริการ, ผู้ให้บริการ (`resourceName`), `localDisplay` (ตัวหนา) · ปุ่ม `ยืนยันนัดหมาย` / `ยกเลิก` เหมือนข้างบน (`kind:'booking'`) · altText `สรุปนัดหมาย {localDisplay} เปิดดูในแอป LINE เพื่อยืนยัน`

**ป้ายและข้อความคงที่ของ LINE มีสองภาษา (แก้ 21 พ.ย.):** ทุกสตริงที่ F17 เขียนเองถึงลูกค้า (หัวการ์ด ปุ่ม altText ข้อความผล postback ข้อความแจ้งเสียง) เก็บใน `labels.ts` เป็น `{ th, en }` · `lang = await getCustomerLanguage(conversationId, { businessId })` (F09 · contracts.ts) คำนวณหนึ่งครั้งต่อการส่ง (`sendToCustomer` รู้ `conversationId`) และต่อ postback · ชื่อสินค้าและตัวเลขมาจาก part ตามเดิม (F10/F13 ใส่ภาษาที่ถูกแล้ว) · ป้ายปุ่มอังกฤษทุกตัว ≤ 20 ตัวอักษร (ขีดจำกัดของ LINE) · วันที่ `ยืนยันได้ถึง` ใช้รูปแบบ `dd MMM HH:mm` ของภาษานั้น · ข้อความไทยที่เขียนในข้อ §5.4.1, §5.7 และหัวข้อนี้คือค่า `th`:

| ที่ใช้ | th | en |
|---|---|---|
| product_card | `สินค้าหมด` · `เหลือ {n} ชิ้น` · ปุ่ม `สนใจ` (ข้อความที่ส่ง `สนใจ {name}`) | `Sold out` · `{n} left` · ปุ่ม `Interested` (ข้อความที่ส่ง `Interested in {name}`) |
| order_review | header `สรุปออเดอร์` · `และอีก {n} รายการ` · `ยอดสินค้า` / `ค่าส่ง` / `รวม` · `ยืนยันได้ถึง {time}` · ปุ่ม `ยืนยันสั่งซื้อ` / `ยกเลิก` · altText `สรุปออเดอร์ รวม ฿{total} เปิดดูในแอป LINE เพื่อยืนยัน` | header `Order summary` · `and {n} more` · `Items` / `Delivery` / `Total` · `Confirm before {time}` · ปุ่ม `Confirm order` / `Cancel` · altText `Order summary, total ฿{total}. Open in the LINE app to confirm.` |
| booking_review | header `สรุปนัดหมาย` · ปุ่ม `ยืนยันนัดหมาย` / `ยกเลิก` · altText `สรุปนัดหมาย {localDisplay} เปิดดูในแอป LINE เพื่อยืนยัน` | header `Booking summary` · ปุ่ม `Confirm booking` / `Cancel` · altText `Booking summary {localDisplay}. Open in the LINE app to confirm.` |
| quick reply ไม่มีข้อความ | `เลือกได้เลยค่ะ` | `Please choose an option.` |
| รูปหาย | `[รูปภาพ]` | `[Picture]` |
| ข้อความแจ้งเสียง §5.4.1 | `ขออภัยค่ะ ตอนนี้ยังฟังข้อความเสียงไม่ได้ รบกวนพิมพ์ข้อความมาได้เลยนะคะ` | `Sorry, I cannot listen to voice messages yet. Please type your message.` |
| postback: ไม่พบ/หมดอายุ | `รายการนี้หมดอายุแล้วค่ะ พิมพ์สั่งใหม่ได้เลยนะคะ` | `This item has expired. Please type your order again.` |
| postback: `replayed` | `รายการนี้ยืนยันไปแล้วค่ะ` | `This was already confirmed.` |
| postback: ยกเลิก | `ยกเลิกรายการให้แล้วค่ะ ถ้าต้องการสั่งใหม่บอกได้เลยนะคะ` | `Cancelled. Tell me if you would like to order again.` |
| postback: `VERSION_CONFLICT` / ราคาเปลี่ยน | `ราคาหรือสต็อกมีการเปลี่ยนแปลงค่ะ ขอสรุปรายการใหม่ให้นะคะ` (ข้อความลูกค้าที่บันทึก `ขอสรุปรายการใหม่`) | `The price or stock has changed. Let me prepare a new summary.` (ข้อความลูกค้าที่บันทึก `Please send a new summary`) |
| postback: `SLOT_FULL` / `SOLD_OUT` | `ขออภัยค่ะ รายการนี้ไม่ว่างแล้ว เดี๋ยวช่วยเสนอทางเลือกให้นะคะ` (บันทึก `ขอทางเลือกอื่น`) | `Sorry, this is no longer available. Let me suggest other options.` (บันทึก `Please suggest other options`) |
| postback: `SERVICE_NOT_READY` | `ระบบรับออเดอร์ยังไม่พร้อมใช้งานค่ะ รบกวนรอทีมงานติดต่อกลับนะคะ` | `Ordering is not available yet. Our team will get back to you.` |
| postback: error อื่น | `ขออภัยค่ะ เกิดข้อผิดพลาด รบกวนลองใหม่อีกครั้งนะคะ` | `Sorry, something went wrong. Please try again.` |
| ข้อความลูกค้าที่บันทึกเมื่อกดปุ่ม | `ยืนยัน` / `ยกเลิก` + ` (ออเดอร์\|นัดหมาย)` | `Confirm` / `Cancel` + ` (order\|booking)` |

ป้ายที่พนักงานเห็นใน inbox เท่านั้น (`[สติกเกอร์]`, `[ข้อความเสียง]`, `[วิดีโอ]`, `[ตำแหน่ง]`, `[ข้อความจาก LINE ที่ระบบรับไม่สำเร็จ]`, alt `รูปภาพจากลูกค้า`) ไม่ได้ส่งถึงลูกค้า: ใช้ภาษาของร้าน (`getBusinessSettings().language`) th ตามที่เขียน · en `[Sticker]`, `[Voice message]`, `[Video]`, `[Location]`, `[LINE message that could not be received]`, `Picture from customer` · **ไม่มีข้อสมมติว่าข้อความเป็นภาษาไทย:** การตัดข้อความ 4 800 ตัว, ป้าย 20 ตัว, altText 400 ตัว นับเป็นตัวอักษร (code point ไม่ตัดกลาง surrogate pair) ใช้ได้ทั้งสองภาษา · test `outbound.test.ts`: การ์ดทั้งสามชนิดเมื่อ `lang='en'` ไม่มีอักษรไทยในป้ายของโค้ด และป้ายปุ่มทุกตัว ≤ 20

**action_buttons:**
- ถ้า **ไม่มี** `text` และปุ่มทั้งหมดเป็น `postback` (≤ 13) → **quick reply** แนบกับข้อความสุดท้ายของ batch สุดท้าย (ถ้าไม่มีข้อความ ให้สร้าง text `เลือกได้เลยค่ะ`): ต่อปุ่ม `{ type:'action', action:{ type:'message', label: label.slice(0,20), text: data.slice(0,300) } }` — ลูกค้ากด = ข้อความธรรมดาของเขา (เหมาะกับ `data` ที่เป็นข้อความลูกค้าตามข้อตกลง F12)
- มิฉะนั้น → Flex bubble: body = `text` (wrap), footer ปุ่มสูงสุด 4 (LINE limit ใน contracts): `postback` → `message` action (ข้อความลูกค้า; `data` > 300 หรือว่าง → ใช้ `label`) · `link` → `uri` action (ต้อง `https://` และ ≤ 1000 ตัว ไม่ตรง = ข้ามปุ่ม) · `confirm_proposal` → `postback` action ผ่าน `line_actions` (`kind` ตามที่ต้องเดา: **ต้องรู้ชนิด** → ถ้า `proposalId` ขึ้นต้นด้วย `fake-` หรือไม่รู้ ใช้ `order`; เจ้าของ F13/F15 ควรใช้ `order_review`/`booking_review` เป็นหลัก — ดู §15 ข้อ 7) · ป้ายปุ่มตัด 20 ตัว
- รวม: `quickReply` ใส่ได้เฉพาะข้อความสุดท้ายของ **การเรียก** นั้น (batch สุดท้าย) · ข้อความ (message objects) ของ batch ท้ายสุดต้องไม่ใช่รูปแบบที่ไม่รองรับ quick reply (รองรับทุกชนิดที่เราสร้าง)

ขนาด: ถ้า JSON ของ flex ข้อความหนึ่ง > `FLEX_MAX_BYTES` → ลดจำนวน bubble ทีละใบจนพอ (ใบที่ตกใส่ข้อความถัดไป) · bubble เดี่ยวเกิน → ตัดบรรทัดสินค้า/เนื้อหา แล้วถ้ายังเกิน → ส่งเป็น text จาก `altText`

ถ้าไม่ต้องการ rich menu (ค่าเริ่มต้น): **ถ้ามีเวลา:** `POST /v2/bot/richmenu` + upload รูป (ต้องใช้ API ฝั่งข้อมูล) — ไม่อยู่ใน slice ใด ๆ

### 5.12 Push usage และการแจ้งเตือน (`usage.ts`)

- `recordPush(businessId, messageCount)`: `INSERT … ON CONFLICT (business_id, month) DO UPDATE SET push_calls = push_calls + 1, push_messages = push_messages + $n` โดย `month = date_trunc('month', now() AT TIME ZONE 'Asia/Bangkok')::date` (LINE นับตามเขตเวลาของบริการ: UNCONFIRMED)
- แจ้งเตือน: `notify({ businessId, to:{ role:'owners' }, type:'system', title:'โควตาข้อความ LINE ของเดือนนี้เต็ม', body:'ข้อความที่ต้องใช้ Push จะส่งไม่ออกจนกว่าจะรีเซ็ตโควตาหรืออัปเกรดแพ็กเกจ OA ที่ LINE', link:'/channels', dedupKey:'line-quota:'+businessId+':'+yyyymmdd })` · และเมื่อ `markConnectionError('token_rejected')` → notify `LINE ใช้งานไม่ได้: token ถูกปฏิเสธ` (dedupKey รายวัน)
- `GET …/channels/line` ดึง quota สดตาม §3 หมายเหตุ

### 5.13 สื่อสาธารณะที่เซ็น URL (`media.ts`) — ใช้ร่วมกับ F18

- `signedMediaUrl(fileId, { variant, ttlSeconds })` = `${PUBLIC_BASE_URL}/api/v1/channel-media/${fileId}?exp=<unix>&v=<variant>&sig=<base64url HMAC-SHA256(SESSION_SECRET, fileId + '.' + variant + '.' + exp)>`
- route (auth none): ตรวจ `fileId` uuid, `exp > now`, `v ∈ {original, preview, square}`, `sig` ด้วย `timingSafeEqual` · `assertRateLimit({ key:'channel-media:'+fileId, limit: 60, windowSeconds: 60 })` · ทุกความผิดพลาด = 404 รูปแบบเดียวกัน (ไม่บอกสาเหตุ) · `SELECT business_id FROM files WHERE id = $1` แล้ว `storage.read(fileId, { businessId })` · ต้องเป็นไฟล์ที่ผ่านการอัปโหลดของ business นั้น (ตรวจโดย storage)
- `original`: ถ้าเป็น jpeg/png และ ≤ 9 MB และด้านยาว ≤ 4096 → ส่งตามเดิม · มิฉะนั้นแปลงด้วย `sharp` เป็น jpeg (`rotate()` ตาม EXIF, `resize` ด้านยาว ≤ 4096, quality 85) · `preview`: ด้านยาว 240, jpeg, ≤ 1 MB · `square`: 800×800 `fit:'contain'` พื้นขาว jpeg quality 80 (การ์ดสินค้า LINE/Meta)
- ชนิดที่ไม่ใช่รูป (`file` part) ส่ง `Content-Disposition: attachment` และ `X-Content-Type-Options: nosniff`
- `Cache-Control: public, max-age=300`

## 6. AI calls

**ไม่มี AI call** ใน F17 · คำตอบทั้งหมดมาจาก job `ai.reply` ของ B2 ที่เรียก `sendToCustomer` · ข้อความของระบบ (หมดอายุ, ฟังเสียงไม่ได้, ผลยืนยัน) เป็นข้อความคงที่ในโค้ด

Stretch (ทำเมื่อ F17/F18 เป็น R แล้วและมีเวลา · ตัดสินโดย C2): ข้อความเสียงขาเข้า → หลังบันทึก attachment ใน `line.event` ให้ `model.transcribe({ audio: { uploadRef: fileId, filename: 'voice.m4a' }, languages: ['th'] }, usage { featureId:'F17', purpose:'transcribe', businessId, conversationId })` ตามรูปแบบใน [docs/openai-api.md §10.7](../openai-api.md#107-ถอดเสียงจากไฟล์-ข้อความเสียงในแชต) แล้วบันทึก transcript เป็น `saveMessage` ข้อความ text ถัดจาก attachment (`externalId = message.id + ':t'`, `triggerAi` ค่าเริ่มต้น) · ล้ม = คงพฤติกรรมเดิม (ข้อความแจ้ง §5.4.1) · test ด้วย fake (`[fake-transcript] voice.m4a`)

## 7. UI

Route `/channels` · `permission: 'business.read'` · `titleKey: 'line:page.title'` · เมนู `{ path:'/channels', labelKey:'line:menu.title', group:'settings', icon:'ChatOutlined', order:20, permission:'business.read', searchTerms:['line','ไลน์','ช่องทาง','channel','webhook'] }` · หน้า `LineChannelPage.tsx` ใช้ UI kit ของ core · ปุ่มเปลี่ยนแปลงต้องมี `business.channels` (`useCan`; ไม่มี = อ่านอย่างเดียวพร้อมข้อความบอก)

ส่วนของหน้า:
1. `PageHeader` "ช่องทาง LINE" + ลิงก์ไป `/channels/meta` (Messenger/Instagram) ถ้า F18 ไม่ถูกซ่อน (`useApiQuery('/features')`)
2. `SectionCard` สถานะ: `StatusChip` (เชื่อมต่อแล้ว / ต้องแก้ไข / ยังไม่เชื่อมต่อ) · ชื่อ OA + Basic ID + Channel ID · เวลาที่รับ event ล่าสุด · จำนวน event รวม · `mode` ถ้าเป็น `sandbox` แสดง Alert "โหมดทดสอบ: ไม่ส่งข้อความจริงไป LINE" (ห้ามติดป้ายนี้เมื่อ real) · ปุ่ม "ตรวจสอบการเชื่อมต่อ" (`POST verify`) · ปุ่ม "ตัดการเชื่อมต่อ" (`ConfirmDialog`)
3. `SectionCard` เพิ่มเพื่อน: QR (`addFriendQrDataUrl`) + ลิงก์ `addFriendUrl` + ปุ่มคัดลอก
4. `SectionCard` ตั้งค่า webhook: แสดง `webhookUrl` + ปุ่มคัดลอก + รายการขั้นตอนใน Console (ตัวหนังสือจาก i18n; ตรงกับ §15 ท้ายไฟล์ "ขั้นตอนบน LINE Developers Console") + Alert เตือนถ้า `PUBLIC_BASE_URL` ไม่ใช่ `https://`
5. `FormDialog` "เชื่อมต่อ LINE OA": Channel ID, Channel secret (password), Channel access token (password, ไม่บังคับ + คำอธิบาย) · ข้อผิดพลาดจาก `POLICY_BLOCKED.details.reason` แสดงข้อความเฉพาะ
6. `SectionCard` การใช้ Push: ใช้เดือนนี้ (`calls`/`messages` ของเรา) + โควตาจาก LINE (ถ้ามี) + หมายเหตุ "ตอบภายใน 50 วินาทีใช้ reply (ไม่นับโควตา) หลังจากนั้นใช้ Push"
7. `DataTable` "เหตุการณ์ล่าสุด" (`GET events`): เวลา, ชนิด, ชนิดข้อความ, ส่งซ้ำ (chip), สถานะ, หมายเหตุ · ไม่แสดงเนื้อหาข้อความ
8. `useRealtime('custom', e => e.featureId==='F17' && reload())`
9. states: loading (skeleton), error (`EmptyState` + ลองใหม่), ยังไม่เชื่อมต่อ = `EmptyState` พร้อมปุ่ม "เชื่อมต่อ LINE OA"

i18n namespace `line` (th / en):

| key | th | en |
|---|---|---|
| `menu.title` | ช่องทาง LINE | LINE channel |
| `page.title` | ช่องทาง LINE | LINE channel |
| `page.subtitle` | เชื่อม LINE Official Account ให้ลูกค้าคุยกับ AI และทีมงานผ่าน LINE | Connect a LINE Official Account so customers can chat with the AI and your team |
| `status.active` | เชื่อมต่อแล้ว | Connected |
| `status.error` | ต้องแก้ไข | Needs attention |
| `status.none` | ยังไม่เชื่อมต่อ | Not connected |
| `status.reason.token_rejected` | LINE ปฏิเสธ token กรุณาออก token ใหม่แล้วเชื่อมต่อใหม่ | LINE rejected the token. Issue a new one and reconnect |
| `status.reason.bot_changed` | OA ที่เชื่อมต่อไม่ตรงกับเดิม กรุณาเชื่อมต่อใหม่ | The connected OA changed. Please reconnect |
| `sandbox.notice` | โหมดทดสอบ: ระบบไม่ส่งข้อความจริงไป LINE | Sandbox mode: messages are not sent to LINE |
| `info.channelId` | Channel ID | Channel ID |
| `info.basicId` | Basic ID | Basic ID |
| `info.lastEvent` | รับข้อความล่าสุด | Last event received |
| `info.eventsTotal` | จำนวนเหตุการณ์ที่รับ | Events received |
| `info.never` | ยังไม่เคยรับ | Never |
| `actions.connect` | เชื่อมต่อ LINE OA | Connect LINE OA |
| `actions.verify` | ตรวจสอบการเชื่อมต่อ | Check connection |
| `actions.disconnect` | ตัดการเชื่อมต่อ | Disconnect |
| `actions.copy` | คัดลอก | Copy |
| `connect.title` | เชื่อมต่อ LINE Official Account | Connect a LINE Official Account |
| `connect.channelId` | Channel ID | Channel ID |
| `connect.channelSecret` | Channel secret | Channel secret |
| `connect.accessToken` | Channel access token (ไม่บังคับ) | Channel access token (optional) |
| `connect.accessTokenHelp` | ไม่ใส่ก็ได้ ระบบจะขอ token ชั่วคราวเอง | Optional. The system will request a short-lived token itself |
| `connect.replaceWarning` | ร้านนี้มี OA อื่นเชื่อมอยู่ การเชื่อมต่อใหม่จะแทนที่ของเดิม | Another OA is connected. Connecting will replace it |
| `connect.success` | เชื่อมต่อแล้ว อย่าลืมตั้งค่า webhook ใน LINE Developers Console | Connected. Remember to set the webhook in LINE Developers Console |
| `connect.err.channel_in_use` | OA นี้ถูกใช้กับร้านอื่นอยู่ | This OA is already used by another shop |
| `connect.err.credentials_rejected` | LINE ไม่รับ Channel ID/secret/token นี้ | LINE rejected these credentials |
| `connect.err.provider` | ติดต่อ LINE ไม่ได้ ลองใหม่อีกครั้ง | Could not reach LINE. Try again |
| `disconnect.title` | ตัดการเชื่อมต่อ LINE? | Disconnect LINE? |
| `disconnect.message` | ข้อความที่รอส่งจะไม่ถูกส่ง และลูกค้าจะทักผ่าน LINE ไม่ได้จนกว่าจะเชื่อมใหม่ | Pending messages will not be sent and customers cannot reach you on LINE until you reconnect |
| `friend.title` | เพิ่มเพื่อน | Add as friend |
| `friend.help` | ให้ลูกค้าสแกน QR นี้เพื่อคุยกับร้าน | Customers scan this QR to chat with the shop |
| `webhook.title` | ตั้งค่า Webhook | Webhook setup |
| `webhook.url` | Webhook URL | Webhook URL |
| `webhook.httpsWarning` | PUBLIC_BASE_URL ไม่ใช่ https LINE จะไม่รับ URL นี้ | PUBLIC_BASE_URL is not https; LINE will not accept this URL |
| `webhook.step1` | เปิด LINE Developers Console เลือก Provider และช่อง Messaging API ของ OA นี้ | Open LINE Developers Console and select this OA's Messaging API channel |
| `webhook.step2` | แท็บ Messaging API: ที่ Webhook URL กด Edit วาง URL ด้านบน กด Update | On the Messaging API tab, edit Webhook URL, paste the URL above, press Update |
| `webhook.step3` | กด Verify ต้องขึ้น Success แล้วเปิด Use webhook | Press Verify (must show Success), then turn on Use webhook |
| `webhook.step4` | ปิด Auto-reply messages และ Greeting messages ใน LINE Official Account Manager | Turn off Auto-reply and Greeting messages in LINE Official Account Manager |
| `usage.title` | การใช้ Push เดือนนี้ | Push usage this month |
| `usage.mine` | เราส่ง Push {{messages}} ข้อความ ({{calls}} ครั้ง) | We sent {{messages}} push messages ({{calls}} calls) |
| `usage.line` | โควตาจาก LINE: ใช้ {{used}} / {{value}} | LINE quota: {{used}} of {{value}} used |
| `usage.note` | ตอบภายใน 50 วินาทีใช้ reply (ไม่นับโควตา) หลังจากนั้นใช้ Push | Replies within 50 seconds are free; later answers use Push (counts toward quota) |
| `events.title` | เหตุการณ์ล่าสุด | Recent events |
| `events.time` | เวลา | Time |
| `events.type` | ชนิด | Type |
| `events.redelivery` | ส่งซ้ำ | Redelivery |
| `events.state` | สถานะ | State |
| `events.note` | หมายเหตุ | Note |
| `events.empty` | ยังไม่มีเหตุการณ์ | No events yet |
| `readOnly` | คุณดูได้อย่างเดียว ต้องมีสิทธิ์จัดการช่องทาง | View only. You need the channels permission to change this |
| `error.retry` | ลองใหม่ | Retry |

## 8. Jobs, schedules, events

| รายการ | ค่า |
|---|---|
| Job `line.event` | payload `{ connectionId, event, receivedAtMs }` · dedupKey `line.event:<webhookEventId>` · lockKey `line:<connectionId>:<userId>` · `maxAttempts: 5` · ล้มถาวรแล้วบันทึก placeholder (§5.2 ข้อ 5) |
| Schedule `line.maintenance` | `everySeconds: 600` · env bootstrap + cleanup (§5.10) |
| Core `core.deliver` (ของ core) | เรียก sender ของเรา · เราไม่ลงทะเบียน job ส่งเอง |
| Realtime | `publish(businessId, { type:'custom', featureId:'F17', name:'line.connection.changed', data:{} })` เมื่อ connect/disconnect/verify/สถานะ error เปลี่ยน · ข้อความเข้าเป็นหน้าที่ของ `saveMessage` |
| Audit | `line.connect` · `line.disconnect` · `line.verify` (เฉพาะสถานะเปลี่ยน) · `line.connection.error` (`actorUserId: null`) |
| notify | โควตา Push เต็ม · token ถูกปฏิเสธ · event ล้มถาวร (ทั้งหมด `type:'system'`, ผู้รับ owners, dedupKey รายวัน) |
| `model_usage` | ไม่มี |

## 9. Seed และ fixtures

`seed.ts` (`FeatureSeed`, `dependsOn: ['core']`): **ไม่ seed แถวใน `line_connections`** (ผูกด้วย env bootstrap §5.10 เท่านั้น เพื่อไม่ให้มี OA ปลอมบน production) · `runDemo`/`resetDemo`: ไม่มี (ไม่เก็บข้อมูลธุรกรรมที่ reset ได้; `line_events` เก่าถูกลบโดย retention)

Fixtures ใน test (สร้างด้วยโค้ด): 
- `signLine(secret, rawBody)` helper (HMAC base64) ใน `test-helpers.ts` · connection ทดสอบ: `channelId '1234567890'`, secret สุ่ม 32 hex, `bot_user_id 'U' + 'a'.repeat(32)`, ผูกกับ `biz_demo_a` ด้วย `connect` ใน `LINE_MODE=sandbox`
- payload ตัวอย่างต่อชนิด: text, image (`contentProvider.type='line'`), sticker, audio, file, location, follow, unfollow, postback (ข้อความ + `nl:a:`), redelivery (`isRedelivery:true`), กลุ่ม (`source.type='group'`), events ว่าง · `webhookEventId` = `01TESTEVENT` + running number (ไม่ซ้ำกันระหว่าง test)
- `lineApi.ts` รับ `fetch` ที่ฉีดได้: test ใช้ fetch ปลอมบันทึก request (ตรวจ URL/header/body ของ reply, push, loading, profile, content) และตอบตามสถานการณ์ (400 invalid reply token, 409 retry key, 429 monthly limit)
- ลูกค้าและ externalId ใหม่ต่อ test (`U` + uuid hex); ไม่แก้แถว SEED

## 10. Tests

Unit/service/route (`MODEL_MODE=fake`, `LINE_MODE=sandbox`, fetch ปลอม, `CLOCK_FIXTURE`):

| ไฟล์ | case |
|---|---|
| `webhook.test.ts` | ลายเซ็นถูก → 200 + มี job · ลายเซ็นผิด/ไม่มี/header ซ้ำสองค่า → 401 และ **ไม่มีแถวใน `line_events`/jobs** · body เปลี่ยน 1 byte หลังเซ็น → 401 · `channelId` ที่ไม่รู้จัก → 200 ไม่มีอะไรเกิด · connection `inactive` → 200 ไม่มี job · business `suspended`/`deleted` → 200 ไม่มี job · `destination` ไม่ตรง → 200 ไม่มี job · `events: []` → 200 · body > 1 MB → 413 · เกิน rate limit → 429 · ลายเซ็นผิดเกิน 30 ครั้ง/นาที → 429 · webhookEventId ซ้ำ (ส่งสองครั้ง) → job เดียว · enqueue ล้ม (mock) → 500 · ใช้ `timingSafeEqual` (ตรวจด้วย spy หรือ test ความยาวไม่เท่าไม่ throw) |
| `events.test.ts` | text → `saveMessage` ถูกเรียกด้วย `customer.channel 'line'`, `externalId = message.id`, `providerMeta.replyToken` + `replyTokenExpiresAt` = receivedAt+50s · `created:false` → ไม่มี loading animation · AI เปิด+ไม่ takeover → เรียก loading (`chatId`, `loadingSeconds 30`) · takeover หรือ `aiEnabled=false` → ไม่เรียก · loading ล้ม (500/timeout) → event ยังสำเร็จ · image → ดาวน์โหลดจากโฮสต์ `api-data.line.me` เท่านั้น (ตรวจ URL ที่ fetch) → `storage.save` → `ImagePart` · image `contentProvider.external` → ไม่ fetch URL ภายนอก · content 404 → job retry ไม่บันทึกครึ่งทาง · content 3xx → ล้ม · ไฟล์ใหญ่เกิน → text placeholder · sticker → `triggerAi:false` · audio → FilePart + ข้อความแจ้งครั้งเดียวต่อชั่วโมง · location → text พิกัด · follow/unfollow → `line_contacts` เปลี่ยน ไม่มีข้อความ · group source → `ignored` · event เก่า 3 วัน → `stale` · profile ล้ม → ใช้ชื่อ `LINE user` · ล้มถาวร → placeholder + notify |
| `postback.test.ts` | data เป็นข้อความ → ข้อความลูกค้าปกติ (`externalId 'pb:'`) · `nl:a:` confirm order → `createOrderFromProposal` stage confirm ถูกเรียกด้วย `reviewToken` ที่ถอดรหัสแล้ว, `actor.kind 'customer'`, `clientRequestId 'line-action:<id>'` · กดซ้ำ → `replayed` → ข้อความ "ยืนยันไปแล้ว" · booking → `createBooking` · action หมดอายุ → ข้อความหมดอายุ · ผู้กดไม่ใช่เจ้าของ conversation → ไม่เรียก owner · action ของ business อื่น → ไม่พบ · แต่ละ error code (`PROPOSAL_EXPIRED`, `VERSION_CONFLICT`, `SOLD_OUT`, `SLOT_FULL`, `SERVICE_NOT_READY`) → ข้อความตาม §5.7 · `data` > 300 → ข้าม |
| `sender.test.ts` | ข้อความที่ inbound อายุ 10 วินาที → เรียก **reply** (1 call, 1 token) · อายุ 49 วินาที → reply · อายุ 51 วินาที → **push** · ไม่มี token → push · token ใช้แล้ว (ตารางมีแถว) → push · reply คืน 400 `Invalid reply token` → fallback push (batch เดียวกัน) · reply 400 ชนิดอื่น → failed ไม่ push · parts ที่แตกเป็น 7 ข้อความ → 2 call (reply 5 + push 2) · retry หลังล้ม batch 2 → ไม่ส่ง batch 1 ซ้ำ · push ใส่ `X-Line-Retry-Key` ที่คงที่ต่อ (message, batch) · push 409 → accepted ไม่นับ usage ซ้ำ · push 429 monthly limit → failed ไม่ retry + notify หนึ่งครั้ง/วัน · 429 rate → retryable · 5xx → retryable · timeout ของ reply/push → `unknown` ไม่ส่งต่อ · 401 → connection `error` + notify · ไม่มี connection (disconnect แล้ว) → `CHANNEL_NOT_CONNECTED` ไม่เรียก LINE · ผู้ใช้ unfollow → `recipient_unfollowed` · `recordPush` นับ calls/messages · error string ไม่มี token |
| `outbound.test.ts` | text 10 000 ตัว → 3 ก้อน ≤ 4 800 ไม่ตัดกลาง emoji · image → URL เซ็น 2 แบบ (original/preview) https · `PUBLIC_BASE_URL` http → `public_url_not_https` · product_card 3 ใบ → carousel + hero + ปุ่ม `สนใจ` (ไม่มีปุ่มเมื่อ soldOut) · 12 ใบ → 2 ข้อความ · order_review → bubble มี 2 ปุ่ม และ `line_actions` 2 แถวที่ `review_token_enc` ไม่ใช่ plain · booking_review · action_buttons ไม่มี text ปุ่ม postback 5 อัน → quick reply แนบข้อความสุดท้าย (label ≤ 20) · มี link http → ปุ่มถูกข้าม · ป้ายยาว 30 ตัว → ตัด 20 · flex เกิน 45 000 byte → ลดจำนวน · altText ≤ 400 · parts เกิน 15 ข้อความ → `too_many_parts` |
| `connection.test.ts` | connect (sandbox) สำเร็จ + view มี `webhookUrl` และไม่มี secret/token ใน JSON ทั้งก้อน · OA เดียวกันใน business อื่น → `channel_in_use` · business เดียวกันคนละ OA → ตัวเก่า `inactive` · secret/token ถูกเข้ารหัส (`enc:v1:` ใน DB) · real mode (fetch ปลอม): info 401 → `credentials_rejected` · disconnect → ล้าง secret/token, webhook ใหม่ถูกเพิกเฉย · verify `userId` เปลี่ยน → `error` · env bootstrap สร้าง connection ให้ `biz_demo_a` ครั้งเดียว ไม่ทับของ `ui` · staff ไม่มี `business.channels` → 403 ทุก mutation · ร้าน B อ่าน connection ร้าน A ไม่ได้ |
| `media.test.ts` | URL เซ็นถูก → ได้ไฟล์ · `sig` ผิด/`exp` หมด/variant แปลก → 404 · ไฟล์ของ business อื่นไม่หลุด (storage คืน null → 404) · png 6000 px → ถูกลดเหลือ ≤ 4096 · `square` ได้ 800×800 · rate limit |

Playwright smoke `web/src/features/line/e2e/line.smoke.spec.ts` (production-safe; ไม่ส่งข้อความหาคนจริง):
1. `ownerPage` เปิด `/channels` → เห็นสถานะ "เชื่อมต่อแล้ว" ชื่อ OA และ webhook URL ที่ลงท้าย `/webhooks/line/<channelId>` (ต้องมี connection ของ *NLess Demo* จาก env bootstrap)
2. กด "ตรวจสอบการเชื่อมต่อ" → toast สำเร็จ (เรียก LINE `bot/info` จริงจาก production) และ `lastVerifiedAt` เปลี่ยน
3. ด้วย fixture `api` (ไม่ login): `POST /webhooks/line/<channelId>` ด้วย body ว่าง `{"destination":"x","events":[]}` ไม่มีลายเซ็น → **401** · และ `POST /webhooks/line/9999999999` → **200**
4. ตาราง "เหตุการณ์ล่าสุด" แสดงผลโดยไม่ error (หลักฐานรับข้อความจริงทำด้วยมือ ดู §11)
5. (ไม่ทำใน smoke) ส่งข้อความจริงจากมือถือ · จดผลลง `EVIDENCE.md` เป็นแถว manual

## 11. Acceptance: R ตาม D6

- [ ] webhook จริง: ลายเซ็นผิดได้ 401; event ซ้ำ/redelivery ได้ข้อความเดียวและตอบครั้งเดียว; OA ไม่รู้จัก/ร้านไม่ active ได้ 200 และไม่สร้างข้อความ (test ทุกข้อใน §10 `webhook.test.ts`)
- [ ] **หลักฐานจริงบน production (ต้องทำด้วยมือและจดใน `EVIDENCE.md`: เวลา, sha, ชื่อบัญชีทดสอบแบบย่อ ไม่ใส่ userId/ข้อความ):** (a) เพื่อนในทีมส่งข้อความหา OA *NLess Demo* → เห็นใน inbox ของร้าน A ภายใน 5 วินาที → AI ตอบกลับใน LINE (b) ตอบช้าเกิน 50 วินาที (จำลองโดยหน่วงใน test หรือใช้คำถามที่ AI ใช้เวลานาน) ถูกส่งด้วย Push สำเร็จ (c) ส่งรูป/สติกเกอร์ถูกบันทึก (d) การ์ดสินค้าและสรุปออเดอร์แสดงเป็น Flex ที่กดปุ่มได้ (e) กดยืนยันจริง → ออเดอร์ถูกสร้าง (เมื่อ F13 merge) (f) disconnect แล้วข้อความใหม่ไม่ตอบ + reconnect กลับมาใช้ได้
- [ ] sender แสดงสถานะ `delivery` ตามจริง: `sent` เฉพาะเมื่อ LINE ตอบ 200/409 · `failed`/`unknown` ปรากฏใน inbox ของ F09 (ไม่ใช่ "ส่งแล้ว" ปลอม) · mode `real`
- [ ] secret/token เข้ารหัสใน DB, ไม่ออก API/log/audit (test + ตรวจ log ของ run ด้วย `grep` ว่าไม่มี token)
- [ ] Push ถูกนับและแสดง · quota เต็มแจ้งเจ้าของหนึ่งครั้ง/วัน
- [ ] UI ครบ loading/empty/error, i18n th/en, permission + tenant ตรวจ (route test), audit connect/disconnect
- [ ] Playwright smoke ผ่านบน production
- **S:** webhook + sender ทำงานได้กับ fixture/`LINE_MODE=sandbox` แต่ OA จริงยังไม่รับข้อความ · **A:** มีเฉพาะ replay ของ payload ที่เซ็น · **ไม่ถึง R ตอน 15:30:** หน้า `/channels` ถูกซ่อน แต่ webhook ยังตอบ (core ซ่อนเฉพาะเว็บ) ให้รายงานตามจริง

## 12. Security และ privacy

- **ลายเซ็น:** `x-line-signature` เทียบกับ HMAC-SHA256 ของ raw bytes ด้วย secret ของ connection นั้น, `timingSafeEqual`, ก่อน parse JSON หรือแตะ DB นอกจากหา connection · ไม่มี secret ใน path/query · parse JSON เฉพาะ bytes ที่ผ่านลายเซ็น
- **Tenant:** หา business จาก `channelId` ใน path → `line_connections.business_id` แล้วยืนยันด้วย `destination` (ไม่เคยอ่าน business จากข้อความหรือ payload ที่ผู้ใช้ควบคุม) · ทุก query มี `business_id` · `line_actions` ผูก `business_id` + เจ้าของ conversation
- **Replay:** ลายเซ็น LINE ไม่มี timestamp จึงกันด้วย `webhookEventId` (PK) + job dedupKey + `externalId` ของข้อความ + `EVENT_MAX_AGE_MS` · reply token ใช้ครั้งเดียว (ตาราง `line_reply_tokens_used`)
- **Token/secret:** ผ่าน `encryptSecret` เท่านั้น · decrypt ใน memory ตอนใช้ · ไม่ log, ไม่อยู่ใน job payload (job เก็บ `connectionId`), ไม่อยู่ใน `audit.details`, ไม่อยู่ใน response ของ API (มีแค่ `hasAccessToken`) · logger redact `authorization`, `x-line-signature`
- **SSRF:** โหลดสื่อจาก `api-data.line.me` ที่ฮาร์ดโค้ดเท่านั้น ไม่ตาม redirect, ไม่รับ URL ใน payload (`contentProvider.external` ถูกเมิน) · URL สื่อขาออกเป็นของเราเอง (เซ็นด้วย `SESSION_SECRET`, TTL, rate limit) ไม่ใช่ URL ที่ลูกค้า/โมเดลให้มา · ปุ่ม `link` ต้อง https และมาจากเซิร์ฟเวอร์ (ตาม contracts `ActionButtonsPart`)
- **ปุ่มยืนยัน:** consent ของลูกค้า = การกดปุ่ม postback ที่ผูก `line_actions` ฝั่งเซิร์ฟเวอร์ (ไม่ใช่ข้อความที่โมเดลพิมพ์) · `reviewToken` ไม่ออกไปถึง LINE · ตรวจเจ้าของ conversation ก่อนเรียก F13/F15
- **Rate limit:** `assertRateLimit` ที่ webhook (ต่อ channel) และ media route (ต่อไฟล์)
- **PII:** ไม่ log ข้อความ, `userId`, ชื่อลูกค้า ระดับ info ขึ้นไป (log ใช้ `connectionId`, `webhookEventId`, ชนิด event) · `line_events` ไม่เก็บเนื้อหา · เก็บ 14 วัน
- **บัญชีทดสอบเท่านั้น:** OA *NLess Demo/Dev* ของทีม · ห้ามเชื่อม OA ของคนอื่น/ร้านจริง

## 13. Edge cases

| กรณี | ผลที่ต้องได้ |
|---|---|
| LINE ส่ง event สองครั้ง (redelivery) | ข้อความเดียว ตอบครั้งเดียว (`line_events` + dedupKey + `externalId`) |
| ลูกค้าส่ง 3 ข้อความรัว ๆ | เรียงตามลำดับด้วย lockKey; แต่ละข้อความได้ `ai.reply` ของตัวเอง (พฤติกรรมของ B2); reply token ของข้อความล่าสุดเท่านั้นที่ใช้ได้ (token เก่าถูกใช้ไปแล้ว/หมดอายุ → push) |
| AI ตอบ 2 ข้อความติดกันจาก inbound เดียว (เช่น staff + AI) | ข้อความแรกใช้ reply token ข้อความที่สองใช้ push (token ใช้แล้ว) |
| ตอบหลัง 50 วินาที | push ทันที (ไม่ลอง reply) นับโควตา |
| reply token ยังไม่หมดตามเวลาเรา แต่ LINE ว่าหมด | 400 → fallback push อัตโนมัติ |
| OA ใช้ push เต็มโควตาเดือน | `failed` `line_quota_exhausted` ไม่ retry; reply ยังทำงานภายใน 50 วินาที; แจ้งเตือนเจ้าของวันละครั้ง |
| ผู้ใช้บล็อก OA แล้วกลับมา | `unfollow` → ส่งไม่ได้ (`recipient_unfollowed`); ข้อความใหม่/`follow` → `is_following=true` |
| ร้านถูกลบ (F03) แต่ LINE ยังส่ง event | 200 ไม่ประมวลผล ไม่สร้างข้อความ |
| ตัดการเชื่อมต่อระหว่างมี `core.deliver` ค้าง | `CHANNEL_NOT_CONNECTED` ไม่ retry, ไม่เรียก LINE |
| เปลี่ยน Channel secret ใน Console | ลายเซ็นไม่ผ่าน → 401 ต่อเนื่อง → หน้า UI เห็น `lastEventAt` ไม่ขยับ; แก้โดย connect ใหม่ด้วย secret ใหม่ |
| tunnel (Dev) เปลี่ยน URL | ต้องอัปเดต Webhook URL ใน Console ของ *NLess Dev* (ไม่กระทบ Demo) |
| ส่งรูปพร้อมกัน 5 รูป | 5 event, 5 ข้อความ ลำดับตาม lockKey |
| รูปเป็น HEIC/ชนิดแปลก | `sharp.metadata` ไม่ใช่ jpeg/png/gif/webp → บันทึกเป็น FilePart `application/octet-stream` + text `[รูปภาพ]` |
| ข้อความมี emoji ของ LINE (`(emoji)` placeholder) | เก็บ text ตามที่ได้ (ไม่แปลง) |
| ปุ่มกดหลังหมดอายุ/ถูก reset | ข้อความ "หมดอายุแล้ว" ไม่สร้างออเดอร์ |
| Flex เกินขนาด | ลดจำนวนการ์ด/ตัดบรรทัด/ถอยเป็น text altText |
| `PUBLIC_BASE_URL` เป็น http (dev) | ส่งข้อความ text ได้; รูป/ไฟล์ล้มด้วย `public_url_not_https` พร้อมคำอธิบาย |
| LINE ตอบ 5xx ตอน reply | `failed` retryable; รอบถัดไปมักใช้ push (token ใช้แล้วหรือหมดอายุ) |

## 14. Build order (slices ≤ 45 นาที)

| Slice | เวลา | ส่งมอบ | หมายเหตุ |
|---|---|---|---|
| **S1 gate: webhook + inbound + sender text** | 40 | migration (`line_connections`, `line_events`, `line_contacts`, `line_reply_tokens_used`, `line_delivery_batches`, `line_push_usage`) · `connection.ts` (connect/verify/disconnect + env bootstrap) · `webhook.ts` (§5.1) · job `line.event` สำหรับ text/follow/unfollow/sticker · profile · loading animation · `sender.ts` ส่ง **text** ด้วย reply/push + token + fallback + retry key + usage · `registerChannelSender('line')` · routes connect/verify/disconnect/GET · tests webhook/events/sender/connection (เฉพาะส่วนนี้) | **เป้า merge ก่อน 12:15** (gate 13:00 รอ) · ทำ `PUBLIC_BASE_URL` + *NLess Demo* webhook ตามคู่มือท้ายไฟล์ทันทีหลัง deploy |
| **S2 UI + สื่อ + postback** | 40 | หน้า `/channels` เต็ม (QR, webhook URL, steps, events, usage) · i18n · image inbound (§5.5) · `media.ts` + route · image/file outbound · `actions.ts` postback ข้อความ + `nl:a:` · test `postback`/`media` | |
| **S3 Flex และความทนทาน** | 35 | `flex.ts`: product_card, order_review, booking_review, action_buttons, quick reply · batch >5 · audio notice · stale/group/placeholder · `outbound.test.ts` · Playwright smoke + `EVIDENCE.md` (แถว manual ของ (a)–(f)) | |

หลัง S1 โพสต์ `DONE F17 line merged <sha>` แท็ก `TO:B2 TO:A1 TO:C1` (core loop ผ่าน LINE ได้) · หลัง S2 ตรวจ (a)(b)(c) ด้วยมือกับ OA จริงแล้วจึงโพสต์ `STATUS C2 F17 R` · ช่วง 12:30–13:00 ห้าม merge อะไรที่เสี่ยงต่อ webhook

## 15. UNCONFIRMED และสิ่งที่ต้องตรวจในวันงาน

ตรวจกับเอกสารทางการ https://developers.line.biz/en/reference/messaging-api/ (ผู้เขียน spec เข้าถึงได้เพียงสารบัญของหน้า จึงเขียนจากความรู้เดิม ข้อต่อไปนี้ต้องยืนยันก่อนหรือระหว่าง S1):

1. **ชื่อ header/ขั้นตอนลายเซ็น** `x-line-signature` = base64 ของ HMAC-SHA256(raw body, channel secret): ตรวจหัวข้อ "Signature validation" · ยืนยันด้วยการกด Verify ใน Console + ส่งข้อความจริงหนึ่งครั้ง
2. **Stateless channel access token:** endpoint `POST https://api.line.me/oauth2/v3/token` (`grant_type=client_credentials`, `client_id`, `client_secret`) อายุประมาณ 15 นาที — ตรวจหัวข้อ "Issue stateless channel access token" · ถ้าไม่ตรง ให้ตัดการรองรับ stateless และบังคับกรอก `accessToken` (long-lived จากแท็บ Messaging API → Channel access token → Issue)
3. **Endpoint ที่ใช้:** `POST /v2/bot/message/reply`, `POST /v2/bot/message/push`, `POST /v2/bot/chat/loading/start`, `GET /v2/bot/profile/{userId}`, `GET /v2/bot/info`, `GET https://api-data.line.me/v2/bot/message/{id}/content`, `GET /v2/bot/message/quota` และ `/quota/consumption` · ตรวจ path และชื่อ field ตอบกลับ (`sentMessages[].id`, `userId`, `basicId`, `displayName`)
4. **Reply token:** D13 กำหนดใช้ได้ถึง ~50 วินาที (ค่าจาก know-how) — ตรวจข้อความในเอกสาร "Reply token" ว่าเวลาเปลี่ยนไหม · ข้อความ error 400 ของ token หมดอายุมีคำว่า `reply token` จริงหรือไม่ (ทดสอบจริง: รอ >60 วินาทีแล้วเรียก reply ด้วย token เดิมหนึ่งครั้งในเครื่อง dev) · ถ้าข้อความต่างจากที่คาด ปรับ matcher ใน `sender.ts` ให้ถือ **ทุก 400 ของ reply ที่ batch ยังไม่ accepted** เป็น "ลอง push ต่อ" (ยอมรับเสี่ยงซ้ำ 0 เพราะ reply 400 = ไม่ส่ง)
5. **`X-Line-Retry-Key` และ 409:** header ชื่อนี้ + รูป UUID + 409 พร้อม `x-line-accepted-request-id` · อายุ key (24 ชม.) — ตรวจหัวข้อ "Retry a failed API request"
6. **ข้อจำกัดข้อความ:** text ≤ 5 000, ≤ 5 ข้อความ/call, quick reply ≤ 13 และ label ≤ 20, postback data ≤ 300, altText ≤ 400, bubble ≤ 30 KB, carousel ≤ 50 KB (เราตั้ง 45 000 byte ต่อข้อความ flex), image ≤ 10 MB jpeg/png, preview ≤ 1 MB, carousel ≤ 12 bubble, loading `loadingSeconds` เป็น 5–60 หาร 5 ลงตัว (เฉพาะแชต 1:1) — ตรวจหัวข้อ message objects / flex message / loading indicator
7. **`confirm_proposal` ใน `action_buttons`:** ตอนนี้ปุ่มชนิดนี้ไม่บอกว่าเป็นออเดอร์หรือนัดหมาย (สัญญาไม่มีฟิลด์ kind) · ข้อตกลง: เจ้าของ F10/F13/F15 ส่ง `order_review`/`booking_review` เป็นหลัก · ถ้า B2 ใช้ `action_buttons` + `confirm_proposal` จริง ให้เจรจา `CHANGE TO:C1` เพิ่มฟิลด์ หรือให้ `proposalId` มี prefix บอกชนิด · วิธีตรวจ: อ่าน `ai-agent` ที่ merge แล้วว่าสร้าง part ชนิดไหน
8. **ผลหลังยืนยัน (§5.7):** ข้อความตอบหลังยืนยันเป็นของเรา (fixed text) · ตรวจกับ A2 ว่า F13/F14 ส่งข้อความชำระเงินเอง (ผ่าน `sendToCustomer`) หรือให้ผู้ส่งตอบ — ถ้า A2 ส่งอยู่แล้ว ตัดประโยค "ทีมงานจะส่งรายละเอียดการชำระเงินให้ในแชตนี้ค่ะ" ออก
9. **ผู้ใช้ที่บล็อก OA:** push ไป user ที่บล็อกคืน 200 แต่ไม่ถึง หรือ error? (ไม่ยืนยัน) ตอนนี้ใช้ `unfollow` event เป็นตัวกัน · ตรวจด้วยบัญชีทดสอบ: บล็อก → ส่ง push → ดูผล
10. **ชื่อ env `LINE_MODE`:** ค่าที่ใช้ใน spec คือ `real` | `sandbox` · ตรวจกับ `.env.example` ที่ C1 สร้าง และ `/build-info.providerModes.line` · ถ้า C1 ใช้ค่าอื่น ยึดของ C1
11. **`SESSION_SECRET` ใช้เซ็น URL สื่อ:** F09 ใช้ตัวแปรเดียวกันอยู่แล้ว (ตรวจว่ามีใน production env)
12. **`getBusiness` สถานะ `deleted` ของ F03:** ตอนนี้ตรวจ `businesses.status = 'active'` ตรง ๆ ตาม base schema ของ core · ตรวจกับ C3 ว่า soft delete ตั้งค่านี้จริง (ไม่ใช่ column อื่น)
13. **โควตาข้อความตามเดือน** นับตาม time zone ของ LINE (Asia/Tokyo?) · เราใช้ Asia/Bangkok ในตัวเลขของเรา ส่วนตัวเลขจริงดึงจาก LINE (`lineQuota`)
14. **ติดตั้ง `qrcode` ฝั่ง server** (ติดตั้งแล้วตาม setup) สำหรับ QR เพิ่มเพื่อน: ตรวจ API ที่ใช้ (`QRCode.toDataURL`)

### ขั้นตอนบน LINE Developers Console (ใช้ตอน 12:00 สำหรับ *NLess Demo* และตอนทำ local สำหรับ *NLess Dev*)

เตรียม: ค่า `Channel ID` และ `Channel secret` อยู่แท็บ **Basic settings**; `Channel access token (long-lived)` อยู่แท็บ **Messaging API** (กด Issue) · ใส่ลง `.env.local` (Dev) หรือ Render env (Demo): `LINE_MODE=real`, `LINE_CHANNEL_ID`, `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN` · อย่าแปะค่าลงแชตหรือบอร์ด

**A. *NLess Demo* → production (ครั้งเดียว ประมาณ 12:00 หลัง F17 S1 deploy):**
1. ตรวจ `GET https://<render>/healthz` ได้ ok และ `/build-info` มี `providerModes.line = real`
2. รอ `line.maintenance` (ไม่เกิน 10 นาที) หรือเปิด `/channels` แล้วกด "เชื่อมต่อ" ด้วยมือ → ต้องเห็น "เชื่อมต่อแล้ว" + webhook URL `https://<render>/webhooks/line/<Channel ID>`
3. LINE Developers Console → Provider → ช่อง *NLess Demo* → แท็บ **Messaging API** → ส่วน **Webhook settings** → **Webhook URL** กด Edit → วาง URL → Update
4. กด **Verify** → ต้องขึ้น Success (ถ้า Fail: ดู §13 และ log; ตรวจ `PUBLIC_BASE_URL`, deploy ล่าสุด, ว่า `channelId` ตรงกับค่าใน Basic settings)
5. เปิด **Use webhook** · ที่ **LINE Official Account features** กด Edit → ปิด **Auto-reply messages** และ **Greeting messages** (ไม่งั้นข้อความ OA ปนกับบอท) · (ถ้ามีตัวเลือก) เปิด **Webhook redelivery**
6. ส่งข้อความหา OA จากมือถือของคนในทีม → `/channels` ต้องเห็นเหตุการณ์ `message` สถานะ `done` และเห็นข้อความใน inbox ของร้านเดโม A
7. โพสต์ `DONE F17 …` พร้อมระบุว่า webhook ของ *NLess Demo* ชี้ production แล้ว (ไม่ต้องย้ายกลับ ห้ามชี้ Demo ไปที่เครื่อง dev)

**B. *NLess Dev* → tunnel ของ C2 (ทำงานบนเครื่อง dev):**
1. คน (C) รัน `npm run dev` ใน terminal ของ worktree `..\nless-c2` (API พอร์ต 3002) และรัน tunnel ในอีก terminal เช่น `cloudflared tunnel --url http://localhost:3002` (หรือ ngrok) ได้ URL https เช่น `https://xxxx.trycloudflare.com`
2. แก้ `PUBLIC_BASE_URL=<tunnel URL>` ใน `.env.local` แล้วรีสตาร์ท dev server
3. ใน Console ช่อง *NLess Dev* → Messaging API → Webhook URL = `<tunnel URL>/webhooks/line/<Channel ID ของ Dev>` → Update → Verify → Use webhook เปิด
4. quick tunnel เปลี่ยน URL ทุกครั้งที่เริ่มใหม่: ต้องกลับมาแก้ Webhook URL ใน Console และ `PUBLIC_BASE_URL` ทุกครั้ง · ห้ามใช้ช่อง Dev กับ production DB
