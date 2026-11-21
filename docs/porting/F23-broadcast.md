# F23 broadcast — Broadcast และกลุ่มผู้รับ

> **Build spec (ใช้ตัวนี้สร้าง):** [docs/specs/F23-broadcast.md](../specs/F23-broadcast.md) · หน้านี้คือ know-how เดิมจาก Papi · ส่วน "Papi files to read" ใช้ได้เฉพาะเมื่อหัวหน้าโพสต์ `LEAD: PAPI-REF OPEN` ([D1](../DECISIONS-2026-11-20.md))

> **Tier P2** · เริ่มเขียนโค้ดเมื่อหัวหน้าโพสต์ `LEAD: OPEN P2` เท่านั้น · [tier และงบ](../../PLAN.md#tier-core-ก่อน-ส่วนเสริมทีหลัง)

**Lane A1** (ฟีเจอร์ 4/4) · owner A · เป้า **S** (R ของ LINE เมื่อถึง test OA จริง) · พึ่ง F12, F17, F24, F35 · **ให้:** ไม่มี contract ข้ามคน · **ใช้:** A3 `listCustomersByTags()` `getCustomer()` (consent) · F12 `renderTemplate()` · F09 `saveMessage()` · core `sendToCustomer`, `jobs.enqueue` (runAt), `requirePermission`, `publish` · ไม่มีโควตา (ใช้ได้ไม่จำกัด) · web path `/broadcast`
## Papi files to read (ใต้ `../papi-ref`)
1. `Backend/functions/LineBroadcast/src/index.mjs` — routes estimate/create/history, idempotency, snapshot, batches ใน transaction เดียว
2. `Backend/layers/nodejs-utils/nodejs/line-broadcast.mjs` — audience: tag `any`/`all`, ตัดคนที่ block, บันทึกลงแชทของผู้รับ
3. `Backend/functions/LineBroadcastWorker/README.md` + `src/index.mjs` — ส่งทีละ batch, เขียนประวัติแชทโดยไม่รอ lock ของลูกค้า
4. `Database/broadcasts.sql`, `broadcastbatches.sql`, `broadcastrecipients.sql` — state machine และ count
5. `Backend/layers/nodejs-utils/nodejs/messaging-consent.mjs` + `Database/messagingconsents.sql` — กฎ consent (revoked ชนะเสมอ)
6. `Backend/functions/LineBroadcast/src/meta-audience.mjs` — Messenger/IG ส่งได้เฉพาะคนที่ทักมาใน 24 ชม.
7. `Backend/layers/nodejs-utils/nodejs/broadcast-http.mjs` — gate ของ route (permission + business)
8. FE: `Frontend/src/pages/Broadcast.tsx`, `components/broadcast/` (AudiencePicker, ChannelChooser, BroadcastHistory, QuotaStat), `functions/broadcastApi.ts`, `broadcastContract.ts`, `locales/th/broadcast.json`
9. tests: `Frontend/src/components/broadcast/AudiencePicker.test.tsx`, `BroadcastHistory.test.tsx`
## Behaviors to keep (ตรวจจากโค้ดที่ 6959a92f)
- สิทธิ์: ดู estimate/history = `broadcast.read` · สร้าง/ส่ง = `broadcast.send` · ไม่มี plan gate ของ tag
- audience = tag ids + match `any`/`all` · ไม่เลือก tag = ทุกคนของช่องทางนั้น · LINE ตัดคนที่ block OA · Messenger/IG เฉพาะคนที่ข้อความล่าสุดอายุ <24 ชม.
- สร้างซ้ำได้ผลเดิม: UNIQUE (business, `client_request_id`) ส่งซ้ำคืน broadcast เดิม · enqueue ล้มเก็บเป็น `enqueue_failed` แล้วส่งซ้ำได้
- ใน transaction เดียว (advisory lock ต่อช่องทาง): snapshot ชื่อ tag + จำนวนผู้รับ แล้วสร้างแถวผู้รับครบ · แก้ tag หลังยืนยันไม่เปลี่ยนการส่งที่เริ่มแล้ว · ผู้รับ PK (broadcast, ลูกค้า) จึงไม่ซ้ำ
- state: broadcast `queued → sending → completed | partially_failed | failed` (+ `enqueue_failed`) · batch และผู้รับ `pending/sending/accepted/failed` · LINE ≤500 คนต่อ batch · ผู้รับที่ค้าง `sending` ตอน retry ถูกบันทึก failed ไม่ส่งซ้ำ
- ไม่มีโควตาของแพ็กเกจ (ใช้ได้ไม่จำกัด) · monthly limit ของ LINE OA เองเป็นผลจาก sender ของ F17 · ข้อความ 1–5000 ตัว
- หลังส่งได้ เขียนข้อความ broadcast ลงแชทของผู้รับแต่ละคน (idempotent ด้วย external id) และไม่รอ lock ของลูกค้าที่ bot กำลังตอบ (Papi เลื่อนแล้วลองใหม่)
- consent: marketing ต้อง `granted` · `revoked` ชนะเสมอ แม้เคยอยู่ใน preview (บังคับที่ server ไม่ใช่ UI)
## Drop / replace
- SQS `LineBroadcastQueue` + worker Lambda → `jobs.enqueue('broadcast.send', …, { dedupKey: broadcast:<id>:batch:<n>, runAt })` · Papi ไม่มี scheduling แต่ SPEC ต้องมี → ใช้ `runAt`
- LINE multicast/OA-wide + retry key + follower insight API → ส่งทีละผู้รับด้วย `saveMessage({ customer, direction: 'outbound', origin: 'broadcast', triggerAi: false })` แล้ว `sendToCustomer(conversationId, parts, { messageId })` (sender ของ F17/F18)
- Papi ไม่มีขั้น preview/confirm แยก (มีแค่ estimate แล้ว create) → ระบบใหม่เพิ่ม preview snapshot + ปุ่มยืนยัน · OUT: Messenger marketing messages + opt-in request (A)
## Tables
- ของ F23: `broadcasts` (business_id, client_request_id unique, parts หรือ template_id, audience snapshot jsonb, status, counts, scheduled_at, confirmed_by, confirmed_at) · `broadcast_recipients` (broadcast_id + customer_id PK, state `pending/skipped/sent/failed/unknown`, skip_reason, message_id)
- อ่าน: tags/consent ผ่าน F24 service · customers/conversations ผ่าน F09 service ห้าม query ตารางของ A3/core ตรง
## Done when
- [ ] preview แสดงผู้รับจริงใน scope (tenant A ไม่เห็นลูกค้า B) · ก่อนกดยืนยันไม่มี job และไม่มีข้อความ
- [ ] `tag_vip_a` ได้ 2 คนใน preview แต่ตอนส่ง A Customer Two (revoked) ถูก skip `consent_revoked`
- [ ] ลูกค้าที่ตรงหลาย tag ได้ 1 แถว · ยืนยันซ้ำด้วย `clientRequestId` เดิมได้ broadcast เดิม
- [ ] สถานะต่อผู้รับ pending → sent/failed ตาม `DeliveryResult` · sender sandbox แสดงป้าย sandbox ไม่ขึ้นว่า delivered
- [ ] ตั้งเวลาอนาคตแล้วไม่ส่งก่อนเวลา (clock fixture)
## Status floor
**S** ด้วย sandbox sender ของ core · LINE เป็น R เมื่อ F17 ส่งถึงเพื่อนของ test OA จริงและมีหลักฐาน · Messenger/IG ตามสถานะ F18
