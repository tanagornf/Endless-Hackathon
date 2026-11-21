# F12 message-templates — Rich messages, template, แปลภาษา และ AI ช่วยร่าง

> **Build spec (ใช้ตัวนี้สร้าง):** [docs/specs/F12-message-templates.md](../specs/F12-message-templates.md) · หน้านี้คือ know-how เดิมจาก Papi · ส่วน "Papi files to read" ใช้ได้เฉพาะเมื่อหัวหน้าโพสต์ `LEAD: PAPI-REF OPEN` ([D1](../DECISIONS-2026-11-20.md))

> **Tier P2** · เริ่มเขียนโค้ดเมื่อหัวหน้าโพสต์ `LEAD: OPEN P2` เท่านั้น · [tier และงบ](../../PLAN.md#tier-core-ก่อน-ส่วนเสริมทีหลัง)

**Lane A1** (ฟีเจอร์ 3/4) · owner A · เป้า **S** (R เมื่อส่งผ่านช่องทางจริง) · พึ่ง F09, F35 · **ให้:** `renderTemplate(templateId, vars) → MessagePart[]` · **ใช้:** core `storage`, `model.chat({ model: 'fast' })` (แปล, featureId F12), `model.moderate()` (ข้อความ/รูปของ template ที่ร้านอัปโหลด เป็นสัญญาณเตือน), `sendToCustomer`, `requirePermission` · B2 `generateReply(id, { mode: 'suggest' })` · web path `/templates` + ปุ่มใน composer ผ่าน slot `chatComposerActions`
## Papi files to read (ใต้ `../papi-ref`)
1. `Backend/functions/MessageTemplates/README.md` — กติกาทั้งหมด: route, ขีดจำกัด, ไฟล์, sequence
2. `Backend/layers/nodejs-utils/nodejs/message-templates.mjs` (validator ใช้ทั้ง save และ send) + `template-file-references.mjs` (ไฟล์ต้องเป็นของ business)
3. `Database/messagetemplates.sql` — คอมเมนต์ "sent message keeps its own copy"
4. `Backend/functions/WebsocketSendMessage/src/template-message.mjs` (ส่ง template) · `src/reply-draft.mjs` (ส่งจาก draft)
5. `Backend/functions/TranslateMessage/src/index.mjs` — header อธิบายเหตุผลทุกข้อ
6. `Backend/functions/SuggestChatReply/src/index.mjs` — header: ใครขอได้, draft ไม่ส่ง, seal
7. `Backend/functions/GetChatAttachmentUploadUrl/src/index.mjs` — staff แนบไฟล์ต้องเป็นแชทของ business นั้น
8. FE: `Frontend/src/pages/Templates.tsx`, `pages/templates_pages/TemplateDetail.tsx`, `templateEditorState.ts`, `CarouselEditor.tsx`, `FileBlockEditor.tsx`, `components/messenger/TemplatePicker.tsx`, `TemplateSequenceEditor.tsx`, `AiReplyDraft.tsx`
9. `Frontend/src/functions/messageTemplates.ts`, `templateOrder.ts`, `messageTranslation.ts`, `replySuggestion.ts`, `locales/th/templates.json`
10. tests: `Frontend/src/components/messenger/ChatWindow.templates.test.tsx`, `TemplateSequenceEditor.test.tsx`, `ChatWindow.translate.test.tsx`
## Behaviors to keep (ตรวจจากโค้ดที่ 6959a92f)
- สิทธิ์: ดูรายการ = `chat.read` · สร้าง/แก้/ลบ/ส่ง = `chat.reply` · platform admin ใช้หน้านี้ไม่ได้
- template: `name` 1–80, `alt_text` 1–400 (ข้อความแทนการ์ด), sequence 1–5 blocks เรียงตามที่บันทึก: `text` (1–2000 ตัว), `image`, `file`, `cards` (1–10 การ์ด · title 1–80 · subtitle ≤80 · ปุ่ม 0–3 ชนิด url หรือ message · label 1–20 · url ต้อง HTTPS ≤2000 ไม่มี user:pass · message 1–300 · การ์ดต้องมี subtitle รูป หรือปุ่มอย่างน้อยหนึ่ง)
- validator ตัวเดียวใช้ตอน save และก่อนส่ง · ไฟล์/รูปต้องอัปโหลดและตรวจแล้วโดย business นั้น ถ้าไม่ผ่าน fail ทั้ง request ก่อน save หรือ enqueue · ไฟล์ ≤10 MiB ตามรายการนามสกุล (pdf, office, txt/csv/md/json/rtf, รูป, zip, mp3/wav, mp4/mov) ตรวจ MIME/ขนาด/signature · ชื่อไฟล์ ≤80
- ข้อความที่ส่งแล้วเก็บ snapshot ของตัวเอง: แก้/ลบ template ไม่เปลี่ยนประวัติ · ลบ template ไม่ลบไฟล์ที่ส่งไปแล้ว · ลบรูปที่ template ใช้อยู่ → 409
- ลำดับ template ใน picker ของ Papi เก็บใน localStorage ต่อ browser · ระบบใหม่เก็บ `sort_order` ใน DB ได้ (SPEC: saved/reordered)
- แปล: ส่ง text ≤2000 + ภาษา `th`/`en` · ต้องมี `chat.read` · ไม่ cache ไม่แก้ต้นฉบับ ไม่แตะ conversation
- AI ช่วยร่าง: ใช้ได้เฉพาะแชทที่ bot ไม่ได้ตอบ (AI off หรือ takeover) · ต้องมี `chat.reply` · คืน draft ไม่ส่ง ไม่เก็บ ไม่มีโควตา (core บันทึก usage ตามปกติ) · 1 request ต่อแชทพร้อมกัน · staff แก้แล้วส่งเองเป็นข้อความ staff ปกติ
- contract: `{{name}}` ที่ไม่มีค่า → ค่าว่าง · ค่าเป็น plain text ไม่ใช่ HTML · template ของ business อื่นหรือไม่พบ → `NOT_FOUND`
## เปลี่ยนถึง 71ee7659 (Papi 19 พ.ย.)

brief นี้เขียนจากโค้ดที่ `6959a92f` ส่วนนี้คือพฤติกรรมที่ Papi เพิ่มหรือเปลี่ยนหลังจากนั้น ถ้าทำส่วนที่เกี่ยวข้องให้ port ตามโค้ดใน `../papi-ref` (ตอนนี้เป็น `71ee7659`) **Done when และ tier ไม่เปลี่ยน**

- template ส่วนตัว (`owner_user_id`) คู่กับ template กลาง เขียน template กลางต้องมี `chat.templates` (`8ddd7b7c`)

## Drop / replace
- S3 presign + verify + ETag + public bucket → `storage.save({ allowedMime, … })` แล้วใช้ `fileId` ใน `ImagePart`/`FilePart`
- LINE Flex / Meta generic card และไอคอนชนิดไฟล์ → sender ของ C2 แปลง `MessagePart` เอง · การ์ดของ template → `ActionButtonsPart` (+ `ImagePart`) ปุ่ม url → `link`, ปุ่ม message → `postback` ถ้า shape ไม่พอโพสต์ `CHANGE TO:C1`
- OpenRouter (แปล) → `model.chat({ model: 'fast' })` ของ core (OpenAI อย่างเดียว [docs/openai-api.md](../openai-api.md)) · Orchestrator `suggest_reply` mode + HMAC seal → `generateReply(id, { mode: 'suggest' })` แล้วตรวจ `fileId`/ownership ตอนส่งแทน seal · OUT: malware scan, image crop
## Tables
- ของ F12: `message_templates` (id, business_id, name, alt_text, blocks jsonb, sort_order, version, timestamps) · ไฟล์อยู่ในตาราง `files` ของ core
- อ่าน/เขียน messages ผ่าน F09 `saveMessage()` / core `sendToCustomer()` เท่านั้น
## Done when
- [ ] template save → reload ได้ blocks ลำดับเดิม · reorder บันทึกได้
- [ ] `fileId` ของ business อื่นหรือไฟล์ที่ไม่ได้อัปโหลด → ปฏิเสธ · URL `http://` หรือมี credential → 400 · ไม่มีการ render HTML
- [ ] แปลแล้ว messages ในฐานข้อมูลไม่เปลี่ยน · ร่าง AI ไม่สร้างแถวใน messages และไม่เรียก `sendToCustomer()`
- [ ] ส่ง template แล้ว delivery เป็น `pending` จนมีผลจาก sender (ไม่ขึ้น sent เอง) · `renderTemplate()` ข้าม tenant → `NOT_FOUND`
## Status floor
**S** ตาม FEATURE_STATUS: CRUD/render/แปล/ร่าง ทำงานจริงบน Demo Chat (`web`) · ช่องทาง LINE/Meta เป็น S จน sender ของ F17/F18 ส่งถึงบัญชีทดสอบจริง แล้วจึงเป็น R
