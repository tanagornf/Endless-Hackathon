-- dependsOn: core
CREATE TABLE business_settings (
  business_id uuid PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  ai_enabled boolean NOT NULL DEFAULT true,
  hours jsonb NOT NULL,
  answer_policy jsonb,
  capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  version int NOT NULL DEFAULT 1,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(hours) = 'object'),
  CHECK (answer_policy IS NULL OR jsonb_typeof(answer_policy) = 'object'),
  CHECK (jsonb_typeof(capabilities) = 'object')
);

CREATE TABLE business_profiles (
  business_id uuid PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 1000),
  contact_phone text CHECK (contact_phone IS NULL OR char_length(contact_phone) <= 30),
  contact_email text CHECK (contact_email IS NULL OR char_length(contact_email) <= 200),
  address text CHECK (address IS NULL OR char_length(address) <= 300),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE business_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text NOT NULL DEFAULT '' CHECK (char_length(reason) <= 200),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date),
  CHECK (end_date - start_date <= 365)
);
CREATE INDEX business_closures_range ON business_closures (business_id, start_date, end_date);
