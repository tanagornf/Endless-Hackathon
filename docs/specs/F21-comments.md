# F21 comments — ตอบคอมเมนต์เป็น DM (Comment-to-DM)

| | |
|---|---|
| Lane / คน | **C2** / **C** · ลำดับ 3 ใน lane (F17 → F18 → F21) |
| Tier / เป้า | **P2** · เป้า **S** (ติดป้าย "จำลอง" ชัดเจน) · **R** เมื่อ comment จริงบน Page/IG ทดสอบทำให้ private reply ถึง test user จริง |
| Timebox | 45–120 นาที |
| เริ่มเมื่อ | หัวหน้าโพสต์ `LEAD: OPEN P2` และ F18 merge แล้ว (F21 ลงทะเบียน handler กับ F18) |
| พึ่ง | F18 (`service.ts`: `registerCommentHandler`, `sendPrivateReply`, `checkPrivateReply`, `replyToComment`, `getPrivateReplyLock`) · F09 `saveMessage`, `getConversation` · F11 `isHumanTakeover` · F04 `getBusinessSettings` · F22 `findProductCodes(businessId, text)` (A2, **ไม่ใช่ contract**: ใช้เมื่อมีจริง) · F08 `getPrice` (เฉพาะ `{{items}}`) · F31 `notify` · core (`db`, `jobs`, `audit`, `publish`) |
| ให้ | ไม่มี contract ข้ามคน · export ภายใน lane: `getComposerLock(businessId, conversationId)` (ดู §4) |
| โฟลเดอร์ | `server/src/features/comments/` · `web/src/features/comments/` · `shared/features/comments/` |
| Web path | `/comment-replies` (เมนูกลุ่ม `settings`) |

อ่าน: [F18 §4, §5.12](F18-meta.md) · `contracts.ts` (`saveMessage`, `getConversation`, `isHumanTakeover`, `getPrice`, `notify`) · F09 (origin `comment`) · [COOKBOOK](../COOKBOOK.md) §6, §8

## 1. เป้าหมายและ user stories

ทำไมมี: ลูกค้าคอมเมนต์ใต้โพสต์/ไลฟ์ว่า "สนใจ" "ราคาเท่าไหร่" "CF A12" ร้านส่ง **private reply** (DM หนึ่งข้อความต่อหนึ่ง comment) พร้อมตอบ comment สาธารณะสั้น ๆ เพื่อดึงเข้าแชตที่ AI ดูแลต่อ · Meta จำกัด private reply หนึ่งข้อความต่อ comment ภายใน 7 วัน ดังนั้นต้องยิงครั้งเดียวแน่นอนและบอกผลตามจริง (sent / unknown / failed)

ผู้ใช้: เจ้าของ/ผู้ดูแลบอท (ตั้งกฎ, ดู log) · staff (เห็นแชตที่เกิดจาก comment, composer ล็อกจนกว่าลูกค้าจะตอบ) · ลูกค้า (ได้ DM)

User stories:
1. เจ้าของสร้างกฎ: ช่อง (Facebook/Instagram), ขอบเขต (โพสต์/ไลฟ์/ทั้งหมด), คำสำคัญ + โหมดจับคู่, ข้อความ DM, ข้อความตอบสาธารณะ (ไม่บังคับ) แล้วทดสอบข้อความโดยไม่ส่งจริง
2. ลูกค้าคอมเมนต์ที่ตรงกฎ → ได้ DM หนึ่งครั้งและ (ถ้าตั้ง) comment ตอบสาธารณะหนึ่งครั้ง · ข้อความเข้า inbox เป็นข้อความบอทในแชตของลูกค้าคนนั้น
3. event ซ้ำ/เซิร์ฟเวอร์ restart/provider ช้า ไม่ทำให้ส่งซ้ำ · ผลที่ไม่แน่ชัดแสดงเป็น "กำลังตรวจกับ provider" แล้วระบบ reconcile ให้
4. comment ที่ปฏิเสธ ("ไม่สนใจ", "ไม่เอา") ไม่ถูกตอบ · comment ที่มีรหัสสินค้าไลฟ์นับเป็นความสนใจ
5. staff พิมพ์ในแชตนั้นก่อนลูกค้าตอบ → ถูกบล็อกพร้อมเหตุผล (provider อนุญาตข้อความเดียวต่อ comment)
6. ร้านปิดฟีเจอร์/ไม่ active/AI ปิด (ตามตั้งค่า)/พนักงานรับช่วงอยู่ → ไม่ส่ง และ log บอกเหตุผล

นอกขอบเขต: `CommentLivePoller` (ดึง comment ไลฟ์ย้อนหลัง/VOD), pilot env, templates แยกตาราง (กฎเก็บข้อความเอง; ใช้ F12 ได้ในอนาคต), ชวนสั่งซื้ออัตโนมัติ (ทำ proposal) — DM เป็นข้อความที่ร้านเขียน, AI (F10) รับช่วงเมื่อลูกค้าตอบ · F21 ไม่เรียก OpenAI

## 2. Data model

`server/src/features/comments/migrations/001_comments.sql`

```sql
-- dependsOn: core, meta
CREATE TABLE comment_settings (
  business_id uuid PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,              -- ปิดไว้ก่อน เจ้าของต้องเปิดเอง
  reply_when_ai_off boolean NOT NULL DEFAULT false,    -- true = ส่งได้แม้ปิด AI ของร้าน (กฎ Papi รุ่นหลัง)
  version int NOT NULL DEFAULT 1,
  updated_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE comment_reply_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('facebook','instagram')),
  scope text NOT NULL DEFAULT 'all' CHECK (scope IN ('all','post','live')),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  keywords text[] NOT NULL DEFAULT '{}' CHECK (cardinality(keywords) <= 20),
  match_mode text NOT NULL DEFAULT 'contains' CHECK (match_mode IN ('contains','exact','starts_with')),
  include_product_codes boolean NOT NULL DEFAULT false,   -- comment ที่มีรหัสสินค้าไลฟ์นับเป็นความสนใจ (ต้องมี F22)
  only_post_id text,                                       -- จำกัดเฉพาะโพสต์/สื่อนี้ (ว่าง = ทุกโพสต์)
  dm_text text NOT NULL CHECK (char_length(dm_text) BETWEEN 1 AND 1000),
  public_reply_text text CHECK (public_reply_text IS NULL OR char_length(public_reply_text) BETWEEN 1 AND 500),
  priority int NOT NULL DEFAULT 100,
  enabled boolean NOT NULL DEFAULT true,
  version int NOT NULL DEFAULT 1,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, channel, name)
);
CREATE INDEX comment_rules_lookup ON comment_reply_rules (business_id, channel, enabled, priority);

CREATE TABLE comment_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('facebook','instagram')),
  comment_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('dm','reply')),
  rule_id uuid REFERENCES comment_reply_rules(id) ON DELETE SET NULL,
  state text NOT NULL DEFAULT 'claimed' CHECK (state IN ('claimed','sending','sent','unknown','failed','skipped')),
  skip_reason text,                          -- disabled | business_inactive | ai_off | takeover | author_cap | too_old
  error_code text,
  attempts int NOT NULL DEFAULT 0,
  lease_until timestamptz,
  author_id text NOT NULL,
  author_name text,
  post_id text,
  scope text NOT NULL CHECK (scope IN ('post','live')),
  comment_excerpt text NOT NULL DEFAULT '',  -- ตัด 120 ตัว (เพื่อให้เจ้าของเห็นว่าเป็น comment ไหน)
  comment_created_at timestamptz NOT NULL,
  matched_by text CHECK (matched_by IN ('keyword','product_code')),
  conversation_id uuid,
  message_id uuid,                            -- messages.id ของ DM ที่บันทึกใน inbox
  provider_message_id text,
  recipient_id text,
  is_simulated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  UNIQUE (business_id, channel, comment_id, kind)
);
CREATE INDEX comment_deliveries_log ON comment_deliveries (business_id, created_at DESC);
CREATE INDEX comment_deliveries_pending ON comment_deliveries (state, created_at) WHERE state IN ('claimed','sending','unknown');
CREATE INDEX comment_deliveries_author ON comment_deliveries (business_id, channel, author_id, created_at DESC) WHERE kind = 'dm';
```

กฎ: unique `(business_id, channel, comment_id, kind)` คือ "claim ก่อนส่ง" · ไม่เก็บ comment ฉบับเต็ม (excerpt 120) · ไม่แก้ตารางของ feature อื่น

## 3. API endpoints

ทุก path ใต้ `/api/v1` · `defineFeatureRoutes({ featureId: 'F21', slug: 'comments' })` · เขียน = `business.bot_settings` · อ่าน = `chat.read`

| Method | Path | auth | permission | Request | Response | Errors |
|---|---|---|---|---|---|---|
| GET | `/businesses/:businessId/comment-replies/settings` | business | `chat.read` | — | `CommentSettings` | — |
| PUT | `/businesses/:businessId/comment-replies/settings` | business | `business.bot_settings` | `UpdateSettingsBody` | `CommentSettings` | VALIDATION_ERROR, VERSION_CONFLICT |
| GET | `/businesses/:businessId/comment-replies/rules` | business | `chat.read` | — | `{ items: RuleView[] }` | — |
| POST | `/businesses/:businessId/comment-replies/rules` | business | `business.bot_settings` | `RuleBody` | `RuleView` | VALIDATION_ERROR, VERSION_CONFLICT (ชื่อซ้ำ) |
| PUT | `/businesses/:businessId/comment-replies/rules/:ruleId` | business | `business.bot_settings` | `RuleBody & { expectedVersion }` | `RuleView` | NOT_FOUND, VERSION_CONFLICT, VALIDATION_ERROR |
| DELETE | `/businesses/:businessId/comment-replies/rules/:ruleId` | business | `business.bot_settings` | — | no_content | NOT_FOUND |
| POST | `/businesses/:businessId/comment-replies/test-match` | business | `chat.read` | `TestMatchBody` | `TestMatchResult` | VALIDATION_ERROR |
| POST | `/businesses/:businessId/comment-replies/simulate` | business | `business.bot_settings` | `SimulateBody` | `{ commentId: string }` | NOT_FOUND (ไม่ใช่ `META_MODE=sandbox`), VALIDATION_ERROR |
| GET | `/businesses/:businessId/comment-replies/deliveries` | business | `chat.read` | `ListQuery` | `Page<DeliveryRow>` | — |
| GET | `/businesses/:businessId/comment-replies/summary` | business | `chat.read` | — | `CommentSummary` | — |

```ts
import { z } from 'zod';
export const ChannelEnum = z.enum(['facebook', 'instagram']);
export const UpdateSettingsBody = z.object({
  expectedVersion: z.number().int().min(1),
  enabled: z.boolean(),
  replyWhenAiOff: z.boolean(),
}).strict();
export const RuleBody = z.object({
  channel: ChannelEnum,
  scope: z.enum(['all', 'post', 'live']),
  name: z.string().trim().min(1).max(80),
  keywords: z.array(z.string().trim().min(1).max(40)).max(20),
  matchMode: z.enum(['contains', 'exact', 'starts_with']),
  includeProductCodes: z.boolean(),
  onlyPostId: z.string().trim().max(100).nullable(),
  dmText: z.string().trim().min(1).max(1000),
  publicReplyText: z.string().trim().min(1).max(500).nullable(),
  priority: z.number().int().min(1).max(1000).default(100),
  enabled: z.boolean(),
}).strict().refine(r => r.keywords.length > 0 || r.includeProductCodes, { message: 'keywords_or_codes_required' });
export const UpdateRuleBody = RuleBody.and(z.object({ expectedVersion: z.number().int().min(1) }));
export const TestMatchBody = z.object({
  channel: ChannelEnum,
  scope: z.enum(['post', 'live']).default('post'),
  postId: z.string().max(100).nullable().default(null),
  text: z.string().trim().min(1).max(2000),
  authorName: z.string().max(60).default('คุณลูกค้า'),
}).strict();
export const SimulateBody = z.object({
  channel: ChannelEnum,
  scope: z.enum(['post', 'live']).default('post'),
  text: z.string().trim().min(1).max(2000),
  authorName: z.string().max(60).default('ผู้ทดสอบ'),
}).strict();
export const ListQuery = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  state: z.enum(['claimed', 'sending', 'sent', 'unknown', 'failed', 'skipped']).optional(),
  channel: ChannelEnum.optional(),
});
```

```ts
// shared/features/comments/types.ts
export interface CommentSettings { businessId: string; enabled: boolean; replyWhenAiOff: boolean; version: number; connected: { facebook: boolean; instagram: boolean }; mode: 'real' | 'sandbox' }
export interface RuleView { id: string; channel: 'facebook' | 'instagram'; scope: 'all' | 'post' | 'live'; name: string; keywords: string[]; matchMode: 'contains' | 'exact' | 'starts_with'; includeProductCodes: boolean; onlyPostId: string | null; dmText: string; publicReplyText: string | null; priority: number; enabled: boolean; version: number; updatedAt: string }
export interface TestMatchResult {
  matched: boolean;
  reason: 'keyword' | 'product_code' | 'negative_phrase' | 'no_rule' | 'no_keyword';
  ruleId: string | null; ruleName: string | null;
  renderedDm: string | null; renderedPublicReply: string | null;
  productCodesChecked: boolean;                 // false = F22 ยังไม่พร้อมจึงไม่ได้ตรวจรหัสสินค้า
}
export interface DeliveryRow {
  id: string; channel: 'facebook' | 'instagram'; commentId: string; kind: 'dm' | 'reply';
  state: 'claimed' | 'sending' | 'sent' | 'unknown' | 'failed' | 'skipped'; skipReason: string | null; errorCode: string | null;
  attempts: number; authorName: string | null; commentExcerpt: string; ruleName: string | null; matchedBy: 'keyword' | 'product_code' | null;
  conversationId: string | null; isSimulated: boolean; createdAt: string; sentAt: string | null;
}
export interface CommentSummary { sent: number; unknown: number; failed: number; skipped: number; pending: number; awaitingProviderCheck: number; since: string }
```

หมายเหตุ: `DeliveryRow.commentId` แสดงได้ (ไม่ใช่ความลับ) · `ruleName` join ตอนอ่าน · cursor = base64url(JSON `{createdAt,id}`) · `summary` = 7 วันล่าสุดตาม `created_at`

## 4. Service functions และ contracts

ไฟล์ภายใน: `service.ts` · `config.ts` · `match.ts` (normalize + keyword) · `render.ts` (ตัวแทนค่า `{{…}}`) · `gate.ts` · `process.ts` (job) · `reconcile.ts` · `repo.ts` · `routes.ts` · `*.test.ts`

ไม่มี contract ข้ามคน · `register()` ของ F21 เรียก `registerCommentHandler(handleCommentEvent)` ของ F18 หนึ่งครั้ง (handler แค่ `jobs.enqueue('comments.process', { event }, …)` แล้วคืน)

Export ภายใน lane (ไม่ใช่ contract): 
```ts
/** F21 · C2. ใช้แสดงสถานะ composer ล็อกหลัง private reply. locked = ลูกค้ายังไม่ตอบหลัง private reply */
export declare function getComposerLock(businessId: string, conversationId: string): Promise<{ locked: boolean; reason: 'awaiting_customer_reply' | null; since: string | null }>;
```
อ่านจาก `getConversation` (ช่อง `facebook`/`instagram`, `customer.externalId`) แล้วเรียก F18 `getPrivateReplyLock` · การบล็อกจริงทำใน sender ของ F18 (ข้อความ staff ที่ส่งไปจะ `failed` `awaiting_customer_reply` พร้อมเหตุผลใน inbox) · A1 อาจเรียก `getComposerLock` เพื่อปิดปุ่มส่งล่วงหน้า (ไม่บังคับ: ดู §15 ข้อ 8)

Contract ที่ใช้ (signature ตาม `contracts.ts`): `saveMessage(input)` · `getConversation(id, { businessId })` · `isHumanTakeover(conversationId)` · `getBusinessSettings(businessId)` → `aiEnabled` · `getPrice(businessId, { itemId, quantity })` (เฉพาะ `{{items}}`) · `notify(...)` · core `jobs`, `db`, `audit`, `publish`

A2 `findProductCodes(businessId, text, opts?)` **อยู่ใน contracts.ts แล้ว** (F22 · fake คืน `[]` ตั้งแต่ setup): import ปกติจาก `'../live-commerce/service'` ไม่ต้อง dynamic import และไม่ต้องตรวจ `typeof` (แก้ 21 พ.ย.) · คืน `ProductCodeMatch[]`; ผลลัพธ์ถือเป็น array ใด ๆ (`length > 0` = พบรหัส) และอ่านฟิลด์ `itemId` / `quantity` ถ้ามี (ไม่มี = ข้าม `{{items}}`) · ล้ม/throw → ถือเป็นไม่พบ (log warn) ไม่ทำให้ job ล้ม · ผลต้องไม่ถูกใช้เป็นสิทธิ์: ใช้เพียงตัวตัดสินว่า "สนใจ"

พฤติกรรมของฟังก์ชันใน `service.ts`: `getSettings`/`updateSettings` (`expectedVersion` ไม่ตรง = `VERSION_CONFLICT`; แถวยังไม่มี = ค่าเริ่มต้น `enabled:false`, `version:1`; PUT ที่ `expectedVersion:1` เมื่อไม่มีแถว = INSERT `version 2`) · `listRules`/`createRule`/`updateRule`/`deleteRule` · `testMatch` · `simulate` · `listDeliveries` · `summary` · `getComposerLock` · ทุกฟังก์ชันรับ `businessId` และกรองด้วยค่านั้น (แถวของร้านอื่น = `NOT_FOUND`) · audit: `comments.settings.update`, `comments.rule.create|update|delete`

## 5. Algorithms

### 5.0 ค่าคงที่ (`config.ts`)

| ค่า | ค่า |
|---|---|
| `PROVIDER_TIMEOUT_MS` | 10 000 (ตามที่ F18 ตั้ง; เกิน = `unknown`) |
| `CLAIM_LEASE_MS` | 600 000 (10 นาที: `sending` ค้างเกินนี้ถือเป็น `unknown`) |
| `RECONCILE_EVERY_SECONDS` | 300 |
| `RECONCILE_MIN_AGE_MS` | 300 000 (รอ ≥ 5 นาทีก่อนถามซ้ำ) |
| `RECONCILE_BATCH` | 25 |
| `RECONCILE_MAX_ATTEMPTS` | 12 (~1 ชั่วโมง) |
| `COMMENT_MAX_AGE_MS` | 604 800 000 (7 วัน: เกินแล้ว private reply ไม่ได้) |
| `MAX_DM_PER_AUTHOR_PER_DAY` | 5 (นับ `dm` ที่ `sent|unknown` ใน 24 ชม. ต่อ author ต่อช่อง) |
| `EXCERPT_MAX` | 120 |
| `NEGATIVE_RE` | ดู §5.2 |
| `MAX_ITEMS_IN_TEXT` | 5 (`{{items}}`) |

### 5.1 รับ event

`handleCommentEvent(e: MetaCommentEvent)` (จาก F18 job `meta.event`; ลงทะเบียนตอน boot) → `jobs.enqueue('comments.process', { event: e }, { dedupKey: 'comments.process:' + e.channel + ':' + e.commentId, businessId: e.businessId, lockKey: 'comments:' + e.businessId + ':' + e.channel + ':' + e.commentId, maxAttempts: 3 })` · event ซ้ำ = dedup ที่ชั้นนี้และที่ `comment_deliveries` unique

### 5.2 ตรวจ gate และจับคู่ (job `comments.process`)

ลำดับ: ขั้น 3–8 คือ "ตรวจว่าเกี่ยวกับกฎไหม" ถ้าไม่เข้า **ไม่เขียนแถว** (ไม่สร้างสัญญาณรบกวนใน log) · ขั้น 9 คือ gate ที่รู้ว่าจะตอบแล้ว ไม่ผ่าน = เขียนแถว `skipped` (kind `dm`, ผ่าน INSERT ที่ claim เหมือน §5.3 ข้อ 1) พร้อม `skip_reason` เพื่อให้เจ้าของเห็นว่าทำไมไม่ตอบ
3. `comment_settings.enabled = false` (หรือไม่มีแถว) → จบ ไม่เขียนแถว
4. (ว่าง: เก็บเลขข้อให้ตรงกับการอ้างอิงเดิม)
5. หา rule ตามข้อ 6–8 · **ไม่พบ rule ที่จับคู่ได้ → จบ ไม่เขียนแถว**
6. **ปฏิเสธ:** `n = normalize(e.text)` ตรง `NEGATIVE_RE` → ไม่จับคู่ทุก rule (ไม่เขียนแถว)
   `NEGATIVE_RE` (บน `n`): `/(ไม่|มิ)\s*(สนใจ|เอา|ต้องการ|รับ|ซื้อ|อยากได้|อยาก)|ไม่เอาละ|ยกเลิก|เลิกสนใจ|not\s+interested|no\s+thanks|don'?t\s+want|do\s+not\s+want|cancel/`
7. **normalize(text):** NFKC → lowercase → ลบ zero-width (`U+200B–U+200D`, `U+FEFF`) → แปลงเลขไทย `๐–๙` เป็น `0–9` → แทนอักขระที่ไม่ใช่ `\p{L}\p{N}\p{M}` ด้วยช่องว่าง → ยุบช่องว่าง → trim
8. **เลือก rule:** rules ของ (business, channel) ที่ `enabled` และ `scope IN ('all', e.scope)` และ (`only_post_id IS NULL` หรือ = `e.postId`) เรียง `priority ASC, created_at ASC` · rule แรกที่ผ่านข้อใดข้อหนึ่ง:
   - **keyword:** มี keyword `k` (normalize ตามข้อ 7 แล้วข้ามที่ว่าง) ที่: `contains` → ถ้า `k` มีอักษรไทย: `n.includes(k)` · ถ้าเป็นละติน/ตัวเลขล้วน: ต้องเป็น "คำ" (ขอบเขตด้านหน้า/หลังเป็นช่องว่างหรือต้น/ท้ายสตริง; ตัวอย่าง `ok` ไม่ตรง `book`) · `exact` → `n === k` · `starts_with` → `n.startsWith(k)` (ภาษาละติน: ตามด้วยช่องว่างหรือจบ)
   - **product_code:** `rule.include_product_codes` และ `findProductCodes(businessId, e.text)` พบ ≥ 1 (เรียกเฉพาะเมื่อไม่ผ่าน keyword และมีฟังก์ชัน)
   `matched_by` บันทึกตามที่ผ่าน
9. gate (ตามลำดับ; ข้อแรกที่ไม่ผ่านชนะ): **`too_old`** `now − e.createdAt > COMMENT_MAX_AGE_MS` · **`business_inactive`** `SELECT status FROM businesses` ≠ `active` (อ่านอย่างเดียว) · **`ai_off`** `getBusinessSettings(businessId).aiEnabled = false` และ `reply_when_ai_off = false` · **takeover** — หา conversation เปิดของ `customers (business_id, channel, external_id = e.authorId)` (อ่านอย่างเดียว) ถ้ามีและ `isHumanTakeover(conversationId)` → `skipped` `takeover` · **เพดานต่อคน:** `MAX_DM_PER_AUTHOR_PER_DAY` เกิน → `skipped` `author_cap`

### 5.3 claim → ส่ง DM (ครั้งเดียว)

1. `INSERT INTO comment_deliveries (… kind 'dm', state 'claimed', rule_id, author…, comment_excerpt = excerpt(e.text), matched_by, is_simulated) ON CONFLICT (business_id, channel, comment_id, kind) DO NOTHING RETURNING id` · **ไม่ได้แถว (มีอยู่แล้ว) = replay: ทำ bookkeeping (ข้อ 6 ถ้าแถวเดิม `sent` แต่ยังไม่มี public reply) แล้วจบ ไม่เรียก provider**
2. render ข้อความ (§5.4) → `UPDATE state='sending', attempts = attempts + 1, lease_until = now() + 10 นาที`
3. เรียก `sendPrivateReply({ businessId, channel, commentId, text })` (F18 ตั้ง timeout 10 วินาที)
4. map ผล:

| ผลจาก F18 | state | ต่อ |
|---|---|---|
| `sent` | `sent`, `sent_at`, `recipient_id`, `provider_message_id` | บันทึก inbox (ข้อ 5) → public reply (ข้อ 6) |
| `already_replied` | `sent` (error_code `already_replied` เพื่อบอกว่าไม่ได้ส่งเอง) | public reply ถ้ายังไม่ทำ · ไม่บันทึก DM ใน inbox (ไม่รู้ข้อความ) แต่บันทึกข้อความ comment ของลูกค้าถ้ามี `recipient_id`... ไม่มี → ข้าม |
| `failed` retryable=false | `failed` + `error_code` สั้น (`window_closed`, `permission`, `text_too_long`, `token_invalid`) | เจ้าของเห็นใน log; ไม่ส่ง public reply |
| `failed` retryable=true หรือ `unknown` | `unknown` (+ `error_code` `throttled`/`timeout`) | **ไม่ retry ใน job** → reconciler (§5.7) |

5. **บันทึกลง inbox (เมื่อ `sent`):** `saveMessage` สองครั้งตามลำดับ ด้วย `customer = { channel, externalId: recipientId, displayName: authorName ?? undefined, channelAccountId: e.accountId }`:
   (a) inbound ลูกค้า: `parts:[{type:'text', text:'[คอมเมนต์] ' + e.text}]`, `author:'customer'`, `origin:'comment'`, `externalId:'cmt:' + commentId`, `triggerAi:false`, `occurredAt: e.createdAt`, `providerMeta:{ commentId, postId }`
   (b) outbound บอท: `parts:[{type:'text', text: renderedDm}]`, `author:'ai'`, `origin:'comment'`, `externalId: providerMessageId`, `triggerAi:false`, `providerMeta:{ commentId, privateReply:true }`
   จากนั้น `UPDATE conversation_id, message_id` · ถ้า `saveMessage` ล้ม: ไม่เปลี่ยน `sent` (DM ถึงแล้วจริง) แต่ `error_code='inbox_save_failed'` + retry เฉพาะการบันทึกใน job ถัดไป (`maxAttempts 3`; ใช้ `externalId` กันซ้ำ)
6. **public reply:** ถ้า `rule.public_reply_text` และ DM state เป็น `sent` และยังไม่มีแถว `kind 'reply'`: claim แถว `reply` (unique เช่นเดียวกัน) → `replyToComment({ businessId, channel, commentId, text: renderedPublic })` → `sent` / `failed` (retryable ไม่นับ: ไม่ retry) / `unknown` (**ห้ามโพสต์ซ้ำเด็ดขาด**)
7. หลังทุกการเปลี่ยนสถานะ: `publish(businessId, { type:'custom', featureId:'F21', name:'comments.changed', data:{} })` และ `audit` (`comments.dm.sent|failed|unknown`, `actorUserId:null`, details มี `channel`, `commentId`, `ruleId`, ไม่มีข้อความ)

### 5.4 ตัวแทนค่าในข้อความ (`render.ts`)

| ตัวแทน | ค่า |
|---|---|
| `{{name}}` | ชื่อผู้คอมเมนต์ (`authorName`) ตัดเหลือคำแรก ≤ 30 ตัว · ไม่มี → `คุณลูกค้า` เมื่อข้อความของกฎ (`dm_text`) มีอักษรไทย มิฉะนั้น `there` (กฎที่ร้านเขียนอังกฤษได้ "Hi there") · ข้อความตอบคอมเมนต์เป็นของที่ร้านเขียนต่อกฎ ภาษาตามที่ร้านเขียน: ร้านที่ต้องการสองภาษาสร้างกฎสองข้อ (คีย์เวิร์ดไทย / อังกฤษ) |
| `{{shop}}` | `businesses.name` |
| `{{items}}` | รายการสินค้าจากรหัสที่พบ (ดูล่าง) · ไม่มีรหัส/ไม่มี F22 → ข้อความว่าง แล้วยุบบรรทัดว่างซ้อน |

- ตัวแทนที่ไม่รู้จัก (`{{xxx}}`) ปล่อยตามเดิมหลังตรวจ: บันทึกกฎ (`RuleBody`) ต้องไม่มี `{{` ที่ไม่ใช่สามตัวด้านบน (ตรวจตอน create/update → `VALIDATION_ERROR` `unknown_placeholder`)
- `{{items}}`: สำหรับ item ที่ F22 ส่งมา (สูงสุด 5) ที่มี `itemId`: `getPrice(businessId, { itemId, quantity: qty ?? 1 })` → บรรทัดละ `• {name} × {qty} ฿{subtotal}` (หมด = `• {name} สินค้าหมด`) และบรรทัดสุดท้าย `รวม ฿{ผลรวมรายการที่ไม่หมด}` · ราคามาจาก DB ตอนส่ง (ไม่ใช้ราคาใน comment) · ล้ม/NOT_FOUND ต่อบรรทัด = ข้ามบรรทัดนั้น
- หลังแทนค่า: trim, ยุบ `\n{3,}` → `\n\n`, ตรวจความยาว: DM ≤ 1 000 (บังคับทั้งสองช่อง; IG ต้อง ≤ 1 000 **ไบต์** — ถ้าเกินตัดที่ขอบบรรทัดสุดท้ายที่พอดี ถ้ายังเกิน → `failed` `text_too_long`) · public ≤ 500 (เกิน → ตัดที่ 500 แล้วต่อ `…`)
- ห้ามใส่ข้อความ comment ของลูกค้าลงในคำตอบ (ไม่ echo ข้อความที่ผู้ใช้ควบคุมเพื่อกัน injection/spam) ยกเว้นชื่อ `{{name}}` ที่ตัดแล้วและลบอักขระควบคุม/`@`

### 5.5 Composer lock

F18 sender บล็อกข้อความออกถึงลูกค้าที่ `getPrivateReplyLock.locked` (ลูกค้ายังไม่ตอบหลัง private reply) ด้วย `awaiting_customer_reply` · F21 `getComposerLock` ให้ UI อ่าน · ปลดเมื่อมี inbound ใหม่ของลูกค้า (เปรียบเทียบกับ `getCustomerLastInboundAt` ใน F18 อยู่แล้ว) · ข้อความ inbound `[คอมเมนต์] …` ที่ F21 เองบันทึก **ไม่ปลดล็อก**: ต้องเก็บเวลา `locked_at` หลังบันทึก (F18 สร้างแถวล็อกก่อนที่ F21 จะ `saveMessage` (a) จึงไม่ถูกนับเป็นการตอบ; F21 ตั้ง `occurredAt` ของ (a) = เวลา comment ซึ่งเก่ากว่า `locked_at` เสมอ)

### 5.6 จำลอง (`simulate`, เฉพาะ `META_MODE=sandbox`)

สร้าง `MetaCommentEvent` ปลอม (`commentId = 'sim-' + uuid`, `authorId = 'sim-author-' + uuid[:8]`, `accountId` จาก connection ของ channel นั้น หรือ `'sandbox-account'`, `createdAt = now`) แล้วเรียก `handleCommentEvent` ตรง ๆ · แถวที่เกิดมี `is_simulated = true` · ผ่าน gate/matching/claim/render เหมือนจริงทุกขั้น ต่างเพียง F18 คืนผลส่งปลอม (ดู F18 §5.12) · ข้อความที่บันทึกใน inbox มี `providerMeta.simulated = true` · UI ติดป้าย "จำลอง" ทุกแถว · ห้ามเปิด endpoint เมื่อ `META_MODE=real` (404) · **ไม่นับเป็น R**

### 5.7 Reconcile (schedule `comments.reconcile` ทุก 300 วินาที)

1. จองแถวด้วย lease: `UPDATE comment_deliveries SET lease_until = now() + interval '5 minutes', attempts = attempts + 1 WHERE id IN (SELECT id FROM comment_deliveries WHERE state IN ('claimed','sending','unknown') AND created_at < now() - interval '5 minutes' AND (lease_until IS NULL OR lease_until < now()) AND is_simulated = false ORDER BY created_at LIMIT 25 FOR UPDATE SKIP LOCKED) RETURNING *`
2. ต่อแถว `kind='dm'`:
   - `comment_created_at` เก่ากว่า 7 วัน → `failed` `window_expired`
   - `attempts > 12` → `failed` `max_attempts`
   - `state IN ('claimed','sending')` ที่ lease หมด → ถือเป็น `unknown` (process ตายกลางทาง)
   - `checkPrivateReply` (F18): `sent` → `sent` (ไม่มีข้อความใน inbox ถ้าไม่รู้ `recipient_id`: `error_code='reconciled_without_message'`) · `not_sent` หรือ `unverifiable` → เรียก `sendPrivateReply` อีกครั้ง (Meta จำกัดหนึ่งครั้งต่อ comment จึงซ้ำไม่ได้) แล้ว map ผลเหมือน §5.3 ข้อ 4–5 (ถ้า `sent` ทำ inbox + public reply ต่อ)
   - ตอบไม่ได้ (provider ล่ม/เครือข่าย) → `unknown` เดิม รอรอบหน้า (ไม่เพิ่มความเสี่ยง)
3. ต่อแถว `kind='reply'` ที่ `unknown`: **ไม่โพสต์ซ้ำเด็ดขาด** และไม่มี API ตรวจ → รอจน `attempts > 12` แล้ว `failed` `unverified_not_reposted`
4. `published` เมื่อมีการเปลี่ยนสถานะ · บันทึก `audit`

### 5.8 live-code hook (F22)

เปิดใช้ได้เมื่อ `rule.include_product_codes = true` และฟังก์ชันมีอยู่ (§4) · `testMatch` คืน `productCodesChecked:false` เมื่อไม่มีฟังก์ชัน และ UI แสดงข้อความ "ยังไม่ได้ตรวจรหัสสินค้า (ระบบไลฟ์ยังไม่พร้อม)" · แยกสถานะรายงานตามจริง: การจับ comment จากไลฟ์จริง = A หรือ S (event จำลอง), ไม่ใช่ R

## 6. AI calls

**ไม่มี AI call** · ข้อความ DM/ตอบสาธารณะเป็นข้อความที่เจ้าของเขียนเอง + ตัวแทนค่าจากฐานข้อมูล (ไม่ผ่านโมเดล → ไม่มีค่าใช้จ่าย OpenAI) · เมื่อลูกค้าตอบ DM กลับ เป็นข้อความปกติผ่าน F18 → `ai.reply`

## 7. UI

Route `/comment-replies` · `permission:'chat.read'` · `titleKey:'comments:page.title'` · เมนู `{ path:'/comment-replies', labelKey:'comments:menu.title', group:'settings', icon:'MarkChatReadOutlined', order:30, permission:'chat.read', searchTerms:['comment','คอมเมนต์','ตอบคอมเมนต์','private reply','dm'] }` · หน้า `CommentRepliesPage.tsx`:

1. `PageHeader` "ตอบคอมเมนต์เป็นข้อความส่วนตัว" + คำอธิบายสั้น
2. Alert เมื่อ Facebook/Instagram ยังไม่เชื่อมต่อ (ลิงก์ `/channels/meta`) · Alert `devMode`: "Meta app อยู่โหมด development: เฉพาะคอมเมนต์ของบัญชีที่มี role ในแอปเท่านั้นที่ส่ง event มา" · Alert `sandbox` ถ้า `mode='sandbox'` (ห้ามขึ้นเมื่อ real)
3. `SectionCard` ตั้งค่า: Switch เปิดใช้ · Switch "ตอบแม้ปิด AI ของร้าน" · บันทึก (`business.bot_settings` ผ่าน `useCan`; อื่นอ่านอย่างเดียว) · `VERSION_CONFLICT` → toast + โหลดใหม่
4. `SectionCard` กฎ: `DataTable` (ชื่อ, ช่อง, ขอบเขต, คำสำคัญ, เปิด/ปิด) + ปุ่มเพิ่ม/แก้/ลบ (`FormDialog` ฟิลด์ตาม `RuleBody`; ตัวแทนค่าที่ใช้ได้แสดงใต้ช่องข้อความ; ตัวนับตัวอักษร DM 1000 / ตอบสาธารณะ 500; เตือนว่า "ไม่ match คำปฏิเสธ เช่น ไม่สนใจ")
5. `SectionCard` ทดสอบข้อความ: ช่อง/ขอบเขต/ข้อความ → `POST test-match` → แสดงผล (จับคู่หรือไม่, เหตุผล, rule, ข้อความ DM/ตอบที่เรนเดอร์) · **ไม่ส่งจริง** (ป้ายกำกับชัด)
6. `SectionCard` จำลอง (เฉพาะ `sandbox` และ `business.bot_settings`): ช่อง + ข้อความ + ปุ่ม "จำลอง comment" · แถวที่เกิดติดป้าย "จำลอง"
7. `SectionCard` สรุป 7 วัน (ส่งแล้ว / กำลังตรวจกับ provider / ล้มเหลว / ข้าม) + แบนเนอร์ "กำลังตรวจกับ provider N รายการ" เมื่อ `awaitingProviderCheck > 0`
8. `DataTable` log: เวลา, ช่อง, ผู้คอมเมนต์, ข้อความ (excerpt), rule, ชนิด (DM/ตอบสาธารณะ), สถานะ (`StatusChip` + เหตุผลจาก i18n), ลิงก์ไปแชต (`/chat?c=<conversationId>`) เมื่อมี, ป้ายจำลอง
9. `useRealtime('custom', e => e.featureId==='F21' && reload())` · states: loading, empty ("ยังไม่มีกฎ"/"ยังไม่มีคอมเมนต์"), error + ลองใหม่

i18n namespace `comments` (th / en):

| key | th | en |
|---|---|---|
| `menu.title` | ตอบคอมเมนต์ | Comment replies |
| `page.title` | ตอบคอมเมนต์เป็นข้อความส่วนตัว | Comment-to-DM |
| `page.subtitle` | เมื่อลูกค้าคอมเมนต์ตรงกับกฎ ระบบส่งข้อความส่วนตัวให้หนึ่งครั้งและดึงเข้าแชต | When a comment matches a rule, we send one private message and bring the customer into the chat |
| `notConnected` | ยังไม่ได้เชื่อมต่อ {{channel}} | {{channel}} is not connected yet |
| `goConnect` | ไปหน้าเชื่อมต่อ | Go to connection page |
| `devMode` | แอป Meta อยู่ในโหมด development: เฉพาะคอมเมนต์ของบัญชีที่มี role ในแอปเท่านั้นที่ส่งเหตุการณ์มา | The Meta app is in development mode: only comments from accounts with a role in the app are delivered |
| `sandbox.notice` | โหมดทดสอบ: ไม่ส่งข้อความจริงไป Meta | Sandbox mode: nothing is sent to Meta |
| `settings.title` | ตั้งค่า | Settings |
| `settings.enabled` | เปิดใช้งานตอบคอมเมนต์ | Enable comment replies |
| `settings.aiOff` | ตอบคอมเมนต์ต่อแม้ปิด AI ของร้าน | Keep replying to comments when the shop's AI is off |
| `settings.saved` | บันทึกการตั้งค่าแล้ว | Settings saved |
| `settings.conflict` | มีคนแก้การตั้งค่าไปแล้ว โหลดใหม่ให้แล้ว | Someone changed the settings. Reloaded |
| `rules.title` | กฎตอบคอมเมนต์ | Reply rules |
| `rules.add` | เพิ่มกฎ | Add rule |
| `rules.edit` | แก้ไขกฎ | Edit rule |
| `rules.empty` | ยังไม่มีกฎ เพิ่มกฎแรกเพื่อเริ่มตอบคอมเมนต์ | No rules yet. Add your first rule |
| `rules.deleteTitle` | ลบกฎนี้? | Delete this rule? |
| `rules.deleteMessage` | คอมเมนต์ใหม่จะไม่ถูกตอบด้วยกฎนี้อีก (ประวัติเดิมยังอยู่) | New comments will no longer match this rule (history stays) |
| `rules.name` | ชื่อกฎ | Rule name |
| `rules.channel` | ช่องทาง | Channel |
| `rules.scope` | ขอบเขต | Scope |
| `rules.scope.all` | ทั้งโพสต์และไลฟ์ | Posts and live |
| `rules.scope.post` | เฉพาะโพสต์ | Posts only |
| `rules.scope.live` | เฉพาะไลฟ์ | Live only |
| `rules.keywords` | คำสำคัญ (พิมพ์แล้วกด Enter) | Keywords (type and press Enter) |
| `rules.matchMode` | วิธีจับคู่ | Match mode |
| `rules.match.contains` | มีคำนี้อยู่ในคอมเมนต์ | Contains |
| `rules.match.exact` | ตรงทั้งข้อความ | Exact |
| `rules.match.starts_with` | ขึ้นต้นด้วย | Starts with |
| `rules.includeCodes` | คอมเมนต์ที่มีรหัสสินค้าไลฟ์นับว่าสนใจ | Comments with a live product code count as interest |
| `rules.codesUnavailable` | ระบบรหัสสินค้าไลฟ์ยังไม่พร้อม | Live product codes are not available yet |
| `rules.onlyPost` | เฉพาะโพสต์/สื่อ ID นี้ (ไม่บังคับ) | Only this post/media ID (optional) |
| `rules.dmText` | ข้อความส่วนตัว (DM) | Private message (DM) |
| `rules.publicText` | ข้อความตอบใต้คอมเมนต์ (ไม่บังคับ) | Public reply under the comment (optional) |
| `rules.placeholders` | ใช้ได้: {{name}} ชื่อลูกค้า · {{shop}} ชื่อร้าน · {{items}} รายการสินค้าจากรหัสที่พบ | Available: {{name}} customer · {{shop}} shop · {{items}} products from detected codes |
| `rules.negativeNote` | คอมเมนต์ที่ปฏิเสธ เช่น "ไม่สนใจ" "ไม่เอา" จะไม่ถูกตอบเสมอ | Rejections such as "not interested" are never answered |
| `rules.priority` | ลำดับความสำคัญ (เลขน้อยก่อน) | Priority (lower first) |
| `rules.enabled` | เปิดใช้กฎนี้ | Rule enabled |
| `rules.err.unknown_placeholder` | มีตัวแทนค่าที่ไม่รู้จัก | Unknown placeholder |
| `rules.err.keywords_or_codes_required` | ใส่คำสำคัญอย่างน้อยหนึ่งคำ หรือเปิดการนับรหัสสินค้า | Add at least one keyword or enable product codes |
| `test.title` | ทดสอบข้อความ (ไม่ส่งจริง) | Test a comment (nothing is sent) |
| `test.text` | ข้อความคอมเมนต์ | Comment text |
| `test.run` | ทดสอบ | Test |
| `test.matched` | จะตอบด้วยกฎ "{{rule}}" | Will reply using rule "{{rule}}" |
| `test.notMatched` | ไม่ตรงกฎใด ๆ | No rule matches |
| `test.reason.negative_phrase` | มีคำปฏิเสธ จึงไม่ตอบ | Contains a rejection phrase, so no reply |
| `test.reason.no_keyword` | ไม่มีคำสำคัญที่ตรง | No keyword matches |
| `test.reason.no_rule` | ไม่มีกฎที่เปิดอยู่สำหรับช่องนี้ | No enabled rule for this channel |
| `test.codesNotChecked` | ยังไม่ได้ตรวจรหัสสินค้า (ระบบไลฟ์ยังไม่พร้อม) | Product codes were not checked (live commerce not ready) |
| `test.dm` | ข้อความส่วนตัวที่จะส่ง | Private message that would be sent |
| `test.public` | ข้อความตอบสาธารณะที่จะโพสต์ | Public reply that would be posted |
| `sim.title` | จำลอง comment (โหมดทดสอบ) | Simulate a comment (sandbox) |
| `sim.run` | จำลอง comment | Simulate comment |
| `sim.badge` | จำลอง | Simulated |
| `summary.title` | ภาพรวม 7 วันล่าสุด | Last 7 days |
| `summary.sent` | ส่งแล้ว | Sent |
| `summary.unknown` | รอตรวจกับ provider | Awaiting provider check |
| `summary.failed` | ล้มเหลว | Failed |
| `summary.skipped` | ข้าม | Skipped |
| `summary.banner` | กำลังตรวจกับ provider {{count}} รายการ ระบบจะตรวจซ้ำทุก 5 นาทีและไม่ส่งซ้ำ | Checking {{count}} items with the provider. We re-check every 5 minutes and never send twice |
| `log.title` | ประวัติ | History |
| `log.time` | เวลา | Time |
| `log.channel` | ช่องทาง | Channel |
| `log.author` | ผู้คอมเมนต์ | Commenter |
| `log.comment` | คอมเมนต์ | Comment |
| `log.rule` | กฎ | Rule |
| `log.kind` | ชนิด | Type |
| `log.kind.dm` | ข้อความส่วนตัว | DM |
| `log.kind.reply` | ตอบสาธารณะ | Public reply |
| `log.state` | สถานะ | State |
| `log.openChat` | เปิดแชต | Open chat |
| `log.empty` | ยังไม่มีคอมเมนต์ที่ถูกตอบ | No comments handled yet |
| `state.claimed` | รอส่ง | Queued |
| `state.sending` | กำลังส่ง | Sending |
| `state.sent` | ส่งแล้ว | Sent |
| `state.unknown` | รอตรวจกับ provider | Awaiting provider check |
| `state.failed` | ล้มเหลว | Failed |
| `state.skipped` | ข้าม | Skipped |
| `skip.disabled` | ปิดใช้งาน | Disabled |
| `skip.business_inactive` | ร้านไม่ได้ใช้งาน | Shop inactive |
| `skip.ai_off` | AI ปิดอยู่ | AI is off |
| `skip.takeover` | พนักงานรับช่วงอยู่ | Staff took over |
| `skip.author_cap` | ส่งถึงคนนี้ครบเพดานรายวัน | Daily limit for this person reached |
| `skip.too_old` | คอมเมนต์เก่าเกิน 7 วัน | Comment older than 7 days |
| `err.window_expired` | เกิน 7 วัน ส่งไม่ได้แล้ว | Past 7 days, cannot send |
| `err.max_attempts` | ตรวจซ้ำครบกำหนดแล้ว | Re-checks exhausted |
| `err.unverified_not_reposted` | ตรวจไม่ได้ จึงไม่โพสต์ซ้ำ | Could not verify, so not reposted |
| `err.text_too_long` | ข้อความยาวเกินที่ Meta รับ | Message too long for Meta |
| `err.permission` | ขาดสิทธิ์ที่แอปต้องมี | Missing app permission |
| `err.token_invalid` | Token ใช้ไม่ได้ ต้องเชื่อมต่อใหม่ | Token invalid, reconnect |
| `readOnly` | คุณดูได้อย่างเดียว | View only |
| `error.retry` | ลองใหม่ | Retry |

## 8. Jobs, schedules, events

| รายการ | ค่า |
|---|---|
| Job `comments.process` | payload `{ event: MetaCommentEvent }` · dedupKey `comments.process:<channel>:<commentId>` · lockKey `comments:<businessId>:<channel>:<commentId>` · `maxAttempts: 3` (ใช้กับขั้น DB/บันทึก inbox เท่านั้น; **หลังเรียก `sendPrivateReply` ห้าม retry ของ job ส่งซ้ำ**: state เปลี่ยนเป็น `sent|failed|unknown` ก่อนจบ job และ claim กันไว้) |
| Schedule `comments.reconcile` | `everySeconds: 300` §5.7 |
| Realtime | `publish(businessId, { type:'custom', featureId:'F21', name:'comments.changed', data:{} })` |
| Audit | `comments.settings.update` · `comments.rule.create|update|delete` · `comments.dm.sent|failed|unknown` · `comments.reply.sent|failed|unknown` (actor null) |
| notify | ไม่มี (ความผิดปกติของ token แจ้งโดย F18) |
| `model_usage` | ไม่มี |

## 9. Seed และ fixtures

`seed.ts` (`dependsOn: ['core','meta']`, idempotent): ร้าน A: `comment_settings` `enabled false` (ปิดไว้ให้เจ้าของเปิดเอง) + กฎตัวอย่าง 1 กฎ **ปิดอยู่** (`enabled false`, channel `facebook`, scope `all`, name `สนใจ/ราคา`, keywords `สนใจ`, `ราคา`, `price`, `cf`, matchMode `contains`, `dm_text` = `สวัสดีค่ะ คุณ{{name}} ขอบคุณที่สนใจ{{shop}} นะคะ ทักถามราคาหรือสั่งซื้อในแชตนี้ได้เลยค่ะ`, `public_reply_text` = `ส่งรายละเอียดให้ทางข้อความแล้วนะคะ`) · ร้าน B: ไม่มีแถว · `runDemo`: เปิดกฎตัวอย่างและตั้ง `enabled true` ให้ร้าน A เฉพาะเมื่อ `META_MODE=sandbox` · `resetDemo`: ลบ `comment_deliveries` ของร้านเดโม (`is_simulated = true` หรือทั้งหมดของร้านเดโม) 

Fixtures ใน test (ด้วยโค้ด): `makeCommentEvent(overrides)` (commentId สุ่ม, `createdAt = CLOCK_FIXTURE`) · F18 service mock (`vi.mock('../meta/service')`) คืนผลตามสถานการณ์ (`sent` พร้อม `recipientId`, `unknown`, `already_replied`, `failed`) · mock `findProductCodes` (มี/ไม่มี/throw) · `saveMessage` จริงบน test DB เพื่อยืนยันแชตที่เกิด · ร้าน/ลูกค้าใหม่ต่อ test

## 10. Tests

| ไฟล์ | case |
|---|---|
| `match.test.ts` | normalize: เลขไทย `๑๒๓` → `123`, ตัว zero-width, NFKC, ตัวพิมพ์ใหญ่, เครื่องหมายวรรคตอน · contains ภาษาไทย (`สนใจค่ะ` ตรง `สนใจ`) · contains ละติน ต้องเป็นคำ (`ok` ไม่ตรง `book`, ตรง `ok ครับ`) · exact (`ราคา` ตรง `ราคา!`, ไม่ตรง `ราคาเท่าไหร่`) · starts_with · `ไม่สนใจ`, `ไม่เอา`, `ไม่ต้องการ`, `not interested`, `no thanks` → ไม่ match แม้มีคำ `สนใจ` · scope (rule `live` ไม่จับ comment `post`) · `only_post_id` · priority ลำดับ · rule ปิดไม่ถูกเลือก · rule ของช่องอื่น/ร้านอื่นไม่ถูกเลือก |
| `render.test.ts` | `{{name}}` คำแรก/ว่าง/ยาวเกิน/มี `@` · `{{shop}}` · `{{items}}` ด้วย mock F22 + `getPrice` (ราคาจาก DB ไม่ใช่ comment; สินค้าหมด; ไม่มี F22 → ว่างและยุบบรรทัด) · ตัวแทนที่ไม่รู้จักถูกปฏิเสธตอนบันทึกกฎ · DM > 1000 ไบต์ (IG ไทย) ถูกตัดที่ขอบบรรทัดหรือ `text_too_long` · public > 500 ตัด |
| `process.test.ts` | match → claim 1 แถว `dm` → `sendPrivateReply` ถูกเรียก **1 ครั้ง** → `sent` + บันทึก inbox 2 ข้อความ (`origin:'comment'`, ลูกค้า `externalId = recipientId`, `triggerAi:false`, ไม่มีงาน `ai.reply`) · event เดิมเข้า 2 ครั้ง (ทั้งสอง job) → ส่ง 1 ครั้ง · replay หลัง `sent` ที่ยังไม่มี public reply → โพสต์ reply หนึ่งครั้งไม่ส่ง DM ซ้ำ · ไม่ match → ไม่มีแถว ไม่เรียก F18 · ข้อความปฏิเสธ → ไม่ส่ง · มีรหัสสินค้า (mock) โดยไม่มี keyword → `matched_by 'product_code'` ส่ง · F22 throw → ถือเป็นไม่พบ ไม่ล้ม · `enabled=false` → ไม่มีแถว · business ไม่ active → `skipped business_inactive` · `aiEnabled=false` → `skipped ai_off` และ `reply_when_ai_off=true` → ส่งได้ · takeover → `skipped takeover` · เกิน 5 DM/วัน/คน → `skipped author_cap` · comment เก่า 8 วัน → `skipped too_old` · F18 `unknown` → state `unknown` ไม่ retry ใน job (เรียก F18 ครั้งเดียว) · F18 failed non-retryable → `failed` + error_code และไม่โพสต์ public reply · `already_replied` → `sent` · public reply `unknown` → ไม่เรียกซ้ำ · `saveMessage` ล้มหลัง sent → state ยัง `sent` มี `inbox_save_failed` |
| `reconcile.test.ts` | `unknown` อายุ < 5 นาที → ไม่แตะ · F18 check `sent` → `sent` ไม่เรียก send · `not_sent` → ส่งใหม่หนึ่งครั้ง → `sent` + inbox · IG `unverifiable` → ส่งใหม่ผ่าน F18 (mock) · provider ตอบไม่ได้ → ยัง `unknown` · attempts เกิน 12 → `failed max_attempts` · comment เกิน 7 วัน → `failed window_expired` · `sending` ที่ lease หมด → ถือเป็น unknown แล้วตรวจ · `reply` ที่ unknown → ไม่โพสต์ซ้ำและ failed เมื่อครบ 12 · แถว `is_simulated` ไม่ถูก reconcile · สองรอบพร้อมกันไม่จองแถวเดียวกัน (SKIP LOCKED) |
| `routes.test.ts` | settings GET/PUT (staff ไม่มี `business.bot_settings` → 403, `expectedVersion` ผิด → `VERSION_CONFLICT`) · rules CRUD (ชื่อซ้ำ → 409, keywords ว่างและไม่เปิดรหัส → 400, keyword > 40 → 400, 21 คำ → 400, DM 1001 → 400, `expectedVersion` ผิด → conflict) · ร้าน B อ่าน/แก้กฎร้าน A ไม่ได้ (404) · `test-match` ไม่เขียน DB และไม่เรียก F18 · `simulate` → 404 เมื่อ `META_MODE=real`; sandbox → สร้างแถว `is_simulated` · deliveries แยก tenant, cursor, filter state · summary นับถูก · `getComposerLock` ตาม lock ของ F18 |

Playwright smoke `web/src/features/comments/e2e/comments.smoke.spec.ts` (production-safe):
1. `ownerPage` เปิด `/comment-replies` → เห็นหัวข้อ, การ์ดตั้งค่า, ตารางกฎ
2. เพิ่มกฎ `e2e-<ts>` (channel Facebook, keyword `e2e-<ts>`) → บันทึก → เห็นในตาราง
3. "ทดสอบข้อความ": ใส่ `สนใจ e2e-<ts>` → เห็น "จะตอบด้วยกฎ" และข้อความ DM ที่เรนเดอร์ · ใส่ `ไม่สนใจ e2e-<ts>` → "ไม่ตรงกฎใด ๆ" (เหตุผลคำปฏิเสธ)
4. ลบกฎ `e2e-<ts>` (ล้างข้อมูล) → ไม่อยู่ในตาราง
5. ตาราง log โหลดโดยไม่ error
6. (ไม่ทำใน smoke) comment จริงบน Page ทดสอบ: ทำด้วยมือแล้วจดใน `EVIDENCE.md` (เป็นเกณฑ์ R ใน §11)

## 11. Acceptance: R ตาม D6

- [ ] comment ที่ match ได้ private reply **ครั้งเดียว**; event เดิมเข้า 2 ครั้งยังส่ง 1 ครั้ง; ไม่ match/มีคำปฏิเสธ → ไม่ส่ง (unit ตาม §10)
- [ ] provider ไม่ตอบ → `unknown` ไม่ retry เอง; reconciler (fixture "มีแล้ว"/"ไม่มี"/"ตรวจไม่ได้") ปิดเป็น `sent` หรือส่งใหม่ถูกต้อง; public reply ไม่โพสต์ซ้ำ
- [ ] staff ส่งข้อความในแชตนั้นก่อนลูกค้าตอบ → ถูกปฏิเสธพร้อมเหตุผล (`awaiting_customer_reply` ที่ sender ของ F18) · ลูกค้าตอบแล้วส่งได้
- [ ] business ไม่ active / ฟีเจอร์ปิด / AI ปิด (ตั้งค่า) / takeover → ไม่ส่ง และหน้า log แสดงเหตุผลและ `unknown/failed` ตามจริง
- [ ] UI จริงต่อ API/DB (กฎ CRUD, ทดสอบข้อความ, log, summary, realtime), loading/empty/error, i18n th/en, permission + tenant, audit · Playwright smoke ผ่านบน production
- **R:** อย่างน้อยหนึ่งช่อง (Facebook หรือ Instagram) มี comment จริงจากบัญชีทดสอบ (มี role ในแอป) บน Page/IG ทดสอบ → private reply ถึง test user จริง (เห็น DM ใน Messenger/IG และในแชต inbox) + เมื่อใช้ `public_reply_text` เห็น comment ตอบจริง · จดเวลา/sha/ช่องใน `EVIDENCE.md` · ถ้าได้เพียงช่องเดียว รายงานช่องนั้น R อีกช่อง S/A
- **S (เป้าหลัก):** flow ภายในครบกับ `META_MODE=sandbox`/event จำลองที่ติดป้าย "จำลอง" ทุกแถว (ห้ามเรียกว่าของจริง) · **A:** F18 ยังไม่ส่ง event comment หรือยังไม่มี sender · ไม่ถึง S ตอน 15:30 → ซ่อน `/comment-replies`

## 12. Security และ privacy

- **ที่มาของ event:** รับเฉพาะจาก F18 หลังตรวจลายเซ็น `X-Hub-Signature-256` และหา business จาก connection (`entry.id`) ไม่เคยจากข้อความ comment · F21 ไม่มี endpoint รับ webhook ของตัวเอง
- **Tenant:** ทุก query มี `business_id` · rule/delivery ของร้านอื่น = `NOT_FOUND` · `getComposerLock` ตรวจ conversation ด้วย `businessId`
- **Prompt injection / spam:** ไม่ส่งข้อความ comment ของลูกค้าเข้าโมเดล (ไม่มี AI call) และไม่ echo ข้อความ comment ลงใน DM/ตอบสาธารณะ (มีเพียงชื่อที่ sanitize แล้ว) · ข้อความตอบมาจากเจ้าของ + ตัวแทนค่าที่ควบคุมโดยเรา
- **การยินยอมและขอบเขต:** private reply เป็นเพียงการตอบ comment ที่ลูกค้าเริ่มเอง (หนึ่งข้อความต่อ comment) ไม่ใช่ broadcast · เพดานต่อคน 5 ข้อความ/วัน · เคารพ takeover · เคารพ `enabled`
- **ไม่ส่งซ้ำ:** claim ด้วย unique ก่อนเรียก provider · `unknown` ไม่ retry อัตโนมัติ · public reply ไม่โพสต์ซ้ำเด็ดขาด
- **สิทธิ์:** ตั้งค่า/กฎ/จำลอง = `business.bot_settings`; อ่าน = `chat.read`
- **PII:** เก็บ `comment_excerpt` ≤ 120 ตัวและชื่อผู้คอมเมนต์ใน DB เพื่อ log ของร้านเท่านั้น · ไม่ log ข้อความ comment/ชื่อ/author id ระดับ info (log ใช้ `deliveryId`, `ruleId`, ชนิด) · `audit.details` ไม่มีข้อความ
- **Token:** ไม่แตะ token (F18 เป็นผู้เรียก Graph) · ไม่มี secret ใน payload ของ job (event ไม่มี token)
- **Rate limit:** ไม่มี endpoint สาธารณะ · `simulate`/`test-match` ต้องล็อกอินและมีสิทธิ์ · `test-match` ใช้ `rateLimit({ key:'comments:test-match:'+businessId, limit:60, windowSeconds:60 })` กัน `findProductCodes` ถูกเรียกถี่

## 13. Edge cases

| กรณี | ผลที่ต้องได้ |
|---|---|
| Meta ส่ง event comment ซ้ำ | หนึ่ง job หนึ่ง claim หนึ่ง DM |
| restart กลาง `sending` | lease หมด → reconcile ถือเป็น `unknown` → ตรวจ/ส่งใหม่หนึ่งครั้ง (Meta จำกัดซ้ำอยู่แล้ว) |
| ลูกค้าแก้ comment (edited) แล้ว Meta ส่ง event ใหม่ | เป็น `comment_id` เดิม → ไม่ส่งซ้ำ |
| comment ของ Page เอง/ตอบซ้อน | F18 ไม่ส่งมา |
| keyword เป็นอังกฤษสั้น เช่น `cf` | ต้องเป็นคำเดี่ยว (`cf`, `CF A12`) ไม่ตรง `cfo`/`ความเชื่อ` |
| comment ภาษาไทยไม่เว้นวรรค `สนใจจ้า` | `contains` ตรง `สนใจ` |
| comment `ไม่สนใจ` แต่ keyword `สนใจ` | ไม่ตอบ |
| comment มีรหัสสินค้าแต่ไม่มี keyword และ rule ปิดการนับรหัส | ไม่ตอบ |
| หลาย rule ตรง | rule แรกตาม priority เท่านั้น (ไม่ส่งหลาย DM) |
| ร้านเปลี่ยนข้อความ rule ระหว่างรอ reconcile | ใช้ข้อความ ณ ตอนส่งครั้งแรกไม่ได้เก็บไว้ → reconcile เรนเดอร์ใหม่จาก rule ปัจจุบัน; rule ถูกลบ (`rule_id NULL`) → `failed` `rule_deleted` ไม่ส่ง |
| ลูกค้าตอบ DM | ข้อความเข้า F18 → `ai.reply` ตามปกติ · ล็อก composer ปลด |
| `recipient_id` ต่างจาก `from.id` ของ comment | ใช้ `recipient_id` เป็นตัวตนลูกค้า (แชตเดียวกับที่ลูกค้าตอบกลับมา) |
| F18 ถูกซ่อน/ยังไม่ merge | F21 ไม่ boot (`dependsOn: meta`); ถ้า F18 ซ่อนด้วย flag แต่ API ยังทำงาน → ตั้งค่ากฎได้แต่ไม่มี event จนกว่าจะเชื่อมต่อ (หน้าแสดง `notConnected`) |
| ข้อความ DM 1 000 ไบต์ IG ภาษาไทย (~330 ตัวอักษร) | ตรวจเป็นไบต์ เกินแล้วตัดตามบรรทัดหรือ `text_too_long` |
| comment ไลฟ์จำนวนมากพร้อมกัน | job ต่อ comment ผ่านคิว (ลำดับตาม lockKey ต่อ comment ไม่บล็อกกัน) · เพดานต่อคน 5/วัน กัน spam |

## 14. Build order (slices ≤ 45 นาที)

| Slice | เวลา | ส่งมอบ |
|---|---|---|
| **C1 กฎและการจับคู่** | 35 | migration · `match.ts` · `render.ts` · settings + rules CRUD + `test-match` routes · tests match/render/routes (ส่วนกฎ) · types |
| **C2 ประมวลผล ส่ง reconcile** | 40 | `gate.ts`, `process.ts` (`registerCommentHandler`, claim, `sendPrivateReply`, inbox, public reply) · `reconcile.ts` + schedule · `getComposerLock` · `simulate` (sandbox) · F22 hook แบบ dynamic · tests process/reconcile |
| **C3 UI + smoke** | 30 | `CommentRepliesPage.tsx` + i18n + seed (`runDemo`/`resetDemo`) + Playwright smoke + `EVIDENCE.md` · ทดสอบ R ด้วยมือกับ Page ทดสอบ (ถ้า F18 ผูกแล้ว) |

ลำดับ: ถ้า F18 `sendPrivateReply`/`registerCommentHandler` ยังไม่ merge ให้ทำ C1 ก่อนแล้วรอ (ไม่ mock ใน production code)

## 15. UNCONFIRMED และสิ่งที่ต้องตรวจในวันงาน

1. **Event comment ของ Meta:** FB `feed` (`item:'comment'`, `verb:'add'`, `comment_id`, `post_id`, `parent_id`, `from`, `message`) และ IG `comments` / `live_comments` (`value.id/text/from/media/parent_id`) · ตรวจกับ payload จริงด้วยปุ่ม Test ใน dashboard และ comment จากบัญชีทดสอบ · ทดสอบด้วยว่าในโหมด development event ถูกส่งเฉพาะ comment ของบัญชีที่มี role
2. **Private reply:** `POST /{page-id}/messages` (`recipient.comment_id`) และ IG เทียบเท่า · หนึ่งข้อความต่อ comment ภายใน 7 วัน · response มี `recipient_id` = PSID/IGSID ของลูกค้า (ตรวจว่าตรงกับ `sender.id` ตอนลูกค้าตอบกลับ) · สิทธิ์ที่ต้องมี (`pages_messaging`, `instagram_manage_messages`, `instagram_manage_comments`) ผ่านในโหมด development หรือไม่
3. **ข้อผิดพลาด "ตอบ comment นี้ไปแล้ว":** ทดสอบจริงโดยส่ง private reply ซ้ำที่ comment เดียวกัน แล้วจด `code`/`error_subcode`/ข้อความใส่ `ALREADY_REPLIED_SUBCODES` ของ F18 · ถ้า Meta ไม่ปฏิเสธซ้ำ (ส่งซ้ำได้) **ห้ามให้ reconcile ส่งซ้ำ** (เปลี่ยน §5.7 ให้ `unverifiable` ของ IG รอจนครบ 12 รอบแล้ว `failed` `unverified`)
4. **`GET /{comment-id}?fields=private_reply_conversation`** ใช้ตรวจ FB ได้จริงหรือไม่ · IG ไม่มี API ตรวจ (สมมติ) · ถ้าฟิลด์ FB ไม่มี → ปฏิบัติเหมือน IG ตามข้อ 3
5. **Public reply:** FB `POST /{comment-id}/comments`, IG `POST /{comment-id}/replies` และสิทธิ์ (`pages_manage_engagement`, `instagram_manage_comments`)
6. **`findProductCodes` ของ A2:** ชื่อ/ที่อยู่ไฟล์ (`live-commerce/service.ts`), รูปผลลัพธ์ (ฟิลด์ `itemId`, `quantity`?) · ตรวจหลัง F22 merge; ไม่มี = เปิดแค่ keyword และ `testMatch.productCodesChecked=false` · ถ้ารูปผลลัพธ์ต่างจากที่สมมติให้ปรับ `render.ts` ที่เดียว
7. **ต่อ Papi ล่าสุด:** กฎ "ตอบได้แม้ปิด AI" เป็นค่าตั้ง (`reply_when_ai_off`, ค่าเริ่มต้นปิด) แทนที่จะเป็นพฤติกรรมตายตัว — ตัดสินใจตามความปลอดภัยของ demo
8. **A1 composer lock:** ปัจจุบันบล็อกที่ sender (`failed` พร้อมเหตุผลใน inbox); ถ้าอยากปิดปุ่มส่งล่วงหน้า ให้ A1 เรียก `getComposerLock` (ต้องมี `CHANGE`/`NEED TO:A1` และ contract เพิ่ม: ยังไม่ทำ) · ตรวจกับ A1 ว่า inbox แสดง `delivery.error` ของข้อความ `failed`
9. **ข้อความ outbound ที่บันทึกด้วย `saveMessage` ตรง:** `delivery_state` จะเป็น `not_required` (ไม่ผ่าน `sendToCustomer`) · ตรวจกับ A1 ว่า inbox แสดงข้อความ `author:'ai'`+`origin:'comment'` ปกติ และไม่ติดป้ายส่งไม่สำเร็จ
10. **`customers` ซ้ำ:** ถ้า `recipient_id` ≠ id ที่ใช้ตอนลูกค้าตอบจริง จะมีลูกค้าสองแถว (ตรวจตามข้อ 2 และ F18 §15 ข้อ 8)
11. **อ่านตาราง core `customers` เพื่อตรวจ takeover (§5.2 ข้อ 9):** ถ้า A1 เสนอ helper `findConversationByExternalId` ให้เปลี่ยนมาใช้ (ตอนนี้อ่านอย่างเดียวตรง ๆ)
