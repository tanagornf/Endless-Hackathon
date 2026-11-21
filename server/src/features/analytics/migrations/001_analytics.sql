-- dependsOn: core
CREATE TABLE analytics_settings (
  business_id uuid PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  minutes_per_conversation integer NOT NULL DEFAULT 3 CHECK (minutes_per_conversation BETWEEN 1 AND 60),
  version integer NOT NULL DEFAULT 1,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
