-- dependsOn: core, ai-agent
CREATE TABLE follow_up_settings (
  business_id uuid PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  delay_hours int NOT NULL DEFAULT 4 CHECK (delay_hours BETWEEN 1 AND 48),
  quiet_start text NOT NULL DEFAULT '21:00' CHECK (quiet_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  quiet_end text NOT NULL DEFAULT '08:00' CHECK (quiet_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  allowed_channels text[] NOT NULL DEFAULT ARRAY['web'] CHECK (allowed_channels <@ ARRAY['web','line']::text[]),
  version int NOT NULL DEFAULT 1,
  updated_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE follow_ups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('web','line')),
  trigger_turn_id uuid NOT NULL REFERENCES ai_turns(id) ON DELETE CASCADE,
  trigger_message_id uuid NOT NULL,
  trigger_at timestamptz NOT NULL,
  product_item_id uuid,
  product_sku text,
  product_name text,
  state text NOT NULL DEFAULT 'scheduled' CHECK (state IN ('scheduled','sent','cancelled','failed')),
  cancel_reason text CHECK (cancel_reason IS NULL OR cancel_reason IN (
    'disabled','ai_off','takeover','customer_replied','staff_replied','ordered','opted_out','consent_revoked',
    'max_per_week','channel_not_allowed','window_closed','sold_out','conversation_closed','expired','manual','no_product'
  )),
  scheduled_for timestamptz NOT NULL,
  job_id uuid,
  sent_at timestamptz,
  message_id uuid,
  text text,
  text_source text CHECK (text_source IS NULL OR text_source IN ('model','template')),
  error text,
  is_test boolean NOT NULL DEFAULT false,
  recovered_at timestamptz,
  recovered_by text CHECK (recovered_by IS NULL OR recovered_by IN ('reply','order')),
  recovered_order_id uuid,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX follow_ups_one_per_trigger ON follow_ups (trigger_message_id) WHERE NOT is_test;
CREATE INDEX follow_ups_log ON follow_ups (business_id, created_at DESC);
CREATE INDEX follow_ups_customer_sent ON follow_ups (business_id, customer_id, sent_at DESC) WHERE state = 'sent' AND NOT is_test;
CREATE INDEX follow_ups_recover ON follow_ups (sent_at) WHERE state = 'sent' AND recovered_at IS NULL AND NOT is_test;

CREATE TABLE follow_up_optouts (
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('keyword','staff')),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, customer_id)
);
