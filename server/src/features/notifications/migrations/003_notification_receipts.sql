-- dependsOn: core
CREATE INDEX notifications_business_receipt ON notifications (business_id, dedup_key) WHERE dedup_key IS NOT NULL;
