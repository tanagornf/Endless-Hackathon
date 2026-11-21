# F23 broadcast — Broadcast และกลุ่มผู้รับ

| | |
|---|---|
| Lane / คน | **A1** / **A** · ลำดับ 4 (สุดท้าย) ใน lane (F09 → F11 → F12 → **F23**) |
| Tier / เป้า | **P2** (เริ่มเมื่อหัวหน้าโพสต์ `LEAD: OPEN P2`) · เป้า **R** บนเส้นทาง LINE เมื่อ push ถึงเพื่อนของ OA เดโมจริงและมีหลักฐาน · Messenger/Instagram: ส่งได้เฉพาะลูกค้าที่ทักมาใน 24 ชั่วโมง นอกนั้นถูกข้ามและรายงานตามจริง (สถานะตาม F18) · sender sandbox → **S** |
| Timebox | 45–120 นาที (S1+S2 = ขั้นต่ำ 45 · ครบ S1–S4 ≈ 110) |
| พึ่ง | A3 F24 (`listCustomersByTags`, `getCustomer`, **`listTags` ใหม่**) · F09 (`saveMessage`, `getCustomerLastInboundAt`) · F12 (`renderTemplate`; ไม่มี F12 ก็ส่งข้อความตัวอักษรได้) · core (`sendToCustomer`, `jobs`, `publish`, `audit`, `db`, `model.moderate`) · C3 F31 `notify` |
| ให้ | ไม่มี contract ข้าม lane |
| ใช้ | contracts ใน §4 |
| โฟลเดอร์ | `server/src/features/broadcast/` · `shared/features/broadcast/types.ts` · `web/src/features/broadcast/` |
| Web path | `/broadcast` |
| ห้ามหลุด 5 ข้อ | (1) ก่อนกดยืนยันไม่มี job และไม่มีข้อความออก (2) consent `revoked` ชนะเสมอ ตรวจที่ server ตอนยืนยันและ**ซ้ำตอนส่งทีละคน** (3) ส่งจริงผ่าน `sendToCustomer` เท่านั้น ห้ามเรียก LINE/Meta เอง (4) ผู้รับ 1 แถวต่อลูกค้าต่อ broadcast และส่งซ้ำไม่ได้ (idempotent) (5) pending ไม่เท่ากับ sent: สถานะต่อผู้รับมาจากผลจริงของ sender ไม่ใช่การ enqueue |

อ่าน: `contracts.ts` (crm, MarketingConsent, sendToCustomer/DeliveryResult, jobs/EnqueueOptions, SaveMessageInput) · [F09-inbox.md](F09-inbox.md) §4 · [F12-message-templates.md](F12-message-templates.md) §4 · [COOKBOOK](../COOKBOOK.md) §6 §8 · know-how เดิม: [porting brief](../porting/F23-broadcast.md) (ไม่ต้องใช้ในการสร้าง)

## 1. เป้าหมายและ user stories

ทำไมมี: เจ้าของร้านอยากแจ้งโปรโมชันกับลูกค้ากลุ่ม VIP แต่ต้องไม่ส่งหาคนที่ปฏิเสธข่าวสาร ไม่ส่งซ้ำ และต้องรู้ว่าใครได้รับจริง ไม่ใช่แค่ "ส่งคำสั่งแล้ว"

User stories:
1. เจ้าของเลือกช่องทางและแท็ก "VIP" เห็นตัวอย่างว่า: ทั้งกลุ่ม 2 คน ส่งได้ 1 คน ข้าม 1 คน (ปฏิเสธข่าวสาร)
2. เจ้าของเขียนข้อความ (ใส่ `{{customerName}}`) หรือเลือกเทมเพลต ดูตัวอย่าง แล้วต้องกด "ยืนยัน" ที่บอกจำนวนผู้รับก่อนระบบจึงเริ่มส่ง
3. เจ้าของตั้งเวลาส่งพรุ่งนี้ 10:00 แล้วยกเลิกได้ก่อนถึงเวลา
4. หลังส่ง เห็นรายคน: ส่งแล้ว / ล้มเหลว / ข้าม (พร้อมเหตุผล) / ไม่ทราบผล และข้อความไปอยู่ในแชตของลูกค้าแต่ละคน
5. ลูกค้าที่ถอนความยินยอมระหว่างรอ (หลังดูตัวอย่าง ก่อนถึงคิว) ถูกข้ามแม้เคยอยู่ในรายชื่อ
6. กดยืนยันซ้ำ (เน็ตหลุดแล้วกดอีก) ไม่ทำให้ส่งสองรอบ

นอกขอบเขต: ส่งหา "ทุกคน" โดยไม่เลือกแท็ก (ไม่มี contract ดึงลูกค้าทั้งหมด จึงบังคับเลือกแท็กอย่างน้อย 1) · เงื่อนไข "ตรงทุกแท็ก" (contract `listCustomersByTags` เป็น ANY เท่านั้น) · Messenger marketing messages/opt-in request · A/B test, ลิงก์ติดตามผล · โควตาแพ็กเกจ (ไม่มี; limit ของ LINE OA เองเป็นผลจาก sender) · ส่งหาลูกค้าช่องทาง `web` (ไม่ใช่ช่องทางการตลาด)

## 2. Data model

`server/src/features/broadcast/migrations/001_broadcast.sql`:
```sql
-- dependsOn: core
CREATE TABLE broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  client_request_id text NOT NULL,                              -- สร้างซ้ำด้วย key เดิม = ได้แถวเดิม
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  channels text[] NOT NULL CHECK (cardinality(channels) BETWEEN 1 AND 3 AND channels <@ ARRAY['line','facebook','instagram']::text[]),
  tag_ids uuid[] NOT NULL CHECK (cardinality(tag_ids) BETWEEN 1 AND 10),   -- id ของ F24 (ไม่มี FK: คนละ owner)
  content jsonb NOT NULL,                                       -- { source:'text', text } | { source:'template', templateId }
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','scheduled','sending','completed','partially_failed','failed','cancelled','enqueue_failed')),
  scheduled_at timestamptz,                                     -- null = ส่งทันทีหลังยืนยัน
  audience jsonb,                                               -- snapshot ตอนยืนยัน: { tagNames, total, eligible, skippedByReason, channels, takenAt }
  parts_snapshot jsonb,                                         -- MessagePart[] ที่ render ตอนยืนยัน (ชื่อลูกค้าเป็น token {{customerName}})
  moderation_flagged boolean NOT NULL DEFAULT false,
  last_error text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  confirmed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  cancelled_at timestamptz,
  UNIQUE (business_id, client_request_id)
);
CREATE INDEX broadcasts_list ON broadcasts (business_id, created_at DESC);
CREATE TABLE broadcast_recipients (
  broadcast_id uuid NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,                                    -- id ของ core customers (ไม่ FK เพื่อไม่ผูกการลบลูกค้า)
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('line','facebook','instagram')),
  display_name text NOT NULL DEFAULT '',                        -- snapshot ชื่อไว้แสดงประวัติ
  batch_no int NOT NULL,
  outcome text NOT NULL DEFAULT 'pending'
    CHECK (outcome IN ('pending','sending','sent','failed','unknown','skipped')),
  skip_reason text CHECK (skip_reason IS NULL OR skip_reason IN
    ('consent_revoked','consent_unknown','outside_window','customer_not_found','cancelled')),
  message_id uuid,                                              -- id ใน messages (ตั้งเมื่อส่งให้ sender)
  delivery_mode text CHECK (delivery_mode IS NULL OR delivery_mode IN ('real','sandbox')),
  error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (broadcast_id, customer_id),                      -- 1 แถวต่อลูกค้าต่อ broadcast (dedup)
  CHECK ((outcome = 'skipped') = (skip_reason IS NOT NULL))
);
CREATE INDEX broadcast_recipients_batch ON broadcast_recipients (broadcast_id, batch_no, outcome);
CREATE INDEX broadcast_recipients_message ON broadcast_recipients (message_id) WHERE message_id IS NOT NULL;
```
- ไม่มีตารางแบตช์: batch = `batch_no` ของผู้รับ + job `broadcast.send-batch`
- นับจำนวนคำนวณจาก `broadcast_recipients` ตอนอ่าน (ไม่เก็บ counts ซ้ำ จึงไม่คลาดเคลื่อน)

## 3. API endpoints

ใต้ `/api/v1` · ทุก route `auth:'business'` (`:businessId`) · ผู้ใช้ร้านอื่น/ไม่ใช่สมาชิก = 404

| Method | Path | permission | Request | Response | Errors |
|---|---|---|---|---|---|
| GET | `/businesses/:businessId/broadcasts` | `broadcast.read` | `ListQuery` | `Page<BroadcastSummary>` | VALIDATION_ERROR |
| GET | `/businesses/:businessId/broadcasts/tags` | `broadcast.read` | — | `TagOption[]` | — |
| POST | `/businesses/:businessId/broadcasts` | `broadcast.send` | `BroadcastBody` | `BroadcastDetail` (201; draft) | VALIDATION_ERROR, RATE_LIMITED, NOT_FOUND (template/แท็ก) |
| GET | `/businesses/:businessId/broadcasts/:broadcastId` | `broadcast.read` | — | `BroadcastDetail` | NOT_FOUND |
| GET | `/businesses/:businessId/broadcasts/:broadcastId/preview` | `broadcast.send` | — | `BroadcastPreview` | NOT_FOUND |
| POST | `/businesses/:businessId/broadcasts/:broadcastId/confirm` | `broadcast.send` | `ConfirmBody` | `BroadcastDetail` | NOT_FOUND, VERSION_CONFLICT (`currentEligible`), VALIDATION_ERROR (`no_recipients` `too_many_recipients` `schedule_invalid`), POLICY_BLOCKED (`moderation`) |
| POST | `/businesses/:businessId/broadcasts/:broadcastId/cancel` | `broadcast.send` | `{}` | `BroadcastDetail` | NOT_FOUND, POLICY_BLOCKED (`already_finished`) |
| POST | `/businesses/:businessId/broadcasts/:broadcastId/retry-enqueue` | `broadcast.send` | `{}` | `BroadcastDetail` | NOT_FOUND, POLICY_BLOCKED (`not_enqueue_failed`) |
| GET | `/businesses/:businessId/broadcasts/:broadcastId/recipients` | `broadcast.read` | `RecipientsQuery` | `Page<RecipientView>` | NOT_FOUND |

```ts
import { z } from 'zod';
export const CHANNELS = ['line', 'facebook', 'instagram'] as const;
export const BroadcastBody = z.object({
  clientRequestId: z.string().trim().min(8).max(80),
  name: z.string().trim().min(1).max(80),
  channels: z.array(z.enum(CHANNELS)).min(1).max(3).refine((a) => new Set(a).size === a.length),
  tagIds: z.array(z.string().uuid()).min(1).max(10),
  content: z.discriminatedUnion('source', [
    z.object({ source: z.literal('text'), text: z.string().trim().min(1).max(5000) }),
    z.object({ source: z.literal('template'), templateId: z.string().uuid() }),
  ]),
});
export const ConfirmBody = z.object({
  expectedEligible: z.number().int().min(0),                     // จำนวน "ส่งได้" ที่ผู้ใช้เห็นในตัวอย่าง
  scheduledAt: z.string().datetime().nullable().default(null),   // UTC ISO; null = ส่งทันที
});
export const ListQuery = z.object({ cursor: z.string().max(200).optional(), limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(['draft','scheduled','sending','completed','partially_failed','failed','cancelled','enqueue_failed']).optional() });
export const RecipientsQuery = z.object({ cursor: z.string().max(200).optional(), limit: z.coerce.number().int().min(1).max(100).default(50),
  outcome: z.enum(['pending','sending','sent','failed','unknown','skipped']).optional() });

export type SkipReason = 'consent_revoked' | 'consent_unknown' | 'outside_window' | 'customer_not_found' | 'cancelled';
export type Outcome = 'pending' | 'sending' | 'sent' | 'failed' | 'unknown' | 'skipped';
export interface TagOption { id: string; name: string; customerCount: number | null }
export interface OutcomeCounts { total: number; pending: number; sending: number; sent: number; sentSandbox: number; failed: number; unknown: number; skipped: number; skippedByReason: Partial<Record<SkipReason, number>> }
export interface BroadcastSummary { id: string; name: string; channels: Channel[]; status: string; scheduledAt: string | null; createdAt: string; confirmedAt: string | null; counts: OutcomeCounts | null }
export interface BroadcastDetail extends BroadcastSummary { tagIds: string[]; tagNames: string[]; content: z.infer<typeof BroadcastBody>['content']; previewText: string; moderationFlagged: boolean; lastError: string | null; createdByName: string | null; confirmedByName: string | null; replayed: boolean }
export interface BroadcastPreview {
  total: number; eligible: number; skippedByReason: Partial<Record<SkipReason, number>>;
  byChannel: { channel: Channel; total: number; eligible: number }[];
  sample: { customerId: string; displayName: string; channel: Channel; eligible: boolean; skipReason: SkipReason | null }[];   // ≤ 10 คนแรก (eligible ก่อน)
  tooMany: boolean; notes: string[];                             // เช่น 'meta_window', 'sender_sandbox' (ใช้แสดงคำเตือน)
}
export interface RecipientView { customerId: string; displayName: string; channel: Channel; outcome: Outcome; skipReason: SkipReason | null; deliveryMode: 'real' | 'sandbox' | null; error: string | null; updatedAt: string }
```
`replayed:true` เมื่อ confirm ซ้ำบน broadcast ที่ยืนยันไปแล้ว

## 4. Service functions และ contracts

ไม่มี contract ข้าม lane ที่ F23 ให้ · ใช้:
`listCustomersByTags(businessId, tagIds, opts)` และ `getCustomer(businessId, customerId)` (A3 F24, contracts.ts) · `renderTemplate(templateId, vars, { businessId })` (F12) · `saveMessage` และ `getCustomerLastInboundAt` (F09) · `sendToCustomer` `jobs` `publish` `audit` `db` `model.moderate` (core) · `notify` (C3)

### Contract additions

```ts
// ═══ ต้องการจาก A3 F24 (contracts.ts ยังไม่มีฟังก์ชันนี้: หัวหน้าวางต่อท้ายส่วน crm) ═══
export interface TagSummary { id: string; name: string; customerCount: number }
/**
 * @owner F24 crm · A3 · consumers: A1 F23 broadcast (audience picker), B3
 * แท็กทั้งหมดของร้านพร้อมจำนวนลูกค้า (เรียงชื่อ). ไม่มีแท็ก → [].
 * @fake SEED.tags ของร้านนั้น: tag_vip_a → { id, name: 'VIP', customerCount: 2 } (A), tag_vip_b → 1 (B)
 */
export declare function listTags(businessId: string): Promise<TagSummary[]>;
```
F23 โพสต์ `NEED TO:A3` ตอนเริ่ม S1 (ถ้า A3 ยังไม่ส่ง ใช้ fake จาก SEED ภายในโฟลเดอร์ F23 ชั่วคราวและจดใน EVIDENCE.md)
ฟังก์ชันภายใน: `buildAudience`, `classify`, `confirmBroadcast`, `sendBatchJob`, `finalizeJob`, `syncOutcomes`, `fillRecipientName`.

## 5. Algorithms

### ค่าคงที่ (`limits.ts`)

| ค่า | ค่า |
|---|---|
| `AUDIENCE_MAX` | 1000 คนต่อ broadcast |
| `BATCH_SIZE` | 20 |
| `SEND_THROTTLE_MS` | 200 ระหว่างผู้รับในแบตช์ |
| `BATCH_GAP_SECONDS` | 5 (เว้นระหว่างแบตช์ที่ enqueue) |
| `META_WINDOW_HOURS` | 24 |
| `SCHEDULE_MIN_LEAD_SECONDS` / `MAX_DAYS` | 60 วินาที / 30 วัน |
| `FINALIZE_WAIT_MINUTES` | 15 (หลังหมดเวลานี้ ผู้รับที่ยัง sending → unknown) |
| `CREATE_PER_HOUR_BUSINESS` | 20 (`assertRateLimit` key `broadcast:create:<businessId>`) |
| `PREVIEW_SAMPLE` | 10 |
| `MESSAGE_MAX` | 5000 |

### 5.1 State machine

broadcast:

| from | event | to |
|---|---|---|
| (ไม่มี) | สร้าง (`POST`) | draft |
| draft | ยืนยันสำเร็จ + `scheduledAt` อนาคต | scheduled |
| draft | ยืนยันสำเร็จ + ส่งทันที | sending (เมื่อ batch แรกเริ่ม; ระหว่างนั้น scheduled) |
| draft / scheduled | ยกเลิก | cancelled (ผู้รับ pending → skipped `cancelled`) |
| draft | enqueue ล้มตอนยืนยัน | enqueue_failed |
| enqueue_failed | `retry-enqueue` สำเร็จ | scheduled |
| scheduled | batch แรกเริ่มทำงาน | sending |
| sending | ยกเลิก | cancelled (แชตที่ส่งไปแล้วไม่ถูกเรียกคืน; ที่เหลือถูกข้าม) |
| sending | finalize: ทุกผู้รับ sent หรือ skipped | completed |
| sending | finalize: ผสม sent กับ failed/unknown | partially_failed |
| sending | finalize: ไม่มี sent เลย (มี failed/unknown) | failed |
| completed / partially_failed / failed / cancelled | ทุกเหตุการณ์ | (สถานะสุดท้าย ยกเลิกซ้ำ = `POLICY_BLOCKED already_finished`) |

ผู้รับ (`outcome`):

| from | event | to |
|---|---|---|
| (ตอนยืนยัน) | ไม่ eligible | skipped (+ reason) |
| (ตอนยืนยัน) | eligible | pending |
| pending | batch รัน: consent ไม่ใช่ granted ตอนนี้ | skipped (`consent_revoked`/`consent_unknown`) |
| pending | batch รัน: Meta และนอกหน้าต่าง 24 ชม. | skipped (`outside_window`) |
| pending | batch รัน: ไม่พบลูกค้า | skipped (`customer_not_found`) |
| pending | `sendToCustomer` คืน receipt | sending (+ message_id, delivery_mode) |
| pending | `saveMessage`/`sendToCustomer` throw (เช่น `CHANNEL_NOT_CONNECTED`) | failed (+ error ย่อ) |
| sending | `message.delivery_state = 'sent'` | sent |
| sending | `delivery_state = 'failed'` | failed |
| sending | `delivery_state = 'unknown'` หรือค้าง `pending` เกิน `FINALIZE_WAIT_MINUTES` | unknown |
| pending | broadcast ถูกยกเลิก | skipped (`cancelled`) |
| sending/ผู้รับที่ batch ถูกรันซ้ำหลัง crash | พบ `sending` ในแบตช์ที่กำลังเริ่มโดยไม่มี message_id | unknown (`interrupted`) **ไม่ส่งซ้ำ** |

### 5.2 `buildAudience(businessId, tagIds, channels)`

1. วน `listCustomersByTags(businessId, tagIds, { cursor, limit: 100 })` (ไม่ใส่ `requireConsent` เพื่อนับและอธิบายคนที่ถูกข้าม) จนครบ · ตัดซ้ำด้วย `customer.id` (ลูกค้าตรงหลายแท็ก = 1 แถว) · กรองเฉพาะ `channel ∈ channels` (ลูกค้าช่องทางอื่นไม่นับในกลุ่ม) · เกิน `AUDIENCE_MAX` → หยุดนับแล้วตั้ง `tooMany`
2. **classify** แต่ละคน (สำหรับ preview/ยืนยัน): `marketingConsent === 'revoked'` → skip `consent_revoked` · `'unknown'` → skip `consent_unknown` (marketing ต้องเป็น `granted`) · `facebook`/`instagram` และ (`getCustomerLastInboundAt(businessId, id)` เป็น null หรือเก่ากว่า 24 ชม. จากตอนนี้) → skip `outside_window` · อื่น → eligible
3. ลำดับผล: eligible ก่อน (เรียงตามชื่อ) แล้ว skipped · `notes`: มี Meta ใน channels → `meta_window`
4. ผลทั้งหมดอยู่ในหน่วยความจำของ request (preview ไม่เขียน DB)

### 5.3 สร้างและดูตัวอย่าง

1. `POST`: `assertRateLimit` · ตรวจ `tagIds` ทุกตัวอยู่ใน `listTags(businessId)` (ไม่อยู่ → `NOT_FOUND`) · `content.template` → `renderTemplate(templateId, {}, { businessId })` ทดลอง (ไม่พบ → `NOT_FOUND`; render ล้ม → `VALIDATION_ERROR`) · `INSERT … ON CONFLICT (business_id, client_request_id) DO NOTHING` แล้วคืนแถวที่ตรงกับ key (payload ต่างจากเดิม → `IDEMPOTENCY_CONFLICT`) · status `draft` · audit `broadcast.create`
2. `moderate` ข้อความ (text หรือข้อความที่ render): `model.moderate({ usage: { featureId: 'F23', purpose: 'moderate', businessId }, text })` → `flagged` ตั้ง `moderation_flagged = true` (ดู §5.4 ข้อ 3) · ล้ม → ไม่ตั้ง + log
3. `GET preview`: เฉพาะ draft (สถานะอื่นคืน preview จาก snapshot ใน `audience`) → `buildAudience` + `notes` · **ไม่มี job ไม่มีข้อความ ไม่เขียนผู้รับ** (test บังคับ)

### 5.4 ยืนยัน (`confirm`) — จุดที่เริ่มมีผลจริง

1. สถานะ ≠ draft: `scheduled|sending|completed|…` → คืน detail เดิม `replayed: true` (idempotent; ไม่ทำอะไรซ้ำ) · `cancelled` → `POLICY_BLOCKED already_finished`
2. `scheduledAt`: ไม่ null ต้อง ≥ now + 60 วินาที และ ≤ now + 30 วัน ไม่งั้น `VALIDATION_ERROR schedule_invalid`
3. `moderation_flagged` หรือ moderate ซ้ำตอนนี้ flagged → `POLICY_BLOCKED` `moderation` (ข้อความถึงคนจำนวนมากเข้มกว่าข้อความเดี่ยว; ภาษาไทยไม่ยืนยันใน docs → เจ้าของแก้ข้อความแล้วสร้างใหม่) 
4. `db.withAdvisoryLock('broadcast:confirm:' + broadcastId, …)`: อ่านแถวซ้ำ (race) แล้ว `buildAudience` ใหม่ **ตอนนี้** · `tooMany` → `VALIDATION_ERROR too_many_recipients` · `eligible === 0` → `VALIDATION_ERROR no_recipients` · `eligible !== expectedEligible` → `VERSION_CONFLICT` `details.currentEligible` (ผู้ใช้ต้องดูตัวอย่างใหม่ — กันกดยืนยันตัวเลขที่ไม่ตรงความจริง)
5. render snapshot: `text` → `[TextPart(text)]` (แทน `{{shopName}}` `{{today}}` ตอนนี้ แต่ปล่อย `{{customerName}}` ไว้) · `template` → `renderTemplate(templateId, { customerName: '{{customerName}}', shopName, today }, { businessId })` → เก็บเป็น `parts_snapshot` (ถ้าแก้/ลบ template ทีหลัง การส่งที่ยืนยันแล้วไม่เปลี่ยน) · ตรวจ parts ≤ 10
6. transaction เดียว (`db.tx`): INSERT `broadcast_recipients` ทุกคนในกลุ่ม (eligible → `pending` + `batch_no = floor(index / BATCH_SIZE)` เรียงตามชื่อ; ไม่ eligible → `skipped` + reason + `batch_no 0`) พร้อม `display_name` และ `channel` · UPDATE broadcast: `status = 'scheduled'` (ทั้งส่งทันทีและตั้งเวลา; เปลี่ยนเป็น `sending` เมื่อ batch แรกเริ่ม), `audience = { tagNames, total, eligible, skippedByReason, channels, takenAt }`, `parts_snapshot`, `scheduled_at`, `confirmed_by`, `confirmed_at = now()` · audit `broadcast.confirm` (details: tagIds, channels, total, eligible, scheduledAt; ไม่มีชื่อลูกค้า/ข้อความ)
7. **หลัง commit** `jobs.enqueue` (ไม่ทำใน tx): สำหรับ n = 0..batches−1: `broadcast.send-batch` payload `{ broadcastId, batchNo: n }` opts `{ dedupKey: 'broadcast:' + id + ':batch:' + n, businessId, lockKey: 'broadcast:' + id, runAt: max(scheduledAt ?? now, now) + n × BATCH_GAP_SECONDS }` · แล้ว `broadcast.finalize` payload `{ broadcastId }` dedupKey `broadcast:<id>:finalize` runAt = (runAt ของแบตช์สุดท้าย) + 30 วินาที · ล้ม → `status = 'enqueue_failed'`, `last_error` (ไม่มีข้อความออกเพราะยังไม่มี batch รัน) · publish custom `broadcast.changed`
8. `retry-enqueue`: เฉพาะ `enqueue_failed`: enqueue ชุดเดิมซ้ำ (dedupKey กันซ้ำ) แล้วตั้ง `scheduled`

### 5.5 `broadcast.send-batch` (job handler ต่อแบตช์; lockKey ทำให้รันทีละแบตช์ต่อ broadcast)

1. โหลด broadcast: ไม่มี → return · `cancelled` → return · ยังไม่ถึง `scheduled_at` (กรณี clock) → `return { retryAt: scheduled_at }` · ถ้า `scheduled` → `UPDATE status='sending', started_at = coalesce(started_at, now())`
2. กู้ crash: แถวในแบตช์ที่ `outcome = 'sending' AND message_id IS NULL` → `unknown` (`error 'interrupted'`) — **ไม่ส่งซ้ำ**
3. สำหรับแถว `pending` ของ `batch_no` นี้ (เรียงตามชื่อ), ทีละคน (sequential, `await sleep(SEND_THROTTLE_MS)` ระหว่างคน, เช็ก `job.signal.aborted` และสถานะ `cancelled` ทุกคน):
   1. `getCustomer(businessId, customerId)` → null → skipped `customer_not_found` · `marketingConsent !== 'granted'` → skipped `consent_revoked`|`consent_unknown` (**ตรวจซ้ำที่ server ทุกครั้ง แม้เคยอยู่ใน preview**)
   2. channel `facebook`/`instagram`: `getCustomerLastInboundAt` เก่ากว่า 24 ชม. หรือ null → skipped `outside_window`
   3. สร้าง parts: จาก `parts_snapshot` แทนตัวอักษร token `{{customerName}}` ใน TextPart/ปุ่ม/ข้อความด้วยชื่อลูกค้า (ล้างอักขระควบคุม ตัด 80 ตัว; ชื่อว่าง → ใช้คำว่า "ลูกค้า" เมื่อภาษาของร้านเป็น `th` และ "customer" เมื่อเป็น `en`: บรอดแคสต์เป็นข้อความที่ร้านเขียนเองภาษาเดียว จึงใช้ภาษาของร้าน ไม่ใช่ภาษาของผู้รับแต่ละคน) · ไม่แทนใน URL
   4. `saveMessage({ businessId, customer: { channel, externalId: customer.externalId, displayName }, direction: 'outbound', author: 'staff', authorUserId: broadcast.confirmed_by, parts, origin: 'broadcast', triggerAi: false, clientRequestId: 'broadcast:' + broadcastId + ':' + customerId })` → ได้ `conversation.id`, `message.id` (ส่งซ้ำด้วย clientRequestId เดิมได้แถวเดิม `created:false` ไม่เกิดข้อความซ้ำ)
   5. `sendToCustomer(conversation.id, parts, { messageId, businessId })` → receipt (`delivery.state 'pending'`) → ตั้ง `outcome = 'sending'`, `message_id`, `delivery_mode = receipt.delivery.mode`
   6. throw ใด ๆ (`CHANNEL_NOT_CONNECTED`, ข้อผิดพลาด DB) → `outcome = 'failed'`, `error = code + ข้อความสั้น ≤ 200` · ไม่ retry ที่ผู้รับนั้น (กันส่งซ้ำที่ไม่รู้ผล) · ไปคนถัดไป
4. จบแบตช์: `syncOutcomes(broadcastId)` · publish `{ type:'job.updated' … progress }` ผ่าน `job.progress(done, total)` และ custom `broadcast.progress` `{ broadcastId }`
5. งานเป็น idempotent: รันซ้ำทั้งแบตช์ → ข้ามแถวที่ไม่ใช่ `pending`

### 5.6 `syncOutcomes` และ `broadcast.finalize`

`syncOutcomes(id)`: สำหรับผู้รับ `outcome = 'sending'` join `messages` (core, อ่านอย่างเดียว) ตาม `message_id`: `delivery_state = 'sent'` → `sent` · `'failed'` → `failed` (`error` = `delivery_error` ตัดสั้น) · `'unknown'` → `unknown` · `'pending'` → คงเดิม · อัปเดต `delivery_mode` จากข้อความ
`finalize` (job `broadcast.finalize`): `syncOutcomes` · ถ้ายังมี `pending` ของ batch ที่ยังไม่รัน หรือ `sending` และ `now < started_at + 15 นาที` (และ ไม่ cancelled) → `return { retryAt: now + 30 วินาที }` (ไม่นับ attempt) · มิฉะนั้น: ผู้รับที่ยัง `sending` → `unknown` · คำนวณสถานะ (§5.1) ตั้ง `finished_at` · `notify({ businessId, to: { role: 'owners' }, type: 'report', title: 'บรอดแคสต์ "<name>" ส่งเสร็จแล้ว', body: 'ส่งแล้ว X · ล้มเหลว Y · ข้าม Z', link: '/broadcast?b=<id>', dedupKey: 'broadcast-done:' + id })` · publish `broadcast.changed`
`GET detail/recipients` เรียก `syncOutcomes` ก่อนอ่านเสมอ (ผลสดโดยไม่ต้องรอ finalize)

### 5.7 ยกเลิก

`draft|scheduled|sending|enqueue_failed` → `cancelled`, `cancelled_at = now()` · ผู้รับ `pending` → `skipped` `cancelled` ใน tx เดียว · แบตช์ที่ทำงานอยู่หยุดตอนคนถัดไป · ที่ส่งไปแล้ว (`sending/sent`) คงสถานะ · audit `broadcast.cancel`

### 5.8 ตัวเลขที่แสดง

`OutcomeCounts` จาก `SELECT outcome, delivery_mode, skip_reason, count(*) … GROUP BY` · `sentSandbox` = `sent` ที่ `delivery_mode = 'sandbox'` · UI แยกเลข "ส่งแล้ว (จริง)" กับ "ส่งแล้ว (Sandbox)" เสมอ ห้ามรวมเป็น "ส่งถึงลูกค้า"

## 6. AI calls

ไม่มี model call สร้างข้อความ · ใช้ `model.moderate` (ฟรี; featureId `F23`, purpose `moderate`) กับข้อความ broadcast ตอนสร้างและตอนยืนยัน · `MODEL_MODE=fake`: flagged เมื่อข้อความมี `[flag]` · ล้ม/timeout = ผ่านต่อ (fail open) พร้อม log · ไม่ได้ตรวจกับ API จริง (ไม่มี prompt ใหม่)

## 7. UI

routes: `/broadcast` layout app permission `broadcast.read` (ปุ่มสร้าง/ยืนยันต้องมี `broadcast.send` เพิ่ม) · `?b=<broadcastId>` เปิดรายละเอียด · เมนู `/broadcast` กลุ่ม `customers` icon `CampaignOutlined` order 30 permission `broadcast.read` searchTerms `['บรอดแคสต์','ประกาศ','โปรโมชัน','broadcast']`

**แท็บ "สร้างบรอดแคสต์"** (stepper 3 ขั้น, จอแคบเป็นหน้าเต็ม):
1. **ผู้รับ**: ชื่อรายการ · ช่องทาง (checkbox LINE / Messenger / Instagram) · แท็ก (multi-select จาก `GET …/tags` พร้อมจำนวนคน; ไม่มีแท็กให้เลือก → `EmptyState` "ยังไม่มีแท็ก สร้างแท็กที่เมนูลูกค้าก่อน") · ข้อความเตือน "Messenger และ Instagram ส่งได้เฉพาะลูกค้าที่ทักมาภายใน 24 ชั่วโมง"
2. **ข้อความ**: เลือก "พิมพ์เอง" (textarea ≤ 5000 + ตัวนับ + ปุ่มแทรก `{{customerName}}`) หรือ "ใช้เทมเพลต" (รายการจาก `GET /businesses/:id/templates` ของ F12; ถ้า F12 ซ่อน/404 ซ่อนตัวเลือกนี้) · ตัวอย่างบับเบิลแทนชื่อด้วย "สมชาย"
3. **ตรวจและยืนยัน**: เรียก `POST` สร้าง draft แล้ว `GET preview` → การ์ดสรุป: "ทั้งกลุ่ม N · ส่งได้ M · ข้าม K" + แยกเหตุผล (ปฏิเสธข่าวสาร / ยังไม่ระบุความยินยอม / นอกหน้าต่าง 24 ชม.) + ตารางตัวอย่าง ≤ 10 คน (ชื่อ, ช่องทาง, ป้ายส่งได้/ข้ามพร้อมเหตุผล) + ข้อความที่จะส่ง · เวลาส่ง: "ส่งทันที" หรือ "ตั้งเวลา" (`datetime-local` ตีความเป็น Asia/Bangkok แล้วแปลงเป็น UTC) · ปุ่ม **ยืนยันส่ง** (`data-testid="broadcast-confirm"`) เปิด `ConfirmDialog`: "ส่งถึง M คน?" ข้อความ "ส่งตามเวลาที่เลือก และหยุดได้ก่อนส่งเท่านั้น ลูกค้าที่ปฏิเสธข่าวสารจะไม่ได้รับ" ปุ่ม "ส่งบรอดแคสต์" · ไม่มีผู้ส่งได้ (M=0) → ปุ่มยืนยัน disabled + คำอธิบาย · `VERSION_CONFLICT` → "ผู้รับเปลี่ยนไป (ตอนนี้ส่งได้ N คน) ดูตัวอย่างอีกครั้ง" + โหลด preview ใหม่ (ไม่ส่ง) · `POLICY_BLOCKED moderation` → "ข้อความนี้อาจไม่เหมาะสม แก้ไขแล้วลองใหม่" · ตัวเลข preview มี `data-testid="broadcast-preview-eligible"`

**แท็บ "ประวัติ"**: `DataTable` ชื่อ · ช่องทาง · สถานะ (`StatusChip generic` ใช้ label i18n เพราะบางสถานะไม่มีใน map กลาง) · ส่งแล้ว/ทั้งหมด · เวลาส่ง/ตั้งเวลา · แถวคลิกเปิดรายละเอียด · EmptyState "ยังไม่มีบรอดแคสต์"

**รายละเอียด**: หัว (ชื่อ, สถานะ, ปุ่ม "ยกเลิก" เมื่อ draft/scheduled/sending, "ลองส่งคำสั่งอีกครั้ง" เมื่อ `enqueue_failed`) · แถบตัวเลข: ส่งแล้ว (จริง) · ส่งแล้ว (Sandbox) · กำลังส่ง · ล้มเหลว · ไม่ทราบผล · ข้าม (พร้อมเหตุผล) · ป้ายคำอธิบาย: "Sandbox = ระบบจำลอง ไม่ได้ส่งถึงลูกค้าจริง" · ตารางผู้รับ (กรองตามผล, เลื่อนโหลดเพิ่ม) · รีเฟรชสดผ่าน custom event `broadcast.progress`/`broadcast.changed` และ poll ทุก 5 วินาทีระหว่าง `sending`/`scheduled`

state: loading skeleton, empty, error + ลองใหม่ ทุกแท็บ · ปุ่มยืนยันกันกดซ้ำ

### ตาราง i18n (namespace `broadcast`)

| key | th | en |
|---|---|---|
| `menu.title` | บรอดแคสต์ | Broadcast |
| `page.title` | บรอดแคสต์ | Broadcast |
| `tabs.create` | สร้างบรอดแคสต์ | Create broadcast |
| `tabs.history` | ประวัติ | History |
| `step.audience` | ผู้รับ | Audience |
| `step.message` | ข้อความ | Message |
| `step.review` | ตรวจและยืนยัน | Review and confirm |
| `form.name` | ชื่อรายการ | Broadcast name |
| `form.channels` | ช่องทาง | Channels |
| `form.tags` | แท็กผู้รับ | Recipient tags |
| `form.noTags` | ยังไม่มีแท็ก สร้างแท็กที่เมนูลูกค้าก่อน | No tags yet. Create tags in the Customers menu first |
| `form.metaWindow` | Messenger และ Instagram ส่งได้เฉพาะลูกค้าที่ทักมาภายใน 24 ชั่วโมง | Messenger and Instagram can only reach customers who wrote within 24 hours |
| `form.sourceText` | พิมพ์เอง | Write it |
| `form.sourceTemplate` | ใช้เทมเพลต | Use a template |
| `form.text` | ข้อความ | Message |
| `form.textHint` | ใส่ชื่อลูกค้าด้วย {{customerName}} | Use {{customerName}} for the customer's name |
| `form.template` | เลือกเทมเพลต | Choose a template |
| `form.previewName` | สมชาย | Somchai |
| `form.next` | ถัดไป | Next |
| `form.back` | ย้อนกลับ | Back |
| `review.total` | ทั้งกลุ่ม {{n}} คน | {{n}} in the group |
| `review.eligible` | ส่งได้ {{n}} คน | {{n}} can be sent |
| `review.skipped` | ข้าม {{n}} คน | {{n}} skipped |
| `review.sample` | ตัวอย่างผู้รับ | Sample recipients |
| `review.when` | เวลาส่ง | When to send |
| `review.now` | ส่งทันที | Send now |
| `review.later` | ตั้งเวลา | Schedule |
| `review.scheduleAt` | ส่งเมื่อ (เวลาประเทศไทย) | Send at (Thailand time) |
| `review.confirm` | ยืนยันส่ง | Confirm and send |
| `review.noEligible` | ไม่มีผู้รับที่ส่งได้ ปรับกลุ่มหรือช่องทาง | No one can be sent to. Change the group or channels |
| `review.changed` | ผู้รับเปลี่ยนไป (ตอนนี้ส่งได้ {{n}} คน) ดูตัวอย่างอีกครั้ง | Recipients changed (now {{n}}). Review again |
| `review.moderation` | ข้อความนี้อาจไม่เหมาะสม แก้ไขแล้วลองใหม่ | This message may be inappropriate. Edit it and try again |
| `review.tooMany` | กลุ่มใหญ่เกิน 1,000 คน ลดแท็กหรือช่องทาง | The group is over 1,000 people. Reduce tags or channels |
| `review.scheduleInvalid` | เวลาต้องอยู่ระหว่าง 1 นาทีถึง 30 วันข้างหน้า | The time must be between 1 minute and 30 days from now |
| `confirm.title` | ส่งถึง {{n}} คน? | Send to {{n}} people? |
| `confirm.message` | ระบบจะส่งตามเวลาที่เลือก หยุดได้ก่อนส่งเท่านั้น ลูกค้าที่ปฏิเสธข่าวสารจะไม่ได้รับ | It sends at the time you chose and can be stopped only before sending. Customers who opted out will not receive it |
| `confirm.action` | ส่งบรอดแคสต์ | Send broadcast |
| `skip.consent_revoked` | ปฏิเสธข่าวสาร | Opted out |
| `skip.consent_unknown` | ยังไม่ระบุความยินยอม | Consent not recorded |
| `skip.outside_window` | นอกหน้าต่าง 24 ชั่วโมง | Outside the 24-hour window |
| `skip.customer_not_found` | ไม่พบลูกค้า | Customer not found |
| `skip.cancelled` | ยกเลิกก่อนส่ง | Cancelled before sending |
| `status.draft` | ร่าง | Draft |
| `status.scheduled` | ตั้งเวลาแล้ว | Scheduled |
| `status.sending` | กำลังส่ง | Sending |
| `status.completed` | ส่งครบแล้ว | Completed |
| `status.partially_failed` | ส่งสำเร็จบางส่วน | Partly failed |
| `status.failed` | ส่งไม่สำเร็จ | Failed |
| `status.cancelled` | ยกเลิกแล้ว | Cancelled |
| `status.enqueue_failed` | ตั้งคิวส่งไม่สำเร็จ | Could not queue |
| `outcome.pending` | รอส่ง | Waiting |
| `outcome.sending` | กำลังส่ง | Sending |
| `outcome.sent` | ส่งแล้ว | Sent |
| `outcome.failed` | ล้มเหลว | Failed |
| `outcome.unknown` | ไม่ทราบผล | Unknown |
| `outcome.skipped` | ข้าม | Skipped |
| `detail.sentReal` | ส่งแล้ว (จริง) | Sent (real) |
| `detail.sentSandbox` | ส่งแล้ว (Sandbox) | Sent (sandbox) |
| `detail.sandboxHint` | Sandbox คือระบบจำลอง ไม่ได้ส่งถึงลูกค้าจริง | Sandbox is a simulator. Nothing reached the customer |
| `detail.cancel` | ยกเลิก | Cancel |
| `detail.cancelTitle` | ยกเลิกบรอดแคสต์นี้? | Cancel this broadcast? |
| `detail.cancelMessage` | คนที่ยังไม่ได้รับจะไม่ได้รับ ที่ส่งไปแล้วเรียกคืนไม่ได้ | Those not yet sent will not receive it. Messages already sent cannot be recalled |
| `detail.retryEnqueue` | ลองตั้งคิวส่งอีกครั้ง | Try queuing again |
| `detail.recipients` | ผู้รับ | Recipients |
| `detail.filter` | กรองตามผล | Filter by result |
| `detail.createdBy` | สร้างโดย {{name}} | Created by {{name}} |
| `detail.confirmedBy` | ยืนยันโดย {{name}} | Confirmed by {{name}} |
| `history.name` | ชื่อ | Name |
| `history.channels` | ช่องทาง | Channels |
| `history.progress` | {{sent}}/{{total}} | {{sent}}/{{total}} |
| `history.when` | เวลา | Time |
| `history.empty.title` | ยังไม่มีบรอดแคสต์ | No broadcasts yet |
| `history.empty.description` | สร้างบรอดแคสต์แรกเพื่อแจ้งข่าวลูกค้ากลุ่มที่เลือก | Create your first broadcast to reach a customer group |

## 8. Jobs, schedules, events

| job | payload (id เท่านั้น) | dedupKey | lockKey | runAt | retry |
|---|---|---|---|---|---|
| `broadcast.send-batch` | `{ broadcastId, batchNo }` | `broadcast:<id>:batch:<n>` | `broadcast:<id>` | `max(scheduledAt, now) + n × 5 s` | throw → retry ปกติของ core (5 ครั้ง; handler idempotent) · `AppError retryable:false` ไม่ใช้ |
| `broadcast.finalize` | `{ broadcastId }` | `broadcast:<id>:finalize` | `broadcast:<id>` | แบตช์สุดท้าย + 30 s | คืน `{ retryAt }` จนครบหรือหมด 15 นาที |

- schedules: ไม่มี
- realtime: custom `{ featureId:'F23', name:'broadcast.changed' | 'broadcast.progress', data:{ broadcastId } }` + `job.updated` ของ core ผ่าน `job.progress`
- audit: `broadcast.create` · `broadcast.confirm` · `broadcast.cancel` (details: id, tagIds, channels, ตัวเลข; ไม่มีชื่อลูกค้า ไม่มีเนื้อหา)
- notify: `report` ถึง owners เมื่อ finalize

## 9. Seed และ fixtures

`server/src/features/broadcast/seed.ts`: `run` ไม่ใส่แถว (ไม่มีข้อมูล SEED ของ broadcast) · `runDemo` (ร้าน A, created_by = `owner_a`): 1 broadcast `completed` ชื่อ "โปรโมชัน VIP ต้นเดือน" ผู้รับ 3 คนสังเคราะห์ (outcome sent/sandbox, failed 1, skipped `consent_revoked` 1) เพื่อให้หน้าประวัติไม่ว่างตอนกรรมการดู · 1 draft "ประกาศวันหยุด" · ใช้ id คงที่ในไฟล์ seed + `ON CONFLICT DO NOTHING` · `resetDemo`: ลบ broadcasts ทั้งหมดของร้านเดโม A และ B (ผู้รับ cascade; ไม่ลบข้อความในแชต) แล้ว `runDemo` เติมกลับ
fixture test: ลูกค้า SEED `cust_a1` (LINE, granted) `cust_a2` (Messenger, revoked) แท็ก `tag_vip_a` (2 คน) · ลูกค้าเสริมที่ test สร้างเองด้วย `saveMessage` + ตั้ง consent ผ่าน fake ของ F24 · `CLOCK_FIXTURE` สำหรับตั้งเวลา · sender: sandbox capture ของ core (`mode sandbox`) และ mock sender mode 'real' ใน unit test ของ delivery

## 10. Tests

Unit/service (`broadcast.service.test.ts`, `MODEL_MODE=fake`):
1. `buildAudience`: `tag_vip_a` ช่องทาง `['line','facebook']` → total 2, eligible 1 (cust_a1), skippedByReason `{ consent_revoked: 1 }` · เลือกเฉพาะ `line` → total 1 (ลูกค้า Messenger ไม่นับ) · ลูกค้าตรงสองแท็กได้ 1 แถว · ลูกค้าร้าน B ไม่ปรากฏ (tenant)
2. Meta window: ลูกค้า facebook ที่ `last_inbound_at` 23 ชม. ก่อน → eligible · 25 ชม. → skip `outside_window` · ไม่เคยทัก → skip · consent `unknown` → skip `consent_unknown`
3. สร้าง: ซ้ำ `clientRequestId` เดิม payload เดิม → แถวเดิม (1 แถวในตาราง) · payload ต่าง → `IDEMPOTENCY_CONFLICT` · แท็กของร้านอื่น/ไม่มี → `NOT_FOUND` · template ร้านอื่น → `NOT_FOUND`
4. **preview ไม่มีผลข้างเคียง**: หลังสร้าง draft + เรียก preview หลายครั้ง → ตาราง `jobs` ไม่มี `broadcast.*`, `messages` ไม่เพิ่ม, `broadcast_recipients` ว่าง
5. confirm: `expectedEligible` ไม่ตรง → `VERSION_CONFLICT` + `currentEligible` และไม่มีแถวผู้รับ/ไม่มี job · ตรง → snapshot ผู้รับครบ (eligible `pending`, อื่น `skipped` + reason) · `audience.tagNames` เก็บชื่อ ณ ตอนนั้น (เปลี่ยนชื่อแท็กทีหลังไม่กระทบ) · เวลาส่งในอดีต/เร็วกว่า 60 วินาที/เกิน 30 วัน → `schedule_invalid` · eligible 0 → `no_recipients` · กลุ่มเกิน 1,000 → `too_many_recipients`
6. confirm ซ้ำ (เรียกสองครั้ง/พร้อมกัน) → ครั้งที่สอง `replayed:true`; ผู้รับไม่ซ้ำ (PK), job ต่อแบตช์ไม่ซ้ำ (dedupKey) · confirm ของ `cancelled` → `POLICY_BLOCKED`
7. jobs: ผู้รับ 45 คน → 3 แบตช์ (20/20/5) runAt ห่าง 5 วินาที · ตั้งเวลา `CLOCK + 1 วัน` → `jobs.run_at` ตรง และ `drainJobs()` ก่อนถึงเวลา → ไม่มีข้อความ (clock fixture)
8. ส่ง (sandbox sender): `drainJobs()` → cust_a1 ได้ข้อความในแชตของตัวเอง (`origin 'broadcast'`, author staff = ผู้ยืนยัน, `triggerAi` false → ไม่มี `ai.reply`), `outcome` = `sent` พร้อม `delivery_mode 'sandbox'` และ `sentSandbox` = 1 (ไม่ถูกรวมเป็น "จริง") · ชื่อแทน `{{customerName}}` ถูกต้อง · ไม่มี `{{customerName}}` หลงเหลือ
9. **consent ซ้ำตอนส่ง**: ยืนยันกับลูกค้า granted แล้วเปลี่ยนเป็น revoked ก่อน `drainJobs()` → ถูก skip `consent_revoked` ไม่มีข้อความ ไม่มี `sendToCustomer` (spy)
10. Meta ผู้รับหมดหน้าต่างระหว่างรอ → skip `outside_window` ตอนส่ง
11. pending ≠ sent: mock sender ที่ไม่ตอบ (`delivery_state` ค้าง `pending`) → `outcome 'sending'` ไม่เป็น `sent` · เมื่อ `messages.delivery_state` เป็น `failed` → `failed` พร้อม error · `unknown` → `unknown` และไม่ถูกส่งซ้ำ · `finalize` หลัง 15 นาที (เลื่อนเวลา) → `sending` ที่ค้างเป็น `unknown`
12. `sendToCustomer` throw `CHANNEL_NOT_CONNECTED` สำหรับผู้รับหนึ่งคน → คนนั้น `failed` คนอื่นยังส่งต่อ ไม่ retry ซ้ำคนที่ failed · สถานะสุดท้าย `partially_failed`
13. crash recovery: แบตช์ที่ตายกลางคัน (ตั้งแถว `sending` ไม่มี `message_id` แล้วรัน handler ซ้ำ) → แถวนั้น `unknown` `interrupted` ไม่ถูกส่งซ้ำ · รัน handler ทั้งแบตช์ซ้ำ → ไม่เกิดข้อความซ้ำ (clientRequestId + outcome)
14. ยกเลิก: ระหว่าง scheduled → ผู้รับ `pending` ทั้งหมด `skipped cancelled`, ไม่มีข้อความ · ยกเลิกระหว่าง sending → แบตช์ถัดไปไม่ส่ง · ยกเลิกซ้ำ → `POLICY_BLOCKED`
15. moderation: ข้อความ `[flag]` → ตั้ง `moderation_flagged` และ confirm → `POLICY_BLOCKED` · mock moderate throw → ผ่าน
16. สถานะสุดท้าย: ทุกคน sent → `completed` · sent+failed → `partially_failed` · ไม่มี sent → `failed` · notify owners เรียก 1 ครั้ง (`dedupKey`)
17. `enqueue` ล้ม (mock) → `enqueue_failed` ไม่มีข้อความ · `retry-enqueue` → scheduled และ enqueue ครบโดยไม่ซ้ำ

Route (supertest):
18. สิทธิ์: staff ค่าเริ่มต้น (ไม่มี `broadcast.*`) → ทุก route 403 · มี `broadcast.read` อย่างเดียว → list/detail ได้, create/confirm/cancel → 403 · tenant: A อ่าน/ยืนยัน broadcast ของ B → 404 · ใส่ `businessId` ของ B ใน body ไม่มีผล (ไม่รับ)
19. ผู้รับ: `GET recipients` คืนเฉพาะ broadcast ของร้านตน · cursor ไม่ซ้ำไม่ข้ามเมื่อ 120 คน

Playwright smoke `web/src/features/broadcast/e2e/broadcast.smoke.spec.ts` (production, ปลอดภัยกับ LINE จริง: **ไม่กดส่งทันที**):
- `preview shows consent split`: `ownerPage` `/broadcast` → ช่องทาง LINE+Messenger, แท็ก VIP, ข้อความ `e2e-<marker> {{customerName}}` → ขั้น 3 เห็น "ทั้งกลุ่ม 2 คน" และ "ส่งได้ 1 คน" และเหตุผล "ปฏิเสธข่าวสาร" (ตรวจ `broadcast-preview-eligible` = 1)
- `confirm schedules without sending, then cancel`: ตั้งเวลา +1 ชั่วโมง → ยืนยัน → รายละเอียดสถานะ "ตั้งเวลาแล้ว", ผู้รับ pending 1 + ข้าม 1 → ยกเลิก → "ยกเลิกแล้ว", ผู้รับ pending → ข้าม "ยกเลิกก่อนส่ง" · ตรวจผ่าน `api` ว่าไม่มีข้อความ marker ในแชตลูกค้าใดของร้าน A (`GET conversations` ค้น marker)
- `tenant isolation`: `api` (owner A) `GET /api/v1/businesses/<id ร้าน B>/broadcasts` → 404
- ทำความสะอาด: draft ที่ค้างถูกลบโดย `resetDemo` เท่านั้น (smoke ยกเลิกทุกอันที่ยืนยัน)
- การส่งจริงไป LINE: ตรวจด้วยมือ (§11) ไม่อยู่ใน smoke เพราะลูกค้า SEED ใช้ LINE user id สังเคราะห์ที่ LINE จริงจะตอบล้ม

## 11. Acceptance: R ตาม D6

- [ ] preview แสดงผู้รับจริงในร้านเรา (ร้าน B ไม่เห็นลูกค้า A) · ก่อนกดยืนยันไม่มี job และไม่มีข้อความ (test 4)
- [ ] `tag_vip_a`: preview ได้ 2 คน; ส่งได้ 1; A Customer Two (revoked) ถูก skip `consent_revoked` ทั้งใน snapshot และตอนส่ง (test 1, 9)
- [ ] ลูกค้าตรงหลายแท็ก = 1 แถว · ยืนยันซ้ำ = broadcast เดิม ไม่ส่งซ้ำ (test 6)
- [ ] สถานะต่อผู้รับ pending → sending → sent/failed/unknown ตามผลจริงของ sender · sandbox แสดงป้าย Sandbox ไม่นับเป็น "ส่งถึงลูกค้า" (test 8, 11)
- [ ] ตั้งเวลาอนาคตแล้วไม่ส่งก่อนเวลา (clock fixture) และยกเลิกได้ (test 7, 14)
- [ ] **หลักฐาน LINE จริง (เงื่อนไข R ของ LINE)**: หลัง F17 ส่งถึงจริงแล้ว ให้ A เพิ่มบัญชี LINE ทีมเป็นเพื่อนกับ OA เดโม (ทักข้อความหนึ่งครั้งให้เกิดลูกค้าจริงบน production), ตั้ง consent `granted` และแท็กทดสอบผ่าน F24, สร้าง broadcast ถึงแท็กนั้นด้วยข้อความ `ทดสอบบรอดแคสต์ Endless` แล้วเห็นข้อความขึ้นใน LINE บนโทรศัพท์ + outcome `sent` โหมด `real` + ภาพหน้าจอ/บันทึกใน EVIDENCE.md · ไม่มีหลักฐาน = S
- [ ] Messenger/Instagram: ต่ำกว่าหน้าต่าง 24 ชม. ถูกข้ามและแสดงเหตุผลตามจริง (ไม่แกล้งส่ง) · ส่งจริงเมื่อ F18 ถึง test user
- [ ] ข้อความไทยผ่าน i18n · loading/empty/error · สิทธิ์ตรวจที่ API · audit · Playwright smoke ผ่านบน production
- ลดเป็น **S** ถ้า sender ยังเป็น sandbox (ทุกช่องทาง) · **A** ถ้าไม่มีขั้นยืนยัน/consent ที่ server · ไม่ผ่าน → ซ่อนเมนูด้วย feature flag ตอน 15:30

## 12. Security และ privacy

- tenant: ทุก SQL กรอง `business_id` · `businessId` มาจาก path ที่ core ตรวจสมาชิกแล้ว · ผู้รับและ tag ids ตรวจกับ `listTags/listCustomersByTags` ของร้านเดียวกัน
- consent: บังคับที่ server (ตอนยืนยัน + ตอนส่งทีละคน) ไม่เชื่อ UI/preview เก่า · `revoked` ชนะเสมอ · `unknown` ไม่ส่ง
- ส่งออกทาง `sendToCustomer` เท่านั้น: ไม่มีโค้ด LINE/Meta ในโฟลเดอร์ F23 · ข้อความมาจากผู้ใช้ร้าน (หรือ template) ไม่ใช่โมเดล · ไม่ render HTML · URL ในปุ่มมาจาก template ที่ F12 ตรวจแล้ว
- ข้อมูลส่วนบุคคล: `display_name` snapshot ในตารางผู้รับ (ใช้แสดงประวัติ) ลบพร้อม broadcast · audit/notify ไม่ใส่ชื่อลูกค้าหรือเนื้อหา · log ห้ามมีข้อความและชื่อ (log เฉพาะ id และตัวเลข)
- ป้องกันส่งซ้ำและท่วม: dedupKey ต่อแบตช์, PK ผู้รับ, `clientRequestId` ต่อผู้รับ, throttle 200 ms, `AUDIENCE_MAX` 1,000, rate limit การสร้าง 20/ชม./ร้าน
- สิทธิ์: อ่าน = `broadcast.read` · สร้าง/ดูตัวอย่าง/ยืนยัน/ยกเลิก = `broadcast.send` · staff ค่าเริ่มต้น "off" ทั้งสองคีย์ · platform admin ไม่มีสิทธิ์โดยปริยาย
- ลูกค้าที่ block OA: ผลจาก sender (`failed`) แสดงตามจริง ไม่ซ่อน

## 13. Edge cases

| กรณี | ผลที่ต้องได้ |
|---|---|
| ลูกค้าเปลี่ยน consent ระหว่าง preview กับยืนยัน | `eligible` เปลี่ยน → `VERSION_CONFLICT` (ดูตัวอย่างใหม่) ไม่ส่งตัวเลขเก่า |
| consent เปลี่ยนหลังยืนยัน ก่อนถึงคิว | ถูกข้ามตอนส่ง |
| ลูกค้ามีแชตที่ AI กำลังตอบ/พนักงานถืออยู่ | broadcast เขียนข้อความขาออกลงแชตนั้นโดยไม่เปลี่ยน handler/ไม่ takeover · ไม่เรียก AI (`triggerAi:false`) |
| ลูกค้าไม่มีแชตเปิดอยู่ | `saveMessage` เปิด conversation ใหม่ (handler ai) |
| process ตายกลางแบตช์ | แถว `sending` ไม่มี message_id → `unknown` ไม่ส่งซ้ำ; ที่เหลือส่งต่อเมื่อ job รอบใหม่ |
| sender คืน `unknown` | แสดง "ไม่ทราบผล" ไม่ retry (SPEC §7) |
| เจ้าของกดยืนยันสองแท็บพร้อมกัน | advisory lock + สถานะ: แท็บหลัง `replayed:true` |
| ลบ/แก้ template หลังยืนยัน | ส่งตาม `parts_snapshot` เดิม |
| ชื่อลูกค้ายาวหรือมีอักขระควบคุม | ตัดที่ 80 ล้างอักขระควบคุม; ว่าง → "ลูกค้า" |
| แท็กถูกลบหลังสร้าง draft | confirm: `listCustomersByTags` คืนว่าง → `no_recipients` |
| `getCustomer` ล่มชั่วคราวระหว่างแบตช์ | throw → retry ของ job (แถวที่ยัง `pending` ถูกลองใหม่; ที่ `sending` แล้วไม่ถูกส่งซ้ำ) |
| ตั้งเวลาแล้วเซิร์ฟเวอร์ restart | job อยู่ใน DB (durable) รันเมื่อถึงเวลา |
| LINE monthly limit ของ OA เต็ม | sender ตอบล้ม → `failed` พร้อมเหตุผล; F23 ไม่รู้ล่วงหน้า (UNCONFIRMED §15) |
| ผู้รับ 1,000 คน | 50 แบตช์ ~ 7–8 นาที; หน้าประวัติแสดงความคืบหน้า |

### ถ้าช้า (ตัดตามลำดับนี้)
1. ตัดตัวเลือกเทมเพลต (ส่งได้เฉพาะข้อความ) · 2. ตัดการตั้งเวลา (ส่งทันทีเท่านั้น) · 3. ตัดแท็บประวัติให้เหลือรายการ + รายละเอียดแบบตัวเลข (ไม่มีตารางผู้รับ) · 4. ลดเหลือช่องทาง LINE ช่องทางเดียว
**ห้ามตัด**: preview → ยืนยัน (`expectedEligible`), consent ซ้ำตอนส่ง, ส่งผ่าน `sendToCustomer`, outcome ตามผลจริง, dedup ต่อผู้รับ

## 14. Build order (slices)

| slice | เวลา | เนื้อหา | merge เมื่อ |
|---|---|---|---|
| **S1 · ผู้รับ + draft + preview** | ≤ 30 นาที | migration · `buildAudience`/`classify` · routes tags/create/get/preview/list · หน้า `/broadcast` ขั้น 1–3 (ยังไม่มีปุ่มยืนยัน) · test 1–4, 18 | หลัง `LEAD: OPEN P2` · โพสต์ `NEED TO:A3` ขอ `listTags` ตอนเริ่ม |
| **S2 · ยืนยัน + ส่ง** | ≤ 35 นาที | `confirm` (snapshot, jobs) · `broadcast.send-batch` · `finalize` + `syncOutcomes` · หน้ารายละเอียด + แท็บประวัติ · test 5–13, 16–17 | ก่อน ~16:00 |
| **S3 · ตั้งเวลา ยกเลิก moderation** | ≤ 20 นาที | schedule ใน confirm · `cancel` · moderation · `retry-enqueue` · notify เมื่อเสร็จ · test 14–15 | |
| **S4 · เดโม + smoke + หลักฐาน LINE** | ≤ 25 นาที | `runDemo`/`resetDemo` · Playwright smoke + รันกับ production · ทดสอบ LINE จริงตาม §11 + EVIDENCE.md | ก่อน FREEZE 15:30 หรือ freeze 16:45 ตามที่ tier เปิด |

## 15. UNCONFIRMED และสิ่งที่ต้องตรวจในวันงาน

1. (ปิดแล้ว 21 พ.ย.) `listTags(businessId): Promise<TagSummary[]>` อยู่ใน contracts.ts ส่วน crm แล้ว (เจ้าของ A3) พร้อม fake: import จาก `../crm/service` ได้ตั้งแต่ setup ไม่ต้องทำ fake ในโฟลเดอร์ F23
2. **ลูกค้า SEED ใช้ LINE user id สังเคราะห์**: push จริงไป `Udemo-a-customer-one` จะล้มจาก LINE · ตรวจ: การทดสอบ R ใช้ลูกค้าจริงที่เกิดจากการทักเข้ามา (§11); SEED ใช้ทดสอบ preview/consent และ sandbox เท่านั้น
3. **rate/monthly limit ของ LINE push** และพฤติกรรมเมื่อเกิน: ไม่ทราบค่าแน่ชัด · ตรวจ: ดูผลของ sender F17 ตอนส่งจริง; F23 รายงาน `failed` ตามที่ได้รับ ไม่ cap เพิ่ม
4. **การแทน token `{{customerName}}` หลัง render ของ F12**: อาศัยว่า `renderTemplate` ไม่แก้/ไม่ escape ค่า `'{{customerName}}'` ที่ส่งเป็นตัวแปร (ค่าเป็นข้อความธรรมดา ไม่แทนซ้ำ) · ตรวจ: test 8 กับ template จริงของ F12; ถ้า F12 ตัดอักขระ `{}` ให้เปลี่ยน token เป็น `__CUSTOMER_NAME__`
5. **`jobs` retry/lease กับ handler ยาว** (20 คน × 200 ms + เวลา sender ≈ 4–10 วินาที ต่อแบตช์ เทียบ lease 60 วินาที) · ตรวจ: ทดสอบแบตช์ 20 คนกับ sender จริงหนึ่งครั้ง; ถ้าเกิน 40 วินาทีให้ลด `BATCH_SIZE` เหลือ 10
6. **รูป `schedules`/`runAt` ของ core ต่อ clock fixture**: `drainJobs()` เคารพ `run_at` หรือไม่ · ตรวจ: ดู `test-utils` ของ core ตอน S2; ไม่เคารพ → test 7 ปรับ `run_at` ด้วย SQL
7. **author ของข้อความ broadcast**: ใช้ `staff` + ผู้ยืนยัน (F09 แสดงชื่อพนักงาน + ป้าย "บรอดแคสต์") · ตรวจกับ A (ผู้ใช้) ว่าต้องการชื่อผู้ยืนยันหรือ "ระบบ" หรือไม่ (เปลี่ยนเป็น `author:'system'` ได้โดยไม่กระทบ contract; แต่ `system` จะถูกซ่อนจาก Demo Chat poll ตาม F09 §5.8)
