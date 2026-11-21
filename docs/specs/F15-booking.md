# F15 booking — ช่วงเวลาว่าง ความจุ การจองที่ลูกค้ายืนยัน เลื่อน ยกเลิก และการเตือน

| | |
|---|---|
| Lane / คน | **A3** / **A** · ลำดับ 2 ใน lane (F24 → F15 → F16) |
| Tier / เป้า | **P2** · เป้า **R** (ไม่มี provider ภายนอก · เตือนผ่านช่อง LINE/Meta จริงตามสถานะของ C2 มิฉะนั้น S) |
| Timebox | 60–150 นาที |
| เริ่มเมื่อ | หัวหน้าโพสต์ `LEAD: OPEN P2` (และ F24 S1 merge แล้วจะสะดวกกว่า แต่ไม่บังคับ) · slice แรก (§14 S1) คือสิ่งที่ B2 รอ |
| พึ่ง | F08 `getProduct` (service = catalog item ชนิด `service` มี `durationMinutes`) · F04 `getBusinessSettings` `getBusinessOpenState` `getEffectiveAnswerRules` · F09 `getConversation` `getHistory` · F31 `notify` · core (`db`, `jobs`/schedules, `sendToCustomer`, `audit`, `publish`) · F24 `getCustomer` (ชื่อลูกค้า, ไม่บังคับ) |
| ให้ | contracts `findSlots`, `createBooking` (**DONE ทันทีที่สองตัวนี้ผ่าน test → TO:B2**) · exports ภายใน lane (F16, F24) ดู §4 |
| ใช้ | ดู §4 |
| โฟลเดอร์ | `server/src/features/booking/` · `shared/features/booking/types.ts` · `web/src/features/booking/` |
| Web path | `/appointments` (เมนูกลุ่ม `commerce`) · slot `chatComposerActions` ของ `/chat` (ปุ่ม "นัดหมาย" สำหรับพนักงาน) |

อ่าน: `contracts.ts` (ส่วน F15 `SlotOption` `AppointmentSummary` `CreateBookingInput/Result`, `BookingReviewPart`, `ConfirmRequest`, `ProposalSummary`, `WeeklyHours`, `ProductRef`, `CatalogItem`, `ErrorCode` `SLOT_FULL`, SEED resources/slots) · F13 spec §5 (แบบ propose/confirm/receipt ที่ F15 ทำตามให้เหมือนกัน) · F10 spec §5 tools `find_slots` `propose_booking` (ผู้เรียก) · F04 spec §5.8 (`getBusinessOpenState`) · F31 spec §5.3 (`booking.created` `booking.cancelled`) · [COOKBOOK](../COOKBOOK.md) §6, §8

## 1. เป้าหมายและ user stories

ทำไมมี: ร้านบริการ (สอนเล่นเกม ซ่อม ตัดผม) ต้องให้ AI เสนอเวลาว่างที่ **ถูกจริง** และจองให้ได้เมื่อ **ลูกค้ากดยืนยันเอง** ระบบต้องไม่จองเกินความจุแม้สองคนกดพร้อมกัน ไม่จองนอกเวลาเปิด/วันหยุด และเตือนลูกค้าก่อนถึงนัดโดยไม่เตือนนัดที่ถูกเลื่อน/ยกเลิก นัดในฐานข้อมูลเราคือความจริง (F16 ซิงก์ Google Calendar แยกต่างหาก ล้มได้โดยไม่กระทบนัด)

ผู้ใช้: ลูกค้า (ผ่านแชต: ถาม → เห็นการ์ดสรุปการจอง → กดยืนยัน) · AI (เรียก `findSlots` / `createBooking` stage `propose` ผ่าน F10 tools) · พนักงาน/เจ้าของ (ดูตารางนัด สร้าง เลื่อน ยกเลิก ตั้งค่า) · F16 (ซิงก์ปฏิทิน)

User stories:
1. ลูกค้าถาม "พรุ่งนี้มีคิวสอนเล่นเกมไหม" → AI เรียก `findSlots` ได้ช่วงเวลาที่ว่างจริง (ตามเวลาเปิดร้าน วันหยุด ความจุ) → เสนอไม่เกิน 6 ช่วง
2. ลูกค้าเลือกเวลา → AI เรียก `createBooking` propose → ลูกค้าเห็นการ์ดสรุป (บริการ ผู้ให้บริการ เวลา "22 พ.ย. 2569 10:00 Asia/Bangkok") → กด **ยืนยัน** → ได้ข้อความ "จองเรียบร้อยแล้วค่ะ …" จากระบบ (F15 ส่งเอง) · ไม่กด = ไม่มีนัดเกิดขึ้น
3. สองคนกดยืนยันช่วง 22 พ.ย. 10:00–10:30 (ความจุ 1) พร้อมกัน → ได้นัดคนเดียว อีกคนได้ข้อความ "เวลานี้เพิ่งเต็ม" พร้อมช่วงใกล้เคียง
4. พนักงานเห็นนัดทั้งวัน/สัปดาห์ สร้างนัดให้ลูกค้าที่โทรมา เลื่อน ยกเลิก ทำเครื่องหมาย "เสร็จสิ้น/ไม่มา" โดยลูกค้าได้ข้อความแจ้งเมื่อมีการเลื่อน/ยกเลิก
5. ร้านตั้งค่า: ผู้ให้บริการ (resource) + ความจุ, ช่วงห่างระหว่างนัด (buffer), จองล่วงหน้าขั้นต่ำ/สูงสุด, เวลาตัดสิทธิ์ยกเลิก/เลื่อน, เปิดเตือน 24 ชม./2 ชม., ปิดช่วงเวลาเฉพาะผู้ให้บริการ (block)
6. ลูกค้าได้ข้อความเตือนก่อนนัด 24 ชม. และ 2 ชม. (เมื่อร้านเปิดไว้) · นัดที่ถูกเลื่อนไม่ถูกเตือนเวลาเก่า · นัดที่ยกเลิกไม่ถูกเตือน
7. (ถ้าทัน) ลูกค้าที่ช่วงเวลาเต็มเข้าคิวรอ และได้ข้อเสนอเมื่อมีคิวว่าง

นอกขอบเขต: จองหลายคนต่อนัด (party size คงที่ 1) · จองซ้ำรายสัปดาห์ · ชำระมัดจำ (F14) · เสียงจอง (F30 ใช้ tools เดียวกับ F10 อยู่แล้ว) · คำนวณวันที่จากข้อความอิสระ ("วันพุธหน้า") = หน้าที่ของ F10 (แปลงเป็น `from_date`/`to_date` ก่อนเรียกเรา) · ซิงก์ปฏิทิน (F16) · ลูกค้าเลื่อน/ยกเลิกเองผ่านปุ่มแชตโดยตรง: ระบบมี service รองรับครบ (§5.9) แต่ **ยังไม่มี AI tool** (F10 spec ไม่มี `reschedule_booking`/`cancel_booking`) ลูกค้าที่ขอเลื่อน/ยกเลิกจึงถูกส่งต่อพนักงานด้วย `handoff_to_staff` (ดู §15 ข้อ 3)

## 2. Data model

`server/src/features/booking/migrations/001_booking.sql`:

```sql
-- dependsOn: core
CREATE TABLE booking_settings (
  business_id uuid PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,                       -- ปิด = findSlots ว่าง และ propose = POLICY_BLOCKED booking_disabled (ไม่เกี่ยวกับ answerPolicy ของ F04)
  granularity_min int NOT NULL DEFAULT 30 CHECK (granularity_min IN (5,10,15,20,30,60)),
  buffer_min int NOT NULL DEFAULT 0 CHECK (buffer_min BETWEEN 0 AND 120),
  lead_time_min int NOT NULL DEFAULT 60 CHECK (lead_time_min BETWEEN 0 AND 10080),
  horizon_days int NOT NULL DEFAULT 60 CHECK (horizon_days BETWEEN 1 AND 365),
  cancel_cutoff_hours int NOT NULL DEFAULT 2 CHECK (cancel_cutoff_hours BETWEEN 0 AND 168),
  reschedule_cutoff_hours int NOT NULL DEFAULT 2 CHECK (reschedule_cutoff_hours BETWEEN 0 AND 168),
  confirm_ttl_min int NOT NULL DEFAULT 15 CHECK (confirm_ttl_min BETWEEN 5 AND 120),
  reminders_enabled boolean NOT NULL DEFAULT false,            -- opt-in
  reminder_minutes int[] NOT NULL DEFAULT ARRAY[1440,120],     -- ก่อนเริ่มกี่นาที (สูงสุด 3 ค่า)
  waitlist_enabled boolean NOT NULL DEFAULT false,
  version int NOT NULL DEFAULT 1,
  updated_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (cardinality(reminder_minutes) <= 3)
);

CREATE TABLE booking_resources (                               -- ผู้ให้บริการ/โต๊ะ/ห้อง
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  capacity int NOT NULL DEFAULT 1 CHECK (capacity BETWEEN 1 AND 50),   -- จำนวนนัดที่ทับช่วงเวลาเดียวกันได้พร้อมกัน
  active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX booking_resources_name ON booking_resources (business_id, lower(name)) WHERE active;

-- service (catalog item id ไม่มี FK ข้ามฟีเจอร์) ให้บริการโดย resource ไหนบ้าง · ไม่มีแถวของ service = ทุก resource ที่ active
CREATE TABLE booking_service_resources (
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  service_item_id uuid NOT NULL,
  resource_id uuid NOT NULL REFERENCES booking_resources(id) ON DELETE CASCADE,
  PRIMARY KEY (service_item_id, resource_id)
);
CREATE INDEX booking_service_resources_biz ON booking_service_resources (business_id, service_item_id);

CREATE TABLE booking_blocks (                                  -- ปิดช่วงเวลาเฉพาะ resource (พักกลางวัน, ลา) ไม่ใช่วันหยุดร้าน (วันหยุดร้านอยู่ที่ F04)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  resource_id uuid NOT NULL REFERENCES booking_resources(id) ON DELETE CASCADE,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  reason text NOT NULL DEFAULT '' CHECK (char_length(reason) <= 200),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_at > start_at AND end_at - start_at <= interval '31 days')
);
CREATE INDEX booking_blocks_range ON booking_blocks (resource_id, start_at, end_at);

CREATE TABLE booking_proposals (                               -- ใบสรุปที่ลูกค้าต้องกดยืนยัน (ไม่ใช่นัด)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('appointment.create','appointment.reschedule','appointment.cancel')),
  appointment_id uuid,                                         -- เฉพาะ reschedule/cancel (FK เพิ่มด้านล่างหลังสร้าง appointments)
  service_item_id uuid NOT NULL,
  service_name text NOT NULL,                                  -- snapshot ชื่อตอนเสนอ
  resource_id uuid NOT NULL REFERENCES booking_resources(id),
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  customer_name text NOT NULL DEFAULT '',
  client_request_id text NOT NULL,                             -- ของ propose
  request_hash text NOT NULL,                                  -- sha256 ของ payload ที่ทำให้เกิดใบนี้ (ตรวจ IDEMPOTENCY_CONFLICT)
  version int NOT NULL DEFAULT 1,
  review_token text NOT NULL,                                  -- สุ่ม 24 ไบต์ base64url · ไม่ใช่ความลับของระบบ (อยู่ในการ์ด)
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','confirmed','cancelled','expired','superseded')),
  expires_at timestamptz NOT NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, client_request_id)
);
CREATE INDEX booking_proposals_conv ON booking_proposals (conversation_id, created_at DESC);

CREATE TABLE appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,   -- null = พนักงานสร้างเองโดยไม่ผูกแชต
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  customer_name text NOT NULL CHECK (char_length(btrim(customer_name)) BETWEEN 1 AND 80),
  customer_phone text NOT NULL DEFAULT '' CHECK (char_length(customer_phone) <= 32),
  service_item_id uuid NOT NULL,
  service_name text NOT NULL,                                  -- snapshot ตอนจอง (ป้องกันชื่อบริการเปลี่ยนทีหลัง)
  service_sku text NOT NULL DEFAULT '',
  resource_id uuid NOT NULL REFERENCES booking_resources(id),
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  buffer_min int NOT NULL DEFAULT 0,                           -- buffer ที่ใช้ตอนจอง (นัดเก่าไม่เปลี่ยนเมื่อร้านแก้ค่า)
  occupied_until timestamptz NOT NULL,                         -- end_at + buffer: ช่วงที่ resource ถูกใช้
  status text NOT NULL DEFAULT 'booked' CHECK (status IN ('booked','cancelled','completed','no_show')),
  version int NOT NULL DEFAULT 1,
  reminder_generation int NOT NULL DEFAULT 1,                  -- +1 ทุกครั้งที่เวลา/สถานะเปลี่ยน: reminder รุ่นเก่าไม่ส่ง (§5.11)
  source text NOT NULL CHECK (source IN ('customer_confirm','staff','demo')),
  proposal_id uuid UNIQUE REFERENCES booking_proposals(id),    -- 1 ใบสรุป ได้นัดไม่เกิน 1 (ด่านสุดท้ายถ้า lock พลาด)
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 500),
  overridden boolean NOT NULL DEFAULT false,                   -- พนักงานเขียนทับกฎ (นอกเวลา/เต็ม/ใกล้เกิน)
  confirmation_state text NOT NULL DEFAULT 'not_required' CHECK (confirmation_state IN ('not_required','pending','sent','failed')),
  external_sync_state text NOT NULL DEFAULT 'not_configured' CHECK (external_sync_state IN ('not_configured','pending','synced','failed')),
  external_sync_detail jsonb NOT NULL DEFAULT '{}',            -- เขียนโดย F16 ผ่าน setExternalSyncState: { eventId?, reason?, version?, at? }
  cancel_reason text NOT NULL DEFAULT '' CHECK (char_length(cancel_reason) <= 300),
  cancelled_by text CHECK (cancelled_by IS NULL OR cancelled_by IN ('customer','staff','system')),
  cancelled_at timestamptz,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_at > start_at AND occupied_until >= end_at)
);
CREATE INDEX appointments_day ON appointments (business_id, start_at);
CREATE INDEX appointments_resource_live ON appointments (resource_id, start_at, occupied_until) WHERE status = 'booked';
CREATE INDEX appointments_customer ON appointments (business_id, customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX appointments_confirm_pending ON appointments (created_at) WHERE confirmation_state = 'pending';
ALTER TABLE booking_proposals ADD CONSTRAINT booking_proposals_appointment_fk FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL;

CREATE TABLE appointment_events (                              -- append-only ทุกการเปลี่ยน
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  appointment_id uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('created','rescheduled','cancelled','completed','no_show','reopened','note','reminder_sent','reminder_skipped','confirmation_sent','sync')),
  actor_kind text NOT NULL CHECK (actor_kind IN ('customer','staff','system')),
  actor_user_id uuid REFERENCES users(id),
  detail jsonb NOT NULL DEFAULT '{}',                          -- เช่น { from: {startAt,resourceId}, to: {...}, reason } ห้ามใส่เบอร์โทร
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX appointment_events_appt ON appointment_events (appointment_id, created_at);

CREATE TABLE booking_receipts (                                -- ใบเสร็จของการ confirm (idempotency)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  client_request_id text NOT NULL,
  request_hash text NOT NULL,
  proposal_id uuid NOT NULL REFERENCES booking_proposals(id) ON DELETE CASCADE,
  decision text NOT NULL CHECK (decision IN ('confirm','cancel')),
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, client_request_id)
);

CREATE TABLE appointment_reminders (
  appointment_id uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  generation int NOT NULL,
  minutes_before int NOT NULL,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  run_at timestamptz NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','sending','sent','skipped','failed')),
  skip_reason text,                                            -- superseded | cancelled | window_closed | past | disabled | no_conversation | conversation_closed
  job_id uuid,
  sent_at timestamptz,
  message_id uuid,
  error text,
  PRIMARY KEY (appointment_id, generation, minutes_before)
);
CREATE INDEX appointment_reminders_due ON appointment_reminders (run_at) WHERE state = 'pending';

-- ==== booking_waitlist: อยู่ใน 002_waitlist.sql (slice S4) เท่านั้น ห้ามใส่ใน 001 · แสดงที่นี่เพื่ออ่านรวมเป็นที่เดียว ====
CREATE TABLE booking_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  service_item_id uuid NOT NULL,
  resource_id uuid REFERENCES booking_resources(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  want_start_at timestamptz NOT NULL,
  want_end_at timestamptz NOT NULL,
  state text NOT NULL DEFAULT 'waiting' CHECK (state IN ('waiting','offered','booked','expired','cancelled')),
  offered_at timestamptz,
  offer_proposal_id uuid REFERENCES booking_proposals(id) ON DELETE SET NULL,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX booking_waitlist_open ON booking_waitlist (business_id, state, want_start_at) WHERE state IN ('waiting','offered');
```

**หมายเหตุสำคัญ:** (1) ตาราง `booking_waitlist` **ไม่อยู่ใน `001`**: ใส่ใน `002_waitlist.sql` (`-- dependsOn: core`) ใน slice S4 เท่านั้น เพื่อให้ S1–S3 merge ได้โดยไม่ต้องมี waitlist · (2) ห้ามแก้ตาราง core/catalog · (3) ทุก query กรอง `business_id` · (4) ค่าคงที่ใน `config.ts`: `SLOT_MAX_RANGE_DAYS = 31` (ช่วง `from..to` ของ findSlots) · `SLOT_DEFAULT_LIMIT = 6` · `SLOT_MAX_LIMIT = 50` · `RESOURCE_LIMIT = 20` · `REMINDER_MAX_AGE_MIN = 30` (เตือนช้ากว่า run_at เกินนี้ = ข้าม) · `CONFIRM_REPAIR_AFTER_SEC = 60` · `META_WINDOW_MARGIN_MIN = 30`

## 3. API endpoints

ทุก path ใต้ `/api/v1/businesses/:businessId/booking` · auth `business` · `defineFeatureRoutes({ featureId: 'F15', slug: 'booking' })`

| Method | Path | permission | Request | Response | Errors |
|---|---|---|---|---|---|
| GET | `/appointments` | `appointments.read` | `ListAppointmentsQuery` | `{ items: AppointmentRow[]; nextCursor: string \| null }` | VALIDATION_ERROR |
| GET | `/appointments/:id` | `appointments.read` | — | `AppointmentDetail` (รวม events) | NOT_FOUND |
| POST | `/appointments` | `appointments.write` (+ `override` ต้อง `appointments.settings`) | `StaffCreateBody` | `AppointmentDetail` (201) | VALIDATION_ERROR, NOT_FOUND, SLOT_FULL, POLICY_BLOCKED (`outside_hours` `closed_day` `closure` `too_soon` `too_far` `blocked` ถ้าไม่ override) |
| POST | `/appointments/:id/reschedule` | `appointments.write` | `RescheduleBody` | `AppointmentDetail` | NOT_FOUND, VERSION_CONFLICT, SLOT_FULL, POLICY_BLOCKED |
| POST | `/appointments/:id/cancel` | `appointments.write` | `CancelBody` | `AppointmentDetail` | NOT_FOUND, VERSION_CONFLICT, POLICY_BLOCKED (`not_booked`) |
| POST | `/appointments/:id/status` | `appointments.write` | `StatusBody` (`completed` \| `no_show` \| `booked`) | `AppointmentDetail` | NOT_FOUND, VERSION_CONFLICT, POLICY_BLOCKED (`not_started_yet` `invalid_transition`) |
| GET | `/slots` | `appointments.read` | `SlotsQuery` | `{ items: SlotOption[] }` (ใช้ใน dialog สร้าง/เลื่อน) | VALIDATION_ERROR, NOT_FOUND |
| GET | `/services` | `appointments.read` | — | `{ items: BookableService[] }` | — |
| GET | `/settings` | `appointments.read` | — | `BookingSettingsView` | — |
| PUT | `/settings` | `appointments.settings` | `UpdateSettingsBody` | `BookingSettingsView` | VALIDATION_ERROR, VERSION_CONFLICT |
| GET | `/resources` | `appointments.read` | — | `{ items: ResourceView[] }` | — |
| POST | `/resources` | `appointments.settings` | `ResourceBody` | `ResourceView` (201) | VALIDATION_ERROR, POLICY_BLOCKED (`resource_limit`, `name_exists`) |
| PATCH | `/resources/:resourceId` | `appointments.settings` | `ResourceBody` + `expectedVersion` | `ResourceView` | NOT_FOUND, VERSION_CONFLICT, POLICY_BLOCKED (`has_future_appointments` เมื่อปิดใช้งาน) |
| PUT | `/services/:serviceItemId/resources` | `appointments.settings` | `{ resourceIds: string[] }` (ว่าง = ทุก resource) | `BookableService` | NOT_FOUND, VALIDATION_ERROR |
| GET/POST/DELETE | `/blocks` · `/blocks/:blockId` | `appointments.read` / `appointments.settings` | `BlockBody` | `BlockView` | VALIDATION_ERROR, POLICY_BLOCKED (`overlaps_appointments` + `details.count` เว้นแต่ `force: true`) |
| GET | `/waitlist` (S4) | `appointments.read` | — | `{ items: WaitlistRow[] }` | — |
| POST | `/waitlist` (S4) | `appointments.write` | `WaitlistBody` | `WaitlistRow` (201) | VALIDATION_ERROR, NOT_FOUND |
| DELETE | `/waitlist/:id` (S4) | `appointments.write` | — | no_content | NOT_FOUND |

```ts
import { z } from 'zod';
const Iso = z.string().datetime({ offset: true });                  // รับ offset แล้ว normalize เป็น UTC ในโค้ด
const Uuid = z.string().uuid();
export const ListAppointmentsQuery = z.object({
  from: Iso.optional(), to: Iso.optional(),                         // ช่วง start_at (ค่าเริ่ม: วันนี้ตามเวลาร้าน ถึง +7 วัน; ช่วงกว้างสุด 62 วัน)
  status: z.enum(['booked', 'cancelled', 'completed', 'no_show']).optional(),
  resourceId: Uuid.optional(), q: z.string().trim().max(100).optional(),   // ชื่อลูกค้า/เบอร์
  cursor: z.string().max(300).optional(), limit: z.coerce.number().int().min(1).max(100).default(50),
});
export const SlotsQuery = z.object({
  serviceItemId: Uuid, from: Iso, to: Iso, resourceId: Uuid.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
  excludeAppointmentId: Uuid.optional(),                            // ตอนเลื่อน: ไม่นับนัดตัวเองเป็นที่ถูกใช้
});
export const StaffCreateBody = z.object({
  serviceItemId: Uuid, resourceId: Uuid, startAt: Iso,
  customerName: z.string().trim().min(1).max(80),
  customerPhone: z.string().trim().max(32).default(''),
  customerId: Uuid.optional(), conversationId: Uuid.optional(),     // ผูกแชต → ส่งข้อความยืนยันถึงลูกค้า
  note: z.string().trim().max(500).default(''),
  notifyCustomer: z.boolean().default(true),
  override: z.boolean().default(false),                             // เขียนทับกฎ (นอกเวลา/เต็ม/ใกล้เกิน) ต้องมี overrideReason
  overrideReason: z.string().trim().max(200).optional(),
  clientRequestId: z.string().trim().min(8).max(80),                // กันกดซ้ำ
}).strict();
export const RescheduleBody = z.object({
  expectedVersion: z.number().int().min(1), startAt: Iso, resourceId: Uuid.optional(),
  notifyCustomer: z.boolean().default(true), override: z.boolean().default(false), overrideReason: z.string().trim().max(200).optional(),
}).strict();
export const CancelBody = z.object({
  expectedVersion: z.number().int().min(1), reason: z.string().trim().max(300).default(''), notifyCustomer: z.boolean().default(true),
}).strict();
export const StatusBody = z.object({ expectedVersion: z.number().int().min(1), status: z.enum(['completed', 'no_show', 'booked']) }).strict();
export const UpdateSettingsBody = z.object({
  expectedVersion: z.number().int().min(1),
  enabled: z.boolean(), granularityMin: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(20), z.literal(30), z.literal(60)]),
  bufferMin: z.number().int().min(0).max(120), leadTimeMin: z.number().int().min(0).max(10080), horizonDays: z.number().int().min(1).max(365),
  cancelCutoffHours: z.number().int().min(0).max(168), rescheduleCutoffHours: z.number().int().min(0).max(168),
  confirmTtlMin: z.number().int().min(5).max(120),
  remindersEnabled: z.boolean(), reminderMinutes: z.array(z.number().int().min(15).max(10080)).max(3), waitlistEnabled: z.boolean(),
}).strict();
export const ResourceBody = z.object({ name: z.string().trim().min(1).max(60), capacity: z.number().int().min(1).max(50), active: z.boolean().default(true), sortOrder: z.number().int().min(0).max(1000).default(0), expectedVersion: z.number().int().min(1).optional() }).strict();
export const BlockBody = z.object({ resourceId: Uuid, startAt: Iso, endAt: Iso, reason: z.string().trim().max(200).default(''), force: z.boolean().default(false) }).strict();
export const WaitlistBody = z.object({ serviceItemId: Uuid, resourceId: Uuid.optional(), conversationId: Uuid.optional(), customerName: z.string().trim().min(1).max(80), wantStartAt: Iso, wantEndAt: Iso }).strict();
```

ชนิดที่ส่งออก (`shared/features/booking/types.ts`): `SlotOption`, `AppointmentSummary`, `CreateBookingInput`, `CreateBookingResult` **ตาม contracts.ts ทุกตัวอักษร** (copy-paste ห้ามแก้) + ชนิดของ UI:

```ts
export interface AppointmentRow extends AppointmentSummary {
  serviceName: string; resourceName: string; customerName: string; customerPhone: string | null;
  source: 'customer_confirm' | 'staff' | 'demo'; overridden: boolean; localDisplay: string; note: string;
  confirmationState: 'not_required' | 'pending' | 'sent' | 'failed'; syncDetail: { reason?: string; eventId?: string } | null;
}
export interface AppointmentDetail extends AppointmentRow { events: { type: string; actorKind: string; actorName: string | null; detail: Record<string, unknown>; createdAt: string }[]; reminders: { minutesBefore: number; runAt: string; state: string; skipReason: string | null }[]; cancelReason: string; cancelledBy: string | null }
export interface BookableService { itemId: string; sku: string; name: string; durationMinutes: number | null; priceMinor: number; resourceIds: string[] /* ว่าง = ทุก resource */; bookable: boolean /* durationMinutes != null && active */ }
export interface ResourceView { id: string; name: string; capacity: number; active: boolean; sortOrder: number; version: number; futureAppointments: number }
export interface BlockView { id: string; resourceId: string; resourceName: string; startAt: string; endAt: string; reason: string }
export interface BookingSettingsView { enabled: boolean; granularityMin: number; bufferMin: number; leadTimeMin: number; horizonDays: number; cancelCutoffHours: number; rescheduleCutoffHours: number; confirmTtlMin: number; remindersEnabled: boolean; reminderMinutes: number[]; waitlistEnabled: boolean; version: number; timezone: string; calendar: { configured: boolean } }
```

cursor ของ `/appointments` = base64url(JSON `{ startAt, id }`) เรียง `start_at, id`

## 4. Service functions และ contracts

ไฟล์ภายใน: `service.ts` (public) · `config.ts` · `schemas.ts` · `time.ts` (timezone) · `slots.ts` (findSlots engine + `peak`) · `proposals.ts` · `confirm.ts` · `mutations.ts` (create/reschedule/cancel/status) · `messages.ts` (ข้อความถึงลูกค้า) · `reminders.ts` · `waitlist.ts` · `bridge.ts` (จุดเชื่อม F16) · `repo.ts` · `jobs.ts` · `routes.ts` · `seed.ts` · `*.test.ts`

**Contract ต้องตรง `contracts.ts` ทุกตัวอักษร:**

```ts
export declare function findSlots(
  businessId: string,
  query: { serviceRef: ProductRef; from: string; to: string; resourceId?: string; limit?: number; language?: CustomerLanguage },
): Promise<SlotOption[]>;
export declare function createBooking(input: CreateBookingInput): Promise<CreateBookingResult>;
```

พฤติกรรม `findSlots` (อัลกอริทึมเต็ม §5.3): บริการไม่พบ/ไม่ active/ธุรกิจอื่น → `NOT_FOUND` · `kind ≠ 'service'` → `VALIDATION_ERROR` (`details.reason='not_a_service'`) · `durationMinutes` เป็น null → `POLICY_BLOCKED` (`no_duration`) · `from >= to` หรือช่วงเกิน 31 วัน หรือ ISO ผิด → `VALIDATION_ERROR` · `booking_settings.enabled=false` → `[]` · `limit` ค่าเริ่ม 6 สูงสุด 50 (เกิน → 50; `< 1`/ไม่ใช่จำนวนเต็ม → `VALIDATION_ERROR`) · ผลเรียง `startAt` แล้ว `resourceName` · ไม่มี slot = `[]` (ไม่ใช่ error) · `resourceId` ที่ไม่ใช่ของร้าน/ไม่ active/ไม่ให้บริการ service นี้ → `NOT_FOUND`

พฤติกรรม `createBooking`:
- **propose**: ไม่เขียน `appointments`; เขียนเฉพาะ `booking_proposals` · ผลคือ `{ stage:'propose', state:'awaiting_confirmation', proposal, review }` ตาม §5.4 · `serviceRef` ไม่พบ/ไม่ใช่ service → `NOT_FOUND`/`VALIDATION_ERROR` · เวลาไม่ตรง slot ว่าง → `SLOT_FULL` (`details.reason`) · `rules.booking=false` → `POLICY_BLOCKED` (`booking_disabled`) · แชตของร้านอื่น → `NOT_FOUND`
- **confirm**: ตาม §5.5 · idempotent ด้วย `clientRequestId` (ซ้ำ + payload เดิม → `replayed:true` ไม่เขียนซ้ำ ไม่ส่งข้อความซ้ำ; ซ้ำ + payload ต่าง → `IDEMPOTENCY_CONFLICT`) · slot เต็มตอนยืนยัน → `SLOT_FULL` (คนแข่งที่แพ้) · หมดอายุ → `PROPOSAL_EXPIRED` · version ไม่ตรง/ถูกแทนที่ → `VERSION_CONFLICT` · `decision:'cancel'` → ปิดใบสรุป `appointment: null`
- `externalSync` ของนัดใหม่เริ่มที่ `'pending'` ถ้า F16 บอกว่าร้านนี้เชื่อมปฏิทินแล้ว (ผ่าน bridge §4.2) มิฉะนั้น `'not_configured'`
- **ใครส่งข้อความยืนยันถึงลูกค้า: F15 เอง** ผ่าน `sendToCustomer` (job `booking.notify`, §5.5 ข้อ 12) ไม่ใช่ F09/C2/F10: ผู้เรียก confirm (F09 action route, C2 postback) แค่คืนผลให้ UI/ไม่ตอบซ้ำ

### 4.1 Contract additions

ไม่มี contract ใหม่ที่ต้อง merge ลง `contracts.ts` (ใช้ที่มีอยู่) · exports **ภายใน lane A3** (นอก contract, ใช้ได้โดย F16 และ F24 เท่านั้น; ถ้า lane อื่นอยากใช้ต้อง `NEED`):

```ts
// server/src/features/booking/service.ts — internal to lane A3 (not in contracts.ts)
export interface AppointmentRecord extends AppointmentSummary {
  serviceName: string; serviceSku: string; resourceName: string; customerName: string; customerId: string | null;
  note: string; timezone: string; status: 'booked' | 'cancelled' | 'completed' | 'no_show';
}
export type AppointmentChange = { type: 'created' | 'rescheduled' | 'cancelled' | 'status_changed'; appointment: AppointmentRecord };
/** In-process, fired AFTER commit, once per change; a listener that throws is logged and ignored (never rolls back). Returns unsubscribe. */
export declare function onAppointmentChange(listener: (change: AppointmentChange) => void | Promise<void>): () => void;
/** F16 registers this at boot. busy intervals block ALL resources of the business. isConnected decides the initial externalSync state. */
export interface CalendarBridge {
  isConnected(businessId: string): Promise<boolean>;
  listBusy(businessId: string, range: { from: string; to: string }): Promise<{ startAt: string; endAt: string }[]>;
}
export declare function registerCalendarBridge(bridge: CalendarBridge): void;
/** F16 reports the sync result. Ignored (returns false) when appointment.version moved past `forVersion` AND state is 'synced' (never mark synced with stale data). */
export declare function setExternalSyncState(input: { businessId: string; appointmentId: string; forVersion: number; state: 'not_configured' | 'pending' | 'synced' | 'failed'; detail?: { eventId?: string; reason?: string } }): Promise<boolean>;
export declare function getAppointmentRecord(businessId: string, appointmentId: string): Promise<AppointmentRecord | null>;
/** For F16 repair: booked/cancelled appointments updated within `sinceMinutes` whose external_sync_state is 'pending' or 'failed'. */
export declare function listAppointmentsNeedingSync(businessId: string, opts: { sinceMinutes: number; limit: number }): Promise<AppointmentRecord[]>;
/** For F16 disconnect: booked appointments with start_at > now (ascending), newest state included. limit max 500. */
export declare function listFutureAppointments(businessId: string, opts: { limit: number }): Promise<AppointmentRecord[]>;
/** For F24 rule booking_count_gte: counts per customer id (only ids with count > 0 appear). */
export declare function countAppointmentsByCustomers(businessId: string, customerIds: string[], statuses: ('booked' | 'completed')[]): Promise<Record<string, number>>;
/** Customer-originated change with the customer's consent still required: creates a proposal (kind appointment.reschedule | appointment.cancel). Enforces cutoffs. Not wired to any AI tool today. */
export declare function proposeAppointmentChange(input:
  | { kind: 'cancel'; businessId: string; conversationId: string; appointmentId: string; clientRequestId: string }
  | { kind: 'reschedule'; businessId: string; conversationId: string; appointmentId: string; startAt: string; clientRequestId: string }): Promise<{ proposal: ProposalSummary; review: BookingReviewPart }>;
```

F15 เรียก: F08 `getProduct(businessId, ref)` · F04 `getBusinessSettings`, `getBusinessOpenState`, `getEffectiveAnswerRules` · F09 `getConversation(conversationId, { businessId })`, `getHistory` · F31 `notify` · core `sendToCustomer`, `jobs.enqueue`, `db.tx`, `audit`, `publish`

## 5. Algorithms

### 5.1 ค่าคงที่และค่าที่ปรับได้

| ค่า | ค่าเริ่ม | ที่ตั้ง |
|---|---|---|
| ระยะของ service | `CatalogItem.durationMinutes` (A-SERVICE-01 = 30) | catalog (F08) |
| granularity | 30 นาที (grid เริ่มที่เวลาเปิดของช่วง) | `booking_settings` |
| buffer หลังนัด | 0 | `booking_settings` (snapshot ลง `appointments.buffer_min`) |
| lead time | 60 นาที | `booking_settings` |
| horizon | 60 วัน | `booking_settings` |
| cutoff ยกเลิก/เลื่อน (ฝั่งลูกค้า) | 2 ชม. | `booking_settings` |
| ความจุ resource | 1 | `booking_resources.capacity` |
| อายุใบสรุป | 15 นาที | `booking_settings.confirm_ttl_min` |
| ช่วงค้นหา | ≤ 31 วัน · ผลสูงสุด 50 · ค่าเริ่ม 6 | `config.ts` |
| เตือน | ปิด · 1440 และ 120 นาทีก่อนเริ่ม | `booking_settings` |

### 5.2 เวลาและ timezone (`time.ts`, ไม่ใช้ library)

timezone = `getBusinessSettings(businessId).timezone` (ค่าเริ่ม `Asia/Bangkok` ไม่มี DST) · ทุกการเก็บเป็น UTC `timestamptz` · วันและเวลาเปิดร้านเป็น **เวลาท้องถิ่นของร้าน** แปลงเป็น UTC ตอนคำนวณเท่านั้น

```ts
function tzOffsetMs(utcMs: number, tz: string): number {            // local − utc ที่ instant นั้น
  const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(utcMs));
  const g = (t: string) => Number(p.find(x => x.type === t)!.value);
  return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - Math.floor(utcMs / 1000) * 1000;
}
function localToUtcMs(date: string /* YYYY-MM-DD */, time: string /* HH:mm */, tz: string): number {
  const [y, mo, d] = date.split('-').map(Number), [h, mi] = time.split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let off = tzOffsetMs(guess, tz), utc = guess - off;
  const off2 = tzOffsetMs(utc, tz); if (off2 !== off) utc = guess - off2;   // รองรับ DST (ไม่ได้ใช้ใน Bangkok)
  return utc;
}
function localParts(utcMs: number, tz: string): { date: string; time: string; weekday: Weekday }   // ใช้ Intl เดียวกัน, weekday = ['sun','mon','tue','wed','thu','fri','sat'][new Date(Date.UTC(y,m-1,d)).getUTCDay()]
function addLocalDays(date: string, n: number): string                // คำนวณด้วย Date.UTC แล้ว format กลับ
```

ข้อความเวลาให้ลูกค้า (`formatLocal(startAt, tz, lang, { withZone })`): ไทย `22 พ.ย. 2569 10:00` (เดือนย่อ: ม.ค. ก.พ. มี.ค. เม.ย. พ.ค. มิ.ย. ก.ค. ส.ค. ก.ย. ต.ค. พ.ย. ธ.ค.; ปี = ค.ศ.+543; เวลา 24 ชม. `HH:mm`) · อังกฤษ `22 Nov 2026 10:00` · `withZone` ต่อท้าย ` Asia/Bangkok` (ชื่อ timezone ของร้าน) · `SlotOption.localDisplay` ไม่ใส่ zone, `BookingReviewPart.localDisplay` ใส่ zone ตาม comment ใน contract · **ภาษา (แก้ 21 พ.ย.):** `findSlots` ใช้ `query.language` ที่ผู้เรียกส่งมา (F10 ส่งภาษาของ turn; ไม่ส่ง = ภาษาร้าน) · `createBooking` stage `propose` ใช้ `input.language` ถ้ามี มิฉะนั้น `getCustomerLanguage(conversationId)` (ใช้กับ `localDisplay`, `proposal.summary` และ `BookingReviewPart.serviceName` = `nameEn` ของบริการเมื่อภาษาเป็น `en` และร้านกรอกไว้ มิฉะนั้น `name`) · ข้อความ notify/reminder/waitlist ใช้ `getCustomerLanguage(conversationId)` ตอนส่ง · หน้าเว็บของพนักงานใช้ภาษา UI · ลูกค้าที่พิมพ์อังกฤษต้องเห็น `22 Nov 2026 10:00` ไม่ใช่ `22 พ.ย. 2569 10:00` แม้ร้านตั้งภาษาไทย

### 5.3 `findSlots` (`slots.ts`: `computeSlots(ctx, opts)`)

อินพุต `{ businessId, serviceRef, from, to, resourceId?, limit? }` (+ ภายใน: `excludeAppointmentId?`, `forStaff?`)

1. **เตรียม:** `settings = loadBookingSettings(businessId)` (ไม่มีแถว = ค่าเริ่ม §2; `enabled=false` → `[]`) · `item = getProduct(businessId, serviceRef)` (ตรวจตาม §4) · `duration = item.durationMinutes` · `bs = getBusinessSettings(businessId)` → `tz`, `hours` · `now = Date.now()` (test ฉีด `CLOCK_FIXTURE`)
2. **ช่วงที่ขอ:** `fromMs, toMs` = parse ISO · `earliest = max(fromMs, now + lead_time_min×60_000)` · `latest = min(toMs, now + horizon_days×86_400_000)` · `earliest >= latest` → `[]`
3. **resource ที่ใช้ได้:** `booking_resources` ของร้านที่ `active` ∩ (`booking_service_resources` ของ service ถ้ามีแถว มิฉะนั้นทั้งหมด) ∩ (`resourceId` ถ้าให้) เรียง `sort_order, name` · ว่าง = `[]` (ถ้า `resourceId` ให้มาและไม่อยู่ในชุดนี้ → `NOT_FOUND`)
4. **วันที่ท้องถิ่น:** วนจาก `localParts(earliest).date` ถึง `localParts(latest − 1ms).date` · ต่อวัน `D`: `weekday = weekdayOf(D)` · `windows = hours[weekday]` (ว่าง = ปิด ข้ามวัน)
5. **วันหยุดร้าน (F04):** ต่อวัน `D` (cache ใน request): `getBusinessOpenState(businessId, <UTC instant ของ D 12:00 ท้องถิ่น>)` ถ้า `reason === 'closure'` → ข้ามทั้งวัน (F04 ตรวจ closure ก่อนเวลาเปิดเสมอ จึงใช้ instant ใดก็ได้ในวันนั้น: เลือก 12:00 เพื่อเลี่ยงขอบวัน) · ไม่ใช้ `open` boolean ของผลนี้ (เวลาเปิดคำนวณจาก `hours` ตรง ๆ ตามข้อ 6)
6. **สร้างผู้สมัครต่อ window `{open, close}`:** `winStart = localToUtcMs(D, open)`, `winEnd = localToUtcMs(D, close)` · `t = winStart; while (t + duration×60_000 <= winEnd)`: ผู้สมัคร `S = t`, `E = t + duration×60_000`, `O = E + buffer_min×60_000` (occupied) · `t += granularity_min×60_000` (grid เริ่มที่เวลาเปิดของแต่ละ window; window ที่สองของวันเริ่ม grid ใหม่ที่ `open` ของตัวเอง) · ทิ้งผู้สมัครที่ `S < earliest` หรือ `S >= latest` · `E ≤ winEnd` ต้องเป็นจริง (นัดต้องจบก่อนปิดร้าน; buffer เกินเวลาปิดได้)
7. **ข้อมูลที่ใช้ตัดสิน** (ดึงรอบเดียวต่อ request, ไม่ N+1): `appts = SELECT resource_id, start_at, occupied_until FROM appointments WHERE business_id=$1 AND status='booked' AND resource_id = ANY($2) AND start_at < $4 AND occupied_until > $3 [AND id <> $excl]` (`$3 = earliest`, `$4 = latest + buffer`) · `blocks = SELECT resource_id, start_at, end_at FROM booking_blocks WHERE business_id=$1 AND resource_id = ANY($2) AND start_at < $4 AND end_at > $3` · `busy = bridge ? await bridge.listBusy(businessId, { from, to }) : []` (จับ error/timeout 5 วินาที → `busy = []` และตั้ง flag `busyUnavailable` ใน log level `warn`: **fail-open** เพราะนัดในฐานข้อมูลคือความจริง ลูกค้าไม่ควรไม่มีคิวเพราะ Google ล่ม)
8. **ตัดสินผู้สมัครต่อ resource R (ความจุ `cap`):**
   - ถูกตัดทิ้งถ้าชนกับ block ของ R: `block.start < O && block.end > S`
   - ถูกตัดทิ้งถ้าชนกับ busy ภายนอก (ทุก resource): `busy.start < E && busy.end > S` (busy ภายนอกไม่บวก buffer)
   - `peak = peakConcurrency(appts ของ R ที่ทับ [S, O), S, O)` → `remaining = cap − peak` · `remaining ≥ 1` จึงผ่าน
9. **รวมผลข้าม resource:** กรณีไม่ได้ระบุ `resourceId` และหลาย resource ว่างเวลาเดียวกัน → คืน **หนึ่ง SlotOption ต่อ `startAt`**: เลือก resource ที่ `remaining` มากสุด เสมอกัน = `sort_order` แล้วชื่อ (deterministic) · ระบุ `resourceId` → เฉพาะ resource นั้น
10. **ประกอบ `SlotOption`:** `{ serviceId: item.id, resourceId, resourceName, startAt: ISO UTC (…Z), endAt, capacity: cap, remaining, localDisplay }` · เรียง `startAt` แล้ว `resourceName` · ตัดที่ `limit`

```ts
/** appts: occupied intervals [start, occupiedUntil) of booked appointments already filtered to overlap the window [ws, we).
 *  Returns the maximum number simultaneously occupying the resource at any instant inside the window. */
export function peakConcurrency(appts: { start: number; until: number }[], ws: number, we: number): number {
  const ev: [number, number][] = [];
  for (const a of appts) { const s = Math.max(a.start, ws), e = Math.min(a.until, we); if (e > s) { ev.push([s, 1], [e, -1]); } }
  ev.sort((x, y) => x[0] - y[0] || x[1] - y[1]);                       // ที่เวลาเดียวกัน: -1 (จบ) ก่อน +1 (เริ่ม)
  let cur = 0, max = 0; for (const [, d] of ev) { cur += d; if (cur > max) max = cur; } return max;
}
```

**ค่าตรวจ (SPEC §5, ต้องอยู่ใน test):** ร้าน A (เปิดทุกวัน 10:00–20:00 Asia/Bangkok), `CLOCK_FIXTURE = 2026-11-21T03:00:00Z` (10:00 น. วันเสาร์), service A-SERVICE-01 (30 นาที), resource A1 ความจุ 1, granularity 30, lead 60: `findSlots(A, { serviceRef:{sku:'A-SERVICE-01'}, from:'2026-11-22T00:00:00+07:00', to:'2026-11-23T00:00:00+07:00' })` → ช่วงแรก = `{ startAt:'2026-11-22T03:00:00.000Z', endAt:'2026-11-22T03:30:00.000Z', resourceName:'A1', capacity:1, remaining:1, localDisplay:'22 พ.ย. 2569 10:00' }` · ช่วงสุดท้ายของวัน = `19:30–20:00` ท้องถิ่น (`12:30Z`) · มีทั้งหมด 20 ช่วง · วันนี้ (21 พ.ย.) ช่วงก่อน 11:00 น. ถูกตัดด้วย lead time 60 นาที (ช่วงแรกของวัน = 11:00 น. = `04:00:00Z`) · ร้าน B (จันทร์–เสาร์ 09:00–18:00): 22 พ.ย. 2026 เป็นวันอาทิตย์ → `[]`; จันทร์ 23 พ.ย. 09:00 → ช่วงแรก `02:00:00Z`

### 5.4 `createBooking` stage `propose` (`proposals.ts`)

1. ตรวจ `conversationId` ด้วย `getConversation(id, { businessId })` (null → `NOT_FOUND`) · `getEffectiveAnswerRules(businessId).booking === false` → `POLICY_BLOCKED` (`booking_disabled`) · `booking_settings.enabled=false` → เหมือนกัน
2. `item = getProduct(businessId, serviceRef)` → ตรวจตาม §4 (null → `NOT_FOUND`; `kind ≠ 'service'` → `VALIDATION_ERROR` `not_a_service`)
3. `startAt` parse ISO → `S` (ต้องเป็น instant ที่ถูกต้อง มิฉะนั้น `VALIDATION_ERROR`)
4. `request_hash = sha256(canonicalJson({ conversationId, serviceItemId: item.id, resourceId: resourceId ?? null, startAt: S ISO }))` · มีแถว `booking_proposals` ที่ `(business_id, client_request_id)`: hash เท่า → **คืนใบเดิมโดยไม่สร้างใหม่** (ถ้ายัง `open` และไม่หมดอายุ: reviewToken/version เดิม; ถ้าหมดอายุแล้ว → สร้างใบใหม่ด้วย request id เดิมไม่ได้: คืน `PROPOSAL_EXPIRED`) · hash ต่าง → `IDEMPOTENCY_CONFLICT`
5. **ตรวจว่าเวลานี้ว่างจริง:** `slots = computeSlots({ from: S, to: S + duration + 1 วินาที, resourceId, limit: 5 })` แล้วหา slot ที่ `startAt === S` (ตรงเป๊ะ) · ไม่พบ → `SLOT_FULL` โดย `details.reason` = เหตุผลที่ตรวจเจอ (`full` | `closed` | `too_soon` | `too_far` | `off_grid` | `blocked` | `busy`; ถ้าแยกไม่ได้ใช้ `unavailable`) และ `details.alternatives` = สูงสุด 3 `localDisplay` ของ slot ใกล้เคียง (`computeSlots` ช่วง ±1 วัน, ถูก `limit 3`) เพื่อให้ F10 ตอบได้ · resource = resource ของ slot ที่เลือก (ตามข้อ 9 ของ §5.3)
6. ชื่อลูกค้า: `input.customerName?.trim()` หรือ `conversation.customer.displayName` หรือ `'ลูกค้า'` (ตัดที่ 80)
7. ใน `db.tx`: `UPDATE booking_proposals SET state='superseded', decided_at=now() WHERE conversation_id=$1 AND state='open' AND kind='appointment.create'` (ใบเก่าของแชตนี้ถูกแทนที่) แล้ว INSERT ใบใหม่: `version = COALESCE(MAX(version),0)+1` ต่อ conversation · `review_token = randomBytes(24).toString('base64url')` · `expires_at = now + confirm_ttl_min` · `service_name` = `item.name` (หรือ `nameEn` เมื่อธุรกิจภาษา en และมี)
8. คืน `{ stage:'propose', state:'awaiting_confirmation', proposal: { id, kind:'appointment.create', version, expiresAt, summary, reviewToken }, review: { type:'booking_review', proposalId, version, serviceName, resourceName, startAt, endAt, timezone, localDisplay: formatLocal(withZone), expiresAt, reviewToken } }` · `summary` = `จอง <serviceName> <localDisplay>` · **ไม่ส่งข้อความเอง** (F10 แนบการ์ดตอบ; staff ใช้ dialog §7) · ไม่มี job ไม่มี audit ระดับ appointment (เขียน `audit('booking.proposal.create')` เพื่อ trace)

### 5.5 `createBooking` stage `confirm` (`confirm.ts`)

อินพุต `{ stage:'confirm', businessId, conversationId, actor, clientRequestId, proposalId, version, reviewToken, decision }`

1. `request_hash = sha256(canonicalJson({ proposalId, version, decision, reviewToken }))`
2. อ่าน `booking_receipts (business_id, clientRequestId)`: พบและ hash เท่า → **replay** `{ stage:'confirm', receiptId, replayed:true, appointment: (AppointmentSummary จาก appointment_id | null), decision }` ไม่เขียน/ส่งอะไรซ้ำ · hash ต่าง → `IDEMPOTENCY_CONFLICT`
3. โหลด proposal `WHERE id=$1 AND business_id=$2 AND conversation_id=$3` ไม่พบ → `NOT_FOUND` · `reviewToken` เทียบแบบ constant-time (`timingSafeEqual`) ไม่ตรง → `VALIDATION_ERROR` (`details.reason='bad_review_token'`)
4. `actor.kind === 'staff'` และ `decision === 'confirm'` → `POLICY_BLOCKED` (`staff_cannot_consent`: พนักงานยืนยันแทนลูกค้าไม่ได้ ใช้ `POST /appointments` ที่บันทึกว่าเป็นนัดที่พนักงานสร้าง) · staff + `cancel` ได้ (เพิกถอนใบสรุป)
5. สถานะใบสรุป: `version ≠ proposal.version` หรือ `state='superseded'` → `VERSION_CONFLICT` (`details.reason='superseded'`, `latestProposalId`) · `state='confirmed'`: `decision='confirm'` → replay นัดเดิม (INSERT receipt ใหม่ `replayed:true`) / `decision='cancel'` → `POLICY_BLOCKED` (`already_confirmed`) · `now() > expires_at` หรือ `state='expired'` → ตั้ง `expired` แล้ว `PROPOSAL_EXPIRED` · `state='cancelled'` → `decision='cancel'` ตอบเหมือน replay, `'confirm'` → `PROPOSAL_EXPIRED`
6. `decision='cancel'` → `db.tx`: `UPDATE booking_proposals SET state='cancelled', decided_at=now() WHERE id=$1 AND state='open'` (แถวหาย = แข่งกัน → อ่านใหม่ทำตามข้อ 5) · INSERT receipt · หลัง commit ส่งข้อความสุภาพหนึ่งบรรทัด (§5.12 `declined`) ผ่านข้อ 12 → คืน `{ …, appointment: null, decision:'cancel' }`
7. `decision='confirm'` — **ตรวจนอกธุรกรรม (I/O ภายนอกห้ามอยู่ในที่ถือ lock):** (ก) `getBusinessSettings` + closure probe + ชั่วโมงเปิด (ข) lead time/horizon (ค) `bridge.listBusy` ในช่วง `[start, end)` (fail-open) · เรียก `computeSlots` ทั้งชุดตรวจเฉพาะ resource ของใบสรุป (เพื่อตรวจ grid/วัน/ชั่วโมง/block/busy โดยไม่ตรวจความจุ: ภายใน `skipCapacity: true`) · ไม่ผ่าน → `SLOT_FULL` (`details.reason` ตามข้อ 5 ของ §5.4) พร้อมเตรียมข้อความ "เต็ม" (ข้อ 9)
8. **ธุรกรรมจองจริง (ความปลอดภัยของความจุ §5.6):** `db.tx(async tx => { … })`:
   1. `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))` โดย `$1 = 'booking:' || business_id || ':' || resource_id`
   2. `SELECT id, state, version, expires_at FROM booking_proposals WHERE id=$1 FOR UPDATE` · ตรวจซ้ำว่า `state='open'` และยังไม่หมดอายุ (ถ้า confirm อีกตัวชนะไปแล้วระหว่างรอ lock → ข้อ 5 ทำงาน: replay นัดเดิม) 
   3. `SELECT capacity, active FROM booking_resources WHERE id=$1 AND business_id=$2` (ไม่ active → `SLOT_FULL` `unavailable`)
   4. อ่านนัดทับช่วง `SELECT start_at, occupied_until FROM appointments WHERE resource_id=$1 AND status='booked' AND start_at < $newOccEnd AND occupied_until > $newStart` และ block ทับ → `peak = peakConcurrency(...)` · `peak >= capacity` หรือมี block → **ROLLBACK ด้วย `SLOT_FULL`** (`details.reason='full'`)
   5. `INSERT INTO appointments (…status 'booked', version 1, reminder_generation 1, source 'customer_confirm', proposal_id, buffer_min = settings.buffer_min, occupied_until = end + buffer, external_sync_state = $syncInitial, confirmation_state = conversation มี ? 'pending' : 'not_required')` (`UNIQUE(proposal_id)` ชนกัน = confirm ซ้ำที่หลุดมา → ทำตามข้อ 5 replay)
   6. `UPDATE booking_proposals SET state='confirmed', decided_at=now() WHERE id=$1 AND state='open'` (rowCount 0 → throw ภายใน tx ให้ rollback แล้วอ่านใหม่ทำข้อ 5)
   7. `INSERT booking_receipts (…decision 'confirm', appointment_id)` · `INSERT appointment_events (type 'created', actor_kind = actor.kind)` · `INSERT appointment_reminders` ตาม §5.11 (เฉพาะเมื่อ `reminders_enabled`)
9. **ผู้แพ้การแข่ง (`SLOT_FULL` ตอน confirm ของลูกค้า):** ก่อนโยน error ส่งข้อความ (best effort, `clientRequestId: 'booking-full:' + clientRequestId` กันซ้ำ, ผ่านข้อ 12) "ขออภัยค่ะ เวลานี้เพิ่งมีคนจองไปแล้ว ขอเสนอช่วงใกล้เคียง: <สูงสุด 3 localDisplay> สนใจช่วงไหนบอกได้เลยนะคะ" แล้วค่อย `throw AppError('SLOT_FULL', …, { reason, alternatives })` · ใบสรุปคงสถานะ `open` ถ้าไม่หมดอายุ (ลูกค้ากดใหม่ได้เมื่อมีที่ว่าง) แต่ F10 จะออกใบใหม่เมื่อลูกค้าเลือกเวลาใหม่
10. **หลัง commit (นอก tx):** (ก) `jobs.enqueue('booking.notify', { appointmentId, kind: 'created' }, { dedupKey: 'booking.notify:<id>:created', businessId })` (ข) เรียก listeners ของ `onAppointmentChange({ type:'created' })` (F16 enqueue `calendar.sync` ของตัวเอง) (ค) `publish(businessId, { type:'custom', featureId:'F15', name:'booking.changed', data:{ appointmentId } })` (ง) `audit('booking.appointment.create', { targetType:'appointment', targetId, details:{ source, serviceItemId } })` (จ) เตือน: enqueue ตาม §5.11
11. คืน `{ stage:'confirm', receiptId, replayed:false, appointment: AppointmentSummary, decision:'confirm' }`
12. **ส่งข้อความถึงลูกค้า (F15 รับผิดชอบเอง) — job `booking.notify`** (payload `{ appointmentId, kind: 'created' | 'rescheduled' | 'cancelled' }`): โหลดนัด · ไม่มี `conversation_id` หรือ staff ปิด `notifyCustomer` (เก็บเป็น `appointment_events.detail.notify=false`) → ไม่ส่ง · ส่ง `sendToCustomer(conversationId, [{ type:'text', text }], { author:'ai', origin:'system', clientRequestId: 'booking-notify:<id>:<kind>:v<version>', businessId })` ข้อความ (สองภาษาใน `messages.ts` เป็น `{ th, en }` เลือกด้วย `getCustomerLanguage(conversationId)` **ไม่ใช่ภาษาร้าน** · ค่า `en` อยู่ในตาราง "ข้อความถึงลูกค้าสองภาษา" ท้าย §5 · ค่า th): created = `จองเรียบร้อยแล้วค่ะ {service} วัน{localDisplay} กับ {resource} หากต้องการเลื่อนหรือยกเลิก แจ้งในแชตนี้ได้เลยนะคะ` · rescheduled = `ร้านเลื่อนนัดของคุณเป็น {localDisplay} ค่ะ ถ้าเวลานี้ไม่สะดวก แจ้งได้เลยนะคะ` · cancelled = `นัด {service} วัน{localDisplay} ถูกยกเลิกแล้วค่ะ` (+ ` เหตุผล: {reason}` เมื่อ staff ใส่) · declined = `รับทราบค่ะ ยังไม่ได้จองให้นะคะ ถ้าต้องการจองใหม่บอกวันเวลาได้เลย` · สำเร็จ → `confirmation_state='sent'` + event `confirmation_sent` · throw ก่อนเรียก `sendToCustomer` (อ่าน DB ล้ม) → retry ปกติ · `sendToCustomer` throw → `confirmation_state='failed'` (ไม่ retry ซ้ำ: ป้องกันส่งซ้ำ; staff เห็นป้ายเตือนในรายละเอียดนัด) · นอกจากนี้ staff ได้ `notify({ businessId, to:{ permission:'appointments.read' }, type:'booking.created' | 'booking.cancelled', title, body: '<บริการ> · <localDisplay>', link:'/appointments?a=<id>', dedupKey:'booking:<id>:created' })` ตามตาราง F31 §5.3 (title ไทย `มีการจองใหม่` / `มีการยกเลิกการจอง`; reschedule ไม่แจ้ง notify)
13. **repair (outbox ใน DB):** schedule `booking.repair` ทุก 120 วินาที: `SELECT id FROM appointments WHERE confirmation_state='pending' AND created_at < now() - 60s LIMIT 50` → enqueue `booking.notify` ซ้ำ (dedupKey เดิม: ถ้างานยังอยู่/สำเร็จแล้ว core คืน `deduped`) · และ `appointment_reminders` ที่ `state='pending'`, `job_id IS NULL`, `run_at < now() + 10 นาที` → enqueue งาน (กรณีชีวิตดับระหว่าง commit กับ enqueue)

### 5.6 ความจุและ race protection (ตัดสินใจ: **transaction + advisory lock ต่อ resource + นับใหม่ใน tx**)

เหตุผลที่ไม่ใช้ exclusion constraint: ความจุมากกว่า 1 และช่วงที่ทับกันบางส่วน (นัด 10:00–10:30 กับ 10:15–10:45) ต้องนับ "ความพร้อมกันสูงสุด" ซึ่ง constraint ฝั่ง DB ไม่รู้ความจุที่เปลี่ยนได้; lock ต่อ resource แคบพอที่ resource อื่นไม่ถูกบล็อก

```sql
-- ที่ต้นธุรกรรมของ confirm / staff create / reschedule (ทุก write ที่เปลี่ยนความจุของ resource ใช้ key เดียวกัน)
SELECT pg_advisory_xact_lock(hashtextextended('booking:' || $1::text || ':' || $2::text, 0));  -- $1 business_id, $2 resource_id

-- นัดที่ทับช่วง occupied ของผู้สมัคร [S, O) (ไม่รวมตัวเองเมื่อ reschedule)
SELECT start_at, occupied_until FROM appointments
WHERE business_id = $1 AND resource_id = $2 AND status = 'booked'
  AND start_at < $4 AND occupied_until > $3 AND id <> COALESCE($5::uuid, '00000000-0000-0000-0000-000000000000');

SELECT 1 FROM booking_blocks WHERE business_id = $1 AND resource_id = $2 AND start_at < $4 AND end_at > $3 LIMIT 1;
```

- `peakConcurrency(rows, S, O) >= capacity` → `SLOT_FULL` · ไม่มี block
- reschedule ข้าม resource (ย้ายไปอีก resource): ล็อก **ทั้งสอง key เรียงตามสตริง** (กัน deadlock) ในธุรกรรมเดียว
- ปล่อย lock เองเมื่อ commit/rollback (xact lock) · ห้ามเรียก I/O ภายนอก (Google, model, `sendToCustomer`) ในธุรกรรม
- ด่านสุดท้าย: `UNIQUE(appointments.proposal_id)` กันใบสรุปเดียวได้สองนัด · `statement_timeout 10s` ของ core กันค้าง
- **test race (ต้องมี):** สอง proposal ต่างแชตของ `slot_a_1122_1000` (22 พ.ย. 10:00–10:30, resource A1, ความจุ 1) → `Promise.all([confirm(p1), confirm(p2)])` ทั้งสองผ่านด่านนอก tx → ผล: **หนึ่ง `appointment` ได้ `booked`, อีกคน `SLOT_FULL`** · `SELECT count(*) FROM appointments WHERE status='booked' AND start_at='2026-11-22T03:00:00Z'` = 1 · ทำซ้ำ 20 รอบ (ใช้ `pg` ต่างการเชื่อมต่อจริง ไม่ใช่ mock) · ความจุ 2 → ทั้งสองได้ · ความจุ 2 สาม confirm → สองได้ หนึ่ง `SLOT_FULL`

### 5.7 State machine ของนัด (CAS ด้วย `version`)

| from | event | to | ใครทำ | เงื่อนไข |
|---|---|---|---|---|
| (ไม่มี) | confirm (ลูกค้า) | `booked` | customer | §5.5 |
| (ไม่มี) | `POST /appointments` | `booked` | staff | §5.10 |
| booked | reschedule | `booked` (เวลา/resource ใหม่, `version+1`, `reminder_generation+1`) | staff (หรือลูกค้าผ่านใบสรุป) | §5.9 |
| booked | cancel | `cancelled` (`cancelled_by`, `cancelled_at`, `reminder_generation+1`) | staff / customer / system | §5.9 |
| booked | `status: completed` | `completed` | staff | `now ≥ start_at` มิฉะนั้น `POLICY_BLOCKED` `not_started_yet` |
| booked | `status: no_show` | `no_show` | staff | เหมือนกัน |
| completed / no_show | `status: booked` (แก้ที่ทำผิด) | `booked` | staff | `now ≤ end_at + 24 ชม.`; ต้องไม่ทับความจุ (ตรวจใน tx เหมือนจองใหม่) |
| completed ↔ no_show | แก้สถานะ | อีกฝั่ง | staff | ภายใน 24 ชม. หลัง `end_at` |
| cancelled | — | terminal | — | ทุกคำสั่งหลังจากนั้น = `POLICY_BLOCKED` (`invalid_transition`) |

ทุก write: `UPDATE appointments SET …, version = version + 1, updated_at = now() WHERE id=$1 AND business_id=$2 AND version=$expected AND status=$from` · `rowCount = 0` → อ่านใหม่: ไม่พบ `NOT_FOUND` · พบ: `VERSION_CONFLICT` (`details: { currentVersion, currentStatus }`) · ทุกการเปลี่ยนเขียน `appointment_events` + `audit('booking.appointment.<event>')` + `publish` + เรียก listeners (`onAppointmentChange`)

### 5.8 กฎ cutoff

| ผู้ทำ | เลื่อน | ยกเลิก |
|---|---|---|
| ลูกค้า (ผ่าน `proposeAppointmentChange` + กดยืนยัน) | ต้อง `start_at − now ≥ reschedule_cutoff_hours` ทั้งตอนเสนอและตอนยืนยัน มิฉะนั้น `POLICY_BLOCKED` (`cutoff_passed`, `details.cutoffHours`) | `start_at − now ≥ cancel_cutoff_hours` เช่นเดียวกัน |
| พนักงาน | ไม่มี cutoff (เตือนใน UI ถ้าเลยเวลา) | ไม่มี cutoff |

ลูกค้าเลื่อน: เวลาใหม่ต้องผ่าน `computeSlots` เหมือนจองใหม่ (ตรวจในข้อเสนอและซ้ำตอนยืนยัน)

### 5.9 เลื่อนและยกเลิก (`mutations.ts`)

**reschedule(staff)** `POST /appointments/:id/reschedule`: โหลดนัด (ต้อง `booked`, มิฉะนั้น `POLICY_BLOCKED` `not_booked`) · ตรวจกฎเวลา **ยกเว้น `override:true`** (ต้อง `appointments.settings` + `overrideReason` ไม่งั้น `PERMISSION_DENIED`/`VALIDATION_ERROR`) ด้วย `computeSlots({ excludeAppointmentId: id, forStaff: true })` สำหรับเวลาใหม่ · ใน tx ล็อก resource เก่า/ใหม่ → นับความจุใหม่ (ไม่นับตัวเอง) ถ้า `override` ไม่ตรวจความจุ (ตั้ง `overridden=true`) → `UPDATE … SET start_at, end_at, occupied_until, resource_id, buffer_min = settings ปัจจุบัน, version+1, reminder_generation = reminder_generation + 1, external_sync_state = (bridge.isConnected ? 'pending' : เดิม), overridden = overridden OR $o` · `UPDATE appointment_reminders SET state='skipped', skip_reason='superseded' WHERE appointment_id=$1 AND generation < $new AND state IN ('pending','sending')` · `INSERT` reminders รุ่นใหม่ (§5.11) · event `rescheduled` `{ from: { startAt, resourceId }, to: {…}, notify }` · หลัง commit: `booking.notify` kind `rescheduled` (ถ้า `notifyCustomer`) · listeners `rescheduled` · audit · ถ้านัดเดิมเปิดเวลาว่าง → trigger waitlist scan (§5.12)

**cancel(staff)**: ต้อง `booked` · `UPDATE … SET status='cancelled', cancelled_by='staff', cancelled_at=now(), cancel_reason, version+1, reminder_generation+1` · reminders ที่ pending/sending → `skipped` `cancelled` · event `cancelled` · หลัง commit: `booking.notify` `cancelled` (ถ้า `notifyCustomer`) + staff `notify` `booking.cancelled` (dedupKey `booking:<id>:cancelled`) + listeners `cancelled` + waitlist scan

**ฝั่งลูกค้า (`proposeAppointmentChange`)**: สร้าง proposal `kind 'appointment.cancel'|'appointment.reschedule'` (ตรวจ cutoff §5.8, นัดต้องเป็นของ `customer_id` ของแชตนี้ มิฉะนั้น `NOT_FOUND`) พร้อมการ์ด `booking_review` (reschedule: `startAt/endAt` = เวลาใหม่, `localDisplay` ใหม่; cancel: เวลาเดิมของนัด) แล้ว `createBooking` stage `confirm` ทำงานตาม `kind`: `reschedule` → เรียกตรรกะ reschedule เดียวกันด้วย `actor customer` · `cancel` → cancel ด้วย `cancelled_by 'customer'` · รหัสผิดพลาดตามเดิม (`SLOT_FULL`, `POLICY_BLOCKED cutoff_passed`) · **ยังไม่มีผู้เรียก** (F10 ไม่มี tool): ครอบด้วย unit test เท่านั้นและรายงานใน §15

**status**: `completed`/`no_show` ไม่แจ้งลูกค้า ไม่เปลี่ยน generation (reminders ที่ pending ของนัดในอดีตไม่มี) · listeners `status_changed`

### 5.10 พนักงานสร้างนัด (`POST /appointments`)

ตรวจ service/resource/เวลาด้วย `computeSlots` (ไม่ต้องมี lead time เมื่อ `override`) · ไม่ override: ต้องผ่านทุกกฎ (`POLICY_BLOCKED` ด้วยเหตุผลที่ตรง หรือ `SLOT_FULL`) · override: ต้องมี `appointments.settings` + `overrideReason`; ข้ามชั่วโมง/วันหยุด/block/ความจุ/lead แต่ **ไม่ข้ามทับตัวเองซ้ำ** (idempotency ด้วย `clientRequestId` ที่เก็บใน `appointment_events.detail`/unique ผ่าน `source 'staff'` + hash ใน receipts: ใช้ตาราง `booking_receipts` เดียวกันโดย `proposal_id` ชี้ใบสรุปภายในที่สร้างเป็น `state 'confirmed'` ทันที `kind 'appointment.create'` เพื่อให้ `UNIQUE(proposal_id)` และ receipts กันกดซ้ำ) · ล็อก/นับความจุตาม §5.6 เมื่อไม่ override · `source 'staff'`, `created_by` = ผู้ใช้ · ผูก `conversationId` + `notifyCustomer` → ส่ง `booking.notify` · ไม่ผูกแชต → `confirmation_state 'not_required'` · เขียน `overridden` · event `created` · audit `booking.appointment.create` (`details.overridden`)

### 5.11 เตือน (reminders) และ generation counter

- `reminder_generation` เริ่ม 1 และ **+1 ทุกครั้งที่เวลา/resource ของนัดเปลี่ยนหรือถูกยกเลิก** (§5.9) · reminders ผูกกับรุ่น: PK `(appointment_id, generation, minutes_before)`
- **สร้าง** (หลังจอง/เลื่อน เมื่อ `reminders_enabled` และมี `conversation_id`): ต่อ `m ∈ reminder_minutes`: `run_at = start_at − m นาที` · `run_at ≤ now` → ไม่สร้างแถว (นัดที่จองใกล้เวลาเกินไป ไม่เตือนย้อน) · INSERT แถว `pending` แล้ว `jobs.enqueue('booking.reminder', { appointmentId, generation, minutesBefore }, { dedupKey: 'booking.reminder:<id>:<generation>:<m>', runAt: run_at, businessId })` แล้วเก็บ `job_id`
- **ส่ง (job `booking.reminder`)**: 1) `UPDATE appointment_reminders SET state='sending' WHERE appointment_id=$1 AND generation=$2 AND minutes_before=$3 AND state='pending' RETURNING *` (claim แบบมีเงื่อนไข: ไม่ได้แถว = จบเงียบ) 2) โหลดนัด: `status ≠ 'booked'` → `skipped` `cancelled` · `appointments.reminder_generation ≠ payload.generation` → `skipped` `superseded` (**ด่านที่ทำให้ reminder เก่าไม่ส่งแม้ job เก่ายังอยู่ในคิว**) · `settings.reminders_enabled=false` → `skipped` `disabled` · `now > run_at + 30 นาที` (เซิร์ฟเวอร์หยุดนาน) → `skipped` `past` · ไม่มี conversation → `skipped` `no_conversation` · Meta (facebook/instagram): `now > conversation.lastInboundAt + 24h − 30 นาที` → `skipped` `window_closed` (ไม่ใช้ message tag) 3) ส่ง `sendToCustomer(conversationId, [text], { author:'ai', origin:'system', clientRequestId: 'booking-reminder:<id>:<generation>:<m>', businessId })` ข้อความ: ≥ 720 นาที = `เตือนนัดพรุ่งนี้ค่ะ {service} วัน{localDisplay} กับ {resource} ถ้าไม่สะดวก แจ้งในแชตนี้ได้เลยนะคะ` · < 720 = `อีกไม่นานถึงนัดแล้วค่ะ {service} เวลา {HH:mm} กับ {resource} ที่ร้านรอพบนะคะ` 4) สำเร็จ → `sent` + `sent_at` + `message_id` + event `reminder_sent` · throw → `failed` + `error` (ไม่ retry: ไม่ส่งซ้ำ; ยกเว้นก่อนเรียก `sendToCustomer` อ่าน DB ล้ม = retry ของ job ปกติ โดยคืน state `pending`) 5) `closed` conversation: `sendToCustomer` ของ core ไม่บล็อก (UNCONFIRMED §15) · ล้ม → `failed`
- **เปิด/ปิดเตือน/เปลี่ยน `reminder_minutes`:** มีผลกับนัดที่จองหลังจากนั้น · นัดเดิมที่มีแถว `pending` ตรวจ `reminders_enabled` ตอนส่ง (ปิด = ข้าม) · ปุ่ม "สร้างการเตือนใหม่สำหรับนัดที่ยังไม่เริ่ม" **ไม่ทำ** (นอกขอบเขต)
- **ตัวอย่าง test:** นัด 22 พ.ย. 10:00 (`03:00Z`) จองวันที่ 21 พ.ย. 03:00Z → `run_at` ของ 1440 = `2026-11-21T03:00:00Z` (= now → ไม่สร้าง เพราะ `run_at ≤ now`) · 120 = `2026-11-22T01:00:00Z` สร้าง · เลื่อนเป็น 12:00 (`05:00Z`) → generation 2: แถว gen 1 เป็น `skipped superseded`, gen 2: 1440 = `2026-11-21T05:00:00Z` สร้าง, 120 = `2026-11-22T03:00:00Z` · รัน job gen 1 (เก่า) → ไม่มีข้อความ · ยกเลิกแล้วรัน gen 2 → `skipped cancelled`

### 5.12 คิวรอ (waitlist, slice S4 ถ้าทัน)

- เข้าคิว: **พนักงานเท่านั้น** (`POST /waitlist`; ลูกค้าเข้าคิวผ่าน AI ยังไม่มี tool) · ต้องเปิด `waitlist_enabled` · ช่วงที่ต้องการ `[want_start_at, want_end_at)` ยาวไม่เกิน 4 ชม.
- scan: เมื่อเกิน cancel/reschedule-away หรือ block ถูกลบ → `jobs.enqueue('booking.waitlist', { businessId, hint: iso }, { dedupKey: 'booking.waitlist:<businessId>:<minute>', runAt: now+5s })` + schedule `booking.waitlist.expire` ทุก 300 วินาที (ตั้ง `expired` ที่ `want_start_at < now + lead_time` และ `offered` ที่เสนอเกิน 2 ชม. แล้วไม่ตอบ)
- handler: รายการ `waiting` เรียง `created_at` ต่อ business: ต่อรายการ `computeSlots` ในช่วงที่ต้องการ (resource ตามที่ระบุ) ถ้าพบ slot ว่าง และลูกค้ามี conversation → สร้าง proposal ด้วยตรรกะ §5.4 (`clientRequestId: 'waitlist:<id>'`) แล้ว `sendToCustomer(conversationId, [text 'มีคิวว่างแล้วค่ะ …', booking_review], { author:'ai', origin:'system', clientRequestId: 'waitlist-offer:<id>' })` ตั้ง `offered`, `offer_proposal_id` · เสนอครั้งละหนึ่งคนต่อ slot (รายถัดไปรอจนหมดอายุ/ปฏิเสธ) · ลูกค้ากดยืนยัน → นัดถูกสร้างตามปกติ แล้ว `booking_waitlist.state='booked'` (ตั้งใน tx confirm เมื่อ `proposal.id = offer_proposal_id`)
- ไม่มีสิทธิ์พิเศษ: ถ้าคนอื่นแย่ง slot ก่อน ลูกค้าได้ `SLOT_FULL` ตามปกติ (ไม่มี hold)

### ข้อความถึงลูกค้าสองภาษา (`messages.ts`)

ทุกข้อความที่ F15 ส่งถึงลูกค้าเก็บเป็น `{ th, en }` · `lang = await getCustomerLanguage(conversationId, { businessId })` (F09 · contracts.ts) · `{localDisplay}` สร้างด้วย `formatLocal(…, lang, …)` ภาษาเดียวกัน · test `messages.test.ts`: ทุก key มีสองภาษา ค่า `en` ไม่มีอักษรไทย และ `formatLocal(…,'en')` ไม่มีปี พ.ศ.

| key | th (ตามที่เขียนใน §5) | en |
|---|---|---|
| `created` | `จองเรียบร้อยแล้วค่ะ {service} วัน{localDisplay} กับ {resource} หากต้องการเลื่อนหรือยกเลิก แจ้งในแชตนี้ได้เลยนะคะ` | `Your booking is confirmed: {service} on {localDisplay} with {resource}. To change or cancel it, just tell us in this chat.` |
| `rescheduled` | `ร้านเลื่อนนัดของคุณเป็น {localDisplay} ค่ะ ถ้าเวลานี้ไม่สะดวก แจ้งได้เลยนะคะ` | `The shop moved your appointment to {localDisplay}. If that time does not suit you, please tell us.` |
| `cancelled` (+ เหตุผล) | `นัด {service} วัน{localDisplay} ถูกยกเลิกแล้วค่ะ` + ` เหตุผล: {reason}` | `Your appointment for {service} on {localDisplay} has been cancelled.` + ` Reason: {reason}` |
| `declined` | `รับทราบค่ะ ยังไม่ได้จองให้นะคะ ถ้าต้องการจองใหม่บอกวันเวลาได้เลย` | `Okay, nothing has been booked. If you want to book again, just tell us the date and time.` |
| `slot_full` | `ขออภัยค่ะ เวลานี้เพิ่งมีคนจองไปแล้ว ขอเสนอช่วงใกล้เคียง: {slots} สนใจช่วงไหนบอกได้เลยนะคะ` | `Sorry, that time has just been taken. Nearby times: {slots}. Tell us which one you would like.` |
| `reminder_day` (≥ 720 นาที) | `เตือนนัดพรุ่งนี้ค่ะ {service} วัน{localDisplay} กับ {resource} ถ้าไม่สะดวก แจ้งในแชตนี้ได้เลยนะคะ` | `A reminder for tomorrow: {service} on {localDisplay} with {resource}. If you cannot make it, tell us in this chat.` |
| `reminder_soon` (< 720 นาที) | `อีกไม่นานถึงนัดแล้วค่ะ {service} เวลา {HH:mm} กับ {resource} ที่ร้านรอพบนะคะ` | `Your appointment is coming up: {service} at {HH:mm} with {resource}. See you at the shop.` |
| `waitlist_offer` | `มีคิวว่างแล้วค่ะ …` (ตาม §8) | `A slot has opened up. Please check the summary below and press confirm if you want it.` |
| `proposal.summary` | `จอง {serviceName} {localDisplay}` | `Booking: {serviceName} {localDisplay}` |

## 6. AI calls

ไม่มี AI call (F15 ไม่เรียก `model.*`) · การแปลงข้อความอิสระ ("พรุ่งนี้บ่ายสอง") เป็น `from_date`/`to_date` และการเลือก slot เป็นหน้าที่ของ F10 tools (`find_slots`, `propose_booking`) · F10 ส่ง `startAt` ที่ copy จากผล `find_slots` เท่านั้น และ F15 **ตรวจซ้ำทุกครั้ง** (§5.4 ข้อ 5) ดังนั้นเวลาที่โมเดลแต่งขึ้นไม่มีทางทำให้เกิดนัด · ข้อความถึงลูกค้าทั้งหมดมาจาก template ในโค้ด (`messages.ts`, i18n ไทย/อังกฤษ) ไม่ผ่านโมเดล · fake mode: ไม่เกี่ยวข้อง

## 7. UI

Route `/appointments` (`permission:'appointments.read'`, `titleKey:'booking:page.title'`) · เมนู `{ path:'/appointments', labelKey:'booking:menu.title', group:'commerce', icon:'EventAvailableOutlined', order:30, permission:'appointments.read', searchTerms:['นัด','จอง','booking','appointment','คิว'] }` · หน้า `AppointmentsPage.tsx` เดียว (แท็บ MUI):

1. `PageHeader` "นัดหมาย" + ปุ่ม "สร้างนัด" (ต้อง `appointments.write` ผ่าน `useCan`) + ชิปเตือนถ้า F16 ซิงก์ล้ม (`externalSync.failed` > 0)
2. แท็บ **ตารางนัด**: ตัวเลือกช่วง (วันนี้ / 7 วัน / เดือน) + กรองสถานะ/ผู้ให้บริการ + ค้นหา · `DataTable` คอลัมน์ เวลา (`localDisplay`) · ลูกค้า · บริการ · ผู้ให้บริการ · สถานะ (`StatusChip generic`) · การซิงก์ปฏิทิน (chip: ไม่ได้เชื่อม/รอซิงก์/ซิงก์แล้ว/ล้มเหลว) · ป้าย "เขียนทับกฎ" ถ้า `overridden` · คลิกแถว (`?a=<id>`) → ลิ้นชักรายละเอียด: ข้อมูล, ประวัติ (`events`), การเตือน (รอบเวลา + สถานะ), ปุ่ม **เลื่อน** (dialog เลือกวัน/เวลาจาก `GET /slots` + checkbox "แจ้งลูกค้า" + ถ้าเลย cutoff แสดงคำเตือน + ปุ่ม override สำหรับ `appointments.settings`), **ยกเลิก** (`ConfirmDialog` + เหตุผล + แจ้งลูกค้า), **เสร็จสิ้น** / **ไม่มา** (เมื่อเลยเวลาเริ่ม) · ปุ่ม "เปิดแชต" (`/chat?c=`) เมื่อมี conversation
3. แท็บ **ปฏิทินสัปดาห์** (อ่านอย่างเดียว): ตาราง 7 วัน × ชั่วโมงร้านเปิด แสดงนัดเป็นบล็อกต่อ resource (สร้างจาก `GET /appointments` ช่วงสัปดาห์ ไม่ใช้ไลบรารีปฏิทิน) · คลิกบล็อก → ลิ้นชักเดียวกัน
4. แท็บ **ตั้งค่า** (ต้อง `appointments.settings` ไม่งั้นอ่านอย่างเดียว): `SectionCard` กฎการจอง (`GET/PUT settings` ด้วย `expectedVersion`) · `SectionCard` ผู้ให้บริการ (ตาราง + `FormDialog` ชื่อ/ความจุ/ใช้งาน; ปิดตัวที่มีนัดอนาคต = บล็อกพร้อมจำนวน) · `SectionCard` บริการ ↔ ผู้ให้บริการ (ตารางบริการจาก `GET /services` + multi-select resource; บริการที่ไม่มี `durationMinutes` ติดป้าย "ยังไม่ตั้งระยะเวลา ใช้จองไม่ได้" พร้อมลิงก์ `/catalog`) · `SectionCard` ปิดช่วงเวลา (รายการ + `FormDialog`) · เวลาเปิดร้าน/วันหยุดพิเศษ = ลิงก์ไป `/business` (F04 เป็นเจ้าของ ไม่ซ้ำที่นี่)
5. แท็บ **คิวรอ** (ซ่อนถ้า `waitlistEnabled=false` หรือ S4 ยังไม่ merge)
6. `useRealtime('custom', e => e.featureId==='F15' && refetch())`
7. states: loading (`DataTable loading`), ว่าง = `EmptyState` "ยังไม่มีนัดในช่วงนี้", error = `EmptyState` + ปุ่มลองใหม่ · ร้านปิดการจอง (`enabled=false`) = `Alert info` "ปิดรับจองผ่านแชตอยู่"

**Slot `chatComposerActions`** (`ChatBookingButton.tsx`, `{ slot:'chatComposerActions', id:'booking.new-from-chat', labelKey:'booking:chat.action', order:20, permission:'appointments.write', load }`, props `{ conversationId }`): ปุ่ม "นัดหมาย" เปิด `FormDialog` สร้างนัดสำหรับลูกค้าของแชตนั้น (ชื่อลูกค้าเติมจาก `getConversation`, เลือกบริการ → วัน → ช่วงเวลา จาก `GET /slots`) · `POST /appointments` ด้วย `conversationId` + `notifyCustomer` · `data-testid` `booking-chat-action`

`data-testid` สำคัญ: `appt-create`, `appt-row`, `appt-drawer`, `appt-cancel`, `appt-reschedule`, `appt-status-chip`, `slot-option`, `booking-chat-action`

i18n (namespace `booking`):

| key | th | en |
|---|---|---|
| `menu.title` | นัดหมาย | Appointments |
| `page.title` | นัดหมาย | Appointments |
| `tabs.list` | ตารางนัด | Schedule |
| `tabs.week` | ปฏิทินสัปดาห์ | Week view |
| `tabs.settings` | ตั้งค่า | Settings |
| `tabs.waitlist` | คิวรอ | Waitlist |
| `actions.create` | สร้างนัด | New appointment |
| `actions.reschedule` | เลื่อนนัด | Reschedule |
| `actions.cancel` | ยกเลิกนัด | Cancel appointment |
| `actions.complete` | เสร็จสิ้น | Mark completed |
| `actions.noShow` | ไม่มา | No-show |
| `actions.reopen` | แก้เป็นรอรับบริการ | Set back to booked |
| `actions.openChat` | เปิดแชต | Open chat |
| `list.time` | เวลา | Time |
| `list.customer` | ลูกค้า | Customer |
| `list.service` | บริการ | Service |
| `list.resource` | ผู้ให้บริการ | Resource |
| `list.status` | สถานะ | Status |
| `list.sync` | ปฏิทิน | Calendar |
| `list.empty` | ยังไม่มีนัดในช่วงนี้ | No appointments in this range |
| `range.today` | วันนี้ | Today |
| `range.week` | 7 วัน | 7 days |
| `range.month` | 30 วัน | 30 days |
| `status.booked` | จองแล้ว | Booked |
| `status.cancelled` | ยกเลิก | Cancelled |
| `status.completed` | เสร็จสิ้น | Completed |
| `status.no_show` | ไม่มา | No-show |
| `sync.not_configured` | ไม่ได้เชื่อมปฏิทิน | Not connected |
| `sync.pending` | รอซิงก์ | Pending |
| `sync.synced` | ซิงก์แล้ว | Synced |
| `sync.failed` | ซิงก์ล้มเหลว | Sync failed |
| `badge.overridden` | เขียนทับกฎ | Rules overridden |
| `form.service` | บริการ | Service |
| `form.resource` | ผู้ให้บริการ | Resource |
| `form.date` | วันที่ | Date |
| `form.slot` | ช่วงเวลา | Time slot |
| `form.customerName` | ชื่อลูกค้า | Customer name |
| `form.customerPhone` | เบอร์โทร | Phone |
| `form.note` | โน้ต | Note |
| `form.notify` | แจ้งลูกค้าในแชต | Notify the customer in chat |
| `form.override` | เขียนทับกฎ (นอกเวลา/เต็ม) | Override rules (outside hours / full) |
| `form.overrideReason` | เหตุผลที่เขียนทับ | Reason for override |
| `form.noSlots` | ไม่มีช่วงว่างในวันที่เลือก | No free slots on this date |
| `form.noDuration` | บริการนี้ยังไม่ตั้งระยะเวลา | This service has no duration yet |
| `form.created` | สร้างนัดแล้ว | Appointment created |
| `form.cutoffWarn` | เลยเวลาตัดสิทธิ์ของลูกค้าแล้ว (พนักงานทำได้) | Past the customer cutoff (staff may proceed) |
| `cancel.title` | ยกเลิกนัดนี้? | Cancel this appointment? |
| `cancel.reason` | เหตุผล (ไม่บังคับ) | Reason (optional) |
| `cancel.done` | ยกเลิกนัดแล้ว | Appointment cancelled |
| `error.SLOT_FULL` | ช่วงเวลานี้เต็มแล้ว | This slot is full |
| `error.VERSION_CONFLICT` | มีคนแก้นัดนี้ไปแล้ว โหลดใหม่ให้แล้ว | Someone changed this appointment. Reloaded |
| `error.cutoff_passed` | เลยเวลาที่ลูกค้าเลื่อน/ยกเลิกได้ | Past the customer cutoff |
| `error.not_started_yet` | นัดยังไม่ถึงเวลา | The appointment has not started |
| `detail.history` | ประวัติ | History |
| `detail.reminders` | การเตือน | Reminders |
| `detail.confirmFailed` | ส่งข้อความยืนยันถึงลูกค้าไม่สำเร็จ | The confirmation message could not be sent |
| `settings.title` | กฎการจอง | Booking rules |
| `settings.enabled` | เปิดรับจองผ่านแชต | Accept bookings via chat |
| `settings.granularity` | ความถี่ของช่วงเวลา (นาที) | Slot interval (minutes) |
| `settings.buffer` | เว้นช่วงหลังนัด (นาที) | Buffer after appointment (min) |
| `settings.leadTime` | จองล่วงหน้าอย่างน้อย (นาที) | Minimum notice (minutes) |
| `settings.horizon` | จองล่วงหน้าได้ไกลสุด (วัน) | Maximum advance (days) |
| `settings.cancelCutoff` | ลูกค้ายกเลิกได้ก่อนนัด (ชม.) | Customer can cancel until (hours before) |
| `settings.rescheduleCutoff` | ลูกค้าเลื่อนได้ก่อนนัด (ชม.) | Customer can reschedule until (hours before) |
| `settings.confirmTtl` | ใบสรุปการจองหมดอายุใน (นาที) | Booking card expires in (minutes) |
| `settings.reminders` | ส่งข้อความเตือนลูกค้า | Send reminders to customers |
| `settings.reminderMinutes` | เตือนก่อนนัด (นาที) | Remind before (minutes) |
| `settings.waitlist` | เปิดคิวรอ | Enable waitlist |
| `settings.hoursHint` | เวลาเปิดร้านและวันหยุดตั้งที่หน้าข้อมูลร้าน | Opening hours and closures are set on the business page |
| `settings.saved` | บันทึกการตั้งค่าแล้ว | Settings saved |
| `resources.title` | ผู้ให้บริการ | Resources |
| `resources.add` | เพิ่มผู้ให้บริการ | Add resource |
| `resources.capacity` | ความจุต่อช่วงเวลา | Capacity per slot |
| `resources.hasFuture` | ปิดไม่ได้ ยังมีนัดในอนาคต {{count}} รายการ | Cannot disable: {{count}} future appointments |
| `services.title` | บริการที่จองได้ | Bookable services |
| `services.noDuration` | ยังไม่ตั้งระยะเวลา ใช้จองไม่ได้ | No duration set: cannot be booked |
| `services.allResources` | ทุกผู้ให้บริการ | All resources |
| `blocks.title` | ปิดช่วงเวลา | Blocked time |
| `blocks.add` | ปิดช่วงเวลา | Block time |
| `blocks.overlaps` | ทับกับนัด {{count}} รายการ | Overlaps {{count}} appointments |
| `chat.action` | นัดหมาย | Book |
| `waitlist.title` | คิวรอ | Waitlist |
| `waitlist.add` | เพิ่มในคิวรอ | Add to waitlist |
| `common.retry` | ลองใหม่ | Retry |
| `common.closedChat` | ปิดรับจองผ่านแชตอยู่ | Chat booking is off |

## 8. Jobs, schedules, events

| รายการ | ค่า |
|---|---|
| Job `booking.notify` | payload `{ appointmentId, kind: 'created'\|'rescheduled'\|'cancelled'\|'declined', conversationId? }` · dedupKey `booking.notify:<appointmentId>:<kind>:v<version>` (declined: `booking.notify:<proposalId>:declined`) · lockKey `conversation:<conversationId>` · `maxAttempts: 3` สำหรับ error ก่อน `sendToCustomer` · หลังเรียก `sendToCustomer` ห้าม retry (state เขียนก่อนจบ job) |
| Job `booking.reminder` | payload `{ appointmentId, generation, minutesBefore }` · dedupKey `booking.reminder:<id>:<generation>:<m>` · `runAt = start − m` · lockKey `conversation:<conversationId>` · `maxAttempts: 3` (ก่อนส่ง) · งานรุ่นเก่าที่ยังอยู่ในคิวทำงานแล้วจบเงียบด้วย `skipped superseded` |
| Job `booking.waitlist` (S4) | ตาม §5.12 |
| Schedule `booking.repair` | `everySeconds: 120` · §5.5 ข้อ 13 |
| Schedule `booking.maintain` | `everySeconds: 300` · (1) ใบสรุป `open` ที่ `expires_at < now()` → `expired` (2) (S4) `waitlist.expire` |
| Realtime | `publish(businessId, { type:'custom', featureId:'F15', name:'booking.changed', data:{ appointmentId } })` ทุกการเปลี่ยนนัด/เตือน/ตั้งค่า |
| Audit | `booking.proposal.create` · `booking.appointment.create/reschedule/cancel/status` (`details` มี `source`, `overridden`, from/to เวลา ไม่มีเบอร์โทร) · `booking.settings.update` · `booking.resource.create/update` · `booking.block.create/delete` |
| notify (F31 §5.3) | `booking.created` (`to:{ permission:'appointments.read' }`, dedupKey `booking:<id>:created`) หลังจองสำเร็จ (ทุก source) · `booking.cancelled` (dedupKey `booking:<id>:cancelled`) หลังยกเลิก · ไม่แจ้งเมื่อเลื่อนหรือเมื่อลูกค้าปฏิเสธใบสรุป |
| `model_usage` | ไม่มี |

## 9. Seed และ fixtures

`server/src/features/booking/seed.ts` (`FeatureSeed`, `dependsOn: ['core','catalog']`, idempotent `ON CONFLICT DO NOTHING`; ใช้ id ตาม `SEED`):
- `booking_resources`: `SEED.resources` ทั้งสอง (A1 ของร้าน A = `…a9001`, B1 ของร้าน B = `…b9001`, ความจุ 1)
- `booking_service_resources`: A-SERVICE-01 (`item_a_service`) ↔ A1; B-SERVICE-01 (`item_b_service`) ↔ B1
- `booking_settings`: ร้าน A = ค่าเริ่ม + `reminders_enabled true` (เพื่อสาธิต) · ร้าน B = ค่าเริ่ม (ปิดเตือน)
- **ไม่ seed `appointments`** (SPEC: ไม่ seed นัด; slot 22 พ.ย. 10:00 ต้องว่างเพื่อให้ gate/test จองได้) · `SEED.slots` ใช้เป็นค่าคาดหวังของ test เท่านั้น ไม่ใช่ข้อมูลในตาราง
- หมายเหตุ fixture: `slot_b_1123_1000 (เดิม slot_b_1122_1000)` ใน SEED ตกวันอาทิตย์ ซึ่งร้าน B (จันทร์–เสาร์) ปิด · `findSlots(B)` จริงจึงไม่คืนช่วงนั้น (fake ของ contract คืนตาม SEED) · test ของร้าน B ใช้จันทร์ 23 พ.ย. 10:00 (`03:00Z`) แทน และใช้ช่วง SEED ของ B เป็น test ยืนยันว่า "ปิดวันอาทิตย์ → `SLOT_FULL closed`" — **แก้ใน contracts.ts แล้ว (v3): slot ทดสอบของร้าน B ย้ายเป็นวันจันทร์ 23 พ.ย. 10:00 เวลาไทย (`2026-11-23T03:00:00Z`) fake กับของจริงจึงตรงกัน**
- `runDemo(ctx)` (ร้าน A): นัดสังเคราะห์ `source 'demo'` (ไม่มี conversation จึงไม่ส่งข้อความ): 22 พ.ย. 11:00 "ลูกค้าเดโม 1" (booked) · 23 พ.ย. 14:00 "ลูกค้าเดโม 2" (booked) · 19 พ.ย. 15:00 "ลูกค้าเดโม 3" (completed) · 20 พ.ย. 13:00 "ลูกค้าเดโม 4" (cancelled) · **ไม่แตะ 22 พ.ย. 10:00** · เบอร์สังเคราะห์ `0800000001…`
- `resetDemo(ctx)`: ลบ `appointments` (cascade events/reminders), `booking_proposals`, `booking_receipts`, `booking_blocks`, `booking_waitlist` ของร้านเดโมทั้งสอง (ไม่ลบ settings/resources/mapping) แล้ว `runDemo` เติมใหม่ได้

Fixtures (สร้างด้วยโค้ดใน test): `CLOCK_FIXTURE` + `vi.useFakeTimers({ now, toFake: ['Date'] })` (ผ่าน helper `withClock`) · สร้างแชต/ลูกค้าด้วย `saveMessage` (ช่อง `web`, externalId `booking-test-<n>`) · `bridge` ปลอมใน test (`registerCalendarBridge({ isConnected, listBusy })`) · แต่ละ test ล้างตารางของ F15 ด้วย `resetDemo`-style helper · `sendToCustomer` ใช้ตัวจริงของ core (sender `web`) และตรวจแถว `messages` หรือใช้ `vi.spyOn`

## 10. Tests

Unit/service (`CLOCK_FIXTURE`):

| ไฟล์ | case |
|---|---|
| `time.test.ts` | `localToUtcMs('2026-11-22','10:00','Asia/Bangkok')` = `2026-11-22T03:00:00Z` · `localParts` วัน/weekday ถูก (22 พ.ย. 2026 = `sun`) · `Asia/Tokyo` และ `America/New_York` (ข้าม DST 2026-03-08) ได้ UTC ถูก · `formatLocal` ไทย `22 พ.ย. 2569 10:00` และ `withZone` ต่อท้าย `Asia/Bangkok` |
| `peak.test.ts` | ไม่ทับ = 0 · ติดกัน (จบ = เริ่ม) ไม่นับทับ · 10:00–10:30 กับ 10:15–10:45 ความจุ 2 → peak 2 ในหน้าต่าง 10:15–10:30 · สามนัดสลับ (A 10:00–10:40, B 10:20–11:00, C 10:50–11:30): peak 2 ที่ 10:20–10:40, หน้าต่าง 10:45–11:00 = peak 1 |
| `slots.test.ts` | **ค่าตรวจ SPEC §5**: ร้าน A 22 พ.ย. = 20 ช่วง ช่วงแรก `03:00:00.000Z`–`03:30:00.000Z` A1 remaining 1 `22 พ.ย. 2569 10:00` · ช่วงสุดท้าย `12:30Z` · 21 พ.ย. (วันนี้ 10:00 น.) ช่วงแรก 11:00 น. (lead 60 นาที) · ร้าน B อาทิตย์ = `[]` จันทร์ 09:00 = `02:00:00Z` · buffer 15 นาที: นัด 10:00–10:30 ทำให้ช่วง 10:30 ไม่ว่าง (occupied ถึง 10:45) และ 11:00 ว่าง · ความจุ 2 + หนึ่งนัด → remaining 1 · วันหยุดพิเศษ (ผ่าน `getBusinessOpenState` ปลอมคืน `closure`) = ข้ามวัน · block 10:00–12:00 ของ A1 ตัดช่วงที่ทับ · busy ภายนอก (bridge) 10:00–11:00 ตัดทุก resource ยกเว้นเมื่อ bridge throw (fail-open: ยังคืนช่วงนั้น) · horizon 60 วัน/lead ตัดถูก · หลาย resource: คืนหนึ่งช่วงต่อ `startAt` เลือก remaining มากสุด · `resourceId` ที่ไม่ให้บริการ service = `NOT_FOUND` · ไม่ใช่ service = `VALIDATION_ERROR` · `limit` 0 = `VALIDATION_ERROR` · ช่วงเกิน 31 วัน = `VALIDATION_ERROR` · ร้านอื่น: `findSlots(B, A-SERVICE-01)` = `NOT_FOUND` |
| `propose.test.ts` | propose สำเร็จได้ proposal + review (`localDisplay` มี `Asia/Bangkok`, expiresAt = now+15 นาที) และ **ไม่มีแถว `appointments`** · เวลาที่ไม่ใช่ slot (10:10) = `SLOT_FULL` `off_grid` · นอกเวลา 21:00 = `closed`/`SLOT_FULL` · ซ้ำ `clientRequestId` + payload เดิม = ใบเดิม (id/token เดียวกัน) · payload ต่าง = `IDEMPOTENCY_CONFLICT` · propose ใหม่ในแชตเดิม = ใบเก่า `superseded` · `answerPolicy.booking.enabled=false` = `POLICY_BLOCKED booking_disabled` · แชตของร้านอื่น = `NOT_FOUND` · slot เต็ม = `SLOT_FULL` + `details.alternatives` ≤ 3 |
| `confirm.test.ts` | confirm สำเร็จ: appointment + receipt + event + reminders (ร้าน A) + `externalSync.state='not_configured'` (bridge ไม่มี) / `'pending'` (bridge `isConnected=true`) · **ซ้ำ clientRequestId+payload เดิม → `replayed:true` นัดเดียวใน DB** · id เดิม payload ต่าง = `IDEMPOTENCY_CONFLICT` · token ผิด = `VALIDATION_ERROR bad_review_token` · version เก่า (มีใบใหม่) = `VERSION_CONFLICT superseded` · หมดอายุ (เลื่อนนาฬิกา +16 นาที) = `PROPOSAL_EXPIRED` · `decision 'cancel'` = ไม่มีนัด + ข้อความ declined · staff + confirm = `POLICY_BLOCKED staff_cannot_consent` · ยืนยันซ้ำคนละ clientRequestId หลัง confirmed = replay นัดเดิม · **หลังยืนยันมีข้อความจาก F15 หนึ่งข้อความในแชต (`origin 'system'`, `author 'ai'`, ข้อความมี `22 พ.ย. 2569 10:00`)** · `notify` ถูกเรียก `booking.created` หนึ่งครั้ง (dedupKey) · listener `onAppointmentChange` ถูกเรียก `created` หนึ่งครั้ง · listener ที่ throw ไม่ทำให้ confirm ล้ม |
| `race.test.ts` | **สอง confirm แข่ง `slot_a_1122_1000`** (หัวข้อ §5.6) 20 รอบ: booked = 1, อีกคน `SLOT_FULL` และได้ข้อความ "เต็ม" พร้อมช่วงแนะนำ · ความจุ 2: ทั้งคู่ได้ · สามคน ความจุ 2: 2+1 · ต่าง resource ไม่บล็อกกัน (สอง confirm ต่าง resource ไม่รอกันนานเกิน 500 ms) · reschedule แข่งกับ confirm ของช่วงเดียวกัน → หนึ่งชนะ |
| `mutations.test.ts` | reschedule: `version+1`, `reminder_generation+1`, ข้อมูลเวลาใหม่, reminders เก่า `skipped superseded`, event `rescheduled`, ข้อความ `rescheduled` ส่งถึงลูกค้า · ย้าย resource ล็อกสองคีย์ไม่ deadlock (รัน 20 รอบสลับทิศ) · reschedule นัด `cancelled` = `POLICY_BLOCKED not_booked` · version ผิด = `VERSION_CONFLICT` + `currentVersion` · cancel: `cancelled`, reminders `skipped cancelled`, notify `booking.cancelled` หนึ่งครั้ง, ยกเลิกซ้ำ = `POLICY_BLOCKED` · status completed ก่อนเริ่ม = `not_started_yet` · override ไม่มีสิทธิ์ `appointments.settings` = `PERMISSION_DENIED` · staff create ที่ไม่ override ในวันหยุด = `POLICY_BLOCKED closed_day`, override ได้ `overridden=true` + audit · staff create กดซ้ำ clientRequestId เดียวกัน = นัดเดียว · `proposeAppointmentChange` เลย cutoff = `POLICY_BLOCKED cutoff_passed` ก่อน cutoff ผ่านแล้ว confirm เลื่อน/ยกเลิกได้ |
| `reminders.test.ts` | ตัวอย่าง §5.11 ทุกข้อ (gen 1 เก่าไม่ส่ง, gen 2 ส่ง, ยกเลิกแล้วไม่ส่ง) · claim สองรอบพร้อมกัน = ส่งครั้งเดียว · Meta เกินหน้าต่าง = `skipped window_closed` · ไม่มี conversation = `skipped no_conversation` · `reminders_enabled=false` ตอนส่ง = `skipped disabled` · เลย `run_at` 31 นาที = `skipped past` · `sendToCustomer` throw → `failed` ไม่ retry · ข้อความ ≥ 720 นาทีกับ < 720 ต่างกัน |
| `repair.test.ts` | นัดที่ `confirmation_state='pending'` เกิน 60 วินาทีถูก enqueue ซ้ำและไม่ส่งข้อความซ้ำ (`clientRequestId` เดิม) · แถว reminder `pending` ไม่มี `job_id` ถูก enqueue |
| `routes.test.ts` | owner B เรียกนัด/resource/block ของ A ทุกเส้น = 404 · staff A (`STAFF_DEFAULT_PERMISSIONS`: มี `appointments.read/write`) สร้าง/เลื่อน/ยกเลิกได้, `PUT settings`/`POST resources`/override = 403 · `GET /slots` ตรงกับ `findSlots` · `PUT settings` ด้วย version เก่า = `VERSION_CONFLICT` · ปิด resource ที่มีนัดอนาคต = `POLICY_BLOCKED has_future_appointments` · block ทับนัด = `overlaps_appointments` (+ `force` ผ่าน) · cursor แบ่งหน้าครบไม่ซ้ำ |
| `contract.test.ts` | ชนิดและค่าที่คืนจาก `findSlots`/`createBooking` ตรง `SlotOption`/`CreateBookingResult` ใน `contracts.ts` (ตรวจ `Object.keys`) · `AppointmentSummary.externalSync` มีเฉพาะ `state` · เงื่อนไข `@fake` ของ contract (`SLOT_FULL` เมื่อ slot ไม่อยู่ในที่ว่าง) เป็นจริงในโหมดจริง |

Playwright smoke `web/src/features/booking/e2e/booking.smoke.spec.ts` (production-safe: marker `e2e-<ts>`, ใช้ช่วงวันที่ห่างจาก slot ตรวจของ gate: **ใช้ 24–28 พ.ย. ไม่ใช่ 22 พ.ย. 10:00**, ลบ/ยกเลิกนัดที่สร้างเอง):
1. `ownerPage` เปิด `/appointments` เห็นหัวข้อ + ตารางนัด · แท็บตั้งค่าเห็นผู้ให้บริการ A1 และบริการ A-SERVICE-01 (ระยะ 30 นาที)
2. เปิด `/demo-chat/s/demo-boardgame` ถามว่า `พรุ่งนี้... ขอจองสอนเล่นเกม (e2e-<ts>) วันที่ <วันที่ถัดไป+3>` (ข้อความ + วันที่แบบ `YYYY-MM-DD`) รอ AI ตอบ (โมเดลจริง) เห็นการ์ด `booking_review` (ปุ่มยืนยัน) · ถ้า AI ยังไม่ถึงขั้นเสนอการ์ดภายใน 60 วินาที (พฤติกรรมโมเดลไม่แน่นอน) ให้ใช้เส้นทาง API ตรง: `api` fixture `createBooking` ผ่าน route ทดสอบไม่มี → เส้นทางสำรอง = สร้างนัดผ่าน dialog ของพนักงาน (ข้อ 4) และบันทึกใน EVIDENCE.md ว่าไม่ได้ทดสอบผ่าน AI
3. กดปุ่มยืนยันในการ์ด (`demo-chat` UI ของ F09) → เห็นข้อความ "จองเรียบร้อยแล้วค่ะ" (`demo-chat-message` `data-author="ai"`) · `/appointments` เห็นแถวนัดนั้น สถานะ "จองแล้ว"
4. พนักงาน: ปุ่ม "สร้างนัด" (`appt-create`) เลือก A-SERVICE-01 วันถัดไป+4 ช่วง 14:00 กรอกชื่อ `e2e-<ts>` → เห็นแถว · เปิดแถว → "เลื่อนนัด" ไป 15:00 → แถวแสดงเวลาใหม่ · "ยกเลิกนัด" → สถานะ "ยกเลิก"
5. cleanup: ยกเลิกนัดที่ยัง `booked` ที่มี marker (ผ่านปุ่มยกเลิก)
6. (ไม่ทำใน smoke) เตือน 24 ชม./2 ชม. จริง · race จริง · ครอบด้วย unit test

## 11. Acceptance: R ตาม D6

- [ ] `findSlots` และ `createBooking` (propose/confirm) เป็นของจริงบน production ตรง signature · `@fake` ถูกแทนที่ · โพสต์ `DONE F15 … TO:B2` ทันทีหลัง slice S1 · F10 `find_slots` ได้ 22 พ.ย. 10:00 `A1` และ `propose_booking` ได้การ์ดจริงบน Demo Chat (G12 ของ F10)
- [ ] **race:** สอง confirm พร้อมกันของ 22 พ.ย. 10:00–10:30 (ความจุ 1) → นัดเดียว อีกคน `SLOT_FULL` (test จริงกับ Postgres ไม่ใช่ mock) และไม่มีนัดซ้อนในตาราง
- [ ] `propose` ไม่สร้างนัด · confirm ซ้ำ clientRequestId เดิม = `replayed:true` · หมดอายุ = `PROPOSAL_EXPIRED` · ลูกค้าได้ข้อความยืนยันจาก F15 (ผ่าน `sendToCustomer`) ข้อความเดียว
- [ ] `findSlots` เคารพเวลาเปิด (A 10:00–20:00, B จันทร์–เสาร์ 09:00–18:00), วันหยุดพิเศษของ F04, lead/horizon, buffer, ความจุ, block · เก็บ UTC แสดง "22 พ.ย. 2569 10:00"
- [ ] reschedule/cancel: `version` เพิ่ม, `reminder_generation` เพิ่ม, reminder รุ่นเก่าไม่ส่ง, ลูกค้าได้ข้อความ, staff ได้ `notify` ตามตาราง F31
- [ ] เตือน: เปิดแล้วลูกค้าได้ข้อความจริงใน Demo Chat (ทดสอบด้วยนัดใกล้เวลา: staff สร้างนัด +130 นาที, เตือน 120 นาทีถูกส่งทันทีที่ถึงเวลา: ใช้ `reminder_minutes` 120 บนร้านทดสอบ) · LINE/Meta จริงตามสถานะ C2 (ไม่งั้น reminders ส่งผ่าน sender sandbox = S)
- [ ] หน้า `/appointments` ใช้งานจริงครบ (ตาราง, ปฏิทินสัปดาห์, สร้าง/เลื่อน/ยกเลิก, ตั้งค่า, ผู้ให้บริการ, block) · slot ปุ่มนัดหมายในแชต
- [ ] ตรวจ tenant + permission + audit ตามตาราง (route test) · i18n th/en · loading/empty/error · Playwright smoke ผ่านบน production
- [ ] export ให้ F16 ใช้งานได้จริง (`onAppointmentChange`, `registerCalendarBridge`, `setExternalSyncState`) พร้อม test ของ F15 เอง (F16 ยังไม่ต้องมี)
- **S**: เตือนส่งผ่าน sender sandbox ของ LINE/Meta (ช่อง web จริงยังนับ R ของ F15 ถ้าผ่านครบข้างบน) · **A**: มีแค่ `findSlots`/`createBooking` (S1) ยังไม่มี UI · waitlist เป็น U ได้ (ไม่ลด R) · ไม่ถึง R ตอน 15:30 → ซ่อน `/appointments` ด้วย feature flag แต่ **ต้องไม่ปล่อย `createBooking` ที่ confirm ไม่ได้ในขณะที่ F10 ยังเสนอการ์ด**: ถ้า confirm ยังเป็น `SERVICE_NOT_READY` ให้ปิด `booking.enabled` ใน seed ของ production (ผ่าน `getEffectiveAnswerRules`) เพื่อไม่ให้ AI เสนอจอง

## 12. Security และ privacy

- Tenant: ทุก query กรอง `business_id`; `appointmentId`/`resourceId`/`proposalId`/`blockId` จาก path/body ตรวจว่าเป็นของ business เดียวกัน (ไม่ใช่ = `NOT_FOUND` 404 ไม่ใช่ 403) · `conversationId` ของ confirm ตรวจกับ `getConversation(id, { businessId })` · ใบสรุปต้องตรง `conversation_id` ของผู้กด
- **การยินยอม:** ไม่มีนัดเกิดก่อนที่ลูกค้ากดปุ่ม · ข้อความของโมเดลหรือลูกค้าที่บอกว่า "ยืนยัน" ไม่ใช่ consent (ต้องเป็น `stage:'confirm'` ที่มี `reviewToken` + `proposalId` + `version` ตรง) · F10 เรียกได้แค่ propose · พนักงานยืนยันแทนลูกค้าไม่ได้ (§5.5 ข้อ 4)
- Permission: ตามตาราง §3 (`appointments.read/write/settings`) · override ต้อง `appointments.settings` + เหตุผล + audit · ค่า `businessId` มาจาก session ไม่รับจาก body
- PII: `customer_name`, `customer_phone` ใน `appointments` เป็นข้อมูลส่วนบุคคล: **ไม่ลง log, ไม่ลง audit details, ไม่ลงข้อความ notify (ใช้บริการ+เวลา; ชื่อลูกค้าไม่ใส่ใน title/body ของ notify ถ้าไม่จำเป็น: ใส่ชื่อเฉพาะใน `body` สำหรับสมาชิกที่เห็นได้ผ่าน `appointments.read` อยู่แล้ว)**, ไม่ส่งไปที่ Google (F16 ส่งเฉพาะชื่อลูกค้า ไม่ส่งเบอร์) · เบอร์โทรไม่ปรากฏในการ์ด/ข้อความถึงลูกค้า · `appointment_events.detail` ห้ามมีเบอร์
- ข้อความอัตโนมัติถึงลูกค้ามาจาก template คงที่ (ไม่มีข้อความลูกค้าสะท้อนกลับ ยกเว้นชื่อบริการ/ผู้ให้บริการที่ร้านตั้งเอง) → ไม่เปิดช่อง injection
- `reviewToken` เทียบ constant-time · token ไม่ใช่ความลับของระบบ (อยู่ในการ์ด) แต่ผูกกับ proposal + conversation
- Rate limit: ไม่มี route สาธารณะ · confirm มาจาก F09 action route/C2 postback ซึ่งมี rate limit ของตัวเอง
- ห้าม log: ชื่อ/เบอร์ลูกค้า, ข้อความลูกค้า · log ใช้ id เท่านั้น

## 13. Edge cases

| กรณี | ผลที่ต้องได้ |
|---|---|
| ลูกค้ากดยืนยันสองครั้ง (คนละ clientRequestId) | นัดเดียว คืนนัดเดิม `replayed:true` ไม่ส่งข้อความซ้ำ |
| ลูกค้ากดยืนยันใบเก่าหลังมีใบใหม่ | `VERSION_CONFLICT` (`superseded`, `latestProposalId`) |
| ร้านปิดวันที่เลือกระหว่างรอลูกค้ายืนยัน (เพิ่มวันหยุด F04) | confirm ตรวจซ้ำ → `SLOT_FULL` `closed` + เสนอช่วงใกล้เคียง |
| เวลานัดข้ามคืนไม่ได้ (ปิด 20:00 นัด 19:45 ยาว 30 นาที) | ไม่เสนอ (`E ≤ winEnd`) |
| ร้านมีช่วงพักกลางวัน (hours สองช่วง 10:00–12:00 และ 13:00–20:00) | slot ไม่ข้ามช่วงพัก และ grid ช่วงที่สองเริ่ม 13:00 |
| service เปลี่ยนระยะเวลาหลังมีนัด | นัดเดิมคงเวลา (เก็บ `start_at/end_at/buffer_min` จริง) · ใบสรุปใหม่ใช้ระยะใหม่ |
| ชื่อ service เปลี่ยน | นัดเก่ายังแสดง `service_name` snapshot |
| resource ถูกปิดใช้งานที่มีนัดอนาคต | บล็อกด้วย `has_future_appointments` (ต้องเลื่อน/ยกเลิกก่อน) |
| ความจุลดจาก 2 เป็น 1 ที่ช่วงมีนัดสองนัดอยู่แล้ว | นัดเดิมคงอยู่ (ไม่ยกเลิกอัตโนมัติ) · ช่วงนั้นถูกมองว่าเต็มจนกว่าจะเหลือ < ความจุใหม่ · UI เตือนตอนบันทึก |
| lead time = 0 และขอเวลาที่เพิ่งผ่านไป 1 นาที | `too_soon` (ต้อง `S ≥ now + lead`) |
| นาฬิกาเซิร์ฟเวอร์เลื่อน/job รันช้าเกิน 30 นาที | reminder ข้าม `past` (ไม่เตือนย้อน) |
| ลูกค้าอยู่ Messenger/Instagram นัดอีก 3 วัน | reminder 24 ชม. อาจเกินหน้าต่าง 24 ชม. → `skipped window_closed` (UI แสดงเหตุผลในรายละเอียดนัด) |
| conversation ถูกลบ (SET NULL) | นัดคงอยู่ ไม่ส่งข้อความ/เตือน (`no_conversation`) |
| ปิดเตือนระหว่างมีแถว pending | job ตรวจ `reminders_enabled` ตอนส่ง → `skipped disabled` |
| นัดที่ F16 ซิงก์ล้มเหลว | `externalSync.state='failed'` นัดยังอยู่ครบ ใช้งานต่อได้ (F16 §5) |
| ผู้ใช้เลื่อนนัดไปเวลาเดิม | `VALIDATION_ERROR` (`no_change`) |
| สองพนักงานแก้นัดเดียวกันพร้อมกัน | คนที่สองได้ `VERSION_CONFLICT` + ค่าปัจจุบัน |
| `GET /slots` ขณะ Google ล่ม | คืนผลโดยไม่มี busy (fail-open) + header ข้อความเตือนใน UI (`busyUnavailable: true` ใน response meta ของ route นี้เท่านั้น) |
| กดยืนยันในการ์ดของร้านอื่น (ส่ง proposalId มั่ว) | `NOT_FOUND` |

## 14. Build order (slices ≤ 45 นาที)

| Slice | เวลา | ส่งมอบ |
|---|---|---|
| **S1 findSlots + createBooking (B2 รอ)** | 45 | migration `001` ทั้งไฟล์ · `time.ts`, `slots.ts` (+`peak`) · `proposals.ts`, `confirm.ts` ครบทั้ง idempotency/ความจุ/ข้อความยืนยัน (`booking.notify` ขั้นต่ำ) · seed resources/mapping/settings · tests: time, peak, slots (ค่าตรวจ SPEC §5), propose, confirm, race · **DONE → TO:B2** (ตัด fake ของ `findSlots`/`createBooking`) |
| **S2 หน้า `/appointments` + staff** | 45 | routes list/detail/create/reschedule/cancel/status/slots/services/settings/resources/blocks · `mutations.ts` · หน้า (ตารางนัด + dialog + ตั้งค่า) + ปุ่มในแชต (slot) · notify `booking.created/cancelled` · tests mutations, routes |
| **S3 reminders + repair + export สำหรับ F16** | 35 | `reminders.ts`, jobs `booking.reminder`, schedules `booking.repair` `booking.maintain` · `onAppointmentChange`, `registerCalendarBridge`, `setExternalSyncState`, `getAppointmentRecord`, `listAppointmentsNeedingSync`, `countAppointmentsByCustomers` · `proposeAppointmentChange` + test · ปฏิทินสัปดาห์ · runDemo/resetDemo · Playwright smoke + EVIDENCE.md |
| **S4 waitlist (ถ้าทัน)** | 35 | migration `002_waitlist.sql`, `waitlist.ts`, routes + แท็บ, job/schedule · tests |

ลำดับ: S1 คือสิ่งที่ B2 (F10 tools G12) และ F16 รอ · ถ้าเวลาไม่พอ ตัด S4 และ `proposeAppointmentChange` (ไม่มีผู้เรียก) ไปเป็น U โดยจดใน EVIDENCE.md

## 15. UNCONFIRMED และสิ่งที่ต้องตรวจในวันงาน

1. **`getBusinessOpenState` กับวันหยุดพิเศษ:** spec นี้พึ่งว่า F04 คืน `reason:'closure'` ก่อนตรวจเวลาเปิด (F04 §5.8 ข้อ 2) และ instant ใดก็ได้ในวันนั้นให้ผลเดียว · ตรวจกับ F04 ที่ merge แล้ว ถ้าไม่ตรง → `NEED TO:C3` ขอฟังก์ชัน `listClosuresBetween` หรือให้ F04 ส่งออก `isClosureDay(businessId, localDate)`
2. **ปฏิทิน fixture ของ SEED ร้าน B:** `slot_b_1123_1000 (เดิม slot_b_1122_1000)` ตกวันอาทิตย์ที่ร้าน B ปิด (`HOURS_B_MON_SAT_09_18`) ขัดกันเอง · ตรวจกับหัวหน้า (แก้ SEED เป็น 23 พ.ย. หรือยอมให้ fake คืนต่างจากของจริง) · test ของเราไม่พึ่งช่วงนั้นสำหรับร้าน B — **แก้ใน contracts.ts แล้ว (v3): slot ทดสอบของร้าน B ย้ายเป็นวันจันทร์ 23 พ.ย. 10:00 เวลาไทย (`2026-11-23T03:00:00Z`) fake กับของจริงจึงตรงกัน**
3. **F10 ไม่มี tool เลื่อน/ยกเลิก:** ลูกค้าที่ขอเลื่อน/ยกเลิกผ่านแชตจะถูกส่งต่อพนักงาน · ถ้าหัวหน้าต้องการให้ AI ทำเอง ต้อง `CHANGE TO:B2` เพิ่ม tool `propose_booking_change` เรียก `proposeAppointmentChange` (พร้อมแล้วใน F15; แต่ F09 action route รับเฉพาะ part `booking_review` ที่ `proposalId` ตรง ซึ่งใช้ได้เหมือนเดิม) · วันนี้ยังไม่มี
4. **F09 action route / C2 postback ส่ง `stage:'confirm'` ด้วย `actor { kind:'customer' }` และ `conversationId` ตรงกับใบสรุป:** ตรวจกับ F09 §5 (Demo Chat) และ F17 (LINE postback `confirm_proposal`) · ถ้า C2 ยังไม่ต่อ, ปุ่มบน LINE ไม่ทำงานจนกว่าจะต่อ (ไม่ใช่งานของ F15)
5. **`sendToCustomer` กับ conversation ที่ปิดแล้ว:** ไม่ชัดจาก contract (ปิดบล็อกเฉพาะทาง staff ใน F09) · ตรวจตอน S1: ส่งไปแชตปิดแล้วต้องสำเร็จหรือล้มชัดเจน · ถ้าล้ม reminder/ยืนยันจะเป็น `failed` และ UI แจ้งพนักงาน (ยอมรับได้)
6. **ข้อความเตือนผ่าน LINE ใช้ Push เมื่อ reply token หมด (ใช้โควตา OA)** และ Meta ต้องอยู่ในหน้าต่าง 24 ชม. (ไม่ใช้ message tag): ตรวจกับ C2 (`providerMeta.windowExpiresAt` หรือ `lastInboundAt`) · ค่าโควตา LINE ขึ้นกับแพ็กเกจ OA ของร้าน: UNCONFIRMED
7. **`listCatalogItems`/`getProduct` ส่ง `durationMinutes` ของ service จริง:** ตรวจกับ F08 ที่ merge แล้ว (ร้าน A: 30) · `kind='service'` เท่านั้นจองได้
8. **`pg_advisory_xact_lock(hashtextextended(text, bigint))`:** มีใน PostgreSQL 11+ (production = PG 17) · ตรวจ `db.tx` ของ core ว่า statement นี้รันบนการเชื่อมต่อเดียวกับ INSERT (ปกติใช่) และ `statement_timeout 10s` ไม่ตัดกลางเมื่อมีคนแข่งมาก
9. **สิทธิ์ `appointments.settings` สำหรับ override และตั้งค่า** (staff ค่าเริ่ม = off): ตัดสินใจโดย spec นี้ ไม่มีคีย์ใหม่ · ตรวจกับเจ้าของวันงานว่าต้องการให้ staff override ได้หรือไม่ (เปิดคีย์ให้ทีมได้ในหน้าทีม)
10. **ภาษาอังกฤษของข้อความอัตโนมัติ** ใช้ตามภาษาที่ลูกค้าพิมพ์ (`getCustomerLanguage`) ไม่ขึ้นกับภาษาร้าน (แก้ 21 พ.ย.) · ข้อความ en ในตารางท้าย §5 เขียนไว้แล้ว: ให้คนในทีมอ่านผ่านหนึ่งรอบก่อนโชว์กรรมการ
11. **Playwright smoke ข้อ 2 (AI เสนอการ์ดจองเอง)** พึ่งพฤติกรรมโมเดลจริง: ถ้าไม่เสถียร ใช้เส้นทางพนักงานเป็นหลักและบันทึกใน EVIDENCE.md ตามที่ระบุ
