# F09 inbox — Inbox ประวัติแชท และ Demo Chat

> **Build spec (ใช้ตัวนี้สร้าง):** [docs/specs/F09-inbox.md](../specs/F09-inbox.md) · หน้านี้คือ know-how เดิมจาก Papi · ส่วน "Papi files to read" ใช้ได้เฉพาะเมื่อหัวหน้าโพสต์ `LEAD: PAPI-REF OPEN` ([D1](../DECISIONS-2026-11-20.md))

> **Tier P0** · รวมหน้า Demo Chat · เริ่มเขียนโค้ดหลัง `SETUP READY` · [tier และงบ](../../PLAN.md#tier-core-ก่อน-ส่วนเสริมทีหลัง)

**Lane A1** (ฟีเจอร์ 1/4) · owner A · เป้า **R** (golden path, gate ขั้น 2 และ 4) · พึ่ง F03, F35 (มี fake) · **ให้:** `saveMessage()` `getConversation()` `getHistory()` · **ใช้:** core `getUser/getBusiness/requirePermission`, `db`, `jobs.enqueue`, `sendToCustomer` (sender `web`), `publish`, `storage` · F11 `isHumanTakeover()` (แสดงสถานะ) · web paths `/chat` `/demo-chat` · host ของ slot `chatSidePanels` `chatComposerActions` `chatMessageActions`
## Papi files to read (ใต้ `../papi-ref`)
1. `Backend/functions/DemoChat/src/index.mjs` — header อธิบาย Demo Chat ครบ (thread ต่อคน, reset, ไม่ billable)
2. `Database/conversation.sql` (คอมเมนต์คู่ status + owner) · `Database/messages.sql` (seq, `message_group_id`, external id unique) · `Database/endusers.sql`
3. `Backend/functions/GetMessages/src/index.mjs` — cursor `before`/`after`, ห้ามตัด reply ข้ามหน้า, 404 ข้าม tenant
4. `Backend/functions/GetLatestConversation/src/index.mjs` + `src/contact-queries.mjs` — list, filter, search, cursor
5. `Database/chatinboundreceipts.sql` — แนวคิด dedup webhook · `Backend/layers/nodejs-utils/nodejs/websocket-authorization.mjs` — ใครได้ event ไหน
6. `Backend/functions/WebsocketSendMessage/README.md` หัวข้อ "Takeover before the lock wait" (staff send)
7. `Frontend/src/pages/Messager.tsx` → `pages/messager/chatList/ChatInboxPane.tsx`, `useChatInbox.ts` → `pages/messager/messenger/ChatConversationPane.tsx`, `useConversationTimeline.ts`, `chatLiveEvents.ts`
8. `Frontend/src/pages/DemoChat.tsx` + `components/messenger/DemoChatPanel.tsx`, `ChatWindow.tsx`, `ContactList.tsx`
9. `Frontend/src/functions/chatFilter.ts`, `chatTimeline.ts`, `chatRows.ts`, `hooks/useChatSocket.ts`, `locales/th/chat.json` (คัดเฉพาะ key ที่ใช้)
10. tests ใช้เป็น acceptance เพิ่ม: `Frontend/src/components/messenger/ContactList.test.tsx`, `DemoChatPanel.scope.test.tsx`
## Behaviors to keep (ตรวจจากโค้ดที่ 6959a92f)
- ทุก message มี seq ต่อ conversation (unique) · reply หลาย part ใช้ group id เดียว และหน้า history ห้ามตัดกลาง group (Papi ขยายขอบหน้าไปต้น turn สูงสุด 40 แถว)
- external message id ซ้ำ = no-op: contract ให้ unique ต่อ (business, channel) คืน `created:false` และไม่ enqueue `ai.reply` ซ้ำ · ลูกค้า unique ต่อ (channel, external id) ภายใน business
- history: Papi limit ค่าเริ่ม 30 สูงสุด 100 ตรงกับ `HistoryOptions` ของ contract (30/100) · ส่ง `before` กับ `after` พร้อมกัน หรือ cursor/limit ผิดรูป → 400 ก่อนแตะ DB · conversation ของ tenant อื่น → **404 ไม่ใช่ 403** (ไม่บอกว่ามีอยู่) · ต้องมี `chat.read`
- inbox list: 1 แถวต่อลูกค้า (แชทล่าสุด) · filter `all`/`waiting`/`active`/`closed` โดย active = ยังไม่ปิด และ waiting ⊂ active · ค่า filter ที่ไม่รู้จัก → `all` ไม่ error · search trim ≤120 ตัว · filter ผู้ดูแล `me`/`unassigned`/`<userId>` · หน้าละ 20 สูงสุด 50
- waiting = "ต้องมีคนตอบ" ไม่ใช่แค่ status: ลูกค้ารออยู่ (เวลาข้อความลูกค้าแรกที่ยังไม่มีใครตอบ, Papi `awaiting_reply_since`) และ AI ปิด หรือมีคนรับช่วง หรือ bot เงียบเกิน 2 นาที · เรียง waiting ก่อน (รอนานสุดขึ้นบน) → แชทเปิดอื่น → ปิด · cursor ต้องเป็น composite (bucket, เวลา, id) ไม่งั้นแถวที่เวลาเท่ากันหลุด · แสดง "รอตอบ · 6 นาที" · ผู้ดูแลที่ถูก block/inactive ไม่แสดงเป็นเจ้าของ
- staff ส่งข้อความ = takeover ก่อน (Papi ตั้ง escalated ก่อนรอ lock) และถ้าส่งล้มหลัง takeover ยังคง takeover → route ส่งของ staff เรียก F11 `assignConversation(id, me)` ก่อน `sendToCustomer()`
- Demo Chat: 1 thread ต่อ staff user (`externalId = demo:<userId>`, channel `web`) · text 1–2000 ตัว · reset = ปิด conversation แล้วเริ่มใหม่ · ไม่ billable ไม่นับใน analytics · สิทธิ์ `insights.demo` · ต่างจาก Papi: ระบบใหม่ **ไม่ยกเว้น** web จาก AI off (ตาม gate ใน F10 brief)
## เปลี่ยนถึง 71ee7659 (Papi 19 พ.ย.)

brief นี้เขียนจากโค้ดที่ `6959a92f` ส่วนนี้คือพฤติกรรมที่ Papi เพิ่มหรือเปลี่ยนหลังจากนั้น ถ้าทำส่วนที่เกี่ยวข้องให้ port ตามโค้ดใน `../papi-ref` (ตอนนี้เป็น `71ee7659`) **Done when และ tier ไม่เปลี่ยน**

- แสดงรูป/ไฟล์ที่ staff ส่งจาก Meta Page Inbox (`3aaf0807`)
- ธง/แถบเตือนเมื่อ Meta AI ถือแชต (`3faa0fcf`)

## Drop / replace
- SQS incoming + `chat_inbound_receipts` batching + advisory lock `<channel>:<external_id>` → dedup ใน `saveMessage()` + `jobs.enqueue('ai.reply', …, { dedupKey: ai.reply:<messageId>, lockKey: conversation:<id> })`
- API Gateway WebSocket + `WebsocketPush` → `publish()` + `/ws` ของ core · Demo Chat SQS queue → `saveMessage(channel 'web')` ตรง คำตอบมาทาง sender `web`
- S3 presigned media URL → `storage.read(fileId, { businessId })` · `conversation_routing.account_id` → `businessId` ตรงๆ · OUT: demo business switch, rolling summary (F26)
## Tables
- `customers` `conversations` `messages` อยู่ใน base schema ของ core (C1 สร้างตาม contracts.ts) F09 เป็นเจ้าของ logic และเป็นทางเขียนเดียวผ่าน `saveMessage()` · ห้าม ALTER ตาราง core ต้องการคอลัมน์ → `NEED TO:C1`
- ของ F09 เอง (ถ้าจำเป็น): `inbox_read_state(user_id, conversation_id, last_read_seq)` · อ่าน memberships ของ core และคอลัมน์ handler/assignee ที่ F11 เขียน
## Done when
- [ ] ส่งจาก Demo Chat → persist → reload ยังเห็นทั้งข้อความลูกค้าและคำตอบ AI (gate ขั้น 2, 4)
- [ ] history 3 หน้าไม่ซ้ำไม่ข้าม และ reply หลาย part ไม่ถูกตัดข้ามหน้า
- [ ] tenant A เปิด conversation ของ B ได้ 404 · ไม่มี `chat.read` ได้ 403 (ยิง API ตรง ไม่ผ่าน UI)
- [ ] provider event เดิม 2 ครั้ง → message เดียว, `created:false`, ไม่มี `ai.reply` job ที่สอง
- [ ] list filter/search/cursor ถูก และ last message/unread อัปเดตสดผ่าน `/ws`
## Status floor
**R** (ต้องผ่าน gate 13:00) · ถ้า live refresh ยังไม่เสร็จใช้ poll ได้ แต่จดใน EVIDENCE.md · ไม่มี provider ภายนอก
