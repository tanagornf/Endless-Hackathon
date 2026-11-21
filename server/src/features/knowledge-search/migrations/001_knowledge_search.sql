-- dependsOn: core, knowledge
-- (extension vector ถูกสร้างใน 001_core.sql แล้ว ที่นี่ไม่สร้างซ้ำ)
CREATE TABLE knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
  revision int NOT NULL,
  folder_id uuid,                                  -- ซ้ำจาก item เพื่อกรอง (setItemFolder ปรับ)
  kind text NOT NULL CHECK (kind IN ('faq','article','row')),
  chunk_no int NOT NULL,
  title text NOT NULL,
  text text NOT NULL,                              -- ข้อความที่ใช้ฝัง และใช้ตัด snippet
  term_count int NOT NULL,                         -- จำนวน token แบบ Intl.Segmenter (ดู §5.1)
  lexical_terms text[] NOT NULL DEFAULT '{}',      -- คำ + รหัสสินค้า (normalize แล้ว)
  embedding vector(1536),                          -- null จนกว่าจะฝังเสร็จ (ฝังเสร็จพร้อม INSERT: ปกติไม่ null)
  embed_model text NOT NULL,                       -- 'text-embedding-3-large' | 'fake-hash'
  embed_dim int NOT NULL,
  searchable boolean NOT NULL DEFAULT false,       -- true เฉพาะ revision ที่ active ปัจจุบัน
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, revision, chunk_no)
);
CREATE INDEX knowledge_chunks_tenant ON knowledge_chunks (business_id, searchable) WHERE searchable;
CREATE INDEX knowledge_chunks_item ON knowledge_chunks (business_id, item_id, revision);
CREATE INDEX knowledge_chunks_terms ON knowledge_chunks USING gin (lexical_terms);
CREATE INDEX knowledge_chunks_hnsw ON knowledge_chunks USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

CREATE TABLE knowledge_index_states (
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
  revision int NOT NULL,
  state text NOT NULL DEFAULT 'not_started' CHECK (state IN ('not_started','indexing','ready','failed')),
  error text,                                      -- รหัสสั้น เช่น embed_failed, empty, too_large (ไม่ใส่เนื้อหา)
  attempts int NOT NULL DEFAULT 0,
  chunk_count int NOT NULL DEFAULT 0,
  embed_model text,
  embed_dim int,
  started_at timestamptz,
  indexed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, revision)
);
CREATE INDEX knowledge_index_states_biz ON knowledge_index_states (business_id, state);

CREATE TABLE knowledge_query_cache (               -- cache เวกเตอร์ของ query (ลด latency/ต้นทุน)
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  cache_key text NOT NULL,                         -- sha256(model|dim|normalized query)
  embedding vector(1536) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, cache_key)
);

CREATE TABLE retrieval_cases (                     -- กรณีทดสอบที่เจ้าของบันทึกเอง (นอกจาก fixture ในโค้ด)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  query text NOT NULL CHECK (char_length(query) BETWEEN 1 AND 500),
  expect_item_ids uuid[] NOT NULL DEFAULT '{}',
  expect_none boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expect_none OR array_length(expect_item_ids, 1) >= 1)
);
CREATE TABLE retrieval_runs (                      -- ประวัติการวัด (ก่อน/หลังเปลี่ยนค่า)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  config jsonb NOT NULL,                           -- { strategy, wVec, wLex, c0, c1, minScore, rerank, embedModel }
  metrics jsonb NOT NULL,                          -- RetrievalMetrics
  per_case jsonb NOT NULL,                         -- RetrievalCaseResult[]
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX retrieval_runs_biz ON retrieval_runs (business_id, created_at DESC);
