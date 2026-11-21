# F16 calendar — เชื่อม Google Calendar และ sync นัด
> **Build spec (ใช้ตัวนี้สร้าง):** [docs/specs/F16-calendar.md](../specs/F16-calendar.md) · หน้านี้คือ know-how เดิมจาก Papi · ส่วน "Papi files to read" ใช้ได้เฉพาะเมื่อหัวหน้าโพสต์ `LEAD: PAPI-REF OPEN` ([D1](../DECISIONS-2026-11-20.md))

> **Tier P2** · เริ่มเขียนโค้ดเมื่อหัวหน้าโพสต์ `LEAD: OPEN P2` เท่านั้น · [tier และงบ](../../PLAN.md#tier-core-ก่อน-ส่วนเสริมทีหลัง)

**Lane A3** (ฟีเจอร์ 3/3) · owner A · เป้า **S** (R เมื่อเปิดดู event ใน test calendar ได้) · พึ่ง F15, F35 · **ให้:** ไม่มี contract ข้ามคน · **ใช้:** F15 `onAppointmentChange()` + export ตั้งสถานะ sync · core `jobs` (retry), `requirePermission`, `audit`, slot `oauthCallbacks` (statePrefix `gcal:`) · C3 `notify()` (grant หมดอายุ) · web path `/calendar` + การ์ดใน `/channels` (slot `channelCards`)
## Papi files to read (ใต้ `../papi-ref`)
1. `Backend/BOOKING_DEPLOYMENT.md` หัวข้อ 1 Google Cloud (scope 2 ตัว, redirect URI, ไม่ใช้ service account)
2. `Backend/functions/ConnectGoogleCalendar/src/index.mjs` — POST code / GET สถานะ + รายการ calendar / PATCH เลือก calendar / สร้าง calendar ใหม่
3. `Database/businessintegrations.sql` — คอมเมนต์ "WHY THIS IS NOT conversation_routing" และ "'expired' IS A NORMAL STATE"
4. `Backend/layers/nodejs-utils/nodejs/google-calendar.mjs` — refresh token, free/busy, `insertEvent` (409 = มีแล้ว), `getEvent`
5. `Backend/layers/nodejs-utils/nodejs/booking-calendar-identity.mjs` — event id แบบ deterministic · `booking-effects.mjs` — sync แยกจาก transaction ของ DB
6. `Backend/functions/DisconnectGoogleCalendar/src/index.mjs` — `checkOnly`, `force`, เก็บนัดไว้
7. `Backend/functions/AppointmentReminder/src/index.mjs` ส่วน "AGREE WITH GOOGLE FIRST" · `Backend/functions/GetIntegrations/src/index.mjs`
8. FE: `Frontend/src/components/appointment/GoogleCalendarCard.tsx`, `components/card/IntegrationCard.tsx`, `pages/GoogleOAuthCallback.tsx`, `functions/connectGoogleCalendar.ts`, `calendarIntegration.ts`
## Behaviors to keep (ตรวจจากโค้ดที่ 6959a92f)
- OAuth ของร้านเอง (ไม่ใช่ service account) scope แค่ `calendar.events` + `calendar.readonly` · businessId มาจาก session เท่านั้น ไม่รับจาก client · upsert การเชื่อมต่อใต้ lock
- 1 การเชื่อมต่อ active ต่อ provider ต่อ business · ไม่นับเป็น channel ที่คิดเงิน · เก็บ refresh token เป็นความลับ (DB เก็บแค่ ref หรือค่าที่เข้ารหัส) ห้ามส่งกลับ browser หรือ log
- `expired` เป็นสถานะปกติ: app ที่ยังอยู่ใน Testing ทำให้ refresh token หมดใน 7 วัน · เจอ `invalid_grant` → ตั้ง expired + แจ้งให้เชื่อมใหม่ · booking ห้ามสัญญาว่าบันทึกลง calendar แล้ว
- event id = `papi` + sha256(idempotency key ของนัด) เป็น hex (อยู่ในชุดอักษร base32hex ของ Google) · insert แล้วได้ 409 = มีอยู่แล้ว ถือว่าสำเร็จ → retry ไม่สร้างซ้ำ
- provider กับ DB ไม่อยู่ใน transaction เดียว: sync หลัง commit · ถ้านัดเปลี่ยนระหว่าง HTTP ค้าง ห้าม mark synced ด้วยข้อมูลเก่า · sync ล้มห้ามแสดงว่า "ยืนยันใน calendar แล้ว"
- `primary` คือ calendar ของบัญชี Google: สองร้านที่ใช้บัญชีเดียวกันจะกิน slot กัน → ให้เลือกหรือสร้าง calendar เฉพาะร้าน
- busy time จาก free/busy และ event ที่ร้านสร้างเองนับเป็นเวลาไม่ว่างเสมอ (if time: ใช้ใน `findSlots()` ของ F15 ผ่าน export)
- disconnect: คืน grant, ตั้ง inactive, ลบ token · **เก็บนัดไว้** · มีนัดในอนาคตต้องส่ง `force` (`checkOnly` คืนจำนวนให้ UI เตือน) · สิทธิ์ = `business.channels`
- ก่อนส่ง reminder ตรวจกับ Google ก่อนว่า event ถูกย้าย/ลบไหม (if time)
## Drop / replace
- Secrets Manager (`papi/google-oauth/client`, `google/calendar/*`) → `.env` (client id/secret) + token เข้ารหัสใน DB · `/google/callback` → slot `oauthCallbacks` ของ core (statePrefix `gcal:`) ร่วมกับ F06
- `booking-effects` (pending-action foundation) → `jobs.enqueue('calendar.sync', { appointmentId, version }, { dedupKey: calendar:<id>:<version> })`
- ถ้าไม่มี test OAuth client → transport ปลอมที่ติดป้าย sandbox ซึ่งเก็บ event ในตารางท้องถิ่น · OUT: sync กลับจาก Google ทั้งช่วงเวลา (AppointmentMaintenance), calendar ต่อ resource
## Tables
- ของ F16: `calendar_connections` (business_id, provider `google_calendar`, status `active/expired/error/inactive`, account_email, calendar_id, token_enc, connected_by, connected_at) · `calendar_sync` (appointment_id, appointment_version, event_id, state `pending/synced/failed`, attempts, last_error, mode `sandbox`/`real`)
- นัดอ่านและอัปเดตสถานะ sync ผ่าน export ของ F15 เท่านั้น
## Done when
- [ ] provider ล่ม (transport ปลอมตอบ error) → นัดใน F15 ยังอยู่ครบ และหน้าเว็บแสดง sync `failed` ชัดเจน · `pending` เห็นระหว่างรอ
- [ ] retry งานเดิม 2 ครั้งด้วย event id เดิม → event เดียว (409 ถือว่ามีแล้ว)
- [ ] disconnect ตอนมีนัดอนาคตโดยไม่ `force` → ถูกปฏิเสธพร้อมจำนวน · หลัง disconnect นัดยังอยู่ · token ไม่อยู่ใน API response หรือ log
- [ ] R: เปิดดู event ใน test calendar ได้จริงพร้อมเวลา Asia/Bangkok ถูก (แนบหลักฐานใน EVIDENCE.md)
## Status floor
ไม่มี test OAuth client = **A** · transport ปลอมที่ติดป้ายและ flow ครบ = **S** · R เฉพาะเมื่อมี event จริงใน test calendar
