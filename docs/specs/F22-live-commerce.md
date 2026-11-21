# F22 live-commerce — รหัสสินค้าไลฟ์ ตะกร้าจากแชต และหน้าจอนำเสนอเต็มจอ

| | |
|---|---|
| Lane / คน | **A2** / **A** · ลำดับ 3 ใน lane (F13 → F14 → F22) |
| Tier / เป้า | **P2** (ย้ายจาก P1 เมื่อ 21 พ.ย. ตามข้อเสนอ Endless) · เป้า **R** สำหรับรหัสสินค้า, note, sold-out, หน้านำเสนอ, ตะกร้าจากแชต (ในแอป) · คอมเมนต์ไลฟ์จริงจาก Meta = **A** (รอ F21) ใช้ตัวจำลองที่ติดป้าย sandbox |
| Timebox | 45–90 นาที |
| เริ่มเมื่อ | หัวหน้าโพสต์ `LEAD: OPEN P2` และ F13 slice 1 merge แล้ว (ส่วนรหัสสินค้า/หน้านำเสนอเริ่มได้ก่อน F13) |
| พึ่ง | F08 `getProduct`, `getPrice`, `getCatalogItemDetails`, `listCatalogItems` · F13 `createStaffQuote` (ผ่าน `service.ts`), `registerOrderHook` · F09 `saveMessage`, `getConversation`, `getHistory` · core (`db`, `publish`, `audit`, `sendToCustomer` ผ่าน F13) |
| ให้ | `findProductCodes(businessId, text, opts?)` และ `addToLiveCart(input)` (export ใน `service.ts` สำหรับ C2 F21 comments และ B2 F10; ไม่ใช่ contract: ผู้ใช้ต้องโพสต์ `NEED TO:A2` ก่อนผูก) |
| ใช้ | ดู §4 |
| โฟลเดอร์ | `server/src/features/live-commerce/` · `shared/features/live-commerce/types.ts` · `web/src/features/live-commerce/` |
| Web path | `/product-codes` (จัดการรหัส) · `/live` (ควบคุมไลฟ์ + ตะกร้า) · `/live/present` (เต็มจอ layout `bare`) |

อ่าน: `contracts.ts` (FEATURES F22 webPaths, ProductRef, CatalogItemDetail, `layout: 'bare'`, MessageOrigin `comment`) · F08 spec §4 (`getCatalogItemDetails`, `getPrice`) · F13 spec §4 (`createStaffQuote`, hook `confirmed`) · F09 spec (`saveMessage`, origin `comment`) · [COOKBOOK](../COOKBOOK.md)

## 1. เป้าหมายและ user stories

ทำไมมี: ร้านที่ขายผ่านไลฟ์สดแจกรหัสสินค้า ("พิมพ์ A12 2 ชิ้น") ลูกค้าพิมพ์รหัสในคอมเมนต์หรือแชต คนขายต้องไล่อ่านและสรุปออเดอร์เอง ฟีเจอร์นี้ให้ (1) ทะเบียนรหัส → สินค้า/ตัวเลือก พร้อมโน้ต (2) ตัวอ่านรหัสจากข้อความ (3) ตะกร้าต่อลูกค้า ที่แปลงเป็นใบสรุปของ F13 ให้ลูกค้ากดยืนยัน (4) หน้าจอเต็มจอสำหรับถ่ายทอดสด แสดงสินค้า ราคา และ "หมดแล้ว" จากข้อมูลชุดเดียวกับที่ใช้ตอบแชต

ผู้ใช้: เจ้าของ/พนักงานร้านไลฟ์ · ลูกค้า (พิมพ์รหัสในแชต) · C2 F21 (คอมเมนต์ไลฟ์ในอนาคต) · B2 F10 (ใช้ `findProductCodes` ช่วยให้ AI เข้าใจรหัส)

User stories:
1. เจ้าของกำหนดรหัส `A12` ให้ "เกมตัวอย่าง Demo Quest (Standard)" ใส่โน้ต "เหลือไม่เยอะ" · แก้โน้ตจากหน้านำเสนอ · ย้ายรหัสไปสินค้าอื่น (โน้ตเก่าไม่ถูกเขียนทับคนอื่น: ถ้าคนอื่นย้ายไปก่อน ได้ 409)
2. ลูกค้าพิมพ์ "A12x2" หรือ "เอา A12 2 ชิ้น" ในแชต → พนักงานเห็นแผงข้างแชต "พบรหัส A12 ×2 (2 × 1,490.00)" กด "สร้างใบสรุปให้ลูกค้า" → การ์ดสรุปไปที่ลูกค้า ลูกค้ากดยืนยัน → ออเดอร์
3. รหัสของสินค้าหมด (A99) ขึ้น "หมดแล้ว" ทุกที่ และไม่ถูกใส่ในใบสรุป
4. พนักงานเปิดหน้านำเสนอเต็มจอบนจอที่สอง แสดงรหัสใหญ่ ชื่อ ราคา โน้ต เปลี่ยนรหัสด้วยปุ่มลูกศรได้ · ราคา/หมดสต็อกตรงกับที่แชตตอบ
5. (ทดสอบ) พนักงานจำลองคอมเมนต์ของผู้ชมในหน้า `/live` เพื่อดูตะกร้าและใบสรุปทำงาน (ติดป้าย "จำลอง")

นอกขอบเขต: ดึงคอมเมนต์จากไลฟ์ Facebook/Instagram จริง (F21 · C2), ตัวสร้างรหัสอัตโนมัติแบบ odometer (มีแค่ปุ่ม "เสนอรหัสถัดไป"), ส่งคอมเมนต์ตอบกลับในไลฟ์, รูปสินค้าในหน้านำเสนอ (ใช้ตัวอักษรอย่างเดียว), ตะกร้าที่ลูกค้าแก้เองในแชต, ส่วนลด, การชำระเงิน (F14)

## 2. Data model

`server/src/features/live-commerce/migrations/001_live_commerce.sql`:

```sql
-- dependsOn: core, orders
CREATE TABLE product_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  code text NOT NULL CHECK (char_length(code) BETWEEN 1 AND 20),      -- ตามที่พิมพ์ (แสดงผล)
  code_key text NOT NULL,                                              -- normalizeCodeKey(code) (§5.1)
  item_id uuid NOT NULL,                                               -- catalog id (ไม่มี FK ข้ามฟีเจอร์)
  variant_id uuid,                                                     -- null = ทั้งสินค้า
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 200 AND note !~ E'[\\n\\r]'),
  version int NOT NULL DEFAULT 1,
  assigned_at timestamptz NOT NULL DEFAULT now(),                      -- เปลี่ยนเมื่อย้ายเป้าหมาย
  created_by uuid REFERENCES users(id),
  updated_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, code_key)
);
CREATE INDEX product_codes_item ON product_codes (business_id, item_id);

CREATE TABLE live_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  state text NOT NULL DEFAULT 'live' CHECK (state IN ('live','ended')),
  featured_code_key text,                                              -- รหัสที่หน้านำเสนอกำลังโชว์ (null = ยังไม่เลือก)
  version int NOT NULL DEFAULT 1,
  started_by uuid REFERENCES users(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);
CREATE UNIQUE INDEX live_sessions_one_live ON live_sessions (business_id) WHERE state = 'live';

CREATE TABLE live_carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  live_session_id uuid REFERENCES live_sessions(id) ON DELETE SET NULL,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','proposed','ordered','expired','closed')),
  proposal_id uuid,                                                    -- order_proposals.id ล่าสุดที่ออกจากตะกร้านี้
  version int NOT NULL DEFAULT 1,
  proposed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- หนึ่งตะกร้าที่ยังใช้งานต่อหนึ่งแชต
CREATE UNIQUE INDEX live_carts_one_active ON live_carts (business_id, conversation_id) WHERE state IN ('open','proposed');
CREATE INDEX live_carts_list ON live_carts (business_id, state, updated_at DESC);

CREATE TABLE live_cart_items (
  cart_id uuid NOT NULL REFERENCES live_carts(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  code_key text NOT NULL,
  code text NOT NULL,
  item_id uuid NOT NULL,
  variant_id uuid,
  quantity int NOT NULL CHECK (quantity BETWEEN 1 AND 99),
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cart_id, code_key)
);

-- ข้อความที่ถูกอ่านรหัสไปแล้ว (กันนับซ้ำเมื่อสแกนซ้ำ/เรียกซ้ำ)
CREATE TABLE live_consumed_messages (
  message_id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  cart_id uuid NOT NULL REFERENCES live_carts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

กฎ: ไม่แก้ตาราง core/orders/catalog · ทุก query กรอง `business_id` · ชื่อ/ราคา/สต็อก **ไม่เก็บ** (อ่านผ่าน F08 ทุกครั้ง) · ลบรหัส = ลบแถวจริง (ไม่มี soft delete: ประวัติอยู่ใน audit) · รหัสที่ชี้สินค้าถูกลบ/ปิดไม่ถูกลบอัตโนมัติ แสดงสถานะ `unavailable`

State machine ของ `live_carts.state`:

| from | event | to |
|---|---|---|
| (ไม่มี) | พบรหัสในข้อความ (`from-chat` / `addToLiveCart` / จำลอง) | open |
| open | ออกใบสรุป (`propose`) สำเร็จ | proposed (`proposal_id`) |
| proposed | พนักงานแก้ตะกร้า/สแกนเพิ่ม | open (`proposal_id` เดิมถูกแทนที่เมื่อออกใบใหม่) |
| proposed | ลูกค้ายืนยัน (hook `confirmed` ของ F13 ที่ `order.proposalId` ตรง) | ordered |
| open / proposed | ไม่มีความเคลื่อนไหว 24 ชั่วโมง (sweep) | expired |
| open / proposed | พนักงานปิด | closed |

## 3. API endpoints

ทุก path ใต้ `/api/v1` · `defineFeatureRoutes({ featureId: 'F22', slug: 'live-commerce' })` · permission: อ่าน = `product.read` · เขียนรหัส/ไลฟ์ = `product.write` · ตะกร้า/ออกใบสรุป = `orders.write` (+ ตรวจ `chat.reply` ใน handler)

| Method | Path | auth | permission | Request | Response | Errors |
|---|---|---|---|---|---|---|
| GET | `/businesses/:businessId/product-codes` | business | `product.read` | `{ q? }` | `{ items: CodeFact[] }` | — |
| POST | `/businesses/:businessId/product-codes` | business | `product.write` | `CreateCodeBody` | `CodeFact` | VALIDATION_ERROR (`details.reason`: `bad_code` `code_taken`), NOT_FOUND (สินค้า/ตัวเลือก) |
| PATCH | `/businesses/:businessId/product-codes/:codeId` | business | `product.write` | `PatchNoteBody` | `CodeFact` | NOT_FOUND, VERSION_CONFLICT |
| PUT | `/businesses/:businessId/product-codes/:codeId/target` | business | `product.write` | `MoveCodeBody` | `CodeFact` | NOT_FOUND, VERSION_CONFLICT |
| DELETE | `/businesses/:businessId/product-codes/:codeId` | business | `product.write` | query `expectedVersion` | no_content | NOT_FOUND, VERSION_CONFLICT |
| POST | `/businesses/:businessId/product-codes/bulk` | business | `product.write` | `BulkBody` | `BulkResult` | VALIDATION_ERROR |
| POST | `/businesses/:businessId/product-codes/suggest` | business | `product.read` | `{ prefix: string }` | `{ code: string }` | VALIDATION_ERROR |
| GET | `/businesses/:businessId/live/presentation` | business | `product.read` | — | `PresentationView` | — |
| GET | `/businesses/:businessId/live/sessions/current` | business | `product.read` | — | `LiveSessionView \| null` | — |
| POST | `/businesses/:businessId/live/sessions` | business | `product.write` | `{ title }` | `LiveSessionView` | VALIDATION_ERROR, POLICY_BLOCKED (`already_live`) |
| POST | `/businesses/:businessId/live/sessions/:sessionId/end` | business | `product.write` | `{}` | `LiveSessionView` | NOT_FOUND |
| PUT | `/businesses/:businessId/live/featured` | business | `product.write` | `FeaturedBody` | `PresentationView` | VERSION_CONFLICT, NOT_FOUND, POLICY_BLOCKED (`no_live_session`) |
| GET | `/businesses/:businessId/live/chat-scan` | business | `orders.read` | `{ conversationId }` | `ChatScanView` | NOT_FOUND |
| POST | `/businesses/:businessId/live/carts/from-chat` | business | `orders.write` | `FromChatBody` | `CartView` | NOT_FOUND, POLICY_BLOCKED (`no_codes`) |
| GET | `/businesses/:businessId/live/carts` | business | `orders.read` | `{ state?, conversationId? }` | `{ items: CartView[] }` | — |
| PUT | `/businesses/:businessId/live/carts/:cartId/items/:codeKey` | business | `orders.write` | `PatchCartItemBody` | `CartView` | NOT_FOUND, VERSION_CONFLICT, VALIDATION_ERROR |
| DELETE | `/businesses/:businessId/live/carts/:cartId/items/:codeKey` | business | `orders.write` | query `expectedVersion` | `CartView` | NOT_FOUND, VERSION_CONFLICT |
| POST | `/businesses/:businessId/live/carts/:cartId/propose` | business | `orders.write` | `ProposeBody` | `{ cart: CartView; proposalId: string; totalMinor: number; messageId: string }` | NOT_FOUND, VERSION_CONFLICT, POLICY_BLOCKED (`cart_has_blocked_items` `empty_cart`), SOLD_OUT, VALIDATION_ERROR |
| POST | `/businesses/:businessId/live/carts/:cartId/close` | business | `orders.write` | `{ expectedVersion }` | `CartView` | NOT_FOUND, VERSION_CONFLICT |
| POST | `/businesses/:businessId/live/comments/simulate` | business | `product.write` | `SimulateBody` | `{ cart: CartView \| null; matches: ProductCodeMatch[]; conversationId: string }` | VALIDATION_ERROR, RATE_LIMITED |

```ts
import { z } from 'zod';
const Uuid = z.string().uuid();
// 1–20 ตัว: ตัวแรก A–Z a–z 0–9 ก–ฮ · ตัวถัดไปเพิ่ม '-' ได้ · ไม่มีช่องว่าง
export const CODE_RE = /^[A-Za-z0-9ก-ฮ][A-Za-z0-9ก-ฮ-]{0,19}$/;
export const CreateCodeBody = z.object({
  code: z.string().trim().regex(CODE_RE), itemId: Uuid, variantId: Uuid.nullable().default(null),
  note: z.string().max(200).regex(/^[^\n\r]*$/).default(''),
}).strict();
export const PatchNoteBody = z.object({ expectedVersion: z.number().int().min(1), note: z.string().max(200).regex(/^[^\n\r]*$/) }).strict();
export const MoveCodeBody = z.object({ expectedVersion: z.number().int().min(1), itemId: Uuid, variantId: Uuid.nullable().default(null) }).strict();   // ย้ายแล้ว note = '' และ assigned_at = now()
export const BulkBody = z.object({
  rows: z.array(z.object({ code: z.string().trim().regex(CODE_RE), sku: z.string().trim().min(1).max(60), variantName: z.string().trim().max(80).optional(), note: z.string().max(200).regex(/^[^\n\r]*$/).default('') }).strict()).min(1).max(100),
  dryRun: z.boolean().default(false),
}).strict();
export const FeaturedBody = z.object({ expectedVersion: z.number().int().min(1), codeKey: z.string().max(40).nullable() }).strict();
export const FromChatBody = z.object({ conversationId: Uuid, messageIds: z.array(Uuid).max(10).optional() }).strict();   // ไม่ส่ง = ข้อความลูกค้า 10 ข้อความล่าสุดที่ยังไม่ถูกใช้
export const PatchCartItemBody = z.object({ expectedVersion: z.number().int().min(1), quantity: z.number().int().min(1).max(99).optional(), variantId: Uuid.nullable().optional() }).strict();
export const ProposeBody = z.object({ expectedVersion: z.number().int().min(1), deliveryMethod: z.enum(['shipping', 'pickup']) }).strict();
export const SimulateBody = z.object({ viewerName: z.string().trim().min(1).max(40), text: z.string().trim().min(1).max(500) }).strict();
```

```ts
// shared/features/live-commerce/types.ts
export interface CodeFact {
  id: string; code: string; codeKey: string; itemId: string; variantId: string | null; note: string; version: number; assignedAt: string;
  itemName: string | null; sku: string | null; variantName: string | null; unitPriceMinor: number | null;
  available: number | null;                                // null = ไม่นับสต็อก
  soldOut: boolean; status: 'ok' | 'sold_out' | 'unavailable' | 'variant_required';
}
export interface PresentationView { session: LiveSessionView | null; codes: CodeFact[]; featured: CodeFact | null; serverTime: string; factsVersion: string }
export interface LiveSessionView { id: string; title: string; state: 'live' | 'ended'; featuredCodeKey: string | null; version: number; startedAt: string; endedAt: string | null }
export interface ProductCodeMatch { code: string; codeKey: string; itemId: string; variantId: string | null; quantity: number; note: string; name: string | null; sku: string | null; unitPriceMinor: number | null; soldOut: boolean; needsVariant: boolean }
export interface ChatScanView { conversationId: string; matches: (ProductCodeMatch & { messageId: string })[]; blocked: { codeKey: string; reason: 'sold_out' | 'unavailable' | 'variant_required' }[]; cart: CartView | null }
export interface CartLineView { codeKey: string; code: string; itemId: string; variantId: string | null; quantity: number; name: string | null; sku: string | null; unitPriceMinor: number | null; lineTotalMinor: number | null; status: 'ok' | 'sold_out' | 'unavailable' | 'variant_required' }
export interface CartView { id: string; conversationId: string; customerName: string; state: 'open' | 'proposed' | 'ordered' | 'expired' | 'closed'; lines: CartLineView[]; subtotalMinor: number; version: number; proposalId: string | null; updatedAt: string; source: 'chat' | 'simulated' }
export interface BulkResult { applied: boolean; created: number; errors: { row: number; code: string; reason: 'bad_code' | 'code_taken' | 'sku_not_found' | 'variant_not_found' | 'ambiguous' }[] }
```

`factsVersion` = sha1 ของ `codes[].id:version` + ราคา/สต็อกที่อ่านมา (ให้หน้านำเสนอรู้ว่าเปลี่ยนโดยไม่ต้องเทียบทุกฟิลด์) · `source: 'simulated'` เมื่อ customer externalId ขึ้นต้น `live-sim:`

## 4. Service functions และ contracts

ไฟล์ภายใน: `service.ts` (public) · `config.ts` · `key.ts` · `parser.ts` · `facts.ts` · `codes.ts` · `carts.ts` · `sessions.ts` · `chat-scan.ts` · `hooks.ts` · `jobs.ts` · `repo.ts` · `routes.ts` · `seed.ts` · `*.test.ts`

### Contract additions

ไม่มี (F22 ไม่ให้ contract ข้าม lane ตามข้อตกลง D8; export ด้านล่างเป็นของ `service.ts` ที่ผู้ใช้ข้าม lane ต้องโพสต์ `NEED TO:A2`/`CHANGE` ก่อน — ถ้าลีดต้องการให้เป็น contract ให้วางตามบล็อกนี้):

```ts
/** @owner F22 live-commerce · A2 · consumers: C2 F21 comments, B2 F10 (not a cross-lane contract yet: coordinate with NEED TO:A2)
 *  Reads product codes in a customer message. Only codes registered for THIS business count. A code must stand alone (not inside a
 *  word: 'XA12', 'A12B' do not match 'A12'); a code containing Thai letters must be separated from Thai text by whitespace or punctuation.
 *  Quantity 1-99 may follow: 'A12x2', 'A12 2', 'A12 x 2', 'A12 2ชิ้น', 'A12*3'. At most opts.maxCodes (default 10; comments use 3) distinct codes,
 *  repeated codes add their quantities (cap 99). Codes whose item is deleted/inactive are skipped. resolve (default true) fills name / sku / price
 *  / soldOut from the catalog (never trust the text for prices). Never throws for unknown text: returns [].
 *  @fake [] */
export declare function findProductCodes(businessId: string, text: string, opts?: { maxCodes?: number; resolve?: boolean }): Promise<ProductCodeMatch[]>;
export declare function addToLiveCart(input: { businessId: string; conversationId: string; customerId: string; messageId: string; text: string; liveSessionId?: string | null; source?: 'chat' | 'comment' }): Promise<{ cart: CartView | null; matches: ProductCodeMatch[] }>;
```

ฟังก์ชันใน `service.ts`: `findProductCodes` · `addToLiveCart` · `listCodes` · `createCode` · `patchNote` · `moveCode` · `deleteCode` · `bulkCreate` · `suggestCode` · `getPresentation` · `startSession` · `endSession` · `setFeatured` · `scanChat` · `cartFromChat` · `listCarts` · `patchCartItem` · `removeCartItem` · `proposeCart` · `closeCart` · `simulateComment` · ทุกตัวรับ `businessId` กรองด้วยค่านั้น · ของร้านอื่น = `NOT_FOUND`

F22 เรียก: F08 `getCatalogItemDetails(businessId, itemIds)` (ชื่อ, SKU, ตัวเลือก, `effectivePriceMinor`, `effectiveStock`) · F08 `getProduct`/`getPrice` (ตรวจ ref ตอนสร้างรหัสและตอนออกใบสรุป: **ราคาที่ออกใบสรุปมาจาก F13 `propose` ซึ่งเรียก `getPrice` เอง**) · F13 `createStaffQuote`, `registerOrderHook('confirmed', …)` · F09 `saveMessage`, `getConversation`, `getHistory`

## 5. Algorithms

ค่าคงที่ใน `config.ts`:

| ค่า | ค่า | ปรับ |
|---|---|---|
| `MAX_CODES_PER_TEXT` | 10 (คอมเมนต์ใช้ 3) | `opts.maxCodes` |
| `CODE_CACHE_SECONDS` | 30 (แคชทะเบียนรหัสของร้านในหน่วยความจำ; ล้างเมื่อเขียน) | const |
| `CHAT_SCAN_MESSAGES` | 10 ข้อความลูกค้าล่าสุด | const |
| `CART_IDLE_HOURS` | 24 | const |
| `PRESENT_POLL_SECONDS` | 3 | const (หน้าเว็บ) |
| `SIMULATE_RATE` | 20 ครั้ง / 10 นาที ต่อร้าน | const |

### 5.1 รหัสและ key (`key.ts`)

- รูปแบบ `CODE_RE` (§3) · `code` เก็บตามที่ร้านพิมพ์ (ตัดช่องว่างหัวท้าย)
- `normalizeCodeKey(code)`: (1) `NFKC` (2) แปลงเลขไทย `๐–๙` เป็น `0–9` (3) ตัวพิมพ์ใหญ่ (`toUpperCase`; อักษรไทยไม่เปลี่ยน) (4) **ตัดเลข 0 นำหน้าของทุกกลุ่มตัวเลขที่ติดกัน** (กลุ่มที่เป็น 0 ล้วนเหลือ `0`) เช่น `AA02` → `AA2`, `aa002` → `AA2`, `A012` → `A12`, `A100` → `A100`, `A0` → `A0`, `A-007` → `A-7`, `007` → `7`
- รหัสซ้ำตาม key ในร้านเดียวกัน → `VALIDATION_ERROR` `details.reason='code_taken'` (`AA12` กับ `aa012` ชนกัน) · รหัสผิดรูป → `bad_code`

### 5.2 ตัวอ่านรหัสจากข้อความ (`parser.ts`)

อินพุต `text`, ทะเบียน `registry: Map<codeKey, row>` (โหลดครั้งเดียวต่อเรียก ≤ 2,000 แถว, แคช 30 วินาที) · เอาต์พุตลำดับตามที่พบ

**normalize ข้อความ:** `NFKC` · แปลงเลขไทย → อารบิก · ลบ zero-width (`​-‍﻿`) · ตัดเหลือ 2,000 ตัวอักษร (ตัดท้าย) · ไม่แปลงตัวพิมพ์ของข้อความ (เทียบผ่าน key)

**อัลกอริทึม:**
1. แยกข้อความเป็น "ก้อน" ด้วยตัวคั่น `[\s,.;:!?()\[\]{}"'“”‘’/\\|]+` (ไม่ใช้ `-` เป็นตัวคั่น เพราะเป็นอักขระของรหัส) พร้อมตำแหน่งเริ่ม-จบของทุกก้อน
2. ต่อก้อน `chunk` (ไม่ว่าง) ตรวจเป็นลำดับ:
   - **ก. รหัสเต็มก้อน:** `registry.has(key(chunk))` → รหัสนี้ จำนวน 1
   - **ข. รหัส + จำนวนติดกัน:** `/^(.+?)[xX×*](\d{1,2})$/` ที่ `registry.has(key(group1))` และ `1 ≤ n ≤ 99` → รหัส + n (ใช้ greedy จากตัว `x` สุดท้าย: ถ้ามีหลายตัว `x` ให้ลองจากขวาไปซ้ายจนเจอรหัสที่มี)
   - **ค. รหัสฝังในข้อความไทย (เฉพาะรหัสที่ไม่มีอักษรไทย):** ในก้อนที่มีอักษรไทยปนละติน/ตัวเลข ดึง "ช่วงละติน" ด้วย `/[A-Za-z0-9][A-Za-z0-9-]*/g` แล้วตรวจแต่ละช่วงด้วยข้อ ก–ข (ช่วงต้องสะอาด: เป็นช่วงสูงสุดของ `[A-Za-z0-9-]` ดังนั้น `เอาA12นะ` ได้ `A12` แต่ `XA12` ได้ `XA12` ซึ่งไม่อยู่ในทะเบียน)
   - **ง. รหัสที่มีอักษรไทย:** ต้องตรงทั้งก้อนเท่านั้น (ข้อ ก–ข) ไม่ถูกตัดจากกลางข้อความไทย (`เอาก1นะ` ไม่ match `ก1`; `เอา ก1 นะ` match)
3. **จำนวนตามหลัง (ก้อนถัดไป):** เมื่อพบรหัสที่ยังไม่มีจำนวนจากข้อ ข ให้ดู **ข้อความที่เหลือหลังรหัส** `rest` ด้วย `^\s*(?:[xX×*]\s*|จำนวน\s*|qty\s*)?(\d{1,2})(?![0-9A-Za-z-])\s*(?:ชิ้น|อัน|ตัว|กล่อง|ชุด|เล่ม|แพ็ค|ใบ|pcs?|ea)?` · จับได้และ `1 ≤ n ≤ 99` และ (ไม่ได้ขึ้นต้นด้วยตัวเลขที่เป็นรหัสในทะเบียนเอง **หรือ** มีตัวนำ `x`/`จำนวน`/`qty`) → จำนวน = n และข้ามตัวเลขนั้นไม่ให้ถูกอ่านเป็นรหัส · `A12 100` (3 หลัก) ไม่ใช่จำนวน → จำนวน 1 · `A12 2 A5` → A12 ×2, A5 ×1
4. รวมรหัสซ้ำ (key เดียวกัน): บวกจำนวน แต่ไม่เกิน 99 · จำกัดไม่เกิน `maxCodes` รหัสที่ไม่ซ้ำ (เกินตัดทิ้ง)
5. ตัวเลขที่ไม่ใช่จำนวนและไม่ใช่รหัส (เช่น เบอร์โทร, ราคา) ถูกเพิกเฉย

**ตัวอย่างที่ test ต้องได้ (ทะเบียนร้าน A: `A12`→A-GAME-01 Standard, `A5`→A-CARD-01, `AA2`→A-CARD-01, `A99`→A-SOLD-01, `ก1`→A-GAME-01):**

| ข้อความ | ผล |
|---|---|
| `A12x2` | A12 ×2 |
| `a12 x 2` / `A12*2` / `A12 ×2` | A12 ×2 |
| `CF A12 2` | A12 ×2 (CF ไม่ใช่รหัส) |
| `เอา A12 2 ชิ้นนะคะ` | A12 ×2 |
| `A12 2ชิ้น` | A12 ×2 |
| `aa002` | AA2 ×1 (key `AA2` อยู่ในทะเบียน) |
| `AA12` | ไม่ match (key `AA12` ไม่อยู่ในทะเบียน) |
| `XA12` · `A12B` · `A123` | ไม่ match (ไม่ยืนเดี่ยว/ไม่อยู่ในทะเบียน) |
| `A12 A12` | A12 ×2 |
| `A12, A5x3` | A12 ×1, A5 ×3 |
| `A12 100` | A12 ×1 |
| `A12 0` / `A12 x0` | A12 ×1 (0 ไม่ใช่จำนวน) |
| `A12 2 A5` | A12 ×2, A5 ×1 |
| `เอาก1นะ` | ไม่ match |
| `เอา ก1 นะ` | ก1 ×1 |
| `ขอ A-12` | ไม่ match (`A-12` ≠ `A12`) |
| `โทร 0812345678 A5` | A5 ×1 (เบอร์ถูกเพิกเฉย) |
| (ข้อความว่าง/ไม่มีรหัส) | `[]` |

### 5.3 ข้อเท็จจริงสินค้า (`facts.ts`) — แหล่งเดียวของ แชต/หน้า codes/หน้านำเสนอ

`buildCodeFacts(businessId, rows)`: รวม `item_id` ที่ไม่ซ้ำ → `getCatalogItemDetails(businessId, ids)` (ข้ามสินค้า inactive/ลบ/ร้านอื่นเงียบ ๆ → ไม่พบ = `status:'unavailable'`) · ต่อแถว:
- `variantId` ระบุ: หา variant ใน `details.variants` (ไม่พบ/ไม่ active → `unavailable`) · `unitPriceMinor = variant.effectivePriceMinor`, `available = variant.effectiveStock`
- `variantId = null`: ถ้าสินค้ามี variant ที่ active **เดียว** → ใช้ตัวนั้น · มี ≥ 2 → `status:'variant_required'` (ราคาแสดงเป็น "เริ่มต้น" = ต่ำสุด; ไม่ใช้สร้างใบสรุปจนเลือกตัวเลือก) · ไม่มี variant → ระดับสินค้า (`details.priceMinor`, `details.stock`)
- `soldOut = available !== null && available < 1` → `status:'sold_out'` · (ทั้งสินค้าที่มี variant และ `variantId=null` ใช้เมื่อ **ทุก** variant ที่ active หมด)
- `status:'ok'` ที่เหลือ
ตัวอ่านรหัสใน `findProductCodes` ใช้ฟังก์ชันเดียวกัน (`soldOut` สำหรับจำนวนที่ขอ: `available !== null && available < quantity`) · ใบสรุปจริงยังตรวจโดย F13 `propose` (`SOLD_OUT`) จึงไม่ใช่การตัดสินใจเรื่องเงินในที่นี้

### 5.4 จัดการรหัส (`codes.ts`)

- สร้าง: ตรวจ `getProduct(businessId, { itemId })` ไม่เป็น null และ `kind='product'` (บริการสร้างรหัสไม่ได้: `VALIDATION_ERROR` `details.field='itemId'`) · มี `variantId` → ต้องเป็น variant active ของ item นั้น (ผ่าน `getCatalogItemDetails`) มิฉะนั้น `NOT_FOUND` · INSERT (ชน unique → `code_taken`) · audit `live-commerce.code.create`
- แก้โน้ต: `UPDATE … SET note=$, version=version+1, updated_by, updated_at WHERE id=$ AND business_id=$ AND version=$expected` · rowCount 0 → มีแถวไหม: ไม่มี `NOT_FOUND` / มี `VERSION_CONFLICT` (`details.currentVersion`) — **ย้ายรหัสแล้วเพิ่ม version จึงทำให้แก้โน้ตด้วย version เก่าโดน 409**
- ย้าย: ตรวจเป้าหมายใหม่เหมือนสร้าง · `UPDATE … SET item_id, variant_id, note='', assigned_at=now(), version=version+1 WHERE id AND version=$expected` · audit `live-commerce.code.move` (details: จาก/ถึง itemId)
- ลบ: `DELETE … WHERE id AND business_id AND version=$expected` (409 ตามเดิม) · audit
- ทุกการเขียนล้างแคชทะเบียนของร้าน และ `publish custom F22 live.changed`
- `bulkCreate` (เพื่อตั้งค่าเร็วในวันงาน): ต่อแถว หา `sku` ด้วย `getProduct({ sku })` (ไม่พบ `sku_not_found`; ชื่อซ้ำหลายตัวไม่เกี่ยว: SKU ไม่กำกวม) · `variantName` ระบุ → จับคู่ชื่อ variant แบบตรงตัว (NFKC lowercase) ในรายละเอียดสินค้า (ไม่พบ `variant_not_found`; หลายตัว `ambiguous`) · ใช้กฎเดียวกับสร้าง · `dryRun` ไม่เขียน · ผลแถวเสีย **ไม่หยุดทั้งก้อน** แต่ถ้ามี error ใด ๆ และ `dryRun=false` → ไม่เขียนเลย (all-or-nothing, `applied:false`)
- `suggestCode(prefix)`: prefix ตรง `^[A-Za-z0-9ก-ฮ-]{1,10}$` · หาเลขสูงสุด `n` ของรหัสที่ key ขึ้นต้น prefix ตามด้วยตัวเลขล้วน → คืน `<prefix><n+1>` (ถ้าไม่มี → `<prefix>1`) ที่ยาว ≤ 20

### 5.5 ตะกร้าจากแชต (`chat-scan.ts`, `carts.ts`)

**`scanChat(conversationId)`:** `getConversation` (ร้านอื่น/ไม่พบ = `NOT_FOUND`) · `getHistory(conversationId, { limit: 30, businessId })` → เอาข้อความ `author='customer'` ล่าสุด `CHAT_SCAN_MESSAGES` ข้อความ ที่ `id` ยังไม่อยู่ใน `live_consumed_messages` → ต่อข้อความ `findProductCodes(text)` (ใช้ `parts` ชนิด text) → รวมเป็น `matches` พร้อม `messageId` · `blocked` = รหัสที่ `soldOut`/`unavailable`/`variant_required` (ไม่ถูกใส่ตะกร้า) · แนบตะกร้า active ของแชตนี้ถ้ามี

**`cartFromChat`:** `scanChat` (หรือเฉพาะ `messageIds` ที่ส่งมา: ต้องเป็นข้อความลูกค้าของแชตนี้ มิฉะนั้นข้าม) → ไม่มีรหัสที่ใส่ได้ → `POLICY_BLOCKED` `no_codes` · `db.tx`: หา/สร้างตะกร้า active (unique `live_carts_one_active`; ผูก `live_session_id` ที่กำลังไลฟ์ถ้ามี) · ต่อรหัสที่ใส่ได้: `INSERT … ON CONFLICT (cart_id, code_key) DO UPDATE SET quantity = LEAST(99, live_cart_items.quantity + EXCLUDED.quantity)` · INSERT `live_consumed_messages (message_id …) ON CONFLICT DO NOTHING` (ข้อความที่ถูกใช้แล้วในรอบก่อนไม่ถูกบวกซ้ำ: กรองก่อนแล้ว) · state `proposed` → กลับ `open` (ต้องออกใบใหม่) · version+1 · audit ไม่จำเป็น (ไม่ใช่เงินจนกว่าจะออกใบสรุป)

**`addToLiveCart` (export):** เหมือน `cartFromChat` แต่รับข้อความเดี่ยว (`messageId` + `text`) จากผู้เรียกภายนอก (F21/F10) · idempotent ด้วย `live_consumed_messages` (ข้อความเดิมเรียกซ้ำ → คืนตะกร้าเดิม `matches` ว่าง) · `source: 'comment'` ใช้ `maxCodes 3`

**`proposeCart`:**
1. `expectedVersion` ตรงตะกร้า (409 มิฉะนั้น) · state ต้อง `open` หรือ `proposed` · ไม่มีบรรทัด → `POLICY_BLOCKED` `empty_cart`
2. `facts` ใหม่ทุกบรรทัด: มีบรรทัดที่ `status ≠ 'ok'` → `POLICY_BLOCKED` `cart_has_blocked_items` (`details.blocked: [{ codeKey, reason }]`; พนักงานลบหรือเลือกตัวเลือกก่อน) 
3. `createStaffQuote({ businessId, conversationId, actorUserId, items: บรรทัดละ { ref: { itemId }, variantId, quantity }, deliveryMethod, clientRequestId: 'live:<cartId>:<cartVersion>' })` ของ F13 → ได้ proposal + ส่งการ์ดลงแชต (ราคาที่ลูกค้าเห็นมาจาก F13 `getPrice` ไม่ใช่จาก F22) · error ของ F13 (`SOLD_OUT`, `POLICY_BLOCKED`) ส่งต่อทั้ง code
4. `UPDATE live_carts SET state='proposed', proposal_id=$, proposed_at=now(), version=version+1` · audit `live-commerce.cart.propose` (details: cartId, proposalId, lineCount) · คืน `proposalId`, `totalMinor` (จาก F13), `messageId`
5. hook `confirmed` (ลงทะเบียนใน `routes.ts` `register()` ด้วย `registerOrderHook`): `order.proposalId` ตรงกับ `live_carts.proposal_id` → state `ordered` · ไม่ใช่ตะกร้าของเรา = ไม่ทำอะไร

**`simulateComment`:** rate limit (`SIMULATE_RATE` ต่อร้าน) · สร้าง/ใช้ลูกค้า `saveMessage({ businessId, customer: { channel: 'web', externalId: 'live-sim:' + slug(viewerName), displayName: '[จำลอง] ' + viewerName }, direction: 'inbound', author: 'customer', parts: [{ type:'text', text }], origin: 'comment', externalId: 'live-sim-msg:' + uuid, triggerAi: false })` → ได้ `conversationId`, `messageId`, `customerId` → `addToLiveCart({ …, source: 'comment' })` · ติดป้าย: ลูกค้าชื่อขึ้นต้น `[จำลอง]` และ UI แสดงป้าย "จำลอง (ไม่ใช่คอมเมนต์จริง)" · ไม่ตอบคอมเมนต์กลับ

**sweep:** schedule `live-commerce.sweep` ทุก 600 วินาที: ตะกร้า `open`/`proposed` ที่ `updated_at < now() − 24 ชม.` → `expired`

### 5.6 หน้านำเสนอ (`getPresentation`, `setFeatured`)

- `getPresentation`: ทะเบียนทั้งหมดเรียงตาม `code_key` (ธรรมชาติ: ตัวอักษรก่อนแล้วตัวเลขตามค่า ใช้ `localeCompare(…, { numeric: true })` ฝั่ง server) → `buildCodeFacts` → `featured` = แถวที่ `codeKey === session.featuredCodeKey` (ไม่มี session = null) · `factsVersion` = `sha1(codes.map(c => id:version:price:available:status).join('|'))` · เซิร์ฟเวอร์ตอบ `Cache-Control: no-store`
- `setFeatured`: ต้องมี session `live` (ไม่งั้น `POLICY_BLOCKED` `no_live_session`; หน้านำเสนอที่ไม่มี session เก็บ "รหัสที่กำลังโชว์" ในสถานะฝั่งเว็บเท่านั้น) · `codeKey` ต้องอยู่ในทะเบียน (null = ล้าง) · CAS ที่ `live_sessions.version` (409 ตามเดิม) · publish `live.changed`
- ข้อมูลที่หน้านำเสนอแสดงมาจาก `CodeFact` ชุดเดียวกับหน้า `/product-codes` และการ์ดในแชต (F13 ใช้ `getPrice` ตัวเดียวกัน) → ตัวเลขตรงกัน; test ตรวจโดยเทียบ `unitPriceMinor` จาก `getPresentation` กับ `getPrice` ของ F08

## 6. AI calls

ไม่มี AI call ในฟีเจอร์นี้ (ตัวอ่านรหัสเป็นโค้ดล้วน) · ข้อเสนอสำหรับ B2 (ไม่บังคับ ผ่าน `NEED TO:A2` → `NEED TO:B2`): ใน prefetch ของ F10 เรียก `findProductCodes(businessId, ข้อความลูกค้า, { resolve: true })` แล้วใส่บรรทัดข้อเท็จจริงเข้า evidence (`catalog:<itemId>:v<ver>` พร้อม SKU และจำนวน) เพื่อให้โมเดลเรียก `propose_order` ด้วย SKU ที่ถูกต้อง · โมเดลไม่เห็นหรือสร้างรหัสเอง

## 7. UI

เมนู: `{ path:'/product-codes', labelKey:'live-commerce:menu.codes', group:'live', icon:'QrCode2Outlined', order:10, permission:'product.read', searchTerms:['product code','รหัสสินค้า','ไลฟ์','live'] }` · `{ path:'/live', labelKey:'live-commerce:menu.live', group:'live', icon:'LiveTvOutlined', order:20, permission:'product.read', searchTerms:['live','ไลฟ์สด','ตะกร้า','นำเสนอ'] }` · slot `chatSidePanels` id `live-commerce.chat-panel` (order 30, permission `orders.read`)

Routes: `/product-codes` (layout app) · `/live` (layout app) · `/live/present` (**layout `bare`**, permission `product.read`, `titleKey:'live-commerce:present.title'`)

**`/product-codes` (`ProductCodesPage.tsx`):** `PageHeader` "รหัสสินค้าไลฟ์" · แถบเครื่องมือ: ค้นหา, "เพิ่มรหัส" (`FormDialog`: รหัส, ปุ่ม "เสนอรหัสถัดไป", เลือกสินค้า (ค้นผ่านรายการ `GET /catalog/items` ของ F08 ใช้ `useApiQuery`; ไม่ import โค้ด F08) + ตัวเลือก, โน้ต), "นำเข้าหลายรายการ" (วางบรรทัด `A12 = A-GAME-01 | Standard | โน้ต` → `dryRun` ก่อน → ยืนยัน) · `DataTable`: รหัส, สินค้า (ชื่อ + SKU + ตัวเลือก), ราคา `formatMoney`, สต็อก/สถานะ (`StatusChip generic` เอง: ปกติ/หมดแล้ว/ปิดขาย/ต้องเลือกตัวเลือก ผ่าน label i18n), โน้ต (แก้ในช่อง inline → PATCH + `expectedVersion`; 409 → toast "มีคนแก้รหัสนี้ไปแล้ว" + โหลดใหม่), การกระทำ: ย้ายไปสินค้าอื่น (`FormDialog`, เตือนว่าโน้ตจะถูกล้าง), ลบ (`ConfirmDialog`) · สิทธิ์ `product.write` ผ่าน `useCan` (ไม่มีสิทธิ์: อ่านอย่างเดียว) · ลิงก์ "เปิดหน้านำเสนอ" → `/live/present` (แท็บใหม่) · states: loading skeleton, `EmptyState` "ยังไม่มีรหัสสินค้า" + ปุ่มเพิ่ม, error + ลองใหม่ · `useRealtime('custom', e => e.featureId==='F22' && reload())`

**`/live` (`LivePage.tsx`):** (1) `SectionCard` "ไลฟ์ตอนนี้": ไม่มี session = ฟอร์มชื่อไลฟ์ + "เริ่มไลฟ์" · มี = ชื่อ + เวลาเริ่ม + "จบไลฟ์" (`ConfirmDialog`) + ปุ่ม "เปิดหน้านำเสนอเต็มจอ" (2) `SectionCard` "ตะกร้าจากแชต": ตัวกรองสถานะ + รายการตะกร้า (ลูกค้า, บรรทัด `code ×qty = ราคา`, สถานะแต่ละบรรทัด, ยอดรวมประมาณการ "ราคาจริงตอนออกใบสรุป"): แก้จำนวน/เลือกตัวเลือก/ลบบรรทัด · เลือกจัดส่ง/รับหน้าร้าน · ปุ่ม "สร้างใบสรุปให้ลูกค้า" (ปิดเมื่อมีบรรทัด `blocked`, แสดงเหตุผล) · ปุ่ม "ปิดตะกร้า" · ป้าย "จำลอง" ตามแหล่ง (3) `SectionCard` "จำลองคอมเมนต์ผู้ชม (ทดสอบ)" (เฉพาะ `product.write`): ช่องชื่อผู้ชม + ข้อความ + ปุ่ม "ส่งคอมเมนต์จำลอง" + แถบ `Alert info` "ใช้ทดสอบเท่านั้น: ไม่ใช่คอมเมนต์จากไลฟ์จริง (ต้องรอเชื่อมคอมเมนต์ Facebook/Instagram)" · `useRealtime`

**แผงข้างแชต (`ChatPanel.tsx`, slot `chatSidePanels`):** เรียก `GET /live/chat-scan?conversationId=` เมื่อเปิด/มีข้อความใหม่ · แสดง "พบรหัสสินค้าในข้อความล่าสุด" รายการ `A12 ×2 — เกมตัวอย่าง Demo Quest · 1,490.00` + `blocked` (หมดแล้ว/ต้องเลือกตัวเลือก) · ปุ่ม "เพิ่มเข้าตะกร้า" (`from-chat`) → แสดงตะกร้า → "สร้างใบสรุปให้ลูกค้า" (เลือกจัดส่ง/รับเอง) · ไม่พบรหัส: ข้อความ "ไม่พบรหัสสินค้าในข้อความล่าสุด" ซ่อนปุ่ม

**`/live/present` (`PresentPage.tsx`, เต็มจอ ไม่มี shell):**
- พื้นมืด ตัวอักษรใหญ่ อ่านจากระยะไกล: รหัสขนาดใหญ่สุด (`data-testid="live-present-code"`), ชื่อสินค้า (`live-present-name`) + ตัวเลือก, ราคา `formatMoney` (`live-present-price`), โน้ต (`live-present-note`), ป้ายสต็อก "เหลือ n" เมื่อ `available` ไม่ null และ ≤ 5 · **หมดแล้ว:** ตราประทับเต็มกว้าง "หมดแล้ว" ทับ (`live-present-soldout`) และราคาจางลง · `unavailable` → "ไม่พร้อมขาย" · แถบด้านล่าง: ปุ่ม ก่อนหน้า/ถัดไป (`live-present-prev`, `live-present-next`), ตัวนับ `3/12`, รายการรหัสย่อ (แตะเพื่อเลือก), แก้โน้ต (เฉพาะ `product.write`: ปุ่มดินสอ → ช่องกรอก → PATCH + `expectedVersion`; 409 → โหลดใหม่และแจ้ง), ปุ่มเต็มจอ (`document.documentElement.requestFullscreen`), ปุ่มออก → `/live`
- คีย์ลัด: ← → เปลี่ยนรหัส · `F` เต็มจอ · `Esc` ออกจากเต็มจอ
- ข้อมูล: โหลด `GET /live/presentation` ทุก `PRESENT_POLL_SECONDS` (3 วินาที) และเมื่อมี realtime `live.changed` · มี session `live`: รหัสที่โชว์ = `featured` ของเซิร์ฟเวอร์ (เปลี่ยนด้วย `PUT /live/featured` → จอทุกเครื่องเปลี่ยนตาม) · ไม่มี session: รหัสที่โชว์เก็บใน state ฝั่งเว็บ (ลำดับเดียวกับ `codes`) · ไม่มีรหัสในทะเบียน → `EmptyState` เต็มจอ
- ไม่ใช้ราคาที่เก็บไว้ในเบราว์เซอร์: ทุกครั้งที่ poll ได้ราคา/สต็อกใหม่จาก F08 ผ่าน server

i18n (namespace `live-commerce`; ฝั่งร้านไม่มี ค่ะ/ครับ ในปุ่มและป้าย):

| key | th | en |
|---|---|---|
| `menu.codes` | รหัสสินค้าไลฟ์ | Live product codes |
| `menu.live` | ไลฟ์สด | Live |
| `codes.title` | รหัสสินค้าไลฟ์ | Live product codes |
| `codes.subtitle` | ตั้งรหัสสั้น ๆ ให้ลูกค้าพิมพ์สั่ง เช่น A12 หรือ A12x2 | Short codes customers can type to order, e.g. A12 or A12x2 |
| `codes.search` | ค้นหารหัสหรือสินค้า | Search code or product |
| `codes.add` | เพิ่มรหัส | Add code |
| `codes.bulk` | นำเข้าหลายรายการ | Import several |
| `codes.openPresent` | เปิดหน้านำเสนอ | Open presentation |
| `col.code` | รหัส | Code |
| `col.product` | สินค้า | Product |
| `col.price` | ราคา | Price |
| `col.stock` | สต็อก | Stock |
| `col.note` | โน้ต | Note |
| `status.ok` | พร้อมขาย | Available |
| `status.sold_out` | หมดแล้ว | Sold out |
| `status.unavailable` | ปิดขาย/ไม่พบสินค้า | Unavailable |
| `status.variant_required` | ต้องเลือกตัวเลือก | Option required |
| `form.code` | รหัส (1–20 ตัว A–Z ก–ฮ 0–9 และ -) | Code (1–20 chars: A–Z, Thai letters, 0–9, -) |
| `form.suggest` | เสนอรหัสถัดไป | Suggest next |
| `form.prefix` | ขึ้นต้นด้วย | Prefix |
| `form.item` | สินค้า | Product |
| `form.variant` | ตัวเลือก | Option |
| `form.wholeItem` | ทั้งสินค้า (ลูกค้าเลือกในแชต) | Whole product (customer picks in chat) |
| `form.note` | โน้ต (บรรทัดเดียว ไม่เกิน 200 ตัว) | Note (one line, max 200 chars) |
| `form.bulkHelp` | หนึ่งบรรทัดต่อหนึ่งรหัส: รหัส = SKU \| ตัวเลือก \| โน้ต | One line per code: code = SKU \| option \| note |
| `form.dryRun` | ตรวจก่อนบันทึก | Check first |
| `move.title` | ย้ายรหัสไปสินค้าอื่น | Move code to another product |
| `move.warn` | โน้ตของรหัสนี้จะถูกล้าง | The note of this code will be cleared |
| `confirm.deleteTitle` | ลบรหัสนี้? | Delete this code? |
| `confirm.deleteMessage` | ลูกค้าจะพิมพ์รหัสนี้สั่งสินค้าไม่ได้อีก | Customers can no longer order with this code |
| `toast.saved` | บันทึกแล้ว | Saved |
| `toast.conflict` | มีคนแก้รหัสนี้ไปแล้ว โหลดใหม่ให้แล้ว | Someone changed this code. Reloaded |
| `error.code_taken` | รหัสนี้ถูกใช้แล้ว (ไม่สนตัวพิมพ์ใหญ่เล็กและเลข 0 นำหน้า) | This code is taken (case and leading zeros are ignored) |
| `error.bad_code` | รูปแบบรหัสไม่ถูกต้อง | Invalid code format |
| `empty.title` | ยังไม่มีรหัสสินค้า | No product codes yet |
| `empty.description` | เพิ่มรหัสแรกเพื่อให้ลูกค้าพิมพ์สั่งในแชต | Add your first code so customers can order in chat |
| `live.title` | ไลฟ์สด | Live |
| `live.current` | ไลฟ์ตอนนี้ | Current live |
| `live.titleField` | ชื่อไลฟ์ | Live title |
| `live.start` | เริ่มไลฟ์ | Start live |
| `live.end` | จบไลฟ์ | End live |
| `live.endConfirm` | จบไลฟ์นี้? ตะกร้าที่ค้างยังอยู่ | End this live? Open carts stay |
| `live.openPresent` | เปิดหน้านำเสนอเต็มจอ | Open fullscreen presentation |
| `live.none` | ยังไม่ได้เริ่มไลฟ์ | No live running |
| `cart.title` | ตะกร้าจากแชต | Carts from chat |
| `cart.estimate` | ยอดประมาณการ (ราคาจริงตอนออกใบสรุป) | Estimate (final price at review time) |
| `cart.propose` | สร้างใบสรุปให้ลูกค้า | Send order review |
| `cart.close` | ปิดตะกร้า | Close cart |
| `cart.blocked` | มีบรรทัดที่สั่งไม่ได้ ลบหรือเลือกตัวเลือกก่อน | Some lines cannot be ordered. Remove them or pick an option |
| `cart.chooseVariant` | เลือกตัวเลือก | Pick an option |
| `cart.sent` | ส่งใบสรุปให้ลูกค้าแล้ว | Order review sent |
| `cart.state.open` | เปิดอยู่ | Open |
| `cart.state.proposed` | รอลูกค้ายืนยัน | Awaiting customer |
| `cart.state.ordered` | สั่งแล้ว | Ordered |
| `cart.state.expired` | หมดอายุ | Expired |
| `cart.state.closed` | ปิดแล้ว | Closed |
| `cart.empty` | ยังไม่มีตะกร้า | No carts yet |
| `sim.title` | จำลองคอมเมนต์ผู้ชม (ทดสอบ) | Simulate a viewer comment (test) |
| `sim.warn` | ใช้ทดสอบเท่านั้น ไม่ใช่คอมเมนต์จากไลฟ์จริง (ต้องรอเชื่อมคอมเมนต์ Facebook/Instagram) | For testing only, not a real live comment (needs Facebook/Instagram comments to be connected) |
| `sim.viewer` | ชื่อผู้ชม | Viewer name |
| `sim.text` | ข้อความคอมเมนต์ | Comment text |
| `sim.send` | ส่งคอมเมนต์จำลอง | Send simulated comment |
| `sim.badge` | จำลอง | Simulated |
| `sim.noCodes` | ไม่พบรหัสสินค้าในข้อความนี้ | No product code found in this text |
| `panel.title` | รหัสสินค้าในแชต | Product codes in chat |
| `panel.found` | พบรหัสสินค้าในข้อความล่าสุด | Product codes found in recent messages |
| `panel.none` | ไม่พบรหัสสินค้าในข้อความล่าสุด | No product code in recent messages |
| `panel.add` | เพิ่มเข้าตะกร้า | Add to cart |
| `present.title` | หน้านำเสนอสินค้า | Product presentation |
| `present.soldOut` | หมดแล้ว | SOLD OUT |
| `present.unavailable` | ไม่พร้อมขาย | Not available |
| `present.left` | เหลือ {{n}} | {{n}} left |
| `present.prev` | ก่อนหน้า | Previous |
| `present.next` | ถัดไป | Next |
| `present.fullscreen` | เต็มจอ | Fullscreen |
| `present.exit` | ออก | Exit |
| `present.editNote` | แก้โน้ต | Edit note |
| `present.empty` | ยังไม่มีรหัสสินค้าให้นำเสนอ | No product codes to present |
| `present.counter` | {{i}}/{{n}} | {{i}}/{{n}} |
| `error.retry` | ลองใหม่ | Retry |

## 8. Jobs, schedules, events

| รายการ | ค่า |
|---|---|
| schedule `live-commerce.sweep` | ทุก 600 วินาที: ตะกร้าไม่เคลื่อนไหว 24 ชั่วโมง → `expired` |
| realtime | `custom` `featureId:'F22'` `name:'live.changed'` `data:{}` (รหัส/ไลฟ์/ตะกร้าเปลี่ยน) |
| audit | `live-commerce.code.create` · `.code.move` · `.code.delete` · `.code.note` (details: codeKey ไม่ใช่ข้อความโน้ต) · `.session.start` · `.session.end` · `.cart.propose` (details ไม่มีข้อความลูกค้า) |
| hook | ลงทะเบียน `registerOrderHook('confirmed', …)` (ตะกร้า → `ordered`) |
| notify | ไม่มี (ใบสรุปเป็นหน้าที่ F13) |

## 9. Seed และ fixtures

`seed.ts` (idempotent, ผ่านฟังก์ชันของ service):
- ร้าน A: `A12` → A-GAME-01 ตัวเลือก Standard (`var_a_game_std`) โน้ต `ภาษาไทย มีคู่มือ` · `A5` → A-CARD-01 · `AA2` → A-CARD-01 (ทดสอบ key `aa002`) · `A99` → A-SOLD-01 (หมดสต็อก) · `ก1` → A-GAME-01 (ทั้งสินค้า: สินค้ามี variant เดียว จึงเลือกอัตโนมัติ) · ร้าน B: `B1` → B-KIT-01
- `runDemo(ctx)` (ร้าน A): ไลฟ์ `live` ชื่อ "ไลฟ์เดโม" ตั้ง featured `A12` · 2 ตะกร้า (`open` จาก `cust_a1`: A5 ×2; `proposed` พร้อมใบสรุปผ่าน F13) · คอมเมนต์จำลอง 2 รายการ (ผ่าน `simulateComment`) 
- `resetDemo(ctx)`: ลบ `live_consumed_messages`, `live_cart_items`, `live_carts`, `live_sessions` ของร้านเดโมและรหัสที่ไม่ใช่รหัส seed (แถวที่ `created_by IS NOT NULL`) · ไม่ลบรหัส seed
- Fixtures test: ทะเบียนจำลองในหน่วยความจำสำหรับ `parser.test.ts` (ไม่ต้องใช้ DB) · `fakeCatalog` จาก `SEED.catalog` · ลูกค้า/แชต `conv_a_ai`

## 10. Tests

| ไฟล์ | case |
|---|---|
| `key.test.ts` | `AA02`→`AA2` · `aa002`→`AA2` · `A012`→`A12` · `A100`→`A100` · `A0`→`A0` · `A-007`→`A-7` · `007`→`7` · `๑๒`→`12` · `ก01`→`ก1` · `A12`≠`A-12` · รหัสผิดรูป (`A 12`, 21 ตัว, ขึ้นต้น `-`, อีโมจิ) ถูกปฏิเสธ |
| `parser.test.ts` | ทุกแถวของตารางใน §5.2 (ทะเบียนจำลอง) · `maxCodes=3` ตัดรหัสที่ 4 · รหัสซ้ำรวมจำนวนและ cap 99 · ข้อความยาว 5,000 ตัวไม่ช้า (< 50 ms) · ข้อความไทยล้วนไม่มีรหัส → `[]` |
| `facts.test.ts` | variant เดียวอัตโนมัติ · สินค้าหลาย variant + `variantId=null` → `variant_required` · สินค้า inactive → `unavailable` · A99 → `sold_out` · บริการ → ไม่สร้างรหัสได้ · ตัวเลขตรงกับ `getPrice` ของ F08 (149000 สำหรับ A12) |
| `codes.test.ts` | สร้าง/ซ้ำตาม key (`aa012` vs `AA12`) → `code_taken` · โน้ตมีขึ้นบรรทัดใหม่ → `VALIDATION_ERROR` · **ย้ายรหัสแล้วแก้โน้ตด้วย version เก่า → `VERSION_CONFLICT`** และโน้ตของผู้ที่ย้ายไม่ถูกทับ · ย้ายแล้ว note ว่าง `assigned_at` เปลี่ยน · ลบด้วย version เก่า → 409 · ร้านอื่น → `NOT_FOUND` · bulk: dryRun ไม่เขียน, มีแถวเสีย → ไม่เขียนเลย, `sku_not_found` · suggest: prefix `A` กับทะเบียน A5/A12/A99/AA2 → `A100` (`AA2` ไม่นับเพราะหลัง prefix ไม่ใช่ตัวเลขล้วน) · ไม่มีรหัสขึ้นต้นด้วย prefix → `<prefix>1` |
| `carts.test.ts` | `A12x2` → ตะกร้า A12 ×2 · ข้อความเดิมสแกนซ้ำไม่บวกซ้ำ (`live_consumed_messages`) · สองข้อความ `A5` + `A5x2` → ×3 · `A99` ไม่ถูกใส่ (blocked `sold_out`) · propose: ตะกร้า A12 ×2 → F13 ได้ items `[{ ref:{itemId}, variantId: Standard, quantity: 2 }]` และ total 298000 ผ่าน F13 จริง · มีบรรทัด blocked → `cart_has_blocked_items` · ตะกร้า version เก่า → 409 · hook `confirmed` ของ proposal นั้นทำตะกร้า `ordered` · ตะกร้าอายุ 25 ชม. → `expired` (sweep) · หนึ่งแชตหนึ่งตะกร้า active (unique) |
| `simulate.test.ts` | จำลอง `A5x2` → ลูกค้า `[จำลอง] …`, ข้อความ origin `comment`, ตะกร้า A5 ×2 · ครบ rate limit → `RATE_LIMITED` · ข้อความไม่มีรหัส → `cart: null`, `matches: []` |
| `presentation.test.ts` | codes เรียงตามธรรมชาติ (`A5` ก่อน `A12`) · `factsVersion` เปลี่ยนเมื่อราคาเปลี่ยน · `setFeatured` ไม่มี session → `no_live_session` · version เก่า → 409 · codeKey ที่ไม่อยู่ในทะเบียน → `NOT_FOUND` |
| `routes.test.ts` | permission: staff default (ไม่มี `product.write`) สร้างรหัสไม่ได้ (`PERMISSION_DENIED`) แต่อ่านได้ · `from-chat` ต้อง `orders.write` · tenant isolation (รหัสและตะกร้าของร้าน B → `NOT_FOUND`) · chat-scan ของแชตร้านอื่น → `NOT_FOUND` |

Playwright smoke `web/src/features/live-commerce/e2e/live-commerce.smoke.spec.ts` (production, ใช้ `e2eMarker()`):

1. `ownerPage` → `/product-codes` เห็นรหัส seed `A12` ราคา 1,490.00 และ `A99` ขึ้น "หมดแล้ว"
2. สร้างรหัสใหม่ `Z<marker สั้น>` → A-CARD-01 โน้ต `e2e` → แสดงในตาราง · แก้โน้ตผ่าน API ด้วย `expectedVersion` เก่าหลังแก้ครั้งแรก → `409` (ใช้ fixture `api`) · ลบรหัสทดสอบ (cleanup)
3. เปิด `/live/present` (ในแท็บใหม่ของ `ownerPage.context()`): `live-present-code` มีรหัสแรก · ตั้ง viewport มือถือไม่จำเป็น · กด `live-present-next` ไปถึง `A99` → `live-present-soldout` มองเห็น · ราคาของ `A12` (`live-present-price`) ตรงกับที่หน้า `/product-codes` แสดง (ข้อความเดียวกันจาก `formatMoney`)
4. `/live` → จำลองคอมเมนต์ผู้ชม ชื่อ `viewer-<marker>` ข้อความ `A5x2` → ตะกร้า "A5 ×2" ปรากฏ ป้าย "จำลอง" → เลือกจัดส่ง กด "สร้างใบสรุปให้ลูกค้า" → toast "ส่งใบสรุปให้ลูกค้าแล้ว" · `/chat` เปิดแชต `[จำลอง] viewer-<marker>` เห็นข้อความที่มีการ์ดสรุป (`inbox-message` ที่มี "รอลูกค้ากดยืนยัน" หรือยอด 298.00 บาท = 19800 + 10000 ค่าส่ง ตาม `formatMoney`)
5. สถานะตะกร้าเป็น "รอลูกค้ายืนยัน" · ปิดตะกร้า (cleanup) · ไม่แตะร้าน B ยกเว้นพิสูจน์ `GET /businesses/<B>/product-codes` ด้วยเซสชันร้าน A ได้ 403/404

## 11. Acceptance: R ตาม D6

- [ ] `A12x2` (ร้าน A: A12 → A-GAME-01 Standard) แมปถูก จำนวน 2 · ราคา canonical 149000 ต่อชิ้นจาก `getPrice` (ไม่ใช่จากข้อความ) · ใบสรุปผ่าน F13 รวม 298000
- [ ] `aa012` กับ `AA12` เป็น key เดียวกัน · รหัสซ้ำตาม key → ปฏิเสธ
- [ ] ย้ายรหัสไปสินค้าอื่นแล้วบันทึกโน้ตด้วย version เก่า → 409 · โน้ตของผู้ย้ายไม่ถูกทับ
- [ ] รหัสของ A-SOLD-01 (A99) แสดง "หมดแล้ว" ในหน้ารหัส/หน้านำเสนอ และไม่ถูกใส่ในตะกร้า/ใบสรุป
- [ ] หน้า `/live/present` เต็มจอ (layout `bare`) อ่านข้อมูลชุดเดียวกับหน้ารหัสและแชต (ราคา/สต็อกจาก F08) · เปลี่ยนรหัสได้ด้วยปุ่ม/ลูกศร · รีเฟรชอัตโนมัติเมื่อสต็อก/ราคาเปลี่ยน (≤ 3 วินาที)
- [ ] ตะกร้าจากแชต: สแกนข้อความจริงในแชต → ตะกร้า → ใบสรุป F13 → ลูกค้ากดยืนยัน → ตะกร้า `ordered`
- [ ] คอมเมนต์ไลฟ์จริง **ไม่ได้ทำ**: ตัวจำลองติดป้ายชัด · `findProductCodes`/`addToLiveCart` พร้อมให้ F21
- [ ] unit + route + Playwright smoke ผ่านบน production · loading/empty/error ครบ · i18n ไทย · permission + tenant · audit
- **สถานะ:** codes, note, หน้านำเสนอ, ตะกร้าจากแชต (ในแอป) = **R** · คอมเมนต์จาก Facebook/Instagram live จริง = **A** (บันทึกแยกใน EVIDENCE.md และ FEATURE_STATUS) · ถ้า F13 `propose` ยังไม่ merge: ส่วนตะกร้า→ใบสรุปซ่อนปุ่ม (รหัส/หน้านำเสนอเป็น R ได้)

## 12. Security และ privacy

- ทุก query กรอง `business_id` · ตะกร้า/แชตของร้านอื่น = `NOT_FOUND` · chat-scan ตรวจ `getConversation(…, { businessId })`
- ข้อความลูกค้าเป็นข้อมูล: ตัวอ่านรหัสทำงานกับทะเบียนของร้านเท่านั้น (ไม่รัน regex ที่สร้างจากข้อความ · ทุก regex คงที่ ไม่มี backtracking หายนะ: ตัดข้อความ 2,000 ตัว) · ไม่เก็บข้อความลูกค้าในตารางของ F22 (เก็บแค่ `message_id` ที่ถูกใช้) · audit/log ไม่มีข้อความลูกค้า
- ราคา/สต็อกไม่ถูกเชื่อจากข้อความหรือเบราว์เซอร์: ใบสรุปราคามาจาก F13 `getPrice` ตอนออก · หน้านำเสนอไม่แคช (`no-store`)
- โน้ตเป็นข้อความภายในของร้านแสดงในหน้านำเสนอเท่านั้น (ไม่ส่งให้ลูกค้าอัตโนมัติ) · render เป็นข้อความธรรมดา (ไม่ใช้ `dangerouslySetInnerHTML`) · ห้ามขึ้นบรรทัดใหม่ (CHECK + zod)
- ตัวจำลองคอมเมนต์: สร้างลูกค้า `web` ชื่อขึ้นต้น `[จำลอง]` เท่านั้น มี rate limit และต้อง `product.write` · ไม่เรียก AI (`triggerAi:false`) ไม่ส่งข้อความออกช่องทางจริง
- hook `confirmed` ตรวจ `proposal_id` ตรงตะกร้าของร้านเดียวกันก่อนเปลี่ยนสถานะ

## 13. Edge cases

| กรณี | ผลที่ต้องได้ |
|---|---|
| รหัสชี้ variant ที่ถูกลบ/ปิดขาย | `unavailable` (ไม่แสดงใน `findProductCodes`; แสดงในหน้ารหัสเป็นสถานะ) |
| สินค้ามีหลาย variant และรหัสชี้ทั้งสินค้า | `variant_required` · ไม่ใส่ใบสรุปจนพนักงานเลือกตัวเลือกในตะกร้า |
| สินค้าหมดระหว่างลูกค้าสั่ง (หลังเข้าตะกร้า) | `proposeCart` → `cart_has_blocked_items` หรือ F13 `SOLD_OUT` |
| ลูกค้าพิมพ์รหัสใน 2 ข้อความติดกัน (`A5` แล้ว `A5 2`) | บวกจำนวนในตะกร้าเดียว (3) |
| พนักงานสแกนแชตซ้ำ | ข้อความที่ใช้แล้วไม่ถูกบวกซ้ำ |
| ลูกค้าไม่ได้ยืนยันใบสรุป (หมดอายุ 15 นาที) | ตะกร้ายัง `proposed` · พนักงานออกใบใหม่ได้ (state กลับ `open` → `proposed`) |
| ไลฟ์จบแล้ว หน้านำเสนอยังเปิดอยู่ | หน้าเปลี่ยนเป็นโหมดไม่มี session (รหัสที่โชว์เก็บฝั่งเว็บ) ไม่ error |
| สองจอนำเสนอเปลี่ยนรหัสพร้อมกัน | CAS บน `live_sessions.version` → จอที่แพ้ได้ 409 และโหลดสถานะล่าสุด |
| รหัสที่มีอักษรไทยกับข้อความไทยติดกัน | ไม่ match (ต้องมีตัวคั่น) |
| ทะเบียนใหญ่เกิน 2,000 รหัส | อ่านเฉพาะ 2,000 แรกตาม `code_key` (ไม่น่าเกิดในงานนี้; ตัดและ log เตือนหนึ่งครั้ง) |
| ลบรหัสที่อยู่ในตะกร้าที่ `open` | บรรทัดใน `live_cart_items` ยังอยู่ (เก็บ item/variant ไว้) แต่ไม่ถูกสร้างใหม่จากข้อความต่อ |
| `findProductCodes` ถูกเรียกพร้อมกัน 100 ครั้ง | ใช้แคชทะเบียน 30 วินาที (ไม่ยิง DB ซ้ำ) · แคชล้างเมื่อเขียน |

## 14. Build order (slices)

1. **Slice 1 (35 นาที): รหัส + key + parser + หน้า `/product-codes`** — migration 001 · `key.ts`, `parser.ts` + tests ตารางใน §5.2 · `facts.ts` · routes codes (สร้าง/แก้โน้ต/ย้าย/ลบ/bulk/suggest) · หน้ารหัส + i18n · ลบ placeholder route · export `findProductCodes` จริง (**โพสต์ `DONE F22 … findProductCodes จริงแล้ว TO:C2 TO:B2` เมื่อมีคนขอ**)
2. **Slice 2 (25 นาที): หน้านำเสนอ + ไลฟ์** — `sessions.ts`, `getPresentation`, `setFeatured` · `/live/present` (bare) + `/live` ส่วนไลฟ์ · realtime · tests `presentation`
3. **Slice 3 (30 นาที): ตะกร้าจากแชต** — `chat-scan.ts`, `carts.ts`, `proposeCart` (ต้องมี F13 slice 1; ถ้ายัง ใช้ fake propose แล้วเปิดปุ่มเมื่อมีของจริง) · hook `confirmed` · แผงข้างแชต · ตัวจำลองคอมเมนต์ · sweep · seed/demo · Playwright smoke

## 15. UNCONFIRMED และสิ่งที่ต้องตรวจในวันงาน

| ข้อ | วิธีตรวจ |
|---|---|
| F08 `getCatalogItemDetails` ให้ `variants[].effectivePriceMinor` / `effectiveStock` และรูปแบบ `CatalogItemDetail` ตามที่ F08 §4 เขียน | อ่าน `service.ts` ของ F08 หลัง merge; ถ้าชื่อฟิลด์ต่าง ให้แก้เฉพาะ `facts.ts` (ใช้ `getPrice` รายบรรทัดเป็นทางสำรอง: ช้ากว่าแต่ถูก) |
| endpoint รายการสินค้าของ F08 ที่หน้ารหัสใช้เลือกสินค้า (`GET /businesses/:b/catalog/items`) | อ่าน F08 §3 และทดสอบ; ถ้าไม่มี ให้ใช้ช่องกรอก SKU (`bulk` รองรับ SKU อยู่แล้ว) |
| การเรียก F13 `createStaffQuote`/`registerOrderHook` ผ่าน `service.ts` ของ F13 (lane เดียวกัน) พร้อม `proposalId` ใน payload ของ hook | ตรวจที่ F13 slice 2; ถ้า payload ไม่มี `proposalId` ให้เพิ่ม (A2 เจ้าของทั้งสอง) |
| `saveMessage` รับ `origin:'comment'`, `triggerAi:false`, ลูกค้า `channel:'web'` ที่ `externalId` ไม่ใช่ visitor token ของ Demo Chat และ inbox แสดงชื่อ `[จำลอง] …` | ทดสอบหลัง slice 3 · ถ้า A1 กรองลูกค้า `live-sim:` ออกจาก inbox (ตั้งแต่ F37 ขอซ่อน `eval-`) ต้องคุยกัน: `NEED TO:A1` |
| คอมเมนต์จากไลฟ์จริงและ API ของ Meta สำหรับ live comments (webhook `live_videos`/`feed`) | ไม่ทำในฟีเจอร์นี้ · C2 F21 (P2) เรียก `addToLiveCart` เมื่อพร้อม · ตรวจสิทธิ์ `pages_read_engagement`/live comments ที่ F21 |
| ตัวอ่านรหัสบนข้อความไทยจริงของลูกค้า (คำพูดเช่น "เอาตัวนี้ A12 สองอันค่ะ" — ตัวเลขไทยเป็นคำ "สอง") | ไม่รองรับเลขเป็นคำ (จำนวน = 1 และแจ้งผ่านการ์ดสรุปให้ลูกค้าตรวจ) · เก็บตัวอย่างจริงในวันงานแล้วเพิ่มคำ (`หนึ่ง สอง สาม …`) ใน `parser.ts` ถ้าเวลาเหลือ |
| ประสิทธิภาพ `getCatalogItemDetails` ต่อการโหลดหน้านำเสนอทุก 3 วินาที | ใช้ `≤ 100 ids` (ไม่มีการเรียกต่อรหัส) · ถ้าช้า เพิ่ม `PRESENT_POLL_SECONDS` เป็น 5 |
