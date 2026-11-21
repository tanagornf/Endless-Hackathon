-- dependsOn: core
CREATE TABLE ai_staff_consents (
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  conversation_version int NOT NULL CHECK (conversation_version > 0),
  prompt_turn_id uuid PRIMARY KEY REFERENCES ai_turns(id) ON DELETE CASCADE,
  prompt_message_id uuid NOT NULL UNIQUE REFERENCES messages(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('customer_request', 'staff_offer', 'voice_unavailable')),
  response_turn_id uuid UNIQUE REFERENCES ai_turns(id) ON DELETE CASCADE,
  response_message_id uuid UNIQUE REFERENCES messages(id) ON DELETE CASCADE,
  resolution text CHECK (resolution IN ('confirmed', 'declined', 'continued')),
  resolved_at timestamptz,
  CHECK ((response_turn_id IS NULL AND response_message_id IS NULL AND resolution IS NULL AND resolved_at IS NULL)
    OR (response_turn_id IS NOT NULL AND response_message_id IS NOT NULL AND resolution IS NOT NULL AND resolved_at IS NOT NULL))
);
