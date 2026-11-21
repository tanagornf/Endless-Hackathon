# F04 business-settings — ตั้งค่าร้าน สวิตช์ AI เวลาทำการ และนโยบายการตอบ

| | |
|---|---|
| Lane / คน | **C3** / **C** · ลำดับ 1 ใน lane (F04 → F03 → F02 → F31) |
| Tier / เป้า | **P0** · เป้า **R** · อยู่บน golden path: gate 13:00 ขั้น 5 (ปิด AI แล้ว bot เงียบ) |
| Timebox | 30–60 นาที · **slice 1 (ตาราง + `getBusinessSettings` จริง + สวิตช์ AI) merge ก่อน 11:45** เพราะ B2 (F10), C2, A1, A3 เรียกใช้ใน core loop |
| เริ่มเมื่อ | `SETUP READY` |
| พึ่ง | core: `getBusiness`, `requirePermission`, `db`, `audit`, `publish`, `defineFeatureRoutes` · ตารางกลาง `businesses`, `accounts`, `memberships` (อ่าน/แก้ค่า `name`, `timezone`, `language`, `version` ของ `businesses` เท่านั้น ไม่ ALTER) |
| ให้ | `getBusinessSettings(businessId)` (contracts.ts) · **Contract additions** ใน §4: `ensureBusinessSettings`, `getEffectiveAnswerRules`, `getBusinessOpenState`, `getBusinessProfile`, `getCapabilities` |
| ใช้ | ดู §4 |
| โฟลเดอร์ | `server/src/features/business-settings/` · `shared/features/business-settings/types.ts` · `web/src/features/business-settings/` |
| Web path | `/business` (host ของ slot `businessTabs`), `/bot-settings` (เมนูกลุ่ม `settings`) |

อ่าน: `contracts.ts` (`BusinessSettings`, `AnswerPolicy`, `WeeklyHours`, `PERMISSIONS`, slot `businessTabs`) · [F01-core](F01-core.md) §2 (ตาราง `businesses`), §4 (`getBusiness`) · [F10 §5.11](F10-ai-agent.md) (capability ∩ policy) · [COOKBOOK](../COOKBOOK.md) §2, §4, §9, §10

## 1. เป้าหมายและ user stories

ทำไมมี: ร้านต้องคุมได้ว่าบอทตอบหรือเงียบ ตอบอะไรได้ (ราคา สต็อก ช่องทางติดต่อ ความรู้ทั่วไป การจอง) และร้านเปิดเมื่อไร ค่าเหล่านี้เป็น **ความจริงมีแหล่งเดียว** ที่ F10 อ่านทุก turn (`aiEnabled`, `answerPolicy`, `hours`) และ F15/F16/F17 อ่านเวลาทำการ ถ้าสวิตช์ AI ไม่ทำงานจริงที่ production ขั้น 5 ของ gate ไม่ผ่านและ demo จะตอบลูกค้าตอนที่เจ้าของสั่งปิดแล้ว

ผู้ใช้: เจ้าของร้าน (ทุกอย่าง) · พนักงาน (ดูอย่างเดียว ถ้ามี `business.read`; แก้ได้ตามสิทธิ์ที่ได้รับ)

User stories:
1. เจ้าของกดสวิตช์ "ให้ AI ตอบลูกค้า" เป็นปิด → ข้อความลูกค้าถัดไปถูกบันทึกแต่บอทเงียบทุกช่องทางรวม Demo Chat · เปิดกลับแล้วตอบได้
2. เจ้าของตั้งเวลาเปิด-ปิดรายวัน (หลายช่วงต่อวันได้) และวันหยุดพิเศษ (ช่วงวันที่ + เหตุผล) ตามเวลา Asia/Bangkok แล้วเห็นผลทันทีว่า "ตอนนี้ร้านเปิดหรือปิด ครั้งถัดไปเปิดเมื่อไร"
3. เจ้าของตั้ง answer policy: ซ่อนราคา/สต็อก/ช่องทางติดต่อ, ตอบจากข้อมูลร้านเท่านั้น, ปิดรับจอง · ตั้งเรื่องเดียวแล้วเรื่องอื่นไม่หาย · ค่าที่ไม่ถูกต้องถูกปฏิเสธพร้อมบอกว่าผิดตรงไหน
4. เจ้าของตั้ง capability ของร้าน (ร้านนี้บอกราคาได้ รับออเดอร์ได้ รับจองได้ ส่งต่อคนได้ ให้ช่องทางติดต่อได้) และเห็น "ผลที่ได้จริง" = capability ∩ policy แบบ deny ชนะ
5. เจ้าของแก้ข้อมูลร้าน (ชื่อ, คำอธิบาย, เบอร์, อีเมล, ที่อยู่), ภาษาตอบเริ่มต้นของบอท (th/en · เป็นค่าเริ่มต้นเมื่อบอกภาษาของลูกค้าไม่ได้ ไม่ใช่ตัวล็อก: F10 §5.13) และเขตเวลา
6. พนักงานที่ไม่มีสิทธิ์เห็นหน้าได้แต่ปุ่มบันทึกถูกปิด และ API ปฏิเสธ 403 · ผู้ใช้ร้าน A เปิดร้าน B ไม่ได้ (404)

นอก scope (รายงานตามจริง ไม่ทำ): `ai_new_friends_only`, `ai_force_on` ต่อบทสนทนา, persona/tone/formality (F10 ใช้ prompt กลางตายตัว), `disclaimer`/`food_safety` policy, แผนที่/geocoding, หน้า Delivery (อยู่ F13), versions/activation ของ capability (เก็บค่าเดียว), ช่วงปิดบางส่วนของวัน (closure เป็นเต็มวันเท่านั้น)

## 2. Data model

`server/src/features/business-settings/migrations/001_business_settings.sql` (ไม่ ALTER ตารางกลาง · ไม่มีแถว = ใช้ค่าเริ่มต้นในโค้ด จึงไม่ต้องมี backfill):

```sql
-- dependsOn: core
CREATE TABLE business_settings (
  business_id uuid PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  ai_enabled boolean NOT NULL DEFAULT true,
  hours jsonb NOT NULL,                              -- WeeklyHours (ตรวจโดย validateWeeklyHours ก่อนเขียนเสมอ)
  answer_policy jsonb,                               -- null = อนุญาตทุกอย่าง · เก็บเฉพาะค่าที่จำกัด (ดู §5.3)
  capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,   -- MerchantCapabilities บางส่วน; key ที่ไม่มี = ค่าเริ่มต้น true
  version int NOT NULL DEFAULT 1,                    -- +1 ทุกครั้งที่แก้อะไรก็ตามของร้านนี้ใน F04 (ใช้เป็น expectedVersion)
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(hours) = 'object'),
  CHECK (answer_policy IS NULL OR jsonb_typeof(answer_policy) = 'object'),
  CHECK (jsonb_typeof(capabilities) = 'object')
);

CREATE TABLE business_profiles (
  business_id uuid PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 1000),
  contact_phone text CHECK (contact_phone IS NULL OR char_length(contact_phone) <= 30),
  contact_email text CHECK (contact_email IS NULL OR char_length(contact_email) <= 200),
  address text CHECK (address IS NULL OR char_length(address) <= 300),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE business_closures (                     -- วันหยุดพิเศษ เป็นวันที่ท้องถิ่น (ตามเวลา timezone ของร้าน) เต็มวัน
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text NOT NULL DEFAULT '' CHECK (char_length(reason) <= 200),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date),
  CHECK (end_date - start_date <= 365)
);
CREATE INDEX business_closures_range ON business_closures (business_id, start_date, end_date);
```

กฎ:
- ค่าที่อยู่ใน core: `businesses.name`, `businesses.timezone`, `businesses.language` (F04 เป็นผู้แก้ค่าเหล่านี้ด้วย `UPDATE businesses SET … version = version + 1, updated_at = now()` เท่านั้น: ไม่ ALTER) · ชื่อร้านไม่ว่างเปล่า 2–80 ตัวอักษร (หลัง trim)
- `business_settings.version` คือ `BusinessSettings.version` ใน contract · แก้ชื่อ/timezone/language ก็ bump `business_settings.version` (และ `businesses.version`) ด้วย เพื่อให้ผู้เรียกที่ cache รู้ว่ามีการเปลี่ยน
- ค่าเริ่มต้นเมื่อไม่มีแถว (ค่าคงที่ `DEFAULTS` ใน `defaults.ts`): `aiEnabled = true`, `answerPolicy = null`, `capabilities = {}` (ทุก facet true), `version = 1`, `hours` = จันทร์–เสาร์ `09:00–18:00`, อาทิตย์ว่าง · แถวถูกสร้างครั้งแรกด้วย `INSERT … ON CONFLICT (business_id) DO NOTHING` ก่อน UPDATE ทุกครั้ง (`ensureRow()`)
- closure ซ้อนทับกันไม่ได้ (ตรวจใน transaction ภายใต้ `pg_advisory_xact_lock(hashtext('bizsettings:' || business_id))` เพราะไม่ใช้ extension `btree_gist`)

## 3. API endpoints

ทุก path ใต้ `/api/v1/businesses/:businessId/settings` · `defineFeatureRoutes({ featureId: 'F04', slug: 'business-settings' })` · auth `business` ทุกเส้น (404 เมื่อไม่ใช่สมาชิก)

| Method | Path | permission | Request | Response | Errors |
|---|---|---|---|---|---|
| GET | `/` | `business.read` | — | `SettingsView` | — |
| PUT | `/ai` | `business.bot_settings` | `AiSwitchBody` | `SettingsView` | VALIDATION_ERROR |
| PUT | `/profile` | `business.update` | `ProfileBody` | `SettingsView` | VALIDATION_ERROR, VERSION_CONFLICT |
| PUT | `/locale` | `business.update` | `LocaleBody` | `SettingsView` | VALIDATION_ERROR, VERSION_CONFLICT |
| PUT | `/hours` | `business.update` | `HoursBody` | `SettingsView` | VALIDATION_ERROR, VERSION_CONFLICT |
| PATCH | `/answer-policy` | `business.bot_settings` | `PolicyPatchBody` | `SettingsView` | VALIDATION_ERROR, VERSION_CONFLICT |
| PUT | `/capabilities` | `business.bot_settings` | `CapabilitiesBody` | `SettingsView` | VALIDATION_ERROR, VERSION_CONFLICT |
| GET | `/closures` | `business.read` | `ClosuresQuery` | `{ items: BusinessClosure[] }` | VALIDATION_ERROR |
| POST | `/closures` | `business.update` | `ClosureBody` | `BusinessClosure` | VALIDATION_ERROR |
| DELETE | `/closures/:closureId` | `business.update` | — | no_content | NOT_FOUND |
| GET | `/open-state` | `business.read` | `OpenStateQuery` | `BusinessOpenState` | VALIDATION_ERROR |

หมายเหตุสถานะ: ค่าที่ไม่ผ่านการตรวจทุกชนิด (รูปแบบ zod และกฎความหมายอย่าง hours ซ้อนกัน, timezone ไม่รู้จัก, policy มี key แปลก) ตอบ `VALIDATION_ERROR` = **HTTP 400** ตาม `ERROR_HTTP_STATUS` ใน contracts.ts พร้อม `details.issues: { path: string; code: string; message: string }[]` (backlog เขียน "422" แต่ contract map `VALIDATION_ERROR` เป็น 400 และ `POLICY_BLOCKED` เป็น 422 ซึ่งมีความหมายอื่น ยึด contract) · `PUT /ai` ไม่ต้องส่ง `expectedVersion` (idempotent: ตั้งค่าเป็นค่าที่ระบุ) ส่วนที่เหลือต้องส่ง

```ts
// server/src/features/business-settings/schemas.ts
import { z } from 'zod';
export const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const Interval = z.object({ open: HHMM, close: HHMM }).strict();
const Day = z.array(Interval).max(4);
export const WeeklyHoursSchema = z.object({
  mon: Day, tue: Day, wed: Day, thu: Day, fri: Day, sat: Day, sun: Day,
}).strict();                                   // ความหมาย (ลำดับ/ซ้อน) ตรวจต่อใน validateWeeklyHours §5.1

export const AiSwitchBody = z.object({ enabled: z.boolean() }).strict();
export const ProfileBody = z.object({
  expectedVersion: z.number().int().min(1),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(1000),
  contactPhone: z.string().trim().max(30).regex(/^[0-9+()\- ]*$/).nullable(),
  contactEmail: z.string().trim().max(200).email().nullable(),
  address: z.string().trim().max(300).nullable(),
}).strict();                                   // '' ถูกแปลงเป็น null ของ phone/email/address ใน service
export const LocaleBody = z.object({
  expectedVersion: z.number().int().min(1),
  timezone: z.string().min(1).max(64),         // ตรวจด้วย isValidTimeZone §5.2
  language: z.enum(['th', 'en']),
}).strict();
export const HoursBody = z.object({ expectedVersion: z.number().int().min(1), hours: WeeklyHoursSchema }).strict();

const Reveal3 = z.enum(['always', 'never', 'ask_staff']);
export const AnswerPolicySchema = z.object({
  price: z.object({ reveal: Reveal3 }).strict().optional(),
  stock: z.object({ reveal: Reveal3 }).strict().optional(),
  contact: z.object({ reveal: z.enum(['always', 'never']) }).strict().optional(),
  generalKnowledge: z.boolean().optional(),
  booking: z.object({ enabled: z.boolean() }).strict().optional(),
}).strict();                                   // ตรงกับ AnswerPolicy ใน contracts.ts ทุก key
// PATCH: key ที่ไม่ส่ง = คงเดิม · ค่า null = ล้างกฎนั้น (กลับเป็นอนุญาต) · `policy: null` = ล้างทั้งก้อน
export const PolicyPatchBody = z.object({
  expectedVersion: z.number().int().min(1),
  policy: z.union([
    z.null(),
    z.object({
      price: z.object({ reveal: Reveal3 }).strict().nullable().optional(),
      stock: z.object({ reveal: Reveal3 }).strict().nullable().optional(),
      contact: z.object({ reveal: z.enum(['always', 'never']) }).strict().nullable().optional(),
      generalKnowledge: z.boolean().nullable().optional(),
      booking: z.object({ enabled: z.boolean() }).strict().nullable().optional(),
    }).strict(),
  ]),
}).strict();
export const CapabilitiesSchema = z.object({
  canQuotePrices: z.boolean(), canTakeOrders: z.boolean(), canTakeBookings: z.boolean(),
  canHandoffToHuman: z.boolean(), canShareContact: z.boolean(),
}).strict();
export const CapabilitiesBody = z.object({ expectedVersion: z.number().int().min(1), capabilities: CapabilitiesSchema }).strict();

const LocalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);   // วันที่จริงตรวจใน isRealDate §5.2
export const ClosureBody = z.object({ startDate: LocalDate, endDate: LocalDate, reason: z.string().trim().max(200).default('') }).strict();
export const ClosuresQuery = z.object({ scope: z.enum(['upcoming', 'all']).default('upcoming') });
export const OpenStateQuery = z.object({ at: z.string().datetime().optional() });
```

```ts
// shared/features/business-settings/types.ts  (BusinessSettings, AnswerPolicy ตาม contracts.ts ทุกตัวอักษร: re-export จาก shared/core ห้ามประกาศซ้ำ)
export interface BusinessProfile { name: string; description: string; contactPhone: string | null; contactEmail: string | null; address: string | null }
export interface BusinessClosure { id: string; startDate: string; endDate: string; reason: string }   // 'YYYY-MM-DD' วันที่ท้องถิ่นของร้าน
export interface MerchantCapabilities {
  canQuotePrices: boolean;     // ร้านบอกราคาลูกค้าได้ (false = ไม่เคยเปิดเผยราคา)
  canTakeOrders: boolean;      // รับออเดอร์ผ่านแชต (propose_order)
  canTakeBookings: boolean;    // รับจองผ่านแชต (find_slots / propose_booking)
  canHandoffToHuman: boolean;  // ส่งต่อให้พนักงานได้ (handoff_to_staff)
  canShareContact: boolean;    // เปิดเผยเบอร์/อีเมลร้านได้
}
export interface EffectiveAnswerRules {   // capability ∩ policy, deny ชนะ · F10 ใช้ตัดสิน tool/directive
  price: 'always' | 'never' | 'ask_staff';
  stock: 'always' | 'never' | 'ask_staff';
  contact: 'always' | 'never';
  generalKnowledge: boolean;
  booking: boolean;
  orders: boolean;
  handoff: boolean;
}
export interface BusinessOpenState {
  open: boolean;
  reason: 'open' | 'outside_hours' | 'closed_day' | 'closure';
  localDate: string; localTime: string; timezone: string;        // 'YYYY-MM-DD' · 'HH:mm'
  nextOpenAt: string | null;                                      // ISO UTC; null = ไม่มีเวลาเปิดใน 31 วันข้างหน้า
  closure: BusinessClosure | null;                                // มีเมื่อ reason = 'closure'
}
export interface SettingsView {
  settings: BusinessSettings;                 // aiEnabled = ค่าที่มีผลจริง (รวมสถานะร้าน §5.4)
  aiSwitch: boolean;                          // ค่าที่เจ้าของตั้ง
  aiBlockedReason: null | 'business_inactive' | 'account_inactive';
  profile: BusinessProfile;
  capabilities: MerchantCapabilities;         // ครบ 5 key (เติมค่าเริ่มต้นแล้ว)
  effectiveRules: EffectiveAnswerRules;
}
```

## 4. Service functions และ contracts

ไฟล์ภายใน: `service.ts` (public) · `defaults.ts` · `schemas.ts` · `hours.ts` (validateWeeklyHours, zone math) · `closures.ts` · `policy.ts` (normalizePolicy, mergePolicy, resolveRules) · `repo.ts` · `routes.ts` · `seed.ts` · `*.test.ts`

**Contract ที่ F04 ให้ (ตรง contracts.ts ทุกตัวอักษร):**

```ts
export declare function getBusinessSettings(businessId: string): Promise<BusinessSettings>;
```
พฤติกรรม: คืน `BusinessSettings { businessId, aiEnabled, timezone, hours, answerPolicy, language, version }` ไม่เคย null · businessId ไม่มีอยู่ = `AppError('NOT_FOUND')` · `timezone`/`language` มาจาก `businesses` (join) · `aiEnabled` = `ai_enabled AND businesses.status = 'active' AND accounts.status = 'active'` (ร้านถูกระงับ/ลบแล้ว bot ต้องเงียบ) · ไม่มีแถว `business_settings` = ค่า `DEFAULTS` · ไม่ cache (query เดียว PK + join: F10 เรียกทุก turn และเรียกซ้ำก่อน persist ตามกฎ "เช็กสวิตช์ 2 รอบ") · `answerPolicy` ที่เก็บแล้ว parse ด้วย `AnswerPolicySchema` ไม่ผ่าน (ข้อมูลเสียจากการแก้ DB มือ) = **fail closed**: คืนนโยบายเข้มสุด `{ price:{reveal:'never'}, stock:{reveal:'never'}, contact:{reveal:'never'}, generalKnowledge:false, booking:{enabled:false} }` + log error (ไม่ throw)

ฟังก์ชันภายใน `service.ts` (เรียกจาก routes): `getSettingsView` · `setAiEnabled` · `updateProfile` · `updateLocale` · `updateHours` · `patchAnswerPolicy` · `updateCapabilities` · `listClosures` · `createClosure` · `deleteClosure` · `getOpenState`

### Contract additions

```ts
// shared/features/business-settings/types.ts  +  server/src/features/business-settings/service.ts — F04 · C3
// BusinessProfile, BusinessClosure, MerchantCapabilities, EffectiveAnswerRules, BusinessOpenState: ดู §3

/**
 * @owner F04 business-settings · C3 · consumer: F03 tenancy (onboarding, หลังสร้างร้าน), seeds
 * Creates the business_settings row (+ business_profiles row) with DEFAULTS when missing; idempotent.
 * Unknown business → NOT_FOUND. @fake getBusinessSettings(businessId) (SEED values, no write).
 */
export declare function ensureBusinessSettings(businessId: string): Promise<BusinessSettings>;

/**
 * @owner F04 · consumers: B2 F10 (tool gating + directives, F10 spec §5.11), A3 F15 (booking.enabled)
 * capability ∩ answerPolicy, deny wins. Never null. Unknown business → NOT_FOUND.
 * @fake all permissive: price 'always', stock 'always', contact 'always', generalKnowledge true, booking true, orders true, handoff true.
 */
export declare function getEffectiveAnswerRules(businessId: string): Promise<EffectiveAnswerRules>;

/**
 * @owner F04 · consumers: B2 F10 (optional "closed today" hint), A3 F15/F16, C2
 * Open/closed at `at` (default now) in the business timezone using hours + closures. Unknown business → NOT_FOUND.
 * @fake { open: true, reason: 'open', timezone: 'Asia/Bangkok', nextOpenAt: null, closure: null, localDate/localTime from `at` }
 */
export declare function getBusinessOpenState(businessId: string, at?: string): Promise<BusinessOpenState>;

/** @owner F04 · consumers: B2 F10 (only when rules.contact === 'always'). Unknown business → NOT_FOUND.
 *  @fake { name from SEED.businesses, description: '', contactPhone: null, contactEmail: null, address: null } */
export declare function getBusinessProfile(businessId: string): Promise<BusinessProfile>;

/** @owner F04. Stored capabilities with defaults filled. Unknown business → NOT_FOUND. @fake all five true. */
export declare function getCapabilities(businessId: string): Promise<MerchantCapabilities>;
```

Contract ที่ใช้: core `getBusiness`/`requirePermission` (ผ่าน `defineFeatureRoutes`), `db`, `audit`, `publish` · ไม่เรียกฟีเจอร์อื่น (ไม่มี `service.ts` ของ lane อื่นในไฟล์นี้) · F03 เรียก `ensureBusinessSettings` หลังสร้างร้านแบบ best effort (ล้มก็ไม่เป็นไรเพราะมีค่าเริ่มต้น)

## 5. Algorithms

ค่าคงที่ใน `defaults.ts`: `MAX_INTERVALS_PER_DAY = 4` · `MAX_CLOSURES = 200` · `MAX_CLOSURE_DAYS = 366` · `OPEN_LOOKAHEAD_DAYS = 31` · `DEFAULT_HOURS` (ข้างบน) · `DEFAULT_CAPABILITIES` (ห้า key เป็น true) · `NAME_MIN = 2`, `NAME_MAX = 80`

### 5.1 `validateWeeklyHours(hours): Issue[]` (ต่อจาก zod)

ต่อวัน `d` ใน 7 วัน, ช่วง `i` เรียงตามลำดับที่ส่ง:
1. `open < close` เทียบสตริง `HH:mm` (เวลาในวันเดียว ไม่รองรับข้ามเที่ยงคืน: ร้านเปิดเลยเที่ยงคืนให้แยกเป็นสองวัน เช่น `18:00–23:59` กับ `00:00–02:00` วันถัดไป) ไม่ผ่าน = `{ path: 'hours.<d>.<i>', code: 'close_before_open' }`
2. ช่วงต้องเรียงจากเช้าไปเย็น และ `intervals[i].open > intervals[i-1].close` (ติดกันพอดีหรือซ้อน = `overlap_or_touching` แนะนำให้รวมเป็นช่วงเดียว)
3. ว่างทั้ง 7 วัน = **ถูกต้อง** (ปิดทุกวัน) ไม่ fallback ไปเวลาอื่น และไม่อ่านข้อความเวลาใน knowledge
4. ผ่านแล้ว normalize: เรียงช่วง, เก็บ key ครบ 7 วัน → `hours` jsonb

### 5.2 เวลาและ timezone (ไม่ใช้ library)

- `isValidTimeZone(tz)`: `try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true } catch { return false }` และ `tz` ต้องมี `/` หรือเป็น `UTC` (กันชื่อย่ออย่าง `EST` ที่กำกวม) · ไม่ผ่าน = issue `invalid_timezone`
- `localParts(instant: Date, tz)`: `new Intl.DateTimeFormat('en-US', { timeZone: tz, year:'numeric', month:'2-digit', day:'2-digit', weekday:'short', hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).formatToParts(instant)` → `{ date:'YYYY-MM-DD', time:'HH:mm', weekday: 'mon'…'sun' }` (map `Mon`→`mon`)
- `tzOffsetMinutes(instant, tz)`: จาก `localParts` สร้าง `Date.UTC(y,m-1,d,h,min)` ลบ `instant` (ตัดวินาทีทั้งสองด้าน) หน่วยนาที
- `localToUtc(date:'YYYY-MM-DD', time:'HH:mm', tz): Date`: เดา `g = Date.UTC(date,time)`; `o1 = tzOffsetMinutes(g - …)`; `r = g - o1*60000`; คำนวณ offset ที่ `r` ซ้ำ ถ้าต่างให้ใช้ค่าใหม่ (รอบเดียวพอ) · Asia/Bangkok = UTC+7 ไม่มี DST แต่โค้ดต้องถูกกับ timezone ที่มี DST
- `isRealDate(s)`: `new Date(s + 'T00:00:00Z').toISOString().slice(0,10) === s`
- `todayLocal(tz, now)` = `localParts(now, tz).date`

### 5.3 Answer policy

`normalizePolicy(p)`: ลบกฎที่เท่ากับค่าเริ่มต้น (`price/stock.reveal = 'always'`, `contact.reveal = 'always'`, `generalKnowledge = true`, `booking.enabled = true`) แล้วถ้าว่าง = `null` (เก็บเฉพาะค่าที่จำกัด)
`mergePolicy(stored, patch)`: เริ่มจาก `stored ?? {}` → ต่อ key ใน `patch`: `null` = ลบ key · มีค่า = แทนที่ key นั้นทั้งก้อน · key ที่ไม่มีใน patch = คงเดิม (**save price แล้ว `booking` ต้องไม่หาย**) → `normalizePolicy` → ถ้า `policy: null` ทั้งก้อน = ล้างเป็น `null`
`ask_staff` มีความหมายเหมือน `never` ฝั่ง F10 (ไม่พูดราคา/สต็อก บอกให้ถามร้าน) ต่างกันที่ข้อความในหน้า (ให้ถามพนักงาน) และ audit

### 5.4 Capability ∩ policy → `resolveRules(caps, policy)` (ฟังก์ชันบริสุทธิ์ใน `policy.ts`)

```
caps   = { ...DEFAULT_CAPABILITIES, ...stored }          // key ที่ไม่มี = true
price  = !caps.canQuotePrices ? 'never' : (policy?.price?.reveal ?? 'always')
stock  = policy?.stock?.reveal ?? 'always'
contact= !caps.canShareContact ? 'never' : (policy?.contact?.reveal ?? 'always')
generalKnowledge = policy?.generalKnowledge !== false
booking = caps.canTakeBookings && policy?.booking?.enabled !== false
orders  = caps.canTakeOrders && price === 'always'       // F10: ซ่อนราคา = ปิด propose_order
handoff = caps.canHandoffToHuman
```
deny ชนะ: ถ้า capability ปิดหรือ policy ปิดอย่างใดอย่างหนึ่งผลเป็นปิด · F10 อ่านผลนี้ (ผ่าน `getEffectiveAnswerRules`) เพื่อเลือก tool/directive ตามตารางใน F10 §5.11

### 5.5 สวิตช์ AI (`setAiEnabled`)

1. `requirePermission('business.bot_settings')` ทำโดย core ตาม route · `ensureRow` · `UPDATE business_settings SET ai_enabled=$2, version=version+1, updated_by=$3, updated_at=now() WHERE business_id=$1 AND ai_enabled IS DISTINCT FROM $2 RETURNING version` (ตั้งค่าเดิมซ้ำ = ไม่ bump, ไม่ audit ซ้ำ)
2. เปลี่ยนจริง: `audit({ action:'business-settings.ai.toggle', details:{ from, to } })` + `publish(businessId, { type:'custom', featureId:'F04', name:'business-settings.changed', data:{ version } })`
3. **ไม่เขียนตารางบทสนทนา** (`conversations` เป็นของ core/A1): เพราะ `aiEnabled = false` ทำให้ F10 เงียบทุกช่องทางและทุกบทสนทนาแม้ `ai_force_on` ก็ไม่มีผล (F10 เช็กสวิตช์ก่อนเสมอ) · ข้อความเข้ายังถูกบันทึกโดย F09 ตามเดิม
4. การเปลี่ยนมีผลกับ turn ถัดไปทันที (ไม่มี cache) · turn ที่กำลังทำงานอยู่จะถูกหยุดที่การเช็กรอบสองของ F10 ก่อน persist

### 5.6 บันทึกค่าอื่น (profile/locale/hours/policy/capabilities)

ทุกเส้นเดียวกัน: transaction → `ensureRow` → `SELECT version … FOR UPDATE` → `version ≠ expectedVersion` = `VERSION_CONFLICT` (`details.currentVersion`) → validate → UPDATE (+ `version = version + 1`, `updated_by`) → ถ้าเป็น profile/locale: `UPDATE businesses` ด้วย (ชื่อ/timezone/language, `version+1`) และ upsert `business_profiles` → audit (ตาราง §8) → publish `business-settings.changed` → คืน `SettingsView` ใหม่ · เปลี่ยน `timezone` แล้ว `hours` ไม่ถูกแปลง (เป็นเวลาท้องถิ่นของ timezone ใหม่) และหน้าเว็บเตือนก่อนยืนยัน

### 5.7 closures

`createClosure`: ตรวจ `isRealDate` ทั้งสอง · `end >= start` · span ≤ 366 วัน · `end >= todayLocal(tz)` (ไม่เพิ่มวันหยุดที่จบไปแล้ว; ปลายวันนี้ได้) · จำนวนรวมของร้าน < 200 · ไม่ซ้อนกับที่มี (`start <= existing.end AND end >= existing.start` → issue `closure_overlap`, `details.conflictId`) → INSERT → audit `business-settings.closure.create` · `listClosures`: `upcoming` = `end_date >= todayLocal` เรียง `start_date` · `all` เรียงใหม่→เก่า สูงสุด 200

### 5.8 `getBusinessOpenState(businessId, at)`

1. โหลด timezone, hours, closures ที่ `end_date >= localDate` · `localParts(at, tz)` → `localDate`, `localTime`, `weekday`
2. closure ที่ครอบ `localDate` → `{ open:false, reason:'closure', closure }`
3. `hours[weekday]` ว่าง → `closed_day` · มีช่วงที่ `open <= localTime < close` → `open` · ไม่ใช่ → `outside_hours`
4. `nextOpenAt` (เมื่อปิด): วน `k = 0…31` วัน: วันที่ `D = localDate + k`; ข้ามถ้ามี closure ครอบ `D`; ช่วงของ weekday(D) ที่ `k = 0 ? open > localTime : ทุกช่อง` ช่วงแรกที่พบ → `localToUtc(D, open, tz).toISOString()` · ไม่พบใน 31 วัน = `null`
5. ตัวอย่างที่ test ต้องได้ (ร้าน A: ทุกวัน 10:00–20:00 Asia/Bangkok) ที่ `2026-11-21T03:00:00Z` (10:00 น.) → `open` · `2026-11-21T14:00:00Z` (21:00 น.) → `outside_hours`, `nextOpenAt = 2026-11-22T03:00:00.000Z` · ร้าน B (จันทร์–เสาร์ 09:00–18:00): `2026-11-22T03:00:00Z` (อาทิตย์ 10:00 น.) → `closed_day`, `nextOpenAt = 2026-11-23T02:00:00.000Z` · closure 22–23 พ.ย. ร้าน B ทำให้ `nextOpenAt = 2026-11-24T02:00:00.000Z`

## 6. AI calls

ไม่มี AI call (ฟีเจอร์นี้ไม่เรียก `model.*` เลย) · F10 เป็นผู้ใช้ค่า `answerPolicy`/`getEffectiveAnswerRules` สร้าง directive ตาม F10 §5.11

## 7. UI

Route: `/business` (`permission: 'business.read'`, `titleKey: 'business-settings:business.title'`) และ `/bot-settings` (`permission: 'business.read'`, `titleKey: 'business-settings:bot.title'`) · เมนูกลุ่ม `settings`: `{ path:'/business', labelKey:'business-settings:menu.business', group:'settings', icon:'StorefrontOutlined', order:10, permission:'business.read', searchTerms:['ร้าน','ข้อมูลร้าน','เวลาทำการ','วันหยุด','business','hours'] }` · `{ path:'/bot-settings', labelKey:'business-settings:menu.bot', group:'settings', icon:'SmartToyOutlined', order:20, permission:'business.read', searchTerms:['บอท','AI','ปิด AI','นโยบาย','bot','policy'] }`

ใช้ UI kit ของ core: `PageHeader`, `SectionCard`, `FormDialog`, `ConfirmDialog`, `EmptyState`, `StatusChip`, `DataTable`, `useToast`, `useApiQuery('/settings')`, `useApiMutation`, `useCan`, `useRealtime('custom', …)`, `formatDateTime`, `useSlot('businessTabs')` · ผู้ไม่มีสิทธิ์แก้: ทุกช่องเป็น `disabled` + ข้อความ "ต้องมีสิทธิ์…" (`useCan` เป็นเพียงความสะดวก API บังคับจริง)

**หน้า `/business`** (`BusinessPage.tsx`): `PageHeader` + MUI `Tabs`:
1. แท็บ `profile` "ข้อมูลร้าน": ฟอร์มชื่อ/คำอธิบาย/เบอร์/อีเมล/ที่อยู่ + การ์ด "ภาษาและเขตเวลา" (Select ภาษาตอบเริ่มต้น th/en, Select timezone: รายการสั้น `Asia/Bangkok`, `Asia/Singapore`, `Asia/Tokyo`, `UTC` + พิมพ์ค่า IANA อื่นได้ผ่าน Autocomplete freeSolo) · ปุ่มบันทึกแยกต่อการ์ด (`PUT /profile`, `PUT /locale`) · เปลี่ยน timezone แล้วขึ้น `ConfirmDialog` เตือนว่าเวลาทำการจะถูกอ่านเป็นเวลาท้องถิ่นใหม่
2. แท็บ `hours` "เวลาทำการและวันหยุด": การ์ดสถานะตอนนี้ (`GET /open-state` → chip "เปิดอยู่"/"ปิดอยู่" + "เปิดอีกครั้ง …") · ตารางเวลา 7 แถว (จันทร์–อาทิตย์): Switch เปิดวันนั้น + 1–4 ช่วง (`TextField type="time"` สองช่อง + ปุ่มลบ/เพิ่มช่วง) + ปุ่ม "คัดลอกไปทุกวัน" · ข้อผิดพลาด `details.issues` ชี้ที่แถว/ช่วงนั้นด้วยข้อความใต้ช่อง · การ์ดวันหยุดพิเศษ: `DataTable` (วันที่เริ่ม–สิ้นสุด, เหตุผล, ลบ) + ปุ่ม "เพิ่มวันหยุด" → `FormDialog` (สอง `TextField type="date"` + เหตุผล)
3. แท็บจาก slot `businessTabs` (`useSlot('businessTabs')` เรียงตาม `order`, กรองสิทธิ์ แล้วต่อท้ายแท็บของ F04; แต่ละแท็บเรนเดอร์ `load()` ด้วย props `{ businessId }` ใน `React.Suspense` + error boundary ที่แสดง `EmptyState` เมื่อแท็บนั้นพัง ไม่ทำให้หน้าทั้งหน้าล่ม · key แท็บ = `slot.id`, ป้าย = `t(labelKey)`) · คน lane อื่นเพิ่มแท็บได้โดยไม่แก้ไฟล์ของ F04

**หน้า `/bot-settings`** (`BotSettingsPage.tsx`):
1. `SectionCard` "ให้ AI ตอบลูกค้า": Switch (`data-testid="ai-switch"`) · เปลี่ยนเป็นปิด → `ConfirmDialog` ("บอทจะไม่ตอบลูกค้าทุกช่องทางจนกว่าจะเปิดใหม่ ข้อความที่เข้ามายังถูกบันทึก") · ใช้ `PUT /ai` ทันที (ไม่มีปุ่มบันทึก) แล้ว toast · เมื่อ `aiBlockedReason ≠ null` แสดง `Alert warning` ว่าร้านถูกระงับ บอทเงียบอยู่แม้สวิตช์เปิด
2. `SectionCard` "สิ่งที่บอทตอบได้" (answer policy): Select ราคา/สต็อก (`always` ตอบได้ · `ask_staff` ให้ถามพนักงาน · `never` ไม่เปิดเผย), Select ช่องทางติดต่อ (`always`/`never`), Switch "ตอบจากข้อมูลร้านเท่านั้น" (= `generalKnowledge:false`), Switch "รับจองผ่านแชต" · ปุ่มบันทึกส่งเฉพาะ key ที่ผู้ใช้แก้ (patch) · ปุ่ม "ล้างเป็นค่าเริ่มต้น" (`policy: null`)
3. `SectionCard` "ความสามารถของร้าน" (capabilities): Switch ห้าม key พร้อมคำอธิบายสั้น · บันทึก `PUT /capabilities`
4. `SectionCard` "ผลที่บอทจะทำจริง": แสดง `effectiveRules` เป็น chip รายการ (ราคา: ตอบได้/ถามพนักงาน/ไม่เปิดเผย · สต็อก · ช่องทางติดต่อ · ความรู้ทั่วไป · จอง · เสนอออเดอร์ · ส่งต่อคน) พร้อมหมายเหตุ "ถ้า capability หรือ policy ข้อใดปิด ผลคือปิด"
5. realtime: `useRealtime('custom', e => e.featureId === 'F04' && reload())` · states: loading = skeleton ของการ์ด · error = `EmptyState` + ปุ่มลองใหม่ · `VERSION_CONFLICT` → toast `settings.conflict` + reload

i18n (namespace `business-settings` ไฟล์ `i18n/th.json` / `en.json`):

| key | th | en |
|---|---|---|
| `menu.business` | ข้อมูลร้าน | Business |
| `menu.bot` | ตั้งค่าบอท | Bot settings |
| `business.title` | ข้อมูลร้านและเวลาทำการ | Business and hours |
| `bot.title` | ตั้งค่าบอท | Bot settings |
| `tabs.profile` | ข้อมูลร้าน | Profile |
| `tabs.hours` | เวลาทำการ | Hours |
| `profile.name` | ชื่อร้าน | Business name |
| `profile.description` | คำอธิบายร้าน | Description |
| `profile.phone` | เบอร์โทร | Phone |
| `profile.email` | อีเมลร้าน | Business email |
| `profile.address` | ที่อยู่ | Address |
| `locale.title` | ภาษาและเขตเวลา | Language and timezone |
| `locale.language` | ภาษาที่บอทใช้ตอบเป็นค่าเริ่มต้น | Default bot reply language |
| `locale.languageHelp` | ใช้เมื่อข้อความของลูกค้าบอกภาษาไม่ได้ (เช่น ส่งแค่ตัวเลขหรือรูป) และใช้กับข้อความแจ้งเตือนถึงพนักงาน · บอทตอบตามภาษาที่ลูกค้าพิมพ์เสมอ ทั้งไทยและอังกฤษ | Used when a customer message does not show a language (numbers or pictures only) and for staff notifications. The bot always replies in the language the customer writes, Thai or English |
| `locale.timezone` | เขตเวลาของร้าน | Business timezone |
| `locale.timezoneWarn` | เวลาทำการที่ตั้งไว้จะถูกอ่านเป็นเวลาท้องถิ่นของเขตเวลาใหม่ | Saved hours will be read as local time in the new timezone |
| `hours.title` | เวลาทำการรายสัปดาห์ | Weekly hours |
| `hours.openNow` | ตอนนี้ร้านเปิดอยู่ | Open now |
| `hours.closedNow` | ตอนนี้ร้านปิดอยู่ | Closed now |
| `hours.nextOpen` | เปิดอีกครั้ง {{when}} | Opens again {{when}} |
| `hours.noNextOpen` | ไม่มีเวลาเปิดใน 31 วันข้างหน้า | No opening time in the next 31 days |
| `hours.reason.closure` | วันหยุดพิเศษ | Special closure |
| `hours.reason.closed_day` | วันนี้ปิดทำการ | Closed today |
| `hours.reason.outside_hours` | นอกเวลาทำการ | Outside hours |
| `hours.day.mon` … `hours.day.sun` | จันทร์ อังคาร พุธ พฤหัสบดี ศุกร์ เสาร์ อาทิตย์ | Monday … Sunday |
| `hours.dayOpen` | เปิดทำการ | Open |
| `hours.dayClosed` | ปิด | Closed |
| `hours.open` | เปิด | From |
| `hours.close` | ปิด | To |
| `hours.addInterval` | เพิ่มช่วงเวลา | Add interval |
| `hours.copyAll` | คัดลอกไปทุกวัน | Copy to all days |
| `hours.issue.close_before_open` | เวลาปิดต้องหลังเวลาเปิด | Closing time must be after opening time |
| `hours.issue.overlap_or_touching` | ช่วงเวลาซ้อนหรือติดกัน ให้รวมเป็นช่วงเดียว | Intervals overlap or touch; merge them |
| `closures.title` | วันหยุดพิเศษ | Special closures |
| `closures.add` | เพิ่มวันหยุด | Add closure |
| `closures.start` | ตั้งแต่วันที่ | From date |
| `closures.end` | ถึงวันที่ | To date |
| `closures.reason` | เหตุผล | Reason |
| `closures.deleteTitle` | ลบวันหยุดนี้? | Delete this closure? |
| `closures.empty` | ยังไม่มีวันหยุดพิเศษ | No special closures |
| `closures.issue.closure_overlap` | ซ้อนกับวันหยุดที่มีอยู่ | Overlaps an existing closure |
| `ai.title` | ให้ AI ตอบลูกค้า | Let AI answer customers |
| `ai.on` | บอทกำลังตอบลูกค้า | The bot is answering |
| `ai.off` | บอทเงียบอยู่ ข้อความที่เข้ามายังถูกบันทึก | The bot is silent; incoming messages are still saved |
| `ai.confirmOffTitle` | ปิด AI? | Turn AI off? |
| `ai.confirmOffMessage` | บอทจะไม่ตอบลูกค้าทุกช่องทางจนกว่าจะเปิดใหม่ ข้อความที่เข้ามายังถูกบันทึก | The bot will not answer on any channel until you turn it on. Incoming messages are still saved |
| `ai.blocked.business_inactive` | ร้านถูกระงับหรือลบ บอทจึงเงียบแม้เปิดสวิตช์ไว้ | The business is suspended or deleted, so the bot stays silent |
| `ai.blocked.account_inactive` | บัญชีถูกระงับ บอทจึงเงียบแม้เปิดสวิตช์ไว้ | The account is suspended, so the bot stays silent |
| `policy.title` | สิ่งที่บอทตอบได้ | What the bot may say |
| `policy.price` | ราคา | Prices |
| `policy.stock` | จำนวนสินค้าคงเหลือ | Stock levels |
| `policy.contact` | เบอร์โทรและอีเมลของร้าน | Shop phone and email |
| `policy.reveal.always` | ตอบได้ | May answer |
| `policy.reveal.ask_staff` | ให้ถามพนักงาน | Ask staff |
| `policy.reveal.never` | ไม่เปิดเผย | Never reveal |
| `policy.generalKnowledge` | ตอบจากข้อมูลร้านเท่านั้น (ไม่ใช้ความรู้ทั่วไป) | Answer only from shop data (no general knowledge) |
| `policy.booking` | รับจองผ่านแชต | Accept bookings in chat |
| `policy.reset` | ล้างเป็นค่าเริ่มต้น | Reset to default |
| `caps.title` | ความสามารถของร้าน | Shop capabilities |
| `caps.canQuotePrices` | ร้านบอกราคาลูกค้าได้ | The shop can quote prices |
| `caps.canTakeOrders` | รับออเดอร์ผ่านแชต | Orders via chat |
| `caps.canTakeBookings` | รับจองผ่านแชต | Bookings via chat |
| `caps.canHandoffToHuman` | ส่งต่อให้พนักงานได้ | Hand off to staff |
| `caps.canShareContact` | บอกช่องทางติดต่อร้านได้ | Share shop contact details |
| `effective.title` | ผลที่บอทจะทำจริง | What the bot will actually do |
| `effective.note` | ถ้า capability หรือนโยบายข้อใดปิด ผลคือปิด | If either the capability or the policy is off, the result is off |
| `effective.orders` | เสนอออเดอร์ | Propose orders |
| `effective.handoff` | ส่งต่อให้พนักงาน | Hand off to staff |
| `effective.on` | เปิด | On |
| `effective.off` | ปิด | Off |
| `settings.saved` | บันทึกแล้ว | Saved |
| `settings.conflict` | มีคนแก้ค่าไปแล้ว โหลดค่าล่าสุดให้แล้ว | Someone changed the settings. Reloaded |
| `settings.readOnly` | คุณไม่มีสิทธิ์แก้ค่าในหน้านี้ | You do not have permission to edit this page |
| `settings.retry` | ลองใหม่ | Retry |

## 8. Jobs, schedules, events

- Jobs / schedules: ไม่มี
- Realtime: `publish(businessId, { type:'custom', featureId:'F04', name:'business-settings.changed', data:{ version } })` หลังทุกการแก้
- Audit (`actorUserId` = ผู้แก้, `businessId`, `targetType:'business'`, `targetId: businessId`): `business-settings.ai.toggle` `{from,to}` · `business-settings.profile.update` `{changed: string[]}` (ชื่อ field ไม่ใส่ค่าเบอร์/อีเมล) · `business-settings.locale.update` `{timezone:{from,to}, language:{from,to}}` · `business-settings.hours.update` `{}` · `business-settings.policy.update` `{before, after}` · `business-settings.capabilities.update` `{before, after}` · `business-settings.closure.create` `{closureId,startDate,endDate}` · `business-settings.closure.delete` `{closureId}`
- notify: ไม่ใช้

## 9. Seed และ fixtures

`server/src/features/business-settings/seed.ts` (`dependsOn: ['core']`, idempotent):
- `run(ctx)`: สำหรับ `SEED.businesses` ทั้งสองร้าน: `INSERT INTO business_settings (business_id, ai_enabled, hours, answer_policy, capabilities, version) VALUES (…SEED.settings.aiEnabled, SEED.settings.hours, NULL, '{}', 1) ON CONFLICT DO NOTHING` · `business_profiles`: A = "ร้านบอร์ดเกมสังเคราะห์สำหรับสาธิตระบบ" เบอร์ `02-000-0001` อีเมล `shop.a@example.test` ที่อยู่ "ที่อยู่สมมติ กรุงเทพฯ" · B = "ร้านซ่อมสังเคราะห์สำหรับสาธิตระบบ" เบอร์ `02-000-0002` อีเมล `shop.b@example.test` · ไม่มี closure
- `runDemo(ctx)`: ร้าน A เพิ่ม closure `2026-12-31 → 2027-01-02` เหตุผล "ปิดปีใหม่ (ข้อมูลสาธิต)" (`ON CONFLICT` ไม่มี unique จึงตรวจ `NOT EXISTS` ด้วย `reason`)
- `resetDemo(ctx)`: ทั้งสองร้าน `UPDATE business_settings SET ai_enabled=true, answer_policy=NULL, capabilities='{}', hours=<จาก SEED>, version = version + 1` · ลบ `business_closures` ทั้งหมดของสองร้าน (แล้ว `runDemo` เติมของ A ใหม่) · ไม่แตะ `businesses`
- fixtures ของ test: สร้างร้านใหม่ด้วย `INSERT INTO accounts/businesses/memberships` (ใน helper ของ test) แทนการแก้แถว SEED · policy/hours ตัวอย่างอยู่ใน `fixtures.ts` ของโฟลเดอร์ test

## 10. Tests

Unit (`hours.test.ts`, `policy.test.ts`, `closures.test.ts`):
1. `validateWeeklyHours`: ปิดก่อนเปิด · ซ้อน · ติดกัน · เกิน 4 ช่อง (zod) · `24:00` ถูกปฏิเสธ · ว่างทั้งสัปดาห์ผ่าน
2. `isValidTimeZone`: `Asia/Bangkok` ผ่าน · `Mars/Base` ไม่ผ่าน · `EST` ไม่ผ่าน
3. `localToUtc`/`localParts`: Asia/Bangkok `2026-11-21 10:00` = `2026-11-21T03:00:00Z` · timezone ที่มี DST (`America/New_York`) ข้ามวันเปลี่ยนเวลาได้ถูก
4. `getBusinessOpenState` ตามตัวอย่างใน §5.8 ทั้ง 4 ข้อ (ใช้ `CLOCK_FIXTURE` และเวลาที่กำหนด)
5. `normalizePolicy`/`mergePolicy`: `{price:never}` แล้ว patch `{stock:ask_staff}` → ได้ทั้งสอง · patch `{booking:null}` ลบเฉพาะ booking · patch ทุกค่าเป็นค่าเริ่มต้น → `null` · key แปลกใน zod ถูกปฏิเสธ
6. `resolveRules` ตาราง 8 กรณี: caps ปิด price + policy always → never · policy never + caps เปิด → never · `orders` ปิดเมื่อ price ≠ always · `booking` ปิดเมื่อ caps หรือ policy ปิด · ทุกค่าเริ่มต้น = permissive

Route (`routes.test.ts`, supertest + test DB + `loginAs`):
7. `getBusinessSettings(SEED A)` = `{ aiEnabled:true, timezone:'Asia/Bangkok', hours: HOURS_A, answerPolicy:null, language:'th', version:1 }` ตรง contract (ใช้ test สร้าง `Object.keys` เทียบกับ `BusinessSettings`) · businessId สุ่ม → `NOT_FOUND`
8. `PUT /ai {enabled:false}` โดย owner A → 200 · `getBusinessSettings(A).aiEnabled === false` · version +1 · ตั้งซ้ำ → version ไม่เพิ่ม · audit มี 1 แถว · เปิดกลับ → true · ร้านถูกตั้ง `businesses.status='suspended'` → `aiEnabled=false` ทั้งที่สวิตช์เปิด
9. สิทธิ์: `staff_a` (STAFF_DEFAULT) `PUT /ai`, `/hours`, `/answer-policy` → **403** `PERMISSION_DENIED` · `GET /settings` → 200 (มี `business.read`) · ผู้ใช้ไม่มี `business.read` (สมาชิกที่ถอดสิทธิ์) GET → 403
10. tenant: owner A เรียก path ของ business B ทุกเส้น (GET + PUT /ai + POST closures) → **404** และ `getBusinessSettings(B)` ไม่เปลี่ยน · staff B เรียกของ A → 404
11. policy: body `{price:{reveal:'maybe'}}` → 400 `VALIDATION_ERROR` พร้อม `details.issues[0].path` ชี้ `policy.price.reveal` · key แปลก `{pricee:…}` → 400 · `expectedVersion` เก่า → 409 `VERSION_CONFLICT` พร้อม `currentVersion` · save `price:never` แล้ว save `booking:{enabled:false}` → ทั้งสองอยู่ · `policy:null` → `answerPolicy === null`
12. hours: ช่วงซ้อน → 400 `details.issues` มี `overlap_or_touching` และค่าเดิมไม่เปลี่ยน · ส่ง 7 วันว่าง → 200 และ open-state `closed_day`
13. closures: ซ้อน → 400 `closure_overlap` · `end < start` → 400 · จบก่อนวันนี้ (ตาม tz ร้าน) → 400 · วันที่ไม่จริง `2026-02-30` → 400 · เกิน 366 วัน → 400 · สร้าง/list/ลบ · ลบของร้านอื่น → 404 · เพิ่มแล้ว `open-state` ในช่วงนั้น = `closure`
14. locale: timezone ผิด → 400 · เปลี่ยน language เป็น `en` → `getBusinessSettings.language === 'en'` และ `GET /businesses/:id` (core) เห็น `language:'en'`, `version` ของ businesses เพิ่ม
15. `ensureBusinessSettings` สองครั้ง → แถวเดียว · `getEffectiveAnswerRules` ตรงตาราง §5.4 หลังตั้ง policy

Playwright smoke `web/src/features/business-settings/e2e/business-settings.smoke.spec.ts` (production-safe, ใช้ `ownerPage`, `api`, `e2eMarker`) — **ไม่สลับสวิตช์ AI บน production** เพราะ C0 ตรวจ gate ขั้น 5 บน tenant A อยู่และ smoke จะรบกวน (สวิตช์ครอบคลุมโดย test 8 และ gate):
- `bot settings: เปลี่ยน policy ราคาเป็น "ให้ถามพนักงาน" แล้ว reload ค่ายังอยู่แล้วคืนค่า` — เปิด `/bot-settings` → เลือก `[data-testid="policy-price"]` = `ask_staff` → บันทึก → toast "บันทึกแล้ว" → reload → ค่ายัง `ask_staff` → `api.get` ผ่าน GET settings เห็นเหมือนกัน → ตั้งกลับเป็น `always` ใน `finally`
- `hours: เพิ่ม/ลบวันหยุดด้วย marker` — `/business` → แท็บเวลาทำการ → เพิ่มวันหยุด `เหตุผล = e2e-<marker>` ช่วงปีหน้า (วันที่คำนวณจากวันนี้ + 400 วัน) → เห็นแถวในตาราง → ลบ → แถวหาย (finally ลบผ่าน API ถ้าค้าง)
- `tenant: owner A เปิด business B` — `api.get('/api/v1/businesses/<SEED B id>/settings')` ได้ 404 (ไม่แตะข้อมูล B)
- `permission: ปุ่มบันทึกปิดสำหรับผู้ไม่มีสิทธิ์` ไม่ทำบน production (ครอบคลุมใน route test 9)

## 11. Acceptance: R ตาม D6

- [ ] UI จริง `/business` (ข้อมูลร้าน, ภาษา/timezone, เวลาทำการ, วันหยุด) และ `/bot-settings` (สวิตช์ AI, policy, capability, ผลจริง) ต่อ API + DB จริง ไม่มีปุ่มที่ไม่ทำงาน
- [ ] `getBusinessSettings` จริงและตรง contract (test 7) · **ปิด AI แล้ว F10 เงียบ เปิดแล้วตอบ บน production** (gate ขั้น 5 ผ่านโดย C0)
- [ ] save → reload ค่ายังอยู่ · บทสนทนาใหม่ใช้ค่าที่บันทึก · policy ผิดรูป 400 พร้อม issues · save field หนึ่งไม่ลบ field อื่น (test 11)
- [ ] เวลาแสดง/ตรวจตาม Asia/Bangkok (หรือ timezone ของร้าน) · open-state ตรงตัวอย่าง §5.8
- [ ] permission: staff ไม่มีสิทธิ์ = 403 · tenant ข้ามร้าน = 404 · audit ทุกการแก้ (test 8–10)
- [ ] slot `businessTabs` แสดงแท็บที่ lane อื่นเพิ่ม (ตรวจด้วยแท็บทดสอบใน unit test ของหน้า)
- [ ] loading/empty/error state · ข้อความไทยผ่าน i18n · unit + route test เขียว · Playwright smoke ผ่านกับ production · deploy แล้ว
- เป็น **S/A** ถ้า: สวิตช์ AI ผ่านแต่ policy/capability ยังไม่เสร็จ (บันทึก `actual_mode` ใน EVIDENCE.md ต่อส่วน) · status floor = R ของ slice 1 เท่านั้นที่ gate ต้องการ

## 12. Security และ privacy

- ทุก query กรองด้วย `businessId` จาก `getBusiness()` (path param ผ่าน core) · F04 ไม่เชื่อ `businessId` ใน body · ฟังก์ชัน contract รับ `businessId` จากผู้เรียกฝั่ง server (R5) แล้วกรองด้วยค่านั้น
- permission: อ่าน `business.read` · แก้ข้อมูลร้าน/เวลา/วันหยุด/ภาษา `business.update` · สวิตช์ AI, policy, capability `business.bot_settings` (staff ค่าเริ่มต้นไม่มีทั้งคู่)
- ข้อมูลที่เป็น PII เล็กน้อย: เบอร์/อีเมลร้านใน `business_profiles` · ห้ามใส่ในค่า audit (เก็บแค่ชื่อ field) และห้าม log body ของ PUT /profile · F10 ใช้เบอร์/อีเมลได้เมื่อ `rules.contact === 'always'` เท่านั้น
- `answer_policy` เป็นข้อมูลที่ model อ่านได้ (ผ่าน directive) แต่ **ห้ามมีข้อความอิสระจากผู้ใช้** ใน policy (ทุกค่าเป็น enum/boolean) จึงไม่เป็นช่อง prompt injection · ชื่อร้าน/คำอธิบายเป็นข้อมูล ไม่ใช่คำสั่ง (F10 ใส่เป็นข้อมูลเสมอ)
- fail closed: policy ที่เก็บเสียคืนนโยบายเข้มสุด · สถานะร้าน/บัญชีไม่ active = `aiEnabled:false`
- `description`/`address` ถูกแสดงด้วย React (escape อัตโนมัติ) · ไม่ render HTML

## 13. Edge cases

| กรณี | ผลที่ต้องได้ |
|---|---|
| ร้านใหม่ที่ยังไม่มีแถว `business_settings` | `getBusinessSettings` คืนค่าเริ่มต้น (aiEnabled true, hours จ–ส 09:00–18:00) ไม่ throw · การแก้ครั้งแรกสร้างแถว |
| PUT สองหน้าต่างพร้อมกัน | หน้าต่างที่สองได้ `VERSION_CONFLICT` + `currentVersion` · UI โหลดใหม่ |
| `PUT /ai` ซ้ำค่าเดิม | 200 ไม่ bump version ไม่มี audit ซ้ำ |
| เปลี่ยน `timezone` แล้วมี closure เดิม | closure เป็นวันที่ท้องถิ่น ไม่แปลง · หน้าเตือนก่อนยืนยัน |
| closure คร่อมปีใหม่ / กุมภาพันธ์ | `isRealDate` + ช่วงเทียบเป็นสตริง `YYYY-MM-DD` ถูกต้อง |
| hours วันหนึ่งมี 4 ช่อง | ผ่าน · 5 ช่อง = 400 |
| อาทิตย์ว่างและ closure ครอบวันจันทร์ | `nextOpenAt` ข้ามไปวันแรกที่เปิดจริงและไม่มี closure |
| ร้านถูกระงับ (`businesses.status`) | `aiEnabled:false` ใน `getBusinessSettings` แต่หน้า settings เรียกไม่ได้เพราะ core ตอบ `BUSINESS_INACTIVE` |
| ผู้ใช้ส่ง policy `price: always` ทั้งหมด | normalize เป็น `null` |
| ชื่อร้านยาว 81 ตัว / ว่าง | 400 พร้อม issue ที่ `name` |
| เบอร์มีตัวอักษร | 400 (`^[0-9+()\- ]*$`) |
| staff ที่ถูก revoke ระหว่างเปิดหน้า | request ถัดไปได้ 404/403 จาก core · UI แสดงข้อผิดพลาดแล้วพาไป `/no-business` ตามกติกา core |

## 14. Build order (slices)

| Slice | เวลา | ทำอะไร | merge เมื่อ |
|---|---|---|---|
| **S1 · gate slice** | ≤ 25 นาที (เป้า merge ก่อน 11:45) | migration `001` (ตาราง `business_settings`) · `defaults.ts`, `schemas.ts` (เฉพาะ `AiSwitchBody`, `WeeklyHoursSchema`), `repo.ts` · **`getBusinessSettings` จริง** (แทน fake, join `businesses`/`accounts`) · `GET /settings` (SettingsView เท่าที่มี), `PUT /ai` + audit + publish · `/bot-settings` เฉพาะการ์ดสวิตช์ AI + `ConfirmDialog` · seed `run` · tests 7–10 (ส่วน ai/permission/tenant) · EVIDENCE.md | CI เขียว · โพสต์ `DONE F04 … getBusinessSettings() จริงแล้ว TO:B2 TO:C2 TO:A1 TO:A3` |
| S2 · hours + closures | ≤ 30 นาที | migration `002` ไม่จำเป็น (ตารางอยู่ใน `001` ทั้งหมด: ใส่ `business_closures` และ `business_profiles` ใน `001` ตั้งแต่ S1 เพื่อไม่ต้อง migrate ซ้ำ) · `hours.ts`, `closures.ts`, `PUT /hours`, closures routes, `GET /open-state`, `getBusinessOpenState` · หน้า `/business` แท็บเวลาทำการ · tests 1–4, 12, 13 | slice ผ่าน test |
| S3 · policy + capabilities + profile | ≤ 30 นาที | `policy.ts` (`normalize/merge/resolve`), `PATCH /answer-policy`, `PUT /capabilities`, `PUT /profile`, `PUT /locale`, `getEffectiveAnswerRules`, `getCapabilities`, `getBusinessProfile`, `ensureBusinessSettings` · หน้า `/bot-settings` ครบ + `/business` แท็บข้อมูลร้าน + slot `businessTabs` · `runDemo`/`resetDemo` · tests 5, 6, 11, 14, 15 | slice ผ่าน test |
| S4 · smoke + production | ≤ 15 นาที | Playwright smoke (§10) รันกับ production · EVIDENCE.md (status R/S ต่อส่วน) · โพสต์ `DONE` ของ contract additions (TO:B2 สำหรับ `getEffectiveAnswerRules`, TO:C3 ตัวเอง F03 สำหรับ `ensureBusinessSettings`) | smoke ผ่านบน production |

หมายเหตุ S1: ตาราง `business_closures` และ `business_profiles` อยู่ใน migration `001` ตั้งแต่แรก (ไฟล์ที่ merge แล้วแก้ไม่ได้) · ถ้าเวลาไม่พอ S1 ทำเฉพาะส่วน `ai_enabled` ได้ แต่ migration ต้องครบทั้งสามตาราง

## 15. UNCONFIRMED และสิ่งที่ต้องตรวจในวันงาน

| ข้อ | วิธีตรวจ |
|---|---|
| Node 24 บน Render image มี ICU เต็ม (`Intl.DateTimeFormat` รู้ `Asia/Bangkok`, `America/New_York`) | รัน test 2–3 บน CI และ `node -e "console.log(new Intl.DateTimeFormat('en',{timeZone:'Asia/Bangkok'}).format())"` บน Render shell · ถ้า timezone อื่นพัง จำกัดรายการ timezone เหลือที่ผ่านการทดสอบ |
| ลำดับตรวจของ core: ตรวจ body (zod) ก่อนหรือหลัง `getBusiness`/permission | test 10 ส่ง PUT ด้วย body ถูกต้องไปร้านอื่น ต้อง 404 · ถ้า core ตรวจ body ก่อน ให้ส่ง body ถูกต้องเสมอใน test และเขียนผลใน EVIDENCE.md |
| `UPDATE businesses` (name/timezone/language/version) จาก F04 ได้รับอนุญาตจาก C1 (ไม่ใช่ ALTER) | อ่าน `check-paths`/review ของ C1 ตอน PR แรก · ถ้าไม่อนุญาต โพสต์ `CHANGE TO:C1` และเก็บ `timezone`/`language` ใน `business_settings` ชั่วคราว (ต้องแก้ `getBusinessSettings` ให้อ่านจากที่เดียวกัน) |
| F10 เรียก `getEffectiveAnswerRules` แทนการอ่าน `answerPolicy` ตรง ๆ | ตอน `DONE` โพสต์ TO:B2 พร้อมลิงก์ตาราง §5.4 · ถ้า B2 ไม่ใช้ F10 คงใช้ `answerPolicy` ตาม §5.11 (ผลเท่ากันเมื่อ capabilities เป็นค่าเริ่มต้น) |
| slot `businessTabs` วาดโดยหน้า `/business` ได้ (ต้องมี `useSlot` ใช้งานจริงใน core) | ถ้า `useSlot` เป็น no-op ตอน setup (F01 §13 ข้อ 7 อนุญาต) ให้ F04 ใช้ `useSlot` ตามที่ core ส่งมา และจดใน EVIDENCE.md ว่าแท็บ slot เป็น A จนกว่าจะมีของจริง |
