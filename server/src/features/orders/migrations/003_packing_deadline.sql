-- dependsOn: core
ALTER TABLE orders ADD COLUMN ship_by_at timestamptz;
CREATE INDEX orders_shipping_queue ON orders (business_id,ship_by_at,order_number)
  WHERE delivery_method='shipping' AND status IN ('awaiting_payment','paid','preparing');
