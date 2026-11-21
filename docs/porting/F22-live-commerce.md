# F22 live-commerce — รหัสสินค้าไลฟ์ ตะกร้าไลฟ์ และหน้าจอนำเสนอ

> **Build spec (ใช้ตัวนี้สร้าง):** [docs/specs/F22-live-commerce.md](../specs/F22-live-commerce.md) · หน้านี้คือ know-how เดิมจาก Papi · ส่วน "Papi files to read" ใช้ได้เฉพาะเมื่อหัวหน้าโพสต์ `LEAD: PAPI-REF OPEN` ([D1](../DECISIONS-2026-11-20.md))

> **Tier P1** · เริ่มเขียนโค้ดเมื่อหัวหน้าโพสต์ `LEAD: OPEN P1` เท่านั้น · [tier และงบ](../../PLAN.md#tier-core-ก่อน-ส่วนเสริมทีหลัง)

**Lane A2** (ฟีเจอร์ 3/3) · owner A · เป้า **S** (codes ภายใน = R, live ภายนอก = A/S) · พึ่ง F08, F13, F21 (C2, P2: ระหว่างรอใช้ code จากข้อความในแชท + fixture) · **ให้:** ไม่มี contract ข้ามคน · export ใน `service.ts` ให้ F21 (C2) และ B2 เช่น `findProductCodes(businessId, text)` (ข้ามคน ไม่ใช่ contract: ถ้า C2 หรือ B2 ต้องใช้ → โพสต์ `CHANGE` ก่อน) · **ใช้:** B1 `getProduct()` `getPrice()` · F13 `createOrderFromProposal()` · core `db`, `publish`, `requirePermission` · web paths `/product-codes`, `/live` (layout `bare`)
## Papi files to read (ใต้ `../papi-ref`)
1. `Backend/functions/CommentReplyRules/README.md` หัวข้อ Task 2600 (note, sold out, presentation) + `src/app.mjs` (header: routes, PUT รายการทั้งชุด, action `note`)
2. `Database/commentreply.sql` — `comment_product_codes` (รูปแบบ code, key ไม่สนตัวพิมพ์และเลข 0 นำหน้า, note ≤200, `assigned_at`) + `comment_product_code_generators`
3. `Backend/functions/CommentReplyWorker/README.md` หัวข้อ "Product codes link a comment…", "Live carts", "Generated product codes"
4. `Backend/layers/nodejs-utils/nodejs/live-cart.mjs` + `Database/livecarts.sql` — ตะกร้าต่อผู้ชมต่อไลฟ์
5. `Backend/functions/Orchestrator/src/product-codes.mjs` (header: กฎอ่าน code ในแชท) · `product-code-key.mjs` · `src/commerce/comment-order.mjs` (code + จำนวน → draft order)
6. `Backend/functions/CommentReplyRules/src/variant-details.mjs` — sold out ต่อ option
7. FE: `Frontend/src/components/business/CommentProductCodes.tsx`, `pages/ProductCodesPresentation.tsx`, `functions/productCodeKey.ts`, `productCodeGenerator.ts`, `productCodeLines.ts`, `productCodePresentation.ts`
8. tests: `Frontend/src/components/business/CommentProductCodes.test.tsx`
## Behaviors to keep (ตรวจจากโค้ดที่ 6959a92f)
- code ยาว 1–20 ตัว: ตัวแรก A–Z/a–z/0–9/ก–ฮ ตัวถัดไปเพิ่ม `-` ได้ · 1 code ต่อ business ตาม key = ตัวพิมพ์ใหญ่ + ตัดเลข 0 นำหน้า (`AA02` = `AA2` = `aa002`)
- code ชี้ item + option ที่ขายอยู่ หรือชี้ทั้ง item (ลูกค้าเลือก option ในแชท) · สินค้าที่ถูกลบหรือ option ที่หายไป = code ไม่ชี้อะไร
- อ่าน code ในข้อความ: นับเฉพาะ code ที่บันทึกของ business นี้ · ต้องยืนเดี่ยว (ไม่อยู่กลางคำ `XA12`, `A12B`) · code ที่มีอักษรไทยต้องแยกจากข้อความไทย · จำนวน 1–99 พิมพ์หลัง code (`CF A12 2`, `a12x2`) · comment อ่านได้สูงสุด 3 code
- note ต่อ code บรรทัดเดียว ≤200 ตัว · บันทึกรายการทั้งชุดแล้ว code ที่ยังชี้บรรทัดเดิมคง note, `assigned_at`, ผู้สร้าง · แก้ note จากหน้า presentation = update เฉพาะแถวนั้นพร้อมเช็ค `assigned_at` ถ้า code ถูกย้ายหรือลบแล้ว → **409**
- ข้อจำกัดที่ Papi ยอมรับ: PUT รายการทั้งชุด last-write-wins → ระบบใหม่เพิ่ม `version` ต่อรายการแล้วตอบ 409 แทน (ตรง acceptance ของ backlog)
- sold out มาจาก option ที่ร้านปิดขาย: code ยังตอบได้แต่ไม่ชวนสั่ง · code ทั้ง item = sold out เมื่อทุก option หมด
- ตะกร้าไลฟ์: 1 ตะกร้า `open` ต่อ (ช่องทาง, ผู้ comment, ไลฟ์) · code ซ้ำบวกจำนวน · ลูกค้าพิมพ์ "สรุปออเดอร์"/"ยืนยัน" → สร้าง proposal ของ F13 แล้วตะกร้าเป็น `ordered` · ราคาในข้อความตอบไม่ใช่ราคาจริง ต้องดึงราคาใหม่ทุกบรรทัด
- generator (if time): pattern 1–5 ตำแหน่ง (latin/thai/digit) แจก code ถัดไปแบบ odometer · หมดแล้วเสนอ code ที่แจกนานที่สุดพร้อมเตือนว่าสินค้าไหนเสียรหัส
- หน้า presentation อ่าน API ชุดเดียวกับหน้าแก้ code (Papi ไม่มี route แยก) · สิทธิ์แก้ = `business.bot_settings`
## เปลี่ยนถึง 71ee7659 (Papi 19 พ.ย.)

brief นี้เขียนจากโค้ดที่ `6959a92f` ส่วนนี้คือพฤติกรรมที่ Papi เพิ่มหรือเปลี่ยนหลังจากนั้น ถ้าทำส่วนที่เกี่ยวข้องให้ port ตามโค้ดใน `../papi-ref` (ตอนนี้เป็น `71ee7659`) **Done when และ tier ไม่เปลี่ยน**

- แก้ product code เลือกหลาย option ได้เหมือนตอนเพิ่ม (`65583d24`)
- หน้า product codes ที่ค้างไม่ทับ code ใหม่กว่า (`b0eeace9`)
- live cart อยู่รอดแม้ปิดแชต แยกต่อ live หมดอายุได้ (`57496037`)

## Drop / replace
- Meta live comment (`CommentLivePoller`, webhook `feed`/`live_comments`) → ระหว่างรอ F21 รับ code จากข้อความในแชทและ fixture event ที่ติดป้าย sandbox
- live-cart ที่สร้าง draft order เอง → `createOrderFromProposal({ stage: 'propose' })` · OUT: browse "มีอะไรบ้าง" หลังไลฟ์ (เป็นงาน F10), รูปสินค้าในการ์ด code
## Tables
- ของ F22: `product_codes` (business_id, code, code_key unique, item_id, variant_id, note, assigned_at, created_by, version) · `product_code_generators` · `live_carts` + `live_cart_items` (code, item, variant, quantity 1–99)
- item/variant/ราคา อ่านผ่าน F08 service เท่านั้น (ไม่มี FK ข้ามไปตาราง catalog ถ้าไม่ประกาศ dependsOn)
## Done when
- [ ] `A12x2` (seed ของ F22: A12 → A-GAME-01 Standard) แมปถูก จำนวน 2 ราคา canonical 149000 ต่อชิ้นจาก `getPrice()`
- [ ] `aa012` กับ `AA12` เป็น code เดียว · code ซ้ำตาม key → ปฏิเสธ
- [ ] ย้าย code ไปสินค้าอื่นแล้วบันทึก note ด้วย `assigned_at`/version เก่า → 409 · note ของคนอื่นไม่ถูกทับ
- [ ] code ของ A-SOLD-01 แสดง Sold out และไม่สร้าง proposal · หน้า presentation แสดง fact ชุดเดียวกับแชท
## Status floor
codes, note, presentation, ตะกร้าจากแชท = **R** · comment จากไลฟ์จริง = **A** (หรือ S ด้วย fixture ที่ติดป้าย) · รายงานแยกส่วนใน FEATURE_STATUS
