-- dependsOn: core
ALTER TABLE team_ai_handoff_receipts
  ADD COLUMN explicit_request_evidence text,
  ADD CONSTRAINT team_ai_handoff_explicit_request_evidence_check CHECK (
    explicit_request_evidence IS NULL OR
    (reason = 'customer_request' AND explicit_request_evidence IN ('customer_asked', 'accepted_staff_offer'))
  );
