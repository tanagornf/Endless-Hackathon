# F31 notifications — กระดิ่งแจ้งเตือนและ web push

> **Build spec (ใช้ตัวนี้สร้าง):** [docs/specs/F31-notifications.md](../specs/F31-notifications.md) · หน้านี้คือ know-how เดิมจาก Papi · ส่วน "Papi files to read" ใช้ได้เฉพาะเมื่อหัวหน้าโพสต์ `LEAD: PAPI-REF OPEN` ([D1](../DECISIONS-2026-11-20.md))

> **Tier P2** · เริ่มเขียนโค้ดเมื่อหัวหน้าโพสต์ `LEAD: OPEN P2` เท่านั้น · [tier และงบ](../../PLAN.md#tier-core-ก่อน-ส่วนเสริมทีหลัง)

- **Lane** C3 ลำดับ 4/4 (หลัง F04, F03, F02) · **คน** C · **พึ่ง** F03, F35 · **เป้า** bell R, push S → R · path ของ Papi อยู่ใต้ `../papi-ref/`
- **ให้** `notify(input: NotifyInput)` → `{ notificationIds, mode }` (ทุก lane เรียก) · **ใช้** `getUser()` / `getBusiness()`, `publish(businessId, { type: 'notification.created' }, { userIds })`, `jobs.enqueue()` (ส่ง push), `db`

## Papi files to read (in order)
1. `Backend/layers/nodejs-utils/nodejs/notifications.mjs` (`emitNotification`: ทางเขียนทางเดียว, fan-out ตอนเขียน, ไม่ throw)
2. `Backend/layers/nodejs-utils/nodejs/notification-access.mjs` (type → permission, personal types)
3. `Database/notifications.sql`, `Database/push_subscriptions.sql`
4. `Backend/functions/GetNotifications/src/index.mjs` (scope ต่อ business, `unread_elsewhere`, owned-only)
5. `Backend/functions/MarkNotificationsRead/src/index.mjs`
6. `Backend/functions/ManagePush`, `DispatchWebPush/src/index.mjs`, `Backend/layers/nodejs-utils/nodejs/web-push.mjs`, `web-push-transport.mjs`
7. `Backend/layers/nodejs-utils/nodejs/enums.mjs` (`NOTIFICATION_TYPE` 13 ชนิดของ Papi)
8. หน้า: `Frontend/src/layout/NotificationPanel.tsx`, `Frontend/src/components/notification/`, `hooks/useNotifications.ts`, `functions/notificationContract.ts`, `notificationCopy.ts`, `webPush.ts`, `locales/th/notification.json`

## Behaviors to keep
- map ชนิดของ Papi → `NotifyInput.type`: `conversation_escalated` / `assistance_requested` → `chat.handoff`, `note_mention` → `chat.mention`, `appointment_booked` → `booking.created`, `appointment_cancelled` → `booking.cancelled`, `invitation_received` → `invitation`, ที่เหลือ (`system_error`, `knowledge_imported`, `integration_action_required`) → `system` / `report`
- หนึ่งแถวต่อผู้รับต่อ event (fan-out ตอนเขียน); unique `(user_id, dedup_key)` + ON CONFLICT จึง notify ซ้ำหรือ retry แล้วไม่เกิดแถวซ้ำ; dedup key สร้างจาก id ไม่ใช่เวลา (ไม่ส่ง `dedupKey` = ไม่ dedup)
- ผู้รับ (`to`): `userIds` ที่ต้องเป็น member ของ business นั้น, `{ role: 'owners' }`, หรือ `{ permission }` = member ที่ active และถือ key นั้น; ไม่ส่งข้าม tenant; Papi ตัดคนที่กดขอความช่วยเหลือออกจากผู้รับของ event ตัวเอง
- `notify()` ล้มเพราะ DB หรือ push ให้ log แล้วคืนผลโดยไม่ throw (caller ของ Papi ไม่ครอบ try/catch); input ผิดรูปเท่านั้นที่เป็น `VALIDATION_ERROR`; `link` เป็น path ในแอปเท่านั้น ห้าม URL ภายนอกจากข้อความลูกค้าหรือ model
- อ่านได้เฉพาะผู้รับ (`WHERE user_id = ผู้เรียก`) และต้องยังมีสิทธิ์ตามชนิดตอนอ่าน (handoff / mention → `chat.read`, booking → `appointments.read`, อื่น ๆ → `business.read`); ชนิดที่ไม่รู้จักไม่แสดง
- bell แสดงแถวของ business ที่เลือก; `unread_elsewhere` นับ unread ของ business อื่นที่ถูกกรองออก; limit ค่าเริ่ม 30 สูงสุด 100; staff ใน business ที่เปิด auto-assign เห็นเฉพาะแถวของบทสนทนาที่ตัวเองถือ (ถ้า F11 มี auto-assign)
- mark read: `{ ids: [...] }` หรือ `{ all: true }` (เฉพาะแถวที่มองเห็นใน scope ปัจจุบัน); read ไม่เท่ากับ resolved (`resolved_at` ตั้งโดย action จริง เช่นรับ invite)
- title / body เป็นอังกฤษ (ใช้กับ push) และเก็บ key + vars ให้หน้าเว็บแปลเป็นไทย
- web push เฉพาะ handoff, assistance, assigned, mention; subscription unique ต่อ endpoint; push service ตอบ 404/410 = ลบ subscription; push ล้มหรือเบราว์เซอร์ปฏิเสธต้องไม่กระทบ bell
- Papi ไม่มีหน้า preferences (มีแค่ subscribe push ต่อเครื่อง) จึงทำใหม่ให้เล็กที่สุด: เปิด / ปิด push ต่อชนิด

## Drop / replace
- Lambda invoke `WebsocketPush` → `publish()` event `notification.created`; `DispatchWebPush` Lambda → job `notification.push` (retry จาก F35); polling 120 วินาทีเก็บเป็น fallback ได้

## Tables
- เป็นเจ้าของ: `notifications` (user_id, business_id, type, title, body, link, data, dedup_key, read_at, resolved_at), `push_subscriptions`, `notification_preferences` (ใหม่) · อ่าน `memberships` เพื่อหาผู้รับ

## Done when
- ผู้รับเท่านั้นที่อ่านแถวได้; mark read แล้ว reload ยังเป็น read; เบราว์เซอร์ปฏิเสธ push แล้ว bell ยังทำงาน
- `notify()` ซ้ำด้วย `dedupKey` เดิมได้แถวเดียว; staff ที่ไม่มี `chat.read` ไม่เห็นแจ้งเตือน `chat.handoff`
- R ของ push ต้องมี notification จริงในเบราว์เซอร์ที่อนุญาต (VAPID จาก `.env.local`) ไม่มี receipt ห้ามบอกว่า delivered

## Status floor
bell R · web push S จนกว่าจะเห็น notification จริงในเบราว์เซอร์
