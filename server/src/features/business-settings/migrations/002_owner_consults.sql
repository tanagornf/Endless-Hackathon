-- dependsOn: core
CREATE TABLE owner_consult_cases (
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  trigger_message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  language text NOT NULL CHECK (language IN ('th','en')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id,id),
  UNIQUE (business_id,trigger_message_id)
);

CREATE TABLE owner_consult_steps (
  business_id uuid NOT NULL,
  case_id uuid NOT NULL,
  action_step_id text NOT NULL,
  question text NOT NULL CHECK (char_length(question) BETWEEN 1 AND 1200),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','answered')),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  answer text CHECK (char_length(answer) BETWEEN 1 AND 2000),
  answer_receipt_id uuid UNIQUE,
  answer_request_id text,
  answered_by uuid,
  answered_at timestamptz,
  reuse text CHECK (reuse IN ('case_only','propose_draft')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id,case_id,action_step_id),
  FOREIGN KEY (business_id,case_id) REFERENCES owner_consult_cases(business_id,id) ON DELETE CASCADE,
  CHECK (
    (state='pending' AND answer IS NULL AND answer_receipt_id IS NULL AND answer_request_id IS NULL
       AND answered_by IS NULL AND answered_at IS NULL AND reuse IS NULL)
    OR
    (state='answered' AND answer IS NOT NULL AND answer_receipt_id IS NOT NULL AND answer_request_id IS NOT NULL
       AND answered_by IS NOT NULL AND answered_at IS NOT NULL AND reuse IS NOT NULL)
  )
);
CREATE UNIQUE INDEX owner_consult_one_pending_step ON owner_consult_steps (business_id,case_id) WHERE state='pending';

CREATE TABLE owner_consult_outbox (
  business_id uuid NOT NULL,
  case_id uuid NOT NULL,
  action_step_id text NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  PRIMARY KEY (business_id,case_id,action_step_id),
  FOREIGN KEY (business_id,case_id,action_step_id)
    REFERENCES owner_consult_steps(business_id,case_id,action_step_id) ON DELETE CASCADE
);
CREATE INDEX owner_consult_outbox_due ON owner_consult_outbox (next_attempt_at) WHERE delivered_at IS NULL;
