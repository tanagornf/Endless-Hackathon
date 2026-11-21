-- dependsOn: core
CREATE TABLE catalog_stock_adjustments (
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
  variant_id uuid,
  stock_variant_id uuid,
  ref_type text NOT NULL,
  ref_id text NOT NULL,
  reason text NOT NULL CHECK (reason IN ('order','order_cancel','correction')),
  delta int NOT NULL,
  stock_after int CHECK (stock_after >= 0),
  item_version int NOT NULL CHECK (item_version >= 1),
  UNIQUE NULLS NOT DISTINCT (business_id, ref_type, ref_id, item_id, variant_id)
);
