-- dependsOn: core
CREATE TABLE voice_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  line_user text NOT NULL,
  line_bot text NOT NULL,
  source_event text NOT NULL,
  basic_id text,
  language text NOT NULL CHECK (language IN ('th', 'en')),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  UNIQUE (business_id, line_bot, source_event)
);

CREATE TABLE voice_invite_challenges (
  proof_digest text PRIMARY KEY,
  code_digest text NOT NULL UNIQUE,
  invite_id uuid NOT NULL REFERENCES voice_invites(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  verified_at timestamptz
);
CREATE INDEX voice_challenges_invite ON voice_invite_challenges (invite_id);

CREATE TABLE voice_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_id uuid NOT NULL UNIQUE REFERENCES voice_invites(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  proof_digest text NOT NULL,
  save_transcript boolean NOT NULL,
  model text,
  provider_session_id text UNIQUE,
  mode text CHECK (mode IN ('openai', 'fake')),
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  ended_at timestamptz
);
CREATE INDEX voice_sessions_history ON voice_sessions (business_id, customer_id, started_at DESC);
CREATE INDEX voice_sessions_daily ON voice_sessions (business_id, started_at DESC);

CREATE TABLE voice_transcripts (
  session_id uuid NOT NULL REFERENCES voice_sessions(id) ON DELETE CASCADE,
  seq bigint GENERATED ALWAYS AS IDENTITY,
  item_id text NOT NULL,
  start_ms integer NOT NULL,
  end_ms integer NOT NULL,
  role text NOT NULL CHECK (role IN ('customer', 'assistant')),
  text text NOT NULL CHECK (length(text) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, item_id)
);
