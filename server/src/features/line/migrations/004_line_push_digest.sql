-- dependsOn: core
ALTER TABLE line_delivery_batches
  ADD COLUMN request_digest text CHECK (request_digest IS NULL OR request_digest ~ '^[0-9a-f]{64}$');
