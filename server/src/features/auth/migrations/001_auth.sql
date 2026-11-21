-- dependsOn: core
CREATE TABLE auth_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_tokens_open ON auth_tokens (user_id, purpose) WHERE used_at IS NULL;

CREATE TABLE auth_login_attempts (
  email_normalized text PRIMARY KEY,
  failed_count int NOT NULL DEFAULT 0,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email text NOT NULL,
  to_email_normalized text GENERATED ALWAYS AS (lower(btrim(to_email))) STORED,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  template text NOT NULL CHECK (template IN ('verify_email', 'reset_password', 'invitation')),
  locale text NOT NULL CHECK (locale IN ('th', 'en')),
  subject text NOT NULL,
  body_text text NOT NULL,
  action_url_enc text NOT NULL,
  mode text NOT NULL DEFAULT 'sandbox' CHECK (mode = 'sandbox'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX email_outbox_to ON email_outbox (to_email_normalized, created_at DESC);

CREATE TABLE auth_seed_password_state (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  fingerprint text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
