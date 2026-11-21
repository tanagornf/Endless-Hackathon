-- dependsOn:
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS claim_token uuid;             -- token ของรอบที่ claim; complete/fail/heartbeat ต้องตรง
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS started_at timestamptz;       -- เวลา claim ครั้งล่าสุด
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS reschedules int NOT NULL DEFAULT 0;   -- จำนวนครั้งที่คืน { retryAt }
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS dead_at timestamptz;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS retried_by uuid REFERENCES users(id) ON DELETE SET NULL;  -- ผู้ดูแลที่กด retry ล่าสุด
ALTER TABLE jobs ADD CONSTRAINT jobs_payload_size CHECK (pg_column_size(payload) <= 20000);
CREATE INDEX IF NOT EXISTS jobs_state_type ON jobs (state, type, created_at DESC);
CREATE INDEX IF NOT EXISTS jobs_business_state ON jobs (business_id, state) WHERE business_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS jobs_lock_running ON jobs (lock_key) WHERE state = 'running' AND lock_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS jobs_finished ON jobs (finished_at) WHERE state IN ('succeeded','cancelled','dead');
CREATE INDEX IF NOT EXISTS audit_events_action_time ON audit_events (action, created_at DESC);
CREATE INDEX IF NOT EXISTS messages_delivery_attention ON messages (delivery_state, created_at DESC) WHERE delivery_state IN ('unknown','failed');
