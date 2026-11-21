-- dependsOn: core
CREATE TABLE team_settings (
  business_id uuid PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  auto_assign boolean NOT NULL DEFAULT false,            -- เลือกคนว่างให้เมื่อแชตเข้าคิว
  idle_policy text NOT NULL DEFAULT 'off' CHECK (idle_policy IN ('off','alert','reassign')),
  idle_minutes int NOT NULL DEFAULT 30 CHECK (idle_minutes BETWEEN 5 AND 1440),
  auto_close boolean NOT NULL DEFAULT false,             -- ปิดแชตค้างตาม §5.8
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE team_availability (
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  manual_status text NOT NULL DEFAULT 'available' CHECK (manual_status IN ('available','away','off_shift')),
  schedule jsonb,                                         -- null = ไม่มีตาราง (ใช้ manual) · รูปแบบ §5.4
  schedule_paused boolean NOT NULL DEFAULT false,         -- เลือกสถานะเองขณะมีตาราง = พักตาราง
  last_assigned_at timestamptz,                           -- round-robin
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, user_id),
  CHECK (schedule IS NULL OR jsonb_typeof(schedule) = 'object')
);
CREATE TABLE conversation_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,   -- null = โน้ตของลูกค้า (ติดไปทุกแชตของลูกค้านั้น)
  kind text NOT NULL DEFAULT 'note' CHECK (kind IN ('note','handover','assistance')),  -- handover/assistance = audit แก้ลบไม่ได้
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  pinned boolean NOT NULL DEFAULT false,
  mention_user_ids uuid[] NOT NULL DEFAULT '{}',
  author_user_id uuid REFERENCES users(id) ON DELETE SET NULL,           -- null = ระบบ/AI
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (kind = 'note' OR conversation_id IS NOT NULL)
);
CREATE INDEX conversation_notes_conv ON conversation_notes (business_id, conversation_id, created_at) WHERE deleted_at IS NULL;
CREATE INDEX conversation_notes_customer ON conversation_notes (business_id, customer_id) WHERE pinned AND deleted_at IS NULL;
CREATE TABLE team_idle_events (                           -- 1 event ต่อการรอหนึ่งรอบ
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  wait_started_at timestamptz NOT NULL,
  action text NOT NULL CHECK (action IN ('alerted','reassigned','no_one_available')),
  from_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  to_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, wait_started_at)
);
