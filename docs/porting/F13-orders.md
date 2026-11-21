# F13 orders — Commerce: ใบเสนอ ยืนยัน และออเดอร์

> **Build spec (ใช้ตัวนี้สร้าง):** [docs/specs/F13-orders.md](../specs/F13-orders.md) · หน้านี้คือ know-how เดิมจาก Papi · ส่วน "Papi files to read" ใช้ได้เฉพาะเมื่อหัวหน้าโพสต์ `LEAD: PAPI-REF OPEN` ([D1](../DECISIONS-2026-11-20.md))

> **Tier P1** · เริ่มเขียนโค้ดเมื่อหัวหน้าโพสต์ `LEAD: OPEN P1` เท่านั้น · [tier และงบ](../../PLAN.md#tier-core-ก่อน-ส่วนเสริมทีหลัง)

**Lane A2** (ฟีเจอร์ 1/3) · owner A · เป้า **R** (stretch ของ golden path: `propose` ให้ B2 ใช้ก่อน 12:30) · พึ่ง F08, F09, F10, F35 · **ให้:** `createOrderFromProposal()` (`stage: 'propose' | 'confirm'`) · **ใช้:** B1 `getProduct()` `getPrice()` · F09 `saveMessage()` · core `db`, `jobs`, `sendToCustomer`, `audit`, `requirePermission` · C3 `notify()` (`order.created`) · web path `/orders` + panel ออเดอร์ในแชทผ่าน slot `chatSidePanels`
## Papi files to read (ใต้ `../papi-ref`)
1. `Backend/functions/Orchestrator/src/commerce/README.md` — เจ้าของแต่ละส่วน, ใครส่งต่อ staff, one open order, เลขออเดอร์
2. `Backend/layers/nodejs-utils/nodejs/commerce/constants.mjs` (ตาราง `TRANSITIONS`) + `order-transition.mjs` (ตัวเขียนสถานะตัวเดียว: CAS + scope)
3. `Database/orders.sql` (สถานะ, `state_version`, unique index ของ open order) · `orderitems.sql` · `orderstaffactions.sql` · `businesscommercesettings.sql`
4. `Backend/functions/Orchestrator/src/commerce/checkout-review.mjs` — ยืนยันได้เมื่อ review ล่าสุดตรงกับ version ปัจจุบันเท่านั้น
5. `Backend/functions/Orchestrator/src/commerce/repository.mjs` — `createDraftOrderLocked`, expire draft อื่นของลูกค้า, `makeOrderNumber`
6. `Backend/functions/StaffOrders/README.md` + `Backend/layers/nodejs-utils/nodejs/commerce/staff-order-actions.mjs` — action ของ staff และ 409 ทั้งหมด
7. `Backend/layers/nodejs-utils/nodejs/merchant-capabilities/delivery.mjs` + `commerce/money.mjs` — ค่าส่งและเงิน
8. `Backend/functions/OrderMaintenance/src/maintenance.mjs` · `Backend/functions/CommerceJobRunner/src/followups.mjs` (if time)
9. FE: `Frontend/src/pages/Orders.tsx`, `components/orders/`, `components/order/`, `components/messenger/CustomerOrdersSection.tsx`, `functions/orderContract.ts`, `staffOrderRules.ts`, `locales/th/orders.json`
10. tests: `Frontend/src/components/orders/OrderStaffActions.test.tsx`, `OrderDetailModal.test.tsx`, `CreateStaffOrderModal.test.tsx`
## Behaviors to keep (ตรวจจากโค้ดที่ 6959a92f)
- ราคามาจาก catalog ใหม่ทุกครั้ง (Papi `resolveCommerceItems`) ไม่เชื่อราคาจาก client หรือโมเดล · สินค้าต้อง active ไม่ถูกลบ ไม่ sold out และมีราคา ไม่งั้น `PRODUCT_UNAVAILABLE` + reason (`sold_out`/`unpriced`/`not_found`)
- ยืนยันได้เฉพาะ review ที่ลูกค้าเห็นของ version ปัจจุบัน (Papi `checkout_review_version === state_version`) · แก้ตะกร้าหลัง review = ต้อง review ใหม่ · ระบบใหม่: consent = ปุ่ม `confirm_proposal` ที่ส่ง proposalId + version + reviewToken · ถ้ารับคำว่า "ยืนยัน" ให้โค้ด (ไม่ใช่โมเดล) map เป็น ConfirmRequest ของ proposal ล่าสุดที่ยังไม่หมดอายุ
- สถานะเปลี่ยนผ่านตัวเขียนเดียว: ตาราง transition + `WHERE status = <เดิม> AND state_version = <ที่คาด>` + scope business · ผิดตาราง = `ILLEGAL_TRANSITION` · version ไม่ตรง = `STATE_CHANGED`
- 1 open order ต่อลูกค้าต่อ business (unique index) · staff สร้างออเดอร์ให้ลูกค้าที่มี open order → 409 `ACTIVE_ORDER_EXISTS`
- staff actions: `cancel`, `update_items`, `update_delivery`, `set_delivery_fee`, `mark_paid`, `mark_shipped`, `mark_delivered` ทุกตัวส่ง `expected_state_version` · ผิด → 409 พร้อม `current_state_version` · fulfillment (`pending/shipped/delivered`) แยกจากสถานะออเดอร์ · ทุก action มีแถว audit · สิทธิ์ `orders.write` + `orders.read` + `chat.reply` · ตั้งค่า commerce = `business.commerce`
- commerce ปิด → bot ไม่รับออเดอร์ (ส่งต่อ staff) · ไม่มีข้อมูลชำระ หรือค่าส่งที่ staff ต้องตั้ง → สรุปออเดอร์แล้วส่งต่อ staff ทันที ไม่สร้าง QR
- เลขออเดอร์ห้ามมีตัวเลขติดกันเกิน 2 ตัว (Messenger แปลงเลขยาวเป็นบัญชี PromptPay) เช่น `ORD-17NOV26-KXPQ-MTRA`
- หมดอายุ: รอบรายวัน 02:00 Bangkok ยกเลิกออเดอร์ที่ยังไม่จ่ายและเก่ากว่า `order_expiry_days` (ค่าเริ่ม 7) · ไม่แตะออเดอร์ที่กำลังตรวจสลิป, ผลจ่าย unknown หรือรอ staff
- follow-up การขาย (if time): ส่งครั้งเดียวหลัง delay · ข้ามถ้าลูกค้าตอบแล้ว, มีข้อความออกใหม่, AI ปิด หรือมีคนรับช่วง
## เปลี่ยนถึง 71ee7659 (Papi 19 พ.ย.)

brief นี้เขียนจากโค้ดที่ `6959a92f` ส่วนนี้คือพฤติกรรมที่ Papi เพิ่มหรือเปลี่ยนหลังจากนั้น ถ้าทำส่วนที่เกี่ยวข้องให้ port ตามโค้ดใน `../papi-ref` (ตอนนี้เป็น `71ee7659`) **Done when และ tier ไม่เปลี่ยน**

- เลขออเดอร์ใหม่ `<6 hex ร้าน>-<DDMONYY>-<4>-<4>-<ช่องทาง>` เก็บเลขเดิมใน `legacy_order_number` (`743b5aea`)
- เลข tracking + ขนส่ง แจ้งลูกค้า, ORDER_LOOKUP บอกเลข (`ab537602`, `1830b63c`)
- รายงานยอดขายและจัดส่งรายวันแบบพิมพ์ได้ (`8bc13900`)
- ยืนยันออเดอร์แล้วเสนอ "คืนแชตให้ AI" (`c295fec5`)
- ออเดอร์จ่ายแล้วรอส่งไม่บล็อกออเดอร์ใหม่ (`a997fe90`)
- ค่าส่งแบบง่าย 3 แบบใน Orders → Settings: ค่าส่งต่อออเดอร์ / ติดต่อแอดมิน (ค่าเริ่มต้น) / กฎที่ร้านเขียนเอง (`7d819206`, `a0cdd634`)
- ถามตะกร้าได้การ์ดทีละบรรทัด (`cart-cards.mjs`)
- fix variant/ที่อยู่จัดส่งจำนวนมาก
- ไฟล์ใหม่ใน map: `Backend/functions/Orchestrator/src/cart-cards.mjs`, `Backend/functions/GetInsights/src/daily-order-report.mjs`, `Backend/functions/StaffOrders/src/shipment-notice.mjs`, `Frontend/src/functions/dailyOrderReport.ts`, `Frontend/src/locales/th/ordersReport.json`, `Frontend/src/pages/businessdetail_pages/deliveryControls.tsx`

## Drop / replace
- Papi สร้าง draft order ตั้งแต่ตะกร้า → ระบบใหม่: `propose` = proposal ที่แก้ไม่ได้ (id/version/hash/expiry 15 นาที) ยังไม่มี order · `confirm` = order + receipt + outbox ใน transaction เดียว
- เงิน `NUMERIC(12,2)` บาท → integer สตางค์ · สถานะ 9 ค่าของ Papi → `OrderSummary.status` ของ contract (draft = proposal, `needs_staff` เก็บเป็น flag ภายใน)
- Orchestrator commerce controller/intake/model-json (46 ไฟล์) → B2 เรียก `createOrderFromProposal()` เป็น tool · advisory lock ต่อลูกค้า → transaction + unique index · OUT: Google Sheet sync, voice checkout, demo checkout grants
## Tables
- ของ F13: `order_proposals` (snapshot lines, totals, shipping, version, review_token hash, expires_at, client_request_id) · `orders` · `order_items` · `order_receipts` (business + clientRequestId unique, payload hash) · `order_staff_actions` · `commerce_settings` (enabled, shipping rule จาก SEED, order_expiry_days)
- อ่าน: catalog ผ่าน F08 service · conversation ผ่าน F09 service · F14 อัปเดตการจ่ายผ่าน export ใน `service.ts` ของ F13 (lane เดียวกัน)
## Done when
- [ ] ตัวเลข SPEC §5: A-GAME-01 ×2 = 298000 · A-CARD-01 ×2 = 29800 (ค่าส่ง 10000) · B-KIT-01 ×1 = 44000 · A-SOLD-01 → `SOLD_OUT`
- [ ] confirm ซ้ำ payload เดิม → order เดียว (`replayed: true`) · id เดิม payload ใหม่ → `IDEMPOTENCY_CONFLICT`
- [ ] แก้ A-GAME-01 เป็น 159000 หลัง quote แล้ว confirm quote เก่า → `VERSION_CONFLICT` · proposal หมดอายุ → `PROPOSAL_EXPIRED`
- [ ] staff action ด้วย version เก่า → 409 · reload แล้ว order และ shipping ยังอยู่ · ข้อความโมเดลว่า "ยืนยันแล้ว" ไม่สร้าง order
## Status floor
**R** (ไม่มี provider ภายนอก) · ถ้าไม่ทัน: `propose` = R, `confirm` = U พร้อมเหตุผลใน EVIDENCE.md
