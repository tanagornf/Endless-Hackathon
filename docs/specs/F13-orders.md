# F13 orders — ใบเสนอที่แก้ไม่ได้ ความยินยอมของลูกค้า และออเดอร์

| | |
|---|---|
| Lane / คน | **A2** / **A** · ลำดับ 1 ใน lane (F13 → F14 → F22) |
| Tier / เป้า | **P1** · เป้า **R** · stretch ของ golden path: slice 1 (`propose`) ให้ B2 ใช้ก่อน 12:30 ถ้า P1 เปิดทัน |
| Timebox | 60–150 นาที |
| เริ่มเมื่อ | หัวหน้าโพสต์ `LEAD: OPEN P1` |
| พึ่ง | F08 `getProduct`, `getPrice`, `adjustCatalogStock` (ไม่บังคับ: fake = ไม่ตัดสต็อก) · F09 `getConversation`, `getHistory` · F31 `notify` · core (`db`, `jobs`, `sendToCustomer`, `audit`, `publish`, `requirePermission`) |
| ให้ | `createOrderFromProposal` (ใช้โดย B2 F10 stage `propose` · A1 F09/C2 postback stage `confirm`) · `getOrderMetrics` (B3 F27) · `listOrdersByCustomer` (B2 F38, F10) · ภายใน lane: `getOrderForPayment`, `setPaymentState`, `registerOrderHook` (F14, F22) |
| ใช้ | ดู §4 |
| โฟลเดอร์ | `server/src/features/orders/` · `shared/features/orders/types.ts` · `web/src/features/orders/` |
| Web path | `/orders` (เมนูกลุ่ม `commerce`) |

อ่าน: `contracts.ts` (OrderSummary, CreateOrderFromProposalInput/Result, OrderReviewPart, ConfirmRequest, ProposalSummary, ShippingRule, ErrorCode, SEED/SEED_CHECKS) · F08 spec §4 (`getPrice`, `adjustCatalogStock`, กฎ version) · F10 spec §5 tool `propose_order` · F09 spec §4.x (action postback) และ §7 (render `order_review`) · [COOKBOOK](../COOKBOOK.md) (jobs, sendToCustomer, optimistic lock)

## 1. เป้าหมายและ user stories

ทำไมมี: AI ที่ "สร้างออเดอร์เอง" จากข้อความโมเดลเป็นความเสี่ยงเรื่องเงิน ระบบนี้แยกสองขั้น: **propose** = ใบสรุปที่คำนวณจากราคา DB ตอนนั้นและแก้ไม่ได้ (ยังไม่มีออเดอร์) · **confirm** = ลูกค้ากดปุ่มบนการ์ด (ไม่ใช่ข้อความโมเดล ไม่ใช่คำว่า "ยืนยัน" ที่พิมพ์) จึงสร้างออเดอร์ · ราคา สต็อก ค่าส่งตรวจซ้ำตอน confirm

ผู้ใช้: ลูกค้า (การ์ดสรุป ยืนยัน/ยกเลิก) · พนักงาน/เจ้าของ (ดู/จัดการออเดอร์, ส่งใบสรุปให้ลูกค้าเอง, ใส่เลขพัสดุ) · B2 (tool) · F14/F22 (ชำระเงิน, ตะกร้าไลฟ์)

User stories:
1. ลูกค้าคุยกับ AI → AI เรียก `propose` → ลูกค้าเห็นการ์ดสรุป (รายการ, ค่าส่ง, ยอดรวม, หมดอายุใน 15 นาที) กด "ยืนยัน" → ได้ข้อความรับออเดอร์ + ข้อความชำระเงิน (F14)
2. ลูกค้ากดยืนยันซ้ำ (แตะสองครั้ง/webhook ซ้ำ) → ได้ออเดอร์เดียว
3. ราคาหรือค่าส่งเปลี่ยนระหว่างรอ → การยืนยันถูกปฏิเสธ (`VERSION_CONFLICT`) และลูกค้าได้ใบสรุปใหม่อัตโนมัติ · สินค้าหมด → `SOLD_OUT`
4. พนักงานเห็นออเดอร์ทั้งหมด กรองตามสถานะ ใส่ที่อยู่ ติ๊ก "กำลังเตรียม" → "ส่งแล้ว" (เลขพัสดุ + ขนส่ง ลูกค้าได้ข้อความ) → "ส่งถึงแล้ว" · ยกเลิกได้ (คืนสต็อก)
5. พนักงานสร้างใบสรุปให้ลูกค้าในแชตเอง (เลือกสินค้า) ลูกค้ากดยืนยันเอง
6. พนักงานสองคนกดพร้อมกัน → คนที่สองได้ 409 และเห็นสถานะล่าสุด
7. ออเดอร์ที่ไม่มีใครจ่ายภายใน 7 วันถูกยกเลิกเองและคืนสต็อก

นอกขอบเขต: แก้รายการสินค้า/ราคาในออเดอร์ที่ยืนยันแล้ว (ให้ยกเลิกแล้วออกใบสรุปใหม่), ส่วนลด/คูปอง/ภาษี, หลายคลังสินค้า, คืนเงินจริง (ติดป้ายอย่างเดียว), ที่อยู่จัดส่งจากลูกค้าผ่านแบบฟอร์ม (พนักงานกรอกจากแชต), การคำนวณค่าส่งตามน้ำหนัก/ระยะ, รายงานพิมพ์

## 2. Data model

`server/src/features/orders/migrations/001_orders.sql`:

```sql
-- dependsOn: core
CREATE TABLE order_settings (
  business_id uuid PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  shipping_kind text NOT NULL DEFAULT 'flat' CHECK (shipping_kind IN ('flat','threshold')),
  shipping_fee_minor int NOT NULL DEFAULT 0 CHECK (shipping_fee_minor BETWEEN 0 AND 10000000),
  free_from_subtotal_minor int CHECK (free_from_subtotal_minor IS NULL OR free_from_subtotal_minor > 0),
  pickup_enabled boolean NOT NULL DEFAULT true,
  proposal_ttl_minutes int NOT NULL DEFAULT 15 CHECK (proposal_ttl_minutes BETWEEN 5 AND 120),
  order_expiry_days int NOT NULL DEFAULT 7 CHECK (order_expiry_days BETWEEN 1 AND 60),
  version int NOT NULL DEFAULT 1,
  updated_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((shipping_kind = 'threshold') = (free_from_subtotal_minor IS NOT NULL))
);

CREATE TABLE order_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  version int NOT NULL CHECK (version >= 1),               -- ลำดับใบสรุปในแชตนี้ (1, 2, 3 …)
  origin text NOT NULL CHECK (origin IN ('ai','staff','live','other')),   -- จาก prefix ของ clientRequestId (§5.1)
  lines jsonb NOT NULL,                                    -- ReviewLine[] + catalogVersion ต่อบรรทัด (snapshot แก้ไม่ได้)
  delivery_method text NOT NULL CHECK (delivery_method IN ('shipping','pickup')),
  shipping_rule jsonb NOT NULL,                            -- ShippingRule ที่ใช้ตอนนั้น (snapshot)
  subtotal_minor bigint NOT NULL CHECK (subtotal_minor >= 0),
  delivery_fee_minor bigint NOT NULL CHECK (delivery_fee_minor >= 0),
  total_minor bigint NOT NULL CHECK (total_minor >= 0),
  review_token text NOT NULL,                              -- สุ่ม 24 ไบต์ base64url · ไม่ใช่ความลับของระบบ (อยู่ในการ์ด)
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','confirmed','cancelled','superseded','expired')),
  expires_at timestamptz NOT NULL,
  client_request_id text NOT NULL,
  request_hash text NOT NULL,                              -- sha256 ของ payload ที่ทำให้เกิดใบสรุป (ตรวจ IDEMPOTENCY_CONFLICT)
  created_by_user_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  UNIQUE (business_id, client_request_id),
  UNIQUE (conversation_id, version)
);
CREATE INDEX order_proposals_open ON order_proposals (conversation_id) WHERE state = 'open';

CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  order_number text NOT NULL,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  proposal_id uuid REFERENCES order_proposals(id) ON DELETE SET NULL,
  origin text NOT NULL CHECK (origin IN ('ai','staff','live','other')),
  status text NOT NULL DEFAULT 'awaiting_payment'
    CHECK (status IN ('awaiting_payment','paid','preparing','shipped','delivered','cancelled')),
  payment_state text NOT NULL DEFAULT 'unpaid'
    CHECK (payment_state IN ('unpaid','pending_verification','paid','refunded')),
  version int NOT NULL DEFAULT 1,
  delivery_method text NOT NULL CHECK (delivery_method IN ('shipping','pickup')),
  subtotal_minor bigint NOT NULL CHECK (subtotal_minor >= 0),
  delivery_fee_minor bigint NOT NULL CHECK (delivery_fee_minor >= 0),
  total_minor bigint NOT NULL CHECK (total_minor >= 0),
  currency text NOT NULL DEFAULT 'THB' CHECK (currency = 'THB'),
  shipping_address jsonb,                                  -- { name, phone, line1, line2?, district?, province, postalCode } (พนักงานกรอก)
  tracking_carrier text,
  tracking_number text,
  customer_note text NOT NULL DEFAULT '',
  paid_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text CHECK (cancel_reason IS NULL OR cancel_reason IN ('customer_request','out_of_stock','unpaid','expired','other')),
  refund_note text,
  stock_returned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, order_number),
  CHECK (payment_state <> 'paid' OR status <> 'awaiting_payment'),
  CHECK (status <> 'awaiting_payment' OR payment_state IN ('unpaid','pending_verification'))
);
CREATE INDEX orders_list ON orders (business_id, created_at DESC, id DESC);
CREATE INDEX orders_customer ON orders (business_id, customer_id, created_at DESC);
CREATE INDEX orders_status ON orders (business_id, status, created_at DESC);
CREATE INDEX orders_expiry ON orders (created_at) WHERE status = 'awaiting_payment' AND payment_state = 'unpaid';

CREATE TABLE order_items (
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  line_no int NOT NULL,
  item_id uuid NOT NULL,                                   -- catalog id (ไม่มี FK ข้ามฟีเจอร์)
  variant_id uuid,
  sku text NOT NULL,
  name text NOT NULL,
  quantity int NOT NULL CHECK (quantity BETWEEN 1 AND 99),
  unit_price_minor bigint NOT NULL CHECK (unit_price_minor >= 0),
  line_total_minor bigint NOT NULL CHECK (line_total_minor >= 0),
  catalog_version int NOT NULL,
  PRIMARY KEY (order_id, line_no)
);

-- ผลของ confirm ต่อ clientRequestId (idempotency) · เก็บ response เพื่อ replay
CREATE TABLE order_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  client_request_id text NOT NULL,
  request_hash text NOT NULL,
  proposal_id uuid NOT NULL REFERENCES order_proposals(id) ON DELETE CASCADE,
  decision text NOT NULL CHECK (decision IN ('confirm','cancel')),
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, client_request_id)
);

-- งานที่ต้องทำหลัง commit (ส่งข้อความ, เรียก hook ชำระเงิน, แจ้งเตือน): เขียนในทรานแซกชันเดียวกับ order
CREATE TABLE order_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('confirmation','payment_request','staff_notify','cancel_notice','ship_notice')),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','done','failed')),
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  done_at timestamptz,
  UNIQUE (order_id, kind)
);

-- ประวัติการเปลี่ยนสถานะ/การกระทำของ staff (แสดงในหน้ารายละเอียด)
CREATE TABLE order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  action text NOT NULL,
  from_status text, to_status text, from_payment text, to_payment text,
  actor_kind text NOT NULL CHECK (actor_kind IN ('customer','staff','system')),
  actor_user_id uuid REFERENCES users(id),
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_events_order ON order_events (order_id, created_at);
```

กฎ: ไม่แก้ตาราง core · ทุก query กรอง `business_id` · เงิน integer สตางค์ · `order_proposals.lines` และ `orders`/`order_items` ไม่แก้หลังสร้าง (ยกเว้นคอลัมน์สถานะ/จัดส่งที่ระบุ) · ไม่มี FK ไป catalog (ไม่ผูก migration ข้ามฟีเจอร์) · `order_number` รูปแบบ §5.4 · seed ดู §9

### State machine ของ `orders` (สถานะ × การชำระเงิน)

`version` เพิ่ม 1 ทุกครั้งที่ `status` หรือ `payment_state` เปลี่ยน (และเมื่อ staff แก้ที่อยู่/เลขพัสดุ/หมายเหตุ) · เขียนผ่านฟังก์ชันเดียว `transition()` (§5.6)

ตาราง `status` (event → ผล):

| from | event | to | เงื่อนไข / ผลข้าง |
|---|---|---|---|
| (ไม่มี) | confirm สำเร็จ | `awaiting_payment` (+ `payment_state: unpaid`) | ตัดสต็อก · outbox |
| `awaiting_payment` | `payment_state` → `paid` (F14 หรือ staff `mark_paid`) | `paid` | ตั้ง `paid_at` |
| `paid` | `start_preparing` | `preparing` | |
| `preparing` | `ship` (เฉพาะ `shipping`; ต้องมีเลขพัสดุ + ขนส่ง) | `shipped` | ตั้ง `shipped_at` · outbox `ship_notice` |
| `preparing` | `deliver` (เฉพาะ `pickup`) | `delivered` | ตั้ง `delivered_at` |
| `shipped` | `deliver` | `delivered` | |
| `awaiting_payment` | `cancel` | `cancelled` | คืนสต็อก · outbox `cancel_notice` · F14 hook `cancelled` |
| `paid` / `preparing` | `cancel` (ต้องมี `refundNote`) | `cancelled` | `payment_state` → `refunded` · คืนสต็อก · outbox `cancel_notice` |
| `awaiting_payment` | ครบ `order_expiry_days` (schedule) และ `payment_state = unpaid` | `cancelled` (`expired`) | คืนสต็อก · ไม่ส่งข้อความ |
| `shipped` / `delivered` / `cancelled` | `cancel` | — | ปฏิเสธ `POLICY_BLOCKED` `illegal_transition` |

ตาราง `payment_state` (เปลี่ยนได้เฉพาะตามนี้):

| from | to | ใครทำ |
|---|---|---|
| `unpaid` | `pending_verification` | F14 (สลิปรอคนตรวจ) |
| `pending_verification` | `unpaid` | F14 (staff ปฏิเสธสลิป) |
| `unpaid` / `pending_verification` | `paid` | F14 (สลิปผ่าน/staff ยืนยัน) หรือ staff `mark_paid` ของ F13 |
| `paid` | `refunded` | เฉพาะใน `cancel` ของ staff พร้อม `refundNote` (ไม่มีการคืนเงินจริงในระบบ: เป็นการบันทึกว่า staff คืนเงินนอกระบบแล้ว) |

ห้ามอย่างอื่น (เช่น `paid` → `unpaid`) · `CHECK` ใน DDL กัน `status = awaiting_payment` ที่ `payment_state = paid` และกลับกัน

## 3. API endpoints

ทุก path ใต้ `/api/v1` · `defineFeatureRoutes({ featureId: 'F13', slug: 'orders' })` · การยืนยันของลูกค้าไม่มี route สาธารณะของฟีเจอร์นี้: เข้าทาง F09 (`/public/demo-chat/:slug/actions`) และ C2 (postback) ที่เรียก `createOrderFromProposal` stage `confirm` โดยตรง

| Method | Path | auth | permission | Request | Response | Errors |
|---|---|---|---|---|---|---|
| GET | `/businesses/:businessId/orders` | business | `orders.read` | `ListQuery` | `Page<OrderListRow>` | VALIDATION_ERROR |
| GET | `/businesses/:businessId/orders/summary` | business | `orders.read` | `{ from?, to? }` | `OrdersSummary` | VALIDATION_ERROR |
| GET | `/businesses/:businessId/orders/by-conversation/:conversationId` | business | `orders.read` | — | `{ orders: OrderListRow[]; openProposal: ProposalView \| null }` | NOT_FOUND |
| GET | `/businesses/:businessId/orders/:orderId` | business | `orders.read` | — | `OrderDetail` | NOT_FOUND |
| POST | `/businesses/:businessId/orders/:orderId/actions` | business | `orders.write` | `OrderActionBody` | `OrderDetail` | NOT_FOUND, VERSION_CONFLICT (`details.currentVersion`, `currentStatus`), POLICY_BLOCKED (`details.reason`), VALIDATION_ERROR |
| POST | `/businesses/:businessId/orders/quotes` | business | `orders.write` (+ ตรวจ `chat.reply` ใน handler) | `StaffQuoteBody` | `{ proposal: ProposalSummary; review: OrderReviewPart; messageId: string }` | NOT_FOUND, SOLD_OUT, VALIDATION_ERROR, POLICY_BLOCKED, IDEMPOTENCY_CONFLICT |
| POST | `/businesses/:businessId/orders/proposals/:proposalId/cancel` | business | `orders.write` | `{}` | `{ ok: true }` | NOT_FOUND, POLICY_BLOCKED (`not_open`) |
| GET | `/businesses/:businessId/orders/settings` | business | `orders.read` | — | `OrderSettingsView` | — |
| PUT | `/businesses/:businessId/orders/settings` | business | `business.commerce` | `UpdateOrderSettingsBody` | `OrderSettingsView` | VALIDATION_ERROR, VERSION_CONFLICT |

```ts
import { z } from 'zod';
const Uuid = z.string().uuid();
export const ListQuery = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  status: z.enum(['awaiting_payment', 'paid', 'preparing', 'shipped', 'delivered', 'cancelled']).optional(),
  paymentState: z.enum(['unpaid', 'pending_verification', 'paid', 'refunded']).optional(),
  q: z.string().trim().max(80).optional(),                  // เลขออเดอร์ (prefix) หรือชื่อลูกค้า (ILIKE)
  customerId: Uuid.optional(),
});
const Address = z.object({
  name: z.string().trim().min(1).max(80), phone: z.string().trim().regex(/^[0-9+\-\s]{8,20}$/),
  line1: z.string().trim().min(1).max(200), line2: z.string().trim().max(200).optional(),
  district: z.string().trim().max(80).optional(), province: z.string().trim().min(1).max(80),
  postalCode: z.string().trim().regex(/^\d{5}$/),
}).strict();
export const OrderActionBody = z.discriminatedUnion('action', [
  z.object({ action: z.literal('mark_paid'), expectedVersion: z.number().int().min(1), note: z.string().trim().min(5).max(300) }).strict(),   // รับเงินนอกระบบ (เงินสด/โอนตรง) ต้องมีหมายเหตุ
  z.object({ action: z.literal('start_preparing'), expectedVersion: z.number().int().min(1) }).strict(),
  z.object({ action: z.literal('ship'), expectedVersion: z.number().int().min(1),
    carrier: z.string().trim().min(2).max(40), trackingNumber: z.string().trim().regex(/^[A-Za-z0-9\-]{3,40}$/) }).strict(),
  z.object({ action: z.literal('deliver'), expectedVersion: z.number().int().min(1) }).strict(),
  z.object({ action: z.literal('cancel'), expectedVersion: z.number().int().min(1),
    reason: z.enum(['customer_request', 'out_of_stock', 'unpaid', 'other']), note: z.string().trim().max(300).optional(),
    refundNote: z.string().trim().min(5).max(300).optional() }).strict(),                 // บังคับเมื่อ payment_state = paid
  z.object({ action: z.literal('set_address'), expectedVersion: z.number().int().min(1), address: Address }).strict(),
  z.object({ action: z.literal('add_note'), expectedVersion: z.number().int().min(1), note: z.string().trim().min(1).max(300) }).strict(),
]);
export const StaffQuoteBody = z.object({
  conversationId: Uuid,
  items: z.array(z.object({ sku: z.string().trim().min(1).max(60), variantId: Uuid.nullable().default(null),
    quantity: z.number().int().min(1).max(99) }).strict()).min(1).max(20),
  deliveryMethod: z.enum(['shipping', 'pickup']),
  clientRequestId: z.string().trim().min(8).max(80).optional(),      // ไม่ส่ง = server สร้าง `staff:<uuid>`
}).strict();
export const UpdateOrderSettingsBody = z.object({
  expectedVersion: z.number().int().min(0),                           // 0 = ยังไม่มีแถว
  enabled: z.boolean(),
  shippingKind: z.enum(['flat', 'threshold']),
  shippingFeeBaht: z.number().min(0).max(100000).multipleOf(0.01),
  freeFromSubtotalBaht: z.number().min(0.01).max(10000000).multipleOf(0.01).nullable(),   // บังคับเมื่อ threshold
  pickupEnabled: z.boolean(),
  proposalTtlMinutes: z.number().int().min(5).max(120),
  orderExpiryDays: z.number().int().min(1).max(60),
}).strict();
```

(ตัวเลขเงินในหน้าตั้งค่าเป็นบาท → แปลงเป็นสตางค์ด้วย `parsePriceToMinor` ของ F08 ก่อนเขียน · ข้อความ `(…)` ของ F08 บอกว่า number ถูกตีเป็นบาทและ ≤ 2 ทศนิยม)

```ts
// shared/features/orders/types.ts
export interface OrderListRow extends OrderSummary { orderNumber: string; customerName: string; channel: Channel; deliveryMethod: 'shipping' | 'pickup'; origin: 'ai' | 'staff' | 'live' | 'other'; itemCount: number; trackingNumber: string | null; needsAddress: boolean }
export interface OrderEventView { id: string; action: string; fromStatus: string | null; toStatus: string | null; fromPayment: string | null; toPayment: string | null; actorKind: 'customer' | 'staff' | 'system'; actorName: string | null; details: Record<string, unknown>; createdAt: string }
export interface OrderDetail extends OrderListRow {
  customerId: string | null; customerNote: string; shippingAddress: { name: string; phone: string; line1: string; line2?: string; district?: string; province: string; postalCode: string } | null;
  trackingCarrier: string | null; paidAt: string | null; shippedAt: string | null; deliveredAt: string | null; cancelledAt: string | null; cancelReason: string | null; refundNote: string | null;
  events: OrderEventView[];
}
export interface ProposalView { id: string; version: number; state: 'open' | 'confirmed' | 'cancelled' | 'superseded' | 'expired'; totalMinor: number; expiresAt: string; origin: string; createdAt: string }
export interface OrdersSummary { counts: Record<'awaiting_payment' | 'paid' | 'preparing' | 'shipped' | 'delivered' | 'cancelled', number>; pendingVerification: number; revenueMinor: number }
export interface OrderSettingsView { businessId: string; enabled: boolean; shippingKind: 'flat' | 'threshold'; shippingFeeMinor: number; freeFromSubtotalMinor: number | null; pickupEnabled: boolean; proposalTtlMinutes: number; orderExpiryDays: number; version: number }
```

`OrdersSummary.revenueMinor` = ผลรวม `total_minor` ของออเดอร์ที่ `paid_at` อยู่ในช่วง (ค่าเริ่มต้น 30 วันล่าสุด) และ `payment_state = 'paid'` · cursor = base64url(JSON `{ createdAt, id }`)

## 4. Service functions และ contracts

ไฟล์ภายใน: `service.ts` (public) · `config.ts` · `propose.ts` · `confirm.ts` · `shipping.ts` · `token.ts` · `transition.ts` · `stock.ts` · `order-number.ts` · `outbox.ts` · `messages.ts` · `hooks.ts` · `metrics.ts` · `repo.ts` · `routes.ts` · `seed.ts` · `*.test.ts`

### Contract additions

ลีดวางใน `contracts.ts` ส่วน F13 (ต่อจาก `createOrderFromProposal`):

```ts
export interface OrderMetrics {
  /** Orders created (confirmed by the customer) with created_at in [from, to). */
  ordersCreated: number;
  /** Of those, orders whose proposal came from the AI tool (origin 'ai'): "orders the AI proposed and the customer confirmed". */
  ordersFromChat: number;
  /** Orders with paid_at in [from, to) whose payment_state is still 'paid' (refunded excluded). */
  ordersPaid: number;
  /** Sum of total_minor of those paid orders, in satang. */
  revenueMinor: number;
}
/**
 * @owner F13 orders · A2 · consumer: B3 F27 (seller impact metrics)
 * Half-open UTC range [range.from, range.to). Cancelled orders count in ordersCreated but never in ordersPaid / revenueMinor
 * unless they were paid and are still payment_state 'paid' (cancelled-and-refunded are excluded). ordersFromChat <= ordersCreated.
 * Invalid range (from >= to, not ISO) → VALIDATION_ERROR. Tenant-scoped by businessId.
 * @fake all zeros: { ordersCreated: 0, ordersFromChat: 0, ordersPaid: 0, revenueMinor: 0 }.
 */
export declare function getOrderMetrics(businessId: string, range: MetricsRange): Promise<OrderMetrics>;

/**
 * @owner F13 orders · A2 · consumers: B2 F38 follow-ups (did the customer order?), B2 F10
 * Newest first. opts.since = created_at >= since (ISO UTC). limit default 20, max 100 (more → 100; < 1 or not an integer →
 * VALIDATION_ERROR). Returns every status including 'cancelled' (callers filter). Another business's customer → [].
 * @fake [] (no orders).
 */
export declare function listOrdersByCustomer(
  businessId: string,
  customerId: string,
  opts?: { since?: string; limit?: number },
): Promise<OrderSummary[]>;
```

`createOrderFromProposal` (contract เดิม ต้องตรงทุกตัวอักษร): stage `propose` | `confirm` · พฤติกรรมเต็มใน §5.1–§5.3

ฟังก์ชันภายใน lane (ไม่ใช่ contract ข้าม lane; F14/F22 ใช้ผ่าน `service.ts`):

| ฟังก์ชัน | พฤติกรรม |
|---|---|
| `getOrderForPayment(businessId, orderId)` | `{ id, orderNumber, status, paymentState, totalMinor, version, conversationId, customerId, customerName }` · ไม่พบ/ร้านอื่น = `NOT_FOUND` |
| `setPaymentState({ businessId, orderId, to, actor, tx? })` | เขียนผ่าน `transition()` · อนุญาตเฉพาะ `to ∈ { pending_verification, unpaid, paid }` ตามตาราง payment_state ข้างบน และต้อง `status = awaiting_payment` มิฉะนั้น `POLICY_BLOCKED` `order_not_payable` · `to = paid` → `status = paid`, `paid_at = now()` · ไม่เรียก hook · คืน `OrderSummary` · ใช้ `tx` ที่ผู้เรียกส่งมา (ถ้ามี) |
| `registerOrderHook(name, fn)` | `name ∈ 'confirmed' \| 'paid' \| 'cancelled'` · `fn(order: OrderSummary & { orderNumber: string; proposalId: string | null }, ctx: { actor }) => Promise<void>` (F22 ใช้ `proposalId` จับคู่ตะกร้าไลฟ์) · F14 ลงทะเบียนใน `register()` · เรียกจาก outbox/ staff action เท่านั้น (นอกทรานแซกชัน) · hook throw = outbox แถวนั้น `failed` + retry |
| `getOrderMetrics`, `listOrdersByCustomer` | contract ด้านบน |
| `createStaffQuote(input)` | ใช้โดย route `/orders/quotes` และ F22 (chat panel): เรียก `createOrderFromProposal` stage `propose` แล้ว `sendToCustomer(conversationId, [text, order_review], { author: 'staff', authorUserId, businessId, clientRequestId: 'quote:<proposalId>' })` |

F13 เรียก: F08 `getPrice({ ...ref, variantId, quantity })`, `getProduct`, `adjustCatalogStock` · F09 `getConversation(conversationId, { businessId })` · F31 `notify` · core `sendToCustomer`, `jobs.enqueue`, `audit`, `publish`

## 5. Algorithms

ค่าคงที่ใน `config.ts`:

| ค่า | ค่า | ปรับ |
|---|---|---|
| `PROPOSAL_TTL_MINUTES` (ต่อร้าน) | 15 (5–120) | หน้าตั้งค่า |
| `ORDER_EXPIRY_DAYS` (ต่อร้าน) | 7 (1–60) | หน้าตั้งค่า |
| `MAX_LINES` | 20 บรรทัดต่อใบสรุป (รวมซ้ำแล้ว) | const |
| `MAX_QTY` | 99 ต่อบรรทัด | const |
| `SWEEP_EVERY_SECONDS` | 600 | const |
| `OUTBOX_MAX_ATTEMPTS` | 6 | const |
| `ORDER_NUMBER_LETTERS` | `ABCDEFGHJKMNPQRSTVWXYZ` (22 ตัว ไม่มีตัวเลข ไม่มี I L O U) | const |

### 5.1 `propose` (`propose.ts`)

อินพุต `{ businessId, conversationId, items: [{ ref: ProductRef, variantId?, quantity }], deliveryMethod, clientRequestId }`

1. validate: `items` 1–20 บรรทัด · `quantity` ต้องเป็นจำนวนเต็ม 1–99 มิฉะนั้น `VALIDATION_ERROR` (`details.field='quantity'`) ก่อนเรียก F08 · `clientRequestId` 8–80 ตัว
2. ธุรกิจ: `getConversation(conversationId, { businessId })` null = `NOT_FOUND` · `status = 'closed'` → `POLICY_BLOCKED` `conversation_closed` · โหลด `order_settings` (ไม่มีแถว = ค่าเริ่มต้นจาก SEED ของร้านตอน seed; ร้านที่ `enabled=false` → `POLICY_BLOCKED` `orders_disabled`) · `pickup` แต่ `pickup_enabled=false` → `POLICY_BLOCKED` `pickup_disabled`
3. **idempotency ของ propose:** `request_hash = sha256(canonicalJson({ conversationId, items (เรียงตาม sku หรือ itemId, variantId, quantity), deliveryMethod }))` · มีแถว `order_proposals` ที่ `(business_id, client_request_id)` เดิม: hash เท่า → **คืนใบสรุปเดิม** (สร้าง `review`/`proposal` จากแถว: `reviewToken` เดิม, `expiresAt` เดิม, ไม่เช็กราคาซ้ำ) แม้หมดอายุแล้ว · hash ต่าง → `IDEMPOTENCY_CONFLICT`
4. รวมบรรทัดซ้ำ (เหมือน `itemId`+`variantId` เดียวกัน → บวกจำนวน ≤ 99 เกิน = `VALIDATION_ERROR`)
5. ต่อบรรทัด: `quote = getPrice(businessId, { ...ref, variantId, quantity })` · `NOT_FOUND` ส่งต่อ (`details.sku`) · สินค้า `kind='service'` (หา `getProduct` ได้ `kind`) → `VALIDATION_ERROR` `details.reason='service_not_orderable'` (บริการเป็นงานของ F15) · `quote.soldOut` → `SOLD_OUT` (`details.sku`, `details.available`) · เก็บ `{ itemId, variantId, sku, name, quantity, unitPriceMinor, lineTotalMinor = subtotalMinor, catalogVersion = quote.version }` · `deliveryMethod = 'shipping'` และ `getProduct().shippable === false` → `VALIDATION_ERROR` `not_shippable` (`details.sku`)
6. `subtotal = Σ lineTotal` · `deliveryFee = computeShipping(rule, subtotal, deliveryMethod)` (§5.5) · `total = subtotal + deliveryFee` (integer ทั้งหมด)
7. token: `reviewToken = randomBytes(24).toString('base64url')` · `version = (SELECT COALESCE(MAX(version),0)+1 FROM order_proposals WHERE conversation_id = $1)` · `expires_at = now + proposal_ttl`
8. `db.tx`: `UPDATE order_proposals SET state='superseded', decided_at=now() WHERE conversation_id=$1 AND state='open'` (ใบเก่าที่ยังเปิดถูกแทนที่) · `INSERT order_proposals` (ชน unique `(business_id, client_request_id)` ในการแข่งกัน → อ่านแถวที่ชนแล้วทำตามข้อ 3) · `origin` = prefix ของ `clientRequestId` ก่อน `:` ถ้าอยู่ใน `ai|staff|live` มิฉะนั้น `other` (`ai:${turnId}:order` → `ai`)
9. คืน `{ stage:'propose', state:'awaiting_confirmation', proposal: ProposalSummary { id, kind:'order.create', version, expiresAt, summary, reviewToken }, review: OrderReviewPart { type:'order_review', proposalId, version, lines (ReviewLine: itemId, variantId, sku, name, quantity, unitPriceMinor, lineTotalMinor), subtotalMinor, deliveryFeeMinor, totalMinor, currency:'THB', expiresAt, reviewToken } }` · `summary` = ข้อความไทย `สั่งซื้อ {n} รายการ ยอดรวม {amount} บาท` (สร้างโดยโค้ด)
10. **ไม่บันทึกข้อความและไม่ส่ง** (ผู้เรียก: F10 แนบ `review` ในคำตอบ, `createStaffQuote` ส่งเอง)

### 5.2 `confirm` (`confirm.ts`) — ลำดับสำคัญ

อินพุต `{ stage:'confirm', businessId, conversationId, actor, clientRequestId, proposalId, version, reviewToken, decision }`

**ก. ตรวจก่อนแตะข้อมูล (นอกทรานแซกชัน)**
1. `request_hash = sha256(canonicalJson({ proposalId, version, decision, reviewToken }))`
2. อ่าน `order_receipts` ด้วย `(business_id, clientRequestId)`: พบและ hash เท่า → **replay**: `{ stage:'confirm', receiptId, replayed:true, order: (จากแถว order_id | null), decision }` (ไม่ส่งข้อความซ้ำ ไม่แตะอะไร) · hash ต่าง → `IDEMPOTENCY_CONFLICT`
3. โหลด proposal `WHERE id=$1 AND business_id=$2 AND conversation_id=$3` ไม่พบ = `NOT_FOUND` (ไม่บอกว่าเป็นของร้านอื่น) · `reviewToken` ไม่ตรง (เทียบแบบ constant-time `timingSafeEqual`) → `VALIDATION_ERROR` `details.reason='bad_review_token'` (ไม่ replay) · `actor.kind = 'staff'` ต้องมี `userId` และผ่าน `orders.write` ที่ชั้น route/caller (service ตรวจ `userId` ไม่ว่าง)
4. สถานะ proposal:
   - `version ≠ proposal.version` หรือ `state = 'superseded'` → `VERSION_CONFLICT` (`details.reason='superseded'`, `latestProposalId` ถ้ามี)
   - `state = 'confirmed'`: ถ้า `decision = 'confirm'` → replay ผลเดิม (หาแถว order ของ proposal นี้) และบันทึก receipt ใหม่ของ clientRequestId นี้ (`replayed:true`) · ถ้า `decision = 'cancel'` → `POLICY_BLOCKED` `already_confirmed`
   - `state = 'cancelled'`: `decision = 'cancel'` → replay (`order: null`) · `confirm` → `POLICY_BLOCKED` `proposal_cancelled`
   - `now() > expires_at` หรือ `state = 'expired'` → ตั้ง `expired` แล้ว `PROPOSAL_EXPIRED` (ทั้ง confirm และ cancel: ยกเลิกใบที่หมดอายุไม่ต้องทำอะไร ตอบ `PROPOSAL_EXPIRED`)
5. `decision = 'cancel'` → `db.tx`: `UPDATE order_proposals SET state='cancelled', decided_at=now() WHERE id=$1 AND state='open'` (แถวหาย = แข่งกัน: อ่านใหม่แล้วทำตามข้อ 4) · INSERT `order_receipts (decision cancel)` · **ส่งข้อความตรงนอกทรานแซกชัน** `sendToCustomer` `ยกเลิกรายการสั่งซื้อให้แล้วค่ะ` ด้วย `clientRequestId: 'proposal-cancel:<proposalId>'` (ถ้าส่งล้มไม่ throw: การยกเลิกสำเร็จแล้ว; ไม่ใช้ outbox เพราะยังไม่มีแถว order) · คืน `{ replayed:false, order:null, decision:'cancel' }`

**ข. `decision = 'confirm'` — ตรวจใหม่ทุกบรรทัด (นอกทรานแซกชัน เพราะเรียก F08)**
6. ต่อบรรทัดของ `lines`: `q = getPrice(businessId, { itemId, variantId, quantity })` · `NOT_FOUND` (สินค้าถูกลบ/ปิด) → `SOLD_OUT` (`details.reason='unavailable'`, `sku`) · `q.soldOut` → `SOLD_OUT` (`details.sku`) · `q.unitPriceMinor ≠ line.unitPriceMinor` → เก็บใน `changes[]`
7. ค่าส่ง: `computeShipping(ตั้งค่าปัจจุบัน, subtotal เดิม, deliveryMethod)` ≠ `delivery_fee_minor` ของใบสรุป (ร้านเปลี่ยนค่าส่ง) → เพิ่มใน `changes[]` (`field:'delivery_fee'`)
8. `changes.length > 0` → **requote:** (ก) ตั้งใบสรุปนี้เป็น `superseded` (ข) ออกใบสรุปใหม่อัตโนมัติด้วยบรรทัดเดิม (`propose` ภายใน, `clientRequestId = 'requote:<proposalId>'`, origin คงเดิม) แล้วส่งการ์ดใหม่ให้ลูกค้า: `sendToCustomer(conversationId, [{ type:'text', text:'ราคาหรือค่าจัดส่งมีการเปลี่ยนแปลงค่ะ รบกวนตรวจสอบใบสรุปใหม่อีกครั้งนะคะ' }, review], { author:'ai', origin:'system', businessId, clientRequestId:'requote-msg:<proposalId>' })` (ค) บันทึก receipt (decision confirm, `order_id null`) เพื่อ replay เป็น VERSION_CONFLICT เดิม แล้ว throw `VERSION_CONFLICT` (`details = { reason: 'price_changed', changes, requoteProposalId, requoteVersion }`) · ถ้าขั้น (ข) ล้ม (เช่น `SOLD_OUT` ตอนออกใบใหม่) ยังต้อง throw `VERSION_CONFLICT`/`SOLD_OUT` ตามจริงและไม่ทิ้งใบเดิมเป็น `open`
9. ตัดสต็อก (เรียก F08 นอกทรานแซกชันของเรา เพราะเป็นบริการอื่น): `orderId = randomUUID()` ล่วงหน้า · ต่อบรรทัดตามลำดับ `adjustCatalogStock({ businessId, itemId, variantId, delta: −quantity, reason:'order', refType:'order', refId: orderId, actorUserId: null })` (idempotent ต่อ `(order, item, variant)`) · ผล `SOLD_OUT` ที่บรรทัด k → **คืนบรรทัดก่อนหน้า** ด้วย `delta:+quantity, reason:'order_cancel', refType:'order_cancel', refId: orderId` แล้ว throw `SOLD_OUT` (`details.sku`) · `stockAfter:null, applied:false` (ไม่นับสต็อก/fake) = ข้ามเงียบ ๆ
10. `db.tx` (บล็อกเดียว):
    1. `SELECT … FROM order_proposals WHERE id=$1 FOR UPDATE` ตรวจ `state='open'` อีกครั้ง (ไม่ใช่ = ย้อนไปข้อ 4: ปล่อยให้ผู้ชนะ; คืนสต็อกข้อ 9 ก่อน)
    2. `order_number = generateOrderNumber()` (§5.4; ชน unique → สุ่มใหม่ ≤ 5 ครั้ง)
    3. INSERT `orders` (id = orderId; `status 'awaiting_payment'`, `payment_state 'unpaid'`, snapshot ยอดจากใบสรุป, `origin` จากใบสรุป, `customer_id` จากใบสรุป) + `order_items` + `order_events (action 'order.create', actor_kind customer|staff)`
    4. `UPDATE order_proposals SET state='confirmed', decided_at=now() WHERE id=$1 AND state='open'` (rowCount 1 มิฉะนั้น rollback)
    5. INSERT `order_receipts` (`decision 'confirm'`, `order_id`)
    6. INSERT `order_outbox` 3 แถว: `confirmation`, `payment_request`, `staff_notify`
11. rollback / error หลังข้อ 9 → **คืนสต็อกทุกบรรทัด** (`order_cancel`, refId = orderId) ใน `finally` (ถ้า process ตายระหว่างนั้น: สต็อกอาจค้างหัก ยอมรับ; พนักงานแก้สต็อกด้วยมือที่ F08 · บันทึกใน EVIDENCE.md)
12. หลัง commit: `audit({ action:'orders.order.create', actorUserId: actor.userId ?? null, businessId, targetType:'order', targetId: orderId, details:{ orderNumber, totalMinor, origin, lineCount } })` · `publish(businessId, { type:'custom', featureId:'F13', name:'orders.changed', data:{ orderId } })` · `jobs.enqueue('orders.outbox', { orderId }, { dedupKey: 'orders.outbox:'+orderId+':create', businessId, lockKey: 'order:'+orderId })`
13. คืน `{ stage:'confirm', receiptId, replayed:false, order: OrderSummary, decision:'confirm' }`

หมายเหตุ: ข้อ 6–9 อยู่นอก `db.tx` เพราะเรียกบริการอื่น (core ห้ามเรียกบริการ/โมเดลใน `tx`) · การแข่งกันของสองคำขอ confirm ต่างกัน clientRequestId บน proposal เดียวกัน: ผู้แพ้เจอข้อ 10.1/10.4 และคืนสต็อกของตัวเอง (idempotent ตาม refId ของ orderId ที่ต่างกัน)

### 5.3 ใครส่งข้อความหลัง confirm (outbox, `outbox.ts`)

**F13 เป็นผู้ส่งข้อความยืนยันถึงลูกค้าเอง** (ไม่ใช่ F09/C2/F10) ผ่าน `sendToCustomer` — ผู้เรียก confirm (F09 action route / C2 postback) แค่ส่งผลกลับ UI/ไม่ตอบซ้ำ · job `orders.outbox` ({ orderId }) ประมวลผลแถว `pending` ตามลำดับ `confirmation` → `payment_request` → `staff_notify` (แต่ละแถว: ทำ → `state='done'`; throw → `attempts+1`, `last_error` (ไม่มีข้อมูลลูกค้าเต็ม); job retry ตามค่าเริ่มต้น ≤ 6 ครั้ง แล้ว `failed` แถวนั้น + `audit orders.outbox.failed`)

| kind | การทำงาน | `clientRequestId` ของข้อความ |
|---|---|---|
| `confirmation` | `sendToCustomer(conversationId, [text], { author:'ai', origin:'system', businessId })` ข้อความไทย: `ขอบคุณค่ะ รับออเดอร์ {orderNumber} แล้ว ยอดรวม {amount} บาท` + (ถ้า `delivery_method='shipping'`) ` ทางร้านจะขอที่อยู่จัดส่งอีกครั้งนะคะ` | `order-confirm:<orderId>` |
| `payment_request` | มี hook `confirmed` (F14 ลงทะเบียน) → เรียก (F14 ส่งข้อความ QR เอง) · ไม่มี hook หรือ F14 ตอบ `payments_not_configured` → ส่ง `ทางร้านจะแจ้งวิธีชำระเงินให้อีกครั้งนะคะ` | `order-pay-fallback:<orderId>` |
| `staff_notify` | `notify({ businessId, type:'order.created', to:{ permission:'orders.read' }, title:'ออเดอร์ใหม่ {orderNumber}', body:'{customerName} · {amount} บาท', link:'/orders?o=<orderId>', dedupKey:'order.created:<orderId>' })` | — |
| `cancel_notice` (หลัง staff/หมดอายุ... เฉพาะ staff cancel) | ข้อความ `ออเดอร์ {orderNumber} ถูกยกเลิกแล้วค่ะ หากมีข้อสงสัยทักมาได้เลยนะคะ` | `order-cancel:<orderId>` |
| `ship_notice` | `ส่งสินค้าออเดอร์ {orderNumber} แล้วค่ะ ขนส่ง {carrier} เลขพัสดุ {trackingNumber}` | `order-ship:<orderId>` |

**ข้อความถึงลูกค้าทุกตัวของ F13 มีสองภาษา (แก้ 21 พ.ย. แทนกติกาเดิมที่ส่งไทยอย่างเดียว):** ภาษา = `await getCustomerLanguage(conversationId, { businessId })` ของ F09 (contracts.ts: ภาษาที่ลูกค้าพิมพ์ล่าสุด, ค่าเริ่มต้นคือภาษาของร้าน) · จำนวนเงินใช้ `formatMoneyText(minor, lang)` ของ core (`1,490 บาท` / `1,490 baht`) · `messages.ts` เก็บทุกข้อความเป็น `{ th, en }` · test: ทุก key มีทั้งสองภาษา และค่า `en` ไม่มีอักษรไทย · ข้อความไทยในตารางและขั้นตอนของ §5 คือค่า `th` ของ key ด้านล่าง:

| key (`messages.ts`) | th | en |
|---|---|---|
| `confirmation` | `ขอบคุณค่ะ รับออเดอร์ {orderNumber} แล้ว ยอดรวม {amount}` | `Thank you. We have received order {orderNumber}. Total {amount}.` |
| `confirmation.shipping` (ต่อท้าย) | ` ทางร้านจะขอที่อยู่จัดส่งอีกครั้งนะคะ` | ` The shop will ask you for the delivery address.` |
| `payment_fallback` | `ทางร้านจะแจ้งวิธีชำระเงินให้อีกครั้งนะคะ` | `The shop will send you the payment details here.` |
| `cancel_notice` | `ออเดอร์ {orderNumber} ถูกยกเลิกแล้วค่ะ หากมีข้อสงสัยทักมาได้เลยนะคะ` | `Order {orderNumber} has been cancelled. Message us here if you have any questions.` |
| `ship_notice` | `ส่งสินค้าออเดอร์ {orderNumber} แล้วค่ะ ขนส่ง {carrier} เลขพัสดุ {trackingNumber}` | `Order {orderNumber} has been shipped with {carrier}. Tracking number: {trackingNumber}` |
| `customer_cancelled` (ลูกค้ากดยกเลิกใบสรุป) | `ยกเลิกรายการสั่งซื้อให้แล้วค่ะ` | `Your order request has been cancelled.` |
| `requote` (ราคา/ค่าส่งเปลี่ยนตอนยืนยัน) | `ราคาหรือค่าจัดส่งมีการเปลี่ยนแปลงค่ะ รบกวนตรวจสอบใบสรุปใหม่อีกครั้งนะคะ` | `The price or delivery fee has changed. Please check the new summary.` |
| `proposal.summary` (`ProposalSummary.summary`) | `สั่งซื้อ {n} รายการ ยอดรวม {amount}` | `Order of {n} item(s), total {amount}` |

`{amount}` = `formatMoneyText(totalMinor, lang)` (รวมคำว่า บาท/baht แล้ว) · ชื่อสินค้าใน `ReviewLine.name` ของการ์ด = `nameEn` เมื่อ `lang === 'en'` และร้านกรอกไว้ มิฉะนั้น `name` (ภาษาของ propose = ภาษาเดียวกับ turn ของ F10 เพราะใช้ข้อความลูกค้าชุดเดียวกัน) · `staff_notify` เป็นข้อความถึงพนักงาน ใช้ภาษาของร้าน (`getBusinessSettings().language`): th `ออเดอร์ใหม่ {orderNumber}` / en `New order {orderNumber}`

ออเดอร์ไม่มี `conversation_id` (ถูกลบ) → ข้ามข้อความ ทำ `staff_notify` อย่างเดียว · ข้อความถูกสร้างโดยโค้ด (ไม่ใช้โมเดล) และ `author:'ai', origin:'system'` ให้ปรากฏเป็นบับเบิลขาออกปกติ (ตามตกลงกับ A1) · แถว outbox `cancel_notice`/`ship_notice` ถูกเพิ่มโดย `transition()` ในทรานแซกชันเดียวกับการเปลี่ยนสถานะ แล้ว enqueue job หลัง commit (dedupKey ต่างกันต่อ kind: `orders.outbox:<orderId>:<kind>`)

### 5.4 เลขออเดอร์ (`order-number.ts`)

รูปแบบ `NL-<DD><MON><YY>-<L4>-<L4>` เช่น `NL-20NOV26-KXPQ-MTRA` (วันที่ตาม timezone ของร้าน, `MON` อังกฤษ 3 ตัวพิมพ์ใหญ่, `L4` สุ่มจาก `ORDER_NUMBER_LETTERS` ด้วย `crypto.randomInt`) · **ห้ามมีตัวเลขติดกันเกิน 2 ตัว** (Messenger แปลงเลขยาวเป็นบัญชี PromptPay) → `DD` และ `YY` คั่นด้วยตัวอักษรเสมอ · ยาว 20 ตัวอักษร · `reference_code` ของ F14 = ตัดขีดออก (`NL20NOV26KXPQMTRA`, 17 ตัว) · ซ้ำในร้านเดียวกัน (unique) → สุ่มใหม่

### 5.5 ค่าส่ง (`shipping.ts`) — กฎจาก SPEC §5

`computeShipping(rule, subtotalMinor, deliveryMethod)`: `pickup` → 0 · `shipping` และ `rule.kind = 'flat'` → `feeMinor` · `rule.kind = 'threshold'` → `subtotalMinor >= freeFromSubtotalMinor ? 0 : feeMinor` (ค่าเท่ากับเกณฑ์ = ฟรี)

ค่าตาม seed (`SEED.businesses[].shipping`): ร้าน A `{ threshold, feeMinor: 10000, freeFromSubtotalMinor: 200000 }` · ร้าน B `{ flat, feeMinor: 5000 }` · แปลงเป็นแถว `order_settings` ตอน seed

**ตัวเลขตรวจ (SPEC §5 / `SEED_CHECKS`) — ต้องเป็น test:**

| ร้าน · สินค้า | subtotal | ค่าส่ง | รวม |
|---|---|---|---|
| A · A-GAME-01 ×2 | 298000 | 0 | **298000** |
| A · A-CARD-01 ×2 | 19800 | 10000 | **29800** |
| B · B-KIT-01 ×1 | 39000 | 5000 | **44000** |
| A · A-GAME-01 ×1 (ทดสอบขอบ: ต่ำกว่าเกณฑ์) | 149000 | 10000 | 159000 |
| A · A-CARD-01 ×2 `pickup` | 19800 | 0 | 19800 |
| A · A-GAME-01 ×1 + A-CARD-01 ×6 (= 149000 + 59400 = 208400 ≥ 200000) | 208400 | 0 | 208400 |
| A · A-SOLD-01 ×1 | — | — | `SOLD_OUT` |
| A · A-SERVICE-01 ×1 | — | — | `VALIDATION_ERROR` `service_not_orderable` |
| A · `quantity: 0` | — | — | `VALIDATION_ERROR` (ก่อนเรียก F08) |

### 5.6 `transition()` — ตัวเขียนสถานะตัวเดียว (`transition.ts`)

`transition({ tx, businessId, orderId, expected: { version?, status?, paymentState? }, to: { status?, paymentState?, patch? }, actor, action, details })`:
1. ตรวจ `(from → to)` กับตารางใน §2 ไม่อยู่ในตาราง → `POLICY_BLOCKED` `illegal_transition` (`details: { from, to }`)
2. `UPDATE orders SET status=…, payment_state=…, version=version+1, updated_at=now(), <patch> WHERE id=$1 AND business_id=$2 AND status=$3 AND payment_state=$4 [AND version=$5] RETURNING *` · ใช้ `version` เมื่อมาจาก staff (CAS) · F14 ไม่ส่ง version (ส่งแค่ status/paymentState)
3. rowCount 0 → อ่านใหม่: ไม่พบ `NOT_FOUND` · มี: ถ้า `expected.version` ให้และไม่เท่า หรือ status/payment ไม่ตรง → `VERSION_CONFLICT` (`details: { currentVersion, currentStatus, currentPaymentState }`)
4. INSERT `order_events` · เพิ่ม outbox ตาม kind ที่ต้อง · ทั้งหมดใน `tx` เดียวกัน · หลัง commit ผู้เรียก `audit` + `publish`
5. เหตุการณ์ที่ต้อง audit: `orders.order.mark_paid`, `orders.order.ship`, `orders.order.deliver`, `orders.order.cancel` (details: reason, refundNote มีหรือไม่), `orders.order.address` (ไม่ใส่ที่อยู่เต็ม), `orders.order.status` (start_preparing) · `add_note` ไม่ audit

### 5.7 staff actions (`POST …/actions`)

`orders.write` ทุก action · โหลดออเดอร์ `FOR UPDATE` ใน `tx` · `version ≠ expectedVersion` → 409 ก่อนทำอะไร

| action | เงื่อนไข | ผล |
|---|---|---|
| `mark_paid` | `status = awaiting_payment` | `payment_state → paid`, `status → paid`, `order_events.details.note` · เรียก hook `paid` หลัง commit (F14 ปิดคำขอ + ออกใบเสร็จ) · ข้อความถึงลูกค้ามาจาก F14 (hook); ไม่มี F14 → ไม่ส่ง |
| `start_preparing` | `status = paid` | `status → preparing` |
| `ship` | `status = preparing`, `delivery_method = shipping`, ที่อยู่กรอกแล้ว (`shipping_address` ไม่ null มิฉะนั้น `POLICY_BLOCKED` `address_required`) | `status → shipped`, `tracking_*`, `shipped_at`, outbox `ship_notice` |
| `deliver` | `status = shipped` หรือ (`preparing` และ `pickup`) | `status → delivered`, `delivered_at` |
| `cancel` | ตาม state machine; `payment_state = paid` ต้องมี `refundNote` (มิฉะนั้น `VALIDATION_ERROR` `refund_note_required`) | `status → cancelled`, `cancel_reason`, `cancelled_at`, (paid → `payment_state → refunded`, `refund_note`), **คืนสต็อก** (§5.8), outbox `cancel_notice`, hook `cancelled` หลัง commit |
| `set_address` | `status ∉ { shipped, delivered, cancelled }` | เขียน `shipping_address` · version+1 · event |
| `add_note` | ไม่ตรวจสถานะ | ต่อท้าย `customer_note` ด้วย `\n[พนักงาน] …` ไม่เกิน 2,000 ตัว (เกินตัดทิ้งส่วนเก่า) · version+1 |

ผลของทุก action คืน `OrderDetail` ล่าสุด · action ที่ผิดสถานะ → `POLICY_BLOCKED` `illegal_transition`

### 5.8 คืนสต็อก (`stock.ts`)

เมื่อ cancel (staff หรือหมดอายุ) และ `stock_returned = false`: ต่อบรรทัด `adjustCatalogStock({ delta:+quantity, reason:'order_cancel', refType:'order_cancel', refId: orderId, … })` (idempotent) → `UPDATE orders SET stock_returned=true` · ทำหลัง commit การเปลี่ยนสถานะ (ล้ม = job `orders.outbox` kind ภายในไม่มี: ใช้ schedule `orders.sweep` ตามแก้ `cancelled AND NOT stock_returned` ในรอบถัดไป) · ถ้า F08 เป็น fake (`applied:false`) ถือว่าสำเร็จ

### 5.9 schedule `orders.sweep` (ทุก 600 วินาที)

1. proposal: `UPDATE order_proposals SET state='expired' WHERE state='open' AND expires_at < now()`
2. ออเดอร์หมดอายุ: `status='awaiting_payment' AND payment_state='unpaid' AND created_at < now() − order_expiry_days` (join `order_settings`; ไม่มีแถว = 7 วัน) → `transition(cancel, reason 'expired', actor system)` ทีละแถว (limit 100/รอบ) · **ไม่แตะ** `pending_verification` (รอ staff ตรวจสลิป)
3. ซ่อมสต็อก: `status='cancelled' AND NOT stock_returned` → §5.8 (limit 100)
4. outbox ค้าง: แถว `pending` เก่ากว่า 5 นาที → enqueue `orders.outbox` ใหม่ (dedupKey รวมนาที)

## 6. AI calls

ไม่มี AI call (ใบสรุป ข้อความยืนยัน เลขออเดอร์ สร้างด้วยโค้ดทั้งหมด) · B2 (F10) เป็นผู้เรียก `propose` ผ่าน tool `propose_order` และส่ง `clientRequestId = 'ai:<turnId>:order'` · ข้อความโมเดลที่บอกว่า "ยืนยันแล้ว" ไม่มีผลใด ๆ (ไม่มีทางเข้า `confirm` จากข้อความ)

## 7. UI

**`/orders`** · `permission:'orders.read'` · `titleKey:'orders:page.title'` · เมนู `{ path:'/orders', labelKey:'orders:menu.title', group:'commerce', icon:'ReceiptLongOutlined', order:10, permission:'orders.read', searchTerms:['order','ออเดอร์','คำสั่งซื้อ','จัดส่ง'] }` · slot `chatSidePanels` id `orders.chat-panel` (order 10, permission `orders.read`): ออเดอร์/ใบสรุปล่าสุดของแชตนั้น (เลขออเดอร์, chip สถานะ + การชำระ, ยอด, ปุ่ม "ส่งใบสรุปให้ลูกค้า" เปิด dialog, ลิงก์ไป `/orders?o=<id>`)

หน้า `OrdersPage.tsx`:
1. `PageHeader` "ออเดอร์" + ปุ่ม "ตั้งค่าการขาย" (เฉพาะ `business.commerce` ผ่าน `useCan`) → `FormDialog` (`GET/PUT settings`: เปิดรับออเดอร์, ค่าส่งแบบเหมา/ฟรีเมื่อครบยอด, ค่าส่ง, ยอดฟรีค่าส่ง, รับหน้าร้าน, อายุใบสรุป, ยกเลิกเองหลัง N วัน; `VERSION_CONFLICT` → toast + โหลดใหม่)
2. แถบสรุป: จำนวนต่อสถานะ + "รอตรวจสลิป n" (ลิงก์ `/payments?tab=pending`) + ยอดที่ชำระแล้ว 30 วัน
3. กรอง: `Tabs` สถานะ (ทั้งหมด/รอชำระ/ชำระแล้ว/กำลังเตรียม/ส่งแล้ว/ส่งถึงแล้ว/ยกเลิก) + ช่องค้นหา
4. `DataTable`: เลขออเดอร์, ลูกค้า (+ ช่อง), รายการ (n), ยอด `formatMoney`, สถานะ `StatusChip kind="order"`, การชำระ `StatusChip kind="payment"`, เลขพัสดุ, เวลา `formatDateTime` · ป้าย "ต้องกรอกที่อยู่" เมื่อ `needsAddress`
5. คลิกแถว (`?o=<id>`) → ลิ้นชักรายละเอียด: ตารางรายการ + ยอด/ค่าส่ง/รวม · ที่อยู่ (ปุ่มแก้ → `FormDialog`) · ประวัติ (`order_events`) · ลิงก์ไปแชต `/chat?c=<conversationId>` และการชำระเงิน `/payments?order=<id>` · ปุ่มตามสถานะ (เฉพาะ `orders.write`; ไม่มีสิทธิ์ซ่อนปุ่ม): "ชำระแล้ว (รับเงินนอกระบบ)" (dialog หมายเหตุ ≥ 5) · "เริ่มเตรียมสินค้า" · "ส่งแล้ว" (dialog ขนส่ง + เลขพัสดุ; ปิดถ้ายังไม่มีที่อยู่) · "ส่งถึงแล้ว" · "ยกเลิก" (`ConfirmDialog` + เหตุผล + `refundNote` เมื่อจ่ายแล้ว) · หมายเหตุ · ทุก action ส่ง `expectedVersion` · `VERSION_CONFLICT` → toast + โหลดใหม่
6. dialog "ส่งใบสรุปให้ลูกค้า" (จาก chat panel): เลือกสินค้าจาก `GET /catalog/items` ของ F08 ผ่าน `useApiQuery` (ใช้ endpoint ของ F08: ห้าม import โค้ด F08 · ถ้า F08 ยังไม่มีให้ใช้ช่องกรอก SKU) + จำนวน + จัดส่ง/รับหน้าร้าน → `POST /orders/quotes` → toast "ส่งใบสรุปแล้ว" · แสดงยอดที่ server คำนวณหลังส่ง
7. states: loading (`DataTable loading`), empty (`EmptyState` "ยังไม่มีออเดอร์" + คำอธิบาย), error (ลองใหม่) · `useRealtime('custom', e => e.featureId==='F13' && reload())`

i18n (namespace `orders`; ฝั่งร้านไม่มี ค่ะ/ครับ ในปุ่มและป้าย):

| key | th | en |
|---|---|---|
| `menu.title` | ออเดอร์ | Orders |
| `page.title` | ออเดอร์ | Orders |
| `tab.all` | ทั้งหมด | All |
| `tab.awaiting_payment` | รอชำระ | Awaiting payment |
| `tab.paid` | ชำระแล้ว | Paid |
| `tab.preparing` | กำลังเตรียม | Preparing |
| `tab.shipped` | ส่งแล้ว | Shipped |
| `tab.delivered` | ส่งถึงแล้ว | Delivered |
| `tab.cancelled` | ยกเลิก | Cancelled |
| `search.placeholder` | ค้นหาเลขออเดอร์หรือชื่อลูกค้า | Search order number or customer |
| `summary.pendingSlips` | รอตรวจสลิป {{count}} รายการ | {{count}} slips to review |
| `summary.revenue` | ชำระแล้ว 30 วันล่าสุด | Paid, last 30 days |
| `col.number` | เลขออเดอร์ | Order no. |
| `col.customer` | ลูกค้า | Customer |
| `col.items` | รายการ | Items |
| `col.total` | ยอดรวม | Total |
| `col.status` | สถานะ | Status |
| `col.payment` | การชำระ | Payment |
| `col.tracking` | เลขพัสดุ | Tracking |
| `col.created` | สร้างเมื่อ | Created |
| `badge.needsAddress` | ต้องกรอกที่อยู่ | Address needed |
| `detail.lines` | รายการสินค้า | Items |
| `detail.subtotal` | ยอดสินค้า | Subtotal |
| `detail.delivery` | ค่าจัดส่ง | Delivery |
| `detail.total` | ยอดรวม | Total |
| `detail.address` | ที่อยู่จัดส่ง | Shipping address |
| `detail.noAddress` | ยังไม่มีที่อยู่ | No address yet |
| `detail.pickup` | รับหน้าร้าน | Store pickup |
| `detail.history` | ประวัติ | History |
| `detail.chat` | เปิดแชต | Open chat |
| `detail.payments` | ดูการชำระเงิน | View payment |
| `action.markPaid` | ชำระแล้ว (รับเงินนอกระบบ) | Mark paid (outside the app) |
| `action.startPreparing` | เริ่มเตรียมสินค้า | Start preparing |
| `action.ship` | ส่งแล้ว | Mark shipped |
| `action.deliver` | ส่งถึงแล้ว | Mark delivered |
| `action.cancel` | ยกเลิกออเดอร์ | Cancel order |
| `action.editAddress` | แก้ที่อยู่ | Edit address |
| `action.addNote` | เพิ่มหมายเหตุ | Add note |
| `form.note` | หมายเหตุ | Note |
| `form.noteRequired` | อย่างน้อย 5 ตัวอักษร | At least 5 characters |
| `form.carrier` | ขนส่ง | Carrier |
| `form.tracking` | เลขพัสดุ | Tracking number |
| `form.cancelReason` | เหตุผล | Reason |
| `form.refundNote` | บันทึกการคืนเงิน (คืนเงินนอกระบบแล้ว) | Refund note (refunded outside the app) |
| `reason.customer_request` | ลูกค้าขอยกเลิก | Customer asked |
| `reason.out_of_stock` | สินค้าหมด | Out of stock |
| `reason.unpaid` | ไม่ชำระเงิน | Unpaid |
| `reason.expired` | หมดเวลา | Expired |
| `reason.other` | อื่น ๆ | Other |
| `confirm.cancelTitle` | ยกเลิกออเดอร์นี้? | Cancel this order? |
| `confirm.cancelMessage` | สต็อกจะถูกคืน และลูกค้าจะได้รับข้อความแจ้งยกเลิก | Stock will be returned and the customer will be told |
| `toast.updated` | อัปเดตออเดอร์แล้ว | Order updated |
| `toast.conflict` | มีคนแก้ออเดอร์นี้ไปแล้ว โหลดใหม่ให้แล้ว | Someone changed this order. Reloaded |
| `toast.quoteSent` | ส่งใบสรุปให้ลูกค้าแล้ว | Order review sent |
| `error.address_required` | ต้องกรอกที่อยู่ก่อนส่งสินค้า | Enter the address before shipping |
| `error.sold_out` | สินค้า {{sku}} หมดสต็อก | {{sku}} is sold out |
| `quote.title` | ส่งใบสรุปให้ลูกค้า | Send an order review |
| `quote.sku` | รหัสสินค้า (SKU) | SKU |
| `quote.qty` | จำนวน | Quantity |
| `quote.method` | วิธีรับสินค้า | Receiving method |
| `quote.shipping` | จัดส่ง | Delivery |
| `quote.pickup` | รับหน้าร้าน | Pickup |
| `quote.add` | เพิ่มสินค้า | Add item |
| `quote.send` | ส่งใบสรุป | Send review |
| `panel.title` | ออเดอร์ของแชตนี้ | Orders of this chat |
| `panel.none` | ยังไม่มีออเดอร์ | No orders yet |
| `panel.openProposal` | มีใบสรุปรอลูกค้ายืนยัน ({{amount}}) | Review awaiting the customer ({{amount}}) |
| `settings.title` | ตั้งค่าการขาย | Selling settings |
| `settings.enabled` | เปิดรับออเดอร์ | Accept orders |
| `settings.kind` | ค่าจัดส่ง | Delivery fee |
| `settings.flat` | เหมาจ่าย | Flat |
| `settings.threshold` | ฟรีเมื่อยอดครบ | Free above a subtotal |
| `settings.fee` | ค่าจัดส่ง (บาท) | Fee (THB) |
| `settings.freeFrom` | ฟรีเมื่อยอดสินค้าตั้งแต่ (บาท) | Free from subtotal (THB) |
| `settings.pickup` | รับหน้าร้านได้ | Allow pickup |
| `settings.ttl` | ใบสรุปหมดอายุใน (นาที) | Review expires in (minutes) |
| `settings.expiry` | ยกเลิกออเดอร์ที่ไม่ชำระหลัง (วัน) | Cancel unpaid orders after (days) |
| `settings.saved` | บันทึกแล้ว | Saved |
| `empty.title` | ยังไม่มีออเดอร์ | No orders yet |
| `empty.description` | เมื่อลูกค้ายืนยันใบสรุปในแชต ออเดอร์จะแสดงที่นี่ | Orders appear here when a customer confirms an order review |
| `error.retry` | ลองใหม่ | Retry |

ข้อความถึงลูกค้า (§5.3) อยู่ใน `messages.ts` เป็น `{ th, en }` ทุก key และเลือกด้วย `getCustomerLanguage(conversationId)` (ตาราง "ข้อความถึงลูกค้าทุกตัวของ F13 มีสองภาษา" ใน §5.3 · ไม่ผ่าน i18n ฝั่งเว็บ)

## 8. Jobs, schedules, events

| รายการ | ค่า |
|---|---|
| job `orders.outbox` | payload `{ orderId }` · `dedupKey: orders.outbox:<orderId>:<kind หรือ create>` · `lockKey: order:<orderId>` · ประมวลผลแถว outbox `pending` ตามลำดับ (§5.3) · handler idempotent (ข้อความมี `clientRequestId`) |
| schedule `orders.sweep` | ทุก 600 วินาที (§5.9) |
| realtime | `custom` `featureId:'F13'` `name:'orders.changed'` `data:{ orderId }` |
| audit | `orders.order.create` · `orders.order.mark_paid` · `orders.order.status` · `orders.order.ship` · `orders.order.deliver` · `orders.order.cancel` · `orders.order.address` · `orders.settings.update` · `orders.outbox.failed` (details ไม่มีที่อยู่เต็ม/เบอร์) |
| notify | `order.created` ถึง `{ permission: 'orders.read' }` (§5.3) |
| hook | `confirmed` (หลัง outbox `payment_request`) · `paid` (staff `mark_paid`) · `cancelled` (staff cancel/หมดอายุ) |

## 9. Seed และ fixtures

`seed.ts` (idempotent):
- `order_settings` ร้าน A: `threshold`, `shipping_fee_minor 10000`, `free_from_subtotal_minor 200000`, pickup เปิด · ร้าน B: `flat`, `5000`, pickup เปิด · ทั้งสอง `proposal_ttl 15`, `order_expiry_days 7` (ค่าต้องเท่ากับ `SEED.businesses[].shipping`; test เทียบ)
- `runDemo(ctx)` (ร้าน A เท่านั้น, ผ่านฟังก์ชันของ service ไม่ INSERT ตรง): 5 ออเดอร์ย้อนหลังในลูกค้า seed `cust_a1`/`cust_a2`: `awaiting_payment` (A-CARD-01 ×2 = 29800), `paid` (A-GAME-01 ×2 = 298000), `preparing`, `shipped` (มีเลขพัสดุสังเคราะห์ `TH000TEST01`), `delivered` · และ 1 ใบสรุปหมดอายุ (ให้ F09 โชว์ "หมดอายุ") · `origin='ai'` 3 ใบ เพื่อให้ `getOrderMetrics` มีตัวเลขในเดโม · ไม่ตัดสต็อกของ seed (`stock_returned` ไม่เกี่ยว: ข้ามการเรียก `adjustCatalogStock` ใน demo)
- `resetDemo(ctx)`: ลบ `order_events`, `order_outbox`, `order_receipts`, `order_items`, `orders`, `order_proposals` ของร้านเดโม (ไม่ลบ settings)

Fixtures ของ test: `makeProposal(overrides)` · `fakeCatalog` (mock `getProduct/getPrice/adjustCatalogStock` ด้วย `SEED.catalog`: `vi.mock('../catalog/service')` คืนค่าตาม `SEED_CHECKS` และสามารถ "เปลี่ยนราคา" A-GAME-01 เป็น 159000 กลาง test) · `CLOCK_FIXTURE` · ลูกค้าแชต `conv_a_ai` ของ SEED

## 10. Tests

Unit/service (DB test จริง, `MODEL_MODE=fake` ไม่เกี่ยว):

| ไฟล์ | case |
|---|---|
| `shipping.test.ts` | ตารางตัวเลขใน §5.5 ทุกแถว (298000 / 29800 / 44000 / 159000 / 19800 pickup / 208400) · ขอบ: subtotal = 200000 → ฟรี, 199999 → 10000 |
| `propose.test.ts` | A-GAME-01 ×2 → total 298000 · A-CARD-01 ×2 → 29800 (fee 10000) · B-KIT-01 ×1 → 44000 · A-SOLD-01 → `SOLD_OUT` · service → `VALIDATION_ERROR service_not_orderable` · quantity 0/-1/1.5/'2'/100 → `VALIDATION_ERROR` · บรรทัดซ้ำรวมกัน · variantId ของ item อื่น → `NOT_FOUND` · propose ซ้ำ (clientRequestId+payload เดิม) → ใบเดิม token เดิม · payload ต่าง → `IDEMPOTENCY_CONFLICT` · propose ใหม่ใน conversation เดียวกัน → ใบเก่า `superseded` และ `version` 2 · conversation ร้านอื่น → `NOT_FOUND` · `closed` → `POLICY_BLOCKED` · ไม่มีแถวใน `orders` หลัง propose |
| `confirm.test.ts` | confirm สำเร็จ: order + items + receipt + outbox 3 แถว + `awaiting_payment/unpaid` + สต็อก A-GAME-01 ลด 2 · **ซ้ำ clientRequestId+payload เดิม → `replayed:true` order เดิม order เดียวใน DB** · id เดิม payload ต่าง → `IDEMPOTENCY_CONFLICT` · token ผิด → `VALIDATION_ERROR bad_review_token` · proposal ของ conversation อื่น → `NOT_FOUND` · หมดอายุ (`CLOCK_FIXTURE` +16 นาที) → `PROPOSAL_EXPIRED` · ใบเก่า (superseded) → `VERSION_CONFLICT` · **ราคา A-GAME-01 เปลี่ยนเป็น 159000 หลัง quote → `VERSION_CONFLICT price_changed` + requote ใบใหม่ `version+1` + ข้อความการ์ดใหม่ถูกส่ง + ไม่มี order** · ค่าส่งของร้านเปลี่ยน → requote · สต็อกหมดระหว่างรอ → `SOLD_OUT` ไม่มี order · สองบรรทัด บรรทัดที่สองหมด → บรรทัดแรกถูกคืนสต็อก · decision `cancel` → order null, state `cancelled`, ข้อความยกเลิก, confirm ตามหลัง → `proposal_cancelled` · confirm สองครั้งต่าง clientRequestId (แตะซ้ำ) → order เดียว `replayed:true` · แข่งกัน 2 confirm ขนานด้วย clientRequestId ต่างกัน → order เดียว · **ข้อความโมเดล "ยืนยันแล้ว" ไม่สร้าง order** (ไม่มีทางเรียก; test ยืนยันว่า `saveMessage` ของข้อความ AI ไม่ทำให้ตาราง orders เปลี่ยน) · `adjustCatalogStock` fake (`applied:false`) ยังสร้าง order ได้ |
| `transition.test.ts` | ทุกคู่ (from,to) ใน state machine ถูก/ผิด · CAS: `expectedVersion` เก่า → 409 พร้อม `currentVersion` · สอง staff กดพร้อมกัน → หนึ่งสำเร็จหนึ่ง 409 · cancel ออเดอร์ `paid` ไม่มี refundNote → `VALIDATION_ERROR` · cancel `shipped` → `illegal_transition` · `ship` ไม่มีที่อยู่ → `address_required` · `ship` pickup → `illegal_transition` · `deliver` pickup จาก `preparing` ผ่าน · `setPaymentState` paid เมื่อ status ไม่ใช่ awaiting → `order_not_payable` |
| `outbox.test.ts` | confirm → job ส่ง 2 ข้อความ (ยืนยัน + fallback เมื่อไม่มี hook) · มี hook `confirmed` → ไม่ส่ง fallback · ข้อความไม่ซ้ำเมื่อ job รันสองรอบ (`clientRequestId`) · `staff_notify` เรียก `notify` ครั้งเดียว · hook throw → attempts+1 แล้ว retry สำเร็จ |
| `sweep.test.ts` | ใบสรุปหมดอายุถูกตั้ง `expired` · ออเดอร์ `unpaid` อายุ 8 วัน ถูกยกเลิก คืนสต็อก · `pending_verification` ไม่ถูกแตะ · idempotent (รันซ้ำไม่คืนสต็อกซ้ำ) |
| `metrics.test.ts` | `getOrderMetrics`: ช่วงครึ่งเปิด `[from,to)` (ขอบ `to` ไม่รวม) · cancelled อยู่ใน `ordersCreated` ไม่อยู่ใน `ordersPaid` · refunded ไม่นับ revenue · `ordersFromChat` = เฉพาะ origin `ai` · ร้านอื่นไม่ปนกัน · `from >= to` → `VALIDATION_ERROR` · `listOrdersByCustomer`: ใหม่→เก่า, `since`, `limit` 101 → 100, 0 → `VALIDATION_ERROR`, ลูกค้าร้านอื่น → [] |
| `routes.test.ts` | permission: staff default (มี `orders.read` ไม่มี `orders.write`) เรียก actions → `PERMISSION_DENIED` · ตั้งค่า (`business.commerce`) · tenant isolation (order ID ของร้าน B ผ่านร้าน A → `NOT_FOUND`) · list กรองสถานะ/ค้นหา/cursor · `POST /orders/quotes` ส่งการ์ดลงแชตจริง (ข้อความ `order_review` ใน `getHistory`) และ `chat.reply` ขาด → `PERMISSION_DENIED` · quote ซ้ำ clientRequestId |

Playwright smoke `web/src/features/orders/e2e/orders.smoke.spec.ts` (production, ไม่พึ่ง AI, ใช้ `e2eMarker()`):

1. `api` fixture เปิดแชต Demo Chat ร้าน A (`/demo-chat/s/demo-boardgame`) พิมพ์ข้อความทักทายผ่าน `demo-chat-input`/`demo-chat-send` เพื่อให้มีแชต (ผู้เยี่ยมชมใหม่ที่มี marker)
2. `ownerPage` → `/chat` เปิดแชตนั้น → chat side panel ออเดอร์ → "ส่งใบสรุปให้ลูกค้า" เลือก `A-CARD-01` ×2 จัดส่ง → การ์ด `order_review` ปรากฏใน Demo Chat (`demo-chat-message` ที่มี "29,800" หรือ "298.00" ตามรูปแบบ `formatMoney`)
3. ลูกค้ากดปุ่ม "ยืนยัน" บนการ์ด (ค้นด้วย test id `order-review-confirm` ที่ F09 §7.3.1 กำหนดไว้) → ได้ข้อความ `รับออเดอร์ NL-…` และข้อความชำระเงิน/fallback
4. `ownerPage` → `/orders` เห็นออเดอร์ (ค้นด้วยชื่อลูกค้า marker) สถานะ "รอชำระ" ยอด 298.00 บาท (29800 สตางค์)
5. กด "ชำระแล้ว (รับเงินนอกระบบ)" ใส่หมายเหตุ `e2e <marker>` → chip เป็น "ชำระแล้ว" · "เริ่มเตรียมสินค้า" → "กำลังเตรียม" · กรอกที่อยู่ · "ส่งแล้ว" ด้วยเลข `E2E123` → ลูกค้าได้ข้อความเลขพัสดุใน Demo Chat · reload หน้า → ออเดอร์/ที่อยู่/เลขพัสดุยังอยู่
6. กดยืนยันการ์ดเดิมซ้ำ (หรือเรียก API confirm ด้วย clientRequestId เดิม) → ยังมีออเดอร์เดียว (`replayed`)
7. ออเดอร์ทดสอบปล่อยไว้ (marker) · ไม่แตะร้าน B ยกเว้นพิสูจน์ว่า `GET /businesses/<B>/orders/<id>` ด้วยเซสชันร้าน A ได้ 403/404

## 11. Acceptance: R ตาม D6

- [ ] ตัวเลข SPEC §5 ตรงทุกข้อ: A-GAME-01 ×2 = 298000 · A-CARD-01 ×2 = 29800 (ค่าส่ง 10000) · B-KIT-01 ×1 = 44000 · A-SOLD-01 → `SOLD_OUT`
- [ ] `propose` ไม่สร้าง order · คืน `review`/`proposal` ตาม contract · idempotent ต่อ clientRequestId
- [ ] ต้องมีปุ่มของลูกค้าจึงสร้าง order: ข้อความโมเดลหรือข้อความลูกค้าที่พิมพ์ "ยืนยัน" ไม่สร้าง order (ไม่มีโค้ดเส้นทางนั้น)
- [ ] confirm ซ้ำ payload เดิม → order เดียว (`replayed:true`) · id เดิม payload ใหม่ → `IDEMPOTENCY_CONFLICT`
- [ ] แก้ราคา A-GAME-01 เป็น 159000 หลัง quote แล้ว confirm quote เก่า → `VERSION_CONFLICT` และลูกค้าได้ใบสรุปใหม่ · หมดอายุ → `PROPOSAL_EXPIRED` · สต็อกหมด → `SOLD_OUT`
- [ ] staff action ด้วย version เก่า → 409 พร้อมสถานะล่าสุด · reload แล้ว order, ที่อยู่, เลขพัสดุยังอยู่
- [ ] ลูกค้าได้ข้อความยืนยันจาก F13 (ผ่าน `sendToCustomer`) และข้อความจัดส่ง/ยกเลิก
- [ ] ยกเลิกคืนสต็อก (เมื่อ F08 `adjustCatalogStock` เป็นของจริง) · ออเดอร์ไม่ชำระ 7 วันถูกยกเลิกเอง
- [ ] `getOrderMetrics` และ `listOrdersByCustomer` เป็นของจริง (B3/B2 เรียกได้)
- [ ] unit + route + Playwright smoke ผ่านบน production · loading/empty/error ครบ · i18n ไทย · permission + tenant · audit ทุกจุดที่เงิน/สถานะเปลี่ยน
- **สถานะ:** R เมื่อครบข้างบน · ถ้า slice 2 ไม่ทัน: `propose` = R, `confirm` = U (เหตุผลใน EVIDENCE.md) และซ่อนเมนู `/orders` · ถ้าไม่มี F14 ที่ merge: ยังเป็น R (staff `mark_paid` ใช้ได้)

## 12. Security และ privacy

- ลูกค้าเป็นผู้ยืนยันเท่านั้น: `stage:'confirm'` เรียกได้จาก F09 action route / C2 postback / staff (UI การ์ด) ไม่เคยจากโมเดล · ตรวจ `reviewToken` (constant-time) + `proposalId` + `conversationId` + business · token ผูกกับใบสรุปหนึ่งใบ (ไม่ใช่ความลับของระบบแต่เดาไม่ได้: 192 บิต)
- ราคา/สต็อก/ค่าส่งคำนวณใหม่ในเซิร์ฟเวอร์ทุกครั้งตอน confirm จาก F08 · ไม่รับตัวเลขเงินจากไคลเอนต์/โมเดล (input ของ propose มีแค่ ref + quantity)
- ทุก query กรอง `business_id` · staff ต้อง `orders.write` ทุก action · ข้อมูลที่อยู่/เบอร์เป็น PII: ไม่ใส่ใน audit/notify/log · `GET` ที่อยู่เฉพาะ `orders.read`
- `order_number` ไม่เดาลำดับได้ (สุ่ม) · ไม่มี route สาธารณะที่ดึงออเดอร์ด้วยเลขออเดอร์
- เงินเป็น integer · ตรวจ `Number.isSafeInteger` ตอนอ่าน `bigint` จาก `pg`
- ไม่มีการคืนเงินจริง: ป้าย `refunded` เป็นบันทึกของ staff (ต้องมี `refundNote`) · audit ครบ

## 13. Edge cases

| กรณี | ผลที่ต้องได้ |
|---|---|
| ลูกค้ากดยืนยันใบสรุปที่หมดอายุ | `PROPOSAL_EXPIRED` (UI: "ใบสรุปหมดอายุ ขอใหม่ได้เลยค่ะ") |
| ลูกค้ากดยืนยันใบเก่าหลังมีใบใหม่ | `VERSION_CONFLICT` `superseded` + แจ้ง `latestProposalId` |
| สองคนกดยืนยันพร้อมกัน (สองแชนเนล) | order เดียว · ตัวที่สองได้ `replayed:true` (ถ้า decision เท่ากัน) |
| process ตายหลังหักสต็อกก่อน commit | สต็อกหักค้าง (ยอมรับ) · พนักงานแก้ที่ F08 · บันทึกใน EVIDENCE.md |
| process ตายหลัง commit ก่อนส่งข้อความ | outbox `pending` → sweep enqueue ใหม่ → ส่ง (ไม่ซ้ำ) |
| สินค้าถูกลบ/ปิดหลังออกใบสรุป | `SOLD_OUT` (`reason:'unavailable'`) ตอน confirm |
| ใบสรุปมีสินค้าไม่ `shippable` + จัดส่ง | `VALIDATION_ERROR not_shippable` |
| ร้านปิดรับออเดอร์ (`enabled=false`) | propose → `POLICY_BLOCKED orders_disabled` (B2 ส่งต่อพนักงาน) |
| แชตปิดแล้ว | propose → `POLICY_BLOCKED conversation_closed` |
| พนักงานยกเลิกออเดอร์ที่ F14 มีคำขอชำระเปิดอยู่ | hook `cancelled` ปิดคำขอ |
| ยกเลิกออเดอร์ที่จ่ายแล้วโดยไม่ใส่ refundNote | `VALIDATION_ERROR refund_note_required` |
| สต็อกไม่นับ (`null`) | ข้ามการตัด/คืน (`applied:false`) |
| ลูกค้าขอเปลี่ยนจำนวนหลังยืนยัน | ไม่รองรับแก้: staff ยกเลิกแล้วส่งใบสรุปใหม่ |
| ออเดอร์ของลูกค้าที่ถูกลบ | `customer_id` เป็น null · ยังแสดงในรายการ (ชื่อ "ลูกค้าที่ถูกลบ") |
| `clientRequestId` เดียวกันใช้ข้ามร้าน | unique ต่อร้าน: ไม่ชนข้ามร้าน |

## 14. Build order (slices)

1. **Slice 1 (35 นาที): `propose` — B2 รอ** — migration (ตารางทั้งหมดของ §2 สร้างครั้งเดียว; ไม่มี migration หลายไฟล์) · `order_settings` + seed + `shipping.ts` · `token.ts` · `propose.ts` + `createOrderFromProposal` stage `propose` จริง (stage `confirm` ยังโยน `SERVICE_NOT_READY`) · `routes.ts` ลบ placeholder, GET/PUT settings · tests `shipping/propose` · **merge แล้วโพสต์ `DONE F13 … propose จริงแล้ว TO:B2`**
2. **Slice 2 (45 นาที): `confirm` + order row + outbox** — `confirm.ts` (idempotency, requote, สต็อก, tx) · `order-number.ts` · `transition.ts` · `outbox.ts` + `messages.ts` + job `orders.outbox` · hooks (`registerOrderHook`, `getOrderForPayment`, `setPaymentState`) · `listOrdersByCustomer`, `getOrderMetrics` จริง · tests `confirm/transition/outbox/metrics` · **โพสต์ `DONE F13 … confirm จริงแล้ว TO:A1 TO:C2 TO:B2` และ `listOrdersByCustomer`/`getOrderMetrics` `TO:B2 TO:B3`**
3. **Slice 3 (40 นาที): UI ฝั่งร้าน + staff actions** — `OrdersPage` (รายการ, ลิ้นชัก, actions, ตั้งค่า), chat panel slot, `POST /orders/quotes` + dialog · `actions` route + tests · Playwright smoke · schedule `orders.sweep` · `runDemo/resetDemo`
4. **Slice 4 (เสริม 15 นาที): polish** — requote message ที่เหลือ, ป้าย/ข้อความ, i18n en, EVIDENCE.md

## 15. UNCONFIRMED และสิ่งที่ต้องตรวจในวันงาน

| ข้อ | วิธีตรวจ |
|---|---|
| (ปิดแล้ว 21 พ.ย.) ปุ่มยืนยัน/ยกเลิกของ `order_review` ใน Demo Chat | test id `order-review-confirm` / `order-review-cancel` กำหนดใน F09 §7.3.1 (ห้ามเปลี่ยนชื่อ): smoke ใช้ test id นี้ |
| F08 `adjustCatalogStock` เป็นของจริงตอนที่ F13 slice 2 merge หรือไม่ | อ่าน `service.ts` ของ F08: ถ้ายังเป็น fake (`applied:false`) F13 ยังทำงานได้ แต่สต็อกไม่ลด · ทดสอบ "สต็อกลด 2" ในสเปคเฉพาะเมื่อของจริงมา · โพสต์ `NEED TO:B1` ถ้าจำเป็น |
| F09 action route คืน error code ของ F13 ครบ (`PROPOSAL_EXPIRED`, `VERSION_CONFLICT`, `SOLD_OUT`) ให้ UI ลูกค้าแปลเป็นข้อความสุภาพ | ทดสอบหลัง slice 2 บน Demo Chat: ใบหมดอายุ, ราคาเปลี่ยน |
| C2 postback ใส่ `clientRequestId` ที่เสถียรต่อ event (ไม่สุ่มใหม่ทุก retry) | อ่านโค้ด F17 หลัง merge; ถ้าไม่เสถียร ยังปลอดภัยเพราะ proposal state `confirmed` (replay ด้วย receipt ใหม่) |
| ผู้ส่งข้อความ `author:'ai'`, `origin:'system'` render เป็นบับเบิลปกติใน Demo Chat/LINE | ตามข้อตกลงกับ A1 (F38 ใช้แบบเดียวกัน) ทดสอบด้วยตาหลัง slice 2 |
| ลำดับ `adjustCatalogStock` ก่อนสร้างแถว (ไม่ใช่ใน tx เดียว) ทำให้สต็อกหักค้างเมื่อ process ตาย | ยอมรับสำหรับงานแฮกกาธอน · ตรวจโดย test "ล้มหลังหัก" ด้วย mock ที่ throw ใน tx แล้วคืนสต็อก |
| ค่าตั้ง `order_settings` ของร้านใหม่ (ที่ F03 สร้างหลัง seed): ไม่มีแถว | ใช้ค่าเริ่มต้นของโค้ด `flat 0` (ฟรี) และ `enabled=true` · ร้านเดโมมีแถวจาก seed · แจ้ง C3 ถ้าต้องสร้างแถวตอน onboarding (ไม่บังคับ) |
