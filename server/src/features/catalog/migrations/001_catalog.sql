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
