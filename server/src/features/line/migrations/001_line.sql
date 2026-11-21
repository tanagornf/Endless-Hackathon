-- dependsOn: core
CREATE TABLE line_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  channel_id text NOT NULL CHECK (channel_id ~ '^[0-9]{5,20}$'),      -- Channel ID (ตัวเลข) = ค่าใน path ของ webhook
  bot_user_id text,                                                    -- "destination" ใน webhook (U + 32 hex) ได้จาก GET /v2/bot/info
  basic_id text,                                                       -- เช่น @123abcde (ใช้ทำลิงก์เพิ่มเพื่อน)
  display_name text NOT NULL DEFAULT '',
  channel_secret_enc text,                                             -- encryptSecret(...) · NULL เมื่อ inactive
  access_token_enc text,                                               -- encryptSecret(...) · NULL = ใช้ stateless token (§5.9)
  source text NOT NULL DEFAULT 'ui' CHECK (source IN ('ui','env')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','error','inactive')),
  status_reason text,                                                  -- 'token_rejected' | 'secret_mismatch' | 'disconnected' | ...
  generation int NOT NULL DEFAULT 1,                                   -- +1 เมื่อ credential/สถานะเปลี่ยน (ล้าง cache token)
  connected_by uuid REFERENCES users(id),
  connected_at timestamptz NOT NULL DEFAULT now(),
  disconnected_at timestamptz,
  last_verified_at timestamptz,
  last_event_at timestamptz,
  events_total bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- OA หนึ่งตัวถูกผูกกับ business เดียวที่ active; business หนึ่งมี LINE ที่ active/error ได้ตัวเดียว
CREATE UNIQUE INDEX line_connections_channel_live ON line_connections (channel_id) WHERE status IN ('active','error');
CREATE UNIQUE INDEX line_connections_business_live ON line_connections (business_id) WHERE status IN ('active','error');
CREATE INDEX line_connections_business ON line_connections (business_id);

-- ผู้ติดต่อ LINE ต่อ business: สถานะเพื่อน/บล็อก + แคชโปรไฟล์ + กันแจ้ง "ฟังเสียงไม่ได้" ซ้ำ
CREATE TABLE line_contacts (
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  line_user_id text NOT NULL,
  is_following boolean NOT NULL DEFAULT true,
  followed_at timestamptz,
  unfollowed_at timestamptz,
  display_name text,
  language text,
  profile_fetched_at timestamptz,
  audio_notice_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, line_user_id)
);

-- log event ที่รับ (dedup ชั้นที่สอง + หน้า "เหตุการณ์ล่าสุด") · เก็บ 14 วัน · ไม่เก็บข้อความลูกค้า
CREATE TABLE line_events (
  webhook_event_id text PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES line_connections(id) ON DELETE CASCADE,
  event_type text NOT NULL,                 -- message | follow | unfollow | postback | other
  message_type text,                        -- text | image | sticker | audio | video | file | location
  is_redelivery boolean NOT NULL DEFAULT false,
  state text NOT NULL DEFAULT 'received' CHECK (state IN ('received','done','ignored','failed')),
  note text,                                -- เหตุผลสั้น ๆ เช่น 'group_source', 'business_inactive' (ห้ามใส่ข้อความลูกค้า)
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX line_events_recent ON line_events (business_id, received_at DESC);

-- reply token ที่ใช้แล้ว (ใช้ได้ครั้งเดียว) เก็บเฉพาะ hash
CREATE TABLE line_reply_tokens_used (
  token_hash text PRIMARY KEY,
  used_at timestamptz NOT NULL DEFAULT now()
);

-- batch ที่ส่งแล้วต่อข้อความ (กันส่งซ้ำเมื่อ core retry)
CREATE TABLE line_delivery_batches (
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  batch_index int NOT NULL,
  mode text NOT NULL CHECK (mode IN ('reply','push')),
  retry_key uuid NOT NULL,
  state text NOT NULL CHECK (state IN ('accepted','unknown')),
  sent_ids text[] NOT NULL DEFAULT '{}',
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, batch_index)
);

-- ใช้ Push เท่าไรต่อเดือน (เวลา Asia/Bangkok) เพื่อแสดงและเตือน · reply ไม่นับ
CREATE TABLE line_push_usage (
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  month date NOT NULL,                      -- วันที่ 1 ของเดือน
  push_calls int NOT NULL DEFAULT 0,
  push_messages int NOT NULL DEFAULT 0,
  quota_alerted_at timestamptz,             -- ครั้งล่าสุดที่ notify() ว่าโควตาเต็ม
  PRIMARY KEY (business_id, month)
);
