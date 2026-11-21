-- dependsOn: core
ALTER TABLE line_delivery_batches
  DROP CONSTRAINT line_delivery_batches_state_check,
  ADD CONSTRAINT line_delivery_batches_state_check
    CHECK (state IN ('accepted', 'unknown') OR (mode = 'push' AND state = 'pending'));
