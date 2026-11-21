-- dependsOn: core
CREATE TABLE ai_turns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  inbound_message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  inbound_created_at timestamptz NOT NULL,
  mode text NOT NULL DEFAULT 'reply' CHECK (mode IN ('reply','suggest')),
  state text NOT NULL DEFAULT 'running'
    CHECK (state IN ('running','completed','awaiting_confirmation','handoff','failed','skipped','superseded')),
  skip_reason text CHECK (skip_reason IS NULL OR skip_reason IN (
    'business_inactive','ai_off','takeover','handoff_waiting','conversation_closed','not_customer_message',
    'takeover_during_generation','ai_off_during_generation','superseded','non_text_repeat')),
  reply_language text CHECK (reply_language IS NULL OR reply_language IN ('th','en')),
  intent text,
  intent_source text CHECK (intent_source IS NULL OR intent_source IN ('regex','classifier','fallback')),
  intent_confidence numeric(4,3),
  tools jsonb NOT NULL DEFAULT '[]',
  evidence_ids text[] NOT NULL DEFAULT '{}',
  product_refs jsonb NOT NULL DEFAULT '[]',
  guard_actions jsonb NOT NULL DEFAULT '[]',
  reply_parts jsonb,
  proposal jsonb,
  reply_group_id uuid,
  reply_message_id uuid,
  handoff_offered boolean NOT NULL DEFAULT false,
  escalated boolean NOT NULL DEFAULT false,
  retry_used boolean NOT NULL DEFAULT false,
  usage_summary jsonb,
  timings jsonb NOT NULL DEFAULT '{}',
  error_code text,
  attempts int NOT NULL DEFAULT 1,
  retry_after timestamptz,
  lease_until timestamptz NOT NULL DEFAULT (now() + interval '60 seconds'),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  latency_ms int,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- reply turn ของ inbound หนึ่งข้อความมีได้แถวเดียว (dedup/turn claim) · suggest ซ้ำได้
CREATE UNIQUE INDEX ai_turns_one_reply ON ai_turns (inbound_message_id) WHERE mode = 'reply';
CREATE INDEX ai_turns_business_time ON ai_turns (business_id, started_at DESC);
CREATE INDEX ai_turns_conversation ON ai_turns (conversation_id, started_at DESC);
CREATE INDEX ai_turns_topics ON ai_turns (business_id, finished_at)
  WHERE mode = 'reply' AND state IN ('completed','awaiting_confirmation');

-- บันทึกทุกครั้งที่ AI ขอคน (เหตุผล + เวลา ใช้ในหน้า trace) · กลไก takeover จริงคือ requestHumanHandoff ของ F11 (§5.8)
-- แถวที่ released_at IS NULL มีได้เฉพาะเมื่อ requestHumanHandoff throw (ทางสำรอง: gate ข้อ 6 กันบอทตอบจนกว่าพนักงานมา)
CREATE TABLE ai_handoff_waits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  turn_id uuid NOT NULL REFERENCES ai_turns(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN ('customer_request','cannot_answer','complaint','payment_issue','other','budget_exhausted','ai_failed')),
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  release_reason text CHECK (release_reason IS NULL OR release_reason IN ('staff_replied','takeover','handed_to_team','expired','manual'))
);
CREATE UNIQUE INDEX ai_handoff_waits_open ON ai_handoff_waits (conversation_id) WHERE released_at IS NULL;
