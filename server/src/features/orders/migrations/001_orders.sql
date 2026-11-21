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
  reply_language text NOT NULL CHECK (reply_language IN ('th','en')),
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
