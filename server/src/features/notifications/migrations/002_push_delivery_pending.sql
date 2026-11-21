-- dependsOn: core
ALTER TABLE notifications
  ADD COLUMN push_purpose jsonb,
  ADD CONSTRAINT notifications_push_purpose_object
    CHECK (push_purpose IS NULL OR jsonb_typeof(push_purpose) = 'object');

ALTER TABLE push_deliveries DROP CONSTRAINT push_deliveries_state_check;
ALTER TABLE push_deliveries
  ADD CONSTRAINT push_deliveries_state_check CHECK (state IN ('pending', 'accepted', 'gone', 'failed')),
  ADD COLUMN attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 3);

DROP INDEX push_deliveries_once;
CREATE UNIQUE INDEX push_deliveries_once
  ON push_deliveries (notification_id, subscription_id)
  WHERE notification_id IS NOT NULL AND subscription_id IS NOT NULL;
