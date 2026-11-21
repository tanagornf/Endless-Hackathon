-- dependsOn: core
ALTER TABLE notifications ADD COLUMN push_queue_at timestamptz;
CREATE INDEX notifications_pending_phone_queue ON notifications (push_queue_at, id) WHERE push_queue_at IS NOT NULL;
