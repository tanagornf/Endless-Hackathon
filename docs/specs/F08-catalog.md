# F08 catalog — สินค้า บริการ ตัวเลือก (variants) และราคามาตรฐาน

| | |
|---|---|
| Lane / คน | **B1** / **B** · ลำดับ 3 ใน lane (F05 → F07 → F08 → F37) · orchestrator อาจสั่งให้ทำ **S1 (contract slice) ก่อน F07** เพราะ A2/B2 รอ |
| Tier / เป้า | **P0** · เป้า **R** (golden path: gate ขั้น 1 เพิ่มสินค้า, ขั้น 3 AI ตอบ 1,490 บาท) |
| Timebox | 30–60 นาที (S1 ≤ 25 นาที ทำทันทีหลัง F05 S1 · S2a ≤ 20 นาที คือส่วนที่ gate 13:00 ต้องใช้) |
| เริ่มเมื่อ | `SETUP READY` |
| พึ่ง | core (`businesses`, `files`, `storage`, `db`, `audit`, `model.moderate`) · F35 ไม่ต้อง |
| ให้ | `getProduct`, `getPrice` (B2 tools/การ์ด, A2 orders/live codes) · **`listCatalogItems`** (B2 F10 `list_products`, C1 F39 feed + MCP `search_catalog`, A2 F22) · `getCatalogItemAdminDetails`, `adjustCatalogStock`, `importCatalogItems`, `parsePriceToMinor` (ใน `### Contract additions`: B3 F06, A2 F13, C1 F39) |
| ใช้ | core เท่านั้น (ไม่เรียกฟีเจอร์อื่น) |
| โฟลเดอร์ | `server/src/features/catalog/` · `shared/features/catalog/types.ts` · `web/src/features/catalog/` |
| Web path | `/catalog` (เมนูกลุ่ม `knowledge`) · หน้าย่อย `/catalog/:itemId` |

อ่าน: `contracts.ts` ส่วน F08 (`CatalogItem`, `CatalogVariant`, `ProductRef`, `PriceQuote`, `getProduct`, `getPrice`) + `SEED.catalog` + `SEED_CHECKS` + SPEC §5 (ราคา/ค่าส่ง) · F10 spec §5.6 (tools `get_price`, `calculate_total`, `list_products`) · F13 (ใช้ `PriceQuote.version`) · [COOKBOOK](../COOKBOOK.md) · know-how เดิม: [porting brief](../porting/F08-catalog.md)

## 1. เป้าหมายและ user stories

ทำไมมี: ราคาและสต็อกต้องมาจาก DB เสมอ ไม่ใช่จากโมเดล (R4) F08 คือแหล่งเดียวของ "ราคามาตรฐาน" เป็น integer สตางค์ พร้อม `version` ที่เปลี่ยนทุกครั้งที่ราคา/สต็อก/ตัวเลือกเปลี่ยน เพื่อให้ใบเสนอ (proposal) ของ F13 ตรวจซ้ำตอนยืนยันได้ F08 ไม่คำนวณค่าส่ง (F13 ทำ)

ผู้ใช้: เจ้าของ/พนักงาน (`product.write` แก้, `product.read` ดู, `product.delete` ลบ) · ฟีเจอร์อื่น (อ่านผ่าน contract)

User stories:
1. เจ้าของเพิ่มสินค้า `A-GAME-01` ราคา 1,490 บาท สต็อก 5 จากหน้า `/catalog` แล้วถามแชต "A-GAME-01 ราคาเท่าไหร่" AI ตอบ 1,490 บาทจากค่าใน DB (gate ขั้น 1 และ 3)
2. เจ้าของแก้ราคาเป็น 1,590 บาท ราคาที่ AI/ใบเสนอเห็นเปลี่ยนทันที และ `version` เพิ่ม ใบเสนอที่สร้างก่อนหน้า (version เดิม) ต้องถูกตรวจซ้ำ ไม่ใช้ราคาเก่าเงียบ ๆ
3. เจ้าของตั้งสินค้าหมด (สต็อก 0) หรือปิดการขาย (inactive) AI ไม่เสนอขาย/ไม่สร้างใบเสนอ
4. เจ้าของใส่ตัวเลือก (ไซซ์/สี) แต่ละตัวมี SKU/ราคา/สต็อกของตัวเอง หรือใช้ราคาของสินค้า
5. เจ้าของอัปโหลดรูปสินค้า (หลายรูป เลือกรูปหลัก) · ส่งออก/นำเข้า CSV (ผ่าน F06 ที่เรียก `importCatalogItems`) โดยสินค้าที่นำเข้าเป็น **ร่าง (ปิดการขาย)** จนกว่าเจ้าของเปิดขาย
6. พนักงานที่ไม่มี `product.write` ดูได้แต่แก้ราคาไม่ได้ (staff A ตาม SPEC §5)

นอกขอบเขต: ค่าส่ง/ส่วนลด/ภาษี (F13) · รหัสขายสด `product codes` (F22) · รูปการ์ด Meta (F18) · ใบกำกับภาษี · หลายสกุลเงิน · ราคาตามจำนวน (tiered) · LLM สกัดราคาจากเอกสาร (ราคามาจากฟอร์ม/CSV เท่านั้น) · การจองสต็อกระหว่างรอชำระ (ไม่มี reservation: F13 ตัดสต็อกตอนยืนยันผ่าน `adjustCatalogStock` หรือไม่ตัดเลยถ้า A2 ตัดสินใจ — ดู §15)

## 2. Data model

`server/src/features/catalog/migrations/001_catalog.sql`:

```sql
-- dependsOn: core
CREATE TABLE catalog_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  sku text NOT NULL CHECK (char_length(sku) BETWEEN 1 AND 64),
  kind text NOT NULL CHECK (kind IN ('product','service')),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 255),
  name_en text CHECK (name_en IS NULL OR char_length(name_en) BETWEEN 1 AND 255),
  description text CHECK (description IS NULL OR char_length(description) <= 2000),   -- ข้อความให้ AI/ลูกค้าอ่าน ไม่ใช่ตัวเลขที่โค้ดคำนวณ
  category text CHECK (category IS NULL OR char_length(category) BETWEEN 1 AND 100),
  price_minor bigint NOT NULL CHECK (price_minor BETWEEN 0 AND 10000000000),          -- 0–100,000,000 บาท
  currency text NOT NULL DEFAULT 'THB' CHECK (currency = 'THB'),
  unit text NOT NULL DEFAULT 'ชิ้น' CHECK (char_length(unit) BETWEEN 1 AND 30),       -- หน่วยขาย เช่น ชิ้น กล่อง ชุด ครั้ง ชั่วโมง
  stock int CHECK (stock IS NULL OR stock >= 0),                                      -- null = ไม่นับสต็อก (บริการ)
  shippable boolean NOT NULL DEFAULT true,
  duration_minutes int CHECK (duration_minutes IS NULL OR duration_minutes BETWEEN 5 AND 1440),
  active boolean NOT NULL DEFAULT true,
  version int NOT NULL DEFAULT 1 CHECK (version >= 1),
  price_changed_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','import','seed')),
  source_ref text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK ((kind = 'service') = (duration_minutes IS NOT NULL)),
  CHECK (kind = 'product' OR (stock IS NULL AND shippable = false))
);
CREATE INDEX catalog_items_list ON catalog_items (business_id, active, lower(name), id) WHERE deleted_at IS NULL;
CREATE INDEX catalog_items_category ON catalog_items (business_id, lower(category)) WHERE deleted_at IS NULL AND category IS NOT NULL;

CREATE TABLE catalog_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  name_key text NOT NULL,                              -- NFKC + lowercase + ช่องว่างเดียว ("Large  Red" = "large red")
  sku text CHECK (sku IS NULL OR char_length(sku) BETWEEN 1 AND 64),
  price_minor bigint CHECK (price_minor IS NULL OR price_minor BETWEEN 0 AND 10000000000),   -- null = ใช้ราคาของสินค้า
  stock int CHECK (stock IS NULL OR stock >= 0),                                             -- null = ใช้ stock ของสินค้า
  position int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, name_key)
);
CREATE INDEX catalog_variants_item ON catalog_variants (business_id, item_id, position);

-- SKU/รหัสไม่ซ้ำต่อร้าน ข้ามทั้งสินค้าและ variant: ทะเบียนเดียว (เขียนในทรานแซกชันเดียวกับแถวหลัก)
CREATE TABLE catalog_sku_registry (
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  sku_key text NOT NULL,                               -- NFKC + lowercase + ช่องว่างเดียว
  item_id uuid NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES catalog_variants(id) ON DELETE CASCADE,
  PRIMARY KEY (business_id, sku_key)
);
CREATE INDEX catalog_sku_registry_item ON catalog_sku_registry (item_id);

CREATE TABLE catalog_item_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
  file_id uuid NOT NULL,                               -- core files.id (ไม่ FK: core เป็นเจ้าของ lifecycle ของไฟล์)
  position int NOT NULL DEFAULT 0,                     -- 0 = รูปหลัก
  alt text NOT NULL DEFAULT '',
  flagged boolean NOT NULL DEFAULT false,              -- model.moderate เตือน (ไม่บล็อก)
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, file_id)
);
CREATE INDEX catalog_item_images_item ON catalog_item_images (business_id, item_id, position);

CREATE TABLE catalog_price_history (                   -- ทุกครั้งที่ราคาของสินค้า/variant เปลี่ยน (ตรวจย้อน, ใช้ใน UI)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
  variant_id uuid,
  version int NOT NULL,                                -- version ของสินค้าหลังเปลี่ยน
  old_price_minor bigint,
  new_price_minor bigint NOT NULL,
  changed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX catalog_price_history_item ON catalog_price_history (business_id, item_id, changed_at DESC);

CREATE TABLE catalog_stock_moves (                     -- ประวัติปรับสต็อก (ใช้ idempotency ด้วย ref)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
  variant_id uuid,
  delta int NOT NULL,
  stock_after int NOT NULL,
  reason text NOT NULL CHECK (reason IN ('manual','order','order_cancel','import','correction')),
  ref_type text,
  ref_id text,
  note text CHECK (note IS NULL OR char_length(note) <= 300),
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX catalog_stock_moves_ref ON catalog_stock_moves (business_id, ref_type, ref_id, item_id, coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE ref_type IS NOT NULL AND ref_id IS NOT NULL;
CREATE INDEX catalog_stock_moves_item ON catalog_stock_moves (business_id, item_id, created_at DESC);
```

กฎ: ทุก query กรอง `business_id` (และ `deleted_at IS NULL` ยกเว้นหน้าประวัติ) · `price_minor` เป็น `bigint` อ่านเป็น string จาก `pg` → แปลงเป็น `number` ด้วย `Number()` และตรวจ `Number.isSafeInteger` (สูงสุด 1e10 × qty 10,000 = 1e14 < 2^53 ปลอดภัย) · ไม่มีทศนิยมที่ไหนเลย

### กฎ version (ราคามาตรฐาน)

`catalog_items.version` เพิ่ม **หนึ่งครั้งต่อหนึ่งคำสั่งเขียน** ในทรานแซกชันเดียวกับการเปลี่ยน เมื่อคำสั่งนั้นเปลี่ยนอย่างน้อยหนึ่งอย่างต่อไปนี้: `price_minor`, `stock`, `active`, `shippable`, `name`, `name_en`, `kind`, `unit`, `duration_minutes`, variant ใด ๆ (เพิ่ม/แก้ราคา สต็อก ชื่อ SKU `active`/ลบ) หรือการปรับสต็อก (`catalog_stock_moves`) · **ไม่** เพิ่มเมื่อเปลี่ยนเฉพาะ `description`, `category`, รูป, `position` ของ variant · `price_changed_at` อัปเดตเฉพาะเมื่อราคาของสินค้าหรือ variant เปลี่ยน · ค่านี้คือ `CatalogItem.version` และ `PriceQuote.version`

## 3. API endpoints

ใต้ `/api/v1/businesses/:businessId/catalog` · `defineFeatureRoutes({ featureId:'F08', slug:'catalog' })` · auth `business` ทุกตัว · ลบ route placeholder ใน PR แรกที่เพิ่ม route จริง

| Method | Path | permission | Request | Response | Errors |
|---|---|---|---|---|---|
| GET | `/items` | `product.read` | `ListQuery` | `Page<CatalogItemRow>` | VALIDATION_ERROR |
| POST | `/items` | `product.write` | `CreateItemBody` | 201 `CatalogItemAdminDetail` | VALIDATION_ERROR (`details.code`: `sku_taken` \| `sku_invalid` \| `price_invalid` …) |
| GET | `/items/:itemId` | `product.read` | — | `CatalogItemAdminDetail` | NOT_FOUND |
| PATCH | `/items/:itemId` | `product.write` | `PatchItemBody` | `CatalogItemAdminDetail` | VALIDATION_ERROR, VERSION_CONFLICT, NOT_FOUND |
| DELETE | `/items/:itemId` | `product.delete` | — | `{ id, deletedAt }` (200 ทุกครั้ง) | NOT_FOUND |
| POST | `/items/:itemId/variants` | `product.write` | `VariantBody` + `expectedVersion` | 201 `CatalogItemAdminDetail` | VALIDATION_ERROR (`variant_limit`, `variant_name_taken`, `sku_taken`), VERSION_CONFLICT |
| PATCH | `/items/:itemId/variants/:variantId` | `product.write` | `VariantPatchBody` + `expectedVersion` | `CatalogItemAdminDetail` | เหมือนข้างบน, NOT_FOUND |
| DELETE | `/items/:itemId/variants/:variantId` | `product.write` | `{ expectedVersion }` (query) | `CatalogItemAdminDetail` | VERSION_CONFLICT, NOT_FOUND |
| POST | `/items/:itemId/stock` | `product.write` | `StockBody` | `CatalogItemAdminDetail` | VALIDATION_ERROR (`stock_negative`), VERSION_CONFLICT |
| GET | `/items/:itemId/history` | `product.read` | — | `{ prices: PriceHistoryRow[]; stock: StockMoveRow[] }` (ล่าสุด 50) | NOT_FOUND |
| POST | `/items/:itemId/images` | `product.write` | multipart field `file` (≤ 8 MB; png/jpeg/webp) + `alt?` | 201 `CatalogItemAdminDetail` | VALIDATION_ERROR (`image_limit` > 5) |
| PUT | `/items/:itemId/images/order` | `product.write` | `{ imageIds: string[] }` | `CatalogItemAdminDetail` | VALIDATION_ERROR, NOT_FOUND |
| DELETE | `/items/:itemId/images/:imageId` | `product.write` | — | `CatalogItemAdminDetail` | NOT_FOUND |
| GET | `/items/:itemId/images/:imageId/file` | `product.read` | — | ไฟล์รูป (`HttpResponse kind:'file'`, inline) | NOT_FOUND |
| GET | `/categories` | `product.read` | — | `{ items: { name: string; count: number }[] }` | — |
| GET | `/sku-check` | `product.read` | `{ sku, excludeItemId? }` | `{ taken: boolean; itemId: string \| null }` | VALIDATION_ERROR |
| GET | `/export.csv` | `product.read` | `{ status?: 'all' \| 'active' \| 'inactive' }` | ไฟล์ CSV UTF-8 มี BOM | — |

```ts
import { z } from 'zod';
export const SKU_RE = /^[\p{L}\p{M}\p{N} ._\-/#]{1,64}$/u;
const Sku = z.string().trim().regex(SKU_RE);
const Minor = z.number().int().min(0).max(10_000_000_000);
const Stock = z.number().int().min(0).max(1_000_000).nullable();
export const VariantBody = z.object({
  name: z.string().trim().min(1).max(100),
  sku: Sku.nullable().default(null),
  priceMinor: Minor.nullable().default(null),
  stock: Stock.default(null),
  active: z.boolean().default(true),
}).strict();
export const CreateItemBody = z.object({
  sku: Sku, kind: z.enum(['product', 'service']),
  name: z.string().trim().min(1).max(255), nameEn: z.string().trim().min(1).max(255).nullable().default(null),
  description: z.string().max(2000).nullable().default(null), category: z.string().trim().min(1).max(100).nullable().default(null),
  priceMinor: Minor, unit: z.string().trim().min(1).max(30).default('ชิ้น'),
  stock: Stock.default(null), shippable: z.boolean().default(true),
  durationMinutes: z.number().int().min(5).max(1440).nullable().default(null),
  active: z.boolean().default(true),
  variants: z.array(VariantBody).max(50).default([]),
}).strict().superRefine((b, ctx) => {
  if (b.kind === 'service' && b.durationMinutes == null) ctx.addIssue({ code: 'custom', path: ['durationMinutes'], message: 'required for service' });
  if (b.kind === 'product' && b.durationMinutes != null) ctx.addIssue({ code: 'custom', path: ['durationMinutes'], message: 'only for service' });
  if (b.kind === 'service' && (b.stock != null || b.shippable)) ctx.addIssue({ code: 'custom', path: ['kind'], message: 'service has no stock and is not shippable' });
});
export const PatchItemBody = z.object({
  expectedVersion: z.number().int().min(1),
  sku: Sku.optional(), name: z.string().trim().min(1).max(255).optional(), nameEn: z.string().trim().min(1).max(255).nullable().optional(),
  description: z.string().max(2000).nullable().optional(), category: z.string().trim().min(1).max(100).nullable().optional(),
  priceMinor: Minor.optional(), unit: z.string().trim().min(1).max(30).optional(), stock: Stock.optional(),
  shippable: z.boolean().optional(), durationMinutes: z.number().int().min(5).max(1440).nullable().optional(), active: z.boolean().optional(),
}).strict().refine((b) => Object.keys(b).length > 1, 'nothing to change');          // kind เปลี่ยนไม่ได้
export const VariantPatchBody = VariantBody.partial().extend({ expectedVersion: z.number().int().min(1) }).strict();
export const StockBody = z.object({
  expectedVersion: z.number().int().min(1),
  delta: z.number().int().min(-1_000_000).max(1_000_000).optional(),
  setTo: z.number().int().min(0).max(1_000_000).optional(),
  variantId: z.string().uuid().nullable().default(null),
  note: z.string().max(300).optional(),
}).strict().refine((b) => (b.delta == null) !== (b.setTo == null), 'give exactly one of delta / setTo');
export const ListQuery = z.object({
  q: z.string().trim().max(120).optional(), category: z.string().trim().max(100).optional(),
  kind: z.enum(['product', 'service']).optional(),
  status: z.enum(['active', 'inactive', 'all']).default('all'),
  cursor: z.string().max(200).optional(), limit: z.coerce.number().int().min(1).max(100).default(30),
});
```

```ts
// shared/features/catalog/types.ts  (CatalogItem / CatalogVariant / ProductRef / PriceQuote = contracts.ts)
export interface CatalogImage { id: string; fileId: string; position: number; alt: string; flagged: boolean; url: string }
export interface CatalogItemAdminDetail extends CatalogItem {            // CatalogItem จาก contracts.ts
  description: string | null; category: string | null; unit: string;
  images: CatalogImage[]; source: 'manual' | 'import' | 'seed'; sourceRef: string | null;
  priceChangedAt: string; createdAt: string; updatedAt: string;
  variants: (CatalogVariant & { active: boolean; position: number; effectivePriceMinor: number; effectiveStock: number | null })[];
}
export interface CatalogItemRow {
  id: string; sku: string; kind: 'product' | 'service'; name: string; nameEn: string | null; category: string | null;
  priceMinor: number; hasVariantPrices: boolean; minPriceMinor: number; unit: string; stock: number | null;
  active: boolean; version: number; imageUrl: string | null; variantCount: number; updatedAt: string;
}
export interface PriceHistoryRow { version: number; variantId: string | null; oldPriceMinor: number | null; newPriceMinor: number; changedAt: string; changedByName: string | null }
export interface StockMoveRow { variantId: string | null; delta: number; stockAfter: number; reason: string; note: string | null; changedAt: string; changedByName: string | null }
```

cursor ของ `/items` = base64url(JSON `{ n, id }`) โดย `n = lower(name)` (keyset: `(lower(name), id) > ($n, $id)`) · `export.csv` คอลัมน์ (ลำดับตายตัว, ส่วนหัวภาษาอังกฤษเพื่อให้ F06 อ่านกลับได้): `sku,kind,name,name_en,category,price_baht,unit,stock,shippable,duration_minutes,active,description,variants` โดย `price_baht` = `priceMinor / 100` ทศนิยมสองตำแหน่ง (สร้างด้วยการหารจำนวนเต็ม `${Math.trunc(m/100)}.${pad2(m%100)}` ไม่ใช้ float) · `variants` = `name|sku|price_baht|stock` คั่นแต่ละตัวด้วย `;` (ว่าง = null) · `shippable`/`active` = `true|false` · เซลล์ข้อความที่ขึ้นต้นด้วย `= + - @` หรือแท็บ ถูกใส่ `'` นำหน้า (กัน formula injection) · escape ตาม RFC 4180 · ขึ้นบรรทัดใหม่ `\r\n` · BOM `U+FEFF` นำหน้า (Excel อ่านไทยถูก)

## 4. Service functions และ contracts

ไฟล์ภายใน: `service.ts` (public) · `repo.ts` · `price.ts` (quote) · `refs.ts` (resolve `ProductRef`) · `sku.ts` (normalize + registry) · `variants.ts` · `stock.ts` · `images.ts` · `csv.ts` · `import.ts` · `money.ts` (`parsePriceToMinor`, `formatBaht`) · `routes.ts` · `seed.ts` · `*.test.ts`

Contract เดิม (ต้องตรง `contracts.ts` ทุกตัวอักษร):

```ts
export declare function getProduct(businessId: string, ref: ProductRef): Promise<CatalogItem | null>;
export declare function getPrice(businessId: string, input: ProductRef & { variantId?: string | null; quantity?: number }): Promise<PriceQuote>;
// ProductRef = { itemId: string } | { sku: string } | { name: string }
```

พฤติกรรม `getProduct`:
- `{ itemId }` ตรงตัว · `{ sku }` เทียบ `sku_key` (NFKC + lowercase + ช่องว่างเดียว) กับทะเบียน (`catalog_sku_registry`) → ถ้า SKU เป็นของ **variant** คืนสินค้าแม่ · `{ name }`: ตรงทั้งชื่อก่อน (เทียบ `name` หรือ `name_en` แบบ NFKC lowercase ช่องว่างเดียว) → ไม่ตรง ใช้สินค้าที่ `name`/`name_en` **มีคำนั้นเป็นส่วนหนึ่ง** (substring) ถ้าเจอ **ตัวเดียว** คืนตัวนั้น · เจอหลายตัวหรือไม่เจอ → `null` (ห้ามเดา)
- คืน `null` เมื่อ: ไม่พบ, ร้านอื่น, `active = false`, `deleted_at` ไม่ว่าง · `variants` ในผลมีเฉพาะ variant ที่ `active` (เรียงตาม `position`) · `CatalogItem.stock` = stock ระดับสินค้า (`null` = ไม่นับ) · `version` = `catalog_items.version` · `priceMinor` เป็น number

พฤติกรรม `getPrice`:
1. `ref` หา item ด้วยกติกา `getProduct` (ไม่พบ/inactive/ร้านอื่น → `AppError('NOT_FOUND')`)
2. `quantity` default 1 ต้องเป็นจำนวนเต็มบวก ≤ 10,000 (`Number.isInteger(q) && q >= 1 && q <= 10000`) มิฉะนั้น `AppError('VALIDATION_ERROR', …, { details:{ field:'quantity' } })` · `'2'` (string), `1.5`, `0`, `-1`, `NaN` → VALIDATION_ERROR
3. variant: ถ้าให้ `variantId` ต้องเป็น variant ที่ `active` ของ item นี้ ไม่งั้น `NOT_FOUND` · ถ้าไม่ให้ `variantId` แต่ `ref` เป็น `{ sku }` ของ variant → ใช้ variant นั้นโดยอัตโนมัติ · ไม่มี variant ที่เกี่ยวข้อง → ระดับสินค้า (ราคาและสต็อกของสินค้า)
4. `unitPriceMinor` = `variant.price_minor ?? item.price_minor` · `available` = `variant.stock ?? item.stock` (ระดับ variant ที่ stock เป็น null ใช้สต็อกของสินค้า) · `null` = ไม่นับ (บริการ)
5. `soldOut = available !== null && available < quantity` (stock 0 → true สำหรับ quantity 1 ขึ้นไป) · ไม่ throw (R4) · `subtotalMinor = unitPriceMinor × quantity` เลขจำนวนเต็ม (ไม่มี float) · `currency:'THB'` · `version` = `item.version` · `sku` = SKU ของ variant (ถ้ามีและตรง) หรือ SKU ของสินค้า · `name` = ชื่อสินค้า (+ ` — ` + ชื่อ variant ถ้ามี variant) · ไม่รวมค่าส่ง
6. `variantId` ใน `PriceQuote` = id ที่ใช้จริง หรือ `null`

### Contract additions

ลีดรวมวางใน `contracts.ts` ส่วน catalog (ต่อจาก `getPrice`):

```ts
/** @owner F08 catalog · B1 · MANDATORY (agreed with B2 F10 list_products, C1 F39 ACP feed + MCP search_catalog, A2 F22)
 *  Customer-facing listing: ONLY active, not-deleted items of THIS business (never inactive, never another tenant).
 *  query   = every whitespace-separated word must match (case-insensitive, NFKC) name, nameEn, an item/variant SKU or category (substring).
 *  category = exact (case-insensitive) match. maxPriceMinor = item price <= max OR any active variant price <= max.
 *  inStockOnly = stock is null OR stock > 0 (services always pass). limit default 20, max 100 (> 100 → 100; < 1 or not an integer → VALIDATION_ERROR).
 *  Sorted by name (case-insensitive) then id. cursor is opaque (from a previous nextCursor); a malformed cursor → VALIDATION_ERROR.
 *  Items carry active variants only. No price visibility policy here: callers (F10) hide prices per answerPolicy.
 *  @fake filters SEED.catalog of that business by name / nameEn / sku substring, maxPriceMinor, inStockOnly (stock === null || stock > 0);
 *        category is ignored (SEED has none); sorted by name; cursor = String(offset); limit as above. */
export declare function listCatalogItems(
  businessId: string,
  opts?: { query?: string; category?: string; maxPriceMinor?: number; inStockOnly?: boolean; limit?: number; cursor?: string },
): Promise<Page<CatalogItem>>;

/** Extra fields for feeds, cards and pricing pages. CatalogItem stays the lean contract type. */
export interface CatalogItemDetail extends CatalogItem {
  description: string | null;
  category: string | null;
  /** Sale unit label, e.g. 'ชิ้น', 'ชุด', 'ครั้ง'. */
  unit: string;
  /** In display order (first = primary). fileId = core `files.id`; the public URL is the consumer's job (F39 builds it from PUBLIC_BASE_URL). */
  images: { fileId: string; alt: string }[];
  variants: (CatalogVariant & { effectivePriceMinor: number; effectiveStock: number | null })[];
}
/** @owner F08 catalog · B1 · consumers: C1 F39 (feed), A2 F22
 *  Active items only, unknown / other-tenant / inactive ids silently skipped. ≤ 100 ids (more → VALIDATION_ERROR). Order = input order.
 *  @fake SEED.catalog rows by id, description null, category null, unit 'ชิ้น', images []. */
export declare function getCatalogItemDetails(businessId: string, itemIds: string[]): Promise<CatalogItemDetail[]>;

/** @owner F08 catalog · B1 · consumer: A2 F13 (decrement on order confirm, give back on cancel). OPTIONAL for A2: if never called, stock stays manual.
 *  One atomic UPDATE (stock = stock + delta, never below 0): result below 0 → AppError('SOLD_OUT'); stock null (not tracked) → no-op returning
 *  { stockAfter: null, applied: false }. variantId given → that variant's stock (variant stock null → falls back to the item stock).
 *  Bumps catalog_items.version (so open proposals re-check). Idempotent per (refType, refId, itemId, variantId): a repeat returns the first result with applied:false.
 *  Audit catalog.stock.adjust. Unknown / inactive-is-allowed (a cancelled order may return stock to an inactive item) / other tenant → NOT_FOUND.
 *  @fake { stockAfter: null, applied: false, version: 1 }. */
export declare function adjustCatalogStock(input: {
  businessId: string; itemId: string; variantId?: string | null; delta: number;
  reason: 'order' | 'order_cancel' | 'correction'; refType: string; refId: string; actorUserId: string | null;
}): Promise<{ stockAfter: number | null; applied: boolean; version: number }>;

/** Draft rows from a CSV / sheet. Price is already integer satang (use parsePriceToMinor on text). */
export interface CatalogImportRow {
  rowNo: number;
  sku: string;
  kind?: 'product' | 'service';
  name: string;
  nameEn?: string | null;
  description?: string | null;
  category?: string | null;
  priceMinor: number;
  unit?: string;
  stock?: number | null;
  shippable?: boolean;
  durationMinutes?: number | null;
  variants?: { name: string; sku?: string | null; priceMinor?: number | null; stock?: number | null }[];
}
export interface CatalogImportError { rowNo: number; sku: string | null; code: 'sku_invalid' | 'sku_taken' | 'sku_duplicate_in_file' | 'name_required' | 'price_invalid' | 'stock_invalid' | 'duration_required' | 'variant_invalid' | 'variant_limit' | 'sku_exists'; message: string }
export interface CatalogImportResult {
  applied: boolean;                     // false when dryRun, or onError 'abort' with errors
  created: number; updated: number; skipped: number;
  errors: CatalogImportError[];
  items: { rowNo: number; sku: string; itemId: string | null; action: 'created' | 'updated' | 'skipped' | 'error' }[];
}
/** @owner F08 catalog · B1 · consumer: B3 (F06 knowledge-import). Max 500 rows (more → VALIDATION_ERROR).
 *  New SKUs are created as DRAFTS: active = false, source 'import', sourceRef = importId — the shop reviews them in /catalog and turns them on.
 *  Existing SKU: mode 'create_only' (default) → skipped with error code 'sku_exists'; mode 'update_existing' → price / name / stock / unit / nameEn /
 *  description / category / shippable are updated in place (active flag untouched), version bumped, audit catalog.item.update + catalog.price.change.
 *  Validation is the same as POST /items. dryRun: validate and report only, writes nothing. onError 'abort' (default) = all or nothing;
 *  'skip_row' = apply valid rows, report the rest. One transaction. Audit catalog.import (counts only).
 *  @fake validates nothing, writes nothing: { applied: !dryRun, created: rows.length, updated: 0, skipped: 0, errors: [], items: fake ids }. */
export declare function importCatalogItems(input: {
  businessId: string; actorUserId: string | null; importId: string; rows: CatalogImportRow[];
  mode?: 'create_only' | 'update_existing'; onError?: 'abort' | 'skip_row'; dryRun?: boolean;
}): Promise<CatalogImportResult>;

/** Shared pure helper (shared/features/catalog/money.ts) for CSV / sheet text. Accepts Thai or Arabic digits, "฿", "บาท", "THB", spaces,
 *  thousands commas and at most 2 decimals: '1,490' → 149000 · '฿1,490.50' → 149050 · '๑๔๙๐ บาท' → 149000 · '12.5' → 1250.
 *  Returns null for empty, negative, > 100,000,000 baht, 3+ decimals, or anything else. A number input is treated as BAHT and must have ≤ 2 decimals. */
export declare function parsePriceToMinor(input: string | number): number | null;
```

หมายเหตุ: `CatalogItemDetail` ของ contracts เป็นชนิดที่เบากว่าตัวที่ใช้ในหน้าเว็บ (`CatalogItemDetail` ของ `shared/features/catalog/types.ts` §3 ที่มีฟิลด์เพิ่ม) · ตั้งชื่อชนิดฝั่งเว็บเป็น `CatalogItemAdminDetail` เพื่อไม่ชนกัน และให้ `routes.ts` ใช้ชนิดนั้น (ผู้ตรวจ: ลีดตอนวาง contract ให้เปลี่ยนชื่อใน `types.ts` ของ §3)

ฟังก์ชันภายในของ `service.ts` (ไม่ใช่ contract ข้าม lane): `listItems`, `getItemAdmin` (รวม inactive), `createItem`, `patchItem`, `deleteItem`, `addVariant`, `patchVariant`, `deleteVariant`, `adjustStockManual`, `addImage`, `removeImage`, `reorderImages`, `getHistory`, `listCategories`, `checkSku`, `exportCsv` · ทุกตัวรับ `businessId` กรองด้วยค่านั้น · ของร้านอื่น = `NOT_FOUND`

## 5. Algorithms

ค่าคงที่ใน `config.ts`: `SKU_MAX=64` · `NAME_MAX=255` · `VARIANTS_MAX=50` · `PRICE_MAX_MINOR=10_000_000_000` · `QTY_MAX=10_000` · `STOCK_MAX=1_000_000` · `IMAGES_MAX=5` · `IMAGE_MAX_MB=8` · `LIST_LIMIT_DEFAULT=20` · `LIST_LIMIT_MAX=100` · `IMPORT_ROWS_MAX=500` · `DETAILS_IDS_MAX=100`

### 5.1 Normalize และ SKU (`sku.ts`)

- `key(s) = s.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()` ใช้กับ SKU, ชื่อ variant (`name_key`) และการเทียบชื่อ
- SKU ผ่าน `SKU_RE` (ตัวอักษรทุกภาษารวมสระ/วรรณยุกต์ไทย, ตัวเลข, ช่องว่าง, `. _ - / #`, 1–64) หลัง trim · ไม่ผ่าน → `VALIDATION_ERROR` `details.code='sku_invalid'`
- ความไม่ซ้ำ: ก่อน INSERT/UPDATE SKU ของสินค้า/variant ใช้ `INSERT INTO catalog_sku_registry … ` ในทรานแซกชันเดียวกับแถวหลัก ถ้าชน primary key (`23505`) → `VALIDATION_ERROR` `details.code='sku_taken'` พร้อม `details.itemId` ของเจ้าของ SKU เดิม · แก้ SKU = ลบ-แล้วเพิ่มแถวในทะเบียน · ลบสินค้า (soft) ลบแถวทะเบียนของสินค้าและ variant ทั้งหมด (SKU ว่างให้ใช้ใหม่)
- SKU ของ variant เป็น `null` ได้ (ไม่เข้าทะเบียน)

### 5.2 สร้าง/แก้สินค้า (`service.ts`)

1. ตรวจ zod (§3) + กฎ kind: `service` ⇒ `stock = null`, `shippable = false`, `durationMinutes` จำเป็น · `product` ⇒ `durationMinutes = null`
2. ทรานแซกชัน: INSERT `catalog_items` (`version = 1`, `price_changed_at = now()`, `source = 'manual'`) → ทะเบียน SKU → INSERT variants (`position` = ลำดับที่ส่ง, `name_key`) + ทะเบียน SKU ของ variant → INSERT `catalog_price_history` (old null, new = ราคา, version 1) → COMMIT · audit `catalog.item.create`
3. `PATCH` (CAS): `UPDATE catalog_items SET … , version = version + 1, updated_at = now(), updated_by = $u WHERE id = $1 AND business_id = $2 AND version = $expected AND deleted_at IS NULL RETURNING *` · 0 แถว: ไม่พบ/ร้านอื่น → `NOT_FOUND` · มี แต่ version ไม่ตรง → `VERSION_CONFLICT` (details `{ currentVersion }`) · **ไม่เพิ่ม version** ถ้าฟิลด์ที่เปลี่ยนมีเฉพาะ `description`/`category` (ใช้ UPDATE แยกที่ไม่ยุ่ง version แต่ยังเช็ก `expectedVersion`) · ไม่มีฟิลด์ใดเปลี่ยนจริง → คืนเดิม ไม่เพิ่ม version
4. ราคาเปลี่ยน → INSERT `catalog_price_history` + `price_changed_at = now()` + audit `catalog.price.change` (details: `oldPriceMinor`, `newPriceMinor`, `version`) · อย่างอื่นเปลี่ยน → audit `catalog.item.update` (ชื่อฟิลด์เท่านั้น)
5. `stock` ที่ตั้งผ่าน PATCH (เช่นแก้เป็นตัวเลขใหม่) บันทึก `catalog_stock_moves` (`reason:'manual'`, `delta` = ใหม่ − เก่า, `ref` null)
6. ลบ (`product.delete`): soft delete — `deleted_at = now()`, `active = false`, `version + 1`, ลบแถวทะเบียน SKU · ซ้ำ → 200 ผลเดิม · รูป/ไฟล์ไม่ถูกลบ · audit `catalog.item.delete`

### 5.3 Variants (`variants.ts`)

เพิ่ม/แก้/ลบ variant ทุกครั้ง: CAS ที่ `catalog_items.version` (`expectedVersion`) แล้ว `version + 1` · ชื่อ variant ไม่ซ้ำในสินค้า (เทียบ `name_key` → `variant_name_taken`) · สูงสุด 50 (เกิน → `variant_limit`) · ราคา variant `null` = ใช้ราคาของสินค้า · ลบ variant = ลบจริง (ใบเสนอเก่าที่อ้าง variant นั้นจะ `NOT_FOUND` ตอนตรวจซ้ำ และ version ต่างกันอยู่แล้ว) · `position` กำหนดลำดับแสดง · ราคา variant เปลี่ยน → `catalog_price_history` มี `variant_id`

### 5.4 สต็อก (`stock.ts`)

- `POST /items/:id/stock` (`delta` หรือ `setTo`, ตัวเลขใดตัวหนึ่ง) → CAS ที่ version → คำนวณค่าใหม่ในคำสั่งเดียว `UPDATE … SET stock = GREATEST(0, stock + $d)`? **ไม่ใช้ GREATEST เงียบ ๆ**: ถ้า `stock + delta < 0` → `VALIDATION_ERROR` `details.code='stock_negative'` (UI ปรับตัวเลข) · สินค้าที่ `stock IS NULL` (ไม่นับ) + `delta` → `VALIDATION_ERROR` `stock_not_tracked`; `setTo` ตั้งเป็นเริ่มนับได้ · variant (`variantId`): ปรับ `catalog_variants.stock` (ถ้า `null` ให้ `setTo` เริ่มนับของ variant ได้)
- `adjustCatalogStock` (contract): `UPDATE catalog_items SET stock = stock + $d, version = version + 1 WHERE id=$1 AND business_id=$2 AND stock IS NOT NULL AND stock + $d >= 0 RETURNING stock, version` · `rowCount=0` → ตรวจแยก: ไม่พบ `NOT_FOUND` · `stock IS NULL` → `{ stockAfter:null, applied:false }` · ติดลบ → `SOLD_OUT` · idempotency: INSERT `catalog_stock_moves` ก่อนด้วย unique index `(business_id, ref_type, ref_id, item_id, coalesce(variant_id, zero))` ถ้าชน → คืนผลเดิม `applied:false` ไม่แตะ stock (ทั้งหมดในทรานแซกชันเดียว)
- ต้นฉบับ "ไม่มี reservation": สต็อกลดเมื่อ F13 เรียก `adjustCatalogStock` ตอนยืนยันออเดอร์ (A2 ตัดสินใจ) · ผลคือ `getPrice` ของใบเสนอเก่าที่ version เปลี่ยนจะถูกตรวจซ้ำ

### 5.5 ค้นหาและรายการ (`listCatalogItems`, `/items`)

1. `query` แยกคำด้วยช่องว่าง (ตัดที่ 8 คำ) · แต่ละคำต้องตรงอย่างน้อยหนึ่งฟิลด์: `lower(name)`, `lower(name_en)`, `lower(category)` (ILIKE `%คำ%` โดย escape `\ % _`) หรือ SKU ในทะเบียน (`sku_key ILIKE %คำ%`) ของสินค้าหรือ variant · ทุกคำต้องตรง (AND) · คำที่ว่างหลัง normalize ถูกข้าม
2. `category` เทียบ `lower(category) = key($category)` · `maxPriceMinor`: `price_minor <= $m OR EXISTS (variant active ราคาไม่ null ≤ $m)` · `inStockOnly`: `stock IS NULL OR stock > 0` (สินค้าที่ตัวมีสต็อกแต่ทุก variant ถูกตั้ง 0 ยังถือว่ามีของ: ความละเอียดนี้ปล่อยไว้ให้ `getPrice` ตัดสิน)
3. `listCatalogItems` (customer-facing): เฉพาะ `active AND deleted_at IS NULL` · variants เฉพาะ `active` · เรียง `lower(name), id` · keyset: `(lower(name), id) > ($cn, $cid)` · ดึง `limit + 1` เพื่อรู้ `nextCursor`
4. `/items` (หน้าเจ้าของ) ใช้ `status` กรอง active/inactive/all (ไม่รวม deleted) · แถวมี `minPriceMinor` = ต่ำสุดของราคาสินค้าและ variant ที่ active (ใช้แสดง "เริ่มที่") และ `hasVariantPrices`
5. **ค้นข้ามภาษา (ลูกค้าถามอังกฤษ ชื่อสินค้าไทย และกลับกัน):** (ก) SKU ไม่ขึ้นกับภาษา: `a-game-01`, `A-GAME-01` ตรงเสมอ · (ข) ชื่อ: ทั้ง `getProduct({ name })` และ `query` ของ `listCatalogItems` เทียบ **ทั้ง `name` และ `name_en`** จึงหาเจอด้วยภาษาไหนก็ได้เมื่อร้านกรอกครบสองช่อง (seed กรอกครบทั้ง 6 รายการ) · (ค) สินค้าที่ร้านไม่ได้กรอก `name_en`: คำค้นอังกฤษจะไม่ตรงชื่อไทย ฟังก์ชันนี้ **ไม่แปลและไม่เรียกโมเดล** → F10 เป็นผู้แก้ทาง: โมเดลค้นซ้ำหนึ่งครั้งด้วยคำที่แปลเป็นภาษาของร้าน แล้วถ้ายังไม่เจอเรียก `list_products` ด้วย `query: null` เพื่อเลือกจากรายการ (F10 §6.1 ข้อ 5, §6.3) · (ง) เพื่อให้กรณี (ค) เกิดน้อย หน้า `/catalog` เตือนเจ้าของ: ช่อง "ชื่อภาษาอังกฤษ" มีข้อความช่วย `form.nameEnHelp` และเหนือตารางมี `Alert` ระดับ info `list.missingNameEn` เมื่อมีสินค้า active ที่ `name_en IS NULL` (นับจาก `GET /items` ฟิลด์ `missingNameEn: number` ใน response) · (จ) ชื่อที่ส่งออกให้ลูกค้า: ผู้เรียก (F10, F13, F17/F18 การ์ด) เลือก `nameEn ?? name` เมื่อภาษาลูกค้าเป็นอังกฤษ F08 คืนทั้งสองฟิลด์เสมอ ไม่เลือกให้
5. `getCatalogItemDetails(businessId, ids)`: `WHERE id = ANY($ids) AND business_id=$1 AND active AND deleted_at IS NULL` + รูป (เรียง `position`) + variants active · เรียงผลตามลำดับ `ids` ที่ส่งมา

### 5.6 รูปภาพ (`images.ts`)

`POST /items/:id/images`: mime `image/png|jpeg|webp` และ ≤ 8 MB (ตรวจที่ route ผ่าน `upload`, core ตรวจ `UPLOAD_MAX_MB` ซ้ำ) · สูงสุด 5 รูปต่อสินค้า (`image_limit`) · `storage.save({ businessId, uploadedBy, purpose:'catalog', originalName, mimeType, bytes, allowedMime })` → `model.moderate({ usage:{ featureId:'F08', purpose:'moderate', businessId }, images:[{ uploadRef: fileId }] })` (ล้ม/ไม่ผ่านการตรวจ → `flagged` ตามผล, provider error → `flagged=false` ไม่บล็อก) → INSERT แถว (`position` = ท้ายสุด; ถ้าเป็นรูปแรก = 0) · `PUT …/images/order` รับรายการ `imageIds` ครบทุกรูปของสินค้า (ขาด/เกิน/ซ้ำ → `VALIDATION_ERROR`) แล้วเขียน `position` ใหม่ · ลบรูป = ลบแถว (ไม่ลบไฟล์ของ core) · รูปไม่เปลี่ยน `version` · `GET …/file` ตรวจ `business_id` ของแถว แล้ว `storage.read(fileId, { businessId })` ส่ง `inline`

### 5.7 `importCatalogItems` (`import.ts`)

1. จำนวนแถว 1–500 (เกิน/ว่าง = `VALIDATION_ERROR`)
2. ตรวจทีละแถว (เหมือน POST `/items` แต่ `kind` default `product`, `unit` default `'ชิ้น'`, `stock` default null, `shippable` default `kind==='product'`): `sku_invalid`, `name_required`, `price_invalid` (ไม่ใช่จำนวนเต็ม 0–1e10), `stock_invalid`, `duration_required`, `variant_invalid`, `variant_limit` · SKU ซ้ำกันในไฟล์เดียว (เทียบ `key`) → `sku_duplicate_in_file` ทั้งแถวหลัง
3. ตรวจกับ DB (ครั้งเดียว: `SELECT sku_key, item_id FROM catalog_sku_registry WHERE business_id=$1 AND sku_key = ANY($keys)`): SKU มีอยู่ → `mode='create_only'` ให้ error `sku_exists` (แถวนั้น `skipped`); `mode='update_existing'` และ SKU เป็นของ **สินค้า** (ไม่ใช่ variant) → ปรับ (action `updated`); เป็น SKU ของ variant → `sku_taken`
4. `dryRun` หรือ (`onError='abort'` และมี error) → ไม่เขียนอะไร `applied:false`
5. ไม่งั้นทรานแซกชันเดียว: สร้างสินค้าใหม่ด้วย `active=false`, `source='import'`, `source_ref=importId`, `version=1` + ทะเบียน SKU + variants + price history · อัปเดตสินค้าเดิม (CAS ภายในคำสั่งเดียวไม่ต้อง expectedVersion เพราะอยู่ในทรานแซกชันเดียวกับการอ่านแบบ `FOR UPDATE`) เพิ่ม `version` ถ้ามีฟิลด์ที่ต้อง bump เปลี่ยน · `applied:true`
6. audit `catalog.import` (details: `importId`, ตัวเลขสรุป, ไม่มีเนื้อหาแถว) และ `catalog.price.change` ต่อสินค้าที่ราคาเปลี่ยน

### 5.8 `parsePriceToMinor(input)` (`money.ts`, ใช้ร่วมกับ F06)

1. `number`: ต้อง finite, ≥ 0, ทศนิยมไม่เกิน 2 ตำแหน่ง (เช็กด้วย `Math.round(n * 100) / 100 === n` ภายในความคลาดเคลื่อน 1e-9) → `Math.round(n * 100)` · มิฉะนั้น null
2. `string`: normalize NFKC → แปลงเลขไทย (`๐–๙` → `0–9`) → ตัดช่องว่าง/`฿`/`บาท`/`THB`/`baht`/`Baht` (ไม่สนตัวพิมพ์) → ลบ `,` ที่เป็นตัวคั่นหลักพัน (ต้องตรง `^\d{1,3}(,\d{3})*(\.\d{1,2})?$` หรือ `^\d+(\.\d{1,2})?$`) ไม่ตรง → null · แปลงเป็น minor ด้วยการแยกส่วนเต็ม/ทศนิยมเป็นสตริงแล้วคำนวณเลขจำนวนเต็ม (ห้ามใช้ float) · เกิน 100,000,000 บาท → null
3. ตัวอย่างที่ test ต้องได้: `'1,490'`→149000 · `'฿1,490.50'`→149050 · `'๑๔๙๐ บาท'`→149000 · `'12.5'`→1250 · `'0'`→0 · `'1.234'`→null · `'-5'`→null · `'1,49'`→null · `''`→null · `'abc'`→null · `'100000000.01'`→null · `1490`→149000 · `12.345`→null

### 5.9 หน้าจอเก็บเงินเป็นสตางค์

UI รับราคาเป็นบาทใน `TextField` แล้วแปลงด้วย `parsePriceToMinor` ก่อนส่ง · แสดงด้วย `formatMoney(minor)` ของ core · ห้ามคำนวณราคารวมฝั่งเว็บ (ราคารวมมาจาก F13/F10 เท่านั้น)

## 6. AI calls

ไม่มี chat/AI call ในฟีเจอร์นี้ ราคา/สต็อกคำนวณด้วยโค้ดจาก DB เท่านั้น (R4) ยกเว้น `model.moderate()` ของ core ตอนอัปโหลดรูป (`omni-moderation-latest`, ฟรี; purpose `moderate`, `featureId:'F08'`; fake: `flagged` เมื่อ text มี `[flag]` — รูปใน fake mode ไม่ติดธง) · ไม่มีการสกัดราคาด้วยโมเดล (ตัดออกจากขอบเขต)

## 7. UI

Routes (`pages.tsx`): `/catalog` `permission:'product.read'` `titleKey:'catalog:page.title'` → `CatalogListPage.tsx` · `/catalog/:itemId` → `CatalogEditPage.tsx` · เมนู `{ path:'/catalog', labelKey:'catalog:menu.title', group:'knowledge', icon:'Inventory2Outlined', order:30, permission:'product.read', searchTerms:['catalog','สินค้า','ราคา','สต็อก','บริการ','sku'] }`

`CatalogListPage`:
1. `PageHeader` + ปุ่ม "เพิ่มสินค้า/บริการ" (เฉพาะ `useCan('product.write')`) · ปุ่ม "ส่งออก CSV" (ลิงก์ไป `/export.csv`) · ช่องค้นหา (debounce 300 ms) · ตัวกรอง สถานะ (ทั้งหมด/ขายอยู่/ปิดขาย), ชนิด, หมวด (`GET /categories`)
2. `DataTable`: รูปย่อ, ชื่อ (+ ชื่ออังกฤษ), SKU, ราคา (`formatMoney`; ถ้า variant ราคาต่างกัน "เริ่มที่ ฿x"), หน่วย, คงเหลือ (ตัวเลข / "ไม่นับ" / "หมด" chip สีเตือน), สถานะ (`StatusChip` generic `active`/`inactive` + ป้ายร่างจากการนำเข้า), แก้ไขล่าสุด · แถวคลิก → หน้าแก้ · "โหลดเพิ่ม" เมื่อมี `nextCursor`
3. `FormDialog` เพิ่มสินค้า: SKU (ตรวจซ้ำเมื่อออกจากช่องผ่าน `/sku-check`), ชื่อ, ชนิด, ราคา (บาท), หน่วย, สต็อก (ช่องว่าง = ไม่นับ; บริการซ่อน), ระยะเวลา (นาที, เฉพาะบริการ), เปิดขาย (Switch ค่าเริ่มต้นเปิด) → `POST /items` → ไปหน้าแก้
4. states: loading, empty = `EmptyState` "ยังไม่มีสินค้า" + ปุ่มเพิ่ม, error = `EmptyState` + ลองใหม่

`CatalogEditPage`: 
1. หัว: ชื่อ + SKU + `StatusChip` · ปุ่ม "บันทึก" · "ลบ" (เฉพาะ `product.delete`, `ConfirmDialog danger`) · ป้าย `v<version>` และ "ราคาเปลี่ยนล่าสุด <formatDateTime>"
2. ฟอร์มหลัก: ชื่อ, ชื่ออังกฤษ, SKU, หมวด, หน่วย, ราคา (บาท), สต็อกปัจจุบัน (อ่านอย่างเดียว + ปุ่ม "ปรับสต็อก" เปิด dialog `delta`/`ตั้งเป็น` พร้อมหมายเหตุ), ส่งพัสดุได้, ระยะเวลา (บริการ), คำอธิบาย (ข้อความให้ AI อ่าน), เปิดขาย (Switch) · เปลี่ยนราคา → `ConfirmDialog` "ใบเสนอที่ลูกค้ากำลังพิจารณาอยู่จะถูกตรวจราคาใหม่" · `VERSION_CONFLICT` → Alert "มีคนแก้ไปแล้ว" + ปุ่ม "โหลดเวอร์ชันล่าสุด"
3. `SectionCard` ตัวเลือก (variants): ตาราง (ชื่อ, SKU, ราคา [ว่าง = ใช้ราคาสินค้า], สต็อก [ว่าง = ใช้ของสินค้า], เปิดใช้, ลบ) + `FormDialog` เพิ่ม/แก้ · แสดงข้อความ "ไม่มีตัวเลือก" เมื่อว่าง
4. `SectionCard` รูปภาพ: ปุ่มอัปโหลด (png/jpeg/webp ≤ 8 MB สูงสุด 5), รูปแรก = รูปหลัก, ลูกศรเลื่อนลำดับ, ลบ · ธง `flagged` แสดง Chip เตือน
5. `SectionCard` ประวัติ: แท็บราคา (เวอร์ชัน, เก่า → ใหม่, เวลา, ผู้แก้) และสต็อก
6. ผู้ไม่มี `product.write` เห็นทุกช่องอ่านอย่างเดียวและไม่มีปุ่มเขียน · ปุ่มบันทึก disabled เมื่อไม่มีการเปลี่ยนแปลง · เตือนก่อนออกเมื่อมีการแก้ที่ยังไม่บันทึก

i18n (namespace `catalog`):

| key | th | en |
|---|---|---|
| `menu.title` | สินค้าและบริการ | Products & services |
| `page.title` | สินค้าและบริการ | Products & services |
| `page.subtitle` | ราคาและจำนวนคงเหลือที่ AI ใช้ตอบลูกค้า มาจากหน้านี้เท่านั้น | Prices and stock the AI quotes come from this page only |
| `actions.add` | เพิ่มสินค้า/บริการ | Add product / service |
| `actions.export` | ส่งออก CSV | Export CSV |
| `actions.save` | บันทึก | Save |
| `actions.delete` | ลบ | Delete |
| `actions.adjustStock` | ปรับสต็อก | Adjust stock |
| `actions.addVariant` | เพิ่มตัวเลือก | Add option |
| `actions.upload` | อัปโหลดรูป | Upload image |
| `actions.reload` | โหลดเวอร์ชันล่าสุด | Load latest version |
| `actions.loadMore` | โหลดเพิ่ม | Load more |
| `filter.search` | ค้นหาชื่อ รหัส หรือหมวด | Search name, code or category |
| `filter.status` | สถานะ | Status |
| `filter.all` | ทั้งหมด | All |
| `filter.active` | ขายอยู่ | On sale |
| `filter.inactive` | ปิดขาย | Off sale |
| `filter.kind` | ชนิด | Type |
| `filter.category` | หมวด | Category |
| `kind.product` | สินค้า | Product |
| `kind.service` | บริการ | Service |
| `table.image` | รูป | Image |
| `table.name` | ชื่อ | Name |
| `table.sku` | รหัส (SKU) | SKU |
| `table.price` | ราคา | Price |
| `table.priceFrom` | เริ่มที่ {{price}} | From {{price}} |
| `table.unit` | หน่วย | Unit |
| `table.stock` | คงเหลือ | In stock |
| `table.status` | สถานะ | Status |
| `table.updated` | แก้ไขล่าสุด | Last edited |
| `stock.notTracked` | ไม่นับสต็อก | Not tracked |
| `stock.out` | หมด | Sold out |
| `badge.draft` | ร่างจากการนำเข้า | Imported draft |
| `form.sku` | รหัสสินค้า (SKU) | SKU |
| `form.skuHelp` | ตัวอักษร ตัวเลข และ . _ - / # ไม่เกิน 64 ตัว ห้ามซ้ำในร้าน | Letters, digits and . _ - / # up to 64 characters, unique in the shop |
| `form.name` | ชื่อ | Name |
| `form.nameEn` | ชื่อภาษาอังกฤษ | English name |
| `form.nameEnHelp` | ใส่ชื่ออังกฤษเพื่อให้ลูกค้าที่พิมพ์ภาษาอังกฤษค้นเจอ และ AI เรียกชื่อนี้เมื่อตอบภาษาอังกฤษ | Add an English name so customers writing in English can find this item; the AI uses it in English replies |
| `list.missingNameEn` | มี {{n}} รายการที่ยังไม่มีชื่อภาษาอังกฤษ ลูกค้าที่พิมพ์อังกฤษอาจค้นไม่เจอ | {{n}} items have no English name yet. Customers writing in English may not find them |
| `form.category` | หมวด | Category |
| `form.unit` | หน่วยขาย | Sale unit |
| `form.price` | ราคา (บาท) | Price (THB) |
| `form.stock` | จำนวนคงเหลือ | Quantity in stock |
| `form.stockHelp` | เว้นว่าง = ไม่นับสต็อก | Leave empty = not tracked |
| `form.shippable` | ส่งพัสดุได้ | Can be shipped |
| `form.duration` | ระยะเวลา (นาที) | Duration (minutes) |
| `form.description` | คำอธิบาย | Description |
| `form.descriptionHelp` | ข้อความให้ AI และลูกค้าอ่าน ไม่ใช้คำนวณราคา | Text for the AI and customers. Not used for pricing |
| `form.active` | เปิดขาย | On sale |
| `form.version` | เวอร์ชัน {{n}} | Version {{n}} |
| `form.priceChanged` | ราคาเปลี่ยนล่าสุด {{at}} | Price last changed {{at}} |
| `form.priceConfirmTitle` | เปลี่ยนราคา? | Change the price? |
| `form.priceConfirmMessage` | ใบเสนอที่ลูกค้ากำลังพิจารณาอยู่จะถูกตรวจราคาใหม่ก่อนยืนยัน | Open quotes will be re-checked against the new price before confirmation |
| `variants.title` | ตัวเลือก (ไซซ์ สี ฯลฯ) | Options (size, colour …) |
| `variants.empty` | ไม่มีตัวเลือก ใช้ราคาและสต็อกของสินค้า | No options. The product's price and stock apply |
| `variants.name` | ชื่อตัวเลือก | Option name |
| `variants.price` | ราคา (เว้นว่าง = ใช้ราคาสินค้า) | Price (empty = product price) |
| `variants.stock` | คงเหลือ (เว้นว่าง = ใช้ของสินค้า) | Stock (empty = product stock) |
| `variants.active` | เปิดใช้ | Enabled |
| `stockDialog.title` | ปรับสต็อก | Adjust stock |
| `stockDialog.delta` | เพิ่ม/ลด (ติดลบได้) | Add / remove (negative allowed) |
| `stockDialog.setTo` | ตั้งเป็น | Set to |
| `stockDialog.note` | หมายเหตุ | Note |
| `images.title` | รูปภาพ | Images |
| `images.primary` | รูปหลัก | Primary |
| `images.flagged` | ระบบตรวจพบว่ารูปอาจไม่เหมาะสม โปรดตรวจ | The check flagged this image. Please review it |
| `images.limit` | อัปโหลดได้สูงสุด 5 รูป | Up to 5 images |
| `history.title` | ประวัติ | History |
| `history.prices` | ราคา | Prices |
| `history.stock` | สต็อก | Stock |
| `error.skuTaken` | รหัสนี้ถูกใช้แล้ว | This code is already used |
| `error.skuInvalid` | รหัสไม่ถูกต้อง | Invalid code |
| `error.priceInvalid` | ราคาไม่ถูกต้อง (0–100,000,000 บาท ทศนิยมไม่เกิน 2 ตำแหน่ง) | Invalid price (0–100,000,000 THB, up to 2 decimals) |
| `error.stockNegative` | สต็อกติดลบไม่ได้ | Stock cannot go below zero |
| `error.conflict` | มีคนแก้ไขสินค้านี้ไปแล้ว | Someone else changed this item |
| `error.variantLimit` | ตัวเลือกได้สูงสุด 50 รายการ | Up to 50 options |
| `error.variantNameTaken` | มีตัวเลือกชื่อนี้แล้ว | An option with this name exists |
| `toast.saved` | บันทึกแล้ว | Saved |
| `toast.created` | เพิ่มสินค้าแล้ว | Product added |
| `toast.deleted` | ลบแล้ว | Deleted |
| `confirm.deleteTitle` | ลบสินค้านี้? | Delete this item? |
| `confirm.deleteMessage` | ลูกค้าจะไม่เห็นสินค้านี้อีก รหัสนี้จะนำกลับมาใช้ได้ | Customers will no longer see it. The code becomes reusable |
| `empty.title` | ยังไม่มีสินค้า | No products yet |
| `empty.description` | เพิ่มสินค้าหรือบริการเพื่อให้ AI ตอบราคาและจำนวนคงเหลือได้ | Add products or services so the AI can answer price and stock |

## 8. Jobs, schedules, events

| รายการ | ค่า |
|---|---|
| Job / Schedule | ไม่มี |
| Realtime | ไม่มี (หน้าเว็บรีโหลดเอง) |
| Audit | `catalog.item.create` · `.update` · `.delete` · `catalog.price.change` · `catalog.stock.adjust` · `catalog.variant.create` / `.update` / `.delete` · `catalog.image.add` / `.remove` · `catalog.import` (`targetType:'catalog_item'`, ราคาเก่า/ใหม่ใน details ได้ ไม่ใส่คำอธิบายยาว) |
| notify | ไม่มี |
| `model_usage` | featureId `F08`, purpose `moderate` (รูปเท่านั้น) |

## 9. Seed และ fixtures

`seed.ts` (`FeatureSeed`, `featureId:'F08'`, `dependsOn: ['core']`, idempotent ด้วย `ON CONFLICT DO NOTHING`) จาก `SEED.catalog` ตรง ๆ (id = `ctx.id(alias)`, `version` ตาม SEED):
- `catalog_items` 6 แถว: SKU/ชื่อ/ราคา/stock/shippable/duration ตาม SEED · เพิ่ม `nameEn` ตาม SEED · `unit`: `A-GAME-01` ชิ้น, `A-CARD-01` ชุด, `A-SOLD-01` ชิ้น, `A-SERVICE-01` ครั้ง, `B-KIT-01` ชุด, `B-SERVICE-01` ครั้ง · `category`: เกมกระดาน, การ์ด, เกมกระดาน, บริการ, อุปกรณ์, บริการ · `description` สั้น ๆ ภาษาไทยที่ไม่มีตัวเลขราคา · `source='seed'` · `active=true`
- `catalog_variants`: `var_a_game_std` (name `Standard`, price null, stock null) · ทะเบียน SKU ทั้ง 6 + price history แถวแรกของแต่ละสินค้า (version 1)
- **รูปสังเคราะห์สร้างด้วยโค้ด** (ไม่พึ่งไฟล์ภายนอก, ไม่มีข้อความจึงไม่พึ่งฟอนต์): สำหรับสินค้า (ไม่ใช่บริการ) ใช้ `sharp` สร้าง PNG 400×400 จาก SVG (พื้นสีที่ได้จาก hash ของ SKU + รูปทรงเรขาคณิตสามรูป) → `storage.save({ businessId, uploadedBy:null, purpose:'catalog-seed', … })` → แถว `catalog_item_images` (`alt` = ชื่อสินค้า) · ทำเฉพาะเมื่อสินค้ายังไม่มีรูป (idempotent) · ถ้า `storage.save` ล้ม ข้ามรูป (log) ไม่ทำให้ seed ล้ม
- `runDemo(ctx)`: เพิ่มสินค้าเดโมอีก 6 รายการสำหรับร้าน A (`A-DEMO-01`…`A-DEMO-06`, ราคา 4,900–89,000 สตางค์ผสม, หนึ่งรายการมี 3 variants ราคาต่างกัน, หนึ่งรายการ stock 1) ให้ตารางดูสมจริงตอนเดโม · `resetDemo(ctx)`: soft delete สินค้าที่ `source='manual'` ของร้าน A ที่สร้างหลังเวลา seed และสินค้า `A-DEMO-*` แล้ว restore ฟิลด์ของ 4 รายการ SEED เป็นค่า SEED (ราคา/stock/active/version = SEED) ผ่าน SQL ของ feature เอง

Fixtures ของ test (สร้างด้วยโค้ด `test-helpers.ts`): `makeItem(businessId, overrides)` ผ่าน `service.createItem` · `CLOCK_FIXTURE` · อ่านค่าอ้างอิงจาก `SEED_CHECKS` ตรง ๆ (ไม่ hard-code ซ้ำ)

## 10. Tests

Unit/service (DB test จริง, `MODEL_MODE=fake`):

| ไฟล์ | case |
|---|---|
| `money.test.ts` | ตัวอย่างทั้งหมดใน §5.8 ข้อ 3 · เลขไทย · ไม่ใช้ float (ตรวจ `'0.29'` → 29, `'1.15'` → 115, ไม่ใช่ 28/114) · `formatBaht` ตรงกับ `formatMoney` ของ core ที่ `149000` → `฿1,490` |
| `price.test.ts` | ตาม `SEED_CHECKS`: `getPrice(A, A-GAME-01 ×2)` subtotal 298000 · `A-CARD-01 ×2` subtotal 19800 · `B-KIT-01 ×1` subtotal 39000 · `A-SOLD-01` `soldOut:true` `available:0` ไม่ throw · `A-GAME-01 ×6` (stock 5) `soldOut:true available:5` · บริการ `available:null soldOut:false` · quantity `0`, `-1`, `1.5`, `'2'`, `NaN`, `10001` = `VALIDATION_ERROR` · item ไม่พบ/ร้านอื่น (`B-KIT-01` จาก A) = `NOT_FOUND` · variant ของสินค้าอื่น = `NOT_FOUND` · `{ sku:<variant sku> }` เลือก variant อัตโนมัติ · ราคา variant `null` ใช้ราคาสินค้า, stock variant `null` ใช้ของสินค้า · inactive = `NOT_FOUND` · ผลทุกตัวเลขเป็น integer (`Number.isInteger`) |
| `refs.test.ts` | `getProduct`: itemId · sku ไม่สนตัวพิมพ์/ช่องว่างซ้ำ/NFKC (`a-game-01`, ` A-GAME-01 `, `Ａ-ＧＡＭＥ-０１`) · name ตรงทั้งชื่อ (`ชุดการ์ดตัวอย่าง Demo Cards`, `demo cards card set`) · name บางส่วนที่ตรงตัวเดียว (`Demo Quest`) · กำกวม (`Demo`) = `null` · `{ sku:'B-KIT-01' }` จาก A = `null` · inactive/deleted = `null` · variants ใน `getProduct` เฉพาะ active |
| `version.test.ts` | แก้ราคา A-GAME-01 เป็น 159000 → version 1 → 2, `getPrice` ได้ 159000 และ `version 2` · แก้ `description`/`category` อย่างเดียวไม่เพิ่ม version · เพิ่ม/แก้/ลบ variant เพิ่ม version หนึ่งครั้งต่อคำสั่ง · `adjustCatalogStock` เพิ่ม version · `expectedVersion` เก่า = `VERSION_CONFLICT` · สองคำขอแข่งกัน (Promise.all) ผ่านหนึ่ง conflict หนึ่ง · สร้าง quote (version 1) แล้วแก้ราคา: version ใหม่ต่างจาก quote เดิมแน่นอน |
| `sku.test.ts` | ซ้ำ (ไม่สนตัวพิมพ์) = `sku_taken` พร้อม `details.itemId` · SKU ของ variant ชนกับ SKU สินค้า = `sku_taken` · แก้ SKU แล้ว SKU เก่าว่าง · ลบสินค้าแล้ว SKU ใช้ใหม่ได้ · ตัวอักษรไทย/เครื่องหมายที่อนุญาตผ่าน, `<`, `;`, อีโมจิ, 65 ตัว = `sku_invalid` · race: สร้างพร้อมกัน 2 คำขอ SKU เดียวกัน ผ่านหนึ่ง |
| `variants.test.ts` | ชื่อซ้ำ (`Large  Red` vs `large red`) = `variant_name_taken` · 51 ตัว = `variant_limit` · ราคา/สต็อก null ทำงานตาม §4 · ลบ variant แล้ว `getPrice` ด้วย variantId เดิม = `NOT_FOUND` |
| `stock.test.ts` | delta ติดลบเกินสต็อก = `stock_negative` · `setTo` · สินค้าไม่นับสต็อก + delta = `stock_not_tracked` · `adjustCatalogStock` ติดลบ = `SOLD_OUT`, stock null → `applied:false`, ซ้ำ ref เดิม = ผลเดิม `applied:false` และ stock ไม่เปลี่ยน, ตัดพร้อมกัน 10 คำขอ stock 5 → สำเร็จ 5 ไม่ติดลบ · stock move บันทึกครบ |
| `list.test.ts` | `listCatalogItems` เฉพาะ active ของร้านนั้น · query หลายคำ AND ข้ามชื่อ/ชื่ออังกฤษ/SKU/category/SKU ของ variant · `category` ตรง · `maxPriceMinor` (รวม variant ราคาถูก) · `inStockOnly` (A-SOLD-01 ไม่ติด, บริการติด) · limit 1 + cursor ไล่ครบไม่ซ้ำ · limit 101 → 100 · limit 0/1.5 = `VALIDATION_ERROR` · cursor เสีย = `VALIDATION_ERROR` · `getCatalogItemAdminDetails` เรียงตาม ids ข้าม inactive/ร้านอื่น · >100 ids = `VALIDATION_ERROR` |
| `import.test.ts` | แถวใหม่ → ร่าง `active=false` `source='import'` ไม่โผล่ใน `listCatalogItems` · `dryRun` ไม่เขียน · `abort` + 1 error = ไม่เขียนเลย `applied:false` · `skip_row` เขียนเฉพาะที่ผ่าน · SKU ซ้ำในไฟล์ · `sku_exists` (create_only) · `update_existing` ปรับราคาแล้ว version +1 และ history/audit · 501 แถว = `VALIDATION_ERROR` · ผลรวม created+updated+skipped ตรงจำนวนแถว |
| `csv.test.ts` | export: BOM, header ตายตัว, `149000` → `1490.00`, `9900` → `99.00`, ข้อความไทยมีจุลภาค/ขึ้นบรรทัดใหม่/อัญประกาศ escape ถูก, ข้อความขึ้นต้น `=cmd` ถูกใส่ `'` นำหน้า, variants `name|sku|price|stock;…` · อ่านกลับด้วยตัวแยก CSV (`csv-parse`) ได้ค่าเดิม (round-trip ราคา) |
| `images.test.ts` | อัปโหลด 5 รูปผ่าน, รูปที่ 6 = `image_limit` · mime ผิด = 400 · เรียงลำดับใหม่ต้องครบทุก id · รูปแรกเป็นหลัก · `flagged` ตามผล moderate (fake `[flag]` ใน alt ไม่ตรวจ: ทดสอบด้วย mock) · ไม่เพิ่ม version · อ่านไฟล์ของร้านอื่น = 404 |
| `tenant.test.ts` | ทุกฟังก์ชันของ `service.ts` กับ item/variant/image ของร้าน B จาก A = `NOT_FOUND` · list ไม่เห็นของ B · SKU เดียวกันใช้ได้ทั้งสองร้าน (ทะเบียนแยกตาม `business_id`) |
| `seed.test.ts` | seed ครบ 6 + variant + ทะเบียน + history + รูปของสินค้า 4 ตัว (บริการไม่มีรูป) · รันซ้ำไม่ซ้ำแถว/รูป · ค่าตรง `SEED_CHECKS` |
| `routes.test.ts` (supertest) | permission: staff A (`product.read`) GET ได้ แต่ POST/PATCH/DELETE/stock/images = 403 · ลบต้อง `product.delete` · zod: ราคาทศนิยม/ติดลบ/>1e10 = 400, บริการไม่มี duration = 400, `kind` ใน PATCH = 400 (strict) · `GET /sku-check` · `DELETE` ซ้ำ = 200 · `export.csv` ได้ `text/csv` พร้อม `Content-Disposition` |

Playwright smoke `web/src/features/catalog/e2e/catalog.smoke.spec.ts` (production-safe: SKU `E2E-<ts>` ด้วย `e2eMarker()` ลบตอนจบ):
1. `ownerPage` เปิด `/catalog` → เห็น `เกมตัวอย่าง Demo Quest` ราคา `฿1,490` และ `A-SOLD-01` ป้าย "หมด"
2. เพิ่มสินค้า SKU `E2E-<ts>` ชื่อ `e2e สินค้าทดสอบ` ราคา `1,490` สต็อก `5` → ไปหน้าแก้ → เห็น `v1`
3. แก้ราคาเป็น `1,590` → ยืนยัน → เห็น `v2` และ "ราคาเปลี่ยนล่าสุด" · `api.get('/catalog/items/<id>')` ได้ `priceMinor 159000`, `version 2`
4. เพิ่ม variant `ไซซ์ L` ไม่ใส่ราคา → ตารางแสดง "ใช้ราคาสินค้า"
5. ลองเพิ่มสินค้า SKU ซ้ำ → เห็นข้อความ "รหัสนี้ถูกใช้แล้ว"
6. (ถ้า F09/F10 ของจริงพร้อม ไม่งั้น `test.skip` พร้อมเหตุผล) เปิด `/demo-chat` ถาม `E2E-<ts> ราคาเท่าไหร่` → คำตอบมี `1,590`
7. ลบสินค้า → หายจากรายการ · `api.delete` ซ้ำ = 200

## 11. Acceptance: R ตาม D6

- [ ] migration ขึ้นบน production · route placeholder ถูกลบ · UI จริง (list/เพิ่ม/แก้/variants/รูป/สต็อก/ประวัติ/ส่งออก) ต่อ API และ DB จริง
- [ ] SPEC F08 + `SEED_CHECKS`: ราคาเป็น integer สตางค์จาก DB (`A-GAME-01 ×2` = 298000, `A-CARD-01 ×2` = 19800, `B-KIT-01` = 39000) · quantity ต้องเป็นจำนวนเต็มบวก · variant ผิดถูกปฏิเสธ (`NOT_FOUND`) · หมดขาย = `soldOut:true` (ไม่ throw) · แก้ราคา = `version` เปลี่ยนทันทีและ `getPrice` คืนราคาใหม่
- [ ] contract ที่ผู้อื่นใช้เป็นของจริงและตรง `contracts.ts`: `getProduct`, `getPrice`, `listCatalogItems`, `getCatalogItemDetails`, `adjustCatalogStock`, `importCatalogItems`, `parsePriceToMinor` → DONE `TO:B2 TO:A2` (S1) · `TO:C1` (listCatalogItems/getCatalogItemDetails) · `TO:B3` (import/parse)
- [ ] ร้านอื่น/inactive/deleted = `null` หรือ `NOT_FOUND` ตามสัญญา (test + ลองบน production) · `listCatalogItems` ไม่คืน inactive
- [ ] SKU ไม่ซ้ำต่อร้านรวม variant (ตรวจ race) · ลบแล้วใช้ SKU ใหม่ได้
- [ ] staff A (ไม่มี `product.write`) แก้ราคาไม่ได้ (UI ซ่อน + API 403)
- [ ] รูปสินค้า: อัปโหลดผ่าน core `storage` + moderate + แสดงในรายการ · รูป seed สร้างด้วยโค้ด
- [ ] CSV: ส่งออกได้และอ่านกลับด้วย `csv-parse` · `importCatalogItems` เขียนเป็นร่างปิดการขาย (ทดสอบกับ B3 จริงเมื่อ F06 DONE)
- [ ] audit ครบ §8 · loading/empty/error · i18n th/en · Playwright smoke ผ่านบน production
- **S/A**: ไม่มี provider ภายนอก ไม่มี S · ถ้า `listCatalogItems`/`getCatalogItemDetails` ยังเป็น fake = รายงาน F08 เป็น **A** ไม่ใช่ R · รูป/CSV/ประวัติ/variants เป็นบรรทัดย่อยใน EVIDENCE (A/U ตามจริง) ไม่ลด status ถ้า S1, S2a และ S2b ครบ · ไม่ถึง R ตอน 15:30 → ซ่อน `/catalog` (แต่ F08 อยู่บน golden path ต้องแก้ให้ได้ก่อน)

## 12. Security และ privacy

- Tenant: `business_id` มาจาก `getBusiness()` เท่านั้น ทุก SQL มี `AND business_id = $n` · ทะเบียน SKU แยกตามร้าน (PK มี `business_id`) · `itemId`, `variantId`, `imageId` จาก path ตรวจกับ `business_id` ก่อนเสมอ · `GET …/file` ตรวจเจ้าของแถวก่อนอ่านไฟล์
- Permission: อ่าน `product.read` · เขียนทุกอย่าง `product.write` (ราคา สต็อก variant รูป) · ลบ `product.delete`
- ราคาและสต็อก: ผ่าน zod และ CHECK ใน DB สองชั้น · `price_minor` ไม่รับ float · `getPrice` ไม่เชื่อ `quantity` ที่ไม่ใช่ integer · model output ไม่เคยเข้ามาที่นี่
- ข้อความ `description`/`name` เป็นข้อมูล ไม่ใช่คำสั่ง: F10 ส่งให้โมเดลเป็นผล tool ที่ระบุว่าเป็นข้อมูล (F10 §6) · F08 ไม่ตีความ
- CSV export กัน formula injection (§3) · อัปโหลดรูป allow-list mime + ขนาด · ไม่มี endpoint สาธารณะ
- ห้าม log: คำอธิบายสินค้าเต็ม, ไฟล์รูป · audit ใส่ราคาเก่า/ใหม่ได้ (ไม่ใช่ข้อมูลส่วนบุคคล)
- Rate limit: อัปโหลดรูป `assertRateLimit({ key:'catalog:upload:'+businessId, limit: 30, windowSeconds: 60 })` · import ผ่าน F06 ตามงบของ job

## 13. Edge cases

| กรณี | ผลที่ต้องได้ |
|---|---|
| ราคา 0 บาท | อนุญาต (`priceMinor 0`) · F10 ตอบ "ฟรี/0 บาท" ตามข้อมูล |
| ราคา `100,000,000.01` / 3 ทศนิยม / ติดลบ | UI/`parsePriceToMinor` null → ฟอร์มแจ้ง `price_invalid` · API: zod 400 |
| quantity ทศนิยม/สตริง/0/ติดลบ | `VALIDATION_ERROR` ไม่ปัดเศษ ไม่แปลง |
| สินค้ามี variant แต่ถามด้วยชื่อสินค้าเฉยๆ | ราคาและสต็อกระดับสินค้า (F10 ถามลูกค้าเลือกตัวเลือกเองผ่าน tool `get_price` ถ้าต้องการ) |
| variant ราคาต่างกัน, UI รายการ | "เริ่มที่ ฿x" ใช้ราคาต่ำสุดของสินค้าและ variant ที่ active |
| variant ที่ stock ตั้ง 0 แต่สินค้าไม่นับสต็อก | `getPrice({ variantId })` ได้ `available:0` `soldOut:true` (variant ชนะ) |
| สต็อกลดจากออเดอร์ขณะที่เจ้าของแก้ราคา | แต่ละคำสั่ง CAS ที่ version: ผู้แก้ที่ช้าได้ `VERSION_CONFLICT` ต้องโหลดใหม่ |
| ลบสินค้าที่มีใบเสนอ/ออเดอร์เก่าอ้างอยู่ | soft delete เก็บแถว (ประวัติอ้างได้) · `getPrice` ใหม่ = `NOT_FOUND` |
| นำเข้า SKU ที่เป็น SKU ของ variant | `sku_taken` |
| นำเข้าแถวราคา `"1,490"` ที่ F06 แปลงผิด | F06 ต้องใช้ `parsePriceToMinor` ก่อนเรียก · F08 รับเฉพาะ integer minor |
| ชื่อ variant ต่างกันแค่วรรค/ตัวพิมพ์ | ซ้ำ (`name_key`) |
| `getProduct({ name })` ที่ตรงชื่อหลายตัวเมื่อเทียบแบบ exact (ชื่อซ้ำกันสองสินค้า) | `null` (ห้ามเดา) · UI ไม่ห้ามชื่อซ้ำ (SKU เป็นตัวแยก) แต่เตือนเมื่อมีชื่อซ้ำ |
| บริการที่ตั้ง stock | zod/CHECK ปฏิเสธ (`service has no stock`) |
| เปลี่ยน `kind` ภายหลัง | ไม่รองรับ (strict schema ปฏิเสธ) ให้ลบแล้วสร้างใหม่ |
| ร้านเปิดหน้า `/catalog` พร้อมกันสองแท็บ แก้คนละฟิลด์ | แท็บที่สองได้ `VERSION_CONFLICT` · ฟอร์มไม่ทับของอีกฝั่ง |
| รูป `flagged` | แสดงเตือน ไม่บล็อกการใช้งาน |

## 14. Build order (slices ≤ 45 นาที)

| Slice | เวลา | ส่งมอบ |
|---|---|---|
| **S1 contract slice (A2/B2/C1 รอ)** | 25 | migration · `sku.ts`, `refs.ts`, `price.ts`, `money.ts` · `getProduct`, `getPrice`, `listCatalogItems`, `getCatalogItemAdminDetails` ของจริงแทน fake · `seed.ts` (ไม่รวมรูป) · types ใน shared · tests price/refs/list/seed/tenant · ลบ placeholder route (เพิ่ม route read ขั้นต่ำ `GET /items`) · merge ทันที → DONE `TO:B2 TO:A2 TO:C1` |
| **S2a เพิ่ม/แก้สินค้าจากหน้าเว็บ (gate ขั้น 1 พึ่ง slice นี้)** | 20 | `POST /items`, `PATCH /items/:id` พร้อม version/CAS · `CatalogListPage` (ตารางอย่างเดียว) + `CatalogEditPage` เฉพาะฟอร์มหลัก: ชื่อไทย, ชื่ออังกฤษ, SKU, ราคา, สถานะ · i18n th/en ของสองหน้านี้ · tests version/routes ของสองเส้นนี้ · ทำหลัง F07 S1 เป้า merge **13:00** |
| **S2b CRUD ที่เหลือ (หลัง gate)** | 20 | `DELETE /items`, `/sku-check`, `/categories`, price history · ส่วนที่เหลือของฟอร์มและตัวกรองในหน้า list · tests sku/routes ที่เหลือ |
| **S3 variants + สต็อก + รูป + CSV + import** | 45 | `variants.ts`, `stock.ts` (`adjustCatalogStock`), `images.ts` + seed รูป, `csv.ts` (export), `import.ts` (`importCatalogItems`, `parsePriceToMinor` ใน shared) · UI ส่วนที่เหลือ · tests variants/stock/images/csv/import · Playwright smoke · EVIDENCE.md → DONE `TO:B3` (import/parse) `TO:A2` (adjustCatalogStock) |

ลำดับ (ค่าเริ่มต้นของ lane B1 ก่อน gate, 21 พ.ย.): F05 S1 → **F08 S1** → F07 S1 → **F08 S2a** · S2b และ S3 หลัง gate · S1 ต้องไม่รอใคร (ไม่พึ่ง F05/F07): ถ้า F05 S1 ติด ทำ F08 S1 ก่อนได้ทันที · เหตุผล: สี่ slice เดิม (40 + 45 + 25 + 40 = 150 นาที) เกินเวลา 130 นาทีก่อน gate และ A2/B2/C1 รอราคาจริงก่อน 12:00

## 15. UNCONFIRMED และสิ่งที่ต้องตรวจในวันงาน

เพิ่ม 21 พ.ย. (สองภาษา): สินค้าที่ไม่มี `name_en` พึ่งการค้นซ้ำด้วยคำแปลของ F10 (§5.5 ข้อ 5 ค) ซึ่งยังไม่เคยทดสอบกับโมเดลจริง · ตรวจ: สร้างสินค้าทดสอบชื่อไทยล้วนบน production แล้วถาม Demo Chat เป็นอังกฤษหนึ่งครั้ง จดผลใน EVIDENCE.md · test ที่ต้องมีใน `service.test.ts`: `getProduct(A, { name: 'demo quest board game' })` → A-GAME-01 (ตรง `name_en`) · `listCatalogItems(A, { query: 'card set' })` → A-CARD-01 · `listCatalogItems(A, { query: 'การ์ด' })` → A-CARD-01 · `listCatalogItems(A, { query: 'board game ตัวอย่าง' })` → A-GAME-01 (คำหนึ่งตรง `name_en` อีกคำตรง `name`) · smoke มี case `renders in English` (หน้า `/catalog` หัว `Catalog`)

1. A2 (F13) จะเรียก `adjustCatalogStock` ตอนยืนยันออเดอร์หรือไม่: ถามด้วย `NEED TO:A2` ตอน DONE S3 · ถ้าไม่ สต็อกเป็นแบบแก้มือ และ F13 ต้องไม่เคลมว่า "ตัดสต็อกแล้ว" · ถ้าเรียก ต้องส่ง `refType:'order'`, `refId` = order id เพื่อให้ idempotent
2. ชนิด `CatalogItemDetail` (contract, เบา) กับ `CatalogItemAdminDetail` (หน้าเว็บ, shared/features/catalog/types.ts) ต้องไม่ชื่อซ้ำ · ตรวจ `npm run typecheck` หลังลีดวาง contract
3. URL สาธารณะของรูป (F39 ACP feed ต้องการ): F08 ให้เฉพาะ `fileId` · route ไฟล์สาธารณะเป็นเรื่องของ core/C1 (ตรวจกับ C1 ว่ามี `GET /files/:id/public` หรือไม่; ไม่มี = F39 ใช้ route ของตัวเองที่ตรวจว่า fileId อยู่ในสินค้า active)
4. pg driver คืน `bigint` เป็น string: ตรวจว่า `db.query` ของ core ไม่แปลงเป็น number เอง (ถ้าแปลง ให้ตรวจ `isSafeInteger` ซ้ำและปรับ `repo.ts`)
5. การจับ `23505` (unique violation) จาก `db.query` ของ core: ตรวจรูปแบบ error (ดู F05 §15 ข้อ 1) · สำรอง = เช็กทะเบียนด้วย SELECT ก่อนเขียนแล้วจับ race ด้วย try/catch ทั่วไป
6. `sharp` สร้าง PNG จาก SVG บน Render (Docker slim): ตรวจว่า librsvg ทำงาน (shape ล้วนไม่ต้องใช้ฟอนต์) · ล้ม = seed ข้ามรูป ไม่ทำให้ seed ล้ม (จดใน EVIDENCE)
7. กติกา "ชื่อ variant ไม่ซ้ำ" และ `ProductRef` ชื่อ: ชื่อสินค้าซ้ำกันสองตัวทำให้ `getProduct({ name })` เป็น `null` · ตรวจกับ B2 ว่า F10 ใช้ SKU เป็นหลัก (F10 spec §5.6: resolve `sku` ก่อน แล้ว `name`)
8. ขนาดจริงของสต็อก/ราคาเป็นค่าของเรา (ราคา ≤ 100,000,000 บาท, สต็อก ≤ 1,000,000, รูป ≤ 8 MB) มาจาก know-how เดิมและกันค่าเพี้ยน ไม่ใช่ขีดจำกัดของ provider
