-- dependsOn: core
CREATE TABLE notifications (                          -- หนึ่งแถวต่อผู้รับต่อเหตุการณ์ (fan-out ตอนเขียน)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('chat.handoff','chat.mention','order.created','payment.verifying',
    'booking.created','booking.cancelled','invitation','report','system')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  body text CHECK (body IS NULL OR char_length(body) <= 1000),
  link text CHECK (link IS NULL OR (left(link, 1) = '/' AND left(link, 2) <> '//' AND char_length(link) <= 500)),
  dedup_key text CHECK (dedup_key IS NULL OR char_length(dedup_key) <= 200),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX notifications_dedup ON notifications (user_id, dedup_key) WHERE dedup_key IS NOT NULL;
CREATE INDEX notifications_feed ON notifications (user_id, business_id, created_at DESC, id DESC);
CREATE INDEX notifications_unread ON notifications (user_id, business_id) WHERE read_at IS NULL;

CREATE TABLE notification_preferences (               -- ต่อผู้ใช้ ต่อชนิด (ทุกร้านใช้ค่าเดียวกัน) · ไม่มีแถว = ค่าเริ่มต้นใน defaults.ts
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('chat.handoff','chat.mention','order.created','payment.verifying',
    'booking.created','booking.cancelled','invitation','report','system')),
  in_app boolean NOT NULL,
  push boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, type)
);

CREATE TABLE push_subscriptions (                     -- หนึ่งแถวต่อ endpoint (เบราว์เซอร์/เครื่อง)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE CHECK (char_length(endpoint) <= 1000),
  p256dh_enc text NOT NULL,                           -- encryptSecret(...) ไม่เก็บ plain
  auth_enc text NOT NULL,                             -- encryptSecret(...)
  user_agent text CHECK (user_agent IS NULL OR char_length(user_agent) <= 300),
  failure_count int NOT NULL DEFAULT 0,
  last_accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX push_subscriptions_user ON push_subscriptions (user_id);

CREATE TABLE push_deliveries (                        -- หลักฐานของ push: 'accepted' = บริการ push รับแล้ว (ไม่ใช่ถึงเครื่อง) · acked_at = เครื่องแสดงผลแล้ว
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid REFERENCES notifications(id) ON DELETE CASCADE,   -- null = push ทดสอบจากหน้าตั้งค่า
  subscription_id uuid REFERENCES push_subscriptions(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ref text NOT NULL,                                  -- id ที่ใส่ใน payload ให้ service worker ส่งกลับมา ack (uuid สุ่มต่อการส่ง)
  state text NOT NULL CHECK (state IN ('accepted','gone','failed')),
  status_code int,
  error text CHECK (error IS NULL OR char_length(error) <= 300),
  acked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX push_deliveries_ref ON push_deliveries (ref);
CREATE UNIQUE INDEX push_deliveries_once ON push_deliveries (notification_id, subscription_id) WHERE state = 'accepted' AND notification_id IS NOT NULL;
CREATE INDEX push_deliveries_user ON push_deliveries (user_id, created_at DESC);
