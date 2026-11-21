# F01 core — ฐานโปรเจกต์ โครงแอป และ production runtime

| | |
|---|---|
| **Lane / คน** | C1 · C (สร้างผ่านแชต setup [prompts/C1-setup.md](../../prompts/C1-setup.md); orchestrator = C0) |
| **Tier / เป้า** | P0 · R (golden path) |
| **Timebox** | 60–105 นาที: S1–S8 รวม 55 นาที (เป้า `SETUP READY` ≈ 10:45–10:50 ช้าสุด 11:00 เมื่อวาง 10:05) + S9 production deploy ≤ 30 นาที (ก่อน 11:30) |
| **พึ่ง** | ไม่มี (อ่าน `contracts.ts`, `AGENTS.md`, `.env.example`, `docs/openai-api.md`, `docs/day/deployment.md`) |
| **ให้** | ตาม [contracts.ts](../competition-plan/templates/contracts.ts) ส่วน `server/src/core`: `getUser`, `getBusiness`, `requirePermission`, `requirePlatformAdmin`, `createSession`/`destroySession`, `db`, `jobs` (base; F35 ทำต่อ), `model.*` (OpenAI อย่างเดียว), `sendToCustomer`/`registerChannelSender`, `publish`, `storage`, `audit`, `AppError`, `defineFeatureRoutes` + เพิ่มแบบ additive: `rateLimit`/`assertRateLimit`, `encryptSecret`/`decryptSecret`, feature flags (`GET /api/v1/features`), UI kit ของ web, fake ของทุก contract, `check:paths`, CI, Playwright fixtures, Dockerfile/render.yaml (S9) |
| **ใช้** | ไม่มี (เป็นฐานของทุกฟีเจอร์) |
| **โฟลเดอร์** | `server/src/core/**`, `web/src/core/**`, `shared/core/**`, root config/scripts/`.github/**`/`tests/e2e/**`, scaffold ของทุก `features/<slug>/` (29 โฟลเดอร์ เจ้าของแทนที่ภายหลัง) |
| **Web paths** | `/`, `/account`, `/dev-login`, `/oauth/callback`, `/forbidden`, `/no-business`, `/ops` (F35) |

> spec นี้คือเนื้อหาที่เคยอยู่ในพรอมต์ setup ทั้งก้อน ย้ายมาครบโดยไม่สรุป: พรอมต์ [prompts/C1-setup.md](../../prompts/C1-setup.md) บอกเพียงให้ทำตาม spec นี้ทีละขั้น ลำดับหัวข้อตามแบบ 15 ข้อของ [README](README.md) ขั้น S1–S9 อยู่ใน §14 (เนื้อหาของ S3/S4/S5/S6/S7 กระจายอยู่ใน §2 §4 §5 §6 §7 §8 §9 §10 ตามชนิด ทุกขั้นใน §14 ชี้ไปที่หัวข้อนั้น)

## 1. เป้าหมายและ user stories

**ทำไมมี:** อีก 11 session (orchestrator 3 + worker 8) เขียนโค้ดไม่ได้จนกว่าจะมีโครงแอปที่ build ได้ มี DB, login, UI kit, fake ของทุก contract และ CI ที่บังคับเส้นแบ่ง lane ระหว่างที่ F01 ทำ session อื่นอ่าน spec และวางแผนแบบ read-only นี่คือ critical path ของทั้งทีม · วันนี้ = **31 ฟีเจอร์** (29 โฟลเดอร์ + core + core/jobs) ตาม `FEATURES` ใน `contracts.ts` · AI ของแอปใช้ OpenAI API อย่างเดียวผ่าน `server/src/core/model.ts`

**ใครใช้:** worker/orchestrator ทุก session (เรียก core), เจ้าของร้านเดโมและกรรมการ (เห็น production), C0/C1 (ซ่อนฟีเจอร์ด้วย flag, ตรวจ `/build-info`)

**User stories**
1. ในฐานะ worker ของ lane ใดก็ตาม หลัง `SETUP READY` ฉัน `git switch -c lane/<L>/<slug> origin/main && npm ci && npm run lane:init && npm run db:migrate && npm run db:seed && npm run dev` แล้วเขียนฟีเจอร์ได้ทันทีโดยเรียก core ผ่าน `'../../core'` และ fake ของ lane อื่นผ่าน `service.ts`
2. ในฐานะเจ้าของร้านเดโม ฉันล็อกอินแล้วเห็นเมนูเฉพาะฟีเจอร์ที่ทำเสร็จจริงเท่านั้น (placeholder ไม่โผล่ใน production)
3. ในฐานะ orchestrator ฉันซ่อนหรือแสดงฟีเจอร์ได้ทันทีด้วย feature flag (ไม่ต้อง deploy) และตรวจว่า production รัน commit ที่ถูกจาก `/build-info`
4. ในฐานะ C ฉันได้ production URL ที่ขึ้นก่อน 11:30 บน Render (Singapore) ที่ migrate เอง, seed ร้านเดโม 2 ร้านได้ และล็อกอินได้ด้วย dev login ที่มี token ป้องกัน
5. ในฐานะกรรมการ ฉันเปิด Demo ได้ด้วยข้อมูลเดโมที่สมจริง (`db:seed -- --demo`) และ orchestrator คืนข้อมูลเดโมได้ด้วย `demo:reset`
6. ในฐานะ worker ฉันรัน `npm run e2e -- <slug>` กับ dev หรือ production ได้โดยใช้ fixture `ownerPage` ที่ล็อกอินเป็น owner A

**นอก scope:** ขัดเกลา UI, dark mode, ฟีเจอร์ของ lane อื่น, password login/สมัครสมาชิก (F02 ของ C3), ตาราง jobs UI ครบ (F35), เสียง/Realtime ฝั่ง browser (F30)

### ข้อมูลอ่านก่อนเริ่ม (≤ 6 นาที)

- ./contracts.ts ทั้งไฟล์: แหล่งความจริงของ types, signature, fake (@fake), seed (SEED), ตาราง FEATURES, permission catalog
  banner "═══ target: <path> ═══" บอกว่าแต่ละส่วนไปไฟล์ไหน
- ./AGENTS.md §2 (path ของแต่ละ lane), §5 (DB), §6 (branch + self-merge)
- ./.env.example: config ต้องใช้ชื่อนี้ทุกตัว ห้ามตั้งชื่อใหม่
- docs/openai-api.md §0, §1, §3–§10, §13: model.ts ทำตามนี้ทั้งหมด (Responses API, embeddings, moderation, vision, file, voice)
- prompts/README.md หัวข้อ "Core loop"

- docs/specs/F01-core.md นี้ (§1, §14 ก่อน แล้วอ่านทีละหัวข้อตามขั้น)
- **หน้าตา web shell เขียนเองจากคำอธิบายใน §7** (ไม่มีโค้ดหรือ repo อื่นให้เปิดระหว่าง setup · ไม่ต้องมี backend ของระบบอื่น)

### กติกา

- branch: git switch -c lane/C1/core (จาก origin/main ที่ checkout อยู่) · commit ทีละขั้นได้ · PR เดียวเข้า main
- ห้าม secret ใน repo/log/commit/test · ไม่มีโค้ดหรือข้อมูลของระบบอื่นใน repo (สร้างจาก spec นี้เท่านั้น) · ..\nless.secrets.env อ่านได้ ห้าม copy/พิมพ์ค่า
- เวอร์ชัน library ตามรายการ S1 เท่านั้น pin exact ไม่มี ^ ถ้า npm ตอบ ETARGET ใช้ patch ล่าสุดของ major.minor เดียวกัน แล้วจดใน server/src/core/EVIDENCE.md
- ตัดสินแล้ว ห้ามเปลี่ยน: Express 5 (async error เข้า middleware เอง, multer/ws ต่อง่าย) · tsx รัน TS
  ตรง ไม่มี build ฝั่ง server · tsc --noEmit เป็น typecheck · Vitest 4 (node + jsdom) · pg + raw SQL + migrate runner ของเราเอง
  (ไม่มี ORM) · zod 4 · ws path /ws · jobs ใน Postgres · ไฟล์บนดิสก์ · opaque session cookie · LINE/Meta ใช้ fetch +
  node:crypto · OpenAI = npm `openai` ตัวเดียว import ได้เฉพาะ server/src/core/model.ts · ห้ามมี AI SDK อื่น ·
  Google = googleapis (Calendar ไม่ใช่ AI) · ไม่มี ESLint วันนี้ (typecheck + test คือ gate)
- Express 5: wildcard ต้องตั้งชื่อ เช่น '/*splat'

- **ห้ามขัดเกลา UI ห้ามเขียนฟีเจอร์ของ lane อื่น** งานคือโครง, core (รวม model wrapper ของ OpenAI), fake และ check
- Neon สำหรับ dev (D15): `PG_SERVER_URL` ชี้ endpoint direct ของ Neon project ของคนนั้น · ห้าม pooled endpoint (ต้องการ advisory lock และ prepared statement) · Postgres 16 + pgvector ใน WSL เป็น fallback ด้วยตัวแปรเดียวกัน
- production = Render (Singapore) · Render Postgres 17 + pgvector · ไฟล์ Dockerfile/render.yaml ทำใน S9 ตาม `docs/day/deployment.md`

## 2. Data model


server/src/core/migrations/001_core.sql (ตารางกลาง ฟีเจอร์อื่นห้าม ALTER จึงต้องมีคอลัมน์ที่ core loop ใช้ครบตั้งแต่ตอนนี้):
ช่องทางมี 4 ตัวเท่านั้น: web, line, facebook, instagram (ตรงกับ Channel ใน contracts.ts) · ไม่มีตาราง plan/quota/subscription
```sql
-- dependsOn:
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  email_normalized text GENERATED ALWAYS AS (lower(btrim(email))) STORED UNIQUE,
  display_name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  is_platform_admin boolean NOT NULL DEFAULT false,
  locale text NOT NULL DEFAULT 'th' CHECK (locale IN ('th','en')),
  password_hash text,                -- F02 (C3) เขียน (scrypt); null = ยังไม่มี password login
  email_verified_at timestamptz,     -- F02 (C3)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('dev','password','oauth')),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_seen_at timestamptz,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE accounts (                         -- F03 tenancy (C3) เขียนแถว core อ่าน
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_user_id uuid NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','deleted')),
  timezone text NOT NULL DEFAULT 'Asia/Bangkok',
  language text NOT NULL DEFAULT 'th' CHECK (language IN ('th','en')),
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE memberships (                      -- F03 (C3) เขียนแถว · getBusiness()/requirePermission() ของ core อ่านทุก request
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner','staff')),
  permissions text[] NOT NULL DEFAULT '{}',   -- staff เท่านั้น; owner = ทุก key
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, user_id)
);
CREATE TABLE customers (                        -- ตัวตนต่อช่องทาง เขียนผ่าน inbox saveMessage; F24 เก็บ profile/tags ในตารางตัวเอง
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('web','line','facebook','instagram')),
  external_id text NOT NULL,
  channel_account_id text,
  display_name text NOT NULL DEFAULT '',
  avatar_file_id uuid,
  locale text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, channel, external_id)
);
CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('web','line','facebook','instagram')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  handler text NOT NULL DEFAULT 'ai' CHECK (handler IN ('ai','human')),   -- F11 isHumanTakeover / assignConversation
  assignee_user_id uuid REFERENCES users(id),
  ai_force_on boolean NOT NULL DEFAULT false,
  last_message_at timestamptz,
  last_inbound_at timestamptz,
  last_message_preview text,
  unread_count int NOT NULL DEFAULT 0,
  next_seq bigint NOT NULL DEFAULT 1,
  version int NOT NULL DEFAULT 1,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX conversations_one_open ON conversations (customer_id) WHERE status = 'open';
CREATE INDEX conversations_inbox ON conversations (business_id, last_message_at DESC);
CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  seq bigint NOT NULL,
  direction text NOT NULL CHECK (direction IN ('inbound','outbound')),
  author text NOT NULL CHECK (author IN ('customer','ai','staff','system')),
  author_user_id uuid REFERENCES users(id),
  parts jsonb NOT NULL,
  text text NOT NULL DEFAULT '',
  channel text NOT NULL,
  origin text NOT NULL DEFAULT 'live'           -- ตรงกับ MessageOrigin ใน contracts.ts (ถ้าต่างจากรายการนี้ ยึด contracts.ts)
    CHECK (origin IN ('live','demo','broadcast','comment','system')),
  external_id text,
  group_id uuid,
  provider_meta jsonb NOT NULL DEFAULT '{}',
  client_request_id text,
  delivery_mode text CHECK (delivery_mode IN ('real','sandbox')),
  delivery_state text NOT NULL DEFAULT 'not_required'
    CHECK (delivery_state IN ('not_required','pending','sent','failed','unknown')),
  delivery_external_ref text,
  delivery_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, seq)
);
CREATE UNIQUE INDEX messages_external ON messages (business_id, channel, external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX messages_client_request ON messages (conversation_id, client_request_id) WHERE client_request_id IS NOT NULL;
CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  dedup_key text UNIQUE,
  lock_key text,
  state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','running','succeeded','failed','dead','cancelled')),
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 5,
  run_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  locked_by text,
  last_error text,
  progress jsonb,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX jobs_ready ON jobs (run_at) WHERE state IN ('queued','running');
CREATE TABLE model_usage (                      -- core model.* เขียนทุก call (OpenAI); F27 อ่านเพื่อดูต้นทุน (ไม่ใช่โควตา)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE SET NULL,
  account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  conversation_id uuid,
  turn_id text,
  feature_id text NOT NULL,
  purpose text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('chat','embed','moderate','transcribe','realtime')),
  mode text NOT NULL CHECK (mode IN ('openai','fake')),
  model text NOT NULL,
  input_tokens int,
  output_tokens int,
  cached_input_tokens int,
  cache_write_tokens int,            -- input_tokens_details.cache_write_tokens (คิด 1.25× input)
  reasoning_tokens int,              -- output_tokens_details.reasoning_tokens (นับอยู่ใน output แล้ว)
  audio_input_tokens int,            -- realtime: input_token_details.audio_tokens
  audio_output_tokens int,           -- realtime: output_token_details.audio_tokens
  audio_seconds numeric,             -- transcribe: usage.seconds
  cost_usd_micros bigint,            -- null = ไม่รู้ราคา (ไม่ใช่ 0)
  cost_reason text NOT NULL,
  latency_ms int,
  finish_reason text,
  error_code text,
  request_id text,                   -- x-request-id
  response_id text,                  -- OpenAI response id (resp_…) ถ้ามี
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX model_usage_business_time ON model_usage (business_id, created_at);
CREATE TABLE files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  uploaded_by uuid REFERENCES users(id),
  purpose text NOT NULL,
  original_name text NOT NULL DEFAULT '',
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  sha256 text NOT NULL,
  storage_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid,
  account_id uuid,
  actor_user_id uuid,
  action text NOT NULL,
  target_type text,
  target_id text,
  details jsonb NOT NULL DEFAULT '{}',
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE seed_aliases (alias text PRIMARY KEY, id uuid NOT NULL, kind text NOT NULL);
CREATE TABLE feature_flags (                    -- D6: ซ่อนฟีเจอร์ที่ยังไม่ R; core อ่าน, หน้า /ops (F35) สลับ, ค่าเริ่มต้นจาก env HIDDEN_FEATURES
  feature_id text PRIMARY KEY,                  -- 'F01'…'F39' (เฉพาะฟีเจอร์ที่ folder: true ใน FEATURES)
  hidden boolean NOT NULL DEFAULT false,
  reason text,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

- ไฟล์นี้คือ **migration แรก** `001_core.sql` ของ owner `core` และต้องขึ้นต้นด้วย `-- dependsOn:` (ว่าง) ตามด้วย `CREATE EXTENSION IF NOT EXISTS vector;` เสมอ (Render Postgres และ Neon ต้องเปิด extension ในฐานข้อมูลก่อนมีคอลัมน์ `vector`) · ฟีเจอร์อื่นห้าม `ALTER` ตารางพวกนี้
- `feature_flags`: แถวมีเฉพาะฟีเจอร์ที่ถูกสลับหรือมาจาก `HIDDEN_FEATURES` (ไม่มีแถว = ไม่ซ่อน) · ฟีเจอร์ที่ `folder: false` (F01, F35) ซ่อนไม่ได้ · ค่า `visible` ที่ API คืนคำนวณที่ server (ดู §3) ไม่เก็บในตาราง
- id ของ seed เป็น uuid คงที่ตาม `SEED` ใน `contracts.ts` (ทุก DB ได้ id เดียวกัน รวมถึง production) จึงคงอยู่หลัง `demo:reset`
- uploads: ไฟล์จริงอยู่บนดิสก์ที่ `UPLOAD_DIR/<businessId>/<fileId>` (dev `var/uploads`, Render `/var/data/uploads`) ตาราง `files` เก็บ metadata

## 3. API endpoints

เส้นทางของ core (ใต้ `/api/v1` ยกเว้นที่ระบุ) · error ใช้ `ErrorCode` ใน contracts เท่านั้น (`UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_ERROR`, `RATE_LIMITED`, `SERVICE_NOT_READY`, `PROVIDER_*`, `INTERNAL`)

| method | path | auth | permission | request | response | หมายเหตุ |
|---|---|---|---|---|---|---|
| GET | `/me` | user | — | — | `{ user, businesses: [{ business, role, permissions }] }` | |
| GET | `/businesses/:businessId` | business | — | — | `BusinessRecord` | ใช้ทดสอบ tenant 404 (ไม่ใช่สมาชิก → 404) |
| POST | `/session/logout` | user | — | — | `{ ok: true }` | F02 (C3) เป็นเจ้าของ `/api/v1/auth/*` ทีหลัง |
| GET | `/features` | user | — | — | `{ production: boolean, items: FeatureFlagView[] }` | web shell ใช้ซ่อนเมนูและ route |
| PUT | `/ops/features/:featureId` | platform_admin | — | `{ hidden: boolean, reason?: string }` | `FeatureFlagView` | audit `core.feature.toggle` · หน้า UI ของ toggle = `/ops` (F35) |
| GET | `/_meta/features` | user | — | — | FEATURES + `loaded: boolean` | |
| GET | `/_meta/routes` | user | — | — | catalog จาก route registry | |
| GET | `/healthz` (root) | none | — | — | `{ status: 'ok', db: 'ok' }` | process ขึ้น + `SELECT 1`; Render health check; alias `/health/live` |
| GET | `/readyz` (root) | none | — | — | 200 `{ status: 'ready' }` หรือ 503 `SERVICE_NOT_READY` | + migration ครบ + `UPLOAD_DIR` เขียนได้ + features โหลดแล้ว; alias `/health/ready` |
| GET | `/build-info` (root) | none | — | — | `{ sha, lane, env, schema, modelMode, models, providerModes, featuresLoaded }` | ไม่มี secret |
| GET | `/api/dev/status` | none* | — | — | `{ enabled, tokenRequired }` | *มีเฉพาะเมื่อ dev login mount |
| GET | `/api/dev/users` | dev | — | — | seed users | |
| POST | `/api/dev/login` | dev | — | `{ email }` | `{ ok }` + cookie | user ที่ไม่อยู่ใน SEED → 404 |
| POST | `/api/dev/simulate-inbound` | dev | สมาชิก business | `{ businessId, text, customerExternalId? }` | message | ผ่าน inbox `saveMessage` |
| GET | `/api/dev/conversations/:conversationId/messages` | dev | สมาชิก business | — | messages | ผ่าน inbox `getHistory` |
| POST | `/api/dev/conversations/:conversationId/assign` | dev | สมาชิก business | `{ userEmail: string \| null }` | `{ ok }` | team `assignConversation` (null = คืนให้ AI) |

```ts
// shared/core/flags.ts (เพิ่มจาก contracts.ts แบบ additive; re-export ใน shared/core/index.ts)
export interface FeatureFlagView {
  featureId: string;            // 'F13'
  slug: string;                 // 'orders'
  lane: string;
  tier: 'P0' | 'P1' | 'P2' | 'P3';
  hidden: boolean;              // จากตาราง feature_flags
  reason: string | null;
  placeholder: boolean;         // ยังมีแต่ route 'placeholder status' ของ scaffold (S5) = ยังไม่ทำ
  visible: boolean;             // = !hidden && !(placeholder && production)
}
export const SetFeatureFlagBody = z.object({ hidden: z.boolean(), reason: z.string().max(200).optional() });
```

- `GET /api/v1/features` คืนเฉพาะฟีเจอร์ที่ `folder: true` (29 รายการ) · `production` = `NODE_ENV === 'production'`
- ซ่อนแล้ว **เฉพาะฝั่งเว็บ** (เมนู + route กลายเป็น NotFound): API ของฟีเจอร์ยังตอบเพราะ webhook และ smoke test ต้องเรียกได้
- CORS: ไม่เปิด (web และ API เป็น origin เดียวกัน: dev ผ่าน Vite proxy, production เสิร์ฟจาก Express)

## 4. Service functions และ contracts

**public API = `server/src/core/index.ts`** ฟีเจอร์ import core จาก `'../../core'` เท่านั้น พฤติกรรมตาม JSDoc ใน contracts.ts ทุกตัว

features import core จาก '../../core' เท่านั้น index.ts export: config, log, AppError, db, jobs, model, getUser, getBusiness,
requirePermission, requirePlatformAdmin, createSession, destroySession, sendToCustomer, registerChannelSender, publish, storage,
audit, defineFeatureRoutes, rateLimit, assertRateLimit, encryptSecret, decryptSecret, isFeatureHidden (+ re-export types) · พฤติกรรมตาม JSDoc ใน contracts.ts ทุกตัว
(createSession/destroySession ให้ F02 auth ของ C3 ใช้ signature ตาม contracts.ts:
 createSession(userId, kind: 'dev' | 'password' | 'oauth', res: ResponseLike): Promise<void> และ destroySession(req, res): Promise<void>)
- config.ts: dotenv โหลด <repo root>/.env.local (override false = process env ชนะ) แล้ว zod ตรวจทุกชื่อใน .env.example
  มี default ปลอดภัย ค่าที่ขึ้นต้น REPLACE ถือว่าว่าง · ค่าบอร์ด (SITES_*, BOARD_*) เป็นของสคริปต์บอร์ด แอปไม่ใช้:
  config ข้าม ไม่ export ไม่ log · MODEL_MODE = fake เมื่อ OPENAI_API_KEY ว่าง หรือ NODE_ENV=test
  หรือ CI=true หรือตั้ง MODEL_MODE=fake (log mode ตอน boot) · MODEL_PRICE_TABLE parse เป็น JSON ตอน boot (พังให้บอกชื่อ key
  ไม่พิมพ์ค่า) · SLIP_VERIFY_MODE = 'vision' | 'sandbox' (default vision) · providerMode('line'|'meta'|'google'|'payment') =
  sandbox ถ้า key ไม่ครบ · ห้าม log ค่า secret
  ตัวแปรที่ core อ่านเพิ่มจาก .env.example (ทุกตัวต้องอยู่ใน zod schema พร้อม default): APP_BASE_URL (production URL; ใช้สร้างลิงก์ใน
  email/webhook/OAuth redirect และเป็น origin ที่ CSRF ยอมรับ) · PORT (ถ้ามี ชนะ API_PORT; Render ตั้งให้) · RUN_WORKER / RUN_SCHEDULER
  (default 1 ทั้งคู่; JOBS_WORKER ยังอ่านได้เป็นชื่อเดิมของ RUN_WORKER เมื่อ RUN_WORKER ว่าง) · UPLOAD_DIR · DEV_LOGIN_ENABLED, DEV_LOGIN_TOKEN ·
  HIDDEN_FEATURES · TOKEN_ENCRYPTION_KEY · DEMO_CHAT_DAILY_TURN_CAP, EVAL_MAX_COST_USD, MCP_ENABLED, VAPID_* (core แค่ parse
  และ export ผ่าน config ให้ฟีเจอร์อ่าน ไม่ใช้เอง) · E2E_* ไม่อยู่ใน config ของ server (ใช้เฉพาะ Playwright)
  NODE_ENV=production: ต้องมี SESSION_SECRET ≥ 32 ตัว, TOKEN_ENCRYPTION_KEY (base64 32 ไบต์), DATABASE_URL, APP_BASE_URL ไม่งั้น boot ล้มพร้อมชื่อ key
  (ไม่พิมพ์ค่า) · COOKIE_SECURE ถูกบังคับเป็น 1 · ไม่ production: ไม่มี TOKEN_ENCRYPTION_KEY → derive จาก SESSION_SECRET (HKDF) พร้อม warn
- log.ts: pino JSON (LOG_LEVEL) ทุกบรรทัดมี requestId เมื่ออยู่ใน request (AsyncLocalStorage) · redact: authorization, cookie, set-cookie,
  *.password, *.token, *.secret, *.apiKey, *.accessToken, *.clientSecret, *.refreshToken, *.slipImage, *.image, *.dataUrl, *.file_data, *.image_url
  (รูปสลิปและ data URL ห้ามอยู่ใน log) · ห้าม log body ของ request/response เป็นค่าเริ่มต้น · ทุก request log หนึ่งบรรทัดตอนจบ: { method, route
  (pattern ไม่ใช่ URL จริง), status, ms, requestId, userId?, businessId? } ระดับ info (>= 1000 ms หรือ 5xx = warn/error) ·
  ทุก model.* log { purpose, mode, model, latencyMs, tokens, costUsdMicros, requestId } (ไม่มี prompt) คู่กับแถว model_usage
- errors.ts: AppError ตาม contract + toApiFailure(err, requestId) (error อื่น → INTERNAL, message ทั่วไป)
- db.ts: pg Pool จาก DATABASE_URL (NODE_ENV=test ใช้ TEST_DATABASE_URL), max = DB_POOL_MAX (default 5 ต่อ process), connectionTimeoutMillis 10000, ssl เปิดเมื่อ URL มี sslmode=require (Neon/Supabase; ตรวจ certificate ปกติ), SET statement_timeout ทุก connection,
  pgvector registerTypes, implement DbClient (query/one/maybeOne/tx/withAdvisoryLock/toVector) · client.release() ใน finally เสมอ
  · assertSafeDbName(name): ต้องตรง /^nless_hack_[a-c][0-3](_test)?$/ (allow-list ของ dev: a0…c3 + _test) · `create` และ `reset` ใช้ได้เฉพาะชื่อที่
    ผ่านเท่านั้น (เสมอ แม้ NODE_ENV=production) · `migrate`/`seed` ใช้ได้กับชื่อที่ผ่าน หรือกับ DB ใดก็ได้เมื่อ NODE_ENV=production (preDeployCommand
    ของ Render และ seed ครั้งแรกบน production) · DB_NAME_PREFIX ยังอยู่ใน .env.example เป็นคำเตือนเท่านั้น
  · pool ที่ Neon: รองรับ connection ที่ถูกตัดตอน idle (listener 'error' บน pool ห้าม crash; ลองใหม่ได้ 1 ครั้งสำหรับ statement แรกหลัง suspend)
- http.ts + app.ts: createApp() (ไม่ listen, ให้ test ใช้ supertest ได้): `app.set('trust proxy', 1)` เมื่อ NODE_ENV=production (Render อยู่หลัง proxy: req.ip, req.secure ถูกต้อง) · requestId (crypto.randomUUID; เคารพ header X-Request-Id ที่ยาว ≤ 64 ตัวอักษร a-z0-9-),
  /webhooks/* ใช้ express.raw({ type: '*/*' }) ก่อน json · /api ใช้ express.json({ limit: '2mb' }) + cookie-parser ·
  CSRF: POST/PUT/PATCH/DELETE ใต้ /api ที่มี session cookie ต้องมี header X-Requested-With: nless และ Origin (ถ้ามี) อยู่ใน
  WEB_ORIGIN/APP_BASE_URL/PUBLIC_BASE_URL · createFeatureApi(featureId): implement FeatureApi ตาม contract (auth/permission, zod body/query
  → 400 VALIDATION_ERROR, multer memory สำหรับ upload, คืนค่า → ApiResult, HttpResponse kinds, webhook mount ที่
  /webhooks<path>) · route registry (method, path, featureId, auth, permission, summary) ซ้ำข้ามฟีเจอร์ → boot fail บอกทั้งสอง ·
  error middleware → ApiFailure + status จาก ERROR_HTTP_STATUS · /api ที่ไม่มี route → 404 NOT_FOUND แบบ ApiFailure
- auth.ts: session token = 32 bytes base64url ใน cookie nless_session (HttpOnly, SameSite=Lax, Secure เมื่อ COOKIE_SECURE=1 หรือ NODE_ENV=production (บังคับ),
  อายุ SESSION_TTL_HOURS) · DB เก็บ HMAC-SHA256(SESSION_SECRET, token) ไม่เก็บ token ดิบ · createSession(userId, kind, res) / destroySession ·
  getUser, getBusiness, requirePermission, requirePlatformAdmin ตาม contract (owner = ทุก PermissionKey, staff =
  memberships.permissions, อ่าน DB ทุก request) · core routes:
    GET  /api/v1/me → { user, businesses: [{ business, role, permissions }] }
    GET  /api/v1/businesses/:businessId → BusinessRecord (auth business) ← ใช้ทดสอบ tenant 404
    POST /api/v1/session/logout (F02 ของ C3 เป็นเจ้าของ /api/v1/auth/* ทีหลัง)
    GET  /api/v1/features → { production, items: FeatureFlagView[] } (user ที่ล็อกอิน; คำนวณ placeholder จาก route registry: ฟีเจอร์ที่ route ทั้งหมด
         มีแค่ summary 'placeholder status' = placeholder) · PUT /api/v1/ops/features/:featureId (requirePlatformAdmin; upsert feature_flags,
         audit 'core.feature.toggle', publish ไม่ต้อง) · ตอน boot: HIDDEN_FEATURES (คั่นด้วย , หรือเว้นวรรค เช่น F13,F14) → INSERT … ON CONFLICT DO
         NOTHING reason 'env HIDDEN_FEATURES' (ค่าเริ่มต้นเท่านั้น ไม่ทับแถวที่มีอยู่; id ที่ไม่รู้จัก/ไม่มีโฟลเดอร์ → warn)
    helper ใน core (export จาก index.ts): isFeatureHidden(featureId): Promise<boolean>
- dev.ts: **dev login ใช้เฉพาะ dev ในเครื่องและชั่วโมงแรก ๆ ของ production** · mount เมื่อ DEV_LOGIN=1 และ DEV_LOGIN_ENABLED ไม่เป็น false/0 · NODE_ENV=production
  ต้องมี DEV_LOGIN_TOKEN (สุ่ม ≥ 24 ตัวอักษร ตั้งใน Render env; สั้นกว่า/ไม่มี = ไม่ mount และ log error) และทุก request ใต้ /api/dev/* ต้องส่ง header
  X-Dev-Login-Token ที่ตรง (เทียบแบบ constant-time; ผิด → 404 ไม่บอกว่าเปิดอยู่) · **ปิดด้วย DEV_LOGIN_ENABLED=false ทันทีที่ F02 (C3) merge และล็อกอินจริงได้**
  (คน C เปลี่ยนใน Render env แล้ว redeploy) · ทุก response ใส่ header X-Dev-Login: 1 · GET /api/dev/status → { enabled, tokenRequired } (ไม่ต้องมี token;
  ให้หน้า /dev-login รู้ว่าต้องกรอก token) · บน production สร้าง session kind 'dev' อายุ ≤ 2 ชั่วโมง (SESSION_TTL_HOURS ถูกตัดทอน):
    GET  /api/dev/users → seed users (email, displayName, isPlatformAdmin, businesses)
    POST /api/dev/login { email } → createSession(kind 'dev') · user ที่ไม่อยู่ใน SEED → 404
    POST /api/dev/simulate-inbound { businessId, text, customerExternalId? } → ต้องเป็นสมาชิก business → inbox
         saveMessage({ businessId, customer: { channel: 'web', externalId: customerExternalId ?? 'dev-demo-visitor',
         displayName: 'Demo visitor' }, direction: 'inbound', author: 'customer', parts: [{ type: 'text', text }], origin: 'demo' })
    GET  /api/dev/conversations/:conversationId/messages → inbox getHistory (เช็ก business ของ conversation)
    POST /api/dev/conversations/:conversationId/assign { userEmail: string | null } → team assignConversation
         (null = คืนให้ AI) ใช้ใน smoke ก่อน F11 มีปุ่มจริง
- channels.ts: registry + sendToCustomer + registerChannelSender ตาม contract · job 'core.deliver' · sender 'web' (mode real:
  delivery_state 'sent' + publish 'message.updated') · sandbox capture senders ของ line/facebook/instagram
  (mode sandbox, simulatedRef `sandbox-<messageId>`, log parts) · ผล 'unknown' ห้าม retry เอง
- realtime.ts: ws WebSocketServer({ server, path: '/ws' }) · upgrade อ่าน cookie → getUser · client ส่ง
  { type: 'subscribe', businessId } → เช็ก membership → เข้าห้อง · ping ทุก 25 วินาที (ws.ping; ตัด client ที่ไม่ตอบ pong 2 รอบ) · publish() ตาม contract (ไม่ throw)
- storage.ts: ไฟล์ไว้ที่ UPLOAD_DIR/<businessId>/<fileId> + ตาราง files ตาม contract · UPLOAD_DIR default var/uploads (dev), production = /var/data/uploads (Render disk) · สร้างโฟลเดอร์ตอน boot และเช็กว่าเขียนได้ (ไม่ได้ → /readyz 503) · audit.ts: insert audit_events
- features.ts: อ่าน server/src/features/* → dynamic import routes.ts (pathToFileURL) → default export ต้องมี featureId/slug
  ตรงชื่อโฟลเดอร์และตรง FEATURES → register(createFeatureApi(id)) · รวม jobs (type ซ้ำ → boot fail) + schedules ·
  defineFeatureRoutes = identity function · loader จดว่าฟีเจอร์ใดมี route เดียวคือ summary 'placeholder status' (ใช้คำนวณ FeatureFlagView.placeholder)
- meta.ts: GET /healthz → { status: 'ok', db: 'ok' } เมื่อ process ขึ้นและ SELECT 1 ผ่าน (Render health check) · GET /readyz → healthz + ไม่มี migration ค้าง + UPLOAD_DIR เขียนได้ + features โหลดแล้ว ไม่งั้น 503 · /health/live และ /health/ready = alias ของสองตัวนี้ (ชื่อเดิม)
  SERVICE_NOT_READY · GET /build-info → { sha (BUILD_SHA หรือ RENDER_GIT_COMMIT หรือ git rev-parse HEAD ตอน boot; ไม่มี git = 'unknown'), lane, env (NODE_ENV), schema (migration ล่าสุด),
  modelMode, models (alias → model id จาก env, ไม่มี key), providerModes (line, meta, google, payment, slip), featuresLoaded }
  ห้ามมี secret · GET /api/v1/_meta/features (FEATURES + loaded) · GET /api/v1/_meta/routes (protocol catalog จาก route registry, auth user)
- server.ts: createApp() → loadFeatures() → production เสิร์ฟ web/dist + SPA fallback ('/*splat' ที่ไม่ใช่ /api,/webhooks,/ws,/health,/healthz,/readyz,/build-info) →
  http.createServer → attach realtime → RUN_WORKER=1 แล้ว startWorker() และ RUN_SCHEDULER=1 แล้ว startScheduler() (§8) → listen(process.env.PORT ?? API_PORT, '0.0.0.0') → log URL · SIGINT/SIGTERM ปิดสวย (ปล่อย advisory lock)
- shims.d.ts: declare module 'promptpay-qr'
- test-utils.ts: createTestAgent() (supertest บน createApp + loadFeatures), loginAs(agent, email), drainJobs(),
  simulateInbound(agent, businessId, text, externalId?) · test-global-setup.ts: NODE_ENV=test, MODEL_MODE=fake, OPENAI_API_KEY='',
  db = TEST_DATABASE_URL → DROP SCHEMA public CASCADE / CREATE SCHEMA public → migrate → seed
  (กติกา test สำหรับทุก lane: สร้างข้อมูลใหม่เอง เช่น customerExternalId ไม่ซ้ำ ห้ามแก้แถว SEED)

- crypto.ts: `encryptSecret(plain: string): string` / `decryptSecret(token: string): string` ด้วย AES-256-GCM กุญแจ = TOKEN_ENCRYPTION_KEY (base64 → 32 ไบต์
  ไม่ใช่ → boot ล้ม) · รูปแบบ `enc:v1:<iv base64url 12 ไบต์>:<tag base64url>:<ciphertext base64url>` · decrypt ผิดรูป/ผิด tag → AppError('INTERNAL') ไม่บอกค่า ·
  ใช้เก็บ provider token (LINE/Meta/Google) และค่า payment settings ในตารางของฟีเจอร์ (ไม่เก็บ plain text) · ห้าม log ค่า
- ratelimit.ts: `rateLimit({ key, limit, windowSeconds }): { allowed: boolean; remaining: number; retryAfterSeconds: number }` (fixed window ในหน่วยความจำ
  ต่อ process ซึ่งพอเพราะมี web instance เดียว; Map ล้างทุก 60 วิ, สูงสุด 10,000 key) · `assertRateLimit(input)` = เรียกแล้ว throw AppError('RATE_LIMITED',
  retryable true, meta.retryAfterSeconds) เมื่อเกิน · `rateLimited({ name, limit, windowSeconds, key? })` = Express middleware (key default = `<name>:<req.ip>`)
  ตอบ 429 ApiFailure + header Retry-After · ใช้จาก route/webhook handler ได้ (Demo Chat สาธารณะของ F09, webhook ของ F17/F18, public feed ของ F39) ·
  /api/dev/login ใช้ 10 ครั้ง/นาที/ip เสมอ


### Contract additions (เพิ่มจาก contracts.ts แบบ additive; ไม่เปลี่ยน signature เดิม)

```ts
// server/src/core/index.ts เพิ่ม export
export declare function rateLimit(input: { key: string; limit: number; windowSeconds: number }): { allowed: boolean; remaining: number; retryAfterSeconds: number };
export declare function assertRateLimit(input: { key: string; limit: number; windowSeconds: number }): void;   // throws AppError('RATE_LIMITED')
export declare function encryptSecret(plain: string): string;
export declare function decryptSecret(token: string): string;
export declare function isFeatureHidden(featureId: FeatureId): Promise<boolean>;
export declare function revokeUserSessions(userId: string): Promise<number>;   // sets revoked_at on every active session of the user (F02 reset/change password, F03 member removed)
// RouteContext gains `res: ResponseLike` (cookies only): handlers call createSession(userId, kind, ctx.res) / destroySession(ctx.req, ctx.res)
// (F02 login, signup, invitation accept, logout) and the public Demo Chat may set its visitor cookie. Body and status still go through the return value.
// ฟีเจอร์เพิ่มได้ใน server/src/features/<slug>/seed.ts (optional, ไม่อยู่ใน FeatureSeed ของ contracts.ts):
//   export async function runDemo(ctx: SeedContext): Promise<void>      // ข้อมูลเดโมที่สมจริง (db:seed -- --demo)
//   export async function resetDemo(ctx: SeedContext): Promise<void>    // ลบข้อมูลธุรกรรมของร้านเดโม (demo:reset) ก่อน seed ใหม่
```

ส่วนที่ spec อื่นเพิ่มให้ core หลัง setup (C1 ทำเองใน lane เดียวกัน; signature อยู่ใน contracts.ts แล้ว): **F35** เพิ่ม `core/migrations/002_jobs_hardening.sql` (คอลัมน์ของ `jobs` + index), `drainJobs`, `redactText` / `redactObject`, `assertUploadAllowed`, class `ChannelSendError`, scheduler tick 10 วินาที (lock retry 30 วินาที), `/readyz` ที่ตรวจ worker และ scheduler และหน้า `/ops` ([spec F35](F35-core-jobs.md)) · **F39** ใช้ `FeatureRoutes.mountExpress(app)` เพื่อ mount `/mcp/:businessSlug` ที่ root: `server.ts` ต้องเรียก hook นี้หลัง mount `/api` และ `/webhooks` ก่อน SPA fallback และยกเว้น prefix `/mcp` จาก SPA fallback ([spec F39](F39-chatgpt-catalog.md)) · **F02** ใช้ `ctx.res` และ `revokeUserSessions` · production ตั้ง `DB_POOL_MAX=12` ([deployment.md](../day/deployment.md))

## 5. Algorithms

### 5.1 migrate.ts / db.ts script

- migrate.ts ตาม FeatureMigration ใน contracts.ts: runner สร้าง schema_migrations(id text PK, owner text, checksum text,
  applied_at timestamptz) เอง · อ่าน server/src/core/migrations (owner 'core') + server/src/features/*/migrations ·
  บรรทัดแรก `-- dependsOn: a, b` (ว่าง = core) · topo sort ตาม owner, เสมอกันเรียง slug, ในโฟลเดอร์เรียง NNN ·
  checksum = sha256 ของเนื้อไฟล์หลังแปลง CRLF→LF (Windows checkout ต้องได้ค่าเดียวกับ CI) · ไฟล์ละ transaction ·
  cycle/slug ไม่รู้จัก/checksum เปลี่ยน → fail พร้อมข้อความ · dependency ที่ยังไม่มีไฟล์ → warn แล้วไปต่อ ·
  export planMigrations(files) แบบ pure ให้ test ได้

- scripts/db.ts (คำสั่ง `create | migrate | seed [--demo] | reset | demo-reset`):
  `create` = ต่อ server จาก DATABASE_URL โดยเปลี่ยนชื่อ DB เป็น `postgres` (Neon: ฐานข้อมูล `postgres` มีให้) แล้ว CREATE DATABASE ถ้ายังไม่มี ทั้ง DB หลักและ
  TEST_DATABASE_URL (default <db>_test) · ชื่อต้องผ่าน assertSafeDbName (§4) · แล้วต่อเข้าแต่ละ DB รัน `CREATE EXTENSION IF NOT EXISTS vector` และ `pgcrypto`
  (ล้มที่ vector = หยุดพร้อมข้อความว่า Neon/Postgres ไม่มี pgvector) · รันซ้ำได้ ·
  `migrate` · `seed` (ดู §9) · `reset` (assertSafeDbName → DROP SCHEMA public CASCADE; CREATE SCHEMA public → migrate → seed) · `demo-reset` (ดู §9)
  ทุกคำสั่งพิมพ์ชื่อ DB (host + ชื่อ ไม่มีรหัสผ่าน) ก่อนทำ

### 5.2 scripts/lane-init.ts

- scripts/lane-init.ts: อ่าน .lane (ไม่มี หรือไม่อยู่ใน ALL_LANES ของ contracts.ts = หยุดพร้อมข้อความ) → n = LANE_NUMBER → เขียน .env.local ตามลำดับ (ตัวหลังชนะ):
  1) ทุก key ใน .env.example ด้วยค่า default ของไฟล์นั้น (รวม OPENAI_CHAT_MODEL, OPENAI_CHAT_MODEL_FAST,
     OPENAI_CHAT_MODEL_STRONG, OPENAI_EMBED_MODEL, EMBED_DIM, OPENAI_MODERATION_MODEL, OPENAI_REALTIME_MODEL,
     OPENAI_REALTIME_VOICE, OPENAI_REALTIME_TRANSCRIBE_MODEL, OPENAI_TRANSCRIBE_MODEL, OPENAI_TTS_MODEL, MODEL_TIMEOUT_MS,
     MODEL_MAX_OUTPUT_TOKENS, MODEL_PRICE_TABLE, SLIP_VERIFY_MODE ตามชื่อใน .env.example)
  2) ค่าจาก ../nless.secrets.env เฉพาะ key ที่อยู่ใน .env.example (รวม OPENAI_API_KEY และค่าบอร์ด SITES_URL,
     SITES_BYPASS_TOKEN, BOARD_SECRET, BOARD_SOURCE, BOARD_REPO, BOARD_ISSUE, BOARD_TEAM_LOGINS) · key อื่นในไฟล์ secrets → เตือน "unknown key <NAME>" ไม่พิมพ์ค่า ·
     ไม่มีไฟล์ secrets → เตือนแล้วไปต่อ (model จะเป็น fake, บอร์ดใช้ GitHub) · BOARD_SOURCE ว่าง → sites
  3) ค่าของ lane: LANE, API_PORT=3000+n, WEB_PORT=5170+n, WEB_ORIGIN=http://localhost:<WEB_PORT>,
     APP_BASE_URL=http://localhost:<WEB_PORT>, E2E_BASE_URL=http://localhost:<WEB_PORT>,
     DATABASE_URL=${PG_SERVER_URL}/nless_hack_<lane ตัวเล็ก> (A0 → nless_hack_a0), TEST_DATABASE_URL=..._test · ถ้า PG_SERVER_URL มี ?query
     (เช่น ?sslmode=require ของ Neon) ให้ต่อ query ท้ายชื่อ DB ทั้งสองค่า · PG_SERVER_URL ต้องไม่ชี้ host ที่มี `-pooler` (เตือนแล้วหยุด)
     SESSION_SECRET ว่างหรือขึ้นต้น REPLACE → สุ่มใหม่ 48 ตัวอักษรและเขียนลง .env.local (ไม่พิมพ์ค่า) · TOKEN_ENCRYPTION_KEY ว่าง → สุ่ม 32 ไบต์ base64
  ค่าที่ขึ้นต้น REPLACE ให้ว่าง · ก่อนเขียนตรวจ git check-ignore -q .env.local (ไม่ ignore → หยุด) · CI=true → ไม่อ่านไฟล์ secrets ·
  มี .env.local อยู่แล้ว: ไม่ทับยกเว้น --force และพิมพ์เฉพาะ "ชื่อ" key ที่เปลี่ยน (ห้ามพิมพ์ค่า) → เรียก db create

### 5.3 scripts/check-paths.ts (ownership check ของ CI)

`npm run check:paths -- --base <ref> --branch <name>` (base default origin/main, branch default GITHUB_HEAD_REF หรือ branch ปัจจุบัน) · ไฟล์ที่เปลี่ยน =
`git diff --name-only --no-renames <base>...HEAD` · ชนิด branch ตรวจจาก pattern ใน contracts.ts (`LANE_BRANCH_PATTERN`, `LEAD_BRANCH_PATTERN`, `FIX_BRANCH_PATTERN`):

1. `main` → ผ่าน
2. `lead/<ชื่อ>` (`LEAD_BRANCH_PATTERN`) → เตือน "ต้องมีคนรีวิว" แล้วผ่าน
3. `lane/<LANE>/<slug>` (`LANE_BRANCH_PATTERN`; worker lane เท่านั้น) → ทุกไฟล์ต้องเป็นของ `<LANE>` ตามกฎเจ้าของด้านล่าง ไม่งั้นพิมพ์ตาราง path/เจ้าของ แล้ว exit 1 ·
   bootstrap: ถ้า <base> ยังไม่มีโฟลเดอร์ server/src/features (PR setup นี้เท่านั้น) และ lane = C1 → ผ่านพร้อม notice
4. `fix/<OWNER>/<slug>` (`FIX_BRANCH_PATTERN`; orchestrator แก้ข้าม lane ตาม D5) → ใช้กฎเจ้าของของ lane `<OWNER>` และ **ทั้งหมดนี้ต้องผ่าน**:
   (ก) ทุกไฟล์เป็นของ `<OWNER>` · (ข) diff มีไฟล์ test ≥ 1 ไฟล์ (`*.test.ts`, `*.test.tsx`, `*.spec.ts`, หรืออยู่ใต้ `tests/`) · (ค) บรรทัดที่เปลี่ยน
   (added + deleted จาก `git diff --numstat`) **นอกไฟล์ test** รวม ≤ 40 · (ง) ไม่แตะไฟล์ใต้ `*/migrations/*` และไม่แตะ `contracts.ts` (root และ
   `docs/competition-plan/templates/contracts.ts`) · ผิดข้อใดพิมพ์เหตุผลเป็นข้อ ๆ แล้ว exit 1 · ถ้ามีไฟล์ `.lane` ในเครื่องและค่าไม่ใช่ A0/B0/C0 → เตือน
   "fix/ ใช้จาก orchestrator" (เตือนเท่านั้น เพราะ CI ไม่เห็น .lane)
5. อย่างอื่นทั้งหมด → fail "ตั้งชื่อ branch เป็น lane/<LANE>/<slug> (worker) หรือ fix/<owner-lane>/<slug> (orchestrator)"

กฎเจ้าของไฟล์: ขึ้นต้น `server/src/features/<slug>/`, `web/src/features/<slug>/` หรือ `shared/features/<slug>/` = lane ของ slug นั้นจาก FEATURES (มี `/` ปิดท้ายเสมอ กัน
knowledge กับ knowledge-import; `web/src/features/<slug>/e2e/` อยู่ใต้ slug ด้วย) · ไฟล์อื่นทั้งหมด (core, root, scripts, .github, .codex, docs, prompts, tests/e2e,
Dockerfile/render.yaml, lockfile) = C1 · export ฟังก์ชัน pure (`ownerOfPath`, `checkBranch({ branch, files, numstat })`) ให้ unit test · ownership ที่ต้องได้
(ตรวจกับ FEATURES; ไม่ตรง = contracts.ts เก่า → หยุดแล้ว BLOCKED @REPLACE_LEAD_LOGIN):
  C1: core paths + release + chatgpt-catalog · C2: line, meta, comments · C3: business-settings, tenancy, auth, notifications
  B1: knowledge, knowledge-search, catalog, evals · B2: ai-agent, voice, follow-ups · B3: knowledge-import, insights, analytics
  A1: inbox, team, message-templates, broadcast · A2: orders, payments, live-commerce · A3: crm, booking, calendar

### 5.4 scripts/smoke.ts
- รันตอน npm run dev อยู่ (base URL จาก API_PORT): dev login owner.a → `GET /api/v1/_meta/features` ทุก 31 ฟีเจอร์ `loaded: true` (ไม่เช็ก placeholder route
  เพราะเจ้าของฟีเจอร์ลบ route นั้นเมื่อทำของจริง) → `GET /api/v1/features` ได้ 29 รายการ → owner.a GET /api/v1/businesses/<id ของ B> = 404 → simulate-inbound A
  "A-GAME-01 ราคาเท่าไหร่ครับ" ด้วย customerExternalId ใหม่ทุกครั้ง (smoke-<timestamp>) → poll messages ≤ 5 วิ ต้องเจอ AI reply ที่มี "1,490" และ delivery state
  'sent' → POST /api/dev/conversations/:id/assign { userEmail: 'staff.a@example.test' } → simulate อีกครั้ง (externalId เดิม) → ไม่มี AI reply ใหม่ใน 3 วิ ·
  ทำงานกับ production ได้ด้วย `SMOKE_BASE_URL` + `DEV_LOGIN_TOKEN` (ส่ง header) · พิมพ์ตาราง PASS/FAIL, exit 1 ถ้ามี FAIL

### 5.5 scripts/smoke-openai.ts

- scripts/smoke-openai.ts (= smoke test ของ docs/openai-api.md §14 แต่ยิงผ่าน model.* ของ core จึงทดสอบ wrapper ด้วย;
  ต้อง lane:init + db:migrate แล้วเพราะ core เขียน model_usage):
  OPENAI_API_KEY ว่าง → พิมพ์ "SKIP: ไม่มี OPENAI_API_KEY" exit 0 · มี key → บังคับ openai mode แล้วเรียกครั้งเดียวต่อรายการ:
    model.chat alias chat, fast, strong ("ตอบคำเดียวว่า สวัสดี", maxOutputTokens 50; ไม่ error = PASS แม้ finishReason 'length'
    เพราะ reasoning token นับใน cap) · tool round-trip บน chat (maxOutputTokens 400, tool get_time
    strict → ต้องได้ toolCalls → ส่ง tool result + providerState → ต้องได้ finishReason 'stop') · model.embed(['ทดสอบ']) → dim 1536 ·
    model.moderate({ text: 'สวัสดี' }) → flagged false · --realtime: createRealtimeSession แล้วพิมพ์แค่ expiresAt (ห้ามพิมพ์ secret)
  พิมพ์ตาราง alias / model id / ผล / tokens (in, cached, reasoning, out) / costUsdMicros / latency · ไม่พิมพ์ข้อความ key หรือ
  header · มี FAIL → exit 1 · ทุก call ใช้ usage { featureId: 'F01', purpose: 'smoke', businessId: null }

### 5.6 โมดูลหลักอื่น (สรุปที่อยู่ของพฤติกรรม)
- jobs/worker/scheduler: §8 · model.ts: §6 · config/db/http/auth/dev/channels/realtime/storage/features/meta/server: §4 · seed/demo: §9 · web core: §7

## 6. AI calls (model wrapper ใน core)

core ไม่มี AI call ของตัวเอง นอกจาก smoke (`purpose: 'smoke'`) · ส่วนนี้คือ **ข้อกำหนดของ model.ts** ที่ทุกฟีเจอร์เรียกผ่าน `model.*` · ไม่มี prompt ของ core เอง · ทุก alias = `gpt-6.2-sol`

- model.ts: ที่เดียวใน repo ที่ import 'openai' · ทำตาม ModelApi ใน contracts.ts (ถ้า contracts.ts กับข้อความนี้ต่างกันเรื่อง
  signature ยึด contracts.ts) และ docs/openai-api.md §3–§10 · แยกเป็นฟังก์ชัน pure ที่ test ได้โดยไม่มี network:
  buildResponsesRequest(), mapResponse(), classifyOpenAIError(), computeCostMicros(), withDeadlineRetry(fn, { now, sleep })
  client: new OpenAI({ apiKey, baseURL: OPENAI_BASE_URL || undefined, maxRetries: 0, timeout: MODEL_TIMEOUT_MS })
    (ตรงกับ contracts.ts และ docs/openai-api.md §3: ปิด retry ของ SDK แล้ว core retry เองไม่เกิน 1 ครั้ง ไม่ retry
     429 insufficient_quota และ retry อยู่ใน deadline เดียวกัน ซึ่ง SDK ทำให้ไม่ได้)
  chat() → openai.responses.create เท่านั้น (ไม่ใช้ Chat Completions):
    · model alias: input.model ?? 'chat' → 'chat'=OPENAI_CHAT_MODEL, 'fast'=OPENAI_CHAT_MODEL_FAST, 'strong'=OPENAI_CHAT_MODEL_STRONG
    · reasoning.effort: input.reasoningEffort ?? (fast → 'none', chat/strong → 'low') · model id ขึ้นต้น 'gpt-6.2-' + 'none'
      → ส่ง 'low' แทน (Sol/Astra ตอบ 400) · text.verbosity 'low'
    · ทุก request: store:false, max_output_tokens = maxOutputTokens ?? MODEL_MAX_OUTPUT_TOKENS (≥16, รวม reasoning token),
      prompt_cache_key `biz:<businessId>` (ถ้ามี), safety_identifier = sha256 hex ของ (conversationId ?? businessId) (ถ้ามี),
      metadata { purpose, feature_id, conversation_id?, turn_id? } (≤16 คู่, value ≤512 ตัว) ·
      ห้ามส่ง temperature, top_p, top_logprobs, user, instructions, previous_response_id (field temperature ถ้าเหลือใน type ให้ละทิ้ง)
    · messages → input: role 'developer' และ 'system' (alias) → { role:'developer' } ใส่หน้าสุดตามลำดับที่ส่งมา ·
      user content string ตรง ๆ หรือ ModelContentPart[]: text → input_text · image → input_image { image_url: dataUrl, detail:
      detail ?? 'auto' } · file → input_file { filename, file_data: dataUrl } · uploadRef = id ในตาราง files → storage.read(id,
      { businessId: usage.businessId }) แล้วแปลงเป็น data URL (ไม่เจอ/ข้าม tenant/businessId null → VALIDATION_ERROR) ·
      assistant text → { role:'assistant', content } · tool → { type:'function_call_output', call_id: toolCallId, output: content }
    · tool loop: tools → { type:'function', name, description, parameters, strict: tool.strict ?? true },
      toolChoice 'auto'|'none'|'required' ส่งตรง, { name } → { type:'function', name }, parallel_tool_calls true ·
      เมื่อมี tools ส่ง include: ['reasoning.encrypted_content'] (store:false ต้องใช้ตัวนี้จึงส่ง reasoning item กลับได้) ·
      ผลลัพธ์: toolCalls = function_call items → { id: call_id, name, arguments: JSON.parse (parse ไม่ได้ → {} + log warn) } ·
      providerState (ทึบ, มีเมื่อ finishReason 'tool_calls') = { v: 1, items: [output items ของรอบนี้ (reasoning + function_call)
      ต่อท้าย items ของ providerState ที่ส่งเข้ามา] } ·
      รอบถัดไปผู้เรียกส่ง messages เต็ม (รวม assistant ที่มี toolCalls ของรอบก่อน + { role:'tool', toolCallId, content }) พร้อม
      providerState ล่าสุด: core แทน assistant+toolCalls แต่ละอันด้วย reasoning/function_call items ที่ call_id ตรงกันจาก
      providerState (ไม่มี providerState → สร้าง function_call item จาก toolCalls เอง) · ห้ามใช้ previous_response_id
    · responseFormat → text.format { type:'json_schema', name, schema, strict: strict ?? true } → json = JSON.parse(output_text)
      (parse ไม่ได้ = json undefined; ผู้เรียก validate ด้วย zod เสมอ)
    · finishReason: function_call items → 'tool_calls' · status 'incomplete' + incomplete_details.reason 'max_output_tokens' →
      'length' · refusal content หรือ incomplete reason 'content_filter' → 'content_filter' (text '') · นอกนั้น 'stop'
    · usage: input_tokens, input_tokens_details.cached_tokens, input_tokens_details.cache_write_tokens, output_tokens,
      output_tokens_details.reasoning_tokens → ModelUsage (inputTokens, outputTokens, cachedInputTokens, cacheWriteTokens,
      reasoningTokens; ไม่มีค่า = null ไม่ใช่ 0) · requestId = response._request_id หรือ error.requestID
  computeCostMicros (MODEL_PRICE_TABLE = ModelPriceTable ใน contracts.ts, USD ต่อ 1M token ⇒ micros = token × rate):
    (input − cached − cacheWrite) × input + cached × cachedInput + cacheWrite × input × 1.25 + output × output (reasoning อยู่ใน
    output แล้ว) ปัดเป็นจำนวนเต็ม · realtime คิด text ด้วย input/cachedInput/output และ audio ด้วย audioInput/audioCachedInput/
    audioOutput · ไม่มี rate ของ model (เช่น ถอดเสียงที่ usage เป็นวินาที) → costUsdMicros null + costReason 'no_rate' ·
    fake → 0 + 'fake_mode' · error → tokens null + 'provider_error'
  error + retry (ทุกฟังก์ชันที่ยิง OpenAI): deadline = start + (timeoutMs ?? MODEL_TIMEOUT_MS) รวม retry · AbortSignal.any ของ
    deadline กับ input.signal · retry ได้ 1 ครั้งเท่านั้น และเฉพาะเมื่อเวลาเหลือพอ: 429 ทั่วไป / 503 overloaded (รอตาม header
    Retry-After หรือ retry-after-ms + jitter, ไม่มี header = 250–750 ms) · 5xx / timeout / APIConnectionError ·
    429 กลุ่ม insufficient_quota (code/type: insufficient_quota, credit_balance_exhausted, project_spend_limit_exceeded,
    organization_spend_limit_exceeded, organization_usage_limit_exceeded) → AppError('PROVIDER_BUDGET_EXHAUSTED', retryable
    false) ห้าม retry + log error ชัด ๆ (ไม่มี key) · 429 อื่นที่ยังไม่ผ่าน → RATE_LIMITED · 400 → PROVIDER_UNAVAILABLE retryable
    false (log param/code) · 401/403/404 → PROVIDER_UNAVAILABLE retryable false + log "เช็ก OPENAI_API_KEY / สิทธิ์ model" ·
    timeout/5xx หลัง retry → PROVIDER_UNAVAILABLE retryable true
  model_usage: insert หนึ่งแถวต่อการเรียก model.* หนึ่งครั้ง รวมกรณี error (kind, mode, model id จริง, tokens, reasoning,
    cache write, audio, cost, latency รวม retry, finish_reason, error_code, request_id, response_id) · ห้ามเก็บ prompt/ข้อความลูกค้าใน log หรือ
    model_usage · insert ล้มห้ามทำให้ call ล้ม (log warn)
  embed() → embeddings.create({ model: OPENAI_EMBED_MODEL, input, dimensions: EMBED_DIM }) · แบ่ง batch ≤256 texts · ข้อความว่าง
    หรือเกิน 8,192 token → VALIDATION_ERROR · ตรวจทุก vector ยาว EMBED_DIM (ไม่ตรง → PROVIDER_UNAVAILABLE retryable false) · purpose document/query
    ใช้แค่บันทึก usage (model เดียวทั้งสองฝั่ง ไม่มี input_type) · usage จาก usage.prompt_tokens รวมทุก batch เป็นแถวเดียว
  moderate({ usage, text?, images? }) → moderations.create({ model: OPENAI_MODERATION_MODEL, input: [{ type:'text', text },
    { type:'image_url', image_url: { url } } …] }) (uploadRef → data URL แบบเดียวกับ chat) → { flagged: any result flagged,
    categories: ชื่อหมวดที่เป็น true, model, mode, usageId } · kind 'moderate' · ฟรี (rate 0)
  transcribe({ usage, audio, languages }) → audio.transcriptions.create({ model: OPENAI_TRANSCRIBE_MODEL, file: await
    toFile(bytes, audio.filename), languages: languages ?? ['th'] }) · filename ต้องมีนามสกุลที่รองรับ (m4a, mp3, mp4, ogg, wav,
    webm, flac …) และไฟล์ ≤25 MB ไม่งั้น VALIDATION_ERROR · bytes จาก audio.bytes หรือ uploadRef · seconds = usage.seconds ?? null
  createRealtimeSession({ usage, businessId, customerId, instructions, tools, ttlSeconds }) → fetch POST
    `${OPENAI_BASE_URL || 'https://api.openai.com/v1'}/realtime/client_secrets` header Authorization Bearer key, Content-Type json,
    OpenAI-Safety-Identifier sha256(customerId ?? businessId) · ห้ามใส่ header OpenAI-Beta · body ตาม docs/openai-api.md §10.3:
    expires_after { anchor:'created_at', seconds: ttlSeconds ?? 600 (บีบให้อยู่ 10–7200) }, session { type:'realtime', model:
    OPENAI_REALTIME_MODEL, instructions, output_modalities:['audio'], reasoning:{ effort:'low' }, max_output_tokens: 1024, tools
    เป็น { type:'function', name, description, parameters }, tool_choice:'auto', audio: { input: { transcription: { model:
    OPENAI_REALTIME_TRANSCRIBE_MODEL, languages:['th'] }, turn_detection: { type:'server_vad', silence_duration_ms: 600,
    create_response: true, interrupt_response: true }, noise_reduction: { type:'far_field' } }, output: { voice:
    OPENAI_REALTIME_VOICE } } } (ไม่มี temperature) → { clientSecret: value, expiresAt: ISO ของ expires_at, model, voice, mode } ·
    ห้าม log value · error ใช้ classifyOpenAIError เดียวกัน · บันทึก model_usage kind 'realtime' purpose ตาม usage (tokens null, cost 0)
  recordRealtimeUsage({ usage, responseUsage }) → zod ตรวจ shape ของ response.done.response.usage (input_tokens, output_tokens,
    input_token_details.{ text_tokens, audio_tokens, image_tokens, cached_tokens, cached_tokens_details }, output_token_details.
    { text_tokens, audio_tokens }) แต่ละค่าเป็น int 0–10,000,000 ไม่ตรง → VALIDATION_ERROR (มาจาก browser ห้ามเชื่อ) → คิดต้นทุน
    text กับ audio แยกตาม rate ของ OPENAI_REALTIME_MODEL → insert model_usage kind 'realtime' (audio_input_tokens,
    audio_output_tokens) → { usageId }
  fake mode (MODEL_MODE=fake ตาม config ข้างบน) ทุกฟังก์ชัน deterministic ไม่มี network ตาม @fake ใน contracts.ts:
    chat: text = input.fake?.text ?? `[fake-model:${usage.purpose}] ` + ข้อความ user ล่าสุด 200 ตัวแรก, json = input.fake?.json,
    toolCalls = input.fake?.toolCalls ?? [] (มี → finishReason 'tool_calls' + providerState { fake: true }) ·
    embed: hashing embedding ตาม @fake (fnv1a32 + Thai bigram) · moderate: flagged เมื่อ text มี "[flag]" (categories ['fake']) ·
    transcribe: text `[fake-transcript] <filename>`, seconds null · createRealtimeSession: clientSecret `fake-ek-<uuid>` ·
    ทุกตัวยัง insert model_usage (mode 'fake', cost 0, 'fake_mode')


## 7. UI (web core + UI kit)

public API = `web/src/core/index.ts` · `ขั้นต่ำ` ของส่วนนี้อยู่ใน §14 S6

index.ts export: api, useSession, useCan, useRealtime, useSlot, formatMoney, formatDateTime, PageHeader, PlaceholderPage,
RequirePermission, defineFeaturePages + UI kit: DataTable, FormDialog, ConfirmDialog, EmptyState, StatusChip, SectionCard,
ToastProvider, useToast, useApiQuery, useApiMutation (+ types) ตาม WebCore / FeaturePages ใน contracts.ts

**หน้าตา web shell (เขียนเองจากคำอธิบายนี้ ไม่มีต้นแบบให้เปิด):** admin shell ภาษาไทยเป็นหลัก
- sidebar ซ้ายกว้าง 260 px (md ขึ้นไปค้างอยู่, เล็กกว่า md เป็น Drawer แบบ temporary) พื้นขาว เส้นขอบขวาบาง · หัวกลุ่มเมนูตัวเล็กสีเทา (uppercase ไม่ใช้กับไทย) · รายการเมนู =
  icon + ชื่อ, รายการที่เลือกพื้นสีหลักจาง (alpha 0.12) ตัวหนา · ด้านบนสุดโลโก้ข้อความ "Endless" · ด้านล่างสุดแสดง build sha สั้นเมื่อไม่ใช่ production
- top bar สูง 56 px พื้นขาวมีเส้นล่าง: ซ้าย = ปุ่มเมนู (เฉพาะจอเล็ก) + business switcher (ชื่อร้านปัจจุบัน), ขวา = สลับ th/en, slot `topbarActions`, avatar เมนู (โปรไฟล์ → `/account`, ออกจากระบบ)
- เนื้อหา: พื้นหลัง grey.50, container กว้างสุด 1280 px, padding 24 (16 บนมือถือ) · `PageHeader` = title (variant h5, น้ำหนัก 600) + description (text.secondary) + actions ชิดขวา
- MUI 9 theme (`theme.ts`): primary '#0F766E' (teal), secondary '#B45309', error/warning/success ค่าเริ่มต้นของ MUI, background.default '#F6F7F9', shape.borderRadius 10 ·
  typography.fontFamily '"Noto Sans Thai","Inter",system-ui,sans-serif', heading (h1–h6) และ button ใช้ '"Prompt","Noto Sans Thai",sans-serif' น้ำหนัก 600, ตัวเลขในสถิติใช้ Manrope ·
  components: Button textTransform none + disableElevation, Card/Paper variant outlined, TableCell size small, Chip size small
- ฟอนต์ import จากแพ็กเกจ @fontsource ที่ติดตั้งใน S1: `@fontsource/noto-sans-thai/{400,500,600}.css`, `@fontsource/inter/{400,500}.css`, `@fontsource/prompt/{500,600}.css`, `@fontsource/manrope/600.css`
- ไม่มี dark mode ไม่มีแอนิเมชันนอกเหนือจาก MUI ค่าเริ่มต้น


- vite.config.ts: root = โฟลเดอร์ web, envDir '..' (อ่าน .env.local ที่ root, expose เฉพาะ VITE_*), plugin react, server.port =
  WEB_PORT strictPort, proxy /api /webhooks /health /healthz /readyz /build-info → http://localhost:API_PORT และ /ws (ws: true) · build.outDir 'dist'
  (อ่านพอร์ตด้วย loadEnv(mode, '..', ''))
- index.html lang="th" · main.tsx: ฟอนต์จาก @fontsource (รายการด้านบน) → await
  i18n → ThemeProvider (theme.ts ตามคำอธิบายด้านบน) + CssBaseline → ToastProvider → BrowserRouter → SessionProvider → App
- registry.ts: import.meta.glob('../features/*/pages.tsx', { eager: true }) → FeaturePages[] · ตรวจว่า path อยู่ใต้
  webPaths ของ feature เอง (เทียบทีละ segment: '/channels' ไม่ครอบ '/channels-x', prefix ยาวสุดชนะ เช่น '/channels/meta' เป็นของ
  meta) และไม่ซ้ำ → ผิดให้ console.error + แถบแดงบนจอ (dev)
- App.tsx: route public (layout public), bare, app (ใน AppShell) จาก registry + หน้า core: '/' Home (ไปเมนูแรกที่มีสิทธิ์),
  '/dev-login', '/account' (host slot accountTabs), '/oauth/callback' (ส่งต่อ slot oauthCallbacks ตาม statePrefix ของ state),
  '/ops' (รายการ jobs ล่าสุด + ตารางเปิด/ปิดฟีเจอร์: GET /api/v1/features + สวิตช์ PUT /api/v1/ops/features/:featureId = ส่วนของ F01 แบบบาง; jobs/retry ครบ = F35), '/forbidden', '/no-business', '*' NotFound · guard: ไม่มี session → /login
  (ถ้า F02 ของ C3 ยังไม่มีหน้า login จริง placeholder ของ auth แสดงปุ่มไป /dev-login เมื่อ VITE_DEV_LOGIN=1) · auth 'business'
  แต่ไม่มี business → /no-business · ไม่มีสิทธิ์ → Forbidden
- AppShell/Sidebar/TopBar: เมนูจาก registry จัดกลุ่มตามลำดับ home, chat, customers, knowledge, ai, live, insights, commerce,
  settings, help, admin · กรองด้วย permission ของ business ปัจจุบัน / platformAdminOnly และ feature flag (featureFlags.ts ด้านล่าง) · platform admin ที่ไม่มี business
  เห็นกลุ่ม admin + help · TopBar: business switcher, สลับภาษา th/en, slot topbarActions, เมนู user (logout) · จอเล็กกว่า
  md ใช้ Drawer แบบ temporary
- featureFlags.ts: `useFeatures()` เรียก GET /api/v1/features หลังมี session (cache ใน SessionProvider, refetch เมื่อโฟกัสหน้าต่างและทุก 60 วิ) ·
  เมนูและ route ของฟีเจอร์ที่ `visible === false` ถูกซ่อน (เส้นทางตรงเปิดแล้ว → NotFound) · **เมนูของฟีเจอร์ที่ยังเป็น placeholder ไม่แสดงใน production** (server
  คืน visible:false อยู่แล้ว) · ระหว่างโหลด flag ยังไม่ซ่อนอะไร (dev) แต่ใน production ซ่อนทุกฟีเจอร์จนกว่าจะโหลดเสร็จ (production เป็น true จาก `production` ในคำตอบก่อนหน้านั้นถือว่า
  ไม่ทราบ → ซ่อน) · เมนู/route ของ core (/ops, /account, /dev-login ฯลฯ) ไม่ผูกกับ flag · ฟีเจอร์ไม่ต้องเขียนโค้ดเพิ่มเพื่อให้ซ่อนได้
- icons.ts: map ชื่อ icon ในตาราง MENU → import ตรงจาก @mui/icons-material (ห้าม import * ทั้งแพ็กเกจ) ไม่รู้จัก → Extension
- api.ts (WebApiClient; WebApiError มี .failure ตาม contracts.ts), session.tsx (GET /api/v1/me, business ปัจจุบันจำใน
  localStorage 'nless.businessId' ครอบ try/catch), realtime.ts (WS เดียว, subscribe business ปัจจุบัน, useRealtime), slots.ts
  (useSlot เรียง order กรองสิทธิ์),
  format.ts (formatMoney(149000) = '฿1,490', formatDateTime → Asia/Bangkok)
- i18n.ts: i18next + react-i18next + LanguageDetector (order ['localStorage','navigator'], lookupLocalStorage 'nless.lang', caches ['localStorage']), fallbackLng 'th', supportedLngs th/en, load 'languageOnly' · เมื่อภาษาเปลี่ยนตั้ง document.documentElement.lang ·
  LanguageSwitch (web/src/core/ui/LanguageSwitch.tsx, export จาก core, contracts.ts): ปุ่ม TH | EN (data-testid "lang-switch") → i18n.changeLanguage · อยู่ใน TopBar ของ AppShell ทุกหน้า
  และหน้าที่ไม่ใช้ AppShell ต้องวาง LanguageSwitch เอง: /login, หน้า auth ของ F02, Demo Chat สาธารณะ (F09), หน้าชำระเงินสาธารณะ (F14) · ห้ามมีหน้าไหนที่เปลี่ยนภาษาไม่ได้ ·
  completeness test (web/src/core/i18n/completeness.test.ts, รันใน CI): ทุก namespace (core + ทุก features/*/i18n) มีไฟล์ th.json และ en.json, ชุด key เท่ากันทุกตัว, ไม่มีค่าว่าง,
  และค่าใน en.json ไม่มีอักษรไทย (ยกเว้น key ที่ลงท้าย .example หรืออยู่ในรายการ allowThai ของ test) → ฟีเจอร์ที่มีไฟล์ภาษาเดียวหรือ key ไม่ครบทำให้ CI แดง ·
  namespace common/nav จาก web/src/core/i18n/<lng>/*.json · ฟีเจอร์จาก import.meta.glob('../features/*/i18n/*.json',
  { eager: true, import: 'default' }) → namespace = slug · ไม่มีไฟล์ภาษากลางของฟีเจอร์
- DevLogin: GET /api/dev/status → ถ้า tokenRequired แสดงช่องกรอก DEV_LOGIN_TOKEN (เก็บใน sessionStorage ส่งเป็น header X-Dev-Login-Token) → GET /api/dev/users → ปุ่มต่อ user → POST /api/dev/login → refresh session → '/' · ป้าย "DEV LOGIN" ชัดเจน · dev login ปิดอยู่ (status 404) → ข้อความ "ปิดใช้งานแล้ว" ไม่แสดงปุ่ม
- PlaceholderPage({ featureId }): PageHeader ชื่อจาก i18n + <StatusChip kind="feature" status="U" /> ("ยังไม่ทำ (U)") + featureId
  + lane + ลิงก์ spec docs/specs/<ID>-<slug>.md (ใน production หน้านี้ไม่ถูกแสดง: เมนูและ route ของ placeholder ถูกซ่อนเสมอ)
- UI kit web/src/core/ui/* (ทำหลัง shell): signature + JSDoc ตามส่วน "web/src/core/types.ts" ใน contracts.ts · MUI 9 +
  @mui/icons-material เท่านั้น ห้ามเพิ่ม library · ข้อความ default จาก namespace common (th ก่อน มี en คู่) · ui/index.ts รวม export
  · DataTable.tsx: Paper outlined + TableContainer overflowX auto (หัวคอลัมน์ nowrap: จอแคบเลื่อนแนวนอน) + Table size small ·
    cell = render?.(row) ?? row[key] (null → '—') · align/width ต่อคอลัมน์ · loading = LinearProgress + aria-busy (ยังไม่มีแถว =
    Skeleton 3 แถว) · ไม่ loading และ rows ว่าง = แถวเดียว colSpan ทั้งตาราง แสดง empty ?? EmptyState "ยังไม่มีข้อมูล" ·
    onRowClick → hover, cursor pointer, tabIndex 0, Enter/Space = คลิก · ไม่มี sort/paging ในตัว
  · FormDialog.tsx: fullWidth maxWidth sm, fullScreen เมื่อจอ < sm (useMediaQuery) · aria-labelledby ที่ title · <form noValidate>
    ครอบ (Enter = submit) · error → Alert บนสุด · children ใน Stack spacing 2 · ปุ่ม "ยกเลิก" / submitLabel ?? "บันทึก" ·
    submitting: ปุ่ม disabled + spinner, Esc/backdrop ไม่ปิด · ไม่ปิดเอง · onSubmit reject → กลืนแล้วค้างไว้
  · ConfirmDialog.tsx: maxWidth xs fullWidth (ไม่ fullScreen) · danger → ปุ่มสี error + label default "ลบ" (ไม่ danger "ยืนยัน") +
    focus แรกที่ "ยกเลิก" · await onConfirm ด้วย pending ของตัวเอง → สำเร็จ onClose() · reject ค้างไว้
  · EmptyState.tsx: กลางกล่อง py 6, icon default InboxOutlined สี text.secondary, title, description, action
  · StatusChip.tsx: Chip size small · สี + label ไทยตาม map ใน JSDoc ของ StatusChipProps (kind default generic, ไม่รู้จัก → default
    + ข้อความ status เดิม) · ใส่ data-color={color}
  · SectionCard.tsx: Card outlined + CardHeader (title, actions ขวา, จอ < sm actions ขึ้นบรรทัดใหม่) + CardContent
  · toast.tsx: ToastProvider (Snackbar + Alert ทีละอัน คิว FIFO, success/info 3 วิ, error 6 วิ, ปุ่มปิด, role alert) + useToast ·
    error(err) แปลง ApiFailure/WebApiError → common:errors.<code> (ไม่มี key ใช้ message เดิม) · นอก provider = no-op + console.warn
  · apiHooks.ts: useApiQuery = api.get(api.biz(path)) · null/ยังไม่มี business = ไม่ยิง · ยิงใหม่เมื่อ path/business/deps เปลี่ยน ·
    ทิ้ง response เก่าที่มาช้า · ไม่ toast · useApiMutation = api.post/put/patch(api.biz(p), input) หรือ api.delete(api.biz(p)) ·
    fail → error + toast.error (toastOnError default true) แล้ว reject ต่อ · ไม่ toast success เอง
  · i18n/{th,en}/common.json เพิ่ม (ทั้งสองไฟล์ key เท่ากัน): actions.{save,cancel,confirm,delete,close,retry} (th: บันทึก ยกเลิก ยืนยัน ลบ ปิด ลองใหม่ ·
    en: Save Cancel Confirm Delete Close Retry) · table.empty "ยังไม่มีข้อมูล" / "No data yet" · toast.saved "บันทึกแล้ว" / "Saved" ·
    errors.generic "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง" / "Something went wrong. Please try again." + errors.<ErrorCode>
    ทุก code ของ ErrorCode ทั้งภาษาไทยและอังกฤษ (ประโยคสั้นที่ผู้ใช้เข้าใจ ไม่ใช่ชื่อ code) · language.{th,en,switch} ("ไทย" "English" "เปลี่ยนภาษา"/"Change language") · status.<kind>.<status> ตาม map ของ StatusChipProps

### ตาราง MENU (ใช้ใน S5 scaffold และ icons.ts)

ตาราง MENU (slug · path · group · icon · permission · th · en)  [auth ของ route = business ถ้าไม่ระบุ]
  auth · /login · ไม่มีเมนู (route layout public, auth none) · — · เข้าสู่ระบบ · Sign in
  tenancy · /members · settings · GroupOutlined · account.members · สมาชิกและสิทธิ์ · Members
  business-settings · /business · settings · StorefrontOutlined · business.read · ข้อมูลร้าน · Business
  knowledge · /knowledge · knowledge · MenuBookOutlined · product.read · คลังความรู้ · Knowledge
  knowledge-import · /imports · knowledge · UploadFileOutlined · product.write · นำเข้าข้อมูล · Imports
  knowledge-search · /knowledge-search · knowledge · ManageSearchOutlined · product.read · ทดสอบการค้นหา · Search test
  catalog · /catalog · knowledge · Inventory2Outlined · product.read · สินค้าและบริการ · Catalog
  inbox · /chat · chat · ForumOutlined · chat.read · แชต · Chat
    + /demo-chat · ai · SmartToyOutlined · insights.demo · Demo Chat · Demo Chat      (Demo Chat เป็นของ A1)
  ai-agent · /ai-settings · ai · TuneOutlined · business.bot_settings · ตั้งค่า AI · AI settings
  team · /team · settings · BadgeOutlined · chat.read · ทีมและตารางงาน · Team
  message-templates · /templates · knowledge · TextSnippetOutlined · chat.reply · ข้อความสำเร็จรูป · Templates
  orders · /orders · commerce · ReceiptLongOutlined · orders.read · ออเดอร์ · Orders
  payments · /payments · commerce · PaymentsOutlined · orders.read · การชำระเงิน · Payments
  booking · /appointments · commerce · EventAvailableOutlined · appointments.read · นัดหมาย · Appointments
  calendar · /calendar · commerce · CalendarMonthOutlined · appointments.settings · Google Calendar · Google Calendar
  line · /channels · settings · HubOutlined · business.channels · ช่องทาง · Channels
  meta · /channels/meta · settings · FacebookOutlined · business.channels · Facebook / Instagram · Facebook / Instagram
  comments · /comment-replies · live · CommentOutlined · business.channels · ตอบคอมเมนต์ · Comment replies
  live-commerce · /product-codes · live · QrCode2Outlined · product.read · รหัสสินค้าไลฟ์ · Live product codes
  broadcast · /broadcast · customers · CampaignOutlined · broadcast.read · บรอดแคสต์ · Broadcast
  crm · /customers · customers · PeopleAltOutlined · chat.read · ลูกค้า · Customers
  insights · /insights · insights · InsightsOutlined · insights.read · อินไซต์ · Insights
  analytics · /dashboard · home · DashboardOutlined · insights.read · แดชบอร์ดและต้นทุน · Dashboard & cost
  voice · /voice · ai · MicOutlined · insights.demo · Demo Voice · Demo Voice
  evals · /ai-quality · insights · FactCheckOutlined · insights.read · คุณภาพ AI · AI quality
  follow-ups · /follow-ups · customers · ScheduleSendOutlined · chat.read · ติดตามลูกค้า · Follow-ups
  chatgpt-catalog · /chatgpt-catalog · knowledge · ShoppingBagOutlined · product.read · แค็ตตาล็อกสำหรับ ChatGPT · ChatGPT catalog
  notifications · /notifications · help · NotificationsOutlined · (route auth user) · การแจ้งเตือน · Notifications
  release · /release · admin · RocketLaunchOutlined · platformAdminOnly (route auth platform_admin) · Release · Release
  core (web/src/core เอง) · /ops · admin · WorkOutlineOutlined · platformAdminOnly · งานเบื้องหลัง · Jobs

## 8. Jobs, schedules, events

### jobs.ts (F35 base) และ scheduler

- jobs.ts (F35 base): implement JobsApi + worker ตาม contract: claim ด้วย UPDATE … WHERE id = (SELECT … WHERE (state='queued'
  AND run_at<=now()) OR (state='running' AND locked_until<now()) ORDER BY run_at LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *,
  concurrency 4, lease JOBS_LEASE_SECONDS, lockKey → db.withAdvisoryLock, retry backoff 5s×attempt², 'dead' เมื่อครบ,
  handler ไม่มี → dead 'no handler', publish 'job.updated' เมื่อมี businessId, schedules (dedupKey `<name>@<slot>`),
  enqueue ปลุก worker ทันทีใน process · export startWorker()/stopWorker() และ drainJobs() สำหรับ test (รันจนคิวว่าง)

- **worker ใน process:** `RUN_WORKER` (default 1; ชื่อเดิม JOBS_WORKER) = 1 → server.ts เรียก startWorker() หลัง listen · ปิดได้เมื่อรันเฉพาะ API
- **scheduler ใน process:** `RUN_SCHEDULER` (default 1) = 1 → รวม `schedules` ของทุกฟีเจอร์ แล้วทุก 30 วินาทีคำนวณ slot ที่ถึงเวลาและ enqueue ด้วย dedupKey `<name>@<slot>`
  · **ต้องถือ Postgres advisory lock `pg_try_advisory_lock(hashtext('nless.scheduler'))` บน connection เฉพาะ (ไม่คืน pool)** ก่อนทำงาน · ไม่ได้ lock = ไม่รันและลองใหม่ทุก 30 วินาที
  (จึงรันได้บน instance เดียวเสมอแม้เผลอเปิดสอง instance) · ปล่อย lock ตอนปิดสวย · log ว่าได้ lock หรือไม่
- job ของ core: `core.deliver` (channels.ts), ทำความสะอาด sessions หมดอายุ ทุกชั่วโมง (`core.sessions.purge`), purge `model_usage` ไม่ทำ (เก็บไว้ให้ F27)
- audit action ของ core: `core.feature.toggle` (details: featureId, hidden, reason), `core.demo.reset`, `core.session.create` (kind) · ไม่ audit การอ่าน
- realtime event ของ core: `job.updated` (เมื่อ job มี businessId), `message.updated` (web sender) · notify(): ไม่มี (F31)

## 9. Seed และ fixtures

### 9.1 `npm run db:seed` (idempotent)

- seed.ts: core seed จาก SEED (users, accounts, businesses, memberships, customers, conversations + messages ที่ insert ตรงด้วย
  seq ต่อเนื่อง origin 'system' delivery 'not_required' ไม่ enqueue AI แล้วตั้ง conversations.next_seq ต่อจาก seq สุดท้าย,
  conversations.handler/assignee ตาม SEED, seed_aliases) · ช่องทางใน SEED ต้องอยู่ใน 4 ตัวข้างบน (ไม่ตรง = contracts.ts เก่า → BLOCKED)
  ทั้งหมด INSERT … ON CONFLICT DO NOTHING · แล้วรัน features/*/seed.ts (FeatureSeed) ตาม dependsOn ถ้ามีไฟล์

- seed ร้านสังเคราะห์ 2 ร้านของ SPEC §5 เท่านั้น (A: Demo Account A / biz_demo_a, B: Demo Account B / biz_demo_b) ใช้ id คงที่จาก `SEED` · ไม่มี password (ล็อกอินด้วย dev login จนกว่า F02 จะตั้ง SEED_USER_PASSWORD)
- ผลลัพธ์ต้องไม่ error เมื่อรันซ้ำและไม่มีแถวซ้ำ

### 9.2 `npm run db:seed -- --demo` (ข้อมูลเดโมสำหรับกรรมการ; core: `server/src/core/demo.ts`)
1. รัน seed ปกติก่อน (ข้อ 9.1)
2. **รูปสินค้า:** สร้างด้วยโค้ดเป็น SVG แล้วแปลงเป็น PNG 640×640 ด้วย `sharp` (พื้นหลังไล่สีจากแฮชของ sku, ชื่อสินค้าไทย/อังกฤษ, ราคา, มุมป้าย "DEMO") สำหรับทุก sku ใน `SEED` + สินค้าเพิ่มอีกอย่างน้อย 6 ชิ้นของร้าน A
   (sku `A-DEMO-01`…`A-DEMO-06`, ชื่อไทย เช่น ของเล่นไม้ ชุดบอร์ดเกม ราคา 29,000–259,000 สตางค์) · บันทึกผ่าน `storage` เป็นแถว `files` (purpose 'product_image') + แถว `seed_aliases` ชื่อ `file_img_<sku ตัวพิมพ์เล็ก ขีดล่าง>` ให้ `runDemo` ของ F08 (B1) ผูกกับสินค้า
   (ไม่มีไฟล์รูปจากภายนอก ไม่ดาวน์โหลดอะไร)
3. **แชตไทย:** แทรกบทสนทนาเพิ่มอย่างน้อย 8 ห้องในร้าน A (ช่อง line/facebook/instagram/web ปนกัน, customer externalId ขึ้นต้น `demo-rich-`, ข้อความตรงตัว insert
   ตาราง core ด้วย seq ต่อเนื่อง origin 'demo' delivery 'not_required' ไม่ enqueue AI): ถามราคา · ต่อราคา · สินค้าหมดสต็อก · ส่งสลิป (ข้อความ + รูปสลิปสังเคราะห์) · ถามนัดหมาย · ขอคุยกับคน (handler 'human')
   · ลูกค้าเก่ากลับมา · ร้องเรียนเรื่องส่งช้า · เวลา `created_at` กระจายย้อนหลัง 7 วัน (คำนวณจากเวลาที่รัน) เพื่อให้ dashboard มีข้อมูล · id ของแถวเป็น uuid v5 คงที่จาก alias `rich:<ชื่อห้อง>:<n>` จึงรันซ้ำได้ (ON CONFLICT DO NOTHING)
4. รัน `runDemo(ctx)` ของ `features/*/seed.ts` ตามลำดับ dependsOn (ถ้ามี export นั้น) · ฟีเจอร์ใดล้ม → log warn แล้วไปต่อ
5. ห้ามมีข้อมูลลูกค้าจริงหรือข้อความที่ระบุตัวตนได้ · ทุกชื่อ/อีเมล/เบอร์เป็นข้อมูลสังเคราะห์

### 9.3 `npm run demo:reset` (= `tsx scripts/db.ts demo-reset`; ฟังก์ชัน `resetDemoData()` ใน demo.ts ให้ F35 เรียกจาก `POST /api/v1/ops/demo/reset` ภายใต้ DEMO_RESET_ENABLED=1 + requirePlatformAdmin)
1. อนุญาตเฉพาะ DB ที่ผ่าน assertSafeDbName หรือ NODE_ENV=production ที่ DEMO_RESET_ENABLED=1
2. ในธุรกรรมเดียว: ลบ messages, conversations, customers, jobs และ `files` (ที่ไม่มี alias ใน seed_aliases) ของสองร้านเดโมเท่านั้น (กรองด้วย business id จาก SEED) แล้วลบไฟล์บนดิสก์ของแถวที่ลบ
3. รัน `resetDemo(ctx)` ของแต่ละฟีเจอร์ (ถ้ามี export) ตามลำดับย้อน dependsOn
4. รัน seed + `--demo` ใหม่ · audit `core.demo.reset` · ไม่แตะ config ของร้าน (ช่องทาง, ความรู้, ตั้งค่า) นอกจาก `resetDemo` ของฟีเจอร์นั้นจะลบเอง
5. ห้ามใช้กับร้านที่ไม่ใช่ร้านเดโมของ SEED

### 9.4 fixtures ของ test (สร้างด้วยโค้ดในวันงาน ไม่พึ่งไฟล์จากเครื่องเตรียมงาน)
กติกา test สำหรับทุก lane: สร้างข้อมูลใหม่เอง เช่น customerExternalId ไม่ซ้ำ ห้ามแก้แถว SEED · รูปสังเคราะห์สร้างจาก `sharp`/SVG ในโค้ด test

## 10. Tests

### 10.1 vitest + tests ขั้นต่ำ

- vitest.config.ts (root): test.projects = [server: environment node, env { NODE_ENV: 'test', MODEL_MODE: 'fake', OPENAI_API_KEY: '' },
  include server/src/**/*.test.ts + scripts/**/*.test.ts, globalSetup server/src/core/test-global-setup.ts,
  fileParallelism false] + [web: plugin react, environment jsdom, include web/src/**/*.test.{ts,tsx}]
- tests ขั้นต่ำ (สั้นและเร็ว ไม่มี network):
  server/src/core/migrate.test.ts (planMigrations เรียงตาม dependsOn, cycle → error)
  server/src/core/auth.test.ts (dev login owner.a → /me มีทุก PermissionKey ใน PERMISSIONS; staff.a = STAFF_DEFAULT_PERMISSIONS;
    owner.a เปิด business B → 404; POST ไม่มี X-Requested-With → 403)
  server/src/core/loop.test.ts (simulateInbound "A-GAME-01 ราคาเท่าไหร่" → drainJobs → มี AI reply "1,490" + 'sent';
    assignConversation(staff_a) → inbound ใหม่ → drainJobs → ไม่มี AI reply)
  server/src/core/contracts.test.ts (import service.ts ของ 15 contract slugs แล้วเช็กว่าทุกชื่อใน contracts.ts เป็น function)
  server/src/core/model.test.ts (fake mode deterministic ทุกฟังก์ชัน + เขียน model_usage · buildResponsesRequest: store:false,
    role developer (system → developer), ไม่มี key temperature/top_p/user, alias → model id จาก env, effort 'none' + 'gpt-6.2-sol'
    → 'low', image part → input_image, tools → strict + include reasoning.encrypted_content · providerState round-trip ใส่
    reasoning/function_call items กลับตาม call_id · mapResponse: function_call → 'tool_calls', incomplete max_output_tokens →
    'length', refusal → 'content_filter' · computeCostMicros รวม cached/cache write/reasoning และไม่มี rate → null 'no_rate' ·
    classifyOpenAIError + withDeadlineRetry ด้วย clock/sleep ปลอม: 429 rate → retry 1 ครั้งตาม Retry-After, 429
    project_spend_limit_exceeded → PROVIDER_BUDGET_EXHAUSTED ไม่ retry, 500 → retry 1 ครั้ง, Retry-After เกิน deadline → ไม่ retry)
  scripts/check-paths.test.ts (ทดสอบ checkBranch/ownerOfPath แบบ pure ไม่ต้องมี git):
    lane/B1/catalog แก้ web/src/features/inbox/x → fail; แก้ server/src/features/catalog/x → ผ่าน; lane/B3/knowledge-import แก้ server/src/features/knowledge-import/x → ผ่าน
    แต่ lane/B1/knowledge แก้ไฟล์นั้น → fail; lane/C3/tenancy แก้ web/src/features/auth/x → ผ่าน; lane/C2/comments แก้ server/src/features/comments/x → ผ่าน;
    lane/B1/evals แก้ server/src/features/evals/x → ผ่าน; lane/B2/follow-ups แก้ server/src/features/follow-ups/x → ผ่าน; lane/C1/chatgpt-catalog แก้ web/src/features/chatgpt-catalog/x → ผ่าน;
    lane/C1/core แก้ package.json → ผ่าน; lane/B1/catalog แก้ package-lock.json → fail; feature/x → fail; lane/A0/x → fail (A0 ไม่ใช่ worker); bootstrap ของ C1 → ผ่าน;
    lead/hotfix → ผ่านพร้อมคำเตือน;
    fix/B1/stale-price แก้ server/src/features/catalog/service.ts (10 บรรทัด) + catalog/service.test.ts → ผ่าน · เหมือนกันแต่ไม่มีไฟล์ test → fail ·
    แก้ non-test 41 บรรทัด + มี test → fail (40 บรรทัดพอดี → ผ่าน) · แตะ server/src/features/catalog/migrations/002_x.sql → fail ·
    แตะ docs/competition-plan/templates/contracts.ts หรือ contracts.ts → fail · fix/B1/x แก้ web/src/features/inbox/x → fail (ไม่ใช่ของ B1) ·
    fix/C1/x แก้ server/src/core/db.ts (8 บรรทัด) + db.test.ts → ผ่าน · fix/Z9/x → fail
  server/src/core/features.test.ts (feature flags: GET /api/v1/features คืน 29 รายการ visible ตาม placeholder; PUT โดย owner.a → 403, โดย admin → ผ่านและ visible:false;
    HIDDEN_FEATURES ตอน boot ใส่ค่าเริ่มต้นแต่ไม่ทับแถวที่มี; NODE_ENV=production → placeholder visible:false)
  server/src/core/ratelimit.test.ts (เกิน limit → allowed false + retryAfterSeconds; หน้าต่างผ่านไปรีเซ็ต (ใช้ clock ปลอม); middleware ตอบ 429 + Retry-After)
  server/src/core/crypto.test.ts (encrypt → decrypt ได้ค่าเดิม; tag ผิด → throw; TOKEN_ENCRYPTION_KEY ยาวผิด → boot throw ใน production)
  server/src/core/meta.test.ts (/healthz 200 พร้อม db ok; /readyz 503 เมื่อมี migration ค้าง; /build-info ไม่มีคีย์ที่ขึ้นต้น OPENAI/SESSION/SECRET และมี env, sha)
  server/src/core/dev.test.ts (production + ไม่มี DEV_LOGIN_TOKEN → ไม่ mount; production + token → ไม่ส่ง header = 404, ส่งผิด = 404, ถูก = 200; DEV_LOGIN_ENABLED=false → 404; /api/dev/login ครั้งที่ 11 ในหนึ่งนาที = 429)
  server/src/core/demo.test.ts (seed --demo ซ้ำสองรอบไม่ error ไม่ซ้ำ; มี ≥ 8 ห้องสนทนา rich และไฟล์ product_image ตรง sku; demo-reset แล้ว SEED ยังอยู่ ห้อง rich หาย/สร้างใหม่ และ DB ที่ชื่อไม่ผ่าน assertSafeDbName ถูกปฏิเสธ)
  server/src/core/db.test.ts (assertSafeDbName: nless_hack_a0, nless_hack_c3_test ผ่าน; nless_hack_main, nless_hack_a4, prod, postgres ไม่ผ่าน)

  web/src/core/registry.test.ts (ทุก FolderSlug มี pages.tsx ที่ featureId ตรงและมีอย่างน้อย 1 route)
  web/src/core/ui/ui.test.tsx (await i18n.changeLanguage('th') ก่อน เพราะ jsdom อาจตรวจได้ en · render ตรง ๆ ไม่ต้องห่อ provider:
    DataTable rows [] → เห็น "ยังไม่มีข้อมูล" · 2 rows → tbody 2 แถว, คลิกแถวแรก → onRowClick ได้ row นั้น · StatusChip order/paid →
    data-color success + "ชำระแล้ว" · status ไม่รู้จัก → data-color default + ข้อความ status เดิม)

  tests/e2e/core.smoke.spec.ts (Playwright; รันกับ dev server ที่คนเปิดไว้หรือกับ production; ไม่อยู่ใน CI): ownerPage เปิด '/' แล้วเห็น navigation sidebar ·
    GET /api/v1/features → 200 และ items.length = 29 · /api/v1/me มี business ชื่อ Demo ของ A

### 10.2 Playwright ที่ใช้ร่วมกัน (C1 เป็นเจ้าของ)
- `"e2e": "playwright test"` · `npm run e2e -- <slug>` กรองไฟล์ตาม path · ตัวแปร: `E2E_BASE_URL` (default `http://localhost:${WEB_PORT}`; ชี้ production ได้), `E2E_EMAIL` (default `owner.a@example.test`), `E2E_PASSWORD` (หลัง F02 มี),
  `E2E_DEV_LOGIN_TOKEN` (token ของ production ก่อน F02) — อยู่ใน `..\nless.secrets.env`/`.env.local` ไม่ commit
- `playwright.config.ts` (root): `testMatch: ['tests/e2e/*.spec.ts', 'web/src/features/*/e2e/*.spec.ts']`, workers 1, timeout 60 s, expect timeout 10 s, retries 0, `use: { baseURL, locale: 'th-TH', timezoneId: 'Asia/Bangkok', trace: 'retain-on-failure', screenshot: 'only-on-failure' }`,
- **ภาษาใน Playwright:** fixture กลาง `tests/e2e/fixtures.ts` มี `setUiLanguage(page, 'th' | 'en')` (`page.addInitScript` ตั้ง `localStorage 'nless.lang'` ก่อนโหลดหน้า) และ `expectPageInEnglish(page, path, titleEn)` (ตั้ง `en` → เปิด `path` → เห็นหัวหน้า `titleEn` → ใน `main` ไม่มี text node ที่เป็นอักษรไทยล้วนยาวเกิน 3 ตัว ยกเว้นใต้ element ที่มี `data-user-content` → ตั้งกลับ `th`) · smoke ของทุกฟีเจอร์ที่มีหน้าเว็บต้องมี case `renders in English` ที่เรียก helper นี้กับหน้าหลักของฟีเจอร์ (ค่า `titleEn` = คอลัมน์ en ของ key `page.title` ใน spec §7) · ข้อมูลที่ร้านหรือลูกค้าพิมพ์เอง (ชื่อสินค้า ข้อความแชต) ให้ component ใส่ `data-user-content` เพื่อไม่ถูกนับ · `core.smoke.spec.ts` มี case `language switch`: กด `lang-switch` เป็น EN บน `/` → เมนูเป็นอังกฤษ → reload ยังเป็น EN → กดกลับ TH
  reporter list + html (open never) · โหลด `.env.local` ด้วย dotenv ก่อนอ่าน `E2E_BASE_URL` · ไม่มี webServer (คนเปิด dev server เอง) · ผลลัพธ์ `playwright-report/`, `test-results/` อยู่ใน .gitignore
- `tests/e2e/fixtures.ts` ส่งออก `test` และ `expect` (re-export จาก @playwright/test ที่ extend แล้ว):
  - fixture `ownerPage` (Page ที่ล็อกอินเป็น owner A ตาม `E2E_EMAIL`): (1) `page.request.post('/api/dev/login', { data: { email }, headers: { 'X-Requested-With': 'nless', 'X-Dev-Login-Token': E2E_DEV_LOGIN_TOKEN ?? '' } })` → 200 = ได้ cookie ใน context เดียวกับ page ·
    (2) ถ้า 404 (dev login ปิดหลัง F02) และมี `E2E_PASSWORD` → เปิด `/login` กรอกอีเมล/รหัสผ่านด้วย `getByLabel(/อีเมล|email/i)`, `getByLabel(/รหัสผ่าน|password/i)` และกดปุ่ม `getByRole('button', { name: /เข้าสู่ระบบ|sign in/i })` (UNCONFIRMED: ปรับให้ตรงหน้า F02 จริงเมื่อ C3 merge) · (3) ไม่ได้ทั้งสอง → throw ข้อความชัดเจนบอกตัวแปรที่ขาด
  - fixture `api` (`APIRequestContext` ที่ใช้ cookie เดียวกับ ownerPage + header `X-Requested-With: nless`) และฟังก์ชัน `e2eMarker()` = `e2e-${Date.now()}`
  - กติกา smoke บน production: ใช้ marker ที่ไม่ซ้ำ, ทำความสะอาดหรือทิ้งข้อมูลไม่เป็นอันตรายใน tenant A, ห้ามแตะข้อมูลของ tenant B ยกเว้นพิสูจน์ isolation
- ทุกฟีเจอร์เขียน `web/src/features/<slug>/e2e/<slug>.smoke.spec.ts` โดย import `{ test, expect } from '../../../../../tests/e2e/fixtures'`

### 10.3 CI (.github/workflows/pr-check.yml)

- .github/workflows/pr-check.yml:
```yaml
name: pr-check
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
concurrency:
  group: pr-check-${{ github.head_ref || github.ref }}
  cancel-in-progress: true
jobs:
  check:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    services:
      postgres:
        image: pgvector/pgvector:pg17
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: nless_hack_a0
        ports: ['5432:5432']
        options: >-
          --health-cmd "pg_isready -U postgres" --health-interval 5s --health-timeout 5s --health-retries 20
    env:
      MODEL_MODE: fake
      OPENAI_API_KEY: ''
      PG_SERVER_URL: postgres://postgres:postgres@localhost:5432
      DATABASE_URL: postgres://postgres:postgres@localhost:5432/nless_hack_a0
      TEST_DATABASE_URL: postgres://postgres:postgres@localhost:5432/nless_hack_a0_test
      SESSION_SECRET: ci-only-not-a-secret-0123456789abcdef
      DEV_LOGIN: '1'
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci --no-audit --no-fund
      - name: ownership (lane paths)
        if: github.event_name == 'pull_request'
        run: npm run check:paths -- --base origin/${{ github.base_ref }} --branch ${{ github.head_ref }}
      - name: only core imports the OpenAI SDK
        run: "! git grep -nE \"from 'openai'|require\\('openai'\\)\" -- ':!server/src/core/' ':!*.md'"
      - run: npm run typecheck
      - run: npm run db:create && npm run db:migrate && npm run db:seed && npm run db:seed -- --demo && npm run db:migrate
      - run: npm test
      - run: npm run build
```

- service container ต้องเป็น `pgvector/pgvector:pg17` (มี vector ให้ migration แรก) · CI ไม่รัน e2e (ไม่มี dev server) · `check:paths` รันเฉพาะ pull_request


## 11. Acceptance: R ตาม D6

### 11.1 ตรวจก่อนโพสต์ SETUP READY (≤ 5 นาที)

ตรวจจาก worktree ที่ยังไม่เคยรันอะไร (เช่น `..\nless-c2`: `git fetch origin && git checkout --detach origin/main`) ไม่ใช่ worktree ของ C1 · C0 (orchestrator) เป็นคนรันตารางนี้ให้ คน C เป็นคนยืนยัน

| # | ตรวจ | ผ่านเมื่อ |
|---|---|---|
| 1 | PR setup | CI `pr-check` เขียว, merge แล้ว, `origin/main` = SHA ที่จะโพสต์ |
| 2 | `npm ci` แล้ว `npm run typecheck` | ผ่าน และ lockfile ไม่เปลี่ยน · `npm ls react` เห็นเวอร์ชันเดียว · `npm ls zod` เห็นเวอร์ชันเดียว · `npm ls openai` = เวอร์ชันที่ pin (≥ 7.58.0) |
| 3 | `npm run lane:init` | `.env.local` มีพอร์ตและ DB ของ lane ตามตาราง session มีชื่อ AI env ครบตาม `.env.example` และ `SITES_URL`/`BOARD_SOURCE` ไม่พิมพ์ค่า secret ออกจอ · `git status` ไม่เห็น `.env.local` และ `.lane` · `DATABASE_URL` ชี้ Neon direct + `sslmode=require` |
| 4 | `npm run db:migrate` สองรอบ, `npm run db:seed` สองรอบ | รอบสอง migrate = 0 pending · seed ไม่ error ไม่มีแถวซ้ำ · `model_usage` มีคอลัมน์ `reasoning_tokens`, `cache_write_tokens`, `audio_input_tokens`, `audio_output_tokens` · มีตาราง `feature_flags` · `npm run db:seed -- --demo` ผ่านและรันซ้ำได้ |
| 5 | `npm run dev` → `/healthz`, `/readyz`, `/build-info` | 200 · build-info มี sha, env, schema, modelMode, models (id จาก env), providerModes และไม่มี key ใด ๆ |
| 6 | `/dev-login` เป็น owner.a | sidebar ครบทุกเมนูของร้าน (28 รายการ; dev mode เห็น placeholder) แต่ละอันเปิดหน้า placeholder ที่มีชิป "ยังไม่ทำ (U)" · สลับ th/en แล้วชื่อเมนูเปลี่ยน · ไม่มีเมนูนอกตาราง MENU |
| 7 | `/dev-login` เป็น staff.a และ admin | staff.a ไม่เห็นเมนูที่ต้องใช้ `product.write`, `account.*`, `business.bot_settings` · admin เห็นกลุ่ม admin (`/release`, `/ops`) |
| 8 | `npm run smoke` | ทุกแถว PASS: 31 ฟีเจอร์ loaded (`/api/v1/_meta/features`), tenant B = 404, inbound → AI ตอบ "1,490" สถานะ `sent`, takeover แล้ว bot เงียบ |
| 9 | `npm run smoke:openai` | เครื่องที่มี key: PASS ทุกแถว (chat/fast/strong, tool loop, embed 1536, moderation) · ไม่มี key: SKIP (ไม่ fail) · `model_usage` มีแถวพร้อมต้นทุน |
| 10 | ownership check | `npm test -- check-paths` ผ่าน (branch lane/B1 แก้โฟลเดอร์ inbox ต้อง fail, `fix/B1/x` ที่แก้ migration ต้อง fail, `fix/B1/x` ที่แก้ >40 บรรทัดต้อง fail) |
| 11 | `npm test` | ผ่านทั้ง server และ web รวม `model.test.ts` (ไม่มี network), `features.test.ts`, `ratelimit.test.ts` และ `web/src/core/ui/ui.test.tsx` |
| 12 | feature flags | `PUT /api/v1/ops/features/F13` `{hidden:true}` ด้วย admin → `GET /api/v1/features` ของ owner.a ได้ `visible:false` และเมนู Orders หายหลัง refresh · `HIDDEN_FEATURES=F14` ตอน boot DB ใหม่ → `hidden:true` · NODE_ENV=production → placeholder ทุกตัว `visible:false` |
| 13 | `npm run e2e -- core` (คนรัน `npm run dev` ไว้) | `tests/e2e/core.smoke.spec.ts` ผ่าน: `ownerPage` ล็อกอิน owner A แล้วเห็น sidebar |
| 14 | S9 production | `https://<render-url>/healthz` = 200, `/readyz` = 200, `/build-info` sha = `origin/main`, `/dev-login` ใส่ `DEV_LOGIN_TOKEN` แล้วเข้าได้, `E2E_BASE_URL=https://<render-url> npm run e2e -- core` ผ่าน · ทำเสร็จก่อน 11:30 (ไม่บล็อก `SETUP READY`) |

ข้อ 1–5, 8, 10–13 ต้องผ่านทั้งหมดก่อนโพสต์ `SETUP READY` ข้อ 6–7 ถ้า UI ยังไม่ครบแต่ API ครบ โพสต์ได้พร้อมระบุใน known gaps เพราะ lanes เริ่ม backend ได้แล้ว ข้อ 9 ถ้า fail เพราะ model ใช้ไม่ได้ (403/404) โพสต์ได้พร้อม known gap แล้วแก้ `.env.example` เป็นรุ่นที่ใช้ได้ใน PR ถัดไป แต่ถ้า wrapper พัง (tool loop, retry) ต้องแก้ก่อน 11:30 · ข้อ 14 ต้องผ่านก่อน 11:30

### 11.2 เกณฑ์ R ของ F01 (D6)
F01 เป็น R เมื่อ: ข้อ 1–5, 8, 10–14 ผ่าน (UI จริง → API → DB จริงบน Neon และ production) · deploy บน production URL แล้ว · unit + route test ผ่านและ `npm run e2e -- core` ผ่านกับ production · มี loading/empty/error state ของ shell ·
ข้อความไทยผ่าน i18n · permission + tenant ตรวจแล้ว (tenant B = 404) · audit ของ core ทำงาน · ไม่มีปุ่มที่กดแล้วไม่มีผล (placeholder ถูกซ่อนใน production) · ลด S ถ้า S9 ไม่ถึงก่อน 11:30 (ไม่ใช่ R) · ลด A ถ้า fake ของ contract ใด signature ไม่ตรง

## 12. Security และ privacy
- **tenant isolation:** `getBusiness()` ตรวจ membership ทุก request จาก DB; business ที่ไม่ใช่สมาชิก = 404 (ไม่ใช่ 403) · ทุก query ของ core กรองด้วย business_id
- **session:** token สุ่ม 32 ไบต์ ใน cookie HttpOnly SameSite=Lax (Secure บังคับใน production) · DB เก็บ HMAC ไม่เก็บ token ดิบ · CSRF: header `X-Requested-With: nless` + ตรวจ Origin · `/webhooks/*` ไม่มี session/CSRF และเก็บ raw body ให้ฟีเจอร์ตรวจลายเซ็น
- **dev login:** ปิดเมื่อ NODE_ENV=production ยกเว้นตั้ง `DEV_LOGIN=1` + `DEV_LOGIN_ENABLED` + `DEV_LOGIN_TOKEN` ≥ 24 ตัว; ทุก request ต้องส่ง token (เทียบ constant-time), rate limit 10/นาที/ip, session ≤ 2 ชม., และต้องปิดด้วย `DEV_LOGIN_ENABLED=false` เมื่อ F02 merge · dev routes ไม่ปรากฏใน `_meta/routes`
- **secrets:** ไม่มีใน repo/log/commit/test/โพสต์บอร์ด · `OPENAI_API_KEY` ไม่ไปถึง browser (ไม่มี `VITE_*` ที่เป็น secret) · `/build-info` ไม่มีค่าลับ · provider token เก็บเข้ารหัสด้วย `encryptSecret` · config ข้ามค่าบอร์ด (SITES_*, BOARD_*)
- **log:** redaction list ใน §4 log.ts · ไม่ log body, prompt, ข้อความลูกค้า, รูปสลิป, data URL, client secret ของ Realtime
- **rate limit:** `rateLimit` helper (§4) ใช้กับ Demo Chat สาธารณะ, webhook และ /api/dev/login
- **DB safety:** `assertSafeDbName` กัน reset/create ผิด DB (§4) · `demo:reset` แตะเฉพาะร้านเดโม
- **ข้อมูล:** สังเคราะห์และบัญชีทดสอบเท่านั้น

## 13. Edge cases
- `contracts.ts` ไม่ตรง scope 31 ฟีเจอร์ (slug ขาด/เกิน, ช่องทางใน SEED นอก 4 ตัว, ownership ไม่ตรง) → หยุดแล้วโพสต์ `BLOCKED @REPLACE_LEAD_LOGIN` (ห้ามแก้ contracts.ts เอง)
- `npm ci`/`npm install` ล้มด้วย EPERM ใน sandbox → ให้คนรันใน terminal · `npm view` ตอบ ETARGET → ใช้ patch ล่าสุดของ major.minor เดียวกันแล้วจดใน `server/src/core/EVIDENCE.md`
- Neon: statement แรกหลัง suspend ช้า ~0.5–2 วินาที หรือ connection หลุด → pool กลับมาเองได้ · `CREATE EXTENSION vector` ล้ม → ใช้ WSL fallback (ตัวแปรเดียวกัน)
- migration checksum เปลี่ยนหลังรันแล้ว → fail (ใช้ `db:reset` กับ DB ของ lane ตัวเองเท่านั้น) · CRLF vs LF ต้องได้ checksum เท่ากัน
- ฟีเจอร์ที่ซ่อนด้วย flag แต่ API ยังตอบ → ตั้งใจ (webhook/smoke) ไม่ใช่บั๊ก
- placeholder ใน production → ซ่อนทั้งเมนูและ route (NotFound) แม้พิมพ์ URL ตรง
- เปิด web ก่อน flag โหลดเสร็จใน production → ซ่อนทุกฟีเจอร์ชั่วคราว (ไม่กะพริบหน้า placeholder)
- สอง instance ของ server (ไม่ควรมี): scheduler รันที่ instance ที่ได้ advisory lock เท่านั้น
- ถ้า `PORT` ตั้งไว้ → ใช้ PORT; ถ้าไม่ใช้ API_PORT · listen ที่ `0.0.0.0`
- `.env.local` มีอยู่แล้วตอน lane:init → ไม่ทับ (ยกเว้น --force) พิมพ์เฉพาะชื่อ key ที่เปลี่ยน

### ถ้าช้า (ตัดตามลำดับนี้ ห้ามตัดรายการ "ห้ามตัด")

| ลำดับตัด | ตัดอะไร | ผลต่อ lane อื่น | ใส่ใน known gaps |
|---|---|---|---|
| 1 | layout มือถือ, หน้า `/ops`, `/account` ให้เป็น placeholder | ไม่มี | ใช่ |
| 2 | UI kit ส่วนไม่บังคับแบบบาง: `ConfirmDialog`, `EmptyState`, `StatusChip`, `SectionCard`, `useApiMutation` (export + signature ครบ) เติมใน PR `lane/C1/core-ui` ก่อน 11:30 | หน้าของ lane ใช้ชื่อเดิมได้เลย แค่ดูเรียบกว่าจน PR เติม | ใช่ |
| 3 | realtime: `publish()` log อย่างเดียว, `useRealtime` no-op | A1 ใช้ poll ไปก่อน | ใช่ |
| 4 | schedules ไม่รัน (log เตือน) | F15 reminder / F17 token refresh รอ F35 | ใช่ |
| 5 | openai mode ของ `moderate` / `transcribe` / `createRealtimeSession` / `recordRealtimeUsage` (fake ยังต้องครบ) ส่งใน PR `lane/C1/core-model` ก่อน 11:30 | B1/B3/A1 ได้ moderation เป็น fake, F30 (P3) ยังไม่เริ่ม | ใช่ |
| 6 | `storage.save` throw `SERVICE_NOT_READY` | upload ของ F05/F06/F12/F14 รอ | ใช่ |
| 7 | slot rendering ใน host (useSlot คืนรายการได้แต่ host ยังไม่วาด) | เจ้าของ host วาดเอง | ใช่ |
| 8 | `db:seed -- --demo` แบบเต็ม (รูปสินค้า PNG + 8 ห้องแชตไทย) ส่งใน PR `lane/C1/core-demo` ก่อน 12:30 (`db:seed` ปกติห้ามตัด) | ข้อมูลเดโมโล่ง จนกว่า PR จะมา | ใช่ |
| 9 | สวิตช์บนหน้า `/ops` (ตารางฟีเจอร์): ให้ใช้ `curl`/PowerShell เรียก `PUT /api/v1/ops/features/:id` ไปก่อน (API และ `GET /api/v1/features` ห้ามตัด) | orchestrator ซ่อนฟีเจอร์ด้วยมือ | ใช่ |

**ห้ามตัด:** ติดตั้ง library ครบ list · dev login + `getUser`/`getBusiness`/`requirePermission` · migrate/seed · auto-load routes/pages + 29 placeholders · UI kit ขั้นต่ำ (`DataTable`, `FormDialog`, `useApiQuery`, `useToast` + `ToastProvider` ครบ spec และ export ครบ 10 ชื่อ) · fake ครบทุก contract · fake ครบทุกฟังก์ชันของ `model` + openai mode ของ `model.chat` (Responses, tool loop, retry/error) และ `model.embed` · core loop บน fake (`saveMessage` → `ai.reply` → `sendToCustomer('web')`) · `check:paths` + CI

**ห้ามตัดเพิ่ม:** feature flags (ตาราง + `GET /api/v1/features` + web ซ่อนเมนู) · `rateLimit` · `assertSafeDbName` allow-list · `check:paths` กฎ `fix/` · `/healthz`, `/readyz`, `/build-info` · S9 first deploy ก่อน 11:30

## 14. Build order (slices)

เป้า: `SETUP READY` ≈ 10:45–10:50 (ช้าสุด 11:00 = timebox เต็ม) ถ้าวางพรอมต์ 10:05 · S9 ก่อน 11:30 · timebox ต่อขั้น: S1 6 · S2 3 · S3 15 · S4 5 · S5 5 · S6 10 · S7 6 · S8 5 = 55 นาที · เกิน timebox ของขั้นใด ให้ทำ "ขั้นต่ำ" ของขั้นนั้นแล้วไปต่อ · commit ทีละขั้นได้ · PR เดียว `lane/C1/core` (S9 = PR `lane/C1/deploy`)

### โครงสุดท้าย (สร้างตามนี้ ชื่อไฟล์ตรงตัว)

.
├─ AGENTS.md contracts.ts SPEC.md .env.example .gitignore docs/ prompts/ tools/ .codex/      (baseline, ไม่แก้ยกเว้น .gitignore)
├─ package.json  package-lock.json  tsconfig.base.json  vitest.config.ts  playwright.config.ts
├─ Dockerfile  .dockerignore  render.yaml  scripts/docker-entrypoint.sh   (S9 เท่านั้น ตาม docs/day/deployment.md)
├─ .github/workflows/pr-check.yml
├─ scripts/  lane-init.ts  db.ts  check-paths.ts  check-paths.test.ts  scaffold-features.ts  smoke.ts  smoke-openai.ts
├─ tests/e2e/  fixtures.ts  core.smoke.spec.ts
├─ shared/   package.json  tsconfig.json
│  ├─ core/  features.ts  flags.ts  types.ts  permissions.ts  fixtures.ts  loader.ts  index.ts
│  └─ features/<slug>/types.ts                                   (29 slugs)
├─ server/   package.json  tsconfig.json
│  └─ src/
│     ├─ core/  index.ts (public API)  config.ts log.ts errors.ts db.ts http.ts auth.ts dev.ts jobs.ts model.ts channels.ts
│     │         realtime.ts storage.ts audit.ts features.ts ratelimit.ts crypto.ts migrate.ts seed.ts demo.ts meta.ts server.ts app.ts shims.d.ts
│     │         test-utils.ts test-global-setup.ts  migrations/001_core.sql  EVIDENCE.md  *.test.ts
│     └─ features/<slug>/  routes.ts  service.ts  migrations/.gitkeep  EVIDENCE.md      (29 slugs)
└─ web/      package.json  tsconfig.json  vite.config.ts  index.html
   └─ src/
      ├─ core/  main.tsx App.tsx index.ts types.ts api.ts session.tsx realtime.ts slots.ts registry.ts i18n.ts theme.ts icons.ts
      │         format.ts featureFlags.ts layout/{AppShell,Sidebar,TopBar,PageHeader}.tsx
      │         ui/{DataTable,FormDialog,ConfirmDialog,EmptyState,StatusChip,SectionCard,toast}.tsx  ui/apiHooks.ts  ui/index.ts
      │         ui/ui.test.tsx
      │         pages/{Home,DevLogin,Account,OAuthCallback,Ops,Forbidden,NoBusiness,NotFound,PlaceholderPage}.tsx
      │         i18n/th/{common,nav}.json  i18n/en/{common,nav}.json  registry.test.ts
      └─ features/<slug>/  pages.tsx  Placeholder.tsx  i18n/th.json  i18n/en.json            (29 slugs)

"29 slugs" = FolderSlug ใน contracts.ts (ทุก FEATURES ที่ folder: true):
  auth tenancy business-settings knowledge knowledge-import knowledge-search catalog inbox ai-agent team message-templates
  orders payments booking calendar line meta comments live-commerce broadcast crm insights analytics voice notifications release
  evals follow-ups chatgpt-catalog
F01 core และ F35 core/jobs อยู่ใน server/src/core · ถ้า FEATURES ใน contracts.ts ยังมี slug อื่นหรือขาด slug ในรายการนี้ หยุดแล้วโพสต์
BLOCKED @REPLACE_LEAD_LOGIN "contracts.ts ไม่ตรง scope 31 ฟีเจอร์" (ห้ามแก้ contracts.ts เอง)

### S1 · root + workspaces + install (0–6 นาที)

1. package.json (root):
   name "nless-hack", private, "type": "module", "engines": {"node": ">=24.0.0 <25"}, "workspaces": ["shared","server","web"]
   scripts:
     "dev": "concurrently -k -n api,web -c blue,magenta \"npm:dev:api\" \"npm:dev:web\""
     "dev:api": "tsx watch --clear-screen=false server/src/core/server.ts"
     "dev:web": "vite --config web/vite.config.ts"
     "start": "tsx server/src/core/server.ts"
     "typecheck": "tsc -p shared && tsc -p server && tsc -p web"   ← server/tsconfig include ../scripts/**/*.ts, ../tests/**/*.ts และ ../playwright.config.ts ด้วย
     "build": "npm run typecheck && vite build --config web/vite.config.ts"
     "test": "vitest run"            ← `npm test -- <slug>` กรองไฟล์ test ตาม path
     "db:create": "tsx scripts/db.ts create"   "db:migrate": "tsx scripts/db.ts migrate"
     "db:seed": "tsx scripts/db.ts seed"       "db:reset": "tsx scripts/db.ts reset"
     "migrate": "npm run db:migrate"           "seed": "npm run db:seed"
     "lane:init": "tsx scripts/lane-init.ts"   "check:paths": "tsx scripts/check-paths.ts"
     "scaffold": "tsx scripts/scaffold-features.ts"   "smoke": "tsx scripts/smoke.ts"
     "smoke:openai": "tsx scripts/smoke-openai.ts"
     "e2e": "playwright test"                  ← `npm run e2e -- <slug>` · ต้อง `npx playwright install chromium` ครั้งเดียวต่อเครื่อง (คนรัน; ไม่รันใน CI)
     "evals": "tsx server/src/features/evals/run.ts"   ← F37 (B1) เขียนไฟล์นี้ · scaffold ใส่ stub ที่พิมพ์ "F37 ยังไม่ทำ" แล้ว exit 0
     "demo:reset": "tsx scripts/db.ts demo-reset"       ← `npm run db:seed -- --demo` ใช้ db:seed เดิมพร้อม flag
     "check": "npm run typecheck && npm run check:paths && npm test"
   devDependencies: @playwright/test 1.64.1, @types/node 24.12.4, @types/supertest 7.2.1, @vitejs/plugin-react 6.0.2,
     concurrently 10.0.6, supertest 7.3.1, tsx 4.23.15, typescript 6.0.3, vite 8.0.16, vitest 4.1.10
2. shared/package.json: name "@nless/shared", version "0.0.0", private, "type": "module",
   "exports": {"./*": "./*.ts"}, dependencies: zod 4.6.7
   → import แบบ "@nless/shared/core/types", "@nless/shared/features/catalog/types"
3. server/package.json: name "@nless/server", version "0.0.0", private, "type": "module"
   dependencies: "@nless/shared": "*", @modelcontextprotocol/sdk 1.32.2, adm-zip 0.6.1, cookie-parser 1.4.7, csv-parse 7.0.3, dotenv 17.4.2, exceljs 4.4.0,
     express 5.2.1, googleapis 144.0.0, jsqr 1.4.0, multer 2.5.0, openai 7.62.0, pdf-lib 1.17.1, pdfjs-dist 6.3.289, pg 8.23.1,
     pgvector 0.3.0, pino 10.4.0, promptpay-qr 0.5.0, qrcode 1.5.4, sharp 0.35.5, web-push 3.6.7, ws 8.22.1, zod 4.6.7
   (jsqr 1.4.0 = ถอดรหัส QR ของสลิป F14 คู่กับ sharp ที่แปลงรูปเป็น RGBA · @modelcontextprotocol/sdk 1.32.2 = MCP server ของ F39 · ทั้งสองตรวจด้วย `npm view` เมื่อ 20 พ.ย.; ถ้า `npm ls zod` เห็นสองเวอร์ชันเพราะ SDK ให้แก้ก่อนไปต่อ)
   openai ต้อง ≥ 7.58.0 (ID ของ GPT-6.2) ถ้า 7.62.0 ETARGET ใช้ 7.62.x ล่าสุด ไม่มีจึงใช้ตัวล่าสุดที่ ≥ 7.58.0 แล้วจดเหตุผล
   (exceljs = อ่าน XLSX ของ F06 ในเครื่อง · csv-parse/pdfjs-dist = CSV/PDF ดิจิทัลของ F06)
   devDependencies: @types/cookie-parser 1.4.10, @types/express 5.0.6, @types/multer 2.3.0, @types/pg 8.23.1,
     @types/qrcode 1.5.6, @types/web-push 3.6.4, @types/ws 8.18.2
4. web/package.json: name "@nless/web", version "0.0.0", private, "type": "module"
   dependencies: "@nless/shared": "*", @emotion/react 11.14.0, @emotion/styled 11.14.1, @fontsource/inter 5.3.0,
     @fontsource/manrope 5.3.0, @fontsource/noto-sans-thai 5.3.0, @fontsource/prompt 5.3.0, @mui/icons-material 9.0.1,
     @mui/material 9.0.1, i18next 26.3.6, i18next-browser-languagedetector 8.2.1, qrcode 1.5.4, react 19.2.7,
     react-dom 19.2.7, react-i18next 17.0.11, react-markdown 10.1.0, react-router-dom 7.18.3, recharts 3.8.1, remark-gfm 4.0.1
   devDependencies: @testing-library/dom 10.4.1, @testing-library/react 16.3.2, @testing-library/user-event 14.6.3,
     @types/react 19.2.16, @types/react-dom 19.2.3, jsdom 30.0.1
   (vite/vitest อยู่ root ที่เดียว; react ต้องมีชุดเดียวใน lockfile — ถ้า `npm ls react` เห็นสองเวอร์ชัน แก้ก่อนไปต่อ)
   web ไม่มี openai SDK: F30 ต่อ WebRTC ด้วย fetch + RTCPeerConnection ของ browser และ client secret ที่ core ออกให้
5. tsconfig.base.json: target ES2023, module ESNext, moduleResolution bundler, strict, noEmit, skipLibCheck,
   isolatedModules, verbatimModuleSyntax, resolveJsonModule, noUncheckedIndexedAccess false
   shared/tsconfig.json + server/tsconfig.json: extends base, types ["node"], include ของ package ตัวเอง
   web/tsconfig.json: extends base, lib ES2023 + DOM + DOM.Iterable, jsx react-jsx, types ["vite/client"], include src
   ห้ามใส่ baseUrl (TS 6) และไม่ต้องใช้ paths: workspace package ทำหน้าที่แทน
6. .gitignore: ต้องมี var/  web/dist/  tests/e2e/.auth/  playwright-report/  test-results/ (มี .lane, .env.*, node_modules/ แล้ว; ถ้ายังไม่มีให้ต่อท้าย) · ตรวจ git check-ignore .env.local ต้องเจอ
7. npm install --no-audit --no-fund → ได้ package-lock.json (C1 เท่านั้นที่แก้ lockfile ตลอดวัน) · แล้วบอกคนให้รัน `npx playwright install chromium` ใน terminal ของตัวเอง
ขั้นต่ำ: install ผ่านครบทุก package; ห้ามตัด library ออกเพื่อให้เร็ว (กติกา PLAN: ติดตั้งของทั้งวันครั้งเดียว)

### S2 · shared/core จาก contracts.ts (6–9 นาที)

แตก contracts.ts ตาม banner (คง comment/JSDoc ไว้):
- shared/core/features.ts ← ส่วน "shared/core/features.ts" · types.ts ← "shared/core/types.ts" · permissions.ts · fixtures.ts
  · language.ts ← ส่วน "shared/core/language.ts": เขียน implementation จริงของ detectTextLanguage และ formatMoneyText ตาม JSDoc (pure, ไม่ import อะไร)
    + language.test.ts ตามตัวอย่างใน JSDoc ทุกข้อ · ทุก lane ใช้สองตัวนี้กับข้อความถึงลูกค้า (ห้ามเขียนตัวตรวจภาษาหรือตัวจัดรูปเงินซ้ำ)
  · loader.ts ← ส่วน "shared/core/loader.ts" (FeaturePages, MenuEntry, SlotName, WebApiClient, WebApiError, SessionState …)
- web/src/core/types.ts ← ส่วน "web/src/core/types.ts" (WebCore + props ของ UI kit) ไม่ใส่ใน shared เพราะใช้ React types:
  ReactNodeLike → ReactNode จาก 'react', type อื่น import type จาก @nless/shared/core/* · `declare function` ของส่วนนี้ไม่ copy
  (S6 implement ใน web/src/core/ui/*)
- type ฝั่ง server ล้วน (AppError, DbClient, JobsApi, ModelApi, ChannelSender, FeatureRoutes, FeatureApi, FeatureMigration,
  FeatureSeed …) ไปอยู่ใน server/src/core ตาม banner ไม่ใส่ใน shared (shared ห้าม import จาก server)
- shared/core/flags.ts ← FeatureFlagView + SetFeatureFlagBody ใน §3 (ไม่อยู่ใน contracts.ts) · shared/core/index.ts re-export ทั้งหมด
- shared/features/<slug>/types.ts ← type ในส่วน "FEATURE CONTRACTS" ของ slug นั้น (ทุก slug ที่มี banner ใน contracts.ts ตอนนี้
  12 slugs: 11 ที่มี service contract = inbox, team, message-templates, ai-agent, knowledge-search, catalog, business-settings,
  orders, booking, crm, notifications + voice ที่มีแค่ types) · อีก 17 slugs: `export {};` + comment "types ของ <ID> <slug> —
  เจ้าของ <lane> เขียนเอง"
- type ที่ shared/features อ้างข้าม slug ให้ import type จาก @nless/shared/features/<slug>/types (เช่น orders ใช้ ProductRef
  ของ catalog) · shared/core ไม่ import จาก shared/features
- placeholder RequestLike/SchemaLike/ComponentLike/LazyComponent/ReactNodeLike: server ใช้ express.Request + zod, web ใช้ React types
ขั้นต่ำ: npm run typecheck ของ shared ผ่าน

### S3 · server core (9–24 นาที)
เนื้อหา: §4 (config, log, errors, db, http/app, auth, dev, channels, realtime, storage, features, meta, server, shims, test-utils, crypto, ratelimit), §6 (model.ts), §8 (jobs, scheduler) ·
เรียงทำ: config → log/errors → db → http/app/auth/dev → features loader + meta + server → jobs → channels/realtime/storage/audit → crypto/ratelimit → model.ts (fake ก่อน แล้ว openai mode)

ขั้นต่ำ (ถ้าถึงนาทีที่ 24 แล้วยังไม่ครบ): realtime.publish = log อย่างเดียว, storage.save throw SERVICE_NOT_READY, schedules
ยังไม่รัน, ของจริง (openai mode) ของ moderate/transcribe/createRealtimeSession/recordRealtimeUsage ส่งใน PR ถัดไป
lane/C1/core-model ก่อน 11:30 → ใส่ใน known gaps ของโพสต์ · ห้ามตัด auth/dev login/jobs/channels, fake ครบทุกฟังก์ชันของ
model และ openai mode ของ chat (รวม tool loop + providerState + retry/error) กับ embed

### S4 · base schema + migrate + seed (24–29 นาที)
เนื้อหา: §2 (001_core.sql รวม feature_flags), §5.1 (migrate.ts, scripts/db.ts), §9.1 (seed) ·

ขั้นต่ำ: migrate จาก DB ว่างผ่าน, รันซ้ำ = 0 pending, seed สองครั้งไม่ error

### S5 · 29 feature scaffolds + fakes (29–34 นาที)

scripts/scaffold-features.ts วนทุก FolderSlug ใน FEATURES (29 ตัว; ไม่ทับไฟล์ที่มีอยู่) สร้าง:
- server/src/features/<slug>/routes.ts:
    export default defineFeatureRoutes({ featureId, slug, register(api) {
      api.get('/features/<slug>/status', { auth: 'user', summary: 'placeholder status' },
        async () => ({ featureId, slug, lane, implemented: false, mode: 'U' })); } })
    (summary 'placeholder status' คือ marker ที่ core ใช้ตัดสิน FeatureFlagView.placeholder: ห้ามเปลี่ยนข้อความ · เจ้าของฟีเจอร์ลบ route นี้เมื่อมี route จริง)
- server/src/features/<slug>/service.ts: 14 slugs ที่ไม่มี contract = export const FEATURE = { id, slug, lane } as const
- server/src/features/<slug>/migrations/.gitkeep
- server/src/features/<slug>/EVIDENCE.md (รูปแบบ prompts/README.md หัวข้อ "สถานะและ evidence": แถว Status เดียว
  status UNIMPLEMENTED, target_mode จาก docs/competition-plan/feature-backlog.csv คอลัมน์ targetMode: real… → R,
  sandbox_then_real_if_ready → S · actual_mode U · ตาราง Log ว่าง)
  + server/src/core/EVIDENCE.md สองแถว F01, F35
- web/src/features/<slug>/pages.tsx (defineFeaturePages จาก '../../core') ใช้ตาราง MENU ด้านล่าง: routes = ทุก path ของ slug
  ในตาราง (load: () => import('./Placeholder')) + menu entry ต่อ path · Placeholder.tsx = <PlaceholderPage featureId="Fxx" /> จาก core
- web/src/features/<slug>/i18n/th.json + en.json: { "menu": { "title": … }, "page": { "title": … } } ตามตาราง
แล้วเขียน fake ใน service.ts ของ 15 contract slugs ด้วยมือ ให้ signature ตรง contracts.ts ทุกตัวอักษรและพฤติกรรมตาม @fake:
  inbox (saveMessage/getConversation/getHistory/getCustomerLanguage = ของจริงขั้นต่ำบนตาราง core; getCustomerLanguage ใช้
  detectTextLanguage ของ shared/core/language.ts ตาม @fake) · team (isHumanTakeover/assignConversation =
  ของจริงขั้นต่ำ) · message-templates · ai-agent (generateReply + aiReplyJobHandler; routes.ts ใส่
  jobs: { [AI_REPLY_JOB]: aiReplyJobHandler }) · knowledge-search · catalog · business-settings · orders · booking · crm ·
  notifications · knowledge (createKnowledgeDraft, ensureKnowledgeFolder) · follow-ups (getFollowUpMetrics = ศูนย์ทั้งหมด) ·
  payments (analyzeSlip = throw SERVICE_NOT_READY ตาม @fake · makeSlipQrPayload, slipRenderingAvailable, renderSyntheticSlip ตาม @fake:
  B1 F37 import ทั้งสามตัว) · live-commerce (findProductCodes = [])
  (สี่ slug หลังมี function ใน contracts.ts ที่ lane อื่น import: B3 ใช้ knowledge/follow-ups, B1 ใช้ analyzeSlip, C2/A2 ใช้ findProductCodes)
  ข้ามฟีเจอร์ import จาก '../<slug>/service' เท่านั้น (fake ของ ai-agent เรียก fake ของ inbox/catalog/knowledge-search/
  business-settings/team ผ่าน service.ts ตาม Core loop)
เมนูและ path ของแต่ละ slug: ตาราง MENU ใน §7
ขั้นต่ำ: typecheck ผ่าน, ทุก slug มี routes.ts/pages.tsx, 15 fakes ครบ signature (fake ที่ยังไม่ทันเขียน body ให้
throw AppError('SERVICE_NOT_READY') ชั่วคราว ยกเว้น inbox, team, ai-agent, catalog, knowledge-search, business-settings
ที่ core loop ต้องใช้)

### S6 · web core + UI kit (34–44 นาที: shell 34–40, UI kit 40–44)
เนื้อหา: §7 ทั้งหมด (หน้าตา shell, vite, registry, App, AppShell, featureFlags, api/session/realtime/slots/format, i18n, DevLogin, PlaceholderPage, UI kit, i18n common) ·

ขั้นต่ำ: dev login ได้, sidebar ครบทุก entry, ทุก path เปิด placeholder ได้; realtime/slot UI เป็น no-op ได้ถ้าเวลาไม่พอ ·
UI kit: export ครบ 10 ชื่อ signature ตรง contracts.ts เสมอ · setup ช้า (เริ่ม UI kit หลังนาทีที่ 40) → DataTable, FormDialog,
useApiQuery, useToast (+ ToastProvider) ต้องครบตาม spec ส่วน ConfirmDialog, EmptyState, StatusChip, SectionCard, useApiMutation
บางได้ (เช่น StatusChip = Chip ไม่มี map สี, useApiMutation ไม่ toast) → ใส่ known gaps แล้วเติมใน PR lane/C1/core-ui ก่อน 11:30

### S7 · scripts + CI + tests (44–50 นาที)
เนื้อหา: §5.2 (lane-init), §5.3 (check-paths), §5.4 (smoke), §5.5 (smoke-openai), §10 (vitest, tests, Playwright fixtures/config, CI workflow) ·

ขั้นต่ำ: check-paths + test ของมัน และ workflow ต้องมี ห้ามตัด

### S8 · ตรวจ + merge + โพสต์ (50–55 นาที)

1. npm run typecheck && npm test ผ่านในเครื่อง · npm run lane:init (สร้าง .env.local ของ C1) · npm run db:reset ·
   npm run dev แล้วอีก terminal npm run smoke ผ่านทุกแถว · npm run smoke:openai (PASS ทุกแถว หรือ SKIP ถ้าเครื่องนี้ไม่มี key) ·
   เปิด http://localhost:5171/dev-login ล็อกอิน owner.a เห็นเมนู · คนรัน `npm run e2e -- core` ผ่าน (dev server เปิดไว้)
2. git push -u origin lane/C1/core → gh pr create --base main --title "F01 setup: core, OpenAI model wrapper, 29 feature scaffolds, contract fakes"
   --body "<สรุปสั้น + known gaps>" → gh pr checks --watch → เขียวแล้ว gh pr merge --squash --delete-branch
3. git fetch origin → SHA = git rev-parse origin/main
4. อัปเดต server/src/core/EVIDENCE.md (F01: DONE/R ถ้า acceptance ผ่านจริง, F35: DOING เพราะ ops page/retry ยังไม่ครบ) ใน PR
   ถัดไปของ F35 ได้ ไม่ต้องรอ
5. ตอบในแชต: SHA, ลิงก์ PR, ผล smoke + smoke:openai (ตาราง), known gaps · เขียนโพสต์ตามแบบด้านล่างลง handoff/setup-ready.txt แล้วโพสต์
   (สคริปต์เขียน Sites dashboard + mirror GitHub issue ให้เอง ค่า SITES_* / BOARD_* อ่านจาก environment หรือ ..\nless.secrets.env,
   lane จาก .lane):
   powershell -NoProfile -ExecutionPolicy Bypass -File tools/team-board.ps1 post -MessageFile handoff/setup-ready.txt -PostId F01-C1-setup-ready
   แล้วอัปเดตการ์ด: powershell -NoProfile -ExecutionPolicy Bypass -File tools/team-board.ps1 status C1 F01 R "setup merged" -Sha <sha สั้น>
   (สคริปต์ล้มหรือยังไม่ได้ตั้ง → ส่งข้อความให้คนโพสต์เอง ห้ามข้ามขั้นโพสต์)
ถ้าครบ 50 นาทีหลังเริ่มแล้วยังไม่ผ่าน: โพสต์ BLOCKED @REPLACE_LEAD_LOGIN "SETUP ETA <HH:MM> ติดที่ S<n>: <สาเหตุ>" แล้วทำต่อ
หลังโพสต์ SETUP READY ทำ S9 (production deploy) ต่อทันทีกับ คน C ในแชตเดิม แล้วรอ prompt ถัดไป (prompts/lanes/C1.md วางใน chat ใหม่ของ ..\nless-c1) ห้ามเริ่ม F35 เองก่อนได้รับ

แบบโพสต์:
SETUP READY <sha>
PR <url> · CI เขียว · smoke ผ่าน (31 ฟีเจอร์ loaded, tenant 404, core loop บน fake: inbound → ai.reply → web 'sent', takeover แล้วเงียบ) · e2e core ผ่านใน dev
smoke:openai: <PASS chat/fast/strong/tool loop/embed 1536/moderation | SKIP ไม่มี key>
เริ่ม: git fetch origin && git switch -c lane/<LANE>/<slug> origin/main && npm ci && npm run lane:init && npm run db:migrate && npm run db:seed && npm run dev
port/DB ต่อ session (12): docs/specs/F01-core.md §14 · dev login: /dev-login (owner.a staff.a owner.b staff.b admin @example.test; production ต้องใส่ DEV_LOGIN_TOKEN)
fakes: ทุก contract ใน contracts.ts อยู่ใน server/src/features/<slug>/service.ts · confirm ของ createOrderFromProposal/createBooking = SERVICE_NOT_READY
model: เรียก model.chat/embed/moderate/transcribe/createRealtimeSession ของ core เท่านั้น (OpenAI) · fake ถ้าไม่มี OPENAI_API_KEY หรือใน test/CI
web UI kit (import จาก '../../core'): DataTable FormDialog ConfirmDialog EmptyState StatusChip SectionCard useToast useApiQuery useApiMutation · ตัวอย่าง docs/COOKBOOK.md
e2e: tests/e2e/fixtures.ts (ownerPage, api, e2eMarker) · npm run e2e -- <slug> · feature flags: GET /api/v1/features + HIDDEN_FEATURES (placeholder ซ่อนใน production) · rateLimit()/encryptSecret() จาก core · npm run db:seed -- --demo
P0 เริ่มได้เลย (C2 C3 B1 B2 A1) · A2 A3 B3 รอ LEAD: OPEN P1 · production URL จะโพสต์หลัง S9 (ก่อน 11:30)
known gaps: <รายการ หรือ none>
TO:A0 TO:B0 TO:C0 TO:C2 TO:C3 TO:B1 TO:B2 TO:B3 TO:A1 TO:A2 TO:A3

### S9 · production deploy (หลัง SETUP READY ถึง 11:30, timebox ≤ 30 นาที; ทำร่วมกับ คน C ที่ถือบัญชี Render)
แหล่งความจริงของไฟล์และขั้น Render/Railway = [`docs/day/deployment.md`](../day/deployment.md) (`Dockerfile`, `render.yaml`, `.dockerignore`, ตาราง env production, ขั้น Render, fallback Railway) · ห้ามเขียนใหม่เอง
1. สร้าง `Dockerfile`, `.dockerignore`, `render.yaml` และ `scripts/docker-entrypoint.sh` (ต้อง executable: `git update-index --chmod=+x scripts/docker-entrypoint.sh`) **ตามที่ไฟล์นั้นให้ไว้ทุกบรรทัด** ใน PR `lane/C1/deploy` (แก้เฉพาะเมื่อจำเป็น และจดเหตุผลใน EVIDENCE.md)
2. ตรวจว่า server ตามข้อกำหนด production (ทำไว้แล้วใน S3; ถ้ายังไม่ครบให้ทำใน PR เดียวกัน): listen `process.env.PORT` ที่ `0.0.0.0` · เสิร์ฟ `web/dist` เป็น static พร้อม SPA fallback ·
   `/healthz` (process ขึ้น + `SELECT 1`) และ `/readyz` · `/build-info` (git SHA จาก `RENDER_GIT_COMMIT`/`BUILD_SHA`, modelMode, env) · migration แรก `CREATE EXTENSION IF NOT EXISTS vector` ·
   `UPLOAD_DIR` = `/var/data/uploads` บน Render (dev `var/uploads`) · WebSocket ping ทุก 25 วินาที · worker + scheduler ใน process เดียว (scheduler มี advisory lock) ·
   `trust proxy` + cookie Secure ใน production · `APP_BASE_URL` ตั้งแล้ว · dev login ต้องมี `DEV_LOGIN_TOKEN` (สุ่ม ใน Render env)
3. merge → Render auto-deploy จาก `main` (คน C สร้าง Blueprint/ตั้ง env ตามตารางใน deployment.md; `OPENAI_API_KEY` ของ production = key ของ project `app-prod` ใน Render เท่านั้น) · `preDeployCommand` รัน migrate ·
   หลัง deploy ครั้งแรก คน C รัน `npm run db:seed` หนึ่งครั้งใน Render shell (และ `npm run db:seed -- --demo` เมื่อ PR core-demo merge แล้ว)
4. ตรวจ (ข้อ 14 ในตาราง §11.1): `curl https://<url>/healthz`, `/readyz`, `/build-info` (sha = `git rev-parse origin/main`) · `/dev-login` ใส่ token เข้าได้ · `E2E_BASE_URL=https://<url> E2E_DEV_LOGIN_TOKEN=… npm run e2e -- core` ผ่าน
5. โพสต์ `DONE F01 deploy production <url> <sha> TO:A0 TO:B0 TO:C0` (ไม่มี token ในโพสต์) แล้วบอกทุกคนใส่ `E2E_BASE_URL=<url>` ใน `..\nless.secrets.env` · อัปเดต STATUS C1 F01
6. เมื่อ C3 merge F02 และล็อกอินจริงได้: คน C ตั้ง `DEV_LOGIN_ENABLED=false` ใน Render env แล้ว redeploy (ห้ามลืม) · ก่อนกรรมการเข้า ตรวจว่า `/api/dev/status` ตอบ 404
ขั้นต่ำ: Render ติด > 15 นาที → ใช้ Railway ตาม deployment.md · ถึง 11:30 ยังไม่ขึ้น → โพสต์ `BLOCKED @REPLACE_LEAD_LOGIN "production deploy ติดที่ <ขั้น>"` แล้วทำต่อ (ไม่บล็อก lane อื่น: พวกเขาทำงานบน dev ได้)

### ตารางพอร์ตและฐานข้อมูลต่อ session (12 session)

ทุกเครื่องใช้ฐานข้อมูลของ **Neon project ของตัวเอง** (direct endpoint, ไม่ใช่ pooled) แต่คนละ database ต่อ session · `npm run lane:init` เขียนค่าพวกนี้ลง `.env.local` ให้เองจาก `.lane` (+ ค่า AI, DB server และบอร์ดจาก `..\nless.secrets.env`) · orchestrator ของแต่ละคนอยู่คนละเครื่อง จึงใช้พอร์ต 3000 / 5170 ซ้ำกันได้

| Session | worktree (ข้าง clone หลัก) | `.lane` | `API_PORT` | `WEB_PORT` | database | test database | branch แรก |
|---|---|---|---:|---:|---|---|---|
| A0 orchestrator | `..\nless-a0` (ตาม `origin/main`) | `A0` | 3000 | 5170 | `nless_hack_a0` | `nless_hack_a0_test` | — (ตรวจรวม, `fix/<owner>/<slug>`) |
| B0 orchestrator | `..\nless-b0` | `B0` | 3000 | 5170 | `nless_hack_b0` | `nless_hack_b0_test` | — |
| C0 orchestrator | `..\nless-c0` | `C0` | 3000 | 5170 | `nless_hack_c0` | `nless_hack_c0_test` | — (ตรวจ gate 13:00 บน production) |
| C1 | `..\nless-c1` | `C1` | 3001 | 5171 | `nless_hack_c1` | `nless_hack_c1_test` | `lane/C1/core` |
| C2 | `..\nless-c2` | `C2` | 3002 | 5172 | `nless_hack_c2` | `nless_hack_c2_test` | `lane/C2/line` |
| C3 | `..\nless-c3` | `C3` | 3003 | 5173 | `nless_hack_c3` | `nless_hack_c3_test` | `lane/C3/business-settings` |
| B1 | `..\nless-b1` | `B1` | 3004 | 5174 | `nless_hack_b1` | `nless_hack_b1_test` | `lane/B1/knowledge` |
| B2 | `..\nless-b2` | `B2` | 3005 | 5175 | `nless_hack_b2` | `nless_hack_b2_test` | `lane/B2/ai-agent` |
| B3 | `..\nless-b3` | `B3` | 3006 | 5176 | `nless_hack_b3` | `nless_hack_b3_test` | `lane/B3/knowledge-import` (หลัง `LEAD: OPEN P1`) |
| A1 | `..\nless-a1` | `A1` | 3007 | 5177 | `nless_hack_a1` | `nless_hack_a1_test` | `lane/A1/inbox` |
| A2 | `..\nless-a2` | `A2` | 3008 | 5178 | `nless_hack_a2` | `nless_hack_a2_test` | `lane/A2/orders` (หลัง `LEAD: OPEN P1`) |
| A3 | `..\nless-a3` | `A3` | 3009 | 5179 | `nless_hack_a3` | `nless_hack_a3_test` | `lane/A3/crm` (หลัง `LEAD: OPEN P1`) |

- **branch:** worker ใช้ `lane/<LANE>/<slug>` (`-` แทน `/`, เช่น `lane/C1/core-jobs`; PR ที่สองของฟีเจอร์เดิมเติม `-2`) · orchestrator แก้ข้าม lane ที่ `fix/<owner-lane>/<slug>` ตาม D5 (CI ใช้กฎของ lane เจ้าของ + ต้องมี test + แก้นอก test ไม่เกิน 40 บรรทัด + ห้ามแตะ migration/`contracts.ts`) · `lead/<ชื่อ>` = หัวหน้าแก้ฉุกเฉิน ผ่าน check พร้อมคำเตือนและต้องมีคนรีวิว
- **ชื่อ DB:** ต้องตรง `^nless_hack_[a-c][0-3](_test)?$` (`assertSafeDbName`) · CI ใช้ `nless_hack_a0` / `nless_hack_a0_test` ในคอนเทนเนอร์ที่ทิ้งได้ · production ใช้ชื่อที่ Render/Supabase ให้และไม่เคยรัน `db:create`/`db:reset`
- **Neon:** `PG_SERVER_URL` = connection string ของ endpoint **direct** (ไม่มี `-pooler` ในชื่อ host) ลงท้าย `?sslmode=require` · pool ≤ 5 ต่อ process (`DB_POOL_MAX=5`) · ตัวอย่างพร้อมกัน 4 API + test ต่อคนต้องไม่เกินลิมิต connection ของ free tier (UNCONFIRMED: ตรวจคืนก่อนวันงาน) · fallback = Postgres 16 + pgvector ใน WSL (ตัวแปรเดียวกัน, ตัด `?sslmode=require`)
- **node_modules:** แต่ละ worktree รัน `npm ci --prefer-offline --no-audit --no-fund` เอง (cache กลางของ npm ทำให้เร็ว) ห้าม junction/symlink `node_modules` ข้าม worktree: workspace link `@nless/shared` ชี้เข้า worktree ตัวเอง ถ้าแชร์จะไปอ่านโค้ดของ lane อื่น · ถ้า `npm ci` ล้มด้วย EPERM ใน sandbox ให้คนรันใน terminal
- **migrations ต่อ lane:** DB ของ lane รับ migration จาก branch ตัวเองได้อิสระ ถ้าไฟล์ migration ของตัวเองเปลี่ยนหลังรันแล้ว ใช้ `npm run db:reset` (DB ของ lane ตัวเองเท่านั้น)
- **OpenAI ต่อคน:** `OPENAI_API_KEY` ใน `..\nless.secrets.env` ของแต่ละเครื่อง = key ของคนนั้นเองจาก OpenAI project `app-dev` (hard limit US$30) ใช้กับทุก session ของคนนั้น · key ของ production อยู่ใน project `app-prod` (hard limit US$60) และอยู่ใน Render env เท่านั้น · tests/CI เป็น fake เสมอ · ทุก alias (chat/fast/strong) ใช้ `gpt-6.2-sol` ตามที่ทีมตัดสิน ห้ามเปลี่ยน model ใน `.env.local` เอง · เจอ `PROVIDER_BUDGET_EXHAUSTED` → โพสต์ `BLOCKED @REPLACE_LEAD_LOGIN` ทันที
- **webhook tunnel:** หนึ่งเครื่องมักมี tunnel เดียว ชี้ไป `API_PORT` ของ lane ที่กำลังทำ webhook (C2 = 3002 สำหรับ LINE *NLess Dev* และ Meta) · LINE *NLess Demo* ชี้ production เท่านั้น · แก้ `PUBLIC_BASE_URL` ใน `.env.local` ของ worktree นั้น
- **หลัง pull main:** `npm ci` (ถ้า lockfile เปลี่ยน) → `npm run db:migrate` → restart `npm run dev` (ฟีเจอร์ใหม่โหลดตอน boot) · คนรัน dev server เอง agent ไม่รัน (D14)


### หลัง SETUP READY
- C1 ทำต่อตาม [prompts/lanes/C1.md](../../prompts/lanes/C1.md): F35 → F39 → F36 (เริ่ม 15:15) ดูแล main และตอบ `NEED TO:C1` (library, core API, `model.*`, flag) · **gate 13:00 C0 เป็นคนตรวจบน production**
- คำขอ library เพิ่ม: C1 เพิ่มใน `package.json` ของ workspace ที่ถูก pin exact, PR `lane/C1/deps-<ชื่อ>`, merge แล้วโพสต์ `DONE NEED <library> <sha>` ทุก session รัน `npm ci` · ห้ามเพิ่ม AI SDK ของ provider อื่น
- คำขอแก้ core API: เพิ่มแบบ backward-compatible เท่านั้น (option ใหม่, ฟังก์ชันใหม่) ไม่เปลี่ยน signature เดิมใน `contracts.ts`

## 15. UNCONFIRMED และสิ่งที่ต้องตรวจในวันงาน
| # | ข้อ | วิธีตรวจ |
|---|---|---|
| 1 | Neon free tier: สร้าง database หลายตัวใน project เดียว และ `CREATE EXTENSION vector` ใช้ได้ผ่าน direct endpoint; ลิมิต connection พร้อมกัน | คืนก่อนวันงาน: `CREATE DATABASE nless_probe; CREATE EXTENSION vector;` (D16) · ระหว่างวัน `DB_POOL_MAX=5` และดู error `too many connections` |
| 2 | `@modelcontextprotocol/sdk` 1.32.2 ทำงานกับ zod 4.6.7 (peer dependency) | `npm ls zod` ต้องเห็นเวอร์ชันเดียวหลัง S1 · ไม่ผ่าน → โพสต์ `NEED`/แก้ pin ใน PR deps |
| 3 | `jsqr` 1.4.0 ถอดรหัส QR จากรูปสลิป (ผ่าน sharp → RGBA) | F14 (A2) ทดสอบด้วยสลิปสังเคราะห์ของตัวเอง |
| 4 | โมเดล/ราคาของ OpenAI ตามที่ `.env.example` ตั้ง | `npm run smoke:openai` (docs/openai-api.md §14) · 403/404 → แก้ `.env.example` ใน PR ถัดไป |
| 5 | Render: Postgres 17 + pgvector, disk `/var/data/uploads`, WebSocket ผ่าน proxy ต้องมี ping ทุก 25 วิ | S9 ข้อ 4 + เปิด `/ws` จาก Demo Chat · รายละเอียดใน docs/day/deployment.md |
| 6 | หน้า login ของ F02 (C3) ตรงกับ selector ใน `tests/e2e/fixtures.ts` | ทดสอบ fixture หลัง C3 merge F02; ปรับ selector ใน PR ของ C1 |
| 7 | F38 ไม่มีตัวแปร env (ค่าตั้งของ follow-up อยู่ในตารางของฟีเจอร์เอง) | ไม่ต้องตรวจ: `.env.example` ไม่มี `FOLLOW_UP_*` แล้ว |
| 8 | Codex sandbox รัน `npm ci`/`playwright install` ได้หรือไม่ | EPERM → คนรันใน terminal (D14) |
| 9 | ลิมิตอื่นของ Neon free (compute hours, storage) พอสำหรับ 9 DB ต่อโปรเจกต์ | ดู Neon console ตอน 10:00 และก่อน 13:00 |
