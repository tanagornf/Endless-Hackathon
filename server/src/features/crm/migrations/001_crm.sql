-- dependsOn: core
-- "person" = ตัวตนหลักของลูกค้าหนึ่งคน = id ของแถว customers ตัวแรกในกลุ่ม ลูกค้าที่ไม่เคยถูกรวม: person = id ของตัวเอง
-- ลูกค้าที่ถูกรวมมีแถวใน crm_person_members ชี้ไป person (ไม่มีโซ่: person_id ไม่เป็น member ของใครเสมอ)

CREATE TABLE crm_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 128),
  name_key text NOT NULL,                              -- NFKC + lowercase + ยุบช่องว่างซ้อน (คำนวณในโค้ด) ใช้กันชื่อซ้ำ
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 200),
  color text NOT NULL DEFAULT 'grey' CHECK (color IN ('grey','red','orange','amber','green','teal','blue','purple')),
  version int NOT NULL DEFAULT 1,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, name_key)
);

CREATE TABLE crm_person_members (
  customer_id uuid PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  merged_by uuid REFERENCES users(id),
  merged_at timestamptz NOT NULL DEFAULT now(),
  CHECK (customer_id <> person_id)
);
CREATE INDEX crm_person_members_person ON crm_person_members (person_id);

CREATE TABLE crm_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  enabled boolean NOT NULL DEFAULT true,
  kind text NOT NULL CHECK (kind IN ('inactive_days','new_customer_days','booking_count_gte','order_count_gte')),
  params jsonb NOT NULL,                               -- ตรวจด้วย zod ตาม kind (§3) ก่อนเขียนเสมอ
  tag_id uuid NOT NULL REFERENCES crm_tags(id) ON DELETE RESTRICT,
  last_run_at timestamptz,
  last_run_summary jsonb,                              -- { added, removed, skipped?: string, evaluated }
  version int NOT NULL DEFAULT 1,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crm_rules_business ON crm_rules (business_id, enabled);

CREATE TABLE crm_customer_tags (
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES crm_tags(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('manual','automation','inferred')),
  rule_id uuid REFERENCES crm_rules(id) ON DELETE SET NULL,   -- เฉพาะ source = 'automation'
  evidence text CHECK (evidence IS NULL OR char_length(evidence) <= 300),  -- เฉพาะ 'inferred'
  added_by uuid REFERENCES users(id),
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (person_id, tag_id)
);
CREATE INDEX crm_customer_tags_tag ON crm_customer_tags (business_id, tag_id);

-- พนักงานถอดแท็กที่กฎติดไว้ → กฎต้องไม่ติดซ้ำจนกว่าเงื่อนไขจะเลิกเป็นจริง (ลบตอนกฎรันแล้วเงื่อนไขไม่เป็นจริง)
CREATE TABLE crm_tag_suppressions (
  person_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES crm_tags(id) ON DELETE CASCADE,
  rule_id uuid NOT NULL REFERENCES crm_rules(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (person_id, tag_id)
);

CREATE TABLE crm_profiles (
  person_id uuid PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  phone text NOT NULL DEFAULT '' CHECK (char_length(phone) <= 32),
  phone_norm text NOT NULL DEFAULT '',                 -- เฉพาะตัวเลข ใช้ค้นหา/หาคู่รวมตัวตน
  email text NOT NULL DEFAULT '' CHECK (char_length(email) <= 254),
  email_norm text NOT NULL DEFAULT '',                 -- lowercase
  address text NOT NULL DEFAULT '' CHECK (char_length(address) <= 500),
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 2000),
  version int NOT NULL DEFAULT 1,
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crm_profiles_phone ON crm_profiles (business_id, phone_norm) WHERE phone_norm <> '';
CREATE INDEX crm_profiles_email ON crm_profiles (business_id, email_norm) WHERE email_norm <> '';

-- ไม่มีแถว = 'unknown'
CREATE TABLE crm_consents (
  person_id uuid PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('granted','revoked','unknown')),
  source text NOT NULL CHECK (source IN ('staff','customer','import','merge','seed','system')),
  actor_user_id uuid REFERENCES users(id),
  reason text NOT NULL DEFAULT '' CHECK (char_length(reason) <= 300),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE crm_consent_events (                      -- ประวัติ append-only
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  previous_status text NOT NULL,
  status text NOT NULL,
  source text NOT NULL,
  actor_user_id uuid REFERENCES users(id),
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crm_consent_events_person ON crm_consent_events (person_id, created_at DESC);
