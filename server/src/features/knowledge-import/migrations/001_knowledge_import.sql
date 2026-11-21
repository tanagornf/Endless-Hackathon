-- dependsOn: core
CREATE TABLE knowledge_source_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  source_key text NOT NULL,
  version integer NOT NULL CHECK (version >= 1),
  import_id uuid NOT NULL,
  sha256 text NOT NULL,
  parser_version text NOT NULL,
  complete boolean NOT NULL DEFAULT false,
  rows_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, source_key, version)
);
CREATE INDEX knowledge_source_versions_sha ON knowledge_source_versions (business_id, source_key, sha256) WHERE complete;

CREATE TABLE import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('csv','xlsx','pdf','text','url')),
  target text CHECK (target IN ('catalog','faq','article')),
  state text NOT NULL DEFAULT 'queued' CHECK (state IN (
    'queued','parsing','awaiting_mapping','extracting','validating','review','committing','done','failed','cancelled')),
  source_label text NOT NULL,
  source_key text NOT NULL,
  source_url text,
  file_id uuid REFERENCES files(id) ON DELETE SET NULL,
  sha256 text NOT NULL,
  size_bytes integer NOT NULL DEFAULT 0,
  version_id uuid REFERENCES knowledge_source_versions(id) ON DELETE SET NULL,
  duplicate_of_import_id uuid,
  mapping jsonb,
  options jsonb NOT NULL DEFAULT '{}',
  header jsonb,
  rows_total integer NOT NULL DEFAULT 0,
  rows_ready integer NOT NULL DEFAULT 0,
  rows_error integer NOT NULL DEFAULT 0,
  rows_excluded integer NOT NULL DEFAULT 0,
  rows_written integer NOT NULL DEFAULT 0,
  rows_updated integer NOT NULL DEFAULT 0,
  rows_skipped integer NOT NULL DEFAULT 0,
  warnings jsonb NOT NULL DEFAULT '[]',
  moderation_flagged boolean NOT NULL DEFAULT false,
  phase text,
  run_seq integer NOT NULL DEFAULT 0,
  job_id uuid,
  error_code text,
  error_message text,
  timings jsonb NOT NULL DEFAULT '{}',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, business_id)
);
CREATE INDEX import_jobs_list ON import_jobs (business_id, created_at DESC, id DESC);
CREATE INDEX import_jobs_source ON import_jobs (business_id, source_key, sha256);

CREATE TABLE import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  row_no integer NOT NULL CHECK (row_no >= 1),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ready','error','excluded','written','updated','skipped')),
  raw jsonb NOT NULL DEFAULT '[]',
  data jsonb,
  error_code text,
  error_column text,
  error_message text,
  warnings jsonb NOT NULL DEFAULT '[]',
  created_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (import_id, business_id) REFERENCES import_jobs(id, business_id) ON DELETE CASCADE,
  UNIQUE (import_id, row_no)
);
CREATE INDEX import_rows_status ON import_rows (import_id, status, row_no);
