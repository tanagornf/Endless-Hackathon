-- dependsOn: core
CREATE TABLE invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (char_length(email) <= 200),
  email_normalized text GENERATED ALWAYS AS (lower(btrim(email))) STORED,
  role text NOT NULL DEFAULT 'staff' CHECK (role = 'staff'),
  permissions text[] NOT NULL DEFAULT '{}',
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','revoked','declined')),
  invited_by uuid REFERENCES users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  accepted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX invitations_one_pending ON invitations (business_id, email_normalized) WHERE status = 'pending';
CREATE INDEX invitations_by_business ON invitations (business_id, created_at DESC);
CREATE INDEX invitations_by_email ON invitations (email_normalized) WHERE status = 'pending';
