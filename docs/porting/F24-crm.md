# F24 crm — ข้อมูลลูกค้า tags และ tag อัตโนมัติ
> **Build spec (ใช้ตัวนี้สร้าง):** [docs/specs/F24-crm.md](../specs/F24-crm.md) · หน้านี้คือ know-how เดิมจาก Papi · ส่วน "Papi files to read" ใช้ได้เฉพาะเมื่อหัวหน้าโพสต์ `LEAD: PAPI-REF OPEN` ([D1](../DECISIONS-2026-11-20.md))

> **Tier P1** · เริ่มเขียนโค้ดเมื่อหัวหน้าโพสต์ `LEAD: OPEN P1` เท่านั้น · [tier และงบ](../../PLAN.md#tier-core-ก่อน-ส่วนเสริมทีหลัง)

**Lane A3** (ฟีเจอร์ 1/3) · owner A · เป้า **R** · พึ่ง F09 · **ให้:** `getCustomer(businessId, customerId)` `listCustomersByTags(businessId, tagIds, opts)` · **ใช้:** F09 service (ตัวตนลูกค้า, ข้อความล่าสุด: ถ้าไม่มี read function ที่ต้องการ โพสต์ `CHANGE TO:A1` ห้าม query ตาราง core ตรง) · core `jobs` (cron), `requirePermission`, `model.chat({ model: 'chat' })` + strict schema (if time, [docs/openai-api.md](../openai-api.md)) · web path `/customers` + panel ลูกค้าในแชท (slot `chatSidePanels`)
## Papi files to read (ใต้ `../papi-ref`)
1. `Database/customertags.sql` (ชื่อ ≤32, description บังคับ, ≤20 tag, ชนิด custom/default, `inactive_customer`) · `customertagassignments.sql` (source `manual`/`insight`/`automation`)
2. `Backend/functions/CustomerTags/src/index.mjs` — CRUD tag + สิทธิ์ดูรายชื่อลูกค้า
3. `Backend/functions/CustomerTagAssignments/src/index.mjs` — ติด/ถอด tag
4. `Backend/functions/CustomerTagAutomation/README.md` + `src/automation.mjs` (SQL ข้อความล่าสุด ตัด `web`) + `Backend/layers/nodejs-utils/nodejs/customer-tag-automation.mjs`
5. `Backend/functions/InsightExtraction/src/tagging.mjs` (prompt: ต้องมีหลักฐานตรง, ห้ามเดา trait อ่อนไหว) · `src/customer-profile.mjs`
6. `Database/customercontactdetails.sql`, `customerinsightprofiles.sql`, `customerorigins.sql` (คอมเมนต์หัวไฟล์)
7. `Backend/layers/nodejs-utils/nodejs/broadcast-http.mjs` — gate ของ route tag
8. FE: `Frontend/src/pages/Customers.tsx`, `pages/messager/customerInfo/CustomerInfoPane.tsx`, `components/messenger/CustomerTagsField.tsx`, `CustomerContactDetails.tsx`, `CustomerStageChip.tsx`, `functions/customerTags.ts`, `customerStage.ts`
9. tests: `Frontend/src/components/messenger/CustomerTagsField.readOnly.test.tsx`, `CustomerContactDetails.test.tsx`
## Behaviors to keep (ตรวจจากโค้ดที่ 6959a92f)
- tag เป็นของ business: ลูกค้าคนเดียวทักหลายร้านได้ จึงต้องมี business_id ในทุก assignment (กันร้านหนึ่งเห็น label ของอีกร้าน)
- ชื่อ tag 1–32 ตัว ไม่ซ้ำแบบไม่สนตัวพิมพ์และช่องว่างซ้อน · description 1–1000 ตัว (บังคับ เพราะ AI ใช้ตัดสินว่าจะติด tag) · สูงสุด 20 tag ต่อ business
- assignment มี source: `manual` (staff) · `insight` (โมเดล) · `automation` (กฎ) · PK (business, ลูกค้า, tag) จึงไม่ซ้ำ
- automation `inactive_customer`: days 1–3650 · รันวันละครั้ง 00:00 Bangkok · ใช้ข้อความลูกค้าขาเข้าล่าสุดที่ไม่ใช่ `web` · ลูกค้ากลับมาทัก → ถอดเฉพาะ assignment ที่ automation ติด · **ไม่เคยถอด manual หรือ insight** · ปิดกฎแล้วไม่ทำอะไร
- tag จากโมเดล: ต้องมีหลักฐานตรงในบทสนทนา ห้ามเดา trait อ่อนไหว หลักฐานกำกวม = ไม่ติด · ถอดได้เฉพาะ tag ที่ insight ติดและมีหลักฐานว่าไม่ตรงแล้ว
- สิทธิ์: ดูรายชื่อลูกค้า = มี `chat.read` หรือ `broadcast.read` หรือ `insights.read` อย่างใดอย่างหนึ่ง · สร้าง/แก้ tag = `broadcast.tags` · ติด/ถอด = `chat.reply` (ดู = `chat.read`) · ไม่มี plan gate (ใช้ได้ไม่จำกัด)
- contact details ต่อ (business, ลูกค้า) เก็บค่าปัจจุบันเท่านั้น ข้อความแชทเป็นหลักฐาน · insight profile ห้ามมี trait อ่อนไหว
- ป้ายลูกค้า 3 ระดับ: `first_chat` / `returning` / `before_papi` (null = ยังบอกไม่ได้) · ระบบใหม่ใช้ `before_nless` หรือซ่อนถ้าไม่มีข้อมูลก่อนเชื่อมช่องทาง
## เปลี่ยนถึง 71ee7659 (Papi 19 พ.ย.)

brief นี้เขียนจากโค้ดที่ `6959a92f` ส่วนนี้คือพฤติกรรมที่ Papi เพิ่มหรือเปลี่ยนหลังจากนั้น ถ้าทำส่วนที่เกี่ยวข้องให้ port ตามโค้ดใน `../papi-ref` (ตอนนี้เป็น `71ee7659`) **Done when และ tier ไม่เปลี่ยน**

- สร้าง tag ใหม่จากแชตได้ ไม่ทับ tag ที่เพื่อนเพิ่งเพิ่ม (`cb39d227`)

## Drop / replace
- EventBridge cron `cron(0 17 * * ? *)` → cron ของ F35 (`crm.inactivity`, dedupKey ต่อวัน Bangkok) · InsightExtraction SQS → job ของ F26 เรียก export ของ F24 เพื่อติด tag แบบ `inferred` (if time)
- `end_users` (global) → `customers` ของ core ที่ผูก business แล้ว · Meta Conversations API สำหรับ customer origin → OUT
## Tables
- ของ F24: `customer_tags` · `customer_tag_assignments` (source `manual`/`automation`/`inferred`, assigned_by, assigned_at) · `customer_profiles` (contact phone/email/address, note) · `customer_consents` (marketing `granted`/`revoked`/`unknown`, source, actor, at)
- ตัวตนลูกค้าอยู่ใน `customers` ของ core (เขียนโดย F09 `saveMessage()`) · ตารางของ F24 อ้าง customer id
## Done when
- [ ] profile แก้แล้ว refresh เห็นค่าใหม่ · ลูกค้าของ business B ผ่าน API ของ A → 404 (ไม่ใช่ข้อมูล)
- [ ] automation ไม่ถอด manual tag: ติด `VIP` แบบ manual แล้วรันกฎ → ยังอยู่
- [ ] inactivity ด้วย clock fixture: days=30, ทักล่าสุด 31 วันก่อน → ติด tag · ทักใหม่ → automation tag ถูกถอด
- [ ] tag ที่โมเดลเดาแสดงเป็น "inferred" ไม่ใช่ fact · `listCustomersByTags(…, { requireConsent: 'granted' })` ตัด A Customer Two (revoked)
## Status floor
**R** (ไม่มี provider ภายนอก) · ส่วน insight tagging เป็น A/U ได้ถ้า F26 ยังไม่มา ให้จดใน EVIDENCE.md
