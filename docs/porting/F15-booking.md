# F15 booking — จองนัด ความจุ และการเตือน
> **Build spec (ใช้ตัวนี้สร้าง):** [docs/specs/F15-booking.md](../specs/F15-booking.md) · หน้านี้คือ know-how เดิมจาก Papi · ส่วน "Papi files to read" ใช้ได้เฉพาะเมื่อหัวหน้าโพสต์ `LEAD: PAPI-REF OPEN` ([D1](../DECISIONS-2026-11-20.md))

> **Tier P2** · เริ่มเขียนโค้ดเมื่อหัวหน้าโพสต์ `LEAD: OPEN P2` เท่านั้น · [tier และงบ](../../PLAN.md#tier-core-ก่อน-ส่วนเสริมทีหลัง)

**Lane A3** (ฟีเจอร์ 2/3) · owner A · เป้า **R** · พึ่ง F03, F09, F10, F35 · **ให้:** `findSlots(businessId, query)` `createBooking(input)` (`stage: 'propose' | 'confirm'`) → โพสต์ DONE ทันทีที่สองตัวนี้ผ่าน test · **ใช้:** C3 `getBusinessSettings()` (hours, timezone) · B1 `getProduct()` (service = catalog item ชนิด `service` มี duration) · core `db.tx` (ล็อก `booking:<businessId>` ด้วย advisory lock ระดับ transaction ภายใน tx), `jobs` (runAt, cron), `sendToCustomer`, `audit` · C3 `notify()` (`booking.created`/`booking.cancelled`) · web path `/appointments` + ปุ่มในแชท (slot `chatComposerActions`)
## Papi files to read (ใต้ `../papi-ref`)
1. `Database/appointments.sql` — คอมเมนต์ "IDEMPOTENCY IS A UNIQUE INDEX" และ "SLOT CAPACITY IS DELIBERATELY NOT A UNIQUE INDEX" · trigger `schedule_revision`
2. `Backend/functions/Orchestrator/BOOKING-RELIABILITY.md` — การเลือกไม่ใช่ consent, ห้ามเขียนก่อนยืนยัน
3. `Backend/layers/nodejs-utils/nodejs/booking-store.mjs` (ค่า default, lock `booking:<businessId>`, นับ seat ที่ซ้อนช่วงเวลา) · `booking-rules.mjs` · `booking-schedule.mjs` (slot เวลา Bangkok)
4. `Backend/layers/nodejs-utils/nodejs/booking-mutations.mjs` (create/reschedule/cancel) · `appointment-lifecycle.mjs` · `appointment-audit.mjs`
5. `Database/bookinglifecycle.sql` — `appointment_events`, `resources` (capacity), `resource_services`, `business_closures` (เป็นวันที่), `booking_waitlist`
6. `Backend/functions/UpdateAppointment/src/index.mjs` (header: staff เขียนได้เหนือกฎ) · `CreateAppointment/src/index.mjs` · `GetBookingSettings/src/index.mjs`
7. `Backend/functions/AppointmentReminder/src/index.mjs` (header: claim ก่อนส่ง, 24h/2h) · `AppointmentMaintenance/src/index.mjs`
8. `Backend/tests/booking-concurrency/README.md` — กรณีแข่ง slot
9. FE: `Frontend/src/pages/Appointments.tsx`, `components/appointment/AppointmentDialog.tsx`, `ScheduleBoard.tsx`, `BookingRulesPanel.tsx`, `components/messenger/ChatAppointmentAction.tsx`, `functions/appointmentContract.ts`, `bookingHoursForm.ts`
10. tests: `Frontend/src/components/appointment/AppointmentDialog.test.tsx`, `components/messenger/ChatAppointmentAction.test.tsx`
## Behaviors to keep (ตรวจจากโค้ดที่ 6959a92f)
- ความจุไม่ใช่ unique index: นับ seat ของนัดที่ช่วงเวลาซ้อนกันใต้ advisory lock ต่อ business (default 1 ต่อ slot + capacity ต่อ resource) · ทุก write ที่เปลี่ยนความจุใช้ lock เดียวกัน
- idempotency = unique index (business, idempotency key) ที่สร้างจาก (conversation, slot, ชื่อลูกค้า) · key เดียวกันใช้สร้าง calendar event id ของ F16 ด้วย
- เลือกเวลาในแชทไม่ใช่ consent: ต้องมีชื่อ, เวลาแน่นอน, ความจุผ่าน และ read-back ล่าสุดที่ครบ ก่อนเขียน · ไม่มี service ที่ชัด → ถามกลับ ห้ามเดาบริการอื่น
- slot rules (ค่าเริ่ม Papi): duration 60, granularity 30, buffer 0, จองล่วงหน้าอย่างน้อย 60 นาที, ไม่เกิน 60 วัน, ค้น 14 วัน, เสนอไม่เกิน 6 slot · ระบบใหม่ใช้ duration ของ service ใน catalog (A-SERVICE-01 = 30 นาที)
- วันหยุดเป็นวันที่ตามปฏิทินร้าน · เก็บเวลาเป็น UTC แสดง Asia/Bangkok (ไทยไม่มี DST)
- เปลี่ยนเวลา = `schedule_revision` + 1 และล้างสถานะ reminder · status `booked`/`cancelled`/`completed`/`no_show` · ทุกการเปลี่ยนมีแถว `appointment_events` (actor customer/bot/staff/merchant/system)
- reminder: 24 ชม. และ 2 ชม. ต่อ business (opt-in) · claim แถวด้วย UPDATE แบบมีเงื่อนไขก่อนส่ง ส่งล้มคืน claim · นัดที่ยกเลิก/ย้ายแล้วไม่ส่ง reminder รุ่นเก่า
- staff เขียนได้เหนือกฎ (นอกเวลา/เต็ม) โดยตั้งใจ แต่ยังมี audit และส่งข้อความแจ้งลูกค้า · กฎ hours/capacity บังคับเฉพาะทางลูกค้า/bot · สิทธิ์ `appointments.read`/`write`/`settings`
## Drop / replace
- Papi เปิด booking ได้เฉพาะเมื่อเชื่อม Google Calendar → ระบบใหม่ **local ก่อน** (นัดจริงอยู่ใน DB) และ F16 sync แยก · AppointmentReminder/Maintenance (EventBridge 15 นาที / 1 ชม.) → `jobs.enqueue('booking.reminder', …, { runAt, dedupKey: reminder:<id>:<revision>:<stage> })` + cron ของ F35
- ค่า default จาก env ของ Lambda → `booking_settings` ต่อ business · LINE push queue → `sendToCustomer()` · OUT: voice booking (F30), booking facts จากไฟล์แนบ, waitlist (if time)
- ให้ F16 รู้การเปลี่ยนแปลง: export `onAppointmentChange(listener)` ใน `service.ts` ของ F15 แล้ว F16 ลงทะเบียน (ทางเดียว ไม่ import กลับ)
## Tables
- ของ F15: `booking_settings` · `booking_resources` (capacity) · `booking_closures` · `booking_proposals` (snapshot slot, version, review_token hash, expires_at) · `appointments` (version, schedule_revision, idempotency_key unique ต่อ business, external_sync_state) · `appointment_events` · `appointment_reminders` (appointment, revision, stage unique)
- service item/ราคา/duration อ่านผ่าน F08 · seed จาก `SEED.resources` และ `SEED.slots`
## Done when
- [ ] สอง confirm แข่ง `slot_a_1122_1000` (22 พ.ย. 2569 10:00–10:30, capacity 1) พร้อมกัน → booked 1, อีกคนได้ `SLOT_FULL`
- [ ] `propose` ไม่สร้างนัด · confirm ซ้ำด้วย clientRequestId เดิม → นัดเดิม (`replayed: true`)
- [ ] reschedule แล้ว version/revision เพิ่ม และ reminder ของรุ่นเก่าไม่ส่ง · cancel แล้วไม่มี reminder
- [ ] `findSlots()` เคารพเวลาเปิด (A 10:00–20:00) และวันหยุด · เก็บ UTC แสดง "22 พ.ย. 2569 10:00" Asia/Bangkok
## Status floor
**R** (ไม่ต้องพึ่ง provider) · reminder ผ่าน LINE จริงตามสถานะ F17 (ไม่งั้น S) · waitlist เป็น U/A ได้ถ้าไม่ทัน
