-- dependsOn: core
ALTER TABLE owner_consult_steps ADD COLUMN learning_queued_at timestamptz;
CREATE INDEX owner_consult_learning_due ON owner_consult_steps (answered_at, answer_receipt_id)
  WHERE reuse = 'propose_draft' AND state = 'answered' AND customer_ready_at IS NOT NULL AND learning_queued_at IS NULL;
