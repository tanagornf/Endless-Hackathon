-- dependsOn: core, orders
CREATE TABLE payment_settings (
  business_id uuid PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  promptpay_kind text CHECK (promptpay_kind IN ('mobile','national_id','ewallet')),
  promptpay_id_enc text,                            -- encryptSecret(เลขเต็ม) · ห้ามส่งออก API
  promptpay_masked text,                            -- แสดงผล เช่น 'xxx-xxx-5678' (สร้างตอนบันทึก)
  receiver_name text NOT NULL DEFAULT '',           -- ชื่อบัญชีตามที่ปรากฏบนสลิป (กรอกเอง)
  include_reference boolean NOT NULL DEFAULT true,  -- ใส่ tag 62 (เลขออเดอร์) ใน QR
  request_ttl_minutes int NOT NULL DEFAULT 1440 CHECK (request_ttl_minutes BETWEEN 30 AND 4320),
  validated_at timestamptz,                         -- ตั้งเมื่อสร้าง QR ทดสอบหรือบันทึกผ่าน validator
  version int NOT NULL DEFAULT 1,
  updated_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((promptpay_kind IS NULL) = (promptpay_id_enc IS NULL))
);

CREATE TABLE payment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  order_id uuid NOT NULL,                           -- orders.id (F13: dependsOn, ไม่มี FK ข้ามฟีเจอร์เพื่อไม่ผูก migration)
  conversation_id uuid,
  payment_version int NOT NULL DEFAULT 1,           -- เพิ่มเมื่อ reissue
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL DEFAULT 'THB' CHECK (currency = 'THB'),
  method text NOT NULL DEFAULT 'promptpay_qr' CHECK (method = 'promptpay_qr'),
  reference_code text NOT NULL,                     -- ตัวอักษร A-Z0-9 ≤ 25 (จากเลขออเดอร์ ตัดขีด)
  qr_payload text,                                  -- สตริง EMVCo เต็ม (ไม่ใช่ความลับ)
  qr_file_id uuid,                                  -- core files.id (PNG)
  receiver_kind text NOT NULL,
  receiver_id_enc text NOT NULL,                    -- สำเนาเข้ารหัส ณ ตอนออกคำขอ (ใช้เทียบสลิป แม้ร้านเปลี่ยนค่าทีหลัง)
  receiver_masked text NOT NULL,
  receiver_name text NOT NULL DEFAULT '',
  include_reference boolean NOT NULL, pending_link_enc text, public_token_hash text NOT NULL,                  -- sha256(token) · token ดิบอยู่ในลิงก์เท่านั้น
  state text NOT NULL DEFAULT 'open'
    CHECK (state IN ('open','pending_verification','paid','expired','superseded','cancelled')),
  failed_attempts int NOT NULL DEFAULT 0,
  escalated_at timestamptz,
  expires_at timestamptz NOT NULL,
  paid_at timestamptz,
  paid_by text CHECK (paid_by IS NULL OR paid_by IN ('slip_auto','staff_accept','staff_manual')),
  mode text NOT NULL CHECK (mode IN ('sandbox','real')),
  version int NOT NULL DEFAULT 1,
  created_by uuid REFERENCES users(id),            -- null = ระบบ (hook ตอน confirm)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX payment_requests_one_live ON payment_requests (order_id) WHERE state IN ('open','pending_verification');
CREATE UNIQUE INDEX payment_requests_token ON payment_requests (public_token_hash);
CREATE INDEX payment_requests_list ON payment_requests (business_id, state, created_at DESC);
CREATE INDEX payment_requests_expiry ON payment_requests (expires_at) WHERE state = 'open';

CREATE TABLE payment_slips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  payment_request_id uuid NOT NULL REFERENCES payment_requests(id) ON DELETE CASCADE,
  order_id uuid NOT NULL,
  file_id uuid NOT NULL,                            -- core files.id (รูปสลิป = ข้อมูลลูกค้า ห้าม log)
  uploaded_by_kind text NOT NULL CHECK (uploaded_by_kind IN ('customer','staff')),
  uploaded_by_user_id uuid REFERENCES users(id),
  verdict text NOT NULL CHECK (verdict IN ('verified','wrong_amount','wrong_account','wrong_date','duplicate','unreadable','suspected_forgery','technical')),
  mode text NOT NULL CHECK (mode IN ('vision','sandbox')),
  confidence numeric(4,3) NOT NULL DEFAULT 0,
  auto_acceptable boolean NOT NULL DEFAULT false,
  amount_minor bigint,
  transferred_at timestamptz,
  transaction_ref text,                             -- เลขรายการเต็ม (ข้อมูลธุรกรรม เก็บได้ แต่ไม่ log และ UI แสดงย่อ)
  qr_found boolean NOT NULL DEFAULT false,
  qr_sending_bank text,
  receiver_name text,
  receiver_last4 text,
  checks jsonb NOT NULL DEFAULT '[]',               -- [{name, pass, detail}] detail ไม่มีเลขเต็ม
  vision jsonb,                                     -- ค่าที่โมเดลอ่าน (ไม่มีรูป)
  needs_staff_reason text,
  staff_decision text CHECK (staff_decision IS NULL OR staff_decision IN ('accepted','rejected')),
  staff_decided_by uuid REFERENCES users(id),
  staff_decided_at timestamptz,
  staff_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payment_slips_request ON payment_slips (payment_request_id, created_at DESC);

-- เลขรายการที่ "ใช้ไปแล้ว" ต่อร้าน: สลิปใบเดียวจ่ายสองออเดอร์ไม่ได้ (เขียนเมื่อ verdict = verified และไม่ใช่ dryRun)
CREATE TABLE slip_refs (
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  ref_key text NOT NULL,                            -- normalizeRef(): ตัวพิมพ์ใหญ่ ตัดช่องว่างและขีด
  source text NOT NULL CHECK (source IN ('qr','vision')),
  payment_slip_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, ref_key)
);

CREATE TABLE payment_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  payment_request_id uuid NOT NULL UNIQUE REFERENCES payment_requests(id) ON DELETE CASCADE,
  order_id uuid NOT NULL,
  receipt_no text NOT NULL,                         -- '<เลขออเดอร์>-R1'
  amount_minor bigint NOT NULL,
  paid_at timestamptz NOT NULL,
  paid_by text NOT NULL,
  mode text NOT NULL,                               -- 'sandbox' → ใบเสร็จติดป้าย "ทดสอบ"
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, receipt_no)
);

