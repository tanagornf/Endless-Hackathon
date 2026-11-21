-- dependsOn:
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  email_normalized text GENERATED ALWAYS AS (lower(btrim(email))) STORED UNIQUE,
  display_name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  is_platform_admin boolean NOT NULL DEFAULT false,
  locale text NOT NULL DEFAULT 'th' CHECK (locale IN ('th','en')),
  password_hash text,                -- F02 (C3) เขียน (scrypt); null = ยังไม่มี password login
  email_verified_at timestamptz,     -- F02 (C3)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('dev','password','oauth')),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_seen_at timestamptz,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE accounts (                         -- F03 tenancy (C3) เขียนแถว core อ่าน
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_user_id uuid NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','deleted')),
  timezone text NOT NULL DEFAULT 'Asia/Bangkok',
  language text NOT NULL DEFAULT 'th' CHECK (language IN ('th','en')),
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE memberships (                      -- F03 (C3) เขียนแถว · getBusiness()/requirePermission() ของ core อ่านทุก request
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner','staff')),
  permissions text[] NOT NULL DEFAULT '{}',   -- staff เท่านั้น; owner = ทุก key
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, user_id)
);
CREATE TABLE customers (                        -- ตัวตนต่อช่องทาง เขียนผ่าน inbox saveMessage; F24 เก็บ profile/tags ในตารางตัวเอง
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('web','line','facebook','instagram')),
  external_id text NOT NULL,
  channel_account_id text,
  display_name text NOT NULL DEFAULT '',
  avatar_file_id uuid,
  locale text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, channel, external_id)
);
CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('web','line','facebook','instagram')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  handler text NOT NULL DEFAULT 'ai' CHECK (handler IN ('ai','human')),   -- F11 isHumanTakeover / assignConversation
  assignee_user_id uuid REFERENCES users(id),
  ai_force_on boolean NOT NULL DEFAULT false,
  last_message_at timestamptz,
  last_inbound_at timestamptz,
  last_message_preview text,
  unread_count int NOT NULL DEFAULT 0,
  next_seq bigint NOT NULL DEFAULT 1,
  version int NOT NULL DEFAULT 1,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX conversations_one_open ON conversations (customer_id) WHERE status = 'open';
CREATE INDEX conversations_inbox ON conversations (business_id, last_message_at DESC);
CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  seq bigint NOT NULL,
  direction text NOT NULL CHECK (direction IN ('inbound','outbound')),
  author text NOT NULL CHECK (author IN ('customer','ai','staff','system')),
  author_user_id uuid REFERENCES users(id),
  parts jsonb NOT NULL,
  text text NOT NULL DEFAULT '',
  channel text NOT NULL,
  origin text NOT NULL DEFAULT 'live'           -- ตรงกับ MessageOrigin ใน contracts.ts (ถ้าต่างจากรายการนี้ ยึด contracts.ts)
    CHECK (origin IN ('live','demo','broadcast','comment','system')),
  external_id text,
  group_id uuid,
  provider_meta jsonb NOT NULL DEFAULT '{}',
  client_request_id text,
  delivery_mode text CHECK (delivery_mode IN ('real','sandbox')),
  delivery_state text NOT NULL DEFAULT 'not_required'
    CHECK (delivery_state IN ('not_required','pending','sent','failed','unknown')),
  delivery_external_ref text,
  delivery_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, seq)
);
CREATE UNIQUE INDEX messages_external ON messages (business_id, channel, external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX messages_client_request ON messages (conversation_id, client_request_id) WHERE client_request_id IS NOT NULL;
CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  dedup_key text UNIQUE,
  lock_key text,
  state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','running','succeeded','failed','dead','cancelled')),
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 5,
  run_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  locked_by text,
  last_error text,
  progress jsonb,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX jobs_ready ON jobs (run_at) WHERE state IN ('queued','running');
CREATE TABLE model_usage (                      -- core model.* เขียนทุก call (OpenAI); F27 อ่านเพื่อดูต้นทุน (ไม่ใช่โควตา)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE SET NULL,
  account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  conversation_id uuid,
  turn_id text,
  feature_id text NOT NULL,
  purpose text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('chat','embed','moderate','transcribe','realtime')),
  mode text NOT NULL CHECK (mode IN ('openai','fake')),
  model text NOT NULL,
  input_tokens int,
  output_tokens int,
  cached_input_tokens int,
  cache_write_tokens int,            -- input_tokens_details.cache_write_tokens (คิด 1.25× input)
  reasoning_tokens int,              -- output_tokens_details.reasoning_tokens (นับอยู่ใน output แล้ว)
  audio_input_tokens int,            -- realtime: input_token_details.audio_tokens
  audio_output_tokens int,           -- realtime: output_token_details.audio_tokens
  audio_seconds numeric,             -- transcribe: usage.seconds
  cost_usd_micros bigint,            -- null = ไม่รู้ราคา (ไม่ใช่ 0)
  cost_reason text NOT NULL,
  latency_ms int,
  finish_reason text,
  error_code text,
  request_id text,                   -- x-request-id
  response_id text,                  -- OpenAI response id (resp_…) ถ้ามี
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX model_usage_business_time ON model_usage (business_id, created_at);
CREATE TABLE files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  uploaded_by uuid REFERENCES users(id),
  purpose text NOT NULL,
  original_name text NOT NULL DEFAULT '',
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  sha256 text NOT NULL,
  storage_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid,
  account_id uuid,
  actor_user_id uuid,
  action text NOT NULL,
  target_type text,
  target_id text,
  details jsonb NOT NULL DEFAULT '{}',
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE seed_aliases (alias text PRIMARY KEY, id uuid NOT NULL, kind text NOT NULL);
CREATE TABLE feature_flags (                    -- D6: ซ่อนฟีเจอร์ที่ยังไม่ R; core อ่าน, หน้า /ops (F35) สลับ, ค่าเริ่มต้นจาก env HIDDEN_FEATURES
  feature_id text PRIMARY KEY,                  -- 'F01'…'F39' (เฉพาะฟีเจอร์ที่ folder: true ใน FEATURES)
  hidden boolean NOT NULL DEFAULT false,
  reason text,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
