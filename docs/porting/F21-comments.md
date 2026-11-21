# F21 comments — ตอบคอมเมนต์เป็น DM (Comment-to-DM)

> **Build spec (ใช้ตัวนี้สร้าง):** [docs/specs/F21-comments.md](../specs/F21-comments.md) · หน้านี้คือ know-how เดิมจาก Papi · ส่วน "Papi files to read" ใช้ได้เฉพาะเมื่อหัวหน้าโพสต์ `LEAD: PAPI-REF OPEN` ([D1](../DECISIONS-2026-11-20.md))

> **Tier P2** · เริ่มเขียนโค้ดเมื่อหัวหน้าโพสต์ `LEAD: OPEN P2` เท่านั้น · [tier และงบ](../../PLAN.md#tier-core-ก่อน-ส่วนเสริมทีหลัง)

**Lane C2** (ฟีเจอร์ 3/3 ต่อจาก F18) · owner C · เป้า **S** (R เมื่อ Meta test page ส่ง private reply จริง) · พึ่ง F18, F35 · **ให้:** ไม่มี contract ข้ามคน · **ใช้:** core `jobs` (worker + reconciler cron), `saveMessage` ของ F09, `requirePermission` · F22 `findProductCodes()` (A2: ไม่ใช่ contract ถ้ายังไม่มีโพสต์ `NEED TO:A2`) · A1 `renderTemplate()` (ถ้าใช้) · event คอมเมนต์ + การส่ง private reply ของ F18 (lane เดียวกัน: export ใน `service.ts` เช่น `onCommentEvent` / `sendCommentReply` ไม่ต้องโพสต์ `CHANGE`) · web path `/comment-replies`
## Papi files to read (ใต้ `../papi-ref`)
1. `Backend/functions/CommentReplyWorker/README.md` — แผนภาพ flow, "Rules that are deliberate", "Unconfirmed sends", "Meta limits"
2. `Backend/functions/MessengerWebhook/COMMENT-TO-DM.md` + `Backend/functions/InstagramWebhook/COMMENT-TO-DM.md`
3. `Backend/layers/nodejs-utils/nodejs/comment-reply.mjs` — normalize, match rule, claim row ก่อนส่ง, บันทึกเป็นข้อความ bot
4. `Backend/functions/CommentReplyReconciler/src/index.mjs` — lease แถวค้าง ถาม Meta แล้วปิดเป็น sent/ส่งใหม่/failed
5. `Database/commentreply.sql` — `comment_reply_rules` (scope post/live), `facebook_comment_deliveries`, `instagram_comment_deliveries`, `comment_reply_templates`
6. `Backend/functions/CommentReplyRules/src/app.mjs` + `src/rules.mjs` — API หน้าตั้งค่า
7. `Backend/functions/TimeoutCloseConversation/src/index.mjs` (`COMMENT_REPLY_TIMEOUT_HOURS`) · `Backend/functions/Orchestrator/src/comment-cards.mjs` (if time)
8. FE: `Frontend/src/pages/CommentReplies.tsx`, `components/business/CommentReplySettings.tsx`, `CommentReplyTemplateMenu.tsx`, `functions/commentReplyContract.ts`
9. tests: `Frontend/src/components/messenger/ChatWindow.commentReply.test.tsx`, `components/business/CommentReplySettings.test.tsx`
## Behaviors to keep (ตรวจจากโค้ดที่ 6959a92f)
- 1 comment = private reply **ครั้งเดียว**: claim แถว delivery (unique ต่อ comment + ชนิด `dm`/`reply`) **ก่อน** เรียก provider · replay ของ event เดิมแค่ทำ bookkeeping ให้จบ ไม่ส่งซ้ำ
- provider ไม่ตอบใน 10 วินาที → `unknown` (ไม่ retry ใน worker) · claim ค้าง `sending` เกิน 10 นาทีถือเป็น unknown เหมือนกัน
- reconciler ทุก 5 นาที: lease ≤25 แถวที่รอเกิน 5 นาที → ถาม provider: มีแล้ว = `sent` · ไม่มี = ส่งใหม่ · ตอบไม่ได้ = รอ (public reply ไม่โพสต์ซ้ำเด็ดขาด) · ครบ 12 ครั้ง (~1 ชม.) หรือเกินหน้าต่าง 7 วัน → `failed` พร้อมเหตุผล
- rule แยกตามช่องทางและ scope `post`/`live` · คำปฏิเสธไม่ match เด็ดขาด (`ไม่สนใจ`, `ไม่เอา`, `ไม่ต้องการ`) · comment ที่มี product code นับเป็นความสนใจแม้ไม่มี keyword
- gate: business ไม่ active หรือ AI ปิด → ไม่ส่ง · IG: ลูกค้ามีแชทที่คนรับช่วงอยู่ → ไม่ส่ง · ไม่ billable (เป็นข้อความ template ไม่ใช่โมเดล)
- DM ถูกบันทึกเป็นข้อความ bot ในแชทของลูกค้า (เห็นใน inbox) · **composer ของ staff ล็อกจนลูกค้าตอบ** (provider อนุญาตข้อความเดียวต่อ comment)
- ข้อความ: `{{items}}` แทนด้วยรายการสินค้า + ราคาปัจจุบัน + ยอดรวม · ไม่มี `{{items}}` = ส่งตามที่เขียน · ไม่เกิน 2000 ตัว (DM) / 1000 (public) · ชวนสั่งเฉพาะเมื่อแชทปิดการขายได้จริง (ข้อมูลชำระพร้อม) ไม่งั้นบันทึก `orderable:false`
- แชทที่ข้อความล่าสุดยังเป็น comment reply เปิดค้างได้ 7 วัน · templates ต่อชนิด (`dm` 1–1000, `public_reply` 1–500) ≤20 รายการ ชื่อไม่ซ้ำ · สิทธิ์ตั้งค่า = `business.bot_settings`
## เปลี่ยนถึง 71ee7659 (Papi 19 พ.ย.)

brief นี้เขียนจากโค้ดที่ `6959a92f` ส่วนนี้คือพฤติกรรมที่ Papi เพิ่มหรือเปลี่ยนหลังจากนั้น ถ้าทำส่วนที่เกี่ยวข้องให้ port ตามโค้ดใน `../papi-ref` (ตอนนี้เป็น `71ee7659`) **Done when และ tier ไม่เปลี่ยน**

- คอมเมนต์ตอบอัตโนมัติได้แม้ปิด AI (`473dbe8e`)
- ชื่อ contact จากคอมเมนต์แทน id (AB#2664)
- bug sweep การอ่าน/ส่ง/reconcile คอมเมนต์ live และตอบแบบคนขาย (AB#2690)

## Drop / replace
- Meta webhook + SQS `CommentReplyQueue` + Lambda worker → event จาก F18 (export ภายใน lane C2) → `jobs.enqueue('comments.reply', { … }, { dedupKey: comment:<commentId> })`
- Graph API calls ของ reconciler → ผ่าน sender/adapter ของ F18 · ระหว่างไม่มี Meta ใช้ fixture event + sandbox sender ที่ติดป้าย
- CloudWatch metric/alarm → แบนเนอร์ "กำลังตรวจกับ provider" + จำนวน unknown ในหน้า `/comment-replies` · OUT: `CommentLivePoller`, ตรวจว่า comment มาจากไลฟ์ย้อนหลัง (VOD), pilot env JSON
## Tables
- ของ F21: `comment_reply_rules` (business, channel account, scope, keywords, dm_text, public_text, enabled) · `comment_deliveries` (business, channel, comment_id, kind, state `claimed/sending/sent/unknown/failed`, attempts, error_code, conversation_id, message_id) unique (channel, comment_id, kind) · `comment_reply_templates`
- ลูกค้า/แชท/ข้อความ ผ่าน F09 service · product codes ผ่าน F22 service
## Done when
- [ ] comment ที่ match ได้ private reply 1 ครั้ง · event เดิมเข้า 2 ครั้ง → ยังส่ง 1 ครั้ง · comment ไม่ match หรือมีคำปฏิเสธ → ไม่ส่ง
- [ ] sender ตอบ timeout → `unknown` ไม่ retry เอง · reconciler (fixture "มีแล้ว"/"ไม่มี") ปิดเป็น sent หรือส่งใหม่ถูก
- [ ] staff ส่งข้อความในแชทนั้นก่อนลูกค้าตอบ → ปฏิเสธพร้อมเหตุผล · ลูกค้าตอบแล้ว composer ปลดล็อก
- [ ] business ไม่ active หรือ AI ปิด → ไม่มีการส่ง และหน้าตั้งค่าแสดงสถานะ unknown/failed ตามจริง
## Status floor
**S** ด้วย fixture event + sandbox sender ที่ติดป้าย · **A** ถ้า F18 ยังไม่ส่ง event คอมเมนต์ · R เฉพาะเมื่อมีหลักฐาน private reply ถึงบัญชีทดสอบของ Meta
