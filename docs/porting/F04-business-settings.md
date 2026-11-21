# F04 business-settings — การตั้งค่าธุรกิจ

> **Build spec (ใช้ตัวนี้สร้าง):** [docs/specs/F04-business-settings.md](../specs/F04-business-settings.md) · หน้านี้คือ know-how เดิมจาก Papi · ส่วน "Papi files to read" ใช้ได้เฉพาะเมื่อหัวหน้าโพสต์ `LEAD: PAPI-REF OPEN` ([D1](../DECISIONS-2026-11-20.md))

> **Tier P0** · core loop · เริ่มเขียนโค้ดหลัง `SETUP READY` · [tier และงบ](../../PLAN.md#tier-core-ก่อน-ส่วนเสริมทีหลัง)

- **Lane** C3 ลำดับ 1/4 (merge ก่อน 11:45 แล้วต่อด้วย F03) · **คน** C · **พึ่ง** F03 (ใช้ base schema + fake ได้) · **เป้า** R (golden path) · path ของ Papi อยู่ใต้ `../papi-ref/`
- **ให้** `getBusinessSettings(businessId)` → `BusinessSettings { businessId, aiEnabled, timezone, hours, answerPolicy, language, version }` (ไม่เคยเป็น null; business ที่ไม่มีอยู่ = `NOT_FOUND`) · **ใช้** `getBusiness()` + `requirePermission()` (`business.update`, `business.bot_settings`), `db`, `audit()`, `publish()`

## Papi files to read (in order)
1. `Backend/functions/ChangeBusinessAiStatus/src/index.mjs` (สวิตช์ AI, `ai_new_friends_only`, `auto_assign_enabled`)
2. `Backend/functions/UpdateCustomConfiguration/README.md` + `src/configuration-validation.mjs` + `src/handler.mjs`
3. `Backend/functions/Orchestrator/src/policy.mjs` (capability ∩ policy, deny ชนะ, null = อนุญาตทั้งหมด)
4. `Backend/functions/Orchestrator/src/inbound-publication-policy.mjs` (เงื่อนไขที่ bot ตอบได้)
5. `Backend/layers/nodejs-utils/nodejs/business-hours.mjs` + `Backend/functions/Orchestrator/src/business-hours.mjs`
6. `Database/customconfiguration.sql`, `Database/businesses.sql`
7. `Backend/functions/GetCustomConfiguration`, `GetAccountInfo`, `UpdateAccountInfo` + `Backend/layers/nodejs-utils/nodejs/business-contacts.mjs`; ถ้าทัน: `Backend/layers/nodejs-utils/nodejs/merchant-capabilities/schema.mjs`, `store.mjs`
8. หน้า: `Frontend/src/pages/Demo.tsx`, `DemoChatSettings.tsx`, `pages/demoChatSettings/*` (/chat/setting), `businessdetail_pages/BusinessAbout.tsx`, `BusinessDetail.tsx` (host ของ tabs), `messager/chatList/BusinessAiCard.tsx`, `components/business/BusinessHoursEditor.tsx`

## Behaviors to keep
- Papi: bot ตอบเมื่อ business `active` และ (`ai_enable` หรือ `ai_force_on` ของบทสนทนา) และบทสนทนา active → `aiEnabled` ต้องเป็น false เมื่อ business ไม่ active; ข้อความเข้ายังบันทึกเสมอ (gate อยู่ใน handler `ai.reply`)
- Papi ยอมให้ช่องทาง `web` (Demo Chat) ตอบได้แม้ปิด AI ซึ่งขัดกับ gate ขั้น 5 ถ้าทดสอบบน Demo Chat: brief ของ F10 และ F09 ตัดสินแล้วว่าระบบใหม่ **ไม่ยกเว้น** `web` (`aiEnabled=false` = bot เงียบทุกช่องทาง) ถ้าหัวหน้าทีมเปลี่ยนใจ ต้องแก้ทั้งสาม brief และ gate ขั้น 5 พร้อมกัน
- ปิด AI เฉพาะจังหวะ on → off ล้าง `ai_force_on` ทุกบทสนทนาและคืนรายการที่ล้าง; "off" ซ้ำจากหน้าเว็บเก่าไม่ล้างซ้ำ; เปิด / ปิดไม่เขียนสถานะบทสนทนา (`conversations` เป็นตาราง core ให้ขอ function จาก A1 ผ่าน `CHANGE`)
- สิทธิ์: สวิตช์ AI + bot settings ใช้ `business.bot_settings`; profile / hours ใช้ `business.update` (ทั้งคู่ off สำหรับ staff)
- PATCH: field ที่ไม่ส่ง = คงค่าเดิม, `null` = ล้าง, object = normalize; เก็บเฉพาะค่าที่จำกัดสิทธิ์ (เปิดทุกอย่าง = null); ทุก save bump `version`
- answer policy: Papi `price` / `stock` / `contact` `{ reveal: true | false }` = `'always' | 'never'` ของ `AnswerPolicy` (`'ask_staff'` ไม่มีใน Papi เป็นค่าใหม่), `general_knowledge` = `generalKnowledge`, `booking.enabled` ตรงกัน; รูปผิดได้ `VALIDATION_ERROR` พร้อมรายการ (backlog เขียน 422 ส่วน contract map เป็น 400 ให้ยึด contract); `disclaimer`, `food_safety.allergy_notice`, `conversation_state` ของ Papi ไม่อยู่ใน contract: ไม่ทำ หรือเพิ่มเป็น optional field แล้วโพสต์ `DONE CHANGE`
- บั๊กของ Papi ห้าม port: validator เก็บแค่ key ที่รู้จักและทิ้ง `booking` ทุกครั้งที่ save หน้า bot settings ทำให้ booking policy หาย validator ใหม่ต้องเก็บ `booking.enabled`
- persona / tone: tone `warm`/`neutral`/`direct`/`playful`, formality `formal`/`standard`/`casual`, verbosity `brief`/`normal`/`detailed`, gender เริ่มที่ `female`; persona ≤ 10,000 ตัว (Papi ให้ platform staff ขยายได้ ระบบใหม่ไม่มีหน้า admin จึงคงเพดานนี้); ภาษาเหลือ `th` / `en` (Papi มี `ch`)
- hours: timezone `Asia/Bangkok`; `WeeklyHours` ทุกวันว่าง = ปิดทุกวัน ไม่ย้อนไปใช้ข้อความใน knowledge; closed dates มี from/to, ห้ามซ้ำ, ปลายต้องไม่ก่อนต้น, reason จำกัดความยาว; ข้อมูลผิดต้องไม่กลายเป็นตารางเวลาเดิม
- `ai_new_friends_only`: ลูกค้าที่รู้จักร้านก่อนเชื่อมช่องทางเริ่มเป็น human-handled; มีผลกับบทสนทนาใหม่เท่านั้น

## เปลี่ยนถึง 71ee7659 (Papi 19 พ.ย.)

brief นี้เขียนจากโค้ดที่ `6959a92f` ส่วนนี้คือพฤติกรรมที่ Papi เพิ่มหรือเปลี่ยนหลังจากนั้น ถ้าทำส่วนที่เกี่ยวข้องให้ port ตามโค้ดใน `../papi-ref` (ตอนนี้เป็น `71ee7659`) **Done when และ tier ไม่เปลี่ยน**

- หน้า Delivery ยาวในหน้าร้านและ business capabilities editor ถูกเอาออกจาก UI ย้ายไป Orders → Settings (ดู F13) (`7d819206`)

## Drop / replace
- Lambda ต่อ route → `routes.ts`; Google Maps geocoding (map pin) → ไม่ทำ (ไม่มี provider แทน) · sticker pack lookup ผ่าน model → ไม่ทำหรือ A; ตาราง capability versions / activation / audit → คำนวณ facet ∩ policy ตอนอ่าน (store แยก = A)

## Tables
- เป็นเจ้าของ: `business_settings` (ai_enabled, ai_new_friends_only, persona, tone, formality, verbosity, gender, answer_policy jsonb, reply_format jsonb, version), `business_hours`, `business_closures` เพราะ `businesses` ของ core ไม่มีคอลัมน์ AI และห้าม ALTER
- `businesses.timezone` / `language` อยู่ใน core: F04 เป็นผู้เขียนค่าเหล่านี้คนเดียว (UPDATE ค่า ไม่ ALTER; ถ้า C1 ไม่ยอมให้เขียน ให้เก็บใน `business_settings` แล้วโพสต์ `CHANGE TO:C1`)

## Done when
- save → reload ค่ายังอยู่; บทสนทนาใหม่ใช้ค่าที่บันทึก; ปิด AI แล้วข้อความเข้ายังบันทึกแต่ bot ไม่ตอบ; staff ที่ไม่มีสิทธิ์แก้ได้ `PERMISSION_DENIED`
- policy ผิดรูปถูกปฏิเสธ; save policy เฉพาะ `price` แล้ว `booking` ที่มีอยู่ไม่หาย; ปิด AI แล้วบทสนทนาที่ staff เปิด AI ไว้เงียบด้วย; เวลาแสดงเป็น Asia/Bangkok

## Status floor
R
