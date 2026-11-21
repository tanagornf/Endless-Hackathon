# F16 calendar — เชื่อม Google Calendar ซิงก์นัดหมาย และอ่านเวลาไม่ว่าง

| | |
|---|---|
| Lane / คน | **A3** / **A** · ลำดับ 3 ใน lane (F24 → F15 → F16) |
| Tier / เป้า | **P2** · เป้า **R** เมื่อมี event จริงใน Google Calendar ของ test user (ไม่มี OAuth พร้อม = **S** ด้วย transport จำลองที่ติดป้าย, ไม่ครบ flow = **A**) |
| Timebox | 45–120 นาที (ไม่รวมงานตั้ง OAuth client ของคนใน §15 ข้อ 1: ต้องทำก่อนเริ่ม) |
| เริ่มเมื่อ | หัวหน้าโพสต์ `LEAD: OPEN P2` และ F15 S3 merge แล้ว (ต้องมี export §4 ของ F15: `onAppointmentChange`, `registerCalendarBridge`, `setExternalSyncState`, `getAppointmentRecord`, `listAppointmentsNeedingSync`, `listFutureAppointments`) |
| พึ่ง | **F15** (export ภายใน lane) · core (`db`, `jobs`/schedules, `encryptSecret`/`decryptSecret`, `audit`, `publish`, `assertRateLimit`, slot `oauthCallbacks` ของหน้า `/oauth/callback`) · F31 `notify` (ตอน grant หมดอายุ) · F04 `getBusinessSettings` (timezone) |
| ให้ | ไม่มี contract ข้ามคน · ให้ F15 ผ่าน `registerCalendarBridge` (เวลาไม่ว่างและสถานะเชื่อมต่อ) |
| ใช้ | ดู §4 |
| โฟลเดอร์ | `server/src/features/calendar/` · `shared/features/calendar/types.ts` · `web/src/features/calendar/` |
| Web path | `/calendar` (เมนูกลุ่ม `commerce`) · หน้า `/oauth/callback` ของ core ส่งต่อมาที่ slot `oauthCallbacks` (`statePrefix: 'gcal:'`) · การ์ดสถานะใน `/channels` (slot `channelCards`) |

อ่าน: `contracts.ts` (`SlotContribution` `statePrefix`, `FeatureRoutes.schedules`, `JobHandler`, `encryptSecret`, `AppointmentSummary.externalSync`) · F15 spec §4.1 (exports ที่ F16 ใช้) · F01 spec §7 (หน้า `/oauth/callback`) · F31 spec §5.3 · `.env.example` ส่วน Google · [COOKBOOK](../COOKBOOK.md) §6, §8

## 1. เป้าหมายและ user stories

ทำไมมี: ร้านบริการอยากเห็นนัดในปฏิทิน Google ที่ใช้อยู่แล้ว และไม่อยากให้ AI เสนอเวลาที่ร้านไม่ว่างเพราะมีนัดอื่นใน Google ข้อกำหนดสำคัญ: **นัดในฐานข้อมูลของเรา (F15) คือความจริง** Google ล่ม/หมดสิทธิ์/ตอบช้า นัดต้องไม่หาย ไม่ล้ม ไม่ถูกบอกว่า "บันทึกใน Google แล้ว" ถ้ายังไม่ได้บันทึก และสถานะ pending/failed ต้องเห็นชัดพร้อมทางซ่อม

ผู้ใช้: เจ้าของ/ผู้มี `appointments.settings` (เชื่อม ตัดการเชื่อม เลือกปฏิทิน ซ่อมซิงก์) · พนักงาน (ดูสถานะซิงก์ของนัดใน F15) · F15 (ได้เวลาไม่ว่างและสถานะ)

User stories:
1. เจ้าของกด "เชื่อม Google Calendar" → เลือกบัญชีทดสอบ → อนุญาต → กลับมาที่ `/calendar` เลือกปฏิทิน (หรือสร้างปฏิทินใหม่ "Endless - <ชื่อร้าน>") → สถานะ "เชื่อมแล้ว"
2. ลูกค้ากดยืนยันนัดในแชต → ภายในไม่กี่วินาทีเห็น event ในปฏิทินจริง (ชื่อบริการ · ชื่อลูกค้า, เวลา Asia/Bangkok ถูก) และสถานะนัดใน F15 เป็น "ซิงก์แล้ว"
3. นัดถูกเลื่อน → event เดิมถูกแก้เวลา (ไม่สร้างใหม่) · นัดถูกยกเลิก → event ถูกลบ
4. Google ล่มหรือโควตาเต็ม → นัดยังอยู่ครบ สถานะเป็น "รอซิงก์" แล้ว "ล้มเหลว" พร้อมเหตุผล และระบบลองใหม่เอง/มีปุ่มซ่อม · ลองซ้ำกี่ครั้งก็ได้ event เดียว
5. เจ้าของมีนัดส่วนตัวใน Google (10:00–11:00) → AI ไม่เสนอเวลานั้น (เวลาไม่ว่างจาก Google ถูกรวมใน `findSlots`)
6. สิทธิ์ที่ให้ไว้หมดอายุ (แอปอยู่ในโหมด Testing) → สถานะ "หมดอายุ ต้องเชื่อมใหม่" เจ้าของได้แจ้งเตือน นัดใหม่ยังจองได้ตามปกติ (ไม่สัญญาว่าลงปฏิทิน)
7. ตัดการเชื่อม: ระบบเตือนจำนวนนัดในอนาคตที่ซิงก์ไว้ ต้องกดยืนยัน ตัดแล้วนัดยังอยู่ครบ

นอกขอบเขต: ซิงก์กลับจาก Google → ระบบเรา (แก้/ลบ event ใน Google ไม่เปลี่ยนนัดของเรา; แก้ในที่เดียวคือในแอป) · ปฏิทินต่อ resource (หนึ่งร้านหนึ่งปฏิทิน) · เชิญผู้เข้าร่วม/ส่งอีเมลเชิญ (ไม่ใส่ attendees) · push/watch notifications ของ Google · Google Docs/Sheets (F06) · หลายบัญชีต่อร้าน · service account

## 2. Data model

`server/src/features/calendar/migrations/001_calendar.sql`:

```sql
-- dependsOn: core, booking
CREATE TABLE calendar_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'google_calendar' CHECK (provider IN ('google_calendar')),
  mode text NOT NULL CHECK (mode IN ('sandbox','real')),
  status text NOT NULL CHECK (status IN ('active','expired','error','inactive')),
  account_email text NOT NULL DEFAULT '',
  calendar_id text,                                     -- null = ยังไม่เลือกปฏิทิน (ซิงก์หยุดรอ)
  calendar_name text NOT NULL DEFAULT '',
  calendar_timezone text NOT NULL DEFAULT '',
  refresh_token_enc text,                               -- encryptSecret(...) · null เมื่อ expired/inactive · ห้ามส่งออก API/log
  granted_scopes text NOT NULL DEFAULT '',
  all_day_busy boolean NOT NULL DEFAULT false,          -- event ทั้งวันนับเป็นเวลาไม่ว่างหรือไม่ (ค่าเริ่ม: ไม่นับ)
  connected_by uuid REFERENCES users(id),
  connected_at timestamptz NOT NULL DEFAULT now(),
  expired_at timestamptz,
  last_error text NOT NULL DEFAULT '' CHECK (char_length(last_error) <= 300),
  version int NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, provider)                        -- หนึ่งการเชื่อมต่อต่อร้าน; เชื่อมใหม่ = UPDATE แถวเดิม
);

CREATE TABLE calendar_oauth_states (                    -- state ใช้ครั้งเดียว อายุ 10 นาที
  state_hash text PRIMARY KEY,                          -- sha256(nonce) hex
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  redirect_uri text NOT NULL,                           -- ต้องเหมือนตอน authorize ทุกตัวอักษรเมื่อแลก code
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX calendar_oauth_states_exp ON calendar_oauth_states (expires_at);

CREATE TABLE calendar_sync (                            -- หนึ่งแถวต่อนัดที่เคยถูกซิงก์/พยายามซิงก์
  appointment_id uuid PRIMARY KEY,                      -- ไม่มี FK ข้ามฟีเจอร์ผิดทิศ: ใช้ FK ได้เพราะ dependsOn booking
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  event_id text NOT NULL,                               -- deterministic (§5.4) เก็บไว้เพื่อ diagnostics
  mode text NOT NULL CHECK (mode IN ('sandbox','real')),
  last_synced_version int,                              -- เวอร์ชันนัดที่เขียนลง Google สำเร็จครั้งล่าสุด
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','synced','failed')),
  attempts_total int NOT NULL DEFAULT 0,
  last_error text NOT NULL DEFAULT '' CHECK (char_length(last_error) <= 300),
  html_link text,                                       -- ลิงก์เปิด event ใน Google (ได้จาก response ตอน insert)
  last_attempt_at timestamptz,
  synced_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE
);
CREATE INDEX calendar_sync_biz_state ON calendar_sync (business_id, state);

CREATE TABLE calendar_sandbox_events (                  -- transport จำลอง (GOOGLE_MODE=sandbox) · ติดป้าย "จำลอง" ใน UI เสมอ
  event_id text NOT NULL,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  calendar_id text NOT NULL,
  summary text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','cancelled')),
  is_external boolean NOT NULL DEFAULT false,           -- true = "นัดส่วนตัวของเจ้าของ" ที่ใส่เองในโหมดจำลองเพื่อสาธิต busy
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (calendar_id, event_id)
);
CREATE INDEX calendar_sandbox_events_range ON calendar_sandbox_events (business_id, start_at, end_at);
```

กฎ: ไม่แก้ตาราง core/F15 (อ่านนัดผ่าน export ของ F15 เท่านั้น ห้าม `SELECT FROM appointments`; FK `calendar_sync → appointments` ใช้เพื่อ cascade เท่านั้น เพราะประกาศ `dependsOn: booking`) · ทุก query กรอง `business_id` · ค่าคงที่ใน `config.ts`: `OAUTH_STATE_TTL_MIN = 10` · `ACCESS_TOKEN_MARGIN_SEC = 60` · `HTTP_TIMEOUT_MS = 8000` · `BUSY_TIMEOUT_MS = 5000` · `BUSY_CACHE_SEC = 60` · `BUSY_MAX_PAGES = 4` · `SYNC_MAX_ATTEMPTS = 5` · `REPAIR_MAX_TOTAL_ATTEMPTS = 12` · `REPAIR_WINDOW_DAYS = 14` · `GOOGLE_SCOPES = ['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/calendar.readonly']` · `EVENT_ID_PREFIX = 'nl'`

## 3. API endpoints

ใต้ `/api/v1` · `defineFeatureRoutes({ featureId: 'F16', slug: 'calendar' })` · สิทธิ์: **ดูสถานะ** `appointments.read` · **เชื่อม/ตัด/เลือกปฏิทิน/ซ่อม** `appointments.settings` (ตรงกับสิทธิ์ของเมนู `/calendar` ใน F01)

| Method | Path | auth | permission | Request | Response | Errors |
|---|---|---|---|---|---|---|
| GET | `/businesses/:businessId/calendar/status` | business | `appointments.read` | — | `CalendarStatus` | — |
| POST | `/businesses/:businessId/calendar/oauth/start` | business | `appointments.settings` | — | `{ authUrl: string }` | POLICY_BLOCKED (`not_configured` เมื่อ `GOOGLE_MODE≠real` หรือไม่มี client id/secret), RATE_LIMITED |
| POST | `/calendar/oauth/callback` | user | (ตรวจ `appointments.settings` ของ business ใน state) | `OAuthCallbackBody` | `CalendarStatus` | VALIDATION_ERROR (`state_invalid` `state_expired` `access_denied` `missing_scope` `no_refresh_token`), PERMISSION_DENIED, PROVIDER_UNAVAILABLE |
| POST | `/businesses/:businessId/calendar/connect/sandbox` | business | `appointments.settings` | — | `CalendarStatus` | POLICY_BLOCKED (`sandbox_disabled` เมื่อ `GOOGLE_MODE=real`) |
| GET | `/businesses/:businessId/calendar/calendars` | business | `appointments.settings` | — | `{ items: CalendarChoice[] }` | POLICY_BLOCKED (`not_connected`), PROVIDER_UNAVAILABLE |
| PUT | `/businesses/:businessId/calendar/calendar` | business | `appointments.settings` | `ChooseCalendarBody` | `CalendarStatus` | VALIDATION_ERROR, POLICY_BLOCKED (`not_connected`), NOT_FOUND (calendar), VERSION_CONFLICT |
| POST | `/businesses/:businessId/calendar/calendar/create` | business | `appointments.settings` | `{ name?: string }` | `CalendarStatus` | POLICY_BLOCKED, PROVIDER_UNAVAILABLE |
| PUT | `/businesses/:businessId/calendar/settings` | business | `appointments.settings` | `{ allDayBusy: boolean; expectedVersion: number }` | `CalendarStatus` | VERSION_CONFLICT |
| POST | `/businesses/:businessId/calendar/disconnect` | business | `appointments.settings` | `DisconnectBody` | `{ disconnected: boolean; futureSynced: number }` | POLICY_BLOCKED (`future_appointments` + `details.count`) |
| POST | `/businesses/:businessId/calendar/sync/retry` | business | `appointments.settings` | `{ appointmentId?: string }` | `{ enqueued: number }` | NOT_FOUND, POLICY_BLOCKED (`not_connected`), RATE_LIMITED |
| GET | `/businesses/:businessId/calendar/appointments/:appointmentId/event` | business | `appointments.settings` | — | `EventProbe` | NOT_FOUND, POLICY_BLOCKED (`not_connected`), PROVIDER_UNAVAILABLE |
| GET | `/businesses/:businessId/calendar/busy` | business | `appointments.read` | `{ from, to }` | `{ items: { startAt: string; endAt: string }[]; available: boolean }` | VALIDATION_ERROR |
| POST | `/businesses/:businessId/calendar/sandbox/busy` | business | `appointments.settings` | `{ startAt, endAt, title }` | `{ eventId: string }` | POLICY_BLOCKED (`not_sandbox`) |
| DELETE | `/businesses/:businessId/calendar/sandbox/busy/:eventId` | business | `appointments.settings` | — | no_content | POLICY_BLOCKED, NOT_FOUND |

```ts
import { z } from 'zod';
export const OAuthCallbackBody = z.object({
  state: z.string().min(10).max(200).regex(/^gcal:/),
  code: z.string().min(1).max(2000).optional(),
  error: z.string().max(100).optional(),                   // เช่น access_denied จาก query ที่ Google ส่งกลับ
}).strict().refine(v => !!v.code || !!v.error);
export const ChooseCalendarBody = z.object({ calendarId: z.string().min(1).max(300), expectedVersion: z.number().int().min(1) }).strict();
export const DisconnectBody = z.object({ force: z.boolean().default(false), checkOnly: z.boolean().default(false) }).strict();
export const SandboxBusyBody = z.object({ startAt: z.string().datetime({ offset: true }), endAt: z.string().datetime({ offset: true }), title: z.string().trim().min(1).max(80) }).strict();
```

```ts
// shared/features/calendar/types.ts
export interface CalendarStatus {
  mode: 'sandbox' | 'real';                                  // โหมดของ environment (GOOGLE_MODE)
  realConfigured: boolean;                                   // มี GOOGLE_CLIENT_ID/SECRET ครบ
  connection: null | {
    status: 'active' | 'expired' | 'error' | 'inactive';
    connectionMode: 'sandbox' | 'real';                      // โหมดตอนที่เชื่อม (sandbox ติดป้าย "จำลอง")
    accountEmail: string; calendarId: string | null; calendarName: string; calendarTimezone: string;
    needsCalendarChoice: boolean; allDayBusy: boolean; connectedAt: string; expiredAt: string | null; lastError: string; version: number;
  };
  counts: { pending: number; failed: number; synced: number };   // เฉพาะนัดที่ booked ในอนาคต
  redirectUri: string;                                       // `${APP_BASE_URL}/oauth/callback` (สำหรับตรวจตอนตั้ง OAuth client)
  suggestedCalendarId: string | null;                        // จาก GOOGLE_TEST_CALENDAR_ID ถ้าอยู่ในรายการ
}
export interface CalendarChoice { id: string; name: string; timezone: string; primary: boolean; suggested: boolean }
export interface EventProbe { exists: boolean; eventId: string; summary: string | null; startAt: string | null; endAt: string | null; timeZone: string | null; status: string | null; htmlLink: string | null; mode: 'sandbox' | 'real' }
```

ห้ามส่ง `refresh_token_enc`, access token, `client_secret` ออกใน response/log/audit ทุกกรณี

## 4. Service functions และ contracts

ไฟล์ภายใน: `service.ts` · `config.ts` · `transport.ts` (interface + `GoogleTransport` + `SandboxTransport`) · `google.ts` (HTTP, token) · `oauth.ts` · `sync.ts` (job handler + diff) · `eventmap.ts` (นัด → event, event id) · `busy.ts` · `repair.ts` · `bridge.ts` (ลงทะเบียนกับ F15) · `routes.ts` · `*.test.ts` · `seed.ts` (ไม่มี)

**ไม่มี contract ข้ามคนใน `contracts.ts`** · ฟังก์ชันใน `service.ts` ที่ F15 เรียกผ่าน bridge (ลงทะเบียนตอน `register()` ของ routes ด้วย `registerCalendarBridge`):

```ts
// F16 implements F15's CalendarBridge (see F15 §4.1)
const bridge: CalendarBridge = {
  isConnected: (businessId) => /* status='active' AND calendar_id IS NOT NULL (ทั้ง sandbox และ real) */,
  listBusy: (businessId, range) => busy.list(businessId, range),   // fail-open ใน F15; ที่นี่คืน [] เมื่อไม่เชื่อมต่อ
};
```

ที่ F16 เรียก F15: `onAppointmentChange(listener)` · `setExternalSyncState({ businessId, appointmentId, forVersion, state, detail })` · `getAppointmentRecord(businessId, id)` · `listAppointmentsNeedingSync(businessId, { sinceMinutes, limit })` · `listFutureAppointments(businessId, { limit })` · core: `jobs.enqueue`, `encryptSecret`/`decryptSecret`, `audit`, `publish`, `notify`, `assertRateLimit`, `db`

### 4.1 Transport interface (ทดสอบแทนด้วยตัวปลอมได้)

```ts
export interface CalendarEventInput {
  eventId: string; summary: string; description: string; startAt: string; endAt: string; timeZone: string;
  privateProps: Record<string, string>;
}
export interface ExternalEvent { eventId: string; summary: string; startAt: string | null; endAt: string | null; allDay: boolean; status: string; transparent: boolean; selfDeclined: boolean; privateProps: Record<string, string>; htmlLink?: string; timeZone?: string }
export interface CalendarTransport {
  readonly mode: 'sandbox' | 'real';
  listCalendars(conn: ConnCtx): Promise<CalendarChoice[]>;
  createCalendar(conn: ConnCtx, input: { name: string; timeZone: string }): Promise<{ id: string; name: string; timeZone: string }>;
  listEvents(conn: ConnCtx, range: { from: string; to: string }): Promise<ExternalEvent[]>;          // singleEvents, ไม่รวม cancelled
  /** created=false เมื่อ id มีอยู่แล้ว (409): ถือว่าสำเร็จ */
  insertEvent(conn: ConnCtx, ev: CalendarEventInput): Promise<{ created: boolean; htmlLink?: string }>;
  patchEvent(conn: ConnCtx, eventId: string, ev: Partial<CalendarEventInput> & { restore?: boolean }): Promise<{ found: boolean; htmlLink?: string }>;
  deleteEvent(conn: ConnCtx, eventId: string): Promise<{ existed: boolean }>;                         // 404/410 → existed=false (ถือว่าสำเร็จ)
  getEvent(conn: ConnCtx, eventId: string): Promise<ExternalEvent | null>;
  revoke?(conn: ConnCtx): Promise<void>;
}
export class TransportError extends Error { constructor(public kind: 'grant_expired' | 'auth_config' | 'rate_limited' | 'unavailable' | 'bad_request' | 'not_found', message: string, public status?: number) { super(message); } }
```

การเลือก transport: `transportFor(connection.mode)`: `real` → `GoogleTransport` · `sandbox` → `SandboxTransport` · test เรียก `setTransportForTests(t)` เปลี่ยนได้

## 5. Algorithms

### 5.1 โหมดและสถานะ "R vs S"

| โหมด | เงื่อนไข | ผลต่อสถานะฟีเจอร์ |
|---|---|---|
| `real` | `GOOGLE_MODE=real` และมี `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` | **R เมื่อ** event จริงเห็นในปฏิทินของ test user (หลักฐานใน EVIDENCE.md: ภาพหน้าจอ Google Calendar + `GET …/event` คืน `exists:true`, เวลา Asia/Bangkok ถูก) |
| `sandbox` | `GOOGLE_MODE=sandbox` (ค่าเริ่ม) หรือ real แต่ไม่มี client | **S** · event เก็บใน `calendar_sandbox_events` ป้าย "จำลอง (ไม่ได้ส่งถึง Google)" ทุกหน้า · ห้ามติดป้ายว่าเป็นของจริง |
| ไม่มี OAuth เลยและยังไม่ทำ sandbox | — | **A** |

production (Render) ตั้ง `GOOGLE_MODE=real` เมื่อมี client ที่ลงทะเบียน redirect URI ของ production แล้วเท่านั้น (§15)

### 5.2 OAuth (เชื่อมต่อ)

ค่าที่ต้องมีที่ฝั่ง Google (ทำโดยคน ก่อนเริ่ม §15): Cloud project เปิด Google Calendar API · OAuth consent screen = **External, Testing**, ใส่ **test users** (บัญชีของทีม) · OAuth client ชนิด **Web application** · **Authorized redirect URIs** ต้องใส่ **ทุกตัวต่อไปนี้ตรงทุกตัวอักษร**: `http://localhost:5170/oauth/callback` ถึง `http://localhost:5179/oauth/callback` (ทุกพอร์ตของ web ที่ lane ใช้: orchestrator 5170 และ lane 5171–5179) และ `https://<URL ของ Render>/oauth/callback` (ใส่เมื่อได้ URL) · redirect URI ที่ใช้จริง = `${APP_BASE_URL}/oauth/callback` (`APP_BASE_URL` ใน `.env.local` ของแต่ละ lane/production)

**ขั้นตอน:**
1. `POST /oauth/start` (ต้อง `appointments.settings`; `assertRateLimit('calendar:oauth:<businessId>', 10/นาที)`): ตรวจ mode=real และ env ครบ · `nonce = randomBytes(32).toString('base64url')` · `state = 'gcal:' + nonce` · INSERT `calendar_oauth_states (state_hash = sha256(nonce) hex, business_id, user_id, redirect_uri = ${APP_BASE_URL}/oauth/callback, expires_at = now + 10 นาที)` · คืน `authUrl = https://accounts.google.com/o/oauth2/v2/auth?` + พารามิเตอร์ `client_id`, `redirect_uri`, `response_type=code`, `scope` (สอง scope คั่นด้วยช่องว่าง), `access_type=offline`, `prompt=consent` (บังคับให้ได้ refresh token ทุกครั้ง), `include_granted_scopes=true`, `state` · ห้ามใส่ `login_hint` ที่มาจากข้อมูลลูกค้า
2. ผู้ใช้อนุญาตที่ Google → Google redirect กลับ `/oauth/callback?code=…&state=gcal:…` (หรือ `?error=access_denied&state=…`) · หน้าของ core เลือก slot ที่ `statePrefix` ตรง (`gcal:`) แล้วเรนเดอร์ `OAuthCallbackHandler` ของ F16 · คอมโพเนนต์ **อ่าน `code`/`state`/`error` จาก `window.location.search` เอง** (ไม่พึ่ง props ของ host) แล้ว `POST /calendar/oauth/callback { state, code | error }` ด้วย session ปัจจุบัน แล้ว `navigate('/calendar?connected=1')` (หรือ `?error=<code>`) และ `history.replaceState` ล้าง `code` ออกจาก URL ก่อนทำอย่างอื่น
3. server `callback` (auth `user`): `nonce = state.slice(5)` · `UPDATE calendar_oauth_states SET used_at = now() WHERE state_hash = sha256(nonce) AND used_at IS NULL AND expires_at > now() RETURNING *` — ไม่ได้แถว → `VALIDATION_ERROR` (`state_invalid` หรือ `state_expired` ถ้าแถวมีแต่หมดอายุ/ใช้แล้ว) · `row.user_id ≠ ctx.user.id` → `PERMISSION_DENIED` (กัน CSRF/ผู้ใช้อื่นสวม state) · `ctx.requireBusiness(row.business_id, 'appointments.settings')` (ผู้ใช้ต้องยังเป็นสมาชิกที่มีสิทธิ์) · `error` ส่งมา → `VALIDATION_ERROR` (`access_denied`) ไม่แลก code
4. แลก code: `POST https://oauth2.googleapis.com/token` (`application/x-www-form-urlencoded`: `code`, `client_id`, `client_secret`, `redirect_uri = row.redirect_uri`, `grant_type=authorization_code`) timeout 8 วินาที · ผิดพลาด `invalid_grant`/`redirect_uri_mismatch` → `VALIDATION_ERROR` พร้อม `details.reason` (ไม่ log body) · 5xx/timeout → `PROVIDER_UNAVAILABLE`
5. ตรวจผล: `scope` ที่ได้ต้องมีทั้งสอง scope (ผู้ใช้ติ๊กออกได้) ไม่ครบ → `VALIDATION_ERROR missing_scope` และเรียก revoke token นั้นทิ้ง · ไม่มี `refresh_token` → `VALIDATION_ERROR no_refresh_token` (ให้ลองใหม่: เพราะ `prompt=consent` ควรได้เสมอ) 
6. หา `account_email` = รายการปฏิทิน `primary:true` จาก `calendarList` (`id` ของ primary คืออีเมลของบัญชี; ไม่ขอ scope `email` เพิ่ม) · UPSERT `calendar_connections` (`ON CONFLICT (business_id, provider) DO UPDATE`: `mode='real'`, `status='active'`, `refresh_token_enc = encryptSecret(refresh_token)`, `account_email`, `granted_scopes`, `connected_by`, `connected_at = now()`, `expired_at = NULL`, `last_error=''`; **ถ้าเปลี่ยนบัญชี Google (อีเมลต่างจากเดิม) ให้ล้าง `calendar_id`/`calendar_name`** เพื่อบังคับเลือกใหม่; บัญชีเดิม = คง `calendar_id`) · audit `calendar.connect` (`details: { mode:'real', accountDomain }` ไม่ใส่อีเมลเต็มหรือ token) · publish `calendar.changed`
7. ถ้ามี `GOOGLE_TEST_CALENDAR_ID` และอยู่ในรายการปฏิทินที่เขียนได้ และยังไม่มี `calendar_id` → **เลือกให้อัตโนมัติ** (สะดวกตอนสาธิต) · มิฉะนั้น `needsCalendarChoice=true` (หน้า `/calendar` บังคับเลือกก่อนซิงก์)
8. เชื่อมใหม่สำเร็จและมี `calendar_id` → enqueue `calendar.repair-business` เพื่อซิงก์นัดอนาคตที่ `pending/failed` (§5.8)

**เลือกปฏิทิน:** `GET /calendars` = `calendarList.list?minAccessRole=writer` (id, summary, timeZone, primary) · ค่า `primary` ติดคำเตือน "ปฏิทินหลักของบัญชี: ถ้าสองร้านใช้บัญชีเดียวกัน เวลาไม่ว่างจะปนกัน แนะนำสร้างปฏิทินเฉพาะร้าน" · `POST /calendar/create` → `POST /calendar/v3/calendars { summary: 'Endless - <ชื่อร้าน>' , timeZone: business timezone }` แล้วเลือกตัวใหม่ · `PUT /calendar { calendarId }` ตรวจว่า id อยู่ในรายการที่เขียนได้ (ไม่อยู่ → `NOT_FOUND`) · เปลี่ยนปฏิทิน: **ไม่ย้าย event เก่า** (event เดิมอยู่ที่ปฏิทินเดิม) · แถว `calendar_sync` ของนัดอนาคตถูกรีเซ็ต `pending` และซิงก์ใหม่ที่ปฏิทินใหม่ (event id เดียวกัน คนละปฏิทิน) + แจ้งเตือนใน UI ว่า event เดิมยังอยู่ในปฏิทินเดิม

### 5.3 Token (`google.ts`)

- เก็บเฉพาะ refresh token (เข้ารหัสด้วย `encryptSecret`) · access token เก็บใน memory `Map<connectionId, { token, expiresAtMs }>` (ไม่ลงฐานข้อมูล)
- `getAccessToken(conn)`: ถ้า cache เหลือ > 60 วินาที ใช้ · ไม่งั้น refresh แบบ single-flight (`Map<connectionId, Promise>` กัน refresh ซ้อนกัน): `POST token { client_id, client_secret, refresh_token: decryptSecret(...), grant_type: 'refresh_token' }`
- ผล refresh: `invalid_grant` → **grant หมดอายุ/ถูกเพิกถอน** → `TransportError('grant_expired')` · `invalid_client`/`unauthorized_client` → `TransportError('auth_config')` · 429/5xx/timeout → `unavailable`/`rate_limited`
- เมื่อ `grant_expired` (ครั้งแรกที่เจอ): `UPDATE calendar_connections SET status='expired', expired_at=now(), refresh_token_enc=NULL, last_error='grant_expired'` · `notify({ businessId, to:{ role:'owners' }, type:'system', title:'การเชื่อม Google Calendar หมดอายุ', body:'เชื่อมใหม่ที่หน้า Google Calendar เพื่อซิงก์นัดต่อ', link:'/calendar', dedupKey:'calendar:<businessId>:expired:<connected_at>' })` (ตาราง F31 §5.3 ไม่มีแถวของ F16: ใช้ชนิด `system` และรายงานให้หัวหน้าเพิ่มแถว) · นัดที่ `pending` ของร้านนี้ถูกตั้ง `failed` (`reason 'grant_expired'`) · publish · ไม่เรียก Google อีกจนกว่าจะเชื่อมใหม่
- `auth_config` → `status='error'`, `last_error='auth_config'` (client id/secret ผิด) · นัดไม่ล้ม
- **แอปอยู่ในโหมด Testing ของ Google: refresh token ของ external user type หมดอายุใน 7 วัน** (ตามที่ brief เดิมระบุ, UNCONFIRMED ต้องตรวจเอกสาร Google ตอนตั้ง): ต้องเชื่อมใหม่ในวันงานเอง ไม่ใช้การเชื่อมที่ทำไว้ล่วงหน้าหลายวัน

### 5.4 Event id และเนื้อหา event (`eventmap.ts`)

- **event id deterministic:** `eventId = 'nl' + sha256('nless:' + businessId + ':' + appointmentId).hex` (66 ตัวอักษร ตัวอักษรเฉพาะ `0-9a-f` + `nl` ซึ่งอยู่ในชุด base32hex ตัวพิมพ์เล็ก `a-v0-9` ที่ Google ยอมรับ ความยาว 5–1024) · ตรวจด้วย `/^[a-v0-9]{5,1024}$/` ใน test · **ผูกกับ appointment id (ไม่ใช่ version)**: เลื่อนนัด = `patch` event เดิม ไม่สร้างใหม่ · retry กี่ครั้งก็ id เดิม → ครั้งที่สองได้ 409 = มีอยู่แล้ว = สำเร็จ
- เนื้อหา: `summary = '<serviceName> · <customerName>'` (ตัด 120) · `description = 'นัดหมายจาก Endless #<8 ตัวแรกของ id>\nสถานะ: จองแล้ว\nดูในระบบ: <APP_BASE_URL>/appointments?a=<id>'` · `start = { dateTime: startAt (UTC ISO), timeZone: business timezone }`, `end` เช่นกัน · `extendedProperties.private = { nlessAppointmentId, nlessBusinessId }` · `transparency: 'opaque'` · **ไม่ใส่เบอร์โทร ที่อยู่ โน้ต อีเมลลูกค้า และไม่ใส่ attendees** (ไม่มีอีเมลเชิญ) · พารามิเตอร์ `sendUpdates=none` เสมอ
- การนับเป็นเวลาไม่ว่าง (§5.7) ข้าม event ที่ id ขึ้นต้น `nl` หรือมี `extendedProperties.private.nlessAppointmentId` (ของเราเอง นับความจุอยู่แล้วใน F15)

### 5.5 ซิงก์ (job `calendar.sync`) — local authoritative

ทริกเกอร์: `onAppointmentChange` (ลงทะเบียนตอน boot) → ถ้า `isConnected(businessId)` (หรือกำลังมี connection ที่ `expired/error` ก็ไม่ทำอะไร) → `setExternalSyncState({ state:'pending', forVersion: appointment.version })` แล้ว `jobs.enqueue('calendar.sync', { businessId, appointmentId }, { dedupKey: 'calendar:<appointmentId>:v<version>', businessId, lockKey: 'calendar:<appointmentId>', maxAttempts: 5 })` · listener ต้องไม่ throw (จับและ log) และ **ไม่รอ Google** (การซิงก์เกิดหลัง commit และนอก request ของลูกค้าเสมอ)

handler (`sync.ts`), ใช้นัดเวอร์ชัน **ล่าสุดตอนทำงาน** (ไม่ใช่ตามเวอร์ชันที่ทำให้เกิด job):
1. `rec = getAppointmentRecord(businessId, appointmentId)` null → จบ · `conn` ไม่ active หรือไม่มี `calendar_id` → ถ้า `needsCalendarChoice`: คง `pending` แล้วจบ · อื่น ๆ → จบ (state ตามที่ F15 มี)
2. `eventId = eventmap.id(...)` · UPSERT `calendar_sync` (`attempts_total + 1`, `last_attempt_at`)
3. `v = rec.version` · ตัดสิน op จากสถานะนัด:
   - `booked` → **upsert**: `insertEvent` ถ้า `created=false` (409) → `patchEvent` ให้ตรงข้อมูลล่าสุด · ถ้า patch ตอบ `found=false` (event ถูกลบใน Google) → `insertEvent` ใหม่ · ถ้า 409 แต่ `getEvent` เห็น `status 'cancelled'` (id เคยถูกลบ) → `patchEvent({ restore: true })` (ตั้ง `status: 'confirmed'` พร้อมฟิลด์ทั้งหมด; UNCONFIRMED §15)
   - `cancelled` → **delete**: `deleteEvent` (404/410 = สำเร็จ)
   - `completed` / `no_show` → ไม่เขียน Google (เก็บ event เดิมเป็นประวัติ) · ถ้ามี `calendar_sync` อยู่แล้ว คงสถานะเดิม `synced`; ไม่มี → `setExternalSyncState('not_configured')`
4. สำเร็จ → อ่านนัดซ้ำ `rec2 = getAppointmentRecord(...)`: ถ้า `rec2.version !== v` (ระหว่างที่ HTTP ค้าง นัดถูกเปลี่ยน) **ห้ามตั้ง synced** → ไม่เขียน state (คง pending) แล้ว enqueue `calendar.sync` อีกครั้งของ `rec2.version` (dedupKey `calendar:<id>:v<rec2.version>`) · version ตรง → `UPDATE calendar_sync SET state='synced', last_synced_version=v, synced_at=now(), html_link, last_error=''` และ `setExternalSyncState({ state:'synced', forVersion: v, detail:{ eventId } })` (F15 คืน false เมื่อ version เลยไปแล้ว → enqueue ซ้ำเหมือนข้างบน)
5. ล้มเหลว (จัดชั้นตาม `TransportError.kind`):
   | kind | การจัดการ |
   |---|---|
   | `rate_limited`, `unavailable` (429, 403 `rateLimitExceeded`/`userRateLimitExceeded`, 5xx, timeout, เครือข่าย) | ถ้า `job.attempt < job.maxAttempts` → throw (core retry backoff `5s × attempt²`) · รอบสุดท้าย → ตั้ง `failed` (`reason` = kind) แล้ว return (job จบ ไม่ dead เพื่อไม่ให้ `/ops` เต็ม; repair จะเก็บต่อ) |
   | `grant_expired` | ตามข้อ 5.3 → `failed` (`grant_expired`) ทุกนัดค้าง · return |
   | `auth_config` | `failed` (`auth_config`) · return |
   | `bad_request` (400/403 ที่ไม่ใช่ rate limit; เช่น event id ไม่ถูกรูปแบบ) | `failed` ทันที ไม่ retry · return |
   | `not_found` ที่ calendar (ปฏิทินถูกลบ) | `failed` (`calendar_missing`), `needsCalendarChoice=true` |
   ทุกกรณีล้มเหลว: `UPDATE calendar_sync SET state='failed', last_error=<code ย่อ ≤ 300 ไม่มีข้อมูลลูกค้า>` + `setExternalSyncState({ state:'failed', forVersion: v, detail:{ reason } })` · นัดใน F15 **ไม่เปลี่ยน** · publish `calendar.changed`
6. audit: `calendar.sync.synced` เฉพาะครั้งแรกของนัด (ไม่ log ทุกครั้ง) · `calendar.sync.failed` ทุกครั้งที่ตั้ง failed (`details: { appointmentId, reason }`)

**ข้อห้ามที่ test ต้องจับ:** (ก) ห้ามแตะ/ลบ/ปรับสถานะนัดใน F15 เมื่อ Google ล้ม (ยกเว้นผ่าน `setExternalSyncState`) (ข) ห้ามตั้ง `synced` ถ้า version เปลี่ยนระหว่างทาง (ค) ห้ามสร้าง event สองตัวของนัดเดียวไม่ว่า retry/ซิงก์พร้อมกัน (lockKey ต่อนัด + id deterministic)

### 5.6 สถานะ pending / failed ที่ผู้ใช้เห็น

F15 แสดง chip ตาม `externalSync.state` (`not_configured` | `pending` | `synced` | `failed`) · หน้า `/calendar` แสดงจำนวนและรายการนัดที่ `failed` พร้อม `last_error` เป็นเหตุผลภาษาคน (ตาราง i18n `reason.*`) และปุ่ม "ลองซิงก์ใหม่" (รายนัด/ทั้งหมด) · ข้อความที่ส่งถึงลูกค้าโดย F15 **ไม่พูดถึงปฏิทินเลย** จึงไม่มีทางสัญญาว่า "บันทึกลงปฏิทินแล้ว" (ข้อกำหนดเดิมของ Papi)

### 5.7 เวลาไม่ว่างจาก Google (`busy.ts`) — รวมเข้า `findSlots`

`listBusy(businessId, { from, to })` (F15 เรียกจากทุกการค้นหา/ยืนยัน, fail-open ฝั่ง F15):
1. ไม่มี connection active + `calendar_id` → `[]`
2. cache memory ต่อ `(connectionId, from, to ปัดลงเป็นวัน)` 60 วินาที
3. `transport.listEvents(range)`: real = `GET /calendar/v3/calendars/{id}/events?timeMin&timeMax&singleEvents=true&orderBy=startTime&maxResults=250&showDeleted=false&fields=…` (ขอเฉพาะ `id,status,transparency,start,end,attendees(self,responseStatus),extendedProperties(private),nextPageToken`) ตามหน้าถัดไปได้สูงสุด 4 หน้า · timeout 5 วินาที
4. กรองเป็นเวลาไม่ว่าง: **ไม่รวม** `status='cancelled'` · `transparency='transparent'` (ผู้ใช้ตั้ง "ว่าง") · ผู้ใช้ตอบปฏิเสธ (`attendees[].self && responseStatus==='declined'`) · event ของเราเอง (id ขึ้นต้น `nl` หรือมี `nlessAppointmentId`) · event ทั้งวัน (`start.date`) เมื่อ `all_day_busy=false` (ถ้า true: ทั้งวันท้องถิ่นของร้านเป็นไม่ว่าง) · ที่เหลือ → `{ startAt, endAt }` UTC ISO
5. ผลเป็นช่วงที่ **บล็อกทุก resource** (หนึ่งปฏิทิน = ทั้งร้าน; ตามที่ F15 §5.3 ข้อ 8) · ล้มเหลว → `TransportError` โยนต่อให้ F15 จับ (fail-open) และ log `warn` (ไม่มีข้อมูล event)
6. `GET /calendar/busy` ให้ UI ตรวจ (และ `available:false` เมื่อดึงไม่ได้)

### 5.8 ซ่อม (repair)

- schedule `calendar.repair` ทุก 600 วินาที: ต่อ business ที่ `status='active' AND calendar_id IS NOT NULL`: `recs = listAppointmentsNeedingSync(businessId, { sinceMinutes: 14×1440, limit: 50 })` (นัดที่ `external_sync_state` เป็น `pending` หรือ `failed`) · กรอง: `pending` ที่ `updated_at` เก่ากว่า 5 นาที (job หายหรือตาย) และ `failed` ที่ `attempts_total < 12` (เพื่อไม่ยิง Google ไม่รู้จบ) · `jobs.enqueue('calendar.sync', …, { dedupKey: 'calendar:<id>:repair:<floor(now/600s)>', lockKey: 'calendar:<id>' })`
- เชื่อมใหม่สำเร็จ/เลือกปฏิทิน → job `calendar.repair-business` `{ businessId }` ทำสิ่งเดียวกันครั้งเดียวโดยไม่จำกัด `attempts_total` (ผู้ใช้ตั้งใจแก้)
- ปุ่ม "ลองซิงก์ใหม่" → `POST /sync/retry` (รายนัด หรือทั้งหมด ≤ 50) enqueue เช่นเดียวกัน (dedupKey มี `manual:<timestamp นาที>`) · `assertRateLimit('calendar:retry:<businessId>', 6/นาที)`
- นัดที่ `cancelled` แต่ event ยังอยู่เพราะล้ม → ถูกเก็บโดย repair เหมือนกัน (op = delete)

### 5.9 ตัดการเชื่อม

`POST /disconnect`: `list = listFutureAppointments(businessId, { limit: 500 })` นับที่ `externalSync.state` เป็น `synced|pending` → `futureSynced` · `checkOnly` → คืนจำนวน ไม่ทำอะไร · `futureSynced > 0` และไม่มี `force` → `POLICY_BLOCKED future_appointments` (`details.count`) · ทำ: `transport.revoke` (เรียก `POST https://oauth2.googleapis.com/revoke` ด้วย refresh token; ล้มก็ข้าม ไม่บล็อก) → `UPDATE calendar_connections SET status='inactive', refresh_token_enc=NULL, calendar_id=NULL, calendar_name=''` · **เก็บนัดทั้งหมดไว้** · สำหรับนัดอนาคตที่ไม่ใช่ `not_configured`: `setExternalSyncState('not_configured')` (วนทีละไม่เกิน 500) เพื่อไม่ให้ UI แสดง "ซิงก์แล้ว" ทั้งที่การยกเลิกครั้งต่อไปจะไม่ถึง Google · event ใน Google **ไม่ถูกลบ** (UI บอกก่อนตัด) · audit `calendar.disconnect` (`details: { force, futureSynced }`) · ลบข้อมูลโทเค็นเรียบร้อย (ตรวจใน test: ไม่มี `refresh_token_enc`)

### 5.10 Transport จำลอง (`SandboxTransport`)

เก็บ/อ่านใน `calendar_sandbox_events` (insert 409 = มีแถว id นี้) · `listEvents` คืนแถวของ business ช่วงที่ขอ รวม `is_external=true` (ใช้สาธิต busy: ปุ่ม "เพิ่มเวลาไม่ว่างทดสอบ" ใน UI โหมด sandbox) · `listCalendars` คืนปฏิทินเดียว `sandbox-<businessId>` · `connect/sandbox` สร้าง connection `mode='sandbox'`, `account_email='sandbox@example.test'` (ไม่มี token) · ทุกหน้าจอแสดงป้าย "จำลอง" และ `EventProbe.mode='sandbox'` · **ห้ามใช้ใน production เมื่อ `GOOGLE_MODE=real`** (`connect/sandbox` → `POLICY_BLOCKED sandbox_disabled`)

## 6. AI calls

ไม่มี AI call (F16 ไม่เรียก `model.*`) · ไม่มีข้อมูลที่ได้จาก event ใน Google ถูกส่งให้โมเดล (ชื่อ/รายละเอียด event ของเจ้าของเป็นข้อมูลส่วนตัว: F16 ส่งต่อให้ F15 เฉพาะ **ช่วงเวลา** `{startAt, endAt}` ไม่ส่ง summary/attendees)

## 7. UI

Route `/calendar` (`permission:'appointments.settings'` ตามเมนูใน F01, `titleKey:'calendar:page.title'`) · เมนู `{ path:'/calendar', labelKey:'calendar:menu.title', group:'commerce', icon:'CalendarMonthOutlined', order:40, permission:'appointments.settings', searchTerms:['google','calendar','ปฏิทิน','ซิงก์'] }` · หน้า `CalendarPage.tsx`:

1. `PageHeader` "Google Calendar" + ป้ายโหมด: `real` = "เชื่อมจริง" · `sandbox` = Chip สีเตือน "จำลอง · ไม่ได้ส่งถึง Google"
2. `SectionCard` **การเชื่อมต่อ** (`GET status`): สถานะ (`StatusChip generic`: ยังไม่เชื่อม / เชื่อมแล้ว / หมดอายุ / มีปัญหา / ตัดแล้ว) · บัญชี · ปฏิทิน · เชื่อมเมื่อ · ปุ่ม "เชื่อม Google Calendar" (`POST oauth/start` แล้ว `window.location.assign(authUrl)` เฉพาะเมื่อ `authUrl` ขึ้นต้น `https://accounts.google.com/`) · ในโหมด sandbox ปุ่ม "เชื่อมแบบจำลอง" · `expired` = Alert warning + ปุ่ม "เชื่อมใหม่" · ปุ่ม "ตัดการเชื่อมต่อ" → ตรวจ `checkOnly` ก่อน → `ConfirmDialog` แสดงจำนวนนัดอนาคตและข้อความ "นัดในระบบยังอยู่ครบ event ใน Google จะไม่ถูกลบ" → ยืนยันส่ง `force`
3. `SectionCard` **เลือกปฏิทิน** (เมื่อ `needsCalendarChoice` หรือกด "เปลี่ยน"): ตัวเลือกจาก `GET calendars` (ติดป้าย "ปฏิทินหลัก: ระวังปนกับร้านอื่น" และ "แนะนำ" สำหรับ `suggested`) + ปุ่ม "สร้างปฏิทินใหม่ Endless - <ร้าน>" · Switch "นับ event ทั้งวันเป็นเวลาไม่ว่าง"
4. `SectionCard` **สถานะการซิงก์**: ตัวเลข รอซิงก์ / ล้มเหลว / ซิงก์แล้ว (นัดอนาคต) + ตาราง `DataTable` ของนัดที่ `failed`/`pending` (เวลา, ลูกค้า, สถานะ, เหตุผล, ลิงก์ไปนัดใน `/appointments?a=`) + ปุ่ม "ลองซิงก์ใหม่ทั้งหมด" · มี `htmlLink` → ปุ่มไอคอน "เปิดใน Google" (แท็บใหม่ `rel="noopener noreferrer"` เฉพาะ `https://`)
5. `SectionCard` **เวลาไม่ว่างจากปฏิทิน** (ตัวอย่างวันนี้–พรุ่งนี้ จาก `GET busy`): รายการช่วง + ถ้า `available=false` แสดง "อ่านปฏิทินไม่ได้ตอนนี้ ระบบจะเสนอเวลาตามที่ร้านตั้งไว้" · โหมด sandbox: ปุ่ม "เพิ่มเวลาไม่ว่างทดสอบ" (`FormDialog`) และปุ่มลบ
6. `SectionCard` **ตั้งค่า OAuth (สำหรับผู้ดูแล)** (เห็นเมื่อ `mode='real'`): แสดง `redirectUri` ปัจจุบัน + รายการตรวจ "ต้องเพิ่ม URI นี้ใน Google Cloud Console → Authorized redirect URIs" (ไม่แสดง client secret)
7. `useRealtime('custom', e => e.featureId==='F16' && refetch())` · states: loading skeleton / error `EmptyState` + ลองใหม่ / ยังไม่เชื่อม = ข้อความอธิบายสั้น ๆ ว่าจะได้อะไร

**Slot `oauthCallbacks`**: `{ slot:'oauthCallbacks', id:'calendar.oauth', statePrefix:'gcal:', order:10, load: () => import('./OAuthCallbackHandler') }` · แสดงสปินเนอร์ "กำลังเชื่อมต่อ…" แล้ว redirect · error แสดง Alert + ปุ่ม "กลับไปหน้า Google Calendar" (ข้อความตามรหัส: `access_denied` ฯลฯ)

**Slot `channelCards`** (ของ `/channels` ของ C2): `{ slot:'channelCards', id:'calendar.card', labelKey:'calendar:card.title', order:90, permission:'appointments.settings', load: () => import('./ChannelCard') }` การ์ดเล็ก: สถานะ + ปุ่มไป `/calendar`

`data-testid`: `calendar-status`, `calendar-connect`, `calendar-disconnect`, `calendar-calendar-select`, `calendar-sync-failed-count`, `calendar-retry-all`

i18n (namespace `calendar`):

| key | th | en |
|---|---|---|
| `menu.title` | Google Calendar | Google Calendar |
| `page.title` | Google Calendar | Google Calendar |
| `card.title` | Google Calendar | Google Calendar |
| `mode.real` | เชื่อมจริง | Live |
| `mode.sandbox` | จำลอง · ไม่ได้ส่งถึง Google | Simulated · not sent to Google |
| `status.none` | ยังไม่ได้เชื่อม | Not connected |
| `status.active` | เชื่อมแล้ว | Connected |
| `status.expired` | หมดอายุ ต้องเชื่อมใหม่ | Expired: reconnect needed |
| `status.error` | มีปัญหาการตั้งค่า | Configuration problem |
| `status.inactive` | ตัดการเชื่อมต่อแล้ว | Disconnected |
| `intro` | เชื่อมเพื่อให้นัดใน Endless ขึ้นในปฏิทินของคุณ และให้ AI เลี่ยงเวลาที่คุณไม่ว่าง | Connect so appointments appear in your calendar and the AI avoids times you are busy |
| `connect` | เชื่อม Google Calendar | Connect Google Calendar |
| `connectSandbox` | เชื่อมแบบจำลอง | Connect simulated calendar |
| `reconnect` | เชื่อมใหม่ | Reconnect |
| `disconnect` | ตัดการเชื่อมต่อ | Disconnect |
| `disconnect.title` | ตัดการเชื่อมต่อ Google Calendar? | Disconnect Google Calendar? |
| `disconnect.body` | มีนัดในอนาคต {{count}} รายการที่ซิงก์ไว้ นัดในระบบยังอยู่ครบ แต่ event ใน Google จะไม่ถูกลบและจะไม่ถูกอัปเดตอีก | {{count}} upcoming appointments are synced. They stay in Endless, but the events in Google will not be deleted or updated any more |
| `account` | บัญชี | Account |
| `calendar` | ปฏิทิน | Calendar |
| `connectedAt` | เชื่อมเมื่อ | Connected at |
| `choose.title` | เลือกปฏิทินที่จะใช้ | Choose a calendar |
| `choose.required` | เลือกปฏิทินก่อน ระบบจึงจะเริ่มซิงก์ | Choose a calendar before syncing starts |
| `choose.primaryWarn` | ปฏิทินหลักของบัญชี: ถ้าสองร้านใช้บัญชีเดียวกัน เวลาไม่ว่างจะปนกัน | Primary calendar: two shops on one account would block each other |
| `choose.suggested` | แนะนำ | Suggested |
| `choose.create` | สร้างปฏิทินใหม่ "Endless - {{name}}" | Create a new calendar "Endless - {{name}}" |
| `choose.moved` | event เดิมยังอยู่ในปฏิทินเดิม นัดอนาคตจะซิงก์ไปปฏิทินใหม่ | Old events stay in the old calendar. Upcoming appointments sync to the new one |
| `allDayBusy` | นับ event ทั้งวันเป็นเวลาไม่ว่าง | Treat all-day events as busy |
| `sync.title` | สถานะการซิงก์ | Sync status |
| `sync.pending` | รอซิงก์ | Pending |
| `sync.failed` | ล้มเหลว | Failed |
| `sync.synced` | ซิงก์แล้ว | Synced |
| `sync.retryAll` | ลองซิงก์ใหม่ทั้งหมด | Retry all |
| `sync.retry` | ลองใหม่ | Retry |
| `sync.retried` | ส่งเข้าคิวแล้ว {{count}} รายการ | {{count}} queued |
| `sync.note` | นัดในระบบเป็นข้อมูลหลัก ถ้าซิงก์ล้ม นัดไม่หาย | Appointments in Endless are the source of truth. A failed sync never removes an appointment |
| `sync.openGoogle` | เปิดใน Google | Open in Google |
| `reason.grant_expired` | สิทธิ์หมดอายุ ต้องเชื่อมใหม่ | Access expired: reconnect |
| `reason.auth_config` | ตั้งค่า OAuth ไม่ถูกต้อง | OAuth configuration problem |
| `reason.rate_limited` | Google จำกัดจำนวนคำขอ ลองใหม่ภายหลัง | Google rate limit: retry later |
| `reason.unavailable` | ติดต่อ Google ไม่ได้ | Could not reach Google |
| `reason.bad_request` | Google ปฏิเสธข้อมูลของนัดนี้ | Google rejected this appointment's data |
| `reason.calendar_missing` | ไม่พบปฏิทินที่เลือก | The selected calendar was not found |
| `busy.title` | เวลาไม่ว่างจากปฏิทิน | Busy times from the calendar |
| `busy.none` | ไม่มีเวลาไม่ว่างในช่วงนี้ | No busy times in this range |
| `busy.unavailable` | อ่านปฏิทินไม่ได้ตอนนี้ ระบบจะเสนอเวลาตามที่ร้านตั้งไว้ | Cannot read the calendar now. Times offered follow the shop's own settings |
| `busy.add` | เพิ่มเวลาไม่ว่างทดสอบ | Add test busy time |
| `oauth.title` | ตั้งค่า OAuth | OAuth setup |
| `oauth.redirectHint` | เพิ่ม URI นี้ใน Google Cloud Console ที่ Authorized redirect URIs | Add this URI to Authorized redirect URIs in Google Cloud Console |
| `oauth.connecting` | กำลังเชื่อมต่อ… | Connecting… |
| `oauth.back` | กลับไปหน้า Google Calendar | Back to Google Calendar |
| `oauth.connected` | เชื่อม Google Calendar แล้ว | Google Calendar connected |
| `oauth.error.access_denied` | คุณไม่ได้อนุญาต จึงยังไม่เชื่อม | Access was not granted |
| `oauth.error.state_invalid` | ลิงก์เชื่อมต่อไม่ถูกต้อง ลองกดเชื่อมใหม่ | Invalid link. Start the connection again |
| `oauth.error.state_expired` | ลิงก์หมดอายุ ลองกดเชื่อมใหม่ | The link expired. Start again |
| `oauth.error.missing_scope` | ต้องอนุญาตสิทธิ์ปฏิทินทั้งหมดที่ขอ | All requested calendar permissions are required |
| `oauth.error.no_refresh_token` | ไม่ได้รับสิทธิ์ถาวรจาก Google ลองเชื่อมใหม่ | Google did not return offline access. Try again |
| `oauth.notConfigured` | ยังไม่ได้ตั้งค่า Google OAuth บนเซิร์ฟเวอร์นี้ | Google OAuth is not configured on this server |
| `common.retry` | ลองใหม่ | Retry |

## 8. Jobs, schedules, events

| รายการ | ค่า |
|---|---|
| Job `calendar.sync` | payload `{ businessId, appointmentId }` · dedupKey `calendar:<appointmentId>:v<version>` (repair: `calendar:<id>:repair:<slot10min>`, manual: `calendar:<id>:manual:<minute>`) · lockKey `calendar:<appointmentId>` · `maxAttempts: 5` · retry เฉพาะข้อผิดพลาดชั่วคราว (§5.5 ข้อ 5), รอบสุดท้ายตั้ง `failed` แล้วจบ (ไม่ dead) · handler idempotent (event id deterministic) |
| Job `calendar.repair-business` | payload `{ businessId }` · dedupKey `calendar.repair-business:<businessId>:<minute>` |
| Schedule `calendar.repair` | `everySeconds: 600` · §5.8 |
| Schedule `calendar.maintain` | `everySeconds: 3600` · ลบ `calendar_oauth_states` ที่หมดอายุเกิน 1 วัน |
| Realtime | `publish(businessId, { type:'custom', featureId:'F16', name:'calendar.changed', data:{} })` เมื่อสถานะเชื่อมต่อ/ซิงก์เปลี่ยน |
| Audit | `calendar.connect` · `calendar.disconnect` · `calendar.calendar.choose` · `calendar.settings.update` · `calendar.sync.synced` (ครั้งแรกต่อนัด) · `calendar.sync.failed` · ไม่มี token/อีเมลเต็ม/เนื้อหา event |
| notify | `system` → `{ role:'owners' }` เมื่อ grant หมดอายุ (dedupKey `calendar:<businessId>:expired:<connected_at>`) |
| `model_usage` | ไม่มี |

## 9. Seed และ fixtures

ไม่มี seed ของตาราง (ไม่มีข้อมูลเริ่มต้น: การเชื่อมต่อต้องทำจริง) · `server/src/features/calendar/seed.ts` มีเฉพาะ `resetDemo(ctx)`: ลบ `calendar_sync` และ `calendar_sandbox_events` ของร้านเดโมทั้งสอง · **ไม่ลบ `calendar_connections`** (ไม่ทำให้การเชื่อมที่คนทำไว้ในวันงานหาย) · ไม่มี `runDemo`

Fixtures ใน test (สร้างด้วยโค้ด): `FakeTransport implements CalendarTransport` (บันทึกการเรียก, ตั้งให้ล้มได้: `failNext(kind, times)`, ตอบ 409 ตามที่ id มีอยู่, จำลอง `cancelled` event) · ใช้ `setTransportForTests` · ฝัง `calendar_connections` แถว active (`mode 'real'`, `refresh_token_enc = encryptSecret('test-refresh')` ด้วยคีย์ test, `calendar_id 'cal-test'`) · นัดสร้างผ่าน F15 service จริงด้วย `createBooking` confirm หรือ staff create (ใช้ `CLOCK_FIXTURE`, `slot_a_1122_1000`) · `registerCalendarBridge` ลงทะเบียนตามปกติ · `fetch` ของ `GoogleTransport` ถูก stub ด้วย `vi.stubGlobal('fetch', …)` ใน test ของ `google.test.ts` (ตรวจ URL/header/body ที่สร้าง ไม่ยิงเน็ต)

## 10. Tests

Unit/service:

| ไฟล์ | case |
|---|---|
| `eventmap.test.ts` | event id ตรง `/^[a-v0-9]{5,1024}$/` ยาว 66 · deterministic (เรียก 3 ครั้งเท่ากัน) · คนละ appointment/business ได้ id ต่างกัน · start/end = `2026-11-22T03:00:00.000Z` พร้อม `timeZone 'Asia/Bangkok'` สำหรับนัด 22 พ.ย. 10:00 · summary ตัด 120 · **ไม่มีเบอร์/โน้ต/attendees** ในผล · `private` มี `nlessAppointmentId` |
| `oauth.test.ts` | `start` สร้าง state แถวเดียวกับ hash ถูก + `authUrl` มี `access_type=offline`, `prompt=consent`, สอง scope, `redirect_uri = APP_BASE_URL/oauth/callback`, `state` ขึ้นต้น `gcal:` · callback ใช้ state ซ้ำ = `state_invalid` · state หมดอายุ (นาฬิกา +11 นาที) = `state_expired` · ผู้ใช้คนอื่นถือ state = `PERMISSION_DENIED` · สมาชิกที่เสียสิทธิ์ `appointments.settings` แล้ว = `PERMISSION_DENIED` · `error=access_denied` ไม่เรียก token endpoint · scope ไม่ครบ = `missing_scope` + เรียก revoke · ไม่มี refresh_token = `no_refresh_token` · สำเร็จ: `refresh_token_enc` ขึ้นต้น `enc:v1:` และ decrypt ได้ค่าเดิม · token ไม่ปรากฏใน response, `audit.details`, log ที่จับได้ · เปลี่ยนบัญชีล้าง `calendar_id` · `GOOGLE_TEST_CALENDAR_ID` อยู่ในรายการ = เลือกอัตโนมัติ · `GOOGLE_MODE=sandbox` → `start` = `POLICY_BLOCKED not_configured` |
| `google.test.ts` | refresh single-flight: 5 คำขอพร้อมกัน = 1 ครั้ง · cache ใช้ซ้ำเมื่อเหลือ > 60 วินาที · `invalid_grant` → `grant_expired` → connection `expired`, token ถูกลบ, notify `system` หนึ่งครั้ง (dedupKey), นัด pending ของร้าน → failed · 429/503 = `rate_limited`/`unavailable` · URL/พารามิเตอร์ `insert` มี `sendUpdates=none` · `409` → `created:false` · `404/410` ของ delete → `existed:false` ไม่ error · `listEvents` ขอ `singleEvents=true` และตามหน้า ≤ 4 |
| `sync.test.ts` | **provider ล่ม:** FakeTransport ตอบ `unavailable` ทุกครั้ง → นัดใน F15 ยัง `booked` ข้อมูลครบ, `externalSync.state` = `pending` ระหว่างรอ แล้ว `failed` หลังครั้งที่ 5, ไม่มีข้อความถึงลูกค้าเรื่องปฏิทิน · **retry งานเดิม 2 ครั้ง** (เรียก handler สองรอบ) → FakeTransport มี event เดียว (id เดิม) และผลสุดท้าย `synced` · เลื่อนนัด → `patchEvent` ด้วย id เดิม (ไม่ `insert` ใหม่), เวลาใหม่ถูก · ยกเลิกนัด → `deleteEvent` · event ถูกลบใน Google แล้วเลื่อนนัด → patch `found:false` → insert ใหม่ id เดิม · **version เปลี่ยนระหว่าง HTTP ค้าง** (FakeTransport เปลี่ยนนัดระหว่าง insert) → ไม่ตั้ง `synced` ของ version เก่า, enqueue รอบใหม่, ผลสุดท้ายตรง version ล่าสุด · `completed` ไม่เรียก Google · ซิงก์สองงานของนัดเดียวพร้อมกัน (`Promise.all`) → lock ทำให้ event เดียว · `bad_request` ไม่ retry · `calendar_id` ไม่มี → คง pending ไม่เรียก transport |
| `busy.test.ts` | กรอง: cancelled / transparent / declined / event ของเรา (id `nl…` และ `nlessAppointmentId`) / all-day (ตาม `all_day_busy`) ถูกตัด · event 10:00–11:00 ของเจ้าของ → `findSlots` ของ F15 (รวม bridge จริง) ไม่เสนอ 10:00 และ 10:30 (ร้าน A, A-SERVICE-01) แต่เสนอ 11:00 · เฉพาะ resource ทั้งหมด (ร้านมีสอง resource ก็ถูกบล็อกทั้งคู่) · cache 60 วินาที (เรียกสองครั้งยิงครั้งเดียว) · transport throw → F15 ยังคืน slot (fail-open) · ไม่ตั้งค่า = `[]` |
| `repair.test.ts` | นัด `failed` ที่ `attempts_total < 12` ถูก enqueue ใหม่โดย repair แล้วสำเร็จเมื่อ transport กลับมา · `attempts_total >= 12` ไม่ถูกยิงอีก (ยกเว้นปุ่มมือ) · `pending` เก่า 6 นาทีถูกเก็บ · เชื่อมใหม่ → `repair-business` ซิงก์นัดอนาคตทั้งหมด · connection `expired` ไม่ enqueue |
| `disconnect.test.ts` | มีนัดอนาคตที่ synced 2 รายการ ไม่ `force` → `POLICY_BLOCKED future_appointments` `count 2` · `checkOnly` คืน 2 ไม่เปลี่ยนอะไร · `force` → status `inactive`, `refresh_token_enc` NULL, revoke ถูกเรียก, **นัดทั้งสองยังอยู่ครบ**, `externalSync` ของทั้งสอง = `not_configured` · ล้ม revoke ไม่บล็อก |
| `routes.test.ts` | owner B เรียก status/disconnect/calendars ของ A = 404 · staff A (`appointments.read` แต่ไม่มี `settings`): `GET status` 200, `oauth/start` 403, `disconnect` 403, `sync/retry` 403 · response ไม่มีฟิลด์ `refresh_token_enc`/`client_secret` (ตรวจ JSON ทั้งก้อน) · `calendar/oauth/callback` ต้อง session (ไม่มี = 401) · `sandbox/busy` ในโหมด real = `POLICY_BLOCKED` |
| `sandbox.test.ts` | `connect/sandbox` → `mode 'sandbox'`, ซิงก์สร้างแถว `calendar_sandbox_events`, `EventProbe.mode='sandbox'` · event จำลอง `is_external` ทำให้ `findSlots` ตัดเวลา · `GOOGLE_MODE=real` → `connect/sandbox` = `POLICY_BLOCKED sandbox_disabled` |

Playwright smoke `web/src/features/calendar/e2e/calendar.smoke.spec.ts` (production-safe: marker `e2e-<ts>`, นัดวันที่ 24–28 พ.ย. ไม่ใช่ 22 พ.ย. 10:00):
1. `ownerPage` เปิด `/calendar` → เห็น `calendar-status` และป้ายโหมด (จริง/จำลอง)
2. **ถ้าไม่เชื่อม (`status ≠ active` หรือต้องเลือกปฏิทิน) → `test.skip` พร้อมข้อความ "Google ยังไม่เชื่อมบน environment นี้"** (การเข้า Google ด้วยรหัสผ่านทำอัตโนมัติไม่ได้: คนทำการเชื่อมครั้งเดียวด้วยมือ แล้วบันทึกใน EVIDENCE.md) ห้ามถือว่าผ่านเป็น R
3. ถ้าเชื่อมแล้ว: สร้างนัดผ่าน `api` fixture (`POST /booking/appointments` ชื่อ `e2e-<ts>`, A-SERVICE-01, 26 พ.ย. 14:00) → poll `GET /calendar/appointments/:id/event` ทุก 2 วินาที ≤ 60 วินาทีจน `exists:true` และ `summary` มี `e2e-<ts>`, `startAt = 2026-11-26T07:00:00.000Z`, `timeZone = 'Asia/Bangkok'` · `mode` ตรงกับ `status.mode`
4. เลื่อนผ่าน API เป็น 15:00 → poll จน `startAt = …08:00:00.000Z` และ `eventId` ตัวเดิม
5. ยกเลิกผ่าน API → poll จน `exists:false` (หรือ `status:'cancelled'`) · cleanup ครบเพราะยกเลิกแล้ว
6. (ไม่ทำใน smoke) การกดอนุญาตบน Google · token หมดอายุ · Google ล่มจริง

## 11. Acceptance: R ตาม D6

- [ ] **R (real):** ในโหมด `real` กับ test user: เชื่อมผ่าน OAuth จริงบน production (redirect URI ของ Render ลงทะเบียนแล้ว), เลือก/สร้างปฏิทิน, ยืนยันนัดจากแชต Demo Chat → **เห็น event จริงในปฏิทิน Google ของ test user** ชื่อ `<บริการ> · <ลูกค้า>` เวลา 10:00 Asia/Bangkok ถูก · แนบหลักฐานใน EVIDENCE.md (ภาพหน้าจอ + JSON ของ `GET …/event` + เวลา) · เลื่อนนัด = event เดิมเปลี่ยนเวลา · ยกเลิก = event หาย
- [ ] **ล่มแล้วนัดไม่หาย:** test `sync.test.ts` (provider ล่ม) ผ่าน + ลองจริงบน dev: ตั้ง `GOOGLE_CLIENT_SECRET` ผิด → นัดยังอยู่ครบ, หน้า F15 แสดง "ซิงก์ล้มเหลว", หน้า `/calendar` แสดงเหตุผลและปุ่มลองใหม่
- [ ] **retry ไม่ซ้ำ:** รัน handler ซ้ำ 2 ครั้งด้วย id เดิม → event เดียว (test + ตรวจในปฏิทินจริงหนึ่งครั้ง)
- [ ] **busy อ่านจริง:** สร้าง event ส่วนตัวในปฏิทินที่เลือก (10:00–11:00 วันถัดไป) → `findSlots` ไม่เสนอช่วงนั้น (ตรวจผ่านหน้าจอ `/appointments` dialog สร้างนัด หรือ API)
- [ ] disconnect ตอนมีนัดอนาคตโดยไม่ `force` → ถูกปฏิเสธพร้อมจำนวน · หลัง disconnect นัดยังอยู่ · token ไม่อยู่ใน API response หรือ log (test + grep log)
- [ ] `expired`: จำลอง `invalid_grant` ใน test → สถานะ "หมดอายุ", ได้ notify, นัดใหม่ยังจองได้
- [ ] ตรวจ tenant/permission, audit, i18n th/en, loading/empty/error, Playwright smoke (ส่วนที่ทำได้) ผ่านบน production
- **S:** ไม่มี OAuth client หรือยังไม่ได้เชื่อมจริงบน production → โหมด `sandbox` ที่ติดป้ายชัดและ flow ซิงก์/ซ่อม/busy ครบ (ผ่านทุก test) · **A:** มีแค่ transport/ตาราง ไม่มีหน้าเชื่อม · ไม่มีค่าใดนับเป็น R ถ้า event ยังไม่ปรากฏใน Google จริง · **ไม่ถึง S/R ตอน 15:30 → ซ่อน `/calendar`** (นัดของ F15 ไม่กระทบ)

## 12. Security และ privacy

- **โทเค็น:** เก็บเฉพาะ refresh token ผ่าน `encryptSecret` (AES-256-GCM, `TOKEN_ENCRYPTION_KEY`) · access token ใน memory เท่านั้น · ไม่ส่งออก API/realtime/audit/log/error message ทุกกรณี · ตัดการเชื่อมหรือหมดอายุ → ลบ token · `GOOGLE_CLIENT_SECRET` อยู่ใน env ฝั่ง server เท่านั้น (ไม่มีตัวแปร `VITE_*`)
- **OAuth:** `state` สุ่ม 32 ไบต์ ใช้ครั้งเดียว อายุ 10 นาที ผูก `user_id` + `business_id` + redirect URI · ตรวจสิทธิ์ซ้ำตอน callback · `businessId` มาจาก state ที่ server ออกเอง ไม่รับจาก client · redirect URI มาจาก `APP_BASE_URL` เท่านั้น (ไม่รับจาก request) · `authUrl` ที่ web เปิดต้องขึ้นต้น `https://accounts.google.com/`
- **Scope น้อยสุดที่ทำงานได้:** `calendar.events` (เขียน/ลบ event, อ่าน event ของปฏิทินที่เลือก) + `calendar.readonly` (รายการปฏิทิน) · ไม่ขอ `email`/`profile`/Drive · ไม่ใช้ service account
- Tenant: ทุก query กรอง `business_id` · ปฏิทิน/เหตุการณ์ของร้านอื่นเข้าไม่ได้ (404) · event id รวม `businessId`
- PII: ส่งไป Google เฉพาะ ชื่อบริการ + ชื่อลูกค้า + เวลา + ลิงก์กลับระบบเรา (ไม่ส่งเบอร์/ที่อยู่/โน้ต/อีเมล/ข้อความแชต) · ข้อมูล event ของเจ้าของที่อ่านมา ใช้เฉพาะช่วงเวลา ไม่เก็บ ไม่ log summary · แจ้งเจ้าของใน UI ว่า event ที่สร้างมีชื่อลูกค้า
- ห้าม log: token, `code`, `state` ดิบ, summary/attendees ของ event ภายนอก, อีเมลเต็มของบัญชี Google (ใช้ domain หรือ hash)
- Rate limit: `oauth/start` และ `sync/retry` ตามข้อ 3/5.8 · การเรียก Google มี timeout 8 วินาที (busy 5 วินาที) และ circuit แบบง่าย: ถ้า 5 คำขอติดกันล้มด้วย `unavailable` ภายใน 1 นาที หยุดเรียก busy 60 วินาที (คืน `[]` ทันที) เพื่อไม่ให้การค้นหาช่วงเวลาช้า
- บัญชีทดสอบเท่านั้น: ใช้ Google test user ของทีม ไม่ใช้ปฏิทินส่วนตัวที่มีข้อมูลจริง ปฏิทินที่เลือกควรเป็นปฏิทินใหม่เฉพาะงานนี้

## 13. Edge cases

| กรณี | ผลที่ต้องได้ |
|---|---|
| ผู้ใช้ปฏิเสธที่หน้า Google | กลับมา `/calendar?error=access_denied` ข้อความสุภาพ ไม่มี connection ใหม่ |
| ผู้ใช้ติ๊กสิทธิ์ออกบางตัว | `missing_scope` + revoke token ที่ได้ ไม่เก็บ |
| callback ถูกเปิดซ้ำ (refresh หน้า) | `state_invalid` (ใช้แล้ว) แสดงข้อความและลิงก์กลับ ไม่สร้างซ้ำ |
| สองร้านเชื่อมบัญชี Google เดียวกันและเลือก primary | ใช้ได้ แต่ busy ปนกัน: UI เตือนตอนเลือก primary |
| ลบปฏิทินที่เลือกใน Google | ซิงก์ต่อไปล้มด้วย `not_found` → `failed calendar_missing`, `needsCalendarChoice` เปิด |
| เจ้าของแก้/ลบ event ที่เราสร้างใน Google | ไม่มีผลต่อนัดในระบบ (ไม่ซิงก์กลับ) · เลื่อน/ยกเลิกครั้งถัดไปจะ patch/insert/ delete ให้ตรงกับระบบ |
| นัด `booked` ถูกเลื่อนขณะ job เก่ายังค้างคิว | job ใช้นัดล่าสุดเสมอ ผลเหมือนกัน (idempotent) |
| นัดยกเลิกก่อนที่ event จะถูกสร้าง | op = delete → `existed:false` → `synced` (ไม่มี event ก็ถือว่าตรง) |
| เชื่อมใหม่หลังหมดอายุ | `repair-business` ซิงก์นัดอนาคตที่ค้าง `failed` ทั้งหมด |
| เซิร์ฟเวอร์ restart ระหว่างซิงก์ | job อยู่ใน DB (lease หมดแล้วรันใหม่) · id เดิม → ไม่ซ้ำ |
| นัดซิงก์สำเร็จแต่ `setExternalSyncState` ล้ม | repair เห็น `pending` เก่า > 5 นาที → รอบใหม่ patch ซ้ำ (ไม่ซ้ำ event) แล้วตั้ง synced |
| ร้านไม่มี `GOOGLE_TEST_CALENDAR_ID` | ผู้ใช้เลือกเองหรือสร้างใหม่ |
| นัดนอกชั่วโมงที่ Google อนุญาต / ปีแปลก | ไม่มีข้อจำกัดเฉพาะ · ข้อมูลเกินที่ Google ปฏิเสธ → `bad_request` failed |
| event ทั้งวันของเจ้าของ (วันหยุด) และ `all_day_busy=false` | ไม่บล็อกเวลา (ร้านตั้งเวลาปิดจริงที่ F04) |
| `GOOGLE_MODE=real` แต่ไม่มี client | status `realConfigured:false` ปุ่มเชื่อมแสดงข้อความ `oauth.notConfigured` ไม่ล้ม |
| เขตเวลาร้านไม่ใช่ Bangkok | `timeZone` ของ event = timezone ร้าน (ค่าจาก F04) |

## 14. Build order (slices ≤ 45 นาที)

| Slice | เวลา | ส่งมอบ |
|---|---|---|
| **S1 แกนซิงก์ + sandbox (ให้ F15 มีที่ลงทะเบียน)** | 40 | migration · `transport.ts` + `SandboxTransport` · `eventmap.ts` (id deterministic) · `sync.ts` (job, version-race, failed) · `bridge.ts` ลงทะเบียนกับ F15 · listener `onAppointmentChange` · routes status/connect-sandbox/calendars/disconnect/retry + หน้า `/calendar` (ป้ายจำลอง) · tests eventmap, sync, sandbox, disconnect · ถึงตรงนี้ = **S** |
| **S2 Google OAuth จริง** | 45 | `google.ts` (token single-flight, HTTP), `oauth.ts` + routes start/callback, `OAuthCallbackHandler` (slot `oauthCallbacks`), `GoogleTransport`, เลือก/สร้างปฏิทิน, `GOOGLE_TEST_CALENDAR_ID` · tests oauth, google · ทดลองกับ Google test user จริงบน dev: event ปรากฏในปฏิทิน (จดหลักฐาน) |
| **S3 busy + repair + production** | 35 | `busy.ts` + รวมเข้า `findSlots` (ทดสอบกับ F15 จริง), schedule `calendar.repair`, expired + notify, การ์ด `channelCards`, `resetDemo`, Playwright smoke, ตั้ง redirect URI ของ production + เชื่อมจริงบน production หนึ่งครั้ง + EVIDENCE.md (R) |

ลำดับ: ถ้าไม่มี OAuth client พร้อมก่อน S2 ให้จบที่ S1 แล้วรายงาน **S** · เวลาไม่พอ ตัด `channelCards` และ circuit breaker (§12) ก่อน

## 15. UNCONFIRMED และสิ่งที่ต้องตรวจในวันงาน

1. **เตรียม Google OAuth client (คนทำ, ก่อน 11:00):** (ก) Cloud project + เปิด Google Calendar API (ข) OAuth consent screen: External, Testing, เพิ่ม test users (ใช้บัญชีทดสอบของทีม) และเพิ่มสอง scope (ค) สร้าง OAuth client ชนิด Web application (ง) ใส่ Authorized redirect URIs: `http://localhost:5170` ถึง `5179` ลงท้าย `/oauth/callback` และ URL ของ Render (จ) ใส่ `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` ใน `.env.local` ของ lane A3 และ Render env (ฉ) ตั้ง `GOOGLE_MODE=real` เฉพาะเมื่อพร้อม · ถ้ายังไม่พร้อม F16 ทำได้ถึง S ด้วย sandbox · **หน้า "Google hasn't verified this app"** จะขึ้นสำหรับแอป Testing: กด Advanced → ไปต่อ (ปกติ) · **ยังไม่ได้ตรวจกับคอนโซลจริง: ชื่อเมนูใน Google Cloud Console อาจเปลี่ยน**
2. **Refresh token หมดอายุ 7 วันเมื่อแอปอยู่ใน Testing (external)** ตามที่ brief เดิมจดไว้: UNCONFIRMED ตรวจเอกสาร Google ตอนตั้งค่า · ผลคือการเชื่อมที่ทำไว้ล่วงหน้าอาจหมดอายุก่อนวัน demo → เชื่อมใหม่เช้าวันนำเสนอ
3. **Google API ที่ใช้ตรวจจากเอกสารปัจจุบันตอนเริ่ม S2:** endpoint `oauth2.googleapis.com/token`/`revoke`, `accounts.google.com/o/oauth2/v2/auth`, `calendar/v3` (`events.insert` พร้อม `id`, 409 เมื่อซ้ำ; `events.patch`; `events.delete` 404/410; `events.list` พร้อม `singleEvents`; `calendarList.list` กับ `minAccessRole`; `calendars.insert`) · ชุดอักขระของ event id (base32hex ตัวพิมพ์เล็ก, 5–1024 ตัว) · พารามิเตอร์ `sendUpdates=none` · scope `calendar.readonly` ครอบคลุม `events.list` และ `calendarList.list` · ไม่ได้ลองยิงจริงในขณะเขียน spec นี้ (ไม่มีข้อมูลรับรอง)
4. **การคืนชีพ event ที่เคยถูกลบด้วย id เดิม** (`patch` ด้วย `status:'confirmed'` เมื่อ `insert` ได้ 409 และ `getEvent` เห็น `cancelled`): UNCONFIRMED พฤติกรรมของ Google · ถ้าไม่ได้ผล ให้ตกไปที่ `failed (bad_request)` แล้วรายงาน (กรณีนี้เกิดยากเพราะนัด `cancelled` เป็นสถานะปลายทาง)
5. **หน้า `/oauth/callback` ของ core (C1) ส่ง props อะไรให้ slot:** ไม่ระบุใน contract · F16 อ่าน `window.location.search` เอง จึงไม่พึ่ง props · ตรวจว่า core เลือก slot ด้วย `statePrefix` ตรง `gcal:` และไม่แลก/ล้าง `code` เอง (ถ้าล้างก่อน → `NEED TO:C1`)
6. **`APP_BASE_URL` ต่อ lane/ production:** ต้องเท่ากับ origin ที่เบราว์เซอร์ใช้จริง (`http://localhost:517x` / URL ของ Render) มิฉะนั้น `redirect_uri_mismatch` · ตรวจค่าจริงใน `.env.local` ที่ `npm run lane:init` เขียน
7. **ตาราง F31 §5.3 ไม่มีแถวของ F16:** ใช้ชนิด `system` ตอน grant หมดอายุ (`NotifyInput.type` มี 9 ค่า ไม่มี calendar) · รายงานให้หัวหน้าเพิ่มแถวถ้าต้องการ
8. **Export ของ F15 ที่ F16 ใช้** (`listFutureAppointments` ถูกเพิ่มใน §4.1 ของ F15 เพื่อ F16): ลายเซ็นกำหนดโดย F15 spec · ถ้า F15 merge ก่อนแล้วลายเซ็นต่างจากนี้ ให้ปรับฝั่ง F16
9. **ข้อความ "จำลอง" ใน production:** ถ้า production ตั้ง `GOOGLE_MODE=real` ปุ่มจำลองต้องไม่ปรากฏ (ทดสอบแล้วใน `routes.test.ts`)
10. **ข้อความ summary ของ event มีชื่อลูกค้า:** เจ้าของปฏิทินเป็นคนเห็น (ปฏิทินเดียวกับของร้าน) ถ้าปฏิทินถูกแชร์ให้บุคคลอื่น ชื่อลูกค้าจะเห็นด้วย · ไม่ใช่เรื่องของระบบแต่แจ้งใน UI (ข้อ `calendar` ใน §12)
