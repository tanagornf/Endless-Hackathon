-- dependsOn: core
CREATE TABLE knowledge_fixture_requests (
  business_id uuid PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  request_key uuid NOT NULL,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  job_id uuid,
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
