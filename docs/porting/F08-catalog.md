# F08 catalog — สินค้า บริการ และ variants

> **Build spec (ใช้ตัวนี้สร้าง):** [docs/specs/F08-catalog.md](../specs/F08-catalog.md) · หน้านี้คือ know-how เดิมจาก Papi · ส่วน "Papi files to read" ใช้ได้เฉพาะเมื่อหัวหน้าโพสต์ `LEAD: PAPI-REF OPEN` ([D1](../DECISIONS-2026-11-20.md))

> **Tier P0** · core loop · เริ่มเขียนโค้ดหลัง `SETUP READY` · [tier และงบ](../../PLAN.md#tier-core-ก่อน-ส่วนเสริมทีหลัง)

**Lane** B1 ลำดับ 3/4 · golden path (gate ขั้น 1 และ 3) · **เจ้าของ** B · **พึ่ง** core, F03 · **timebox** 30–60 นาที
**ให้** contract `getProduct(businessId, ref)`, `getPrice(businessId, input)` → `PriceQuote` (B2 tools/การ์ด, A2 orders/live codes) · export ของคน B: `importCatalogItems()` ให้ F06 (lane B3) · **ใช้** `getBusiness()`, `requirePermission()`, `db`, `storage.save()` (รูปสินค้า), `audit()`

## Papi files to read (in order)
1. `Backend/functions/CreateKnowledge/README.md` หัวข้อ "The extracted envelope" และ "Variant SKU and sold-out" (กติกาเกือบทั้งหมดอยู่ที่นี่)
2. `Backend/functions/Orchestrator/src/product-record.mjs` (34 บรรทัด: ราคาระดับสินค้า, `from`, อะไรนับเป็นสินค้า)
3. `Backend/layers/nodejs-utils/nodejs/variant-details.mjs`: `variantKey`, `parseSku`, `orderableVariants`, `allVariantsSoldOut`
4. `Backend/functions/CreateKnowledge/src/knowledge-variant-details.mjs` + `knowledge-edit.mjs` (ช่วงตรวจราคาและจำนวน variant)
5. `Backend/functions/Orchestrator/src/product-identity.mjs`, `catalogue-availability.mjs` (การจับคู่ชื่อ/SKU ในแชท ดูแนวคิด)
6. `Database/knowledgeitems.sql`: Papi **ไม่มีตาราง products** สินค้าคือ `knowledge_items.item_type='product'` + `raw_data`
7. `Frontend/src/pages/Knowledge.tsx`, `KnowledgeListCards.tsx` · `Frontend/src/functions/knowledgeVariants.ts`
8. tests: `Backend/tests/knowledge-price-preservation.test.mjs`, `commerce-catalogue-prices.test.mjs`, `catalogue-availability.test.mjs`

## Behaviors to keep
- **อะไรที่โค้ดคำนวณต้องเป็น typed field** (Papi: `base_price`, `variants[].price`) ส่วน attribute อื่นเป็นข้อความให้โมเดลอ่านเท่านั้น · ใหม่เก็บเป็นคอลัมน์ integer สตางค์ (Papi เก็บเป็นตัวเลขบาท ห้ามยกมาตรงๆ)
- ราคาระดับสินค้า: ใช้ราคาของสินค้าเอง ถ้าไม่มีใช้ราคาต่ำสุดของ variant ที่ยังสั่งได้ และติด `from` เมื่อ variant มีหลายราคา · variant ที่หมดไม่เป็นราคาที่ลูกค้าเห็น · variant `priceMinor: null` = ใช้ราคาสินค้า (contract)
- variant key = NFKC + ตัวเล็ก + ช่องว่างเดียว ("Large  Red" = "large red") · SKU 1–64 ตัว: ตัวอักษร (รวมสระ/วรรณยุกต์ไทย) ตัวเลข ช่องว่าง `. _ - / #` · variant ≤50 ต่อสินค้า · ราคา 0–100,000,000 บาท · SKU ไม่ซ้ำในร้าน
- ค่าที่ร้านแก้เองชนะค่าที่สกัดได้ · แก้ด้วย version เก่า → 409 (Papi `stale_revision`) → ใหม่ `VERSION_CONFLICT` · แก้ราคา stock หรือ variant ทุกครั้ง `version + 1` เพื่อให้ proposal ของ F13 ตรวจซ้ำตอนยืนยัน
- Papi มีแค่ธง sold-out ต่อ variant (`available:false`) ไม่มีจำนวน stock และ guard ลบตัวเลข stock ออกจากคำตอบ → ใหม่ใช้ `stock` integer ตาม contract (`null` = ไม่นับ เช่น service) · `stock 0` หรือน้อยกว่า quantity → `soldOut: true` เป็นค่าคืน ไม่ throw
- `getPrice`: quantity ต้องเป็นจำนวนเต็มบวก ไม่งั้น `VALIDATION_ERROR` · ไม่รู้จัก item/variant → `NOT_FOUND` · `subtotalMinor` = unit × qty แบบ integer · ไม่รวมค่าส่ง (F13 คิด) · `getProduct` ของร้านอื่นหรือ inactive → `null`
- `ProductRef` แบบชื่อ: ตรงทั้งชื่อก่อน ไม่งั้นต้องมีสินค้าเดียวที่ name/nameEn มีคำนั้น กำกวม → `null` ห้ามเดา
- สิทธิ์: อ่าน `product.read` · แก้ `product.write` · ลบ `product.delete` · staff A ตาม SPEC แก้ราคาไม่ได้

## เปลี่ยนถึง 71ee7659 (Papi 19 พ.ย.)

brief นี้เขียนจากโค้ดที่ `6959a92f` ส่วนนี้คือพฤติกรรมที่ Papi เพิ่มหรือเปลี่ยนหลังจากนั้น ถ้าทำส่วนที่เกี่ยวข้องให้ port ตามโค้ดใน `../papi-ref` (ตอนนี้เป็น `71ee7659`) **Done when และ tier ไม่เปลี่ยน**

- หลาย SKU ต่อ variant, ทุก SKU ค้นได้, SKU chips, เช็ก "SKU ถูกใช้แล้ว" (`178c7a26`, `01aca060`)
- เพิ่ม variant พร้อม SKU จากหน้าสินค้า (`ec31d06c`)
- ล็อก catalog ระหว่าง live/presentation: `businesses.product_catalog_locked` ทำให้แก้สินค้าไม่ได้จนปลดล็อก (`1b662eac`)
- ไฟล์ใหม่ใน map: `Backend/functions/CreateKnowledge/src/sku-duplicates.mjs`, `Frontend/src/components/knowledge/SkuChipsInput.tsx`

## Drop / replace
- LLM extraction ของ CreateKnowledge/KnowledgeExtraction ที่ตั้งราคาให้ → ราคามาจากฟอร์มหรือ CSV ของ F06 เท่านั้น · `raw_data.variant_details` + leftovers + `VARIANT_KEY_SQL` → คอลัมน์ใน `catalog_variants`
- product codes (F22), ImagePad สำหรับการ์ด Meta (F18), `/products` legacy API → ไม่ใช่งานของ F08

## Tables
- เป็นเจ้าของ (`-- dependsOn: core`): `catalog_items` (business_id, sku unique ต่อร้าน, kind `product|service`, name, name_en, price_minor ≥0, currency THB, stock, shippable, duration_minutes, active, version) · `catalog_variants` (item_id, name, sku, price_minor null, stock) · if time `catalog_price_history`
- seed ตาม `SEED.catalog` ใน `seed.ts`: A-GAME-01 149000 stock 5 + variant Standard · A-CARD-01 9900 · A-SOLD-01 stock 0 · A-SERVICE-01 · B-KIT-01 39000 · B-SERVICE-01

## Done when
- SPEC F08: ราคาเป็น integer หน่วยย่อยจาก DB · quantity ต้องเป็นบวก · variant ผิด/หมดขายถูกปฏิเสธ · แก้ราคาแล้ว version เปลี่ยน
- ตาม `SEED_CHECKS`: `getPrice(A-GAME-01, qty 2)` ได้ subtotal 298000 · `getPrice(A-SOLD-01)` ได้ `soldOut: true` · qty 0 → `VALIDATION_ERROR` · `getProduct({sku:'B-KIT-01'})` จากร้าน A ได้ `null`
- หน้า `/catalog` เพิ่ม/แก้ราคาได้ แล้ว `getPrice()` คืนราคาและ version ใหม่ทันที

## Status floor
**R** (golden path)
