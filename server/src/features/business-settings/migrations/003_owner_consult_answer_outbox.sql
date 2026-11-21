-- dependsOn: core
CREATE TABLE owner_consult_answer_outbox (
  business_id uuid NOT NULL,
  case_id uuid NOT NULL,
  action_step_id text NOT NULL,
  answer_receipt_id uuid NOT NULL UNIQUE REFERENCES owner_consult_steps(answer_receipt_id) ON DELETE CASCADE,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  queued_at timestamptz,
  job_id uuid,
  PRIMARY KEY (business_id,case_id,action_step_id),
  FOREIGN KEY (business_id,case_id,action_step_id)
    REFERENCES owner_consult_steps(business_id,case_id,action_step_id) ON DELETE CASCADE,
  CHECK ((queued_at IS NULL) = (job_id IS NULL))
);
CREATE INDEX owner_consult_answer_outbox_due ON owner_consult_answer_outbox (next_attempt_at) WHERE queued_at IS NULL;
