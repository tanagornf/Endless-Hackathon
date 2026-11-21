# F11 team — ทีม คนรับช่วง (human handoff) และตารางงาน

> **Build spec (ใช้ตัวนี้สร้าง):** [docs/specs/F11-team.md](../specs/F11-team.md) · หน้านี้คือ know-how เดิมจาก Papi · ส่วน "Papi files to read" ใช้ได้เฉพาะเมื่อหัวหน้าโพสต์ `LEAD: PAPI-REF OPEN` ([D1](../DECISIONS-2026-11-20.md))

> **Tier P0** · ส่วน takeover ที่ gate ขั้น 5 ใช้ ทำก่อนส่วนอื่น · เริ่มเขียนโค้ดหลัง `SETUP READY` · [tier และงบ](../../PLAN.md#tier-core-ก่อน-ส่วนเสริมทีหลัง)

**Lane A1** (ฟีเจอร์ 2/4) · owner A · เป้า **R** (ส่วน takeover อยู่ใน gate ขั้น 5) · พึ่ง F09, F03 · **ให้:** `isHumanTakeover(conversationId)` `assignConversation(conversationId, userId | null)` · **ใช้:** core `getBusiness/requirePermission`, `db`, `publish`, `audit`, `jobs` (cron idle) · C3 `notify()` · F09 service · web path `/team` + panel ใน `/chat` ผ่าน slot `chatSidePanels`
## Papi files to read (ใต้ `../papi-ref`)
1. `Database/conversation.sql` — คอมเมนต์ "OWNERSHIP IS ADVISORY" และตาราง status × owner
2. `Backend/functions/ChangeConversationStatus/src/index.mjs` — takeover/คืน bot/ปิด, 409 `conversation_taken`, `force`, `keep_owner`, คืนเข้าคิว, ขอความช่วยเหลือ
3. `Backend/layers/nodejs-utils/nodejs/conversation-assignment.mjs` — claim, owner ที่ active เท่านั้น, ชื่อที่ทีมเห็น
4. `Backend/functions/WebsocketSendMessage/README.md` — staff ส่ง = takeover ก่อนรอ lock
5. `Backend/functions/ConversationNotes/src/index.mjs` + `layers/nodejs-utils/nodejs/conversation-notes.mjs`, `conversation-mentions.mjs` · `Database/conversationnotes.sql`
6. `Backend/functions/ChatTeamOperations/README.md` + `layers/nodejs-utils/nodejs/chat-schedule.mjs`, `chat-team-operations.mjs` · `Database/chatteamoperations.sql`
7. `Backend/functions/TimeoutCloseConversation/src/index.mjs` (ค่า timeout) · `Backend/functions/ChatIdleReassignment/src/index.mjs`
8. `Backend/layers/nodejs-utils/nodejs/permissions.mjs` (กลุ่ม `chat.*`) · `conversation-auto-assign.mjs` (if time)
9. FE: `Frontend/src/components/messenger/ChatAiCard.tsx`, `ChatWorkflowAction.tsx`, `pages/messager/messenger/ConversationNoteDialog.tsx`, `AskAssistanceDialog.tsx`, `components/member/ChatScheduleEditor.tsx`, `ChatTeamOperationsPanel.tsx`
10. tests: `Frontend/src/components/messenger/ChatWindow.readOnly.test.tsx`, `components/member/ChatTeamOperationsPanel.test.tsx`
## Behaviors to keep (ตรวจจากโค้ดที่ 6959a92f)
- สถานะเป็นคู่ (status, owner): Papi `active+NULL` = bot ตอบ · `escalated+NULL` = รอคนรับ (AI ขอคน = คิว ไม่ใช่ takeover) · `escalated+user` = คนนั้นดูแล · map เป็น contract: escalated → `handler:'human'`
- takeover แข่งกัน: ถ้าคนอื่นถืออยู่ได้ **409** พร้อมบอกว่าใครถือ แล้ว UI ให้กด "รับช่วงต่อ" ซ้ำได้ (Papi `force`) · contract ใช้ `expectedVersion` เก่า → `VERSION_CONFLICT` · คืน bot และปิดแชทไม่เคยติด 409 (แชทที่ถูกทิ้งต้องปิดได้เสมอ)
- คืน bot = ล้าง owner · คืนเข้าคิว = ยังเป็น human แต่ไม่มีคนรับ · "ขอให้เพื่อนช่วย" แจ้งทุกคนอื่นแต่ไม่เปลี่ยน status/owner · ทุกการรับ/คืนเขียน audit note ชนิด `handover`
- note เป็นภายในเท่านั้น: ไม่เขียน messages ไม่เข้า sender · pinned note ระดับลูกค้า (ไม่ผูก conversation) ตามไปทุกแชทของลูกค้านั้น · audit note (`handover`/`assistance`) แก้/ลบไม่ได้ · route แก้ note ต้องมี conversation id ใน path และ note ต้องเป็นของ business เดียวกัน · `@mention` → `notify()`
- availability ต่อ business: `available`/`away`/`off_shift` · weekly schedule เวลา Asia/Bangkok (ISO weekday 1–7, breaks) คำนวณตอนอ่าน ไม่มี cron พลิกค่า · เลือกเองแล้ว schedule หยุดชั่วคราว · คนจัดทีม = มี `chat.schedule`
- idle policy `off`/`alert`/`reassign` · `idle_minutes` 5–1440 ค่าเริ่ม off/30 · worker ทุก 1 นาที · 1 event ต่อการรอหนึ่งรอบ (key = conversation + เวลาเริ่มรอ) · ไม่มีคนว่างรับ → คงผู้ดูแลเดิมแล้วแจ้งเจ้าของร้าน
- transfer: preview หมดอายุ 15 นาที สูงสุด 1,000 แชท เฉพาะแชทเปิด · execute ซ้ำได้ผลเดิม · ข้ามแชทที่เปลี่ยนหลัง preview
- timeout ปิดแชท (ค่าเริ่ม Papi): active 24 ชม. · รอคนรับ 48 ชม. · มีคนถือ 168 ชม. · สิทธิ์: takeover = `chat.takeover`, ส่ง = `chat.reply`, จัดทีม/โอน = `chat.schedule`
## เปลี่ยนถึง 71ee7659 (Papi 19 พ.ย.)

brief นี้เขียนจากโค้ดที่ `6959a92f` ส่วนนี้คือพฤติกรรมที่ Papi เพิ่มหรือเปลี่ยนหลังจากนั้น ถ้าทำส่วนที่เกี่ยวข้องให้ port ตามโค้ดใน `../papi-ref` (ตอนนี้เป็น `71ee7659`) **Done when และ tier ไม่เปลี่ยน**

- reassign ได้แม้ปิด auto-assign (`cb39d227`)
- แชตจากคอมเมนต์ถูก assign เข้าทีม (`1b662eac`)

## Drop / replace
- InsightQueue ตอนปิด → `jobs.enqueue` ของ F26 ถ้าพร้อม · WebsocketPush/DispatchWebPush → `publish()` + `notify()` · EventBridge (idle 1 นาที, timeout 1 ชม.) → cron ของ F35
- OUT: `ai_force_on` (F10 brief ประกาศ OUT), `chat.view_all` scoping, โอนแชตเป็นชุด (preview) · auto-assign round-robin **อยู่ใน spec F11 แล้ว** (ปิดเป็นค่าเริ่มต้น) · `requestHumanHandoff` อยู่ใน spec F11 §4 · escalation detection เป็นงาน F10
- (ทำใน spec F11 แล้ว) B2 ขอฟังก์ชันตั้ง "รอคนรับ" จาก AI (handler human, ไม่มี assignee) → เพิ่ม export ใน `service.ts` เช่น `requestHumanHandoff(conversationId, { reason })` แล้วโพสต์ `DONE CHANGE`
## Tables
- เขียนคอลัมน์ handler/assignee/version ของ `conversations` (core) ผ่าน `assignConversation()` เท่านั้น
- ของ F11: `conversation_notes` · `team_availability` (business, user, manual status, schedule jsonb, paused) · `team_settings` (idle policy) · `team_idle_events` · `team_transfer_previews`
## Done when
- [ ] takeover → `isHumanTakeover()` true → ai.reply ข้ามด้วย `takeover` · คืน AI แล้วข้อความถัดไปได้คำตอบ (gate ขั้น 5)
- [ ] staff ส่งได้เฉพาะเมื่อมี `chat.reply` · ไม่มีสิทธิ์ได้ 403 แม้ UI ซ่อนปุ่ม · note ไม่เคยเรียก `sendToCustomer()`
- [ ] assignment ที่ stale ได้ 409 พร้อมชื่อคนถือ · ปิดแชทที่คนอื่นถือได้เสมอ
- [ ] schedule ด้วย clock fixture: ในเวลางาน = available, ช่วงพัก = away, นอกเวลา = off_shift (Asia/Bangkok)
## Status floor
**R** สำหรับ takeover / คืน AI / staff reply / notes · schedule, idle, transfer เป็น R หรือ S ตามที่ทันและจดใน EVIDENCE.md
