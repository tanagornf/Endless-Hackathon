-- dependsOn: core
CREATE TABLE knowledge_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100 AND name = btrim(name) AND name !~ '[\n\r\t]'),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX knowledge_folders_name_uq ON knowledge_folders (business_id, lower(name));

CREATE TABLE knowledge_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  folder_id uuid REFERENCES knowledge_folders(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'article' CHECK (kind IN ('faq','article')),
  title text NOT NULL DEFAULT '' CHECK (char_length(title) <= 255),
  body text NOT NULL DEFAULT '' CHECK (char_length(body) <= 20000),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','reviewed','active','inactive','deleted')),
  revision int NOT NULL DEFAULT 1 CHECK (revision >= 1),
  files jsonb NOT NULL DEFAULT '[]'::jsonb,           -- [{ fileId, description, sendToUser, flagged }]
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','import','seed','fixture')),
  source_ref text,                                     -- id ของงานนำเข้า (F06) ถ้ามี
  client_request_id text,                              -- idempotency ของ createKnowledgeDraft
  content_hash text NOT NULL DEFAULT '',               -- sha256(normalize(title) + '\n' + normalize(body)) ใช้เตือนซ้ำ
  moderation jsonb,                                    -- { status:'ok'|'flagged'|'unchecked', categories:[], revision, checkedAt }
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  activated_at timestamptz,
  deactivated_at timestamptz,
  deleted_at timestamptz,
  deleted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  CHECK ((status = 'deleted') = (deleted_at IS NOT NULL))
);
CREATE INDEX knowledge_items_list ON knowledge_items (business_id, status, updated_at DESC, id DESC);
CREATE INDEX knowledge_items_folder ON knowledge_items (business_id, folder_id) WHERE status <> 'deleted';
CREATE INDEX knowledge_items_hash ON knowledge_items (business_id, content_hash) WHERE status <> 'deleted' AND content_hash <> '';
CREATE UNIQUE INDEX knowledge_items_client_req ON knowledge_items (business_id, client_request_id) WHERE client_request_id IS NOT NULL;

CREATE TABLE knowledge_revisions (                      -- snapshot แก้ย้อนไม่ได้ ต่อทุก revision (รวม revision แรก)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
  revision int NOT NULL,
  kind text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  folder_id uuid,                                      -- ค่า ณ ตอนนั้น (ไม่ FK: โฟลเดอร์อาจถูกลบ)
  files jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, revision)
);
CREATE INDEX knowledge_revisions_item ON knowledge_revisions (business_id, item_id, revision DESC);
