-- dependsOn: core
CREATE TABLE line_actions (
  id text PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9]{12}$'),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('order','booking')),
  proposal_id text NOT NULL,
  version int NOT NULL,
  decision text NOT NULL CHECK (decision IN ('confirm','cancel')),
  review_token_enc text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX line_actions_expiry ON line_actions (expires_at);
