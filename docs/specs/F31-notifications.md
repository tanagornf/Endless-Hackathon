# F31 notifications — กระดิ่งแจ้งเตือน การตั้งค่า และ web push

| | |
|---|---|
| Lane / คน | **C3** / **C** · ลำดับ 4 (สุดท้าย) ใน lane (F04 → F03 → F02 → F31) |
| Tier / เป้า | **P1** สำหรับ slice 1 (`notify()` จริง + กระดิ่งในแอป · ย้ายจาก P2 เมื่อ 21 พ.ย. ตามข้อเสนอ Endless) · slice 2–4 (ตั้งค่า, web push, smoke ของ push) ยังเป็นงาน **P2** · เป้า **R** สำหรับ in-app (กระดิ่ง) · **web push = R เฉพาะเมื่อมี push จริงถึงเบราว์เซอร์จริงและบันทึก ack ได้** มิฉะนั้นรายงาน **S** |
| Timebox | 30–75 นาที |
| เริ่มเมื่อ | slice 1: หัวหน้าโพสต์ `LEAD: OPEN P1` (ต่อจาก F02 ตามลำดับ lane · C0 หรือหัวหน้าสั่งให้ทำก่อน slice ที่เหลือของ F02 ได้ด้วย `TASK`) · slice 2–4: `LEAD: OPEN P2` |
| พึ่ง | core: `publish`, `jobs`, `schedules`, `db`, `audit`, `encryptSecret`/`decryptSecret`, `config` (VAPID_*) · ตารางกลาง `memberships`, `users`, `businesses` (อ่านเพื่อหาผู้รับ) · library `web-push` 3.6.7 (อยู่ในรายการ F01 S1 แล้ว) |
| ให้ | `notify(input: NotifyInput)` (contracts.ts · **ทุก lane เรียก**) · bell ใน top bar (slot `topbarActions`) · หน้า `/notifications` |
| ใช้ | ดู §4 |
| โฟลเดอร์ | `server/src/features/notifications/` · `shared/features/notifications/types.ts` · `web/src/features/notifications/` |
| Web path | `/notifications` (เมนูกลุ่ม `home`) |

อ่าน: `contracts.ts` (`NotifyInput`, `notify`, `RealtimeEvent` `notification.created`, slot `topbarActions`, `PERMISSIONS`) · [F01-core](F01-core.md) §4 (realtime.ts `publish`, jobs, schedules) · [F11](F11-team.md) §5.4–5.6 (ผู้เรียกหลัก) · [COOKBOOK](../COOKBOOK.md) §6, §9, §14

## 1. เป้าหมายและ user stories

ทำไมมี: เหตุการณ์ที่ต้องมีคนทำต่อ (ลูกค้าขอคุยกับคน ออเดอร์ใหม่ สลิปไม่ผ่าน งานนำเข้าเสร็จ) เกิดตอนเจ้าของร้านไม่ได้เปิดหน้านั้นอยู่ ถ้าไม่มีกระดิ่งและ push ร้านจะตอบช้าและเสียยอด · ทุก lane เรียก `notify()` จึงต้อง **ไม่ throw, ไม่ซ้ำ, ไม่ข้าม tenant, ไม่ทำให้ flow ของผู้เรียกล้ม**

ผู้ใช้: เจ้าของและพนักงานของร้าน (แต่ละคนเห็นเฉพาะแจ้งเตือนที่ส่งถึงตัวเองและที่ตัวเองมีสิทธิ์เห็น)

User stories:
1. มีเหตุการณ์ (เช่น ลูกค้าขอคุยกับคน) → ผู้มีสิทธิ์เห็นเลขแดงบนกระดิ่งภายในไม่กี่วินาที (realtime) กดแล้วไปหน้าที่เกี่ยวข้อง และรายการถูกทำเครื่องหมายอ่านแล้ว
2. ผู้ใช้ทำเครื่องหมายอ่านทีละรายการหรืออ่านทั้งหมด แล้ว reload ยังเป็นอ่านแล้ว
3. ผู้ใช้ตั้งค่าได้ว่าแจ้งเตือนชนิดไหนให้ขึ้นในแอปและชนิดไหนให้ส่ง push
4. ผู้ใช้เปิด push บนเบราว์เซอร์นี้ กดส่งทดสอบแล้วเห็นการแจ้งเตือนของระบบปฏิบัติการจริง · ถ้าเบราว์เซอร์ปฏิเสธ กระดิ่งยังทำงานตามปกติ
5. staff ที่ไม่มี `chat.read` ไม่เห็นแจ้งเตือนชนิดแชต · ผู้ใช้ร้าน A ไม่เห็นของร้าน B
6. ผู้เรียก `notify()` เรียกซ้ำด้วย `dedupKey` เดิมแล้วไม่เกิดแจ้งเตือนซ้ำ

นอก scope: อีเมล/SMS/LINE แจ้งเตือนเจ้าของ, quiet hours, สรุปรายวัน (digest), snooze, เสียง, แจ้งเตือนถึงลูกค้า (นั่นคือ `sendToCustomer`), ประวัติเกิน 180 วัน, push บน iOS Safari ที่ไม่ได้ติดตั้งเป็น PWA

## 2. Data model

`server/src/features/notifications/migrations/001_notifications.sql`:

```sql
-- dependsOn: core
CREATE TABLE notifications (                          -- หนึ่งแถวต่อผู้รับต่อเหตุการณ์ (fan-out ตอนเขียน)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('chat.handoff','chat.mention','order.created','payment.verifying',
    'booking.created','booking.cancelled','invitation','report','system')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  body text CHECK (body IS NULL OR char_length(body) <= 1000),
  link text CHECK (link IS NULL OR (left(link, 1) = '/' AND left(link, 2) <> '//' AND char_length(link) <= 500)),
  dedup_key text CHECK (dedup_key IS NULL OR char_length(dedup_key) <= 200),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX notifications_dedup ON notifications (user_id, dedup_key) WHERE dedup_key IS NOT NULL;
CREATE INDEX notifications_feed ON notifications (user_id, business_id, created_at DESC, id DESC);
CREATE INDEX notifications_unread ON notifications (user_id, business_id) WHERE read_at IS NULL;

CREATE TABLE notification_preferences (               -- ต่อผู้ใช้ ต่อชนิด (ทุกร้านใช้ค่าเดียวกัน) · ไม่มีแถว = ค่าเริ่มต้นใน defaults.ts
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('chat.handoff','chat.mention','order.created','payment.verifying',
    'booking.created','booking.cancelled','invitation','report','system')),
  in_app boolean NOT NULL,
  push boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, type)
);

CREATE TABLE push_subscriptions (                     -- หนึ่งแถวต่อ endpoint (เบราว์เซอร์/เครื่อง)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE CHECK (char_length(endpoint) <= 1000),
  p256dh_enc text NOT NULL,                           -- encryptSecret(...) ไม่เก็บ plain
  auth_enc text NOT NULL,                             -- encryptSecret(...)
  user_agent text CHECK (user_agent IS NULL OR char_length(user_agent) <= 300),
  failure_count int NOT NULL DEFAULT 0,
  last_accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX push_subscriptions_user ON push_subscriptions (user_id);

CREATE TABLE push_deliveries (                        -- หลักฐานของ push: 'accepted' = บริการ push รับแล้ว (ไม่ใช่ถึงเครื่อง) · acked_at = เครื่องแสดงผลแล้ว
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid REFERENCES notifications(id) ON DELETE CASCADE,   -- null = push ทดสอบจากหน้าตั้งค่า
  subscription_id uuid REFERENCES push_subscriptions(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ref text NOT NULL,                                  -- id ที่ใส่ใน payload ให้ service worker ส่งกลับมา ack (uuid สุ่มต่อการส่ง)
  state text NOT NULL CHECK (state IN ('accepted','gone','failed')),
  status_code int,
  error text CHECK (error IS NULL OR char_length(error) <= 300),
  acked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX push_deliveries_ref ON push_deliveries (ref);
CREATE UNIQUE INDEX push_deliveries_once ON push_deliveries (notification_id, subscription_id) WHERE state = 'accepted' AND notification_id IS NOT NULL;
CREATE INDEX push_deliveries_user ON push_deliveries (user_id, created_at DESC);
```

กฎ:
- `notifications.title/body` เก็บ **ข้อความที่ผู้เรียกส่งมา** (ผู้เรียกเลือก title ตาม **ภาษาของร้าน** `getBusinessSettings(businessId).language` จากคอลัมน์ th / en ของตาราง §5.3: ร้านที่ตั้งภาษาอังกฤษได้แจ้งเตือนอังกฤษ · F31 ไม่แปลข้อความที่เก็บแล้ว แต่ bell และหน้ารายการแสดงป้ายชนิด `type.*` ตามภาษา UI ของผู้ใช้เสมอ จึงอ่านออกทั้งสองภาษา · แก้ 21 พ.ย. เดิมเขียนว่าไทยเป็นค่าเริ่มต้น) · ไม่มีคอลัมน์ `resolved_at` (ไม่มีฟีเจอร์ใดใช้)
- `dedup_key` unique ต่อ `(user_id, dedup_key)`: ผู้เรียกประกอบจาก **id ของเหตุการณ์ ไม่ใช่เวลา** · ไม่ส่ง `dedupKey` = ไม่ dedup
- ข้อมูลหมดอายุ (§8): อ่านแล้วเกิน 90 วัน หรือเก่ากว่า 180 วัน ถูกลบ
- ค่าเริ่มต้นของการตั้งค่า (`defaults.ts` `PREF_DEFAULTS`): `chat.handoff` in_app ✔ push ✔ · `chat.mention` ✔ ✔ · `order.created` ✔ ✔ · `payment.verifying` ✔ ✘ · `booking.created` ✔ ✘ · `booking.cancelled` ✔ ✘ · `invitation` ✔ ✘ · `report` ✔ ✘ · `system` ✔ ✔ · **`system` ปิด in-app ไม่ได้** (`forcedInApp`)
- สิทธิ์ที่ต้องมีเพื่อ **เห็น** แต่ละชนิด (`TYPE_PERMISSION`, owner เห็นทุกชนิด): `chat.handoff`,`chat.mention` → `chat.read` · `order.created`,`payment.verifying` → `orders.read` · `booking.created`,`booking.cancelled` → `appointments.read` · `invitation`,`report`,`system` → `business.read`

## 3. API endpoints

ทุก path ใต้ `/api/v1` · `defineFeatureRoutes({ featureId: 'F31', slug: 'notifications' })` · อ่านได้เฉพาะแถวของ **ผู้เรียกเอง** (`user_id = ctx.user.id`) เสมอ

| Method | Path | auth | permission | Request | Response | Errors |
|---|---|---|---|---|---|---|
| GET | `/businesses/:businessId/notifications` | business | — (สมาชิกทุกคน) | `FeedQuery` | `NotificationFeed` | VALIDATION_ERROR |
| GET | `/businesses/:businessId/notifications/unread-count` | business | — | — | `{ count: number; elsewhere: number }` | — |
| POST | `/businesses/:businessId/notifications/read` | business | — | `ReadBody` | `{ updated: number }` | VALIDATION_ERROR |
| POST | `/businesses/:businessId/notifications/test` | business | — | — | `{ notificationId: string \| null }` | RATE_LIMITED |
| GET | `/notification-preferences` | user | — | — | `{ items: PreferenceRow[] }` | — |
| PUT | `/notification-preferences` | user | — | `PreferencesBody` | `{ items: PreferenceRow[] }` | VALIDATION_ERROR |
| GET | `/notifications/push/status` | user | — | — | `PushStatus` | — |
| POST | `/notifications/push/subscribe` | user | — | `SubscribeBody` | `{ ok: true }` | VALIDATION_ERROR, POLICY_BLOCKED, RATE_LIMITED |
| POST | `/notifications/push/unsubscribe` | user | — | `{ endpoint }` | `{ ok: true }` | VALIDATION_ERROR |
| POST | `/notifications/push/ack` | user | — | `{ ref }` | `{ ok: true }` | VALIDATION_ERROR |
| POST | `/notifications/push/test` | user | — | — | `PushTestResult` | POLICY_BLOCKED, RATE_LIMITED |
| GET | `/notifications/sw.js` | none | — | — | file `text/javascript` | — |

หมายเหตุ: ไม่มีเส้น HTTP สำหรับ "สร้าง" แจ้งเตือนจากภายนอก (สร้างได้ทาง `notify()` ฝั่ง server เท่านั้น) ยกเว้น `/test` ที่ส่งถึง **ตัวเอง** ชนิด `system` · `unread-count` ใช้เป็น fallback เมื่อ WebSocket หลุด (poll ทุก 120 วินาที)

```ts
import { z } from 'zod';
const NotificationType = z.enum(['chat.handoff','chat.mention','order.created','payment.verifying','booking.created','booking.cancelled','invitation','report','system']);
export const FeedQuery = z.object({
  cursor: z.string().max(200).optional(),                     // base64url(JSON { createdAt, id })
  limit: z.coerce.number().int().min(1).max(100).default(30),
  unread: z.enum(['true']).optional(),
});
export const ReadBody = z.union([
  z.object({ ids: z.array(z.string().uuid()).min(1).max(100) }).strict(),
  z.object({ all: z.literal(true) }).strict(),
]);
export const PreferencesBody = z.object({
  items: z.array(z.object({ type: NotificationType, inApp: z.boolean(), push: z.boolean() }).strict()).min(1).max(9),
}).strict();                                                  // type ซ้ำ = 400 · system.inApp = false = 400
export const SubscribeBody = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) }).strict(),
  userAgent: z.string().max(300).optional(),
}).strict();
export const NotifyInputSchema = z.object({                   // ตรวจที่ต้นของ notify(): ผิดรูป = VALIDATION_ERROR (กรณีเดียวที่ notify throw)
  businessId: z.string().uuid(),
  to: z.union([
    z.object({ userIds: z.array(z.string().uuid()).min(1).max(200) }).strict(),
    z.object({ role: z.literal('owners') }).strict(),
    z.object({ permission: z.string().max(64) }).strict(),    // ต้องเป็น key ใน PERMISSIONS (เช็กต่อในโค้ด)
  ]),
  type: NotificationType,
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().max(1000).optional(),
  link: z.string().max(500).regex(/^\/(?!\/)\S*$/).optional(), // path ภายในแอปเท่านั้น
  dedupKey: z.string().min(1).max(200).optional(),
}).strict();
```

```ts
// shared/features/notifications/types.ts  (NotifyInput และผลของ notify ตาม contracts.ts: re-export ห้ามประกาศซ้ำ)
export type NotificationType = 'chat.handoff' | 'chat.mention' | 'order.created' | 'payment.verifying'
  | 'booking.created' | 'booking.cancelled' | 'invitation' | 'report' | 'system';
export interface NotificationItem {
  id: string; type: NotificationType; title: string; body: string | null; link: string | null;
  read: boolean; readAt: string | null; createdAt: string;
}
export interface NotificationFeed {
  items: NotificationItem[]; nextCursor: string | null;
  unreadCount: number;          // ของร้านที่เลือก (นับเฉพาะชนิดที่ผู้เรียกมีสิทธิ์เห็น)
  unreadElsewhere: number;      // ของร้านอื่นที่ผู้เรียกเป็นสมาชิก active (กรองสิทธิ์แล้ว)
}
export interface PreferenceRow { type: NotificationType; inApp: boolean; push: boolean; forcedInApp: boolean }
export interface PushStatus {
  configured: boolean;                  // มี VAPID ครบ (mode 'real') หรือไม่ (ไม่ครบ = 'sandbox': ไม่ส่งจริง)
  mode: 'real' | 'sandbox';
  publicKey: string | null;
  subscriptions: number;                // ของผู้เรียก
  lastAcceptedAt: string | null;        // บริการ push รับล่าสุด
  lastAckAt: string | null;             // เครื่องของผู้เรียกแสดง push แล้วล่าสุด (หลักฐาน R)
}
export interface PushTestResult { attempted: number; accepted: number; gone: number; failed: number; mode: 'real' | 'sandbox' }
```

## 4. Service functions และ contracts

ไฟล์ภายใน: `service.ts` (public: `notify` + ฟังก์ชันที่ routes ใช้) · `defaults.ts` · `recipients.ts` · `push.ts` · `jobs.ts` · `repo.ts` · `routes.ts` · `sw.ts` (ข้อความของ service worker เป็นสตริงใน TS) · `seed.ts` · `*.test.ts`

**Contract ที่ F31 ให้ (ตรง contracts.ts ทุกตัวอักษร):**

```ts
export interface NotifyInput {
  businessId: string;
  to: { userIds: string[] } | { role: 'owners' } | { permission: PermissionKey };
  type: 'chat.handoff' | 'chat.mention' | 'order.created' | 'payment.verifying' | 'booking.created' | 'booking.cancelled' | 'invitation' | 'report' | 'system';
  title: string; body?: string; link?: string; dedupKey?: string;
}
export declare function notify(input: NotifyInput): Promise<{ notificationIds: string[]; mode: 'real' | 'sandbox' }>;
```

พฤติกรรม: persist หนึ่งแถวต่อผู้รับ · `publish` `notification.created` เฉพาะผู้รับ · เข้าคิว push เมื่อผู้รับเปิด push ของชนิดนั้น · `notificationIds` = เฉพาะแถวที่ **สร้างใหม่** (dedupKey ซ้ำ = ไม่คืน id นั้น, ไม่มีแถวใหม่) · `mode` = `'real'` เมื่อบันทึกแถวสำเร็จ (in-app เป็นของจริงเสมอ) · **ไม่ throw** ยกเว้น input ผิดรูป (`VALIDATION_ERROR`): ความผิดพลาดของ DB/push ถูก log แล้วคืน `{ notificationIds: [], mode: 'real' }` เพื่อไม่ให้ flow ของผู้เรียกล้ม · ผู้รับต้องเป็นสมาชิก active ของ `businessId` (คนนอกร้านถูกตัดเงียบ + log `warn` จำนวนที่ตัด) ไม่มีการส่งข้ามร้าน

ไม่มี Contract additions (ไม่เพิ่มฟังก์ชันข้าม lane) · ข้อเสนอที่ **ไม่ทำในสเปกนี้** แต่ลงรายงาน: เพิ่มชนิดใน union (เช่น `payment.failed`, `job.dead`) เป็นงานของหัวหน้า เพราะแก้ `NotifyInput` ต้องใช้ `CHANGE` · วันนี้ใช้การจับคู่ตาม §5.3

Contract ที่ใช้: core `publish(businessId, event, { userIds })` · `jobs.enqueue('notifications.push', …)` · `db` · `encryptSecret`/`decryptSecret` · `audit` (เฉพาะ subscribe/unsubscribe) · `config` (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) · ไม่เรียกฟีเจอร์อื่น

## 5. Algorithms

ค่าคงที่ (`config.ts` ของฟีเจอร์): `MAX_RECIPIENTS = 200` · `FEED_DEFAULT = 30`, `FEED_MAX = 100` · `RETENTION_READ_DAYS = 90`, `RETENTION_ALL_DAYS = 180` · `PUSH_TTL_SECONDS = 3600` · `PUSH_MAX_ATTEMPTS = 3` · `PUSH_PAYLOAD_TITLE_MAX = 100`, `PUSH_PAYLOAD_BODY_MAX = 200` · `TEST_RATE = 5/นาที/ผู้ใช้` · `SUBSCRIBE_RATE = 10/ชม./ผู้ใช้` · `MAX_SUBSCRIPTIONS_PER_USER = 10` · `POLL_FALLBACK_SECONDS = 120` · `PUSH_FAILURE_LIMIT = 5` (ครบแล้วลบ subscription)

### 5.1 `notify()` ทีละขั้น

1. `NotifyInputSchema.safeParse` — ผิด → `AppError('VALIDATION_ERROR', …)` (เฉพาะกรณีนี้) · `to.permission` ต้องอยู่ใน `PERMISSIONS` (ไม่อยู่ = `VALIDATION_ERROR`)
2. ที่เหลือทั้งหมดอยู่ใน `try { … } catch (e) { log.error({ err: e.code, type }, 'notify failed'); return { notificationIds: [], mode: 'real' } }`
3. หาผู้รับ (`recipients.ts`, query เดียวต่อรูปแบบ): ฐาน = `memberships m JOIN users u ON u.id = m.user_id WHERE m.business_id = $1 AND m.status = 'active' AND u.status = 'active'`
   - `userIds`: `AND m.user_id = ANY($2)`
   - `role: 'owners'`: `AND m.role = 'owner'`
   - `permission: k`: `AND (m.role = 'owner' OR $k = ANY(m.permissions))`
   - เลือก `m.user_id, m.role, m.permissions` · เกิน 200 คน = ตัดที่ 200 (log warn) · ผู้ใน `userIds` ที่ไม่อยู่ในผลถูกตัด (log จำนวน)
4. กรองด้วย **สิทธิ์ของชนิด**: ผู้รับต้องเห็นชนิดนั้นได้ (`TYPE_PERMISSION[type]`; owner เห็นทุกชนิด; staff ต้องมี key ใน `permissions`) · ไม่เห็น = ข้าม (เช่น staff ไม่มี `chat.read` ไม่ได้ `chat.handoff`)
5. โหลดการตั้งค่า: `SELECT user_id, in_app, push FROM notification_preferences WHERE user_id = ANY($ids) AND type = $type` ผสมกับ `PREF_DEFAULTS` → `inApp` เป็น false (และชนิดไม่ใช่ `system`) = ข้ามผู้รับนั้น (นับใน `skipped` เพื่อ log ไม่ใช่ error)
6. INSERT เป็นชุดเดียว: `INSERT INTO notifications (business_id, user_id, type, title, body, link, dedup_key) SELECT … ON CONFLICT (user_id, dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING RETURNING id, user_id` → ได้ `rows` = แถวใหม่
7. ต่อแถวใหม่: `publish(businessId, { type: 'notification.created', userId, notificationId, title }, { userIds: [userId] })` (ไม่ throw ตามสัญญาของ core) · ถ้าผู้รับ `push = true` ตามข้อ 5 **และ** มี `push_subscriptions` อย่างน้อยหนึ่งรายการ → `jobs.enqueue('notifications.push', { notificationId }, { dedupKey: 'notifications.push:' + id, businessId, maxAttempts: 3 })` (เฉพาะเมื่อ `PushStatus.mode = 'real'`; sandbox ไม่ enqueue)
8. คืน `{ notificationIds: rows.map(r => r.id), mode: 'real' }`
9. ผู้เรียกที่เรียก `notify` ไม่ต้องครอบ try/catch (แต่ spec ของ lane อื่นเขียน try/catch ไว้ก็ไม่เป็นไร)

### 5.2 อ่านรายการและ mark read

- **feed**: `allowedTypes = isOwner ? ALL : TYPES ที่ TYPE_PERMISSION[t] ∈ scope.permissions` (ใช้ `ctx.scope` จาก core) · `WHERE user_id=$me AND business_id=$biz AND type = ANY($allowed) [AND read_at IS NULL] AND (created_at, id) < ($cursorCreatedAt, $cursorId) ORDER BY created_at DESC, id DESC LIMIT $limit+1` · `nextCursor` = base64url(JSON `{createdAt,id}`) ของแถวสุดท้ายที่คืน · `unreadCount` = `count(*) WHERE user_id=$me AND business_id=$biz AND read_at IS NULL AND type = ANY($allowed)`
- **unreadElsewhere**: `SELECT count(*) FROM notifications n JOIN memberships m ON m.business_id = n.business_id AND m.user_id = n.user_id AND m.status = 'active' JOIN (VALUES ('chat.handoff','chat.read'),('chat.mention','chat.read'),('order.created','orders.read'),('payment.verifying','orders.read'),('booking.created','appointments.read'),('booking.cancelled','appointments.read'),('invitation','business.read'),('report','business.read'),('system','business.read')) tp(type, perm) ON tp.type = n.type WHERE n.user_id = $me AND n.business_id <> $biz AND n.read_at IS NULL AND (m.role = 'owner' OR tp.perm = ANY(m.permissions))`
- **mark read**: `{ ids }` → `UPDATE notifications SET read_at = now() WHERE user_id=$me AND business_id=$biz AND id = ANY($ids) AND read_at IS NULL AND type = ANY($allowed)` · `{ all: true }` → เหมือนกันโดยไม่มีเงื่อนไข id · คืนจำนวนแถวที่อัปเดต (id ของคนอื่น/ร้านอื่น = ไม่อัปเดต ไม่ error, ไม่เผยการมีอยู่)
- **read ≠ resolved**: ไม่มี resolved · เปิดลิงก์ไปหน้าเรื่องจริงเป็นการแก้ปัญหา ไม่ใช่การ mark

### 5.3 แค็ตตาล็อก: ใครเรียก `notify()` ด้วยอะไร (ผู้เรียกเป็นเจ้าของข้อความ; ตารางนี้คือค่าที่ F31 ทดสอบและแนะนำ)

ชนิดใน contract มี 9 แบบ จึงจับคู่เหตุการณ์ของทุกฟีเจอร์ตามนี้ (ไม่แก้ `NotifyInput`) · ผู้เรียกใส่ `dedupKey` จาก id เสมอ · ลิงก์เป็น path ในแอป (ผู้เรียกตรวจให้ตรงกับ route จริงของฟีเจอร์ตัวเอง)

| เหตุการณ์ | ผู้เรียก | `type` | `to` | title (th) | title (en) | body | link | dedupKey |
|---|---|---|---|---|---|---|---|---|
| ลูกค้าขอคุยกับคน (`requestHumanHandoff`) | F11 (เรียกให้ F10 ด้วย) | `chat.handoff` | `{ permission: 'chat.takeover' }` | ลูกค้าต้องการคุยกับพนักงาน | A customer needs a human | ชื่อลูกค้า | `/chat?c=<conversationId>` | `handoff:<convId>:v<version>` |
| แชตมอบหมายให้คุณ (auto-assign) | F11 | `chat.handoff` | `{ userIds:[assignee] }` | มีแชตมอบหมายให้คุณ | A chat was assigned to you | ชื่อลูกค้า | `/chat?c=<id>` | `assign:<convId>:<userId>:v<version>` |
| แชตรอตอบนาน (idle) | F11 | `chat.handoff` | `{ userIds:[holder] }` + owners | แชตรอตอบนานเกินกำหนด | A chat has waited too long | ชื่อลูกค้า + เวลารอ | `/chat?c=<id>` | `idle:<convId>:<waitStartedAt>` |
| ถูกกล่าวถึงในโน้ต | F11 | `chat.mention` | `{ userIds }` | `<ชื่อ>` กล่าวถึงคุณในแชต | `<name>` mentioned you in a chat | 60 ตัวแรกของโน้ต | `/chat?c=<id>` | `mention:<noteId>` |
| ออเดอร์ใหม่ | F13 | `order.created` | `{ permission: 'orders.read' }` | มีออเดอร์ใหม่ #`<เลข>` | New order #`<no>` | ชื่อลูกค้า · ยอดรวม (`formatMoney`) | หน้ารายละเอียดออเดอร์ของ F13 | `order:<orderId>:created` |
| ตรวจสลิปผ่านแล้ว | F14 | `payment.verifying` | `{ permission: 'orders.read' }` | ตรวจสลิปผ่านแล้ว ออเดอร์ #`<เลข>` | Payment slip verified for order #`<no>` | ยอดที่ตรวจพบ | หน้าออเดอร์ | `payment:<orderId>:verified` |
| สลิปไม่ผ่านครบ 3 ครั้ง | F14 | `payment.verifying` | `{ permission: 'orders.write' }` | สลิปไม่ผ่านการตรวจ 3 ครั้ง ออเดอร์ #`<เลข>` | Slip failed checks 3 times, order #`<no>` | เหตุผลล่าสุดสั้น ๆ | หน้าออเดอร์ | `payment:<orderId>:failed3` |
| จองใหม่ | F15 | `booking.created` | `{ permission: 'appointments.read' }` | มีการจองใหม่ | New booking | บริการ · วันเวลา (Asia/Bangkok) | หน้านัดหมายของ F15 | `booking:<id>:created` |
| ยกเลิกการจอง | F15 | `booking.cancelled` | `{ permission: 'appointments.read' }` | มีการยกเลิกการจอง | A booking was cancelled | บริการ · วันเวลา | หน้านัดหมาย | `booking:<id>:cancelled` |
| สิทธิ์ Google Calendar หมดอายุ | F16 | `system` | `{ role: 'owner' }` | ต้องเชื่อม Google Calendar ใหม่ | Google Calendar needs reconnecting | นัดหมายยังอยู่ในระบบ แต่ยังไม่ sync ไปปฏิทิน · ลิงก์ `/calendar` |
| นำเข้าข้อมูลเสร็จ | F06 | `report` | `{ userIds:[ผู้สั่ง] }` | นำเข้าข้อมูลเสร็จแล้ว | Import finished | สำเร็จ n · ข้าม m · ผิดพลาด k | หน้าความรู้/ประวัตินำเข้าของ F06 | `import:<jobId>:done` |
| งานเบื้องหลังล้มเหลวถาวร (dead) | F35 | `system` | `{ role:'owners' }` (เฉพาะงานที่มี `businessId`) | งานเบื้องหลังล้มเหลว | A background job failed | ชนิดงาน (ไม่ใส่ payload) | ไม่มี (ผู้ดูแลระบบดูที่ `/ops`) | `job:<jobId>:dead` |
| ส่งข้อความทักตามลูกค้าแล้ว | F38 | `report` | `{ role:'owners' }` | ส่งข้อความทักตามลูกค้าแล้ว | A follow-up nudge was sent | ชื่อลูกค้า · สินค้า | `/chat?c=<id>` | `followup:<followUpId>:sent` |
| บรอดแคสต์ส่งเสร็จ | F23 | `report` | `{ userIds:[ผู้สร้าง] }` | ส่งบรอดแคสต์เสร็จแล้ว | Broadcast finished | ส่งแล้ว n · ล้มเหลว m | หน้ารายละเอียดบรอดแคสต์ของ F23 | `broadcast:<id>:done` |
| รันประเมิน AI เสร็จ | F37 | `report` | `{ userIds:[ผู้สั่ง] }` | ประเมินคุณภาพ AI เสร็จแล้ว | AI quality run finished | ผ่าน x จาก y | หน้า AI quality ของ F37 | `eval:<runId>:done` |
| พนักงานรับคำเชิญแล้ว | F03 | `invitation` | `{ role:'owners' }` | พนักงานใหม่เข้าร่วมแล้ว | A new staff member joined | ชื่อ/อีเมล (mask) | `/members` | `invite-accepted:<invitationId>` |
| ทดสอบจากหน้าตั้งค่า | F31 | `system` | `{ userIds:[ตัวเอง] }` | ทดสอบการแจ้งเตือน | Test notification | ถ้าเห็นข้อความนี้ กระดิ่งทำงานปกติ | `/notifications` | ไม่ใส่ (ทดสอบซ้ำได้) |

หมายเหตุ: (ก) บางฟีเจอร์ (F38, F23, F37, F06, F35) ใน spec ของตัวเองอาจยังไม่เรียก `notify`: ตารางนี้เป็นข้อตกลงให้เจ้าของเพิ่มเมื่อทำฟีเจอร์ (ไม่ใช่เงื่อนไขของ F31) · (ข) ไม่มีชนิดเฉพาะ "payment verified/failed" และ "job dead" ใน union จึงใช้ `payment.verifying` และ `system` · ผู้เรียกที่ต้องการชนิดแยกให้โพสต์ `CHANGE TO:C3`/หัวหน้า (ดู §15)

### 5.4 Web push

เปิดเมื่อ `VAPID_PUBLIC_KEY` และ `VAPID_PRIVATE_KEY` ครบ (`mode:'real'`) มิฉะนั้น `mode:'sandbox'`: ไม่ enqueue, `push/status.configured=false`, หน้าตั้งค่าแสดง "ยังไม่ได้ตั้งค่ากุญแจ push บนเซิร์ฟเวอร์" และปุ่มสมัครถูกปิด (ไม่แกล้งว่าส่งได้)
- **ตั้งค่าตอน boot** (`push.ts`): `webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)` ใน try/catch (ผิดรูป = log error ชื่อ key ไม่พิมพ์ค่า แล้วเป็น sandbox) · กุญแจสร้างครั้งเดียวโดยคน C: `npx web-push generate-vapid-keys` เก็บใน `..\nless.secrets.env` และ Render env **ห้ามเปลี่ยนค่าหลังมีผู้สมัคร push แล้ว** (subscription เดิมใช้ไม่ได้)
- **subscribe** (`POST /push/subscribe`): rate limit · endpoint ต้องเป็น `https` และ host ลงท้ายด้วยหนึ่งใน `ALLOWED_PUSH_HOSTS` = `.googleapis.com`, `.push.services.mozilla.com`, `.push.apple.com`, `.notify.windows.com` (**ป้องกัน SSRF**: server จะ POST ไปที่ endpoint ที่ผู้ใช้ส่งมา · ไม่ใช่ IP literal/localhost) · ไม่ผ่าน = `POLICY_BLOCKED` `details.reason:'endpoint_not_allowed'` · เกิน 10 รายการต่อผู้ใช้ = ลบอันเก่าสุดก่อน · `INSERT … ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh_enc, auth_enc, user_agent, failure_count = 0` (เบราว์เซอร์เดิม login คนละบัญชี = ย้ายเจ้าของ) · `p256dh`/`auth` ผ่าน `encryptSecret` · audit `notifications.push.subscribe`
- **unsubscribe**: ลบแถวของผู้เรียกที่ `endpoint` ตรง (ไม่มี = ok เฉยๆ) · audit `notifications.push.unsubscribe`
- **job `notifications.push`** (payload `{ notificationId }`, dedupKey `notifications.push:<id>`, `maxAttempts 3`): โหลดแถว notification + ผู้รับ · ตรวจซ้ำ ณ ตอนส่ง: ผู้รับยัง active ใน `business_id`, ยังเห็นชนิดนั้นได้, `push` ของชนิดยังเปิด (ผู้ใช้ปิดระหว่างรอได้) · ไม่ผ่าน = จบเงียบ · ต่อ subscription ที่ยังไม่มี `push_deliveries` state `accepted` ของ `(notification, subscription)`: สร้าง `ref = randomUUID()` · payload JSON `{ ref, id, title (≤100), body (≤200), url: link ?? '/notifications', tag: type }` (ความยาวรวม < 3,500 ไบต์) · `webpush.sendNotification({ endpoint, keys:{ p256dh, auth } }, JSON.stringify(payload), { TTL: 3600, urgency: type ∈ {chat.handoff, chat.mention} ? 'high' : 'normal', timeout: 8000 })`:
  - สำเร็จ (HTTP 201) → INSERT `push_deliveries` state `accepted` (`status_code`), `last_accepted_at = now()`, `failure_count = 0`
  - `WebPushError.statusCode` 404 หรือ 410 → INSERT state `gone` + **ลบ subscription**
  - 400/401/403 (กุญแจ/VAPID ไม่ตรง) → state `failed` + `failure_count + 1` (ครบ 5 → ลบ subscription) ไม่ retry
  - 429/5xx/timeout → INSERT `failed` แล้ว **throw** ให้ core retry (backoff ตาม F35) ครบ 3 ครั้งเป็น dead (ไม่กระทบ bell)
  - ความล้มเหลวของ push ไม่เคยทำให้แถว `notifications` หายหรือ `notify()` ล้ม
- **ack** (`POST /push/ack { ref }`): service worker ส่งหลังแสดง notification: `UPDATE push_deliveries SET acked_at = now() WHERE ref = $1 AND user_id = $me AND acked_at IS NULL` (ref ของคนอื่น = ไม่อัปเดต) · นี่คือ **หลักฐานเดียวที่ถือว่าถึงเครื่องจริง** · `PushStatus.lastAckAt` = `max(acked_at)` ของผู้เรียก
- **ส่งทดสอบ** (`POST /push/test`): rate limit 5/นาที · ต้องมี subscription ≥ 1 (ไม่มี = `POLICY_BLOCKED` `no_subscription`) · ส่ง payload ทดสอบ (`title:'ทดสอบ push', body:'ถ้าเห็นข้อความนี้บนอุปกรณ์ การแจ้งเตือนแบบ push ทำงาน'`, `notificationId` null) ทันทีใน request ผ่านฟังก์ชันเดียวกับ job · คืนจำนวน `accepted/gone/failed` (**ไม่ใช้คำว่า delivered**) · ผู้ใช้เห็นผลจริงเมื่อ OS แสดง และหน้าแสดง "ยืนยันว่าเครื่องนี้ได้รับแล้ว" เมื่อ `lastAckAt` เปลี่ยน
- **service worker** (`GET /api/v1/notifications/sw.js`, สตริงใน `sw.ts`, `Content-Type: text/javascript`, ไม่ต้อง login, cache สั้น): ลงทะเบียนด้วย `navigator.serviceWorker.register('/api/v1/notifications/sw.js', { scope: '/api/v1/notifications/' })` (push ไม่ต้องควบคุมหน้า จึงใช้ scope ที่ตรงกับ path ของสคริปต์ได้ ไม่ต้องมี `web/public`) · `push` event: parse JSON (ล้มเหลว = แสดงข้อความกลาง ๆ) → `registration.showNotification(title, { body, tag, data:{ url, ref } })` แล้ว `fetch('/api/v1/notifications/push/ack', { method:'POST', credentials:'include', headers:{ 'Content-Type':'application/json', 'X-Requested-With':'nless' }, body: JSON.stringify({ ref }) })` ใน `event.waitUntil` (ล้มเงียบ) · `notificationclick`: ปิด notification → หา window ของ origin เดียวกัน (`clients.matchAll({ type:'window', includeUncontrolled:true })`) แล้ว `focus()` + `navigate(url)` ถ้าไม่มี `clients.openWindow(url)` (url ต้องขึ้นต้น `/`; อย่างอื่นใช้ `/notifications`)

### 5.5 การตั้งค่า

`GET /notification-preferences`: ทั้ง 9 ชนิด (เรียงตามตาราง §2) ผสมค่าเริ่มต้น + `forcedInApp` (`system`) · `PUT`: upsert เฉพาะแถวที่ส่ง · `type` ซ้ำ หรือ `system.inApp=false` = `VALIDATION_ERROR` · การตั้งค่า `push=true` โดยยังไม่มี subscription ไม่ error (UI เตือนให้เปิด push ในเครื่องนี้)

## 6. AI calls

ไม่มี AI call

## 7. UI

ใช้ UI kit ของ core: `PageHeader`, `SectionCard`, `DataTable`, `EmptyState`, `StatusChip`, `useToast`, `useApiQuery`, `useApiMutation`, `useRealtime`, `useSession`, `formatDateTime`, `defineFeaturePages` · namespace i18n `notifications`

**Bell** (`NotificationBell.tsx`): contribution `{ slot:'topbarActions', id:'notifications.bell', order:10, load }` ใน `pages.tsx` · `IconButton` (`NotificationsNoneOutlined`) + `Badge` เลขแดง (`data-testid="notif-bell"`, `data-testid="notif-badge"`, 99+ เมื่อเกิน 99; ซ่อนเมื่อ 0) · กดเปิด `Popover` กว้าง 360: หัวข้อ + ปุ่ม "อ่านทั้งหมด" · รายการล่าสุด 10 รายการ (`GET /notifications?limit=10`): ไอคอนตามชนิด, title (ตัวหนาเมื่อยังไม่อ่าน), body 2 บรรทัด, เวลาแบบสัมพัทธ์ (`formatDateTime` เมื่อเกิน 24 ชม.), จุดสีหลักเมื่อยังไม่อ่าน · คลิกแถว: `POST /read {ids:[id]}` แล้ว `navigate(link)` (ถ้ามี `link`; ไม่มี = แค่ mark) และปิด Popover · แถว "ดูทั้งหมด" → `/notifications` · สถานะ: loading (skeleton 3 แถว) · ว่าง = ข้อความ `bell.empty` · error = ข้อความ + ปุ่มลองใหม่ (**ความผิดพลาดของกระดิ่งต้องไม่ทำให้ top bar ล่ม**: ครอบ error boundary แสดงไอคอนเฉย ๆ)
- realtime: `useRealtime('notification.created', e => e.userId === me.id && reload())` + poll `unread-count` ทุก 120 วินาที (fallback) และเมื่อหน้าต่างได้โฟกัส · เปลี่ยนร้าน (`currentBusiness`) = โหลดใหม่ของร้านนั้น · ตัวเลข `elsewhere` แสดงเป็นจุดเล็กบนไอคอนและ tooltip "มีแจ้งเตือนในร้านอื่น n รายการ"

**หน้า `/notifications`** (`NotificationsPage.tsx`, route `/notifications`, auth business, ไม่ต้องมี permission, `titleKey:'notifications:page.title'`) · เมนู `{ path:'/notifications', labelKey:'notifications:menu.title', group:'home', icon:'NotificationsNoneOutlined', order:90, searchTerms:['แจ้งเตือน','กระดิ่ง','push','notification'] }` · MUI `Tabs`:
1. "ทั้งหมด" และ "ยังไม่อ่าน": `DataTable` (ชนิด chip label ตาม i18n, ข้อความ, เวลา, สถานะอ่าน) + ปุ่ม "โหลดเพิ่ม" (cursor) + "อ่านทั้งหมด" · คลิกแถวเหมือนกระดิ่ง
2. "ตั้งค่า": (ก) `SectionCard` "ชนิดการแจ้งเตือน": ตาราง 9 แถว × สวิตช์ "ในแอป" / "Push" (`system` ในแอปปิดสวิตช์ล็อก) บันทึกทันทีเมื่อสลับ (`PUT`) (ข) `SectionCard` "Push บนเครื่องนี้": ตามสถานะ: **ไม่รองรับ** (ไม่มี `serviceWorker`/`PushManager`/`Notification`) ข้อความ + หมายเหตุ iOS ต้องติดตั้งเป็นแอป · **เซิร์ฟเวอร์ยังไม่ตั้งกุญแจ** (`mode:'sandbox'`) · **ถูกปิดกั้น** (`Notification.permission==='denied'`) บอกวิธีเปิดในเบราว์เซอร์ + ยืนยันว่ากระดิ่งยังใช้ได้ · **ยังไม่เปิด** ปุ่ม "เปิด push บนเครื่องนี้" (เรียก `Notification.requestPermission()` **เมื่อกดเท่านั้น** แล้ว register SW + `pushManager.subscribe({ userVisibleOnly:true, applicationServerKey })` + `POST /subscribe`) · **เปิดอยู่** แสดงจำนวนเครื่อง, ปุ่ม "ส่ง push ทดสอบ", ปุ่ม "ปิด push บนเครื่องนี้", และบรรทัด "ยืนยันว่าเครื่องนี้ได้รับ push แล้วเมื่อ …" (จาก `lastAckAt`) หรือ "ยังไม่ได้รับการยืนยัน" · ผล "ส่ง push ทดสอบ": "บริการ push รับแล้ว n · ถูกลบ n · ล้มเหลว n" + คำอธิบายว่า "ยังไม่ใช่การยืนยันว่าถึงเครื่อง" (ค) ปุ่ม "ส่งแจ้งเตือนทดสอบถึงตัวเอง" (`POST /test`) → toast
- states: โหลด/ว่าง (`EmptyState` "ยังไม่มีการแจ้งเตือน")/error + ลองใหม่

i18n (namespace `notifications`):

| key | th | en |
|---|---|---|
| `menu.title` | แจ้งเตือน | Notifications |
| `page.title` | การแจ้งเตือน | Notifications |
| `bell.title` | แจ้งเตือน | Notifications |
| `bell.markAll` | อ่านทั้งหมด | Mark all read |
| `bell.viewAll` | ดูทั้งหมด | View all |
| `bell.empty` | ยังไม่มีการแจ้งเตือน | No notifications yet |
| `bell.elsewhere` | มีแจ้งเตือนในร้านอื่น {{count}} รายการ | {{count}} unread in other businesses |
| `bell.error` | โหลดแจ้งเตือนไม่ได้ | Could not load notifications |
| `tabs.all` | ทั้งหมด | All |
| `tabs.unread` | ยังไม่อ่าน | Unread |
| `tabs.settings` | ตั้งค่า | Settings |
| `col.type` | ชนิด | Type |
| `col.message` | ข้อความ | Message |
| `col.time` | เวลา | Time |
| `col.state` | สถานะ | State |
| `state.unread` | ยังไม่อ่าน | Unread |
| `state.read` | อ่านแล้ว | Read |
| `loadMore` | โหลดเพิ่ม | Load more |
| `empty.title` | ยังไม่มีการแจ้งเตือน | No notifications yet |
| `empty.description` | เมื่อมีลูกค้าขอคุยกับพนักงานหรือมีออเดอร์ใหม่ จะแสดงที่นี่ | Handoff requests, new orders and more will show up here |
| `type.chat.handoff` | แชตที่ต้องมีคนตอบ | Chats needing a human |
| `type.chat.mention` | ถูกกล่าวถึง | Mentions |
| `type.order.created` | ออเดอร์ใหม่ | New orders |
| `type.payment.verifying` | การชำระเงิน | Payments |
| `type.booking.created` | การจองใหม่ | New bookings |
| `type.booking.cancelled` | ยกเลิกการจอง | Cancelled bookings |
| `type.invitation` | คำเชิญและสมาชิก | Invitations and members |
| `type.report` | รายงานงานที่เสร็จ | Finished jobs and reports |
| `type.system` | ระบบ | System |
| `settings.types` | ชนิดการแจ้งเตือน | Notification types |
| `settings.inApp` | ในแอป | In app |
| `settings.push` | Push | Push |
| `settings.locked` | ปิดไม่ได้ | Cannot be turned off |
| `settings.saved` | บันทึกแล้ว | Saved |
| `settings.sendTest` | ส่งแจ้งเตือนทดสอบถึงตัวเอง | Send myself a test notification |
| `settings.testSent` | ส่งแจ้งเตือนทดสอบแล้ว | Test notification sent |
| `push.title` | Push บนเครื่องนี้ | Push on this device |
| `push.unsupported` | เบราว์เซอร์นี้ไม่รองรับ push (บน iPhone ต้องติดตั้งเว็บเป็นแอปก่อน) กระดิ่งในแอปยังใช้ได้ตามปกติ | This browser does not support push (on iPhone, install the site as an app first). The in-app bell still works |
| `push.notConfigured` | เซิร์ฟเวอร์ยังไม่ได้ตั้งค่ากุญแจ push จึงยังเปิดใช้ไม่ได้ (กระดิ่งในแอปยังใช้ได้) | The server has no push keys yet, so push is unavailable (the bell still works) |
| `push.denied` | เบราว์เซอร์ปิดกั้นการแจ้งเตือนของเว็บนี้ เปิดได้ที่การตั้งค่าไซต์ของเบราว์เซอร์ กระดิ่งในแอปยังใช้ได้ | The browser blocks notifications for this site. Allow it in the site settings. The bell still works |
| `push.off` | ยังไม่ได้เปิด push บนเครื่องนี้ | Push is off on this device |
| `push.enable` | เปิด push บนเครื่องนี้ | Turn on push on this device |
| `push.disable` | ปิด push บนเครื่องนี้ | Turn off push on this device |
| `push.on` | เปิด push แล้ว ({{count}} เครื่อง) | Push is on ({{count}} devices) |
| `push.test` | ส่ง push ทดสอบ | Send a test push |
| `push.testResult` | บริการ push รับแล้ว {{accepted}} · ถูกลบ {{gone}} · ล้มเหลว {{failed}} (ยังไม่ใช่การยืนยันว่าถึงเครื่อง) | Push service accepted {{accepted}} · removed {{gone}} · failed {{failed}} (not yet proof of delivery) |
| `push.noSubscription` | ยังไม่มีเครื่องที่เปิด push | No device has push turned on |
| `push.acked` | ยืนยันว่าเครื่องนี้ได้รับ push แล้วเมื่อ {{when}} | This device confirmed receiving a push at {{when}} |
| `push.notAcked` | ยังไม่ได้รับการยืนยันจากเครื่อง | No confirmation from a device yet |
| `push.endpointNotAllowed` | ผู้ให้บริการ push ของเบราว์เซอร์นี้ไม่อยู่ในรายการที่รองรับ | This browser's push service is not supported |
| `test.title` | ทดสอบการแจ้งเตือน | Test notification |
| `test.body` | ถ้าเห็นข้อความนี้ กระดิ่งทำงานปกติ | If you see this, the bell works |
| `common.retry` | ลองใหม่ | Retry |

## 8. Jobs, schedules, events

| รายการ | ค่า |
|---|---|
| job `notifications.push` | payload `{ notificationId: string }` · dedupKey `notifications.push:<notificationId>` · lockKey ไม่ใช้ · `maxAttempts` 3 · ถ้า throw (429/5xx/timeout) core retry ด้วย backoff · handler idempotent (ข้าม subscription ที่มี `accepted` แล้ว) |
| schedule `notifications.purge` | ทุก 86400 วินาที · handler (`{ slot }`): `DELETE FROM notifications WHERE (read_at IS NOT NULL AND read_at < now() - interval '90 days') OR created_at < now() - interval '180 days'` · `DELETE FROM push_deliveries WHERE created_at < now() - interval '30 days'` · idempotent |
| Realtime | `{ type: 'notification.created', userId, notificationId, title }` ส่งเฉพาะ `userIds:[userId]` (ตาม contracts.ts) |
| Audit | `notifications.push.subscribe` `{ subscriptionId }` · `notifications.push.unsubscribe` `{ subscriptionId }` (ไม่เก็บ endpoint เต็ม; การสร้าง/อ่านแจ้งเตือนไม่ audit) |
| `notify` ที่ F31 เรียกเอง | `system` ทดสอบถึงตัวเอง (แถวเดียวในตาราง §5.3) |

## 9. Seed และ fixtures

`server/src/features/notifications/seed.ts` (`dependsOn: ['core']`):
- `run(ctx)`: ไม่มีข้อมูลบังคับ (ไม่มีแถว preferences = ค่าเริ่มต้น)
- `runDemo(ctx)`: ร้าน A: `owner_a` ได้ 3 แถว: `chat.handoff` ยังไม่อ่าน ("ลูกค้าต้องการคุยกับพนักงาน" body `A Customer One` link `/chat?c=<conv_a_staff id>` เมื่อ 10 นาทีก่อน), `order.created` ยังไม่อ่าน ("มีออเดอร์ใหม่ #DEMO-1" เมื่อ 2 ชม.ก่อน), `report` อ่านแล้ว ("นำเข้าข้อมูลเสร็จแล้ว" เมื่อวาน) · `staff_a` ได้ `chat.handoff` 1 แถว · เวลาคำนวณจากเวลาที่รัน · `dedup_key` = `demo:<n>:<userAlias>` (`ON CONFLICT DO NOTHING`) · ร้าน B ไม่มีข้อมูลเดโม
- `resetDemo(ctx)`: ลบ `notifications` และ `push_deliveries` ของสองร้านเดโมทั้งหมด (ผู้ใช้ SEED) แล้ว `runDemo` เติมใหม่ · **ไม่ลบ** `push_subscriptions` หรือ `notification_preferences` (เป็นของผู้ใช้/เครื่องจริง)
- fixtures ของ test: helper `makeMember(prefix, { role, permissions })` สร้างผู้ใช้ + membership ในร้านทดสอบ · helper `fakeWebPush()` แทน `web-push` ใน vitest (บันทึกการเรียก, สั่งให้ตอบ 201/404/410/429/400 ได้) · ไม่มีการเรียก push service จริงใน CI

## 10. Tests

Unit (`recipients.test.ts`, `defaults.test.ts`, `sw.test.ts`):
1. `TYPE_PERMISSION` ครอบคลุมทั้ง 9 ชนิดและทุก key ใน `PERMISSIONS` จริง · `PREF_DEFAULTS` ครบ 9 ชนิดและ `system.inApp=true`
2. `ALLOWED_PUSH_HOSTS`: `https://fcm.googleapis.com/fcm/send/x` ผ่าน · `https://updates.push.services.mozilla.com/wpush/v2/x` ผ่าน · `https://web.push.apple.com/x` ผ่าน · `http://…` ไม่ผ่าน · `https://127.0.0.1/x`, `https://localhost/x`, `https://evil.example.com/x`, `https://fcm.googleapis.com.evil.com/x` ไม่ผ่าน
3. payload push: title/body ถูกตัดตามความยาว · รวมไม่เกิน 3,500 ไบต์แม้ title เป็นภาษาไทย 200 ตัว
4. `sw.ts` ข้อความของ SW: มี handler `push` และ `notificationclick` · `url` ที่ไม่ขึ้นต้น `/` หรือขึ้นต้น `//` ถูกแทนด้วย `/notifications` (ทดสอบฟังก์ชัน `safeUrl` ที่ฝังใน SW ด้วย `new Function`)

Route / service (supertest + test DB; `fakeWebPush`; `MODEL_MODE=fake` ไม่เกี่ยว):
5. **notify พื้นฐาน**: `to:{userIds:[owner_a, staff_a]}` type `chat.handoff` → 2 แถว · `publish` ถูกเรียก 2 ครั้งด้วย `userIds` ของแต่ละคน (spy) · คืน `{ notificationIds: [2 id], mode:'real' }`
6. **dedup**: `notify` เดิม (dedupKey เดียวกัน) สองครั้ง → แถวเดียวต่อผู้รับ · ครั้งที่สองคืน `notificationIds: []` · สองครั้งพร้อมกัน (`Promise.all`) → ยังแถวเดียว · ไม่ส่ง dedupKey → สองแถว
7. **ผู้รับ**: `role:'owners'` → เฉพาะ owner active · `permission:'chat.takeover'` → owner + staff ที่มี key (staff ที่ถอด key ไม่ได้) · `userIds` มีคนนอกร้าน (staff ของ B) → ถูกตัด (ไม่มีแถวของเขา ไม่ throw) · สมาชิก `revoked` ไม่ได้ · ผู้ใช้ `disabled` ไม่ได้ · **ข้าม tenant:** `businessId` ของ A ด้วย `userIds:[owner_b]` → ไม่มีแถว
8. **สิทธิ์ตามชนิด**: staff ไม่มี `chat.read` ไม่ได้ `chat.handoff` (ไม่มีแถว) · มี `orders.read` ได้ `order.created` · ถอด `chat.read` หลังสร้างแล้ว → feed ไม่แสดงแถวชนิดแชตและ `unreadCount` ไม่นับ · owner เห็นทุกชนิด
9. **การตั้งค่า**: ผู้ใช้ตั้ง `report.inApp=false` → `notify(report)` ไม่สร้างแถวให้เขา · `system` ปิด in-app ไม่ได้ (`PUT` → 400) · `PUT` ซ้ำชนิดเดียว → 400 · ไม่มีแถวตั้งค่า = ค่าเริ่มต้น
10. **ไม่ throw**: input ผิดรูป (title ว่าง / link `https://evil` / link `//evil`) → `VALIDATION_ERROR` · DB error (บังคับให้ INSERT ล้ม) → คืน `{ notificationIds: [], mode:'real' }` ไม่ throw และมี log error
11. **อ่านได้เฉพาะผู้รับ**: `staff_a` เรียก feed ไม่เห็นแถวของ `owner_a` · mark read ด้วย id ของ owner → `updated: 0` · owner A เรียก feed ของ B → 404 · `POST /read {all:true}` ไม่แตะแถวของร้านอื่นของผู้ใช้เดียวกัน
12. **feed**: cursor เรียงใหม่→เก่าไม่ซ้ำ/ไม่ตกหล่น (สร้าง 75 แถว อ่านทีละ 30) · `unread=true` กรองถูก · `unreadElsewhere` นับแถวร้านอื่นที่ผู้ใช้เป็นสมาชิก active และเห็นชนิดนั้น (ไม่นับร้านที่ถูกถอด)
13. **mark read persist**: read แล้วเรียกซ้ำ → `updated:0` · `read_at` ไม่เปลี่ยนเมื่อ mark ซ้ำ · `all:true` แล้ว `unreadCount = 0`
14. **push job**: มี subscription + `push` เปิด → job เรียก `fakeWebPush` ด้วย endpoint + payload (title ไม่เกิน 100) + `push_deliveries` state `accepted` · ตอบ 410 → state `gone` และ subscription ถูกลบ · ตอบ 429 → job throw (retry) แต่แถว `notifications` ยังอยู่ · ตอบ 400 → `failed` ไม่ retry และ `failure_count` +1 · `push` ปิดระหว่างรอ → ไม่ส่ง · ส่งซ้ำ job เดิม → ไม่ส่งซ้ำ subscription ที่ `accepted`
15. **sandbox**: ไม่ตั้ง VAPID → `notify` ไม่ enqueue push · `push/status.mode='sandbox'`, `configured:false` · `push/test` → `POLICY_BLOCKED`/ผล `mode:'sandbox'` ไม่เรียก `fakeWebPush`
16. **subscribe**: endpoint นอกรายการ → 422 `endpoint_not_allowed` · endpoint เดิมจากอีกผู้ใช้ → ย้ายเจ้าของ · คอลัมน์ `p256dh_enc`/`auth_enc` ขึ้นต้น `enc:v1:` (ไม่ plain) · ลำดับครบ 11 เครื่อง → เหลือ 10 · unsubscribe ของคนอื่น → ไม่ลบ
17. **ack**: `ref` ของตัวเอง → `acked_at` ถูกตั้ง และ `lastAckAt` ใน status · `ref` ของคนอื่น/ไม่มี → ไม่เปลี่ยนอะไร
18. **purge**: แถวอ่านแล้ว 91 วัน และแถวอายุ 181 วันถูกลบ · แถวใหม่คงอยู่ · รันซ้ำไม่ error
19. **realtime/ถูกต้องตามชนิด**: ตรวจ payload `notification.created` มี `userId`, `notificationId`, `title` ตรง `RealtimeEvent` ใน contracts.ts

Component (vitest + jsdom): bell แสดงเลข/ซ่อนเมื่อ 0 · `Notification.permission='denied'` → การ์ด push แสดง `push.denied` และกระดิ่งยังโหลดได้ · ไม่มี `PushManager` → `push.unsupported` · error ของ API ไม่ทำให้ top bar ล่ม

Playwright smoke `web/src/features/notifications/e2e/notifications.smoke.spec.ts` (production-safe: ใช้ `ownerPage`, `api`, `e2eMarker`; แจ้งเตือนทดสอบเป็นชนิด `system` ถึง owner A เท่านั้น):
- `bell: แจ้งเตือนทดสอบขึ้นเลขแดง กดอ่านแล้วเลขลด และ reload ยังเป็นอ่านแล้ว` — จดค่า badge ปัจจุบัน → `/notifications` แท็บตั้งค่า → "ส่งแจ้งเตือนทดสอบถึงตัวเอง" → badge เพิ่ม 1 (รอ realtime/poll ≤ 10 วินาที) → เปิดกระดิ่งเห็น "ทดสอบการแจ้งเตือน" → คลิก → badge ลด 1 → reload หน้า → แถวนั้นเป็น "อ่านแล้ว" (ผ่าน `api.get` ยืนยัน `read:true`)
- `preferences: ปิด in-app ของ report แล้วคืนค่า` — สลับสวิตช์ `report` ในแอปเป็นปิด → reload ค่ายังปิด → `api.get('/api/v1/notification-preferences')` ยืนยัน → คืนค่าเป็นเปิดใน `finally`
- `tenant: owner A เปิดแจ้งเตือนของ B` — `api.get('/api/v1/businesses/<B id>/notifications')` = 404
- `push: หน้าตั้งค่าไม่ล้มเมื่อเบราว์เซอร์ปฏิเสธ` — `page.addInitScript` ตั้ง `Notification.permission` เป็น `'denied'` → หน้าตั้งค่าแสดง `push.denied` และกระดิ่งยังเปิดได้
- **การยืนยัน push จริง (ทำโดยคน ไม่ใช่ Playwright):** เปิด production ใน Chrome จริง → ตั้งค่า → "เปิด push บนเครื่องนี้" → อนุญาต → "ส่ง push ทดสอบ" → เห็น notification ของ OS → หน้าแสดง "ยืนยันว่าเครื่องนี้ได้รับ push แล้วเมื่อ …" → คนจด `push_deliveries.id`/เวลาใน EVIDENCE.md · มีขั้นนี้จึงนับ push เป็น R

## 11. Acceptance: R ตาม D6

- [ ] `notify()` จริง (แทน fake) ตรง contract · สร้างแถวต่อผู้รับ · dedup · ผู้รับเป็นสมาชิกร้านเท่านั้น · ไม่ throw (test 5–10)
- [ ] กระดิ่ง + `/notifications` + preferences ต่อ API + DB จริง · realtime ทำงานบน production (`notification.created` ถึงผู้รับเท่านั้น) และมี fallback poll · mark read persist (test 11–13, smoke)
- [ ] ผู้รับเท่านั้นที่อ่านได้ · staff ไม่มี `chat.read` ไม่เห็นแจ้งเตือนแชต · ข้ามร้าน = 404 (test 7, 8, 11, smoke)
- [ ] เบราว์เซอร์ปฏิเสธ/ไม่รองรับ push แล้วกระดิ่งยังทำงาน (component test + smoke)
- [ ] ล้างข้อมูลเก่า (test 18) · ไม่มี token/endpoint เต็มใน log/audit
- [ ] loading/empty/error state · ข้อความไทยผ่าน i18n · unit + route test เขียว · Playwright smoke ผ่านกับ production · deploy แล้ว
- **สถานะที่รายงาน:** in-app (กระดิ่ง + ตั้งค่า) = **R** · **web push = R ก็ต่อเมื่อ** (1) ตั้ง VAPID บน Render (2) มีการยืนยันจริงตามขั้นตอนมือใน §10 ที่มีแถว `push_deliveries.acked_at` · ถ้าไม่ครบ = **S** (ส่งผ่านบริการ push ได้แต่ยังไม่มี ack) หรือ **A** (ไม่ได้ตั้ง VAPID / ปิดปุ่มตาม sandbox) · ห้ามใช้คำว่า "delivered" กับ `accepted`
- ฟีเจอร์อื่นที่เรียก `notify` เปลี่ยนจาก fake เป็นของจริงโดยไม่ต้องแก้โค้ดของเขา (signature คงเดิม)

## 12. Security และ privacy

- ทุก query ของ feed/อ่านกรองด้วย `user_id = ผู้เรียก` **และ** `business_id` ที่ core ยืนยันแล้ว · mark read กรองด้วยทั้งสองเสมอ · เส้น `/notification-preferences` และ `/push/*` ผูกกับ `ctx.user` เท่านั้น
- `notify()` ไม่ข้าม tenant: ผู้รับต้องเป็นสมาชิก active ของ `businessId` · ไม่เชื่อรายชื่อผู้รับจากข้อความลูกค้า/ผลของ model (ผู้เรียกฝั่ง server เป็นคนระบุ)
- `link` เป็น path ภายในแอปเท่านั้น (`/…`, ไม่ใช่ `//`, ยาว ≤ 500) ทั้งใน zod, CHECK ของ DB และใน service worker (`safeUrl`) · title/body เป็นข้อความธรรมดา (React escape) ห้ามใส่ข้อความลูกค้าเต็ม/เลขบัญชี/ยอดสลิปที่ระบุตัวตนในแจ้งเตือน (ผู้เรียกใส่ชื่อลูกค้าและสรุปสั้น ๆ ตามตาราง §5.3 เท่านั้น) · payload push เป็นข้อความเดียวกัน (≤ 100/200 ตัว) จึงไม่มีข้อมูลละเอียดไปที่บริการ push ของบุคคลที่สาม
- **SSRF:** ปฏิเสธ endpoint ที่ไม่ใช่ https หรือ host ไม่อยู่ในรายการ push service ที่รู้จัก ก่อนบันทึกและก่อนส่งทุกครั้ง (ตรวจซ้ำใน job)
- กุญแจ VAPID ส่วนตัวอยู่ใน env เท่านั้น (ไม่เข้า `VITE_*`, ไม่ log) · `p256dh`/`auth` ของ subscription เข้ารหัสด้วย `encryptSecret` · ห้าม log endpoint เต็ม (log เพียง `subscriptionId` และ host)
- rate limit: `/test` 5/นาที/ผู้ใช้ · `/push/test` 5/นาที/ผู้ใช้ · subscribe 10/ชม./ผู้ใช้ (`assertRateLimit`) · `notify()` ไม่จำกัดอัตราแต่จำกัดผู้รับ ≤ 200 ต่อครั้ง
- service worker ที่เสิร์ฟจาก API ไม่มี secret และไม่ cache ข้อมูลผู้ใช้ · `ack` ต้องมี cookie session + header CSRF ของ core (SW ส่ง `X-Requested-With`)
- PII: `notifications` มีชื่อลูกค้า (ในข้อความ) จึงถูกลบตามอายุข้อมูล (§8) และลบตาม cascade เมื่อผู้ใช้/ร้านถูกลบ

## 13. Edge cases

| กรณี | ผลที่ต้องได้ |
|---|---|
| `notify` ถูกเรียกระหว่าง DB ล่ม | log error แล้วคืน `{ notificationIds: [], mode:'real' }` ไม่ throw: flow ของผู้เรียกไม่ล้ม (แจ้งเตือนอาจหาย: ยอมรับเพราะไม่ใช่ข้อมูลธุรกรรม) |
| เหตุการณ์เดียวกันถูกยิงสองครั้ง (retry ของ job ผู้เรียก) | `dedupKey` กันซ้ำ (ผู้เรียกประกอบจาก id) |
| ผู้รับถูกถอดสิทธิ์/ถูก revoke หลังได้แจ้งเตือน | feed กรองตามสิทธิ์ ณ ตอนอ่าน · ร้านที่ถอดแล้ว request = 404/403 ตาม core |
| ผู้ใช้เป็นสมาชิกสองร้าน | กระดิ่งแสดงของร้านที่เลือก + จุด `elsewhere` สำหรับอีกร้าน |
| เบราว์เซอร์ลบ subscription / หมดอายุ (410) | job ลบแถว · ผู้ใช้เห็น "ยังไม่ได้เปิด push" ในครั้งถัดไป |
| ผู้ใช้เปิด push แต่ปิด `push` ของชนิดนั้น | ไม่ส่ง push (ตรวจซ้ำที่ job) · in-app ยังขึ้นตามค่า `inApp` |
| บัญชีเดียวสองเครื่อง | ส่ง push ทุกเครื่อง (สูงสุด 10) · แต่ละเครื่องมี `ref` ของตัวเอง ack แยก |
| เปิด push บนเครื่องที่ผู้ใช้อื่นเคยสมัคร (endpoint เดิม) | `ON CONFLICT (endpoint)` ย้ายเป็นผู้ใช้ปัจจุบัน (ผู้ใช้เดิมไม่ได้ push เครื่องนั้นอีก) |
| payload ยาวเกิน | ตัดที่ title 100 / body 200 ก่อนส่ง · แถว in-app ยังเก็บเต็ม (≤ 200 / ≤ 1000) |
| `link` ของผู้เรียกเป็น URL ภายนอก | `VALIDATION_ERROR` (ผู้เรียกผิดสัญญา) · ถ้าผู้เรียกครอบ try/catch ก็ไม่มีแจ้งเตือน |
| `VAPID_SUBJECT` ผิดรูป | boot log error ชื่อ key แล้วเป็น sandbox · bell ไม่กระทบ |
| ผู้ใช้ปิด in-app ของชนิด `report` แต่เปิด push | ไม่มีแถวและไม่มี push (push ผูกกับแถวแจ้งเตือน) |
| Render restart ระหว่าง push job | job ถูกเก็บใน DB: lease หมดแล้วรันซ้ำ idempotent (ไม่ส่งซ้ำ endpoint ที่ `accepted` แล้ว) |

## 14. Build order (slices)

Tier ต่อ slice (PLAN.md 21 พ.ย.): **S1 = P1** (เริ่มเมื่อ `LEAD: OPEN P1`) · S2–S4 = P2 (เริ่มเมื่อ `LEAD: OPEN P2`) · S1 ต้องทำให้กระดิ่งขึ้นเมื่อ AI ตอบล้มเหลวถาวร (F10 §5.9 ผ่าน F11 หรือ `notify` ตรง) และเมื่องานเบื้องหลังเข้า dead letter (F35) หลังลองใหม่ครบแล้ว

| Slice | เวลา | ทำอะไร | merge เมื่อ |
|---|---|---|---|
| **S1 · notify + bell** (สิ่งที่ทุก lane รอ) | ≤ 25 นาที | migration `001` (ครบทุกตาราง) · `defaults.ts`, `recipients.ts`, **`notify()` จริง** (ขั้น 1–8 §5.1 ยังไม่ enqueue push) · `GET /notifications`, `/unread-count`, `POST /read`, `POST /test` · bell ใน slot `topbarActions` + หน้า `/notifications` แท็บรายการ · `runDemo`/`resetDemo` · test 1, 5–8, 10–13, 19 + component test bell | CI เขียว · โพสต์ `DONE F31 … notify() จริงแล้ว TO:C1 TO:C2 TO:B1 TO:B2 TO:B3 TO:A1 TO:A2 TO:A3` |
| S2 · preferences | ≤ 15 นาที | `GET/PUT /notification-preferences` + ขั้น 5 ของ notify อ่านค่าจริง · แท็บตั้งค่า (สวิตช์ 9 ชนิด) · test 9 | slice ผ่าน test |
| S3 · web push | ≤ 30 นาที | `push.ts` (VAPID, allowlist), `sw.ts` + `GET /notifications/sw.js`, `subscribe`/`unsubscribe`/`ack`/`push/test`/`push/status`, job `notifications.push` + enqueue ในขั้น 7, schedule `notifications.purge`, UI การ์ด push ทุกสถานะ · test 2–4, 14–18 + component test push | slice ผ่าน test (push เป็น S จนกว่าจะมีขั้นยืนยันมือ) |
| S4 · smoke + production | ≤ 15 นาที | Playwright smoke (§10) กับ production · ตั้ง VAPID บน Render (คน C ทำ `npx web-push generate-vapid-keys` ครั้งเดียว) · ขั้นยืนยัน push จริงด้วยมือ · EVIDENCE.md (in-app R, push R/S/A ตามหลักฐาน) | smoke ผ่านบน production |

หลัง S1 merge: ทุก lane rebase แล้วรัน test ที่เรียก `notify` กับของจริง (prompts/README.md ข้อ 2) · ถ้าเวลาไม่พอตัด S3 ได้ (push = A และซ่อนการ์ด push) โดย S1–S2 ยังเป็น R

## 15. UNCONFIRMED และสิ่งที่ต้องตรวจในวันงาน

| ข้อ | วิธีตรวจ |
|---|---|
| สูตรชื่อ host ของบริการ push ที่ allowlist ครอบคลุมเบราว์เซอร์ของกรรมการ (Chrome/Edge: `*.googleapis.com`, `*.notify.windows.com`; Firefox: `*.push.services.mozilla.com`; Safari: `*.push.apple.com`) | สมัคร push จาก Chrome จริงบน production ดู `endpoint` host ที่ถูกเก็บ (log เฉพาะ host) · ถ้าเบราว์เซอร์ใดถูกปฏิเสธโดยไม่ควร เพิ่ม suffix ใน `ALLOWED_PUSH_HOSTS` พร้อมหลักฐาน |
| `RealtimeEvent` `notification.created` ถูกส่งเฉพาะ `userIds` โดย `publish` ของ core และ `useRealtime` ฝั่งเว็บส่ง event ถึงผู้รับ (ไม่ใช่ทั้งห้อง) | test 5 ตรวจที่ spy ของ `publish`; บน production ดูด้วยสองเบราว์เซอร์ (owner A และ staff A) ว่าเลขขึ้นเฉพาะคนที่เกี่ยวข้อง · ถ้า core ยังไม่รองรับ `userIds` ให้ client กรองด้วย `e.userId === me.id` (มีใน §7) แล้วโพสต์ `NEED TO:C1` |
| slot `topbarActions` วาดโดย TopBar ของ core จริง (F01 §13 ข้อ 7 อนุญาตให้เป็น no-op ตอน setup) | ตรวจใน PR S1: ถ้าไม่วาด ให้ใช้ลิงก์เมนู `/notifications` ที่มีเลข unread ชั่วคราวแล้วโพสต์ `NEED TO:C1` ให้ต่อ slot · กระดิ่งใน top bar เป็น A จนกว่าจะต่อ |
| core เสิร์ฟไฟล์ response `kind:'file'` ของ `GET /notifications/sw.js` ด้วย `Content-Type: text/javascript` โดยไม่ redirect และเบราว์เซอร์ยอมลงทะเบียนที่ scope `/api/v1/notifications/` | ลงทะเบียนจริงบน production ดู DevTools → Application → Service Workers · ถ้า `kind:'file'` ใส่ header ไม่ได้/บังคับดาวน์โหลด ให้ `NEED TO:C1` ขอ static route (`web/public/sw.js` ซึ่งเป็นพื้นที่ของ C1) |
| iOS Safari / Safari macOS รองรับ push ตามเงื่อนไข (ต้องติดตั้งเป็น PWA บน iOS) และ `VAPID_SUBJECT` แบบ `mailto:dev@example.test` ถูกบริการ push ยอมรับหรือไม่ | ลองกับ Chrome ก่อน (ผ่านตามปกติ) · ถ้า Apple/ Mozilla ตอบ 403 ให้เปลี่ยน `VAPID_SUBJECT` เป็น `mailto:` ของทีมจริงใน Render env (ไม่ใช่ secret) · รายงานผลของแต่ละเบราว์เซอร์ใน EVIDENCE.md |
| `web-push` 3.6.7 (`sendNotification` คืน `statusCode`, error เป็น `WebPushError` มี `statusCode`) ทำงานบน Node 24 | test 14 ใช้ fake; บน production ดูผลของ "ส่ง push ทดสอบ" จริงหนึ่งครั้ง · ถ้า API ต่างจากที่สเปกนี้ใช้ ให้ปรับ `push.ts` เฉพาะส่วนจับ status แล้วจดใน EVIDENCE.md |
| ลิงก์ในตาราง §5.3 ของ F13/F14/F15/F06/F23/F37 | ผู้เรียกแต่ละ lane ตรวจกับ route จริงใน spec ของตัวเองตอน wire `notify` · F31 ไม่ตรวจ path เกินรูปแบบ (`/…`) |
| union `NotifyInput.type` ไม่มีชนิดเฉพาะของ payment failed / job dead / import / follow-up / broadcast / eval | ใช้การจับคู่ใน §5.3 วันนี้ · ถ้าหัวหน้าต้องการแยกชนิด/ตั้งค่า push รายเหตุการณ์ ให้ `CHANGE` เพิ่มค่าใน union (เพิ่มได้แบบ backward-compatible) แล้ว F31 เพิ่มค่าใน CHECK ผ่าน migration `002` |
