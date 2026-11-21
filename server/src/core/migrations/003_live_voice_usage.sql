-- dependsOn:
ALTER TABLE model_usage
  ADD COLUMN audio_active_seconds numeric,
  ADD COLUMN audio_paused_seconds numeric;

CREATE UNIQUE INDEX model_usage_live_duration_by_session ON model_usage (response_id)
  WHERE kind='realtime' AND purpose='voice.live.duration' AND response_id IS NOT NULL;
