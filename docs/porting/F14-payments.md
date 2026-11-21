# F14 payments — QR PromptPay และตรวจสลิป

> **Build spec (ใช้ตัวนี้สร้าง):** [docs/specs/F14-payments.md](../specs/F14-payments.md) · หน้านี้คือ know-how เดิมจาก Papi · ส่วน "Papi files to read" ใช้ได้เฉพาะเมื่อหัวหน้าโพสต์ `LEAD: PAPI-REF OPEN` ([D1](../DECISIONS-2026-11-20.md))

> **Tier P1** · เริ่มเขียนโค้ดเมื่อหัวหน้าโพสต์ `LEAD: OPEN P1` เท่านั้น · [tier และงบ](../../PLAN.md#tier-core-ก่อน-ส่วนเสริมทีหลัง)

**Lane A2** (ฟีเจอร์ 2/3) · owner A · เป้า **S** (ไม่มีเงินจริง) · พึ่ง F13, F35 · **ให้:** ไม่มี contract ข้ามคน (export ภายใน lane ให้ F13 เช่น `requestPayment(orderId)`) · **ใช้:** F13 service (สถานะออเดอร์) · core `storage` (สลิป, QR), `model.chat({ model: 'chat' })` + image part อ่านสลิป ([docs/openai-api.md](../openai-api.md) §7), `sendToCustomer`, `db`, `audit`, `requirePermission` · C3 `notify()` · web path `/payments` + panel ในแชท (slot `chatSidePanels`) + แท็บตั้งค่าใน `/business` (slot `businessTabs`)
## Papi files to read (ใต้ `../papi-ref`)
1. `Backend/functions/Orchestrator/src/commerce/README.md` ย่อหน้า payment request, receipt, "Commerce on, payment details missing", "When staff take the order"
2. `Backend/functions/Orchestrator/src/commerce/payment-flow.mjs` — verify → commit → receipt → ส่งต่อ staff · หมวดผลตรวจ
3. `Backend/functions/Orchestrator/src/commerce/repository.mjs` — `beginPaymentVerification`, `commitVerifiedPayment`, `recordPaymentVerificationFailure`, `expirePaymentOrder`
4. `Backend/functions/Orchestrator/src/commerce/promptpay.mjs` (QR จากยอดสตางค์, ส่ง QR ซ้ำเมื่อยอดตรงเท่านั้น) · `slip2go.mjs` (อ่านเงื่อนไขการตรวจเท่านั้น ห้าม port Slip2Go)
5. `Backend/functions/Orchestrator/src/commerce/payment-config.mjs` (payment พร้อม vs sheet พร้อม แยกกัน) · `payment-outcomes.mjs` · `payment-cards.mjs`
6. `Database/orders.sql` คอลัมน์ `payment_state`, `payment_version`, attempt counters, `verification_history`, `ux_orders_verified_transaction_ref`
7. `Backend/functions/StaffOrders/src/payment-request.mjs` · `Backend/layers/nodejs-utils/nodejs/commerce/crypto.mjs` (เข้ารหัสค่าตั้ง)
8. FE: `Frontend/src/pages/businessdetail_pages/BusinessPayment.tsx`, `BusinessPaymentSummary.tsx`, `components/messenger/StaffOrderPaymentPanel.tsx`
9. tests: `Frontend/src/components/messenger/StaffOrderPaymentPanel.test.tsx`
## Behaviors to keep (ตรวจจากโค้ดที่ 6959a92f)
- `payment_state`: `unpaid` → `awaiting_verification` → `paid` · ล้ม → กลับ `unpaid` · หมดอายุระหว่างรอ → `unknown` · ทุกการเปลี่ยนตรวจ `state_version` + `payment_version` (CAS)
- QR สร้างจาก PromptPay id ที่ร้านตั้งและตรวจแล้ว + ยอด total ของ payment version นั้น · ส่ง QR ซ้ำได้เฉพาะเมื่อยอดที่บันทึกกับ QR เท่ากับยอดปัจจุบันและ receiver fingerprint ยังตรง · **มี QR ไม่ได้แปลว่าจ่ายแล้ว**
- ตรวจสลิปด้วยเงื่อนไข receiver + ยอด + วันที่ + ซ้ำ แล้วยังตรวจยอด/วันที่เองอีกชั้น · หมวดล้ม: `unreadable`, `technical`, `wrong_account`, `wrong_amount`, `wrong_date`, `duplicate`
- `verified_transaction_ref` unique ทั้งระบบ → สลิปเดียวจ่ายสองออเดอร์ไม่ได้ (ชนแล้วตีเป็น `duplicate`)
- ล้ม: นับ unreadable/technical และ mismatch แยกกัน · เก็บประวัติตรวจล่าสุด 20 รายการ · ล้มครบ 3 ครั้ง (ทุกชนิดรวม) → ส่งต่อ staff
- receipt ออกได้เฉพาะ payment ที่ verified และ commit แล้ว: ยอด, เวลาโอน (Asia/Bangkok), เลขออเดอร์, ผู้รับ, เลขอ้างอิงแบบย่อ · ชื่อผู้โอนบนสลิปใช้แสดงเท่านั้น ห้ามใช้ตัดสิน
- ข้อมูลชำระของร้านเข้ารหัสใน DB · ฟอร์มกรอกครึ่งเดียวถือว่าว่าง (ไม่สร้าง QR) · staff `mark_paid` ข้ามการตรวจสลิปได้แต่มี audit · ไม่มี plan gate ของ QR (ใช้ได้ไม่จำกัด)
## เปลี่ยนถึง 71ee7659 (Papi 19 พ.ย.)

brief นี้เขียนจากโค้ดที่ `6959a92f` ส่วนนี้คือพฤติกรรมที่ Papi เพิ่มหรือเปลี่ยนหลังจากนั้น ถ้าทำส่วนที่เกี่ยวข้องให้ port ตามโค้ดใน `../papi-ref` (ตอนนี้เป็น `71ee7659`) **Done when และ tier ไม่เปลี่ยน**

- การ์ดออเดอร์ Messenger เป็นใบเสร็จพร้อมข้อมูลลูกค้า (`0450b7d7`, `d1b2c2aa`)

## Drop / replace
- Slip2Go API → **อ่านสลิปด้วย OpenAI vision แล้วตรวจในโค้ด** (`SLIP_VERIFY_MODE=vision` เป็นค่าเริ่มต้น): `model.chat({ model: 'chat' })` + image part `detail:'high'` → strict schema (ฟิลด์จริงดู spec §6) แล้วโค้ดตรวจยอดกับออเดอร์ ผู้รับกับร้าน และ `bankRef` ไม่ซ้ำ (unique) · อ่านไม่ชัด / ไม่มั่นใจ / ไม่ตรง → `awaiting_verification` ให้ staff กดยืนยัน · โหมดนี้ยังไม่ได้ยืนยันกับธนาคาร ห้ามอ้างว่าตรวจกับธนาคารแล้ว
- `SLIP_VERIFY_MODE=sandbox` → **slip simulator ที่ติดป้าย** (เลือกผลได้: verified / wrong_amount / wrong_account / duplicate / unreadable / timeout→unknown) ใช้ใน test และ CI · ไม่มี Omise (ทีมตัดออก 20 พ.ย.)
- S3 QR object + `x-amz-meta-amount` → ไฟล์ใน core `storage` + คอลัมน์ amount_minor · Secrets Manager key → `.env` · Flex receipt → `MessagePart` (text + image) ให้ sender แปลงเอง
- PromptPay payload สร้างด้วย builder ของเราเอง (spec §5.2) · library ที่ต้องใช้ติดตั้งตอน setup แล้ว (`qrcode`, `sharp`, `jsqr`) · OUT: บัญชีธนาคารแบบไม่มี QR (เก็บเป็น A ถ้าไม่ทัน)
## Tables
- ของ F14: `payment_settings` (business_id, promptpay id เข้ารหัส, receiver display, validated_at) · `payment_requests` (order_id, payment_version, amount_minor, qr file_id, state, expires_at) · `payment_verifications` (request_id, slip file_id, category, amount_minor, transaction_ref UNIQUE where verified, mode `sandbox`/`real`)
- ออเดอร์อยู่ใน F13: เปลี่ยน `paymentState` ผ่าน export ของ F13 เท่านั้น · `unknown` เก็บในตาราง F14 และ order ยังแสดง `pending_verification` (ไม่ใช่ paid)
## Done when
- [ ] สร้าง payment request + QR ได้ แต่ order ยัง unpaid จนสลิปผ่าน
- [ ] สลิปยอดผิด / ผู้รับผิด / ปลอม (simulator และสลิปทดสอบผ่าน vision) → ไม่ paid และนับ attempt · ครบ 3 ครั้ง → ส่งต่อ staff · ผล vision ที่ไม่มั่นใจไม่ทำให้ paid เอง
- [ ] transaction ref เดียวใช้กับออเดอร์ที่สอง → `duplicate` ออเดอร์ที่สองไม่ paid · verified event เดิมซ้ำ → บันทึกครั้งเดียว
- [ ] simulator ตอบ timeout → `unknown` ไม่ paid ไม่ retry เอง · receipt แบบ sandbox มีป้าย "ทดสอบ" ชัด
## Status floor
**S** (อ่านสลิปด้วย OpenAI vision + ตรวจในโค้ด หรือ simulator ติดป้าย + QR ที่สร้างจริงในเครื่อง) · ไม่ได้ยืนยันกับธนาคาร จึงไม่เกิน S · ห้ามรับเงินจริง
