-- dependsOn: core
CREATE TABLE team_ai_handoff_receipts (
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  turn_id uuid NOT NULL,
  reason text NOT NULL CHECK (char_length(reason) > 0),
  expected_version integer NOT NULL CHECK (expected_version > 0),
  committed_version integer NOT NULL CHECK (committed_version = expected_version + 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  notification_due_at timestamptz NOT NULL DEFAULT now(),
  notification_result text CHECK (notification_result IN ('real', 'sandbox', 'obsolete')),
  PRIMARY KEY (business_id, conversation_id, turn_id),
  UNIQUE (business_id, conversation_id, committed_version)
);
CREATE INDEX team_ai_handoff_notifications_due ON team_ai_handoff_receipts (notification_due_at)
  WHERE notification_result IS NULL;
