-- dependsOn:
ALTER TABLE model_usage
  ADD COLUMN requested_service_tier text,
  ADD COLUMN provider_service_tier text,
  ADD COLUMN reasoning_effort text;
