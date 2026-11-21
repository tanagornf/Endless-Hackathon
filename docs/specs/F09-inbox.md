# F09 inbox — กล่องแชต ประวัติ realtime และ Demo Chat

| | |
|---|---|
| Lane / คน | **A1** / **A** · ลำดับ 1 ใน lane (F09 → F11 → F12 → F23) |
| Tier / เป้า | **P0** · เป้า **R** · อยู่บน golden path: CORE-LOOP GATE 13:00 ขั้น 2 (ลูกค้าถามใน Demo Chat), ขั้น 4 (ข้อความทั้งสองฝั่งอยู่ใน inbox หลัง reload) |
| Timebox | 45–90 นาที (S1+S2 = ขั้นต่ำ 45 · S1–S4 ≈ 90) |
| พึ่ง | core (`db`, `jobs`, `sendToCustomer`, `publish`, `storage`, `model.moderate`, `assertRateLimit`, `audit`, `defineFeatureRoutes`) · F04 `getBusinessSettings` (ใช้ `aiEnabled`) · F11 `assignConversation` (staff ส่ง = takeover) · F10 job `ai.reply` (ไม่เรียกตรง แค่ enqueue) · ทุกตัวมี fake ตั้งแต่ setup |
| ให้ | `saveMessage` · `getConversation` · `getHistory` (contracts.ts) · ของใหม่ใน §4: `sendStaffMessage` · `getCustomerLastInboundAt` · `getCustomerLanguage` · `saveChatAttachment` |
| ใช้ | ตาราง core `customers` `conversations` `messages` `files` `jobs` (อ่านอย่างเดียว: `jobs` แถว `ai.reply`) |
| โฟลเดอร์ | `server/src/features/inbox/` · `shared/features/inbox/types.ts` · `web/src/features/inbox/` |
| Web path | `/chat` (กล่องแชต) · `/demo-chat` (ตัวทดสอบฝั่งร้าน) · `/demo-chat/s/:slug` (**หน้าสาธารณะที่กรรมการเปิดบนมือถือ** ไม่ต้องล็อกอิน) · host ของ slot `chatSidePanels` `chatComposerActions` `chatMessageActions` |
| ห้ามหลุด 5 ข้อ | (1) `saveMessage()` เป็นทางเดียวที่ INSERT ตาราง `messages` (2) message id ของ provider ซ้ำ = no-op `created:false` ไม่ enqueue `ai.reply` ซ้ำ (3) ทุก query กรอง `business_id` และ conversation ของร้านอื่น = **404** ไม่ใช่ 403 (4) Demo Chat สาธารณะเสีย key production: ต้องผ่าน rate limit + ความยาว + moderation + เพดานต่อวันก่อนถึง `saveMessage` (5) UI ไม่ render HTML และไม่สร้าง URL จากข้อความลูกค้า/โมเดล |

อ่าน: `contracts.ts` (inbox, MessagePart, RealtimeEvent, channels, rate limit, FeatureRoutes) · [F01-core.md](F01-core.md) §2 (ตาราง `customers` `conversations` `messages`) §4 (realtime, sender `web`) · [openai-api.md](../openai-api.md) §6 · [COOKBOOK](../COOKBOOK.md) §2 §6 §8 §9 · [prompts/README.md](../../prompts/README.md) "Core loop" · know-how เดิม: [porting brief](../porting/F09-inbox.md) (ไม่ต้องใช้ในการสร้าง)

## 1. เป้าหมายและ user stories

ทำไมมี: ทุกข้อความของทุกช่องทางต้องผ่านฟีเจอร์นี้ที่เดียว (บันทึก, กันซ้ำ, สั่ง AI ตอบ) และเจ้าของร้านต้องเห็นบทสนทนาทั้งหมดในที่เดียว นอกจากนี้ Demo Chat คือสิ่งที่กรรมการเปิดบนมือถือของตัวเองบน production URL เพื่อลองคุยกับร้านตัวอย่าง จึงต้องใช้ง่าย สวย อ่านไทยดี และไม่ทำให้งบ OpenAI ของ production หมด

ผู้ใช้: ลูกค้า/กรรมการ (Demo Chat สาธารณะ) · เจ้าของร้านและพนักงาน (inbox, tester) · lane อื่น (เรียก `saveMessage` `getConversation` `getHistory`)

User stories:
1. กรรมการสแกน QR เปิด `/demo-chat/s/demo-boardgame` บนมือถือ ไม่ต้องสมัคร พิมพ์ "A-GAME-01 ราคาเท่าไหร่ครับ" เห็น "กำลังพิมพ์…" แล้วได้คำตอบ AI พร้อมการ์ดสินค้า ปิดแท็บแล้วกลับมายังเห็นแชตเดิม
2. กรรมการกดปุ่ม "ยืนยัน" บนการ์ดสรุปออเดอร์ในหน้า Demo Chat (การยืนยันเป็นการกดของลูกค้า ไม่ใช่ข้อความโมเดล)
3. เจ้าของร้านเปิด `/chat` เห็นรายการแชตแยกตามลูกค้า แชตที่ "รอตอบ" ขึ้นบนสุดพร้อมเวลาที่รอ ข้อความใหม่ขึ้นสดโดยไม่ต้อง refresh
4. เจ้าของเปิดแชต เห็นประวัติเลื่อนดูย้อนหลังเป็นหน้า ไม่ซ้ำ ไม่ตกหล่น ข้อความตอบหลายท่อนของ AI ไม่ถูกตัดกลางหน้า
5. พนักงานพิมพ์ตอบลูกค้าจากเว็บ ระบบรับช่วงแชตจาก AI ให้อัตโนมัติ (บอทเงียบ) และสถานะส่งขึ้น "กำลังส่ง" แล้วเป็น "ส่งแล้ว" หรือ "ส่งไม่สำเร็จ" ตามผลจริงของ sender
6. webhook ของ LINE ส่ง event เดิมซ้ำ ไม่เกิดข้อความซ้ำ ไม่มี job `ai.reply` ที่สอง
7. เจ้าของลองคุยในฐานะลูกค้าจากแท็บ Demo Chat ในแอป และเปิด/ปิดลิงก์สาธารณะ ตั้งข้อความต้อนรับ ดูว่าวันนี้ใช้เพดานไปเท่าไร

นอกขอบเขต: แปลข้อความ/ร่างคำตอบ/template (F12) · takeover, assignment, note, ปิดแชตโดยปุ่ม (F11 — F09 แค่แสดงสถานะและวางปุ่มผ่าน slot) · ถอดเสียงข้อความเสียง (เจ้าของช่องทาง) · `chat.view_all` scoping (ผู้มี `chat.read` เห็นทุกแชตของร้าน — เลือกแบบนี้เพราะเดโมมีพนักงาน 2 คนและ scoping ทำให้รายการว่างดูเหมือนบั๊ก) · สรุปแชตอัตโนมัติ · WebSocket สำหรับผู้เยี่ยมชมสาธารณะ (ดู §5.9 เหตุผล) · แนบไฟล์จากลูกค้าใน Demo Chat (ลูกค้าส่งข้อความตัวอักษรเท่านั้น)

## 2. Data model

ตาราง `customers` `conversations` `messages` อยู่ใน `001_core.sql` (F01 §2) ห้าม ALTER และห้าม CREATE INDEX บนตารางเหล่านั้น · F09 เขียนได้เฉพาะผ่าน `saveMessage()` (INSERT messages, UPDATE คอลัมน์ข้อความของ conversations) และ route read (`unread_count`) · ของ F09 เองมี 2 ตาราง

`server/src/features/inbox/migrations/001_demo_chat.sql`:
```sql
-- dependsOn: core
CREATE TABLE demo_chat_settings (
  business_id uuid PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,                      -- เปิดลิงก์สาธารณะหรือไม่
  public_slug text NOT NULL UNIQUE CHECK (public_slug ~ '^[a-z0-9][a-z0-9-]{2,39}$'),
  welcome_text text CHECK (welcome_text IS NULL OR char_length(welcome_text) BETWEEN 1 AND 300),
  suggested_questions text[] NOT NULL DEFAULT '{}' CHECK (cardinality(suggested_questions) <= 4),
  welcome_text_en text CHECK (welcome_text_en IS NULL OR char_length(welcome_text_en) BETWEEN 1 AND 300),       -- หน้า Demo Chat ภาษาอังกฤษ (null = ข้อความต้อนรับเริ่มต้นของ i18n)
  suggested_questions_en text[] NOT NULL DEFAULT '{}' CHECK (cardinality(suggested_questions_en) <= 4),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- นับ turn ของลูกค้าสาธารณะต่อร้านต่อวัน (วันตาม Asia/Bangkok) ใช้เป็นเพดานงบ: อัปเดตแบบ atomic ใน §5.7
CREATE TABLE demo_chat_daily_turns (
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  day date NOT NULL,
  turns int NOT NULL DEFAULT 0 CHECK (turns >= 0),             -- ข้อความที่รับเข้า (หลังผ่าน moderation)
  blocked int NOT NULL DEFAULT 0 CHECK (blocked >= 0),         -- ถูก moderation / rate limit / เพดาน (ไว้ดูตอนสรุป)
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, day)
);
```
- ไม่มีตารางอ่าน-แล้ว (read state) ต่อผู้ใช้: `conversations.unread_count` เป็นของร้านร่วมกัน (staff คนใดเปิดแชต = 0) เหตุผล: เดโมมีพนักงานน้อย และตาราง per-user ต้องการ index ที่เราสร้างบนตาราง core ไม่ได้
- ผู้เยี่ยมชมไม่มีตารางของตัวเอง: ตัวตน = `customers` แถวเดียวต่อ (ร้าน, `web`, `demo-visitor:<visitorId>`) จึงมี 1 customer + 1 conversation ที่เปิดอยู่ต่อผู้เยี่ยมชมต่อร้านโดยอัตโนมัติ (unique index ของ core) · tester ฝั่งร้านใช้ externalId `demo:<userId>`
- seed: ร้าน A slug `demo-boardgame`, ร้าน B slug `demo-repair` เปิดทั้งคู่ (ดู §9)

## 3. API endpoints

เส้นทางใต้ `/api/v1` · `auth` ตาม `RouteOptions` · error ใช้ `ErrorCode` ของ contracts เท่านั้น · `:conversationId` ที่ไม่มี `:businessId` ใช้ `auth:'user'` แล้ว `ctx.requireBusiness(conv.businessId, key)` **ก่อนอ่านอย่างอื่น** (conversation ไม่มี/ของร้านอื่น/ไม่ใช่สมาชิก = `NOT_FOUND`)

### 3.1 ฝั่งร้าน (inbox)

| Method | Path | auth | permission | Request | Response | Errors |
|---|---|---|---|---|---|---|
| GET | `/businesses/:businessId/conversations` | business | `chat.read` | `ListConversationsQuery` | `Page<InboxRow>` | VALIDATION_ERROR |
| GET | `/businesses/:businessId/conversations/counts` | business | `chat.read` | — | `InboxCounts` | — |
| GET | `/conversations/:conversationId` | user + requireBusiness | `chat.read` | — | `ConversationDetail` | NOT_FOUND |
| GET | `/conversations/:conversationId/messages` | user + requireBusiness | `chat.read` | `HistoryQuery` | `Page<MessageRecord>` | NOT_FOUND, VALIDATION_ERROR |
| POST | `/conversations/:conversationId/read` | user + requireBusiness | `chat.read` | — | `{ unreadCount: 0 }` | NOT_FOUND |
| POST | `/conversations/:conversationId/staff-messages` | user + requireBusiness | `chat.reply` (+ `chat.takeover` เมื่อต้องรับช่วง) | `StaffSendBody` | `SendReceipt` | NOT_FOUND, PERMISSION_DENIED, VERSION_CONFLICT (details.holder), POLICY_BLOCKED (`conversation_closed`), VALIDATION_ERROR |
| POST | `/businesses/:businessId/chat/uploads` | business (multipart `file`, ≤ 1 ไฟล์) | `chat.reply` | form | `ChatAttachment` | VALIDATION_ERROR |
| GET | `/businesses/:businessId/chat/files/:fileId` | business | `chat.read` | — | ไฟล์ (`inline`) | NOT_FOUND |

### 3.2 Demo Chat ฝั่งร้าน (tester + ตั้งค่า)

| Method | Path | auth | permission | Request | Response | Errors |
|---|---|---|---|---|---|---|
| GET | `/businesses/:businessId/demo-chat/settings` | business | `insights.demo` | — | `DemoChatSettingsView` | — |
| PUT | `/businesses/:businessId/demo-chat/settings` | business | `insights.demo` | `DemoChatSettingsBody` | `DemoChatSettingsView` | VALIDATION_ERROR, IDEMPOTENCY_CONFLICT (slug ซ้ำ) |
| GET | `/businesses/:businessId/demo-chat/poll` | business | `insights.demo` | `PollQuery` | `DemoChatPoll` | RATE_LIMITED |
| POST | `/businesses/:businessId/demo-chat/messages` | business | `insights.demo` | `DemoChatSendBody` | `DemoChatSendResult` | VALIDATION_ERROR, RATE_LIMITED |
| POST | `/businesses/:businessId/demo-chat/actions` | business | `insights.demo` | `DemoChatActionBody` | `DemoChatActionResult` | ตาม F13/F15 |
| POST | `/businesses/:businessId/demo-chat/reset` | business | `insights.demo` | — | `{ ok: true }` | — |
| GET | `/businesses/:businessId/demo-chat/files/:fileId` | business | `insights.demo` | — | ไฟล์ | NOT_FOUND |

tester ใช้ handler ชุดเดียวกับสาธารณะ (§5.8) ต่างกันที่ตัวตน (`demo:<userId>`), ไม่มีเพดานรายวันของร้าน, rate limit ต่อ user 30 ข้อความ/นาที

### 3.3 Demo Chat สาธารณะ (auth `none` · ไม่มี session · ไม่มี CSRF cookie เพราะไม่ใช้ cookie session ของแอป)

| Method | Path | Request | Response | Errors |
|---|---|---|---|---|
| GET | `/public/demo-chat/:slug` | — | `DemoChatShopView` | NOT_FOUND (slug ไม่มี หรือ `enabled=false`) |
| POST | `/public/demo-chat/:slug/session` | `{ visitorToken?: string }` | `{ visitorToken: string }` | NOT_FOUND, RATE_LIMITED |
| GET | `/public/demo-chat/:slug/poll` | `PollQuery` + token | `DemoChatPoll` | NOT_FOUND, AUTH_REQUIRED (token ผิด), RATE_LIMITED |
| POST | `/public/demo-chat/:slug/messages` | `DemoChatSendBody` + token | `DemoChatSendResult` | AUTH_REQUIRED, VALIDATION_ERROR, RATE_LIMITED (`details.reason`: `visitor` `ip` `daily_cap` `visitor_daily`), POLICY_BLOCKED (`moderation`) |
| POST | `/public/demo-chat/:slug/actions` | `DemoChatActionBody` + token | `DemoChatActionResult` | AUTH_REQUIRED, ตาม F13/F15 |
| POST | `/public/demo-chat/:slug/reset` | token | `{ ok: true }` | AUTH_REQUIRED |
| GET | `/public/demo-chat/:slug/files/:fileId` | token | ไฟล์ | NOT_FOUND |

token ส่งได้ 2 ทาง (เลือกทางแรกที่มี): cookie `nless_demo_visitor` (หน้าเว็บเขียนเองด้วย `document.cookie`, `SameSite=Lax; Secure; Max-Age=2592000; Path=/`) หรือ header `X-Demo-Visitor` (สำรองเมื่อ cookie ถูกบล็อก เก็บใน memory) · เหตุผลที่เป็น cookie ฝั่ง client: route handler ของ core ตั้ง cookie ไม่ได้ (`RouteContext` ไม่มี `res`) จึงออก token เป็น JSON แล้วให้หน้าเว็บเขียน cookie (ค่าที่ลงนามด้วย HMAC ฝั่ง server ปลอมไม่ได้)

### 3.4 zod และ types (`shared/features/inbox/types.ts` + schema ใน `server/src/features/inbox/schemas.ts`)

```ts
import { z } from 'zod';
export const FILTERS = ['all', 'waiting', 'active', 'closed'] as const;
export const ListConversationsQuery = z.object({
  // ค่า filter ที่ไม่รู้จัก → 'all' ไม่ error (catch)
  filter: z.enum(FILTERS).catch('all').default('all'),
  assignee: z.string().trim().max(40).optional(),      // 'me' | 'unassigned' | <uuid> ; ค่าอื่น → VALIDATION_ERROR ใน handler
  search: z.string().trim().max(120).optional(),
  cursor: z.string().max(300).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export const HistoryQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  before: z.string().max(100).nullish(),
  after: z.string().max(100).nullish(),
}).refine((v) => !(v.before && v.after), { message: 'before and after are exclusive' });
export const StaffSendBody = z.object({
  clientRequestId: z.string().trim().min(8).max(80),
  // text หรือ attachments อย่างน้อยหนึ่งอย่าง; parts ถูกสร้างฝั่ง server ไม่รับ MessagePart ดิบจาก browser
  text: z.string().max(2000).optional(),
  attachments: z.array(z.object({ fileId: z.string().uuid(), kind: z.enum(['image', 'file']) })).max(4).default([]),
}).refine((v) => (v.text?.trim().length ?? 0) > 0 || v.attachments.length > 0, { message: 'empty message' });
export const PollQuery = z.object({ after: z.string().max(100).optional(), waitMs: z.coerce.number().int().min(0).max(20000).default(0) });
export const DemoChatSendBody = z.object({ clientRequestId: z.string().trim().min(8).max(80), text: z.string().max(2000) }); // ความยาวจริงตรวจใน handler (500 สาธารณะ / 2000 tester)
export const DemoChatActionBody = z.object({
  clientRequestId: z.string().trim().min(8).max(80),
  kind: z.enum(['order', 'booking']),                  // มาจากชนิดของการ์ด (order_review | booking_review)
  proposalId: z.string().min(1).max(100), version: z.number().int().min(1),
  reviewToken: z.string().min(1).max(500), decision: z.enum(['confirm', 'cancel']),
});
export const DemoChatSettingsBody = z.object({
  enabled: z.boolean(),
  publicSlug: z.string().regex(/^[a-z0-9][a-z0-9-]{2,39}$/),
  welcomeText: z.string().trim().min(1).max(300).nullable(),
  suggestedQuestions: z.array(z.string().trim().min(1).max(80)).max(4),
  welcomeTextEn: z.string().trim().min(1).max(300).nullable().default(null),
  suggestedQuestionsEn: z.array(z.string().trim().min(1).max(80)).max(4).default([]),
});

export interface InboxRow {
  conversationId: string; customerId: string; customerName: string; channel: Channel;
  status: 'open' | 'closed'; handler: 'ai' | 'human';
  assigneeUserId: string | null; assigneeName: string | null;   // null เมื่อไม่มีผู้ดูแลหรือผู้ดูแล revoked/disabled
  lastMessageAt: string | null; lastMessagePreview: string; unreadCount: number;
  waitingSince: string | null; isWaiting: boolean; version: number;
}
export interface InboxCounts { all: number; waiting: number; active: number; closed: number }
export interface ConversationDetail {
  conversation: ConversationRecord;
  assigneeName: string | null; waitingSince: string | null; isWaiting: boolean;
  aiPending: boolean;                 // มี job ai.reply ของข้อความล่าสุดของลูกค้าที่ยัง queued/running
  aiEnabled: boolean;                 // getBusinessSettings(businessId).aiEnabled
}
export interface ChatAttachment { fileId: string; fileName: string; mimeType: string; sizeBytes: number; kind: 'image' | 'file' }
/** ทรงข้อความที่ผู้เยี่ยมชมเห็น (ไม่มี authorUserId / providerMeta / error ดิบ) */
export interface DemoChatMessage {
  id: string; seq: number; direction: MessageDirection; author: 'customer' | 'ai' | 'staff';
  parts: MessagePart[]; createdAt: string; delivery: DeliveryState | null;
}
export interface DemoChatPoll {
  conversationId: string | null; items: DemoChatMessage[];
  cursor: string | null;              // base64url(seq ล่าสุดที่ส่งให้) ส่งกลับเป็น ?after= รอบถัดไป
  pending: null | { since: string; state: 'typing' | 'failed' };
  closed: boolean;
}
export interface DemoChatSendResult { message: DemoChatMessage; conversationId: string; created: boolean }
export interface DemoChatActionResult { decision: 'confirm' | 'cancel'; replayed: boolean }
export interface DemoChatShopView { shopName: string; language: 'th' | 'en'; welcomeText: string | null; suggestedQuestions: string[]; welcomeTextEn: string | null; suggestedQuestionsEn: string[]; aiEnabled: boolean; capReached: boolean }
export interface DemoChatSettingsView {
  enabled: boolean; publicSlug: string; publicUrl: string; welcomeText: string | null; suggestedQuestions: string[]; welcomeTextEn: string | null; suggestedQuestionsEn: string[];
  todayTurns: number; dailyCap: number;
}
```
`publicUrl` = `${PUBLIC_BASE_URL}/demo-chat/s/<slug>` (env `PUBLIC_BASE_URL` มีอยู่แล้ว; ว่าง → `APP_BASE_URL`)

## 4. Service functions และ contracts

ไฟล์ `server/src/features/inbox/service.ts` · signature ตรง `contracts.ts` ทุกตัวอักษร (C1 ส่ง body เริ่มต้นแบบ minimal แล้ว A1 แทน body)

```ts
export async function saveMessage(input: SaveMessageInput): Promise<SaveMessageResult>;
export async function getConversation(conversationId: string, opts?: { businessId?: string }): Promise<ConversationRecord | null>;
export async function getHistory(conversationId: string, opts?: HistoryOptions): Promise<Page<MessageRecord>>;
```
พฤติกรรมของทั้งสาม: §5.1–§5.3 · `getConversation` คืน `null` เมื่อไม่มีหรือ `opts.businessId` ไม่ตรง · ไม่ throw `NOT_FOUND` · `unreadCount` `version` อ่านจากคอลัมน์ conversations

### Contract additions

ต้องวางต่อใน contracts.ts โดยหัวหน้า (lane อื่นไม่ต้องรอ: ใช้ผ่าน service ของ A1 เมื่อ DONE)

```ts
// ═══ F09 inbox · A1 additions ═══
export interface ChatAttachmentRef { fileId: string; kind: 'image' | 'file' }
/**
 * @owner F09 inbox · A1 · consumers: A1 F12 (composer, template send), A1 F11 (notes ไม่ใช้) , A1 F09 routes
 * ทางเดียวที่ staff ส่งข้อความจากเว็บ: ตรวจ conversation ในร้าน, กฎ takeover (ถ้า handler 'ai' หรือไม่มีผู้ดูแล → assignConversation(userId)
 * ก่อนส่ง; ผู้ดูแลเป็นคนอื่น → VERSION_CONFLICT details.holder), สร้าง parts ฝั่ง server (text + image/file ที่ตรวจเจ้าของแล้ว),
 * แล้ว sendToCustomer(..., { author: 'staff', authorUserId, clientRequestId, businessId }). conversation ปิดแล้ว → POLICY_BLOCKED.
 * `parts` (ถ้ามี) ใช้แทน text/attachments: F12 ส่ง MessagePart[] ที่ F12 ตรวจแล้ว (รวมการ์ดสินค้า) · ชนิดที่ผ่านได้: text image file product_card action_buttons.
 * @fake real เสมอ (เรียก F11 fake ได้)
 */
export declare function sendStaffMessage(input: {
  businessId: string; conversationId: string; actorUserId: string; clientRequestId: string;
  text?: string; attachments?: ChatAttachmentRef[]; parts?: MessagePart[];
  /** false = ไม่รับช่วงอัตโนมัติ (broadcast / ระบบ ไม่ใช้ทางนี้) · default true */
  autoTakeover?: boolean;
}): Promise<SendReceipt>;
/**
 * @owner F09 inbox · A1 · consumers: A1 F23 (หน้าต่าง 24 ชั่วโมงของ Messenger/Instagram), B2 F38
 * เวลา last_inbound_at ล่าสุดของลูกค้าคนนี้จากทุก conversation (เปิดหรือปิด) ไม่มี/ลูกค้าร้านอื่น → null
 * @fake SELECT max(last_inbound_at) FROM conversations WHERE business_id AND customer_id
 */
export declare function getCustomerLastInboundAt(businessId: string, customerId: string): Promise<string | null>;
/** @owner F09 inbox · A1 · ภาษาที่ใช้กับข้อความของโค้ดถึงลูกค้าในแชตนี้ ('th' | 'en') ดู §5.10 · ไม่ throw */
export declare function getCustomerLanguage(conversationId: string, opts?: { businessId?: string }): Promise<CustomerLanguage>;
/**
 * @owner F09 inbox · A1 · consumers: A1 F12 (อัปโหลดไฟล์ template), F09 routes
 * ตรวจ MIME/ขนาด/signature แล้ว storage.save({ purpose: 'chat-attachment' }) · รูป → model.moderate (flagged → VALIDATION_ERROR reason 'moderation_flagged', ผู้ให้บริการล้ม → ผ่านพร้อม log)
 */
export declare function saveChatAttachment(input: { businessId: string; uploadedBy: string; originalName: string; mimeType: string; bytes: Uint8Array; purpose?: 'chat-attachment' | 'template-asset' }): Promise<ChatAttachment>;
```

## 5. Algorithms

### ค่าคงที่ (ไฟล์ `server/src/features/inbox/limits.ts` ปรับได้ในวันงาน; ที่ใช้ env ระบุไว้)

| ค่า | ค่าเริ่มต้น | หมายเหตุ |
|---|---|---|
| `HISTORY_DEFAULT` / `HISTORY_MAX` | 30 / 100 | ตรง `HistoryOptions` |
| `GROUP_EXTEND_MAX` | 40 แถว | ขยายขอบหน้าให้ครบ `group_id` |
| `INBOX_PAGE_DEFAULT` / `MAX` | 20 / 50 | |
| `WAITING_BOT_SILENT_MS` | 120000 | bot เงียบเกินนี้ = waiting |
| `PREVIEW_CHARS` | 120 | `last_message_preview` |
| `PART_TEXT_MAX` | 5000 | ต่อ TextPart ใน saveMessage |
| `PARTS_MAX` | 10 | ต่อข้อความ |
| `DEMO_PUBLIC_TEXT_MAX` / `DEMO_STAFF_TEXT_MAX` | 500 / 2000 | |
| `DEMO_VISITOR_PER_MIN` | 6 ข้อความ/นาที/visitor | `assertRateLimit` key `demo-chat:visitor:<visitorId>` |
| `DEMO_VISITOR_PER_HOUR` | 40 | key `demo-chat:visitor-h:<visitorId>` |
| `DEMO_VISITOR_DAILY_TURNS` | 40 turn/วัน/visitor/ร้าน | นับจาก DB (§5.7) |
| `DEMO_IP_PER_MIN` / `DEMO_IP_PER_HOUR` | 60 / 600 | key `demo-chat:ip:<ip>` · สูงเพราะงานเดียวกันใช้ Wi-Fi/NAT เดียวกันหลายเครื่อง |
| `DEMO_SESSION_PER_MIN_IP` | 20 | key `demo-chat:session:<ip>` |
| `DEMO_POLL_PER_MIN_VISITOR` / `_IP` | 120 / 600 | key `demo-chat:poll:<visitorId>` / `demo-chat:poll-ip:<ip>` |
| `DEMO_STAFF_PER_MIN` | 30 | key `demo-chat:staff:<userId>` |
| `DEMO_CHAT_DAILY_TURN_CAP` | env, default 300 | เพดานต่อร้านต่อวันของ**ผู้เยี่ยมชมสาธารณะ** (ไม่นับ tester) · อ่านจาก `process.env` ตอนเรียก (test ตั้งค่าได้) |
| `LONGPOLL_MAX_MS` | 20000 | และ waiter รวมไม่เกิน 200 |
| `VISITOR_TOKEN_MAX_AGE_DAYS` | 30 | |
| `TYPING_MAX_AGE_MS` | 180000 | เกินนี้ `pending.state = 'failed'` |

### 5.1 `saveMessage(input)` (ทางเดียวที่ INSERT `messages`)

1. **ตรวจ input** (ก่อนแตะ DB): `parts` ว่าง → `VALIDATION_ERROR` · เกิน `PARTS_MAX` → `VALIDATION_ERROR` · แต่ละ part ผ่าน zod ของชนิดตัวเอง (ตรง `MessagePart` ใน contracts: text 1–`PART_TEXT_MAX` ตัวหลัง trim, image/file ต้องมี `fileId` uuid, product_card `items` 1–10, action_buttons ปุ่ม 1–4, `link` url ต้องเป็น `https://` หรือ path ที่ขึ้นต้น `/` ห้าม `javascript:` `data:` ห้ามมี user:pass) · ไม่มีทั้ง `conversationId` และ `customer` → `VALIDATION_ERROR`
2. **ระบุช่องทาง**: มี `conversationId` → โหลด conversation ด้วย `business_id = input.businessId` (ไม่เจอ/ร้านอื่น → `NOT_FOUND`) แล้ว `channel = conversation.channel` · มี `customer` → `channel = customer.channel`
3. **dedup ก่อนเปิด transaction** (ทางเร็ว): มี `externalId` → `SELECT` ตาม unique `(business_id, channel, external_id)` · มี `clientRequestId` และรู้ conversation → ตาม `(conversation_id, client_request_id)` · เจอ → คืน `{ message, conversation, created: false, aiJobId: null }` **และ heal**: ถ้า message เป็น inbound ของลูกค้า, ตรงเงื่อนไข triggerAi (ข้อ 8), อายุ < 5 นาที และยังไม่มี job (`SELECT 1 FROM jobs WHERE dedup_key = 'ai.reply:'||id`) → enqueue ด้วย dedupKey เดิม (ปลอดภัยเพราะ dedupKey unique; เติมช่องว่าง "commit แล้วแต่ enqueue ไม่ทัน")
4. **transaction** `db.tx` (ห้ามเรียก model/provider ข้างใน):
   1. กรณี `customer`: `INSERT INTO customers (business_id, channel, external_id, channel_account_id, display_name) … ON CONFLICT (business_id, channel, external_id) DO UPDATE SET last_seen_at = now(), channel_account_id = COALESCE(EXCLUDED.channel_account_id, customers.channel_account_id), display_name = CASE WHEN EXCLUDED.display_name <> '' AND input.author = 'customer' THEN EXCLUDED.display_name ELSE customers.display_name END RETURNING id` · `display_name` ที่ไม่ได้ให้ = ค่าว่าง (UI แสดง "ลูกค้า" + 4 ตัวท้ายของ externalId)
   2. หา conversation: `SELECT … FROM conversations WHERE customer_id = $1 AND status = 'open' FOR UPDATE` · ไม่มี → `INSERT` (handler 'ai', status 'open', business, customer, channel) ถ้าชน `conversations_one_open` (แข่งกัน) → `SELECT … FOR UPDATE` ซ้ำ · แถวใหม่ → จำไว้ `isNewConversation`
   3. กรณี `conversationId`: `SELECT … FOR UPDATE` · ถ้า conversation `closed` และ message เป็น inbound ของลูกค้า → ใช้ข้อ 4.2 (หา/สร้างแถวที่เปิดของลูกค้าคนเดียวกัน) แทนการเขียนลงแถวที่ปิด · ถ้าเป็น outbound ลงแถวที่ปิด (เช่น ระบบ) → เขียนได้
   4. `seq = conversation.next_seq` แล้ว `UPDATE conversations SET next_seq = next_seq + 1`
   5. สร้าง `text = partsToText(parts)` (§5.1.1) แล้ว `INSERT INTO messages (… seq, direction, author, author_user_id, parts, text, channel, origin, external_id, group_id, provider_meta, client_request_id, delivery_state 'not_required', created_at = LEAST(COALESCE(occurredAt, now()), now()))` · ชน unique ภายใน tx (แข่งกัน) → rollback tx แล้วทำข้อ 3 ซ้ำหนึ่งครั้ง (ได้ `created:false`)
   6. `UPDATE conversations SET last_message_at = <created_at>, last_message_preview = left(text, PREVIEW_CHARS), updated_at = now()` และ: inbound + author customer → `last_inbound_at = <created_at>, unread_count = unread_count + 1` · outbound author staff → `unread_count = 0` · outbound ai/system → ไม่แตะ `unread_count`
5. **หลัง commit**: `publish(businessId, { type: 'message.created', conversationId, message: <MessageRecordLite> })` · ถ้า `isNewConversation` หรือ conversation เปลี่ยนจากปิดเป็นเปิด → `publish({ type: 'conversation.updated', … })` · เรียก `notifyConversation(conversationId)` (long-poll waiter §5.9)
6. `origin` default: ไม่ระบุ → `channel === 'web' ? 'demo' : 'live'`
7. คืนข้อความและ conversation เป็น `MessageRecord` / `ConversationRecord` (map ใน `mappers.ts`; `delivery` ตาม delivery_* คอลัมน์; `url` ของ image/file part = `/api/v1/businesses/<businessId>/chat/files/<fileId>`)
8. **triggerAi**: ค่า default = `direction === 'inbound' && author === 'customer' && origin ∈ {'live','demo'}` · ถ้า true → `jobs.enqueue(AI_REPLY_JOB, { conversationId, messageId }, { dedupKey: 'ai.reply:' + messageId, businessId, lockKey: 'conversation:' + conversationId })` · คืน `aiJobId = jobId` · **ไม่ตรวจ** `aiEnabled` และ takeover (handler ของ F10 ตรวจ: ข้อความต้องถูกเก็บเสมอ) · enqueue ล้ม (DB ผิดพลาด) → log error แล้วคืน `aiJobId: null` โดยไม่ throw (ข้อความถูกบันทึกแล้ว; ทางเดียวที่เยียวยาคือ heal ในข้อ 3)

#### 5.1.1 `partsToText(parts)` (ใช้กับ `messages.text`, preview และ context ของโมเดล)

ต่อด้วย `\n`: text → ข้อความ · image → `alt` หรือ `[รูปภาพ]` · file → `[ไฟล์: <fileName>]` · product_card → `altText` · order_review → `[สรุปออเดอร์ ยอดรวม <totalMinor/100 มีจุลภาค> บาท]` · booking_review → `[สรุปการจอง <localDisplay>]` · action_buttons → `text` (ถ้ามี) ตามด้วย `[ปุ่ม: label1 / label2]` · ตัดรวมไม่เกิน 4000 ตัว

### 5.2 `getConversation`

`SELECT c.*, cu.display_name, cu.external_id, cu.channel_account_id FROM conversations c JOIN customers cu ON cu.id = c.customer_id WHERE c.id = $1 [AND c.business_id = $2]` → `ConversationRecord` (`aiForceOn` จากคอลัมน์ `ai_force_on`) · ไม่เจอ → `null` · id ที่ไม่ใช่ uuid → `null` (ไม่ throw)

### 5.3 `getHistory(conversationId, opts)`

1. ตรวจ `opts` ก่อนแตะ DB: `limit` ไม่ใช่จำนวนเต็ม 1..100 → `VALIDATION_ERROR` · `before` กับ `after` พร้อมกัน → `VALIDATION_ERROR` · cursor = `base64url(String(seq))`, seq เป็นจำนวนเต็ม > 0 ไม่งั้น `VALIDATION_ERROR` · `limit` default 30
2. conversation ไม่มี หรือ (มี `opts.businessId` และไม่ตรง) → `{ items: [], nextCursor: null }` (service ไม่ throw: route ชั้นนอกตรวจ 404 เอง)
3. โหมดหน้าล่าสุด/`before`: `SELECT … WHERE conversation_id = $1 [AND seq < $before] ORDER BY seq DESC LIMIT limit + 1` · มีแถวเกิน limit → `hasMore = true` ตัดแถวเกินทิ้ง · กลับลำดับเป็น seq น้อย→มาก
4. **ขยายขอบ group**: ถ้าแถวแรกสุด (เก่าสุด) มี `group_id` → `SELECT … WHERE conversation_id = $1 AND group_id = $g AND seq < <seq แถวแรก> ORDER BY seq DESC LIMIT GROUP_EXTEND_MAX` แล้วเอามาต่อหน้า (หน้าจึงอาจยาวกว่า limit ได้ถึง +40) · คำนวณ `hasMore` ใหม่: มีแถว `seq <` แถวแรกใหม่หรือไม่
5. `nextCursor = hasMore ? encode(seq แถวแรก) : null` (ใช้เป็น `before` รอบถัดไป ตรงกับ fake: cursor = base64url(seq))
6. โหมด `after`: `WHERE seq > $after ORDER BY seq ASC LIMIT limit + 1` · มีเกิน → `nextCursor = encode(seq แถวสุดท้ายที่คืน)` ไม่มี → `null` (live refresh ไม่ขยาย group; UI รวม bubble ตาม `groupId` เอง)
7. map แต่ละแถวเป็น `MessageRecord`

ผลที่ต้องได้ (test): 95 ข้อความ limit 30 → 3 หน้า (รวมกัน 95 ไม่ซ้ำ ไม่ข้าม) · ข้อความที่ 29–33 อยู่ group เดียวกัน → ไม่ถูกแบ่งข้ามหน้า

### 5.4 รายการ inbox (`GET …/conversations`)

**ซ่อนแชตของ eval harness (F37):** ลูกค้าที่ `customers.external_id LIKE 'eval-%'` (F37 สร้างเป็น `[eval] <caseId>`) และ `LIKE 'live-sim:%'` (ตัวจำลองคอมเมนต์ live ของ F22) ไม่อยู่ในรายการ inbox, ตัวนับ unread / waiting และผลค้นหา: เพิ่ม `AND cu.external_id NOT LIKE 'eval-%' AND cu.external_id NOT LIKE 'live-sim:%'` ใน WHERE ของทุก query ในหัวข้อนี้ (เปิดด้วยลิงก์ตรงจากหน้า AI quality ยังได้)

SQL หลัก (พารามิเตอร์ `$1 business_id`, `$2 aiOff boolean` จาก `getBusinessSettings(...).aiEnabled === false`):
```sql
WITH latest AS (          -- 1 แถวต่อลูกค้า = conversation ล่าสุดของลูกค้านั้น
  SELECT c.* FROM conversations c
  WHERE c.business_id = $1
    AND NOT EXISTS (SELECT 1 FROM conversations n
                    WHERE n.customer_id = c.customer_id AND (n.created_at, n.id) > (c.created_at, c.id))
), enriched AS (
  SELECT l.*, cu.display_name, cu.external_id,
    (SELECT min(m.created_at) FROM messages m
      WHERE m.conversation_id = l.id AND m.direction = 'inbound' AND m.author = 'customer'
        AND m.seq > COALESCE((SELECT max(o.seq) FROM messages o WHERE o.conversation_id = l.id
                               AND o.direction = 'outbound' AND o.author IN ('ai','staff')), 0)) AS awaiting_since,
    (SELECT u.display_name FROM memberships ms JOIN users u ON u.id = ms.user_id
      WHERE ms.business_id = l.business_id AND ms.user_id = l.assignee_user_id
        AND ms.status = 'active' AND u.status = 'active') AS assignee_name
  FROM latest l JOIN customers cu ON cu.id = l.customer_id
), ranked AS (
  SELECT e.*,
    (e.status = 'open' AND e.awaiting_since IS NOT NULL
      AND (e.handler = 'human' OR $2 OR e.awaiting_since < now() - interval '120 seconds')) AS is_waiting
  FROM enriched e
)
SELECT r.*, CASE WHEN is_waiting THEN 0 WHEN status = 'open' THEN 1 ELSE 2 END AS bucket,
       CASE WHEN is_waiting THEN extract(epoch FROM awaiting_since)
            ELSE -extract(epoch FROM COALESCE(last_message_at, created_at)) END AS sort_key
FROM ranked r
WHERE <filter> AND <assignee> AND <search>
  AND (bucket, sort_key, id) > ($b, $k, $id)      -- เมื่อมี cursor (เทียบ row ทั้งสามค่า)
ORDER BY bucket, sort_key, id LIMIT $limit + 1;
```
- `<filter>`: `waiting` → `is_waiting` · `active` → `status = 'open'` (waiting เป็นส่วนย่อยของ active) · `closed` → `status = 'closed'` · `all` → ไม่กรอง
- `<assignee>`: `me` → `assignee_user_id = <ผู้เรียก>` · `unassigned` → `assignee_user_id IS NULL OR assignee_name IS NULL` · uuid → เท่ากัน · อย่างอื่น → `VALIDATION_ERROR`
- `<search>`: trim ≤120, escape `% _ \` แล้ว `display_name ILIKE '%q%' OR last_message_preview ILIKE '%q%'`
- cursor = `base64url(JSON [bucket, sort_key, id])` (composite กันแถวเวลาเท่ากันหลุด) · ผู้ดูแลที่ถูก revoke/disabled → `assigneeName = null` และถือเป็นไม่มีผู้ดูแลในการแสดงผล
- `counts`: ใช้ CTE เดียวกัน `count(*) FILTER (...)` ทั้ง 4 ค่า
- ขนาดข้อมูลเดโม (< 5,000 แชตต่อร้าน) ใช้ SQL นี้ได้ตรง ๆ · ถ้าช้า ตัดการนับ `counts` ออกก่อน

### 5.5 หน้า thread และการอ่าน

`GET /conversations/:id` → `getConversation` → `requireBusiness(conv.businessId, 'chat.read')` → ประกอบ `ConversationDetail` (`aiPending` จาก §5.9 ข้อ `pending`, `aiEnabled` จาก F04) · `POST …/read` → `UPDATE conversations SET unread_count = 0 WHERE id = $1 AND business_id = $2 AND unread_count > 0` แล้ว `publish({ type:'custom', featureId:'F09', name:'inbox.read', data:{ conversationId } })` · UI เรียกเมื่อเปิด thread และเมื่อมีข้อความ inbound ใหม่ขณะ thread เปิดอยู่และแท็บมองเห็น

### 5.6 staff ส่งข้อความ (`sendStaffMessage`)

1. `getConversation(id, { businessId })` → null → `NOT_FOUND` · `status = 'closed'` → `POLICY_BLOCKED` (`details.reason = 'conversation_closed'`)
2. สร้าง parts (ถ้าไม่ได้ให้ `parts` มา): `text` (trim, ไม่ว่าง) → `TextPart` · แต่ละ attachment → `storage.read(fileId, { businessId })` null → `VALIDATION_ERROR` (ไฟล์ไม่ใช่ของร้านนี้/ไม่มี) · `purpose` ต้อง `chat-attachment` หรือ `template-asset` · `kind image` ต้อง MIME `image/*` → `ImagePart` · else `FilePart` (fileName, mimeType, sizeBytes จากแถว files)
3. **takeover** (เมื่อ `autoTakeover !== false`): ถ้า `conversation.handler === 'human' && assigneeUserId === actor` → ข้าม · ถ้า `handler === 'human'` และ assignee เป็นคนอื่น (ยัง active) → `VERSION_CONFLICT` `details: { reason: 'conversation_taken', holder: { userId, displayName } }` (UI ถามว่าจะ "รับช่วงต่อ" ไหม แล้วเรียก F11 takeover แบบ force) · ถ้า handler `ai` หรือไม่มีผู้ดูแล → ต้องมี `chat.takeover` (route ตรวจก่อนเรียก; ไม่มี → `PERMISSION_DENIED`) → `assignConversation(id, actor, { expectedVersion: conversation.version, actorUserId: actor, businessId })` · ได้ `VERSION_CONFLICT` → อ่านใหม่ครั้งเดียว: ถ้าตอนนี้ actor ถืออยู่ → ไปต่อ มิฉะนั้นโยน `VERSION_CONFLICT` พร้อม holder
4. `sendToCustomer(conversationId, parts, { author: 'staff', authorUserId: actor, clientRequestId, origin: 'live', businessId })` → คืน `SendReceipt` (state `pending`)
5. **ถ้าส่งล้ม (throw) หลัง takeover แล้ว: takeover ยังคงอยู่** (ไม่ rollback: ลูกค้ากำลังรอคน) · UI แสดงข้อผิดพลาดและให้ลองส่งซ้ำด้วย `clientRequestId` เดิม (core dedup → ไม่เกิดข้อความซ้ำ)
6. ผล delivery จริงมาทาง `message.updated` (pending → sent / failed / unknown) · UI **ห้ามแสดง "ส่งแล้ว" ก่อนได้ state `sent`**

### 5.7 Demo Chat: ตัวตน, เพดาน, ลำดับการตรวจ

**visitor token**: `base64url(visitorId) + '.' + issuedAtEpochSec + '.' + base64url(HMAC_SHA256(SESSION_SECRET, 'demo-visitor:' + visitorId + '.' + issuedAtEpochSec))` · `verify` เทียบด้วย `timingSafeEqual`, อายุ ≤ `VISITOR_TOKEN_MAX_AGE_DAYS`, `visitorId` เป็น uuid v4 · `POST …/session`: token ใช้ได้ → คืนค่าเดิม (ต่ออายุเมื่อเหลือ < 7 วัน) · ไม่มี/ผิด → ออกใหม่ (`crypto.randomUUID()`)

**ลำดับตรวจเมื่อรับ `POST …/messages` สาธารณะ** (ทุกขั้นก่อนหน้าไม่เรียก OpenAI และไม่เขียน `messages`):
1. หา business จาก `public_slug` (ไม่พบ/`enabled=false`/business ไม่ active → `NOT_FOUND`)
2. verify token (ผิด → `AUTH_REQUIRED`) · `clientRequestId` ตามรูปแบบ
3. normalize ข้อความ: ตัดอักขระควบคุม (ยกเว้น `\n`), รวมช่องว่างติดกัน, trim · ว่าง → `VALIDATION_ERROR` · เกิน 500 ตัว (นับ code point) → `VALIDATION_ERROR` `details.max = 500`
4. rate limit ด้วย `assertRateLimit` **ตามลำดับ**: ip/นาที → ip/ชั่วโมง → visitor/นาที → visitor/ชั่วโมง · เกิน → `RATE_LIMITED` (core ใส่ `retryAfterSeconds`), เพิ่ม `blocked + 1` ใน `demo_chat_daily_turns`, `details.reason`
5. เพดานต่อ visitor ต่อวัน: `SELECT count(*) FROM messages m JOIN conversations c ON c.id = m.conversation_id JOIN customers cu ON cu.id = c.customer_id WHERE cu.business_id = $1 AND cu.channel = 'web' AND cu.external_id = 'demo-visitor:' || $visitor AND m.direction = 'inbound' AND m.created_at >= <เริ่มวันตาม Bangkok>` ≥ `DEMO_VISITOR_DAILY_TURNS` → `RATE_LIMITED reason 'visitor_daily'`
6. dedup `clientRequestId` ก่อน moderation (ส่งซ้ำ = ผลเดิม ไม่เสียเพดาน): หา conversation ของ visitor แล้ว `messages` ตาม `(conversation_id, client_request_id)` → เจอ คืน `created:false` ทันที
7. **moderation**: `model.moderate({ usage: { featureId: 'F09', purpose: 'moderate', businessId }, text })` · `flagged` → ไม่บันทึก, `blocked + 1`, `POLICY_BLOCKED` `details.reason = 'moderation'` (UI แสดงข้อความสุภาพ ไม่ระบุหมวด) · provider ล้ม/timeout → **ผ่านต่อ** (fail open) พร้อม log warn: ข้อความยังต้องผ่านขั้นก่อนหน้า และ AI มี guard ของตัวเอง · ใช้เป็นสัญญาณเตือน ไม่ใช่ด่านเดียว (Thai coverage ไม่ระบุใน docs)
8. **จอง turn ของร้านแบบ atomic**: `INSERT INTO demo_chat_daily_turns (business_id, day, turns) VALUES ($1, $day, 1) ON CONFLICT (business_id, day) DO UPDATE SET turns = demo_chat_daily_turns.turns + 1, updated_at = now() WHERE demo_chat_daily_turns.turns < $cap RETURNING turns` · ไม่คืนแถว = เต็มเพดาน → `RATE_LIMITED reason 'daily_cap'` (ไม่ retryable) · `day` = วันที่ตาม Asia/Bangkok ของเวลา server
9. `saveMessage({ businessId, customer: { channel: 'web', externalId: 'demo-visitor:' + visitorId, displayName: 'ผู้ทดลอง ' + <4 ตัวท้ายของ visitorId> }, direction: 'inbound', author: 'customer', parts: [text], clientRequestId, origin: 'demo' })` → ล้ม (throw) → คืน turn: `UPDATE … SET turns = turns - 1 WHERE turns > 0`
10. คืน `DemoChatSendResult` (`message` ในทรง `DemoChatMessage`)

เพดานนี้ปรับได้ด้วย env `DEMO_CHAT_DAILY_TURN_CAP` (Render env, ไม่ต้อง redeploy โค้ด) · งบ: ~300 turn ≈ ไม่กี่ดอลลาร์ ([budget](../budget-and-priority.md))

### 5.8 Demo Chat: poll, action, reset (ใช้ร่วมสาธารณะและ tester)

ฟังก์ชันภายใน `demoChat.ts`: `resolveIdentity(kind: 'visitor' | 'staff', …) → { businessId, customerExternalId }` แล้ว handler ทุกตัวทำงานจาก identity นี้ (ไม่อ่าน conversationId จาก client เพื่อการเข้าถึง: หา conversation จาก customer ของ identity เสมอ → กัน IDOR)

- **poll**: หา customer `(businessId, 'web', externalId)` → ไม่มี = `{ conversationId: null, items: [], cursor: null, pending: null, closed: false }` · มี → conversation ล่าสุดของ customer · `after` (cursor seq) → `getHistory(after)` กรอง `author ∈ {customer, ai, staff}` (ซ่อน `system`) map เป็น `DemoChatMessage` (ตัด `authorUserId`, `providerMeta`, `delivery.error`; `delivery` ของข้อความ outbound = state ให้ UI) · ถ้า `items` ว่างและ `waitMs > 0` → long-poll (§5.9) แล้วอ่านซ้ำครั้งเดียว
- **pending**: ข้อความ inbound ล่าสุดของลูกค้า m ที่ไม่มีข้อความ outbound (ai/staff) ใหม่กว่า → `SELECT state, attempts, max_attempts FROM jobs WHERE dedup_key = 'ai.reply:' || m.id` · `queued|running` → `typing` · `failed` (กำลัง retry) → `typing` · `dead` → `failed` · `succeeded`/ไม่มีแถว → `null` (AI เลือกเงียบ เช่น takeover) · อายุ m > `TYPING_MAX_AGE_MS` และยังไม่ตอบ → `failed` · `since` = `m.created_at`
- **action** (ลูกค้ากดปุ่มบนการ์ด): หา conversation จาก identity · ตรวจว่ามี message ใน conversation นี้ที่ part ชนิด `order_review` (kind `order`) หรือ `booking_review` (kind `booking`) มี `proposalId` ตรงกัน (ไม่ใช่ → `NOT_FOUND`) · `kind order` → `createOrderFromProposal({ stage: 'confirm', businessId, conversationId, actor: { kind: 'customer' }, clientRequestId, proposalId, version, reviewToken, decision })` · `kind booking` → `createBooking({ stage: 'confirm', … })` · ผล → `{ decision, replayed }` · error ของ F13/F15 (`PROPOSAL_EXPIRED` `SOLD_OUT` `SLOT_FULL` `VERSION_CONFLICT` `SERVICE_NOT_READY`) ส่งต่อทั้ง code ให้ UI แปลเป็นข้อความสุภาพ · **ไม่เคยยืนยันจากข้อความโมเดล** · F13/F15 ส่งข้อความผลลัพธ์เองผ่าน `sendToCustomer` แล้วหน้าเว็บเห็นทาง poll
- **postback ปุ่ม**: ปุ่มชนิด `postback` ในหน้าเว็บ = ส่ง `data` เป็นข้อความลูกค้าปกติ (ผ่าน §5.7; `data` ยาวเกิน 500 ตัวหรือว่าง → ใช้ `label`) ไม่มี route แยก · ปุ่ม "ข้อความ" ของ template (F12) เก็บข้อความที่ลูกค้าจะพูดไว้ใน `data` จึงตรงกับกติกานี้ · ปุ่ม `link` เปิดแท็บใหม่ (`rel="noopener noreferrer"`) เฉพาะ `https://` หรือ path ขึ้นต้น `/` ที่ server สร้าง (ตรวจซ้ำฝั่ง client ว่า URL เป็น https/relative)
- **reset**: ปิด conversation ที่เปิดอยู่ของ identity ผ่าน F11 `closeConversation(conversationId, { actorUserId: null, reason: 'demo_reset' })` (ถ้า F11 ยังไม่พร้อม: `UPDATE conversations SET status='closed', closed_at=now(), version=version+1`) แล้ว `audit('inbox.demo_chat.reset')` · ข้อความถัดไปจะเปิด conversation ใหม่ (ผู้ใช้เห็นหน้าจอว่าง + ข้อความต้อนรับ) · ข้อมูลเก่ายังอยู่ใน inbox ของร้าน
- **ไฟล์** (`…/files/:fileId`): ต้องเป็น uuid และ `position($fileId in parts::text) > 0` ในข้อความของ conversation ของ identity นี้ แล้ว `storage.read(fileId, { businessId })` → ส่งกลับ `inline` พร้อม `Cache-Control: private, max-age=300` · ไม่ตรง → `NOT_FOUND`

### 5.9 Realtime

**ฝั่งร้าน**: ใช้ `/ws` ของ core: `saveMessage` publish `message.created` · core publish `message.updated` เมื่อ delivery เปลี่ยน · F11 publish `conversation.updated` · F09 publish custom `inbox.read` · หน้า `/chat` ฟัง 4 event นี้: รายการ = refetch หน้าแรก (debounce 400 ms) · thread = ต่อข้อความจาก `message.created` (กรอง `conversationId`; ไม่เจอในหน้า → ดึง `after=<seq ล่าสุด>`) · อัปเดตป้ายส่งจาก `message.updated` · สำรอง: ระหว่างแท็บมองเห็น refetch รายการทุก 30 วินาที และ thread ทุก 15 วินาที (ถ้า socket หลุด) · อัปเดตสถานะจริงใน EVIDENCE.md

**ฝั่งผู้เยี่ยมชม (สาธารณะ)**: `/ws` ของ core ต้องมี session และ membership จึงใช้ไม่ได้ และ route handler ของ core ไม่รองรับ stream/SSE → ใช้ **long-poll** บน `GET …/poll?after=<cursor>&waitMs=20000`:
1. server ตอบทันทีถ้ามีข้อความใหม่หรือ `pending` เปลี่ยน
2. ไม่มี → ถือคำขอไว้ได้นาน ≤ `LONGPOLL_MAX_MS` โดยไม่ถือ connection ของ DB: `notifyConversation(conversationId)` (EventEmitter ในโปรเซสเดียวกัน — production มี 1 instance) ปลุก waiter ทันทีที่ `saveMessage` commit ข้อความใดของ conversation นั้น (รวมคำตอบ AI และข้อความ staff) จากนั้นอ่าน DB ซ้ำหนึ่งครั้ง
3. waiter ต่อ visitor = 1 (รอบใหม่ยกเลิกรอบเก่า) · รวมทั้งระบบ ≤ 200 (เกินนั้นตอบทันทีแล้วให้ client ทำ short poll)
4. **ฝั่ง client** (`useDemoChatPoll`): วนเรียกต่อเนื่อง `waitMs=20000`; error/timeout → แสดงแถบ "กำลังเชื่อมต่อใหม่…" หลังพลาดครั้งที่ 2, backoff 1→2→4→8→15 วินาที (reset เมื่อสำเร็จ), สลับเป็น short poll `waitMs=0` ทุก 3 วินาทีเมื่อ long-poll พลาดติดกัน 3 ครั้ง (และลองกลับ long-poll ทุก 60 วินาที) · แท็บกลับมามองเห็น (`visibilitychange`) → poll ทันที · dedup ข้อความด้วย `id`, เรียงด้วย `seq`, ใช้ `cursor` ล่าสุดเสมอ (ไม่หาย ไม่ซ้ำหลังเชื่อมต่อใหม่)
5. ต้องการ WebSocket จริงสำหรับสาธารณะ → `NEED core` (ข้อ 6 ใน §15) ไม่จำเป็นต่อ R

### 5.9.1 `getDemoChatHandoff(businessId)` (contract สำหรับ F39 · อยู่ใน contracts.ts แล้ว)

F39 (MCP tool `propose_order`) ต้องส่งลิงก์ให้ผู้ซื้อเปิด Demo Chat เพื่อกดยืนยันใบสรุปออเดอร์ที่สร้างไว้ให้: `getDemoChatHandoff(businessId)` สร้าง `visitorId` ใหม่ (uuid) ออก visitor token แบบเดียวกับ §5.7 (HMAC ด้วย `SESSION_SECRET`, อายุ 24 ชั่วโมง) แล้วคืน `{ visitorId, customerExternalId: 'demo-visitor:<visitorId>', url: `${PUBLIC_BASE_URL}/demo-chat/s/<slug>#v=<token>`, publicSlug }` · ร้านที่ไม่ได้เปิด Demo Chat → `null` · ไม่สร้างแถว customers/conversations เอง (ผู้เรียกทำผ่าน `saveMessage`)

ฝั่งหน้า `/demo-chat/s/:slug`: ตอนโหลด ถ้า URL มี fragment `#v=<token>` → เรียก session route เพื่อตรวจ token (ผิด/หมดอายุ = เริ่มเป็นผู้เยี่ยมชมใหม่ตามปกติ) → ตั้ง cookie `nless_demo_visitor` → `history.replaceState` ลบ fragment ออกทันที (token ไม่ค้างใน URL และไม่ถูกส่งไป server ใน path/query) · test: เปิดลิงก์แล้วเห็นใบสรุปออเดอร์ของ visitor นั้น, fragment หาย, token ปลอมไม่เห็นแชตของคนอื่น

### 5.10 `getCustomerLastInboundAt`, `getCustomerLanguage` และ `saveChatAttachment`

- **`getCustomerLanguage(conversationId, opts?)`** (contracts.ts · เพิ่ม 21 พ.ย. · ทุก lane ที่ส่งข้อความของโค้ดถึงลูกค้าเรียกตัวนี้: F13 F14 F15 F17 F18 F38 F39): `SELECT m.text FROM messages m WHERE m.conversation_id = $1 AND m.author = 'customer' AND m.text <> '' ORDER BY m.seq DESC LIMIT 6` → วนจากใหม่ไปเก่า เรียก `detectTextLanguage(text)` ของ core (`shared/core/language.ts`) ตัวแรกที่ไม่ null คือคำตอบ · ไม่มี → `businesses.language` ของ conversation · conversation ไม่มีอยู่หรือเป็นของร้านอื่น (เมื่อส่ง `opts.businessId`) → ภาษาของ `opts.businessId` หรือ `'th'` · ไม่ throw ไม่ cache (query เดียว มี index `(conversation_id, seq)`) · C1 ส่งแบบ real ขั้นต่ำตั้งแต่ setup ตาม `@fake` · test: ข้อความล่าสุด `How much?` → `en` · `ok` หลังข้อความอังกฤษ → `en` · แชตที่มีแต่รูป → ภาษาร้าน · ร้านอื่น → ภาษาของ `opts.businessId`
- `getCustomerLastInboundAt`: `SELECT max(c.last_inbound_at) FROM conversations c WHERE c.business_id = $1 AND c.customer_id = $2` (ลูกค้าร้านอื่น → null ผ่านเงื่อนไข business)
- `saveChatAttachment`: allowlist MIME → นามสกุลและ **signature** (magic bytes): `image/jpeg` (FF D8 FF) · `image/png` (89 50 4E 47) · `image/webp` (RIFF….WEBP) · `image/gif` (GIF8) · `application/pdf` (%PDF) · `text/plain` `text/csv` (ต้องเป็น UTF-8 ที่ decode ได้) · `.docx` `.xlsx` (zip PK 03 04 + MIME ตรง) · ขนาด ≤ `min(UPLOAD_MAX_MB, 10)` MiB · ชื่อไฟล์ ≤ 80 ตัว (ตัดและล้าง path/อักขระควบคุม) · ไม่ผ่าน → `VALIDATION_ERROR` (`details.reason`: `mime` `size` `signature` `name`) · รูป → `model.moderate({ images: [{ dataUrl }] })` ตาม §4 · สำเร็จ → `storage.save({ businessId, uploadedBy, purpose, originalName, mimeType, bytes, allowedMime })`

## 6. AI calls

ไม่มี model call สร้างข้อความ ใช้เพียง `model.moderate` (ฟรี, purpose `moderate`, featureId `F09`):

| call | ที่ใช้ | input | ผล | ล้ม/timeout |
|---|---|---|---|---|
| `model.moderate({ usage: { featureId: 'F09', purpose: 'moderate', businessId }, text })` | ข้อความ Demo Chat สาธารณะ (§5.7 ข้อ 7) | text ที่ normalize แล้ว | `flagged` → `POLICY_BLOCKED` | fail open + log warn |
| `model.moderate({ …, images: [{ dataUrl }] })` | `saveChatAttachment` ชนิดรูป | รูป ≤ 20 MB | flagged → `VALIDATION_ERROR moderation_flagged` | fail open + log warn |

- `MODEL_MODE=fake`: `flagged = text.includes('[flag]')` (ตาม contracts) → test ใช้ข้อความ `ทดสอบ [flag]`
- ไม่ส่งข้อความลูกค้าที่ถูก flag ให้ AI ตอบ และไม่เก็บลง `messages` (เก็บเฉพาะตัวนับ `blocked`)
- ผลตรวจ API จริง: ไม่ได้รันสำหรับ F09 (ไม่มี prompt ใหม่; moderation ฟรี)

## 7. UI

routes (`web/src/features/inbox/pages.tsx`):

| path | layout | auth | permission | หมายเหตุ |
|---|---|---|---|---|
| `/chat` | app | business | `chat.read` | รายการ + thread (`?c=<conversationId>` เลือกแชต; ลิงก์ของ `notify()` ใช้รูปนี้) |
| `/demo-chat` | app | business | `insights.demo` | tester + ตั้งค่าลิงก์สาธารณะ |
| `/demo-chat/s/:slug` | **public** | **none** | — | หน้าลูกค้า (กรรมการ) ไม่มี sidebar ไม่มี login |

เมนู: `/chat` กลุ่ม `chat` icon `ForumOutlined` order 10 `mobileTab: true` permission `chat.read` searchTerms `['แชต','ข้อความ','inbox','chat']` · `/demo-chat` กลุ่ม `ai` icon `SmartToyOutlined` order 30 permission `insights.demo` searchTerms `['demo','ทดลอง','เดโม']` · เมนู scaffold เขียน "แชต" ให้แก้เป็น "แชต" ใน th.json

### 7.1 `/chat` (ฝั่งร้าน)

- **จอกว้าง (≥ md)**: 3 คอลัมน์: รายการ 360 px | thread (ยืดได้) | แผงข้าง 320 px (ซ่อนได้) · **จอแคบ**: รายการเต็มจอ → แตะแล้วไป `?c=<id>` เต็มจอ มีปุ่มกลับ
- **รายการ**: ช่องค้นหา (debounce 300 ms) · Tabs/Chips `ทั้งหมด` `รอตอบ (n)` `กำลังคุย` `ปิดแล้ว` (ตัวเลขจาก `counts`) · ตัวกรองผู้ดูแล `ทั้งหมด` `ของฉัน` `ยังไม่มีผู้ดูแล` · แถว = avatar ตัวอักษร + ชื่อ + ช่องทาง (ป้าย LINE / Messenger / Instagram / เว็บ) + preview 1 บรรทัด + เวลา (วันนี้ = HH:mm, อื่น = วัน/เดือน) + `StatusChip kind="conversation"` (`ai` / `human`) + ตัวเลข unread + "รอตอบ · N นาที" (สีเตือน) เมื่อ `isWaiting` · เลื่อนลงโหลดเพิ่มด้วย `nextCursor` · `DataTable` ไม่เหมาะ ใช้ `List` ของ MUI ตามแบบนี้
- **thread**: หัว = ชื่อลูกค้า + ช่องทาง + chip handler + "ดูแลโดย <ชื่อ>" + slot `chatSidePanels` (ปุ่มเปิดแผงข้าง) · ลูกค้าอยู่ซ้าย, AI/staff อยู่ขวา (AI = พื้นเทาอ่อน + ป้าย "AI", staff = พื้นสีหลักอ่อน + ชื่อ) · bubble ที่มี `groupId` เดียวกันและติดกันรวมเป็นกลุ่มเดียว · แสดงวันที่คั่นเมื่อเปลี่ยนวัน (เขต Bangkok) · ปุ่ม "ดูข้อความเก่ากว่า" ด้านบน (ใช้ `nextCursor` เป็น `before`, คงตำแหน่งเลื่อน) · เปิดมาเลื่อนล่างสุด; ข้อความใหม่เลื่อนตามเฉพาะเมื่ออยู่ใกล้ล่างสุด มิฉะนั้นแสดงปุ่ม "ข้อความใหม่ ↓" · ป้ายส่งของข้อความ outbound: `StatusChip kind="generic"` `pending` `sent` `failed` `unknown` + ถ้า `delivery.mode === 'sandbox'` เพิ่มป้าย "Sandbox · ไม่ได้ส่งถึงลูกค้าจริง" · `failed` แสดงเหตุผลสั้นและปุ่ม "ส่งซ้ำ" (ใช้ `clientRequestId` ใหม่ + ข้อความเดิม)
- **ตัว render part** (`MessageParts.tsx` ใช้ร่วม 3 หน้า): `mode: 'staff' | 'customer'` + `fileUrl(fileId)` resolver + `onAction` · text = `white-space: pre-wrap` ไม่ทำลิงก์อัตโนมัติ ไม่ render HTML · image = `<img loading="lazy">` กว้างสุด 280 px แตะเพื่อขยาย · file = ชิปดาวน์โหลด (ชื่อ + ขนาด) · product_card = การ์ดเลื่อนแนวนอน (รูปถ้ามี, ชื่อ, `formatMoney`, ป้าย "หมด" เมื่อ `soldOut`, SKU ตัวเล็ก) · order_review = ตารางรายการ + ยอดสินค้า/ค่าส่ง/ยอดรวม + เวลาหมดอายุ + ปุ่ม **ยืนยัน/ยกเลิก** (เฉพาะ `customer`; ใน `staff` เป็นข้อความ "รอลูกค้ากดยืนยัน" ปุ่ม disabled) · booking_review คล้ายกันแสดง `localDisplay` · action_buttons = ข้อความ + ปุ่มสูงสุด 4 ปุ่ม · ปุ่มที่ใช้ไปแล้ว/หมดอายุ disabled + ป้ายผล ("ยืนยันแล้ว" / "ยกเลิกแล้ว" / "หมดอายุ")
- **composer**: `TextField multiline` (สูงสุด 5 แถว), Enter = ขึ้นบรรทัดใหม่บนมือถือ / Enter ส่ง + Shift+Enter ขึ้นบรรทัดบนเดสก์ท็อป · ปุ่มแนบ (เลือกไฟล์ → `/chat/uploads` → ชิปมีปุ่มลบ, สูงสุด 4) · ปุ่มส่ง (disabled เมื่อว่าง/กำลังส่ง) · slot `chatComposerActions` (ปุ่มของ F12; props `{ conversationId, insertText(text), getText() }` — `insertText` ใส่ข้อความที่ตำแหน่ง cursor ของ composer) · ข้อความช่วยใต้ composer เมื่อ handler `ai` และไม่มีผู้ดูแล: "ส่งข้อความนี้จะรับช่วงแชตจาก AI (AI จะหยุดตอบแชตนี้)" · ผู้ใช้ไม่มี `chat.reply` → composer ถูกแทนด้วยข้อความ "คุณดูแชตได้อย่างเดียว" (API ยังตรวจสิทธิ์จริง) · 409 `conversation_taken` → `ConfirmDialog` "<ชื่อ> ดูแลแชตนี้อยู่ รับช่วงต่อหรือไม่?" → เรียก route takeover ของ F11 (force) แล้วส่งซ้ำ
- ทุก bubble มี slot `chatMessageActions` (props `{ conversationId, message }`) เป็นเมนู ⋮ (F12 ใส่ "แปลข้อความ")
- state: รายการ loading = skeleton 6 แถว · empty ทั้งร้าน = `EmptyState` "ยังไม่มีแชต" · empty จากการค้นหา = "ไม่พบแชตที่ตรงกับคำค้น" · error = `EmptyState` + ปุ่มลองใหม่ · thread โหลดล้ม = `Alert` + ลองใหม่

### 7.2 `/demo-chat` (ฝั่งร้าน)

สองส่วน: (ก) `SectionCard` "ลองคุยในฐานะลูกค้า" มี thread แบบลูกค้า (ใช้คอมโพเนนต์ `CustomerChatView` เดียวกับหน้าสาธารณะ ผูก endpoint ของ §3.2) + ปุ่ม "เริ่มแชตใหม่" + ป้าย "คุณกำลังคุยในฐานะลูกค้าทดลอง ข้อความจะเข้ามาในแชตของร้านด้วย" (ข) `SectionCard` "ลิงก์ Demo Chat สำหรับผู้ทดลอง": สวิตช์เปิด/ปิด, ช่อง slug, ข้อความต้อนรับ, คำถามแนะนำ ≤ 4, URL + ปุ่มคัดลอก + QR (ไลบรารี `qrcode` สร้าง data URL ในเบราว์เซอร์ หรือ `QRCode.toDataURL`) + "วันนี้ใช้ไป X จาก Y ข้อความ" (X = `todayTurns`, Y = `dailyCap`) · บันทึกแล้วขึ้น toast · slug ซ้ำ → ข้อความที่ฟิลด์

### 7.3 `/demo-chat/s/:slug` (สาธารณะ, mobile-first, สองภาษา th/en)

เป้าหมาย: เปิดบน iPhone/Android ขนาด 360–430 px ไม่เลื่อนแนวนอน ใช้นิ้วโป้งพิมพ์ได้สบาย

- โครง: `height: 100dvh` (fallback `100vh`) flex column · **header** สูง 56 px: ชื่อร้าน + ป้ายเล็ก "ร้านตัวอย่างสำหรับทดลอง · Endless" (ซื่อตรงว่าเป็นเดโม ไม่แอบอ้างเป็นร้านจริง) + เมนู ⋮ (เริ่มแชตใหม่) · **รายการข้อความ** `overflow-y: auto`, `overscroll-behavior: contain`, padding 12 · **composer** ติดล่าง `position: sticky; bottom: 0`, `padding-bottom: env(safe-area-inset-bottom)`, ช่องพิมพ์ฟอนต์ ≥ 16 px (กัน iOS ซูม), ปุ่มส่งวงกลม 44×44 px · `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` และ `<meta name="robots" content="noindex">` ตั้งใน effect ของหน้า
- ธีมเดียวกับ MUI theme ของแอป (teal) แต่ไม่ใช้ AppShell · ไม่มี dark mode
- **ภาษาของหน้า (กรรมการที่ใช้อังกฤษต้องใช้หน้านี้ได้ทั้งหน้า):** หน้านี้ไม่มี AppShell จึงต้องมีตัวสลับภาษาของตัวเองใน header: ปุ่ม `TH | EN` (test id `demo-chat-lang`, `aria-label` จาก `public.language`) · ภาษาเริ่มต้นตามลำดับ: `localStorage 'nless.lang'` (ผู้ใช้เคยเลือก) → `navigator.language` ขึ้นต้น `th` = ไทย, ภาษาอื่นทั้งหมด = อังกฤษ → `DemoChatShopView.language` เมื่ออ่านจากเบราว์เซอร์ไม่ได้ · เลือกแล้วบันทึกลง `localStorage 'nless.lang'` และตั้ง `document.documentElement.lang` · ทุกข้อความของหน้า (ป้าย, placeholder, สถานะ, ข้อผิดพลาด, ป้ายบนการ์ดและปุ่มยืนยัน/ยกเลิก) มาจาก key `public.*` / `parts.*` ของตาราง §7.4 **ห้าม hard-code ไทย** · ภาษาของหน้าไม่ได้กำหนดภาษาที่ AI ตอบ: AI ตอบตามข้อความที่ลูกค้าพิมพ์ (F10 §5.13) ลูกค้าเปิดหน้าไทยแล้วพิมพ์อังกฤษได้คำตอบอังกฤษ
- ข้อความต้อนรับและคำถามแนะนำตามภาษาของหน้า: หน้าไทยใช้ `welcomeText` / `suggestedQuestions` · หน้าอังกฤษใช้ `welcomeTextEn` / `suggestedQuestionsEn` · ค่าที่ร้านไม่ได้กรอกสำหรับภาษานั้น = ข้อความต้อนรับเริ่มต้น `public.welcome` ของภาษานั้น และไม่แสดง chips (ไม่เอาคำถามไทยไปโชว์ในหน้าอังกฤษ) · ฟอร์มตั้งค่าใน `/demo-chat` (§7.2) มีช่องคู่ "ไทย" และ "English" ของทั้งสองอย่าง
- ข้อความต้อนรับ (ฝั่งหน้าจอ ไม่เก็บเป็นแถว messages): `welcomeText` หรือค่าเริ่มต้น "สวัสดีค่ะ ยินดีต้อนรับสู่ {{shop}} ลองถามเรื่องสินค้า ราคา หรือบริการได้เลยนะคะ" · ใต้ข้อความต้อนรับมี chips คำถามแนะนำ (จาก `suggestedQuestions`; แตะ = ส่งเป็นข้อความ) ซ่อนหลังส่งข้อความแรก
- **ตัวบอกสถานะ**: "กำลังพิมพ์…" (สามจุดกระพริบ) ตั้งแต่ส่งข้อความสำเร็จจนมีข้อความตอบหรือ `pending = null` · เกิน 60 วินาที → ข้อความ "ตอบช้ากว่าปกติ รอสักครู่หรือลองส่งใหม่นะคะ" · `pending.state = 'failed'` → ข้อความ "ขออภัยค่ะ ระบบตอบกลับไม่สำเร็จ ลองส่งอีกครั้งนะคะ" + ปุ่ม "ส่งอีกครั้ง"
- ข้อความของลูกค้าเอง: แสดงทันที (optimistic, `sending`), สำเร็จ → "ส่งแล้ว", ล้ม → "ส่งไม่สำเร็จ แตะเพื่อลองใหม่" (ใช้ `clientRequestId` เดิม จึงไม่ซ้ำ)
- ข้อผิดพลาดที่ต้องมีข้อความเฉพาะทั้งสองภาษา (key `public.errors.*` ใน §7.4; ข้อความไทยข้างล่างคือค่า th): `RATE_LIMITED visitor|ip` "ส่งถี่เกินไปค่ะ รอสักครู่แล้วลองใหม่นะคะ" · `daily_cap` "วันนี้มีผู้ทดลองใช้ Demo Chat ครบโควตาแล้วค่ะ ขอบคุณที่สนใจนะคะ ลองใหม่พรุ่งนี้ หรือสแกน QR LINE ที่โต๊ะได้เลยค่ะ" · `visitor_daily` "คุณทดลองครบจำนวนข้อความของวันนี้แล้วค่ะ ขอบคุณที่ลองใช้นะคะ" · `POLICY_BLOCKED moderation` "ขออภัยค่ะ ข้อความนี้ส่งไม่ได้ ลองเปลี่ยนคำแล้วส่งใหม่นะคะ" · ข้อความยาวเกิน (นับตัวอักษร `n/500` โชว์เมื่อเกิน 400) · `NOT_FOUND` (slug) "ไม่พบแชตตัวอย่างนี้ หรือปิดใช้งานอยู่ค่ะ"
- การ์ดสินค้า/สรุปออเดอร์/นัด/ปุ่ม ตามตัว render ใน §7.1 โหมด `customer` · ปุ่มยืนยัน → `POST /actions` → ระหว่างรอปุ่ม disabled + spinner · สำเร็จ → ป้าย "ยืนยันแล้ว" (ข้อความผลจาก F13/F15 มาทาง poll) · `PROPOSAL_EXPIRED` "สรุปรายการหมดอายุแล้วค่ะ พิมพ์ขอสรุปใหม่ได้เลยนะคะ"
- เมื่อร้านปิด AI (`aiEnabled=false`): แถบข้อความบนสุด "ร้านนี้ปิดการตอบอัตโนมัติอยู่ ข้อความจะส่งถึงทีมงานค่ะ"
- token: เรียก `POST /session` ตอนเปิดหน้า (ส่ง token เดิมจาก cookie ถ้ามี) → เขียน cookie `nless_demo_visitor` · ถ้า `document.cookie` เขียนไม่ได้ ใช้ header `X-Demo-Visitor` จาก memory (เปิดใหม่ = ผู้เยี่ยมชมใหม่)
- เข้าถึงได้: `aria-live="polite"` บนรายการข้อความ, ปุ่มมี `aria-label`, ความคมชัดตาม MUI

### 7.3.1 test id คงที่ (lane อื่นใช้ใน Playwright smoke: F10 F38 F13 F14 · ห้ามเปลี่ยนชื่อ)

| test id | ที่ไหน | ความหมาย |
|---|---|---|
| `demo-chat-input` | หน้า `/demo-chat/s/:slug` (และ tester `/demo-chat`) | ช่องพิมพ์ข้อความ (`textarea` หรือ `input`) |
| `demo-chat-send` | เหมือนกัน | ปุ่มส่ง |
| `demo-chat-message` | เหมือนกัน, หนึ่งอันต่อ bubble | มี `data-author="customer\|ai\|staff\|system"` และ `data-message-id` · bubble ของ part หลายชนิดในข้อความเดียวอยู่ใน element เดียว |
| `inbox-message` | thread ของ `/chat` หนึ่งอันต่อข้อความ | มี `data-author`, `data-direction`, `data-origin`, `data-message-id` |
| `order-review-confirm` / `order-review-cancel` | ปุ่มของ part `order_review` ใน Demo Chat (และ tester) | กดแล้วเรียก action route ของ F09 → `createOrderFromProposal` stage `confirm` (F13 เป็นผู้ส่งข้อความยืนยัน) |
| `booking-review-confirm` / `booking-review-cancel` | ปุ่มของ part `booking_review` | เหมือนกัน → `createBooking` stage `confirm` (F15 เป็นผู้ส่งข้อความยืนยัน) |
| `message-delivery-error` | ใต้ bubble ขาออกที่ส่งไม่สำเร็จใน `/chat` | แสดง `delivery.error` ที่ sender คืนมา (เช่น Meta นอกหน้าต่าง 24 ชั่วโมง, LINE push ถูกบล็อก) เป็นข้อความไทยสั้น ๆ |

กติกา render ตาม origin: ข้อความ `author: 'ai'` ที่ `origin: 'system'` (follow-up nudge ของ F38) หรือ `origin: 'broadcast'` (F23) แสดงเป็น bubble ขาออกปกติทั้งใน inbox และ Demo Chat (ไม่ซ่อน ไม่ทำเป็นโน้ตระบบ) · เฉพาะ inbox เพิ่มป้ายเล็ก (`inbox.origin.system` "ข้อความอัตโนมัติ", `inbox.origin.broadcast` "บรอดแคสต์", `inbox.origin.comment` "จากคอมเมนต์") ใต้ bubble · Demo Chat ไม่มีป้าย · ตัวกรองซ่อนใน poll คือ `author = 'system'` เท่านั้น (ไม่ใช่ `origin`)

Demo Chat ฝั่งลูกค้าต้อง render `ImagePart` (เช่นรูป QR ชำระเงินของ F14) และปุ่มของ `action_buttons` ที่เป็นลิงก์ (เปิดหน้าชำระเงิน `/payments/pay/:token` ในแท็บใหม่) ได้ครบ เพราะลูกค้าบนเว็บส่งสลิปผ่านหน้านั้น · ข้อความที่ C2 บันทึกเองด้วย `saveMessage` (`author: 'ai'`, `origin: 'comment'`) แสดงเป็น bubble ขาออกปกติเช่นกัน

### 7.4 ตาราง i18n (namespace `inbox`; th ก่อน, en คู่กัน; ปุ่มและข้อความฝั่งร้านไม่มี ค่ะ/ครับ; ข้อความฝั่งลูกค้ามี ค่ะ/นะคะ)

| key | th | en |
|---|---|---|
| `menu.title` | แชต | Chat |
| `menu.demoChat` | Demo Chat | Demo Chat |
| `page.title` | แชต | Chat |
| `list.search` | ค้นหาชื่อลูกค้าหรือข้อความ | Search customer or message |
| `list.filter.all` | ทั้งหมด | All |
| `list.filter.waiting` | รอตอบ | Waiting |
| `list.filter.active` | กำลังคุย | Active |
| `list.filter.closed` | ปิดแล้ว | Closed |
| `list.assignee.all` | ผู้ดูแลทั้งหมด | All assignees |
| `list.assignee.me` | ของฉัน | Mine |
| `list.assignee.unassigned` | ยังไม่มีผู้ดูแล | Unassigned |
| `list.waitingFor` | รอตอบ · {{minutes}} นาที | Waiting · {{minutes}} min |
| `list.loadMore` | โหลดเพิ่ม | Load more |
| `list.empty.title` | ยังไม่มีแชต | No chats yet |
| `list.empty.description` | เมื่อลูกค้าทักเข้ามา แชตจะแสดงที่นี่ | Chats appear here when customers message you |
| `list.empty.search` | ไม่พบแชตที่ตรงกับคำค้น | No chats match your search |
| `list.customerFallback` | ลูกค้า {{suffix}} | Customer {{suffix}} |
| `thread.select` | เลือกแชตเพื่อเริ่มดู | Select a chat to start |
| `thread.loadOlder` | ดูข้อความเก่ากว่า | Load older messages |
| `thread.newMessages` | ข้อความใหม่ | New messages |
| `thread.assignedTo` | ดูแลโดย {{name}} | Handled by {{name}} |
| `thread.waitingQueue` | รอพนักงานรับช่วง | Waiting for staff |
| `thread.closedBanner` | แชตนี้ปิดแล้ว ลูกค้าทักใหม่จะเปิดแชตใหม่ | This chat is closed. A new message opens a new chat |
| `thread.aiTyping` | AI กำลังตอบ… | AI is replying… |
| `thread.notFound` | ไม่พบแชตนี้ | Chat not found |
| `channel.web` | เว็บ (Demo Chat) | Web (Demo Chat) |
| `channel.line` | LINE | LINE |
| `channel.facebook` | Messenger | Messenger |
| `channel.instagram` | Instagram | Instagram |
| `author.ai` | AI | AI |
| `author.system` | ระบบ | System |
| `origin.system` | ข้อความอัตโนมัติ | Automatic message |
| `origin.broadcast` | บรอดแคสต์ | Broadcast |
| `origin.comment` | จากคอมเมนต์ | From a comment |
| `delivery.sandbox` | Sandbox · ไม่ได้ส่งถึงลูกค้าจริง | Sandbox · not sent to the customer |
| `delivery.retry` | ส่งซ้ำ | Resend |
| `composer.placeholder` | พิมพ์ข้อความถึงลูกค้า… | Type a message to the customer… |
| `composer.send` | ส่ง | Send |
| `composer.attach` | แนบรูปหรือไฟล์ | Attach image or file |
| `composer.takeoverHint` | ส่งข้อความนี้จะรับช่วงแชตจาก AI (AI จะหยุดตอบแชตนี้) | Sending takes over this chat from the AI (the AI stops replying here) |
| `composer.readOnly` | คุณดูแชตได้อย่างเดียว | You can view this chat only |
| `composer.uploadFailed` | แนบไฟล์ไม่สำเร็จ | Could not attach the file |
| `composer.sendFailed` | ส่งไม่สำเร็จ ลองอีกครั้ง | Could not send. Try again |
| `conflict.title` | รับช่วงต่อหรือไม่? | Take over? |
| `conflict.message` | {{name}} ดูแลแชตนี้อยู่ ต้องการรับช่วงต่อและส่งข้อความหรือไม่ | {{name}} is handling this chat. Take over and send? |
| `conflict.confirm` | รับช่วงต่อและส่ง | Take over and send |
| `closed.cannotSend` | แชตนี้ปิดแล้ว ส่งข้อความไม่ได้ | This chat is closed and cannot be sent to |
| `parts.waitingCustomer` | รอลูกค้ากดยืนยัน | Waiting for the customer to confirm |
| `parts.soldOut` | หมด | Sold out |
| `parts.subtotal` | ยอดสินค้า | Subtotal |
| `parts.delivery` | ค่าจัดส่ง | Shipping |
| `parts.total` | ยอดรวม | Total |
| `parts.expires` | หมดอายุ {{time}} | Expires {{time}} |
| `parts.confirm` | ยืนยัน | Confirm |
| `parts.cancel` | ยกเลิก | Cancel |
| `parts.confirmed` | ยืนยันแล้ว | Confirmed |
| `parts.cancelled` | ยกเลิกแล้ว | Cancelled |
| `parts.expired` | หมดอายุ | Expired |
| `parts.download` | ดาวน์โหลด {{name}} | Download {{name}} |
| `demo.title` | Demo Chat | Demo Chat |
| `demo.asCustomer` | ลองคุยในฐานะลูกค้า | Try chatting as a customer |
| `demo.asCustomerHint` | คุณกำลังคุยในฐานะลูกค้าทดลอง ข้อความจะเข้ามาในแชตของร้านด้วย | You are chatting as a test customer. Messages also appear in your inbox |
| `demo.reset` | เริ่มแชตใหม่ | Start over |
| `demo.link.title` | ลิงก์ Demo Chat สำหรับผู้ทดลอง | Demo Chat link for visitors |
| `demo.link.enabled` | เปิดให้เข้าผ่านลิงก์ | Open to anyone with the link |
| `demo.link.slug` | ชื่อในลิงก์ | Link name |
| `demo.link.welcome` | ข้อความต้อนรับ | Welcome message |
| `demo.link.suggested` | คำถามแนะนำ (สูงสุด 4) | Suggested questions (max 4) |
| `demo.link.copy` | คัดลอกลิงก์ | Copy link |
| `demo.link.copied` | คัดลอกแล้ว | Copied |
| `demo.link.usage` | วันนี้ใช้ไป {{used}} จาก {{cap}} ข้อความ | Used {{used}} of {{cap}} messages today |
| `demo.link.slugTaken` | ชื่อนี้ถูกใช้แล้ว | This name is taken |
| `public.badge` | ร้านตัวอย่างสำหรับทดลอง · Endless | Demo shop for trying Endless |
| `public.welcome` | สวัสดีค่ะ ยินดีต้อนรับสู่ {{shop}} ลองถามเรื่องสินค้า ราคา หรือบริการได้เลยนะคะ | Welcome to {{shop}}! Ask about products, prices or services |
| `public.placeholder` | พิมพ์ข้อความ… | Type a message… |
| `public.send` | ส่ง | Send |
| `public.typing` | กำลังพิมพ์… | Typing… |
| `public.slow` | ตอบช้ากว่าปกติ รอสักครู่หรือลองส่งใหม่นะคะ | Taking longer than usual. Wait a moment or send again |
| `public.failed` | ขออภัยค่ะ ระบบตอบกลับไม่สำเร็จ ลองส่งอีกครั้งนะคะ | Sorry, the reply failed. Please send again |
| `public.retry` | ส่งอีกครั้ง | Send again |
| `public.sending` | กำลังส่ง… | Sending… |
| `public.sent` | ส่งแล้ว | Sent |
| `public.sendFailed` | ส่งไม่สำเร็จ แตะเพื่อลองใหม่ | Not sent. Tap to retry |
| `public.reconnecting` | กำลังเชื่อมต่อใหม่… | Reconnecting… |
| `public.aiOff` | ร้านนี้ปิดการตอบอัตโนมัติอยู่ ข้อความจะส่งถึงทีมงานค่ะ | Auto-replies are off. Your message goes to the team |
| `public.errors.rate` | ส่งถี่เกินไปค่ะ รอสักครู่แล้วลองใหม่นะคะ | Too fast. Please wait a moment |
| `public.errors.cap` | วันนี้มีผู้ทดลองใช้ Demo Chat ครบโควตาแล้วค่ะ ขอบคุณที่สนใจนะคะ ลองใหม่พรุ่งนี้ หรือสแกน QR LINE ที่โต๊ะได้เลยค่ะ | Today's Demo Chat limit is reached. Try again tomorrow or scan the LINE QR at our table |
| `public.errors.visitorDaily` | คุณทดลองครบจำนวนข้อความของวันนี้แล้วค่ะ ขอบคุณที่ลองใช้นะคะ | You have used today's message allowance. Thank you for trying |
| `public.errors.moderation` | ขออภัยค่ะ ข้อความนี้ส่งไม่ได้ ลองเปลี่ยนคำแล้วส่งใหม่นะคะ | Sorry, this message cannot be sent. Try rewording it |
| `public.errors.tooLong` | ข้อความยาวเกิน {{max}} ตัวอักษรค่ะ | Message is over {{max}} characters |
| `public.errors.notFound` | ไม่พบแชตตัวอย่างนี้ หรือปิดใช้งานอยู่ค่ะ | This demo chat was not found or is turned off |
| `public.errors.expired` | สรุปรายการหมดอายุแล้วค่ะ พิมพ์ขอสรุปใหม่ได้เลยนะคะ | This summary expired. Ask for a new one |
| `public.errors.generic` | เกิดข้อผิดพลาดค่ะ ลองใหม่อีกครั้งนะคะ | Something went wrong. Please try again |
| `public.language` | เปลี่ยนภาษา | Change language |
| `public.confirmed` | ยืนยันแล้ว | Confirmed |
| `demo.link.welcomeEn` | ข้อความต้อนรับ (อังกฤษ) | Welcome message (English) |
| `demo.link.suggestedEn` | คำถามแนะนำ (อังกฤษ) | Suggested questions (English) |
| `public.reset` | เริ่มแชตใหม่ | Start a new chat |
| `public.charCount` | {{n}}/{{max}} | {{n}}/{{max}} |

## 8. Jobs, schedules, events

- **Jobs ของ F09: ไม่มี** (job `ai.reply` เป็นของ F10; `core.deliver` ของ core) · F09 enqueue `ai.reply` ด้วย dedupKey `ai.reply:<messageId>` และ lockKey `conversation:<conversationId>` ตาม contract
- **Realtime ที่ publish**: `message.created` (ทุก `saveMessage` ที่ `created:true`) · `conversation.updated` (conversation ใหม่/เปิดใหม่) · `custom` `{ featureId:'F09', name:'inbox.read' }` · `custom` `{ featureId:'F09', name:'demo.reset' }` · F09 ไม่ publish `message.updated` (core ทำ)
- **in-process notifier** `notifyConversation(id)` (ไม่ข้ามโปรเซส; ถ้าอนาคตมีหลาย instance ต้องเปลี่ยนเป็น Postgres LISTEN/NOTIFY)
- **Audit**: `inbox.demo_chat.settings.update` (details: enabled, slug) · `inbox.demo_chat.reset` (targetId = conversationId) · ข้อความไม่ audit (ตัว `messages` คือหลักฐาน)
- **notify()**: ไม่ใช้ใน F09

## 9. Seed และ fixtures

`server/src/features/inbox/seed.ts` (default export `FeatureSeed` `dependsOn: ['core']` + `runDemo` + `resetDemo`):

- **seed สองภาษา:** ร้าน A `welcome_text_en` = "Hi! Welcome to Demo Boardgame Shop. Ask about games, prices or opening hours." · `suggested_questions_en` = `["How much is A-GAME-01?","What time do you open?","How much is shipping?"]` · ร้าน B `welcome_text_en` = "Hi! Welcome to Demo Repair Studio. Ask about our services or prices." · `suggested_questions_en` = `["How much is B-KIT-01?","Which days are you open?"]`
- `run`: `demo_chat_settings` ร้าน A: `enabled=true`, slug `demo-boardgame`, welcome "สวัสดีค่ะ ยินดีต้อนรับสู่ Demo Boardgame Shop ลองถามเรื่องเกม ราคา หรือเวลาเปิดร้านได้เลยนะคะ", suggestedQuestions `["A-GAME-01 ราคาเท่าไหร่คะ","ร้านเปิดกี่โมงคะ","ค่าส่งเท่าไหร่คะ"]` · ร้าน B: `enabled=true`, slug `demo-repair`, welcome "สวัสดีครับ ยินดีต้อนรับสู่ Demo Repair Studio ถามเรื่องบริการหรือราคาได้เลยครับ", suggestedQuestions `["B-KIT-01 ราคาเท่าไหร่ครับ","เปิดวันไหนบ้างครับ"]` · `ON CONFLICT (business_id) DO NOTHING` · conversations/messages ของ SEED (`conv_a_ai`, `conv_a_staff`, `conv_b_ai`, `conv_b_staff`) core seed เขียนให้แล้ว F09 ไม่เขียนซ้ำ
- `runDemo` (ข้อมูลสมจริงสำหรับกรรมการ ร้าน A เท่านั้น ผ่าน `saveMessage({ triggerAi: false, externalId: 'seed-demo:<alias>:<n>' })` จึง idempotent): 8 ลูกค้า (LINE 4, Messenger 2, Instagram 1, web 1) · 2 แชต "รอตอบ" (ข้อความลูกค้าล่าสุดไม่มีคนตอบ, เวลาย้อนหลัง 6 และ 25 นาที โดยส่ง `occurredAt`) · 1 แชตมีประวัติ 45 ข้อความ (ทดสอบแบ่งหน้า) และมีคำตอบ AI 3 ท่อนใช้ `groupId` เดียว · 1 แชตมี `product_card` ของ `A-GAME-01` และ `order_review` ตัวอย่างที่หมดอายุแล้ว (แสดงสถานะ "หมดอายุ") · 1 แชตปิดแล้ว · ข้อความไทยธรรมชาติ เช่น "พี่คะ A-CARD-01 มีของไหมคะ", "ส่งต่างจังหวัดกี่วันคะ", "ขอใบเสร็จด้วยนะคะ"
- `resetDemo(ctx)`: ลบ customers ของร้านเดโม A และ B ที่ `external_id LIKE 'demo-visitor:%' OR 'demo:%' OR 'seed-demo:%'` (cascade ไป conversations/messages) + ลบ `demo_chat_daily_turns` ของสองร้าน · **ไม่ลบแถว SEED** (`Udemo-a-customer-one` ฯลฯ) · ไม่แตะ `demo_chat_settings`
- fixture ของ test (สร้างด้วยโค้ด): `makeVisitorToken(visitorId?)` (ใช้ `signVisitorToken` ตัวเดียวกับ production) · `simulateInbound(agent, businessId, text, externalId?)` จาก `test-utils` ของ core · ลูกค้าใหม่ทุก test ใช้ externalId `t-<uuid>`

## 10. Tests

Unit/service (`inbox.service.test.ts`, vitest, `MODEL_MODE=fake`):
1. `saveMessage` inbound ใหม่ → สร้าง customer+conversation+message seq 1, `created:true`, `aiJobId` มีค่า, job type `ai.reply` dedupKey `ai.reply:<id>` lockKey `conversation:<cid>`
2. externalId เดิมสองครั้ง → message เดียว, ครั้งที่สอง `created:false`, `aiJobId:null`, นับ job `ai.reply` ของข้อความนี้ = 1
3. externalId เดียวกันแต่คนละ channel → สองแถว (unique ต่อ business+channel)
4. externalId เดียวกันแต่คนละ business → สองแถว
5. `triggerAi:false` และ outbound และ origin `broadcast` → ไม่ enqueue
6. heal: ลบ job แล้วเรียกซ้ำด้วย externalId เดิมภายใน 5 นาที → enqueue ใหม่ได้ 1 job
7. `conversationId` ของร้านอื่น → `NOT_FOUND` · parts ว่าง → `VALIDATION_ERROR` · link `javascript:` ใน action_buttons → `VALIDATION_ERROR`
8. seq ต่อเนื่อง 1..N ภายใต้ 20 การเรียกพร้อมกัน (`Promise.all`) ไม่ซ้ำ ไม่ข้าม
9. inbound บน conversation ที่ปิดแล้ว → ได้ conversation ใหม่ที่เปิด; `unread_count` +1; staff outbound → `unread_count = 0`
10. `getHistory`: 95 ข้อความ limit 30 → 3 หน้ารวม 95 ไม่ซ้ำ; ลำดับ ASC; `before`+`after` → `VALIDATION_ERROR`; limit 0/101/1.5 → `VALIDATION_ERROR`; cursor เสีย → `VALIDATION_ERROR`; conversation ไม่มี → ว่าง; `businessId` ผิด → ว่าง
11. group ไม่ถูกตัด: 5 ข้อความ group เดียวคร่อมขอบหน้า → ครบอยู่หน้าเดียว
12. `getConversation` ร้านอื่น/ไม่มี/ไม่ใช่ uuid → `null`
13. `partsToText` ครบทุกชนิด · `getCustomerLastInboundAt` ข้ามหลาย conversation, ลูกค้าร้านอื่น → null
14. `sendStaffMessage`: handler ai → ถูก assign เป็น actor แล้วส่ง · ผู้ดูแลเป็นคนอื่น → `VERSION_CONFLICT` details.holder · conversation ปิด → `POLICY_BLOCKED` · fileId ของร้านอื่น → `VALIDATION_ERROR` · ไม่มี takeover permission (เรียกผ่าน route) → 403 · ส่งล้ม (mock `sendToCustomer` throw) → ผู้ดูแลยังเป็น actor
15. `saveChatAttachment`: นามสกุล/MIME ไม่ตรง signature → `VALIDATION_ERROR`; ใหญ่เกิน → `VALIDATION_ERROR`; รูปที่ `[flag]` ไม่ได้ (fake moderation ใช้ text จึงไม่ flag รูป: ทดสอบด้วย mock `model.moderate` คืน flagged)
16. visitor token: ปลอม/แก้ค่า/หมดอายุ → ผิด; ค่าถูก → ผ่าน

Route (supertest + `loginAs`):
17. list: `filter` ค่าแปลก → ทำงานเหมือน `all`; `waiting` ⊂ `active`; cursor composite ไม่มีแถวหลุดเมื่อเวลาเท่ากัน (สร้าง 5 แชต `last_message_at` เท่ากัน limit 2 ผ่านครบ 5); `search` ที่มี `%` ไม่ทำให้ match ทุกแถว; `assignee=me|unassigned|uuid`; `assignee=xyz` → 400; waiting รอ 6 นาที ขึ้นก่อนแชตเปิดอื่น (clock fixture)
18. tenant: owner A เรียก `/conversations/<conv_b_ai id>` และ `/messages` และ `/read` และ `/staff-messages` → **404** ทั้งหมด · ไม่มี `chat.read` (staff ที่ถอดสิทธิ์) → 403 · ไม่มี `chat.reply` → ส่งได้ 403 · ผู้ใช้ B เรียก list ของ business A → 404
19. assignee ที่ถูก revoke → `assigneeName` null และนับเป็น unassigned
20. `POST /staff-messages` ซ้ำด้วย `clientRequestId` เดิม → `SendReceipt` ของข้อความเดิม ไม่มีแถวใหม่
21. อัปโหลด: ไฟล์ร้านอื่นดาวน์โหลดผ่าน `/chat/files/:id` ของร้านเรา → 404
22. Demo Chat สาธารณะ: session ออก token · ไม่มี token ส่งข้อความ → `AUTH_REQUIRED` · ส่งได้ 1 ข้อความ → customer `demo-visitor:<id>` 1 แถว conversation 1 แถว · ส่งซ้ำด้วย `clientRequestId` เดิม → `created:false` และ `turns` ไม่เพิ่ม · ข้อความ 501 ตัว → 400 · ข้อความมี `[flag]` → `POLICY_BLOCKED` และไม่มีแถว messages ใหม่ และ `blocked` +1 · 7 ข้อความใน 1 นาที → ข้อที่ 7 `RATE_LIMITED reason 'visitor'` · ตั้ง `DEMO_CHAT_DAILY_TURN_CAP=2` → ข้อความที่ 3 ของ visitor ต่างคน → `RATE_LIMITED reason 'daily_cap'` และ turns คงที่ 2 · slug ปิด/ไม่มี → 404 · slug ร้าน A กับ token เดียวกันที่ร้าน B → ได้ customer แยกกัน ไม่เห็นข้อความข้ามร้าน · poll ใช้ identity ไม่รับ conversationId จาก client · poll `waitMs=2000` ตื่นเมื่อมี `saveMessage` ใหม่ภายใน 500 ms · `pending` เป็น `typing` ขณะ job queued, `failed` เมื่อ job dead · `files/:id` ที่ไม่อยู่ในแชตของ visitor → 404
23. action: `kind:'order'` ที่ proposalId ไม่อยู่ในแชต → 404 · กับ fake F13 (`SERVICE_NOT_READY`) → ส่ง code ต่อ ไม่ถือว่าสำเร็จ
24. reset: ปิด conversation แล้วข้อความถัดไปเปิดแถวใหม่ (conversation ต่างกัน)
25. settings: PUT slug ซ้ำกับร้านอื่น → `IDEMPOTENCY_CONFLICT`; ไม่มี `insights.demo` → 403; audit เขียน
26. gate E2E ใน vitest: `simulate-inbound` → `drainJobs()` → ข้อความ ai อยู่ใน history (ใช้ fake F10 handler) → staff takeover (`assignConversation`) → inbound ถัดไปไม่มีข้อความ ai ใหม่

Playwright smoke `web/src/features/inbox/e2e/inbox.smoke.spec.ts` (กับ production; marker `e2eMarker()`):
- `public demo chat works on a phone viewport`: viewport 390×844, เปิด `/demo-chat/s/demo-boardgame` (context ไม่มี cookie ล็อกอิน) → เห็นชื่อร้านและช่องพิมพ์ ไม่มี scroll แนวนอน (`scrollWidth <= innerWidth`) → พิมพ์ `A-GAME-01 ราคาเท่าไหร่ครับ <marker>` → เห็นข้อความของตัวเองทันที → เห็น "กำลังพิมพ์…" → ภายใน 40 วินาทีมีข้อความ AI มี "1,490" → reload → ข้อความทั้งสองยังอยู่
- `owner sees the demo conversation in the inbox`: `ownerPage` เปิด `/chat` ค้นหา marker → แถวขึ้น → เปิดแล้วเห็นข้อความลูกค้าและคำตอบ AI
- `tenant isolation`: ด้วย fixture `api` (owner A) เรียก `GET /api/v1/conversations/00000000-0000-4000-8000-0000000b4001` → 404
- `public chat blocks bad input`: ส่งข้อความ 501 ตัว → เห็นข้อความ "ยาวเกิน" และไม่มีข้อความใหม่ในแชต
- `public demo chat works in English`: context ใหม่ `locale: 'en-US'` viewport 390×844 เปิด `/demo-chat/s/demo-boardgame` → placeholder `Type a message…`, ข้อความต้อนรับอังกฤษ และ chip `How much is A-GAME-01?` แสดง (ไม่มีอักษรไทยนอกชื่อร้าน/ชื่อสินค้า) → แตะ chip → คำตอบของ AI มี `1,490 baht` → กด `demo-chat-lang` เป็น TH → placeholder เป็น `พิมพ์ข้อความ…` และแชตเดิมยังอยู่ → reload แล้วยังเป็นภาษาที่เลือก
- `demo link settings`: `ownerPage` เปิด `/demo-chat` เห็น URL ของลิงก์และตัวเลข "ใช้ไป … จาก …"
- ทุก case ปลอดภัยกับ production: ใช้ visitor ใหม่และ marker, ไม่แตะข้อมูลร้าน B ยกเว้นข้อ tenant isolation (อ่านอย่างเดียว) · ใช้ 1–2 turn ต่อรัน

## 11. Acceptance: R ตาม D6

เป็น R เมื่อผ่านทุกข้อ:
- [ ] `saveMessage` `getConversation` `getHistory` เป็นของจริงตาม contracts.ts บน production และ test 1–16 ผ่าน
- [ ] ส่งจาก Demo Chat สาธารณะบนมือถือ → persist → reload ยังเห็นทั้งข้อความลูกค้าและคำตอบ AI (gate ขั้น 2, 4)
- [ ] **สองภาษา:** หน้า Demo Chat สาธารณะและหน้า `/chat`, `/demo-chat` ใช้ได้ครบทั้ง th และ en (ตัวสลับภาษาทำงาน, ไม่มีข้อความ hard-code, empty/error/toast ครบสองภาษา) · `getCustomerLanguage` เป็นของจริงและ test ผ่าน · smoke `public demo chat works in English` ผ่านบน production
- [ ] inbox `/chat` แสดงรายการ ค้นหา กรอง รอตอบ แบ่งหน้า ได้ และข้อความใหม่ขึ้นสดผ่าน `/ws` (หรือ poll สำรองที่จดใน EVIDENCE.md)
- [ ] history 3 หน้าไม่ซ้ำไม่ข้าม และ reply หลาย part ไม่ถูกตัดข้ามหน้า
- [ ] tenant A เปิดแชตของ B ได้ 404 · ไม่มี `chat.read` ได้ 403 (ยิง API ตรง)
- [ ] provider event เดิม 2 ครั้ง → message เดียว `created:false` ไม่มี `ai.reply` ที่สอง
- [ ] staff ส่งจากเว็บ: รับช่วงอัตโนมัติ, ป้ายส่งตามผลจริงของ sender (pending → sent/failed), ส่งซ้ำไม่เกิดข้อความซ้ำ
- [ ] Demo Chat สาธารณะ: rate limit (visitor/ip), ความยาว, moderation, เพดานรายวัน และ visitor รายวัน ทำงานและแสดงข้อความไทย; ไม่มีทางเรียก OpenAI โดยไม่ผ่านด่านเหล่านี้
- [ ] การ์ดสินค้า/สรุปออเดอร์/นัด/ปุ่ม ของ Demo Chat render ถูกและปุ่มยืนยันเรียก F13/F15 จริง (ถ้า F13/F15 ยังไม่ merge ปุ่มแสดงข้อผิดพลาด "ยังยืนยันไม่ได้" ตามจริง ไม่แกล้งสำเร็จ — F09 ยังนับ R ได้เพราะส่วนนี้ขึ้นกับ A2/A3)
- [ ] ข้อความไทยผ่าน i18n · loading/empty/error ครบ · Playwright smoke รันกับ production ผ่าน
- ลดเป็น **S** ถ้าไม่มี live refresh ทั้ง `/ws` และ poll · ลดเป็น **A** ถ้า Demo Chat สาธารณะไม่มี rate limit/เพดาน (ห้ามเปิดเมนู/ลิงก์สาธารณะ) · status floor = R เพราะอยู่บน gate

## 12. Security และ privacy

- **tenant**: ทุก SQL มี `business_id` · conversation ที่ไม่ใช่ของร้านผู้เรียก = 404 (ไม่บอกว่ามี) · route แบบ `:conversationId` เรียก `requireBusiness` ก่อนอ่านข้อมูลอื่น · public routes หา business จาก slug เท่านั้น ไม่รับ `businessId` จาก client
- **IDOR ของ Demo Chat**: ผู้เยี่ยมชมไม่ส่ง `conversationId` เลย (หาเองจาก identity) · ไฟล์เปิดได้เฉพาะที่อยู่ในแชตของตัวเอง · ข้อความที่คืนให้ผู้เยี่ยมชมตัดข้อมูลภายใน (`authorUserId`, `providerMeta`, `delivery.error`, ข้อความ `system`)
- **token**: HMAC-SHA256 ด้วย `SESSION_SECRET`, เทียบ constant-time · cookie ไม่ใช่ session ของแอป ได้เฉพาะสิทธิ์ส่ง/อ่านแชตของตัวเองในร้านเดโม · ถ้า cookie รั่วจะกระทบแชตเดโมของคนนั้นคนเดียว
- **งบ**: ด่าน 5 ชั้นก่อนถึง AI (ip, visitor, ความยาว, moderation, เพดานร้านต่อวัน + visitor ต่อวัน) · ปรับ `DEMO_CHAT_DAILY_TURN_CAP` ใน Render env ได้ทันที · ปิดลิงก์ได้จากหน้า `/demo-chat` (`enabled=false` → 404) · key production ไม่เคยอยู่ในโค้ดเว็บ
- **IP**: ใช้เป็น key ของ rate limit ในหน่วยความจำเท่านั้น ไม่เขียน DB ไม่ log · ใช้ค่าแรกของ `X-Forwarded-For` (Render ต่อท้ายที่อยู่ client; ตรวจจริงตอน deploy — §15)
- **ห้าม log**: ข้อความลูกค้า, token, cookie · log เฉพาะ id, ความยาว, ผลการตรวจ · ห้ามใส่ข้อความลูกค้าใน `audit.details` หรือ `jobs.payload` (payload มีแค่ id)
- **XSS**: ไม่มี `dangerouslySetInnerHTML` ทุกหน้า · ข้อความ = text node + `white-space: pre-wrap` · URL ปุ่ม/รูปมาจาก server เท่านั้น และตรวจ scheme ซ้ำที่ client · `Content-Disposition`/`X-Content-Type-Options: nosniff` ตอนส่งไฟล์ (`inline` เฉพาะ `image/*` และ pdf; ไฟล์อื่น `attachment`)
- **อัปโหลด**: allowlist + signature + ขนาด + ชื่อไฟล์ล้าง path · `storage.save` เก็บใต้ business · ไม่เปิดไฟล์ข้ามร้าน
- **CSRF**: route ฝั่งร้านที่เปลี่ยนข้อมูลใช้ header `X-Requested-With: nless` ของ core · route สาธารณะไม่ใช้ cookie session ของแอป จึงไม่เป็นช่อง CSRF ของบัญชีร้าน (ยืนยัน token ในทุกคำขอ)
- **PII**: ข้อความลูกค้าเป็นข้อมูลส่วนบุคคล · ไม่ส่งออกนอกระบบนอกจาก OpenAI ผ่าน F10 (`store:false`) · `resetDemo` ล้างข้อมูลผู้ทดลองก่อนกรรมการ

## 13. Edge cases

| กรณี | ผลที่ต้องได้ |
|---|---|
| webhook ส่ง event เดิมซ้ำ 2 ครั้งพร้อมกัน | แถวเดียว; ตัวที่แพ้ชน unique แล้ว retry ได้ `created:false` |
| commit สำเร็จแต่ process ตายก่อน enqueue | webhook ส่งซ้ำ → heal enqueue ภายใน 5 นาที |
| ลูกค้าเขียนมาตอน conversation ปิดแล้ว | เปิด conversation ใหม่ (แถวใหม่ unread 1) ไม่เขียนลงแถวที่ปิด |
| สองข้อความของลูกค้าเดียวกันมาพร้อมกัน | seq ไม่ซ้ำ (ล็อกแถว conversation) · ไม่เกิดสอง conversation เปิด |
| staff กดส่ง 2 ครั้ง (ดับเบิลคลิก) | `clientRequestId` เดิม → ข้อความเดียว |
| staff คนที่สองส่งตอนคนแรกถืออยู่ | 409 พร้อมชื่อผู้ถือ แล้ว UI ถามรับช่วง |
| ผู้ดูแลถูก revoke ระหว่างเปิดหน้า | รายการแสดง "ยังไม่มีผู้ดูแล"; ส่งข้อความได้ตามสิทธิ์ใหม่ |
| ส่งข้อความถึงลูกค้า LINE ที่ block OA | `sendToCustomer` คืน pending แล้ว `message.updated` เป็น failed; ป้ายแดง + ปุ่มส่งซ้ำ |
| ลูกค้าส่งข้อความว่างเปล่า/ช่องว่างล้วน/ยาวมาก | Demo: 400 · channel อื่น: `saveMessage` ตัดเหลือ `PART_TEXT_MAX` ไม่ throw (ข้อความจาก provider ต้องไม่หาย) — ตัดและใส่ `…` |
| ข้อความมี emoji/ตัวอักษรหลายไบต์ครบ 500 ตัว | นับเป็น code point ไม่ใช่ UTF-16 unit |
| ผู้เยี่ยมชมปิด cookie | ใช้ header token ใน memory; เปิดใหม่ = ผู้เยี่ยมชมใหม่ (แชตเก่าอยู่ใน inbox ร้าน) |
| ผู้เยี่ยมชมเปิดสองแท็บ | long-poll แท็บเก่าถูกยกเลิก (waiter ต่อ visitor = 1) แท็บเก่าไป short poll เอง ไม่ error ค้าง |
| เครือข่ายหลุดกลางทาง | แถบ "กำลังเชื่อมต่อใหม่…" · กลับมา → poll ด้วย cursor ล่าสุด ไม่ซ้ำ/ไม่หาย |
| AI ตอบหลายท่อน | bubble รวมตาม `groupId` · poll ส่งมาทีละข้อความได้ (ไม่แตกเป็นหลายกลุ่ม) |
| เพดานรายวันเต็มตอนกรรมการกำลังคุย | ข้อความถัดไปได้ข้อความไทยเรื่องโควตา; ข้อความที่ตอบอยู่ยังมาตามปกติ; tester ฝั่งร้านยังใช้ได้ |
| ร้านเดโมปิด AI | แถบแจ้งบนหน้า; ไม่ขึ้น "กำลังพิมพ์…" เพราะ job จบเงียบ (`pending = null`) |
| `unread` ของ staff หลายคน | ค่าเดียวร่วมกัน: คนแรกที่เปิดทำให้เป็น 0 (ข้อจำกัดที่รับรู้) |
| ผู้ใช้เปิด `/chat?c=<id ของร้านอื่น>` | หน้า "ไม่พบแชตนี้" (404 จาก API) ไม่บอกว่ามีอยู่ |
| ข้อความ `author:'ai'` `origin:'system'` (F38) หรือ `origin:'broadcast'` (F23) | แสดงเป็น bubble ขาออกปกติใน inbox (มีป้ายต้นทางเล็ก) และใน Demo Chat (ไม่มีป้าย) · ไม่นับเป็น "คำตอบ" ที่ทำให้เลิกรอตอบ? นับ: เป็น outbound ของ ai จึงเคลียร์ `awaiting_since` ตามกฎ §5.4 |
| `X-Forwarded-For` ไม่มี | key `unknown` ใช้ร่วมกันทุกคน (เข้มกว่าที่ควร; ดู §15) |

### ถ้าช้า (ตัดตามลำดับนี้ ห้ามตัด "ห้ามตัด")
1. ตัด `counts` และ tab ตัวเลข · 2. ตัด QR และคำถามแนะนำในหน้าตั้งค่า · 3. ตัดการอัปโหลดไฟล์ใน composer (เหลือข้อความ) · 4. ตัด long-poll เหลือ short poll 3 วินาที (จดใน EVIDENCE.md) · 5. ตัด `runDemo` ให้เหลือ 3 แชต
**ห้ามตัด**: dedup + heal, tenant 404, ด่านงบ 5 ชั้นของ Demo Chat, ปุ่ม takeover-on-send, ป้ายส่งตามผลจริง, group-aware history

## 14. Build order (slices)

| slice | เวลา | เนื้อหา | merge เมื่อ |
|---|---|---|---|
| **S1 · contracts จริง** | ≤ 20 นาที (ภายใน ~11:15) | `service.ts` (`saveMessage`, `getConversation`, `getHistory` + mappers, `partsToText`, heal) · `schemas.ts`, `limits.ts` · test 1–13, 26 · routes: `GET /conversations/:id`, `GET /conversations/:id/messages`, `POST /conversations/:id/read` · ลบ route placeholder ของ scaffold | test ผ่าน → PR แรก **เป้า 11:30** (lane อื่นรอ: C2 webhook, B2 ai.reply) แล้วโพสต์ `DONE F09 … TO:B2 TO:C2 TO:A2 TO:A3 TO:B3` |
| **S2 · inbox ใช้งานได้** | ≤ 25 นาที | list + counts + ค้นหา/กรอง/cursor (§5.4) · `sendStaffMessage` + `POST /staff-messages` (ต้องใช้ `assignConversation` ของ F11 fake/จริง) · หน้า `/chat` รายการ+thread+composer ข้อความ + `MessageParts` + realtime ฝั่งร้าน · i18n · test 14, 17–21 | **เป้า 12:00** (gate ขั้น 4 ต้องมี) |
| **S3 · Demo Chat** | ≤ 30 นาที | migration `001_demo_chat.sql` · `demoChat.ts` (token, ด่านงบ, poll/long-poll, action, reset, files) · routes สาธารณะ + tester + settings · หน้า `/demo-chat/s/:slug` และ `/demo-chat` · seed `run` · test 22–25 | **เป้า 12:30** (gate ขั้น 2) · ต้อง merge ก่อน 12:30 มิฉะนั้นโพสต์ BLOCKED @ ทันที |
| **S4 · ขัดเกลา** | ≤ 15 นาที (หลัง gate) | แนบไฟล์ใน composer (`saveChatAttachment` + `/chat/uploads`) · `runDemo`/`resetDemo` · Playwright smoke + รันกับ production · EVIDENCE.md · ตัวเลือก: slot ตัวอย่างว่างเปล่าสำหรับ F11/F12 | หลัง gate · ก่อน 14:30 |

ลำดับภายใน S1: เขียน test ก่อนแล้วแทน body (C1 ส่ง minimal จริงไว้แล้ว) · อย่าแก้ signature

## 15. UNCONFIRMED และสิ่งที่ต้องตรวจในวันงาน

1. **ที่อยู่ client บน Render**: ลำดับของ `X-Forwarded-For` (client เป็นค่าแรกหรือท้ายสุด) · ตรวจ: deploy แล้วยิง `curl -H 'X-Forwarded-For: 1.2.3.4' <url>/api/v1/public/demo-chat/demo-boardgame` แล้วดูผลใน log ชั่วคราว (ไม่ log ค่าถาวร) · ถ้าไม่แน่ใจใช้ค่าแรกและตั้ง `DEMO_IP_PER_MIN` ให้หลวม
2. **ชื่อฟิลด์ `config` ของ core** (`SESSION_SECRET`, `PUBLIC_BASE_URL`) ที่ import จาก `'../../core'` · ตรวจ: เปิด `server/src/core/index.ts` ตอนเริ่ม; ไม่แน่ใจใช้ `process.env` ตรงใน `limits.ts`
3. **cookie ฝั่ง client** (`document.cookie` + `Secure`) บน iOS Safari/Android Chrome เมื่อเปิดผ่าน LINE in-app browser · ตรวจ: เปิด URL จากลิงก์ใน LINE บนมือถือ 1 เครื่อง; ถ้า cookie ไม่อยู่ header token ใน memory ใช้แทนได้ (แต่ reload = ผู้เยี่ยมชมใหม่ — ถ้าเป็นปัญหาให้เก็บ token ใน `localStorage` ครอบ try/catch เป็นชั้นที่สาม)
4. **ผลของ `useRealtime` ของ web core** (ชนิด event และ reconnect) · ตรวจ: ใน S2 อ่าน `web/src/core/realtime.ts`; ถ้า API ต่างจาก COOKBOOK ใช้ poll สำรองแล้วจดใน EVIDENCE.md
5. **คำขอ long-poll ผ่านพร็อกซีของ Render**: timeout idle ของ Render ยาวกว่า 20 วินาทีหรือไม่ (ไม่ทราบค่าแน่ชัด) · ตรวจ: ทดสอบ `waitMs=20000` บน production ใน S3; ถ้าขาดก่อน ลด `LONGPOLL_MAX_MS` เป็น 15000 หรือ 10000
6. **WebSocket สาธารณะ (ไม่จำเป็นต่อ R)**: `NEED core` ถ้าอยากได้ `/ws` แบบ `{ type: 'subscribe_public', slug, token }` หรือ `HttpResponse` ที่ตั้ง cookie/ header ได้ · ไม่ทำในวันงานถ้าไม่มีเวลา
7. **ภาษาไทยของ `model.moderate`**: ไม่ระบุใน docs · ตรวจ: ใน S3 ส่ง 3 ข้อความไทยปกติ ("ราคาเท่าไหร่ครับ", "ขอบคุณค่ะ", "ส่งฟรีไหม") ต้องไม่ถูก flag บน `app-dev` ถ้าถูก flag ผิด → ปิดด่านนี้ (`DEMO_MODERATION=0` อ่านใน `limits.ts`, ไม่ใช่ env ใหม่ของ core: ใช้ค่าคงที่แล้วแก้โค้ด) และจดใน EVIDENCE.md
8. **ลำดับ `ai.reply` กับ `typing`**: `jobs.dedup_key = 'ai.reply:<id>'` ต้องตรงกับที่ `saveMessage` ใช้ (เราเป็นคนตั้งเอง จึงตรง) · ตรวจว่าแถว job ถูกลบ/เก็บถาวรนานแค่ไหนใน F35 (ถ้าลบเร็ว `pending` จะเป็น null หลังเสร็จ ซึ่งตรงกับที่ต้องการ)
9. **F13/F15 ยืนยันจากเว็บ**: ผลลัพธ์ข้อความยืนยันถูกส่งโดย F13/F15 เอง (ผ่าน `sendToCustomer`) หรือต้องให้ F09 ส่ง · ตรวจกับ A2/A3 ใน S3; ถ้าไม่ส่ง ให้ F09 เติมข้อความยืนยันสั้น ๆ จาก `DemoChatActionResult` (ฝั่งหน้าเว็บเท่านั้น ไม่เขียน messages)
10. **เมนู "แชต" ของ scaffold C1** ให้เปลี่ยนเป็น "แชต" ใน `th.json` ของ `inbox` (COOKBOOK §12)
