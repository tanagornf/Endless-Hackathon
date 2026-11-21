-- dependsOn: core
CREATE TABLE demo_chat_settings (
  business_id uuid PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  public_slug text NOT NULL UNIQUE CHECK (public_slug ~ '^[a-z0-9][a-z0-9-]{2,39}$'),
  welcome_text text CHECK (welcome_text IS NULL OR char_length(welcome_text) BETWEEN 1 AND 300),
  suggested_questions text[] NOT NULL DEFAULT '{}' CHECK (cardinality(suggested_questions) <= 4),
  welcome_text_en text CHECK (welcome_text_en IS NULL OR char_length(welcome_text_en) BETWEEN 1 AND 300),
  suggested_questions_en text[] NOT NULL DEFAULT '{}' CHECK (cardinality(suggested_questions_en) <= 4),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE demo_chat_daily_turns (
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  day date NOT NULL,
  turns int NOT NULL DEFAULT 0 CHECK (turns >= 0),
  blocked int NOT NULL DEFAULT 0 CHECK (blocked >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, day)
);
