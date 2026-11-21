-- dependsOn: core
ALTER TABLE ai_turns
  ADD COLUMN handoff_reason text CHECK (handoff_reason IN ('customer_request', 'budget_exhausted', 'ai_failed')),
  ADD COLUMN handoff_assignment_version int CHECK (handoff_assignment_version > 0);

CREATE UNIQUE INDEX ai_handoff_waits_turn ON ai_handoff_waits (business_id, turn_id);
