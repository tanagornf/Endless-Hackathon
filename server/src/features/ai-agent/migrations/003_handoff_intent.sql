-- dependsOn: core
ALTER TABLE ai_turns
  ADD COLUMN handoff_expected_version int CHECK (handoff_expected_version > 0);
