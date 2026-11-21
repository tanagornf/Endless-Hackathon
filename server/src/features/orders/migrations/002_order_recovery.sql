-- dependsOn: core
ALTER TABLE order_receipts ADD COLUMN conflict_details jsonb;
ALTER TABLE order_outbox ADD COLUMN payment_fallback_required boolean;
CREATE UNIQUE INDEX orders_confirmed_proposal ON orders (business_id,proposal_id) WHERE proposal_id IS NOT NULL;
