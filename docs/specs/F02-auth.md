# F02 auth — สมัคร เข้าสู่ระบบ ออกจากระบบ ยืนยันอีเมล รีเซ็ตรหัสผ่าน

| | |
|---|---|
| Lane / คน | **C3** / **C** · ลำดับ 3 ใน lane (F04 → F03 → F02 → F31) |
| Tier / เป้า | **P1** แต่ **เริ่มต่อจาก F03 ทันที ไม่รอ `LEAD: OPEN P1`** (ข้อยกเว้นของ C3) · เป้า: **auth = R, อีเมล = S** (sandbox mailbox จนกว่าจะมีผู้ให้บริการอีเมลจริง) |
| Timebox | 45–90 นาที |
| เริ่มเมื่อ | F03 slice 1 merge แล้ว (S1 ของ F03 ไม่ต้องรอ S2–S4) |
| พึ่ง | core: `createSession`, `destroySession`, `getUser`, `assertRateLimit`/`rateLimit`, `encryptSecret`/`decryptSecret`, `db`, `jobs`, `audit`, `config` · F03 service: `provisionAccountForUser`, `acceptInvitation`, `previewInvitation` · F04 `ensureBusinessSettings` (best effort) |
| ให้ | login จริงบน production (แทน dev login) · `queueEmail` (ให้ F03 ส่งอีเมลคำเชิญ) · หน้า `/login` ที่ Playwright fixture ใช้ · รหัสผ่านของผู้ใช้ SEED จาก env |
| ใช้ | ดู §4 |
| โฟลเดอร์ | `server/src/features/auth/` · `shared/features/auth/types.ts` · `web/src/features/auth/` |
| Web path | `/login`, `/signup`, `/verify-email`, `/forgot-password`, `/reset-password` (+ แท็บ "บัญชีของฉัน" ใน `/account` ผ่าน slot `accountTabs` ของ core) |

อ่าน: `contracts.ts` (`createSession`, `destroySession`, `getUser`, `AuthUser`, `RequestLike`/`ResponseLike`, slot `accountTabs`, `topbarActions`) · [F01-core](F01-core.md) §2 (`users`, `sessions`), §4 (auth.ts, CSRF, dev.ts, ratelimit.ts), §10.2 (fixture `ownerPage`) · [F03](F03-tenancy.md) §4 · [COOKBOOK](../COOKBOOK.md) §2, §14

## 1. เป้าหมายและ user stories

ทำไมมี: production ใช้ dev login (มี token) ตั้งแต่เปิดแอปเพื่อให้ F03/F04 ทำงานได้ แต่ dev login ไม่ใช่การพิสูจน์ตัวตนจริง F02 คือ login จริงด้วยอีเมล + รหัสผ่านที่ทำให้ **ปิด dev login บน production ได้อย่างปลอดภัย** (`DEV_LOGIN_ENABLED=false`) และทำให้กรรมการสมัครร้านใหม่เองได้

ผู้ใช้: เจ้าของร้านใหม่ · พนักงานที่ได้รับเชิญ · ผู้ใช้เดิม (SEED 5 คน) · ผู้ดูแลระบบ (platform admin ใช้เปิดกล่องจดหมายทดสอบ)

User stories:
1. ผู้ใช้ใหม่สมัครด้วยอีเมล + รหัสผ่าน + ชื่อร้าน แล้วได้ร้านแรก (ค่าเริ่มต้นครบ) และเข้าแอปทันที · สมัครซ้ำด้วยอีเมลเดิมไม่สร้าง account ที่สอง
2. ผู้ใช้ login/logout · login ผิดซ้ำถูกชะลอและล็อกชั่วคราว · หลัง logout หรือหมดอายุ cookie เดิมได้ 401
3. พนักงานที่ได้รับเชิญสมัครผ่านลิงก์คำเชิญ (อีเมลต้องตรงกับที่ถูกเชิญ) เข้าร้านเดิมโดยไม่สร้างร้านใหม่
4. ผู้ใช้ขอรีเซ็ตรหัสผ่าน ได้ลิงก์ใช้ครั้งเดียวที่หมดอายุใน 30 นาที แล้วตั้งรหัสใหม่ · ทุก session เดิมถูกยกเลิก
5. ผู้ใช้ยืนยันอีเมลผ่านลิงก์ · เปลี่ยนรหัสผ่านโดยใส่รหัสเดิม · ออกจากระบบทุกอุปกรณ์
6. ทีม (คน C) ปิด dev login บน production ได้หลัง F02 ผ่าน โดยบัญชีเดโมทั้ง 5 ยัง login ได้ด้วยรหัสผ่านจาก env

นอก scope: Google/Facebook sign-in, 2FA, magic link, ส่งอีเมลจริง (ไม่มี SMTP/ผู้ให้บริการ และไม่เพิ่ม library: `EMAIL_MODE` รองรับ `sandbox` เท่านั้น), รายการอุปกรณ์ที่ login อยู่รายตัว (มีแค่ "ออกจากระบบทุกอุปกรณ์"), ลบบัญชีผู้ใช้, บังคับยืนยันอีเมลก่อนใช้งาน

**การตัดสินใจหลัก (พร้อมเหตุผล):**
- **ไม่บังคับยืนยันอีเมลก่อนใช้งาน**: ไม่มีผู้ให้บริการอีเมล กรรมการที่สมัครเองจะติดค้างถ้าบังคับ · ยืนยันอีเมลเป็นสถานะ (`email_verified_at`) ที่แสดงและเปิดลิงก์ยืนยันได้จากกล่องจดหมายทดสอบของตัวเอง
- **hash รหัสผ่าน = `node:crypto` scrypt** (ไม่มี native build, ไม่เพิ่ม library: รายการ F01 S1 ไม่มี argon2/bcrypt)
- **กล่องจดหมายทดสอบ (sandbox mailbox) ไม่เปิดสาธารณะ**: ลิงก์รีเซ็ตรหัสผ่านสาธารณะ = ใครก็ยึดบัญชีได้ จึงเปิดให้เห็นเฉพาะ (ก) ผู้ที่ login แล้ว เห็นเฉพาะจดหมายที่ส่งถึงอีเมลตัวเอง (ข) platform admin เห็นทั้งหมด · ป้ายสถานะ **S** ทุกจุด: "อีเมลยังไม่ถูกส่งออกจริง"
- **ผู้ใช้ 1 คน = 1 account** (สอดคล้อง F03)

## 2. Data model

ตารางกลางที่ใช้: `users` (`email_normalized`, `password_hash`, `email_verified_at`, `status`, `display_name`, `locale`), `sessions` (F02 **ไม่เขียน** ตรง ๆ: ใช้ `createSession`/`destroySession` ยกเว้นยกเลิกทุก session ดู §5.8)

`server/src/features/auth/migrations/001_auth.sql`:

```sql
-- dependsOn: core
CREATE TABLE auth_tokens (                           -- verify_email และ reset_password ใช้ตารางเดียว
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('verify_email','reset_password')),
  token_hash text NOT NULL UNIQUE,                   -- SHA-256 hex ของ token ดิบ
  expires_at timestamptz NOT NULL,                   -- now() + AUTH_TOKEN_TTL_MINUTES
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_tokens_open ON auth_tokens (user_id, purpose) WHERE used_at IS NULL;

CREATE TABLE auth_login_attempts (                   -- lockout ต่ออีเมล (มีผลแม้อีเมลไม่มีอยู่จริง กัน enumeration)
  email_normalized text PRIMARY KEY,
  failed_count int NOT NULL DEFAULT 0,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE email_outbox (                          -- กล่องจดหมายทดสอบ: EMAIL_MODE=sandbox ไม่ส่งออกจริง
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email text NOT NULL,
  to_email_normalized text GENERATED ALWAYS AS (lower(btrim(to_email))) STORED,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  template text NOT NULL CHECK (template IN ('verify_email','reset_password','invitation')),
  locale text NOT NULL CHECK (locale IN ('th','en')),
  subject text NOT NULL,
  body_text text NOT NULL,                           -- ข้อความที่ไม่มีลิงก์ (ลิงก์อยู่ใน action_url_enc)
  action_url_enc text NOT NULL,                      -- encryptSecret(ลิงก์เต็มที่มี token ดิบ) ไม่เก็บ plain
  mode text NOT NULL DEFAULT 'sandbox' CHECK (mode IN ('sandbox')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL                    -- = created_at + 24 ชม. แล้ว job ลบ (§8)
);
CREATE INDEX email_outbox_to ON email_outbox (to_email_normalized, created_at DESC);

CREATE TABLE auth_seed_password_state (              -- ติดตามว่ารหัสผ่านของผู้ใช้ SEED ถูกตั้งจาก env ค่าไหน
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  fingerprint text NOT NULL,                         -- HMAC-SHA256(SESSION_SECRET, SEED_USER_PASSWORD) hex
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

รูปแบบ `users.password_hash` (สตริงเดียว): `scrypt$N=16384,r=8,p=1$<salt base64url>$<key base64url>` · salt 16 ไบต์ · key 64 ไบต์ · `null` = ยังไม่มีรหัสผ่าน (login ด้วยรหัสผ่านไม่ได้)

## 3. API endpoints

ทุก path ใต้ `/api/v1/auth` · `defineFeatureRoutes({ featureId: 'F02', slug: 'auth' })` · ทุกเส้นที่ **เปลี่ยนสถานะ** ต้องผ่าน `assertSameOriginRequest(req)` (§5.1) แม้เป็น auth `none`

| Method | Path | auth | Request | Response | Errors |
|---|---|---|---|---|---|
| GET | `/config` | none | — | `{ emailMode: 'sandbox', passwordMinLength: 10 }` | — |
| POST | `/signup` | none | `SignupBody` | `AuthResult` (201 + cookie) | VALIDATION_ERROR, POLICY_BLOCKED (`email_taken` …), PERMISSION_DENIED (`email_mismatch`), RATE_LIMITED |
| POST | `/login` | none | `LoginBody` | `AuthResult` + cookie | AUTH_REQUIRED (`invalid_credentials`), ACCOUNT_DISABLED, RATE_LIMITED |
| POST | `/logout` | user | — | `{ ok: true }` | — |
| POST | `/logout-all` | user | — | `{ ok: true, revoked: number }` | — |
| GET | `/status` | user | — | `AuthStatus` | — |
| PATCH | `/profile` | user | `ProfileBody` | `AuthStatus` | VALIDATION_ERROR |
| POST | `/email/verify` | none | `{ token }` | `{ ok: true, email: string }` | NOT_FOUND, POLICY_BLOCKED (`expired`/`used`), RATE_LIMITED |
| POST | `/email/resend` | user | — | `{ ok: true }` | POLICY_BLOCKED (`already_verified`), RATE_LIMITED |
| POST | `/password/forgot` | none | `{ email }` | `{ ok: true }` (เสมอ) | RATE_LIMITED |
| POST | `/password/reset` | none | `ResetBody` | `{ ok: true }` | NOT_FOUND, POLICY_BLOCKED (`expired`/`used`), VALIDATION_ERROR, RATE_LIMITED |
| POST | `/password/change` | user | `ChangeBody` | `{ ok: true }` + cookie ใหม่ | AUTH_REQUIRED (`wrong_current_password`), VALIDATION_ERROR, RATE_LIMITED |
| GET | `/mailbox` | user | `MailboxQuery` | `{ items: MailboxItem[]; scope: 'mine' \| 'all' }` | PERMISSION_DENIED (scope all ที่ไม่ใช่ admin) |

หมายเหตุ: core มี `POST /api/v1/session/logout` อยู่แล้ว (ใช้ได้เหมือนกัน) · `GET /api/v1/me` ของ core ยังเป็นแหล่งข้อมูล session ของเว็บ · `/status` เพิ่มเฉพาะ `emailVerified`

```ts
import { z } from 'zod';
export const Email = z.string().trim().toLowerCase().email().max(200);
export const Password = z.string().min(10).max(128);              // กฎเพิ่มเติม (blocklist) ใน validatePassword §5.2
export const SignupBody = z.object({
  email: Email, password: Password,
  displayName: z.string().trim().min(1).max(80),
  businessName: z.string().trim().min(2).max(80).optional(),       // บังคับเมื่อไม่มี inviteToken (ตรวจใน service)
  locale: z.enum(['th', 'en']).default('th'),
  inviteToken: z.string().min(40).max(64).regex(/^[A-Za-z0-9_-]+$/).optional(),
}).strict();
export const LoginBody = z.object({ email: Email, password: z.string().min(1).max(128) }).strict();   // ไม่ตรวจความยาวขั้นต่ำตอน login
export const ResetBody = z.object({ token: z.string().min(40).max(64).regex(/^[A-Za-z0-9_-]+$/), newPassword: Password }).strict();
export const ChangeBody = z.object({ currentPassword: z.string().min(1).max(128), newPassword: Password }).strict();
export const ProfileBody = z.object({ displayName: z.string().trim().min(1).max(80).optional(), locale: z.enum(['th', 'en']).optional() }).strict();
export const MailboxQuery = z.object({ scope: z.enum(['mine', 'all']).default('mine') });
```

```ts
// shared/features/auth/types.ts
export interface AuthResult { userId: string; emailVerified: boolean; next: string }   // next = '/' (ไม่เชื่อ client)
export interface AuthStatus { userId: string; email: string; displayName: string; locale: 'th' | 'en'; emailVerified: boolean; isPlatformAdmin: boolean }
export interface MailboxItem {
  id: string; to: string; template: 'verify_email' | 'reset_password' | 'invitation';
  subject: string; bodyText: string; actionUrl: string;       // ถอดรหัสแล้ว เฉพาะผู้ที่มีสิทธิ์ดู
  createdAt: string; expiresAt: string; mode: 'sandbox';
}
```

## 4. Service functions และ contracts

ไฟล์ภายใน: `service.ts` (public) · `password.ts` · `csrf.ts` · `login.ts` · `signup.ts` · `tokens.ts` · `mail.ts` · `mailbox.ts` · `seed-passwords.ts` · `sessions-port.ts` · `routes.ts` · `seed.ts` · `*.test.ts`

**Contract ที่ F02 ให้ในไฟล์ contracts.ts:** ไม่มี (`getUser`/`createSession` เป็นของ core) · F02 เป็นเจ้าของ route ใต้ `/api/v1/auth/*` และหน้า `/login` ที่ fixture ของ Playwright ใช้

### Contract additions (ภายใน lane C3 + คำขอไปที่ core)

```ts
/**
 * @owner F02 auth · C3 · consumer: F03 tenancy (invitation mail, same lane) — not for other lanes.
 * Stores a mail row in the sandbox outbox (EMAIL_MODE=sandbox: nothing leaves the server) and returns honestly
 * delivery 'email_sandbox'. Never reports 'sent'. `actionUrl` is encrypted at rest. Never throws for a missing
 * user; invalid input → VALIDATION_ERROR.
 * @fake logs `[queueEmail:fake] <template>` (no link) and returns { outboxId: '', delivery: 'email_sandbox' }.
 */
export declare function queueEmail(input: {
  to: string; userId?: string | null; template: 'verify_email' | 'reset_password' | 'invitation';
  locale: 'th' | 'en'; vars: Record<string, string>; actionUrl: string;
}): Promise<{ outboxId: string; delivery: 'email_sandbox' }>;

/**
 * NEED core (C1) — F01 · server/src/core/auth.ts. Revokes every active session row of the user (sets revoked_at) and
 * returns how many. F02 calls it on password reset/change and "log out everywhere". It is in contracts.ts and real from
 * setup (21 Nov): F02 never writes the `sessions` table itself and has no fallback UPDATE.
 */
export declare function revokeUserSessions(userId: string): Promise<number>;
```

Contract ที่ใช้ (signature ตาม contracts.ts): `createSession(userId, kind, res)` · `destroySession(req, res)` · `getUser(req)` · `assertRateLimit({ key, limit, windowSeconds })` · `rateLimit(...)` · `encryptSecret` / `decryptSecret` · `audit` · `db` · `jobs.enqueue` / `schedules` · F03 `provisionAccountForUser`, `acceptInvitation`, `previewInvitation` · F04 `ensureBusinessSettings` · **ไม่เรียก `notify`** (F31 มาทีหลังและไม่ใช่เรื่อง auth)

## 5. Algorithms

ค่าคงที่ (`config.ts` ของฟีเจอร์): `PASSWORD_MIN = 10` · `PASSWORD_MAX = 128` · `SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64, saltLen: 16, maxmem: 64 MiB }` · `AUTH_TOKEN_TTL_MINUTES` จาก env (default 30) · `LOGIN_MAX_FAILS = 5` · `LOGIN_WINDOW_MIN = 15` · `LOCK_MIN = 15` · `OUTBOX_TTL_HOURS = 24` · rate limit (key → limit/วินาที): `auth.login.ip:<ip>` 20/60 · `auth.login.email:<email>` 10/60 · `auth.signup.ip:<ip>` 10/3600 · `auth.forgot.ip:<ip>` 10/3600 · `auth.forgot.email:<email>` 3/3600 · `auth.reset.ip:<ip>` 20/3600 · `auth.verify.ip:<ip>` 30/3600 · `auth.resend:<userId>` 3/3600 · `auth.change:<userId>` 5/900

### 5.1 CSRF / login-CSRF (`csrf.ts`)

core บังคับ `X-Requested-With: nless` + Origin เฉพาะคำขอเปลี่ยนสถานะที่ **มี session cookie** แต่ login/signup/forgot/reset ไม่มี cookie จึงต้องกันเอง (login CSRF: เว็บอื่นบังคับให้ผู้ใช้ login เข้าบัญชีของผู้โจมตี):
`assertSameOriginRequest(req)`: (1) header `x-requested-with` ต้องเท่ากับ `nless` (header กำหนดเองข้าม origin ต้องผ่าน CORS preflight ซึ่งระบบไม่เปิด) (2) ถ้ามี `Origin`: ต้องเท่ากับ origin ของ `APP_BASE_URL` หรือ `PUBLIC_BASE_URL`/`WEB_ORIGIN` ที่ config ของ core ให้ (3) ไม่ผ่าน = `PERMISSION_DENIED` (403) `details.reason:'csrf'` · cookie เป็น `HttpOnly; SameSite=Lax; Secure` (production) โดย core อยู่แล้ว → ครอบคลุมสามชั้น

### 5.2 รหัสผ่าน (`password.ts`)

- `hashPassword(plain)`: `plain.normalize('NFKC')` → salt `randomBytes(16)` → `await scrypt(plain, salt, 64, { N:16384, r:8, p:1, maxmem })` (`util.promisify(crypto.scrypt)`) → `scrypt$N=16384,r=8,p=1$<salt>$<key>`
- `verifyPassword(plain, stored)`: parse พารามิเตอร์จากสตริง · คำนวณ key ใหม่ · `crypto.timingSafeEqual` (ความยาวเท่ากันเสมอ) · รูปแบบเสีย = false · `needsRehash(stored)` = พารามิเตอร์ต่างจากค่าปัจจุบัน → login สำเร็จแล้ว hash ใหม่ (ไม่ throw)
- `DUMMY_HASH`: สร้างครั้งเดียวตอน boot จากรหัสสุ่ม ใช้ verify ปลอมเมื่อไม่พบผู้ใช้ เพื่อให้เวลาตอบใกล้เคียงกัน
- `validatePassword(plain, ctx: { email, displayName })`: ยาว 10–128 · ไม่เท่ากับส่วนหน้า `@` ของอีเมล · ไม่เท่ากับอีเมลเต็ม · ไม่อยู่ใน blocklist (ตัวพิมพ์เล็ก): `1234567890`, `12345678910`, `0123456789`, `password`, `password1`, `password123`, `passw0rd123`, `qwertyuiop`, `qwerty12345`, `iloveyou123`, `letmein1234`, `admin12345`, `welcome1234`, `0000000000`, `1111111111` · ไม่มีกฎ "ต้องมีตัวพิมพ์ใหญ่/สัญลักษณ์" (ยาวดีกว่าซับซ้อน) · ไม่ผ่าน = `VALIDATION_ERROR` issues `{ path:'password', code:'too_short'|'too_long'|'common'|'same_as_email' }`

### 5.3 Login (`login.ts`)

1. `assertSameOriginRequest` · `assertRateLimit(auth.login.ip)` · `email = normalize(body.email)` · `assertRateLimit(auth.login.email)`
2. อ่าน `auth_login_attempts` ของอีเมล: `locked_until > now()` → `RATE_LIMITED` `details.retryAfterSeconds` (**แม้รหัสถูก** ไม่เผยว่าถูกหรือผิด)
3. หา `users` ตาม `email_normalized`: ไม่พบ หรือ `password_hash` เป็น null → `verifyPassword(plain, DUMMY_HASH)` (ทิ้งผล) แล้วไปขั้น 5 (นับเป็นผิด) · พบ → `verifyPassword`
4. ถูก: ถ้า `users.status='disabled'` → `ACCOUNT_DISABLED` (403) หลังรหัสถูกเท่านั้น (ไม่เผยว่าบัญชีมีอยู่เมื่อรหัสผิด) · ไม่ disabled → ลบแถว `auth_login_attempts` · ถ้า `needsRehash` UPDATE hash · ถ้ามี cookie session เดิมของคำขอ → `destroySession(req, res)` ก่อน (กัน session ค้างของผู้ใช้อื่น) · `createSession(user.id, 'password', res)` (token ใหม่ทุกครั้ง: ไม่มี session fixation) · `audit('auth.login.success', actorUserId=user.id, details {ipHash})` · คืน `{ userId, emailVerified, next:'/' }`
5. ผิด: UPSERT `auth_login_attempts`: ถ้า `window_started_at < now() - 15 นาที` เริ่มนับใหม่ (`failed_count=1`) ไม่งั้น `+1` · `failed_count >= 5` → `locked_until = now() + 15 นาที` · audit `auth.login.failed` `{ emailHash, count }` (ไม่ใส่อีเมล/รหัส) · ตอบ `AUTH_REQUIRED` (401) `details.reason:'invalid_credentials'` ข้อความเดียวกันทุกกรณี (อีเมลไม่มี/รหัสผิด/ไม่มีรหัสผ่าน)
6. ผู้ใช้ SEED ที่ยังไม่มีรหัสผ่าน (env ไม่ตั้ง) = กรณีผิดปกติเหมือนไม่มีรหัสผ่าน · `next` ฝั่งเว็บอ่านจาก query `?next=` ผ่าน `safeNext()` (ต้องขึ้นต้น `/` ไม่ขึ้นต้น `//` ไม่มี `\` หรือ `:` ก่อน `/` แรก) ไม่เชื่อค่าจาก response

### 5.4 Signup (`signup.ts`)

1. `assertSameOriginRequest` · `assertRateLimit(auth.signup.ip)` · zod · ไม่มี `inviteToken` ต้องมี `businessName` (ไม่มี = `VALIDATION_ERROR`) · `validatePassword` · `hash = await hashPassword()` (นอก transaction)
2. `db.tx`: `pg_advisory_xact_lock(hashtext('auth-email:' || email_normalized))` → มีผู้ใช้ `email_normalized` เดียวกัน = `POLICY_BLOCKED` `details.reason:'email_taken'` (ยิงซ้ำไม่สร้าง account ที่สอง)
3. INSERT `users` (`display_name`, `locale`, `password_hash`, `status='active'`, `email_verified_at` = `now()` **เฉพาะเมื่อมี inviteToken** เพราะการถือลิงก์ที่ส่งไปยังอีเมลนั้นพิสูจน์การควบคุมอีเมล แต่ **ต้องผ่านขั้น 4a** ก่อนจึงค่อยถือเป็นจริง)
4. a) มี `inviteToken`: `acceptInvitation(user.id, token, tx)` (F03 ตรวจอีเมลตรง/หมดอายุ/ร้าน active/1 account: ล้ม = throw → **rollback ทั้ง transaction รวมการสร้างผู้ใช้** ไม่มีผู้ใช้ค้าง) · b) ไม่มี: `provisionAccountForUser(user.id, { businessName, language: locale }, tx)` (สร้าง account + ร้าน + membership owner ใน transaction เดียวกัน)
5. หลัง commit: `ensureBusinessSettings(businessId)` (try/catch) · ถ้า `email_verified_at` ยัง null → สร้าง verify token + `queueEmail` (§5.5) · `createSession(user.id, 'password', res)` · audit `auth.signup` `{ viaInvite: boolean }` · คืน 201 `AuthResult`
6. ล้มกลางทางทุกจุด = rollback (บั๊กที่ห้าม port: user ไม่มีร้านแล้วเจอ 404 ตอนโหลดโปรไฟล์)

### 5.5 Token ยืนยันอีเมล / รีเซ็ตรหัสผ่าน (`tokens.ts`)

- `issueToken(userId, purpose)`: token = `randomBytes(32)` base64url (43 ตัว) · `UPDATE auth_tokens SET used_at = now() WHERE user_id=$ AND purpose=$ AND used_at IS NULL` (ใบก่อนหน้าใช้ไม่ได้) · INSERT `{ token_hash: sha256hex(token), expires_at: now() + AUTH_TOKEN_TTL_MINUTES }` · คืน token ดิบ (อยู่ในหน่วยความจำและใน `action_url_enc` เท่านั้น)
- `consumeToken(token, purpose)`: **ครั้งเดียว อะตอมมิก**: `UPDATE auth_tokens SET used_at = now() WHERE token_hash = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > now() RETURNING user_id` · ได้แถว = สำเร็จ · ไม่ได้: ค้นแถวตาม hash เพื่อบอกเหตุผล: ไม่มี = `NOT_FOUND` · `used_at` ไม่ null = `POLICY_BLOCKED` `'used'` · หมดอายุ = `POLICY_BLOCKED` `'expired'` (ความหมดอายุดูจาก `expires_at` เท่านั้น)
- **verify**: `POST /email/verify {token}` → `consumeToken` → `UPDATE users SET email_verified_at = COALESCE(email_verified_at, now())` → audit `auth.email.verify` · `POST /email/resend` (login แล้ว, `already_verified` ถ้ายืนยันแล้ว) → `issueToken` + `queueEmail` ลิงก์ `${APP_BASE_URL}/verify-email?token=<token>`
- **forgot**: `POST /password/forgot {email}`: `assertSameOriginRequest` + rate limit IP และอีเมล · **ตอบ `{ ok:true }` เหมือนกันเสมอ** (อีเมลไม่มี, ผู้ใช้ disabled, ไม่มีรหัสผ่านก็ตอบเหมือนกัน) · มีผู้ใช้ active → `issueToken('reset_password')` + `queueEmail` ลิงก์ `${APP_BASE_URL}/reset-password?token=<token>` · audit `auth.password.forgot` `{ userId }`
- **reset**: `POST /password/reset {token,newPassword}` → ตรวจรหัสใหม่ (`validatePassword` ด้วยอีเมลของเจ้าของ token) → `consumeToken` → `UPDATE users SET password_hash=$, email_verified_at = COALESCE(email_verified_at, now())` → ลบ `auth_login_attempts` ของอีเมลนั้น → `revokeAllSessions(userId)` §5.8 → audit `auth.password.reset` → **ไม่ login ให้อัตโนมัติ** (ผู้ใช้เข้าหน้า login)
- **change**: `POST /password/change` (login แล้ว): rate limit → `verifyPassword(current)` ผิด = `AUTH_REQUIRED` `'wrong_current_password'` → `validatePassword` → UPDATE hash → `revokeAllSessions` → `createSession(userId,'password',res)` (อุปกรณ์นี้ยังอยู่) → audit `auth.password.change`

### 5.6 อีเมล sandbox (`mail.ts`, `mailbox.ts`)

`queueEmail(input)`: render หัวข้อ/เนื้อหาตาราง §7 ตาม `locale` · `action_url_enc = encryptSecret(actionUrl)` · INSERT `email_outbox` (`mode:'sandbox'`, `expires_at = now() + 24h`) · log เพียง `{ template, outboxId }` (**ไม่ log ลิงก์/token/อีเมลเต็ม**) · คืน `{ outboxId, delivery:'email_sandbox' }` · ไม่มีการเชื่อมต่อออก ไม่มี library ส่งเมล
`GET /mailbox?scope=mine`: แถวที่ `to_email_normalized = อีเมลของผู้เรียก` และ `expires_at > now()` ล่าสุด 20 แถว → ถอดรหัส `action_url_enc` → คืน · `scope=all` ต้อง `ctx.user.isPlatformAdmin` (ไม่ใช่ = `PERMISSION_DENIED`) คืน 100 แถวล่าสุดทุกที่อยู่ · ไม่มี endpoint สาธารณะที่คืน action URL
ผลต่อ UX (ต้องบอกผู้ใช้ตรง ๆ): หน้า `/forgot-password` ใน sandbox แสดง Alert "ระบบยังไม่ส่งอีเมลจริง (โหมดทดสอบ) ผู้ดูแลระบบเปิดลิงก์รีเซ็ตให้ได้" · ผู้ที่ login แล้วขอยืนยันอีเมลเห็นลิงก์ในแท็บ "กล่องจดหมายทดสอบ" ของตัวเอง

### 5.7 ผู้ใช้ SEED และรหัสผ่านจาก env (`seed-passwords.ts`)

`syncSeedPasswords()` ทำงาน (1) ใน `seed.ts` `run(ctx)` (2) ตอน boot ใน `register()` แบบ fire-and-forget ใน try/catch (production อาจไม่ได้รัน `db:seed` หลัง deploy): 
1. `SEED_USER_PASSWORD` ว่างหรือสั้นกว่า 12 ตัว → log warn `seed password not set` แล้วจบ (ไม่ตั้งรหัสใด ๆ)
2. `fp = HMAC-SHA256(SESSION_SECRET, SEED_USER_PASSWORD)` hex
3. สำหรับ 5 ผู้ใช้ใน `SEED.users` (id คงที่) ที่มีอยู่ใน `users`: ถ้า `auth_seed_password_state.fingerprint` ≠ `fp` หรือยังไม่มีแถว → `UPDATE users SET password_hash = hash(SEED_USER_PASSWORD), email_verified_at = COALESCE(email_verified_at, now())` + upsert fingerprint + `revokeAllSessions` เฉพาะกรณีเปลี่ยนค่า (ไม่ใช่ครั้งแรก) · fingerprint ตรง = ไม่แตะ (ผู้ใช้ที่เปลี่ยนรหัสเองหลังตั้งค่าแล้วจึงไม่ถูกเขียนทับจนกว่า env จะเปลี่ยน)
4. ทั้ง 5 คน (owner A, staff A, owner B, staff B, platform admin) ใช้รหัสเดียวกัน **มาจาก env เท่านั้น ไม่มีใน git/log/fixture** · แนะนำให้เปลี่ยนค่าหลังงาน

### 5.8 ยกเลิก session ทั้งหมด (`sessions-port.ts`)

`revokeAllSessions(userId)`: เรียก `revokeUserSessions(userId)` ของ core (**อยู่ใน contracts.ts แล้ว** เป็นของจริงตั้งแต่ setup: F02 ไม่แตะตาราง `sessions` เอง ไม่ต้องมี fallback `UPDATE sessions` · แก้ 21 พ.ย.) · คืนจำนวนแถว · `POST /logout-all`: `revokeAllSessions` แล้ว `destroySession(req, res)` เพื่อล้าง cookie · ผลทันที: `getUser` ของ core ตรวจ `revoked_at` ทุก request

### 5.9 แทนที่ dev login อย่างปลอดภัย (ขั้นตอนของคน C บน production)

dev login มีไว้ให้ F03/F04 ทำงานในชั่วโมงแรก (`DEV_LOGIN_ENABLED`, `DEV_LOGIN_TOKEN` ตาม F01 §4) · **ห้ามปิดก่อนขั้น 4 ผ่าน** ลำดับ:
1. F02 merge และ deploy สำเร็จ (`/readyz` 200, `/api/v1/auth/config` ตอบ)
2. คน C ตั้ง `SEED_USER_PASSWORD` (สุ่ม ≥ 16 ตัว เก็บใน `..\nless.secrets.env` เป็นทั้ง `SEED_USER_PASSWORD` และ `E2E_PASSWORD`) ใน Render env แล้ว redeploy → boot `syncSeedPasswords()` ตั้ง hash ให้ 5 คน (ดู log `seed passwords synced: 5`)
3. ทดสอบ login จริงบน production ด้วยบัญชี owner A และ admin ผ่านหน้า `/login` (ไม่ใช่ dev login) แล้ว `GET /api/v1/me` คืนร้าน A · รัน `npm run e2e -- auth` ผ่าน
4. คน C ตั้ง `DEV_LOGIN_ENABLED=false` ใน Render env + redeploy · ตรวจ: `GET /api/dev/status` = 404 · `/dev-login` แสดง "ปิดใช้งานแล้ว" · login ผ่านหน้า `/login` ยังได้ · ตัว fixture `ownerPage` (ยิง dev login ได้ 404) ตกไปทางหน้า `/login` ด้วย `E2E_PASSWORD` แล้วผ่าน (`npm run e2e -- core` ผ่าน)
5. โพสต์ `DONE F02 auth merged <sha>. dev login ปิดบน production แล้ว TO:C0 TO:C1 TO:A1 TO:B1 TO:B2 TO:C2` + STATUS · แจ้งทุก lane ให้ตั้ง `E2E_PASSWORD` ใน `.env.local`
6. **ถอยกลับ**: ถ้า login ล้มหลังขั้น 4 ตั้ง `DEV_LOGIN_ENABLED=true` (token ยังอยู่) redeploy แล้วแก้ F02 (ห้ามทิ้ง production ที่เข้าไม่ได้)
ห้ามปิด dev login ช่วง 12:30–13:00 (กำลังตรวจ gate) · session ของ dev login บน production อายุ ≤ 2 ชม. จึงหมดไปเองหลังปิด

## 6. AI calls

ไม่มี AI call

## 7. UI

ใช้ UI kit ของ core: `PageHeader`, `SectionCard`, `EmptyState`, `DataTable`, `StatusChip`, `useToast`, `useApiMutation`, `useApiQuery`, `useSession`, `defineFeaturePages` · หน้า public ใช้ `layout:'public'`, `auth:'none'` · namespace i18n `auth`

| Route | layout / auth | หมายเหตุ |
|---|---|---|
| `/login` | public · none | ฟอร์ม login · อ่าน `?next=` (`safeNext`) · ลิงก์ไป `/signup`, `/forgot-password` |
| `/signup` | public · none | ฟอร์มสมัคร · อ่านคำเชิญจาก `sessionStorage('nless.invite')` ที่หน้า `/invitations/accept` (F03) เก็บไว้ (ไม่มีชื่อร้านเมื่อสมัครผ่านคำเชิญ + แสดงอีเมลที่ต้องใช้ไม่ได้ เพราะ preview คืนแบบ mask: ให้ผู้ใช้กรอกอีเมลเอง) |
| `/forgot-password` | public · none | ฟอร์มอีเมล + Alert โหมดทดสอบ |
| `/reset-password` | public · none | อ่าน `?token=` → ลบจาก URL ด้วย `history.replaceState` → ฟอร์มรหัสใหม่ + ยืนยัน |
| `/verify-email` | public · none | อ่าน `?token=` → ลบจาก URL → `POST /email/verify` อัตโนมัติ → ผลสำเร็จ/หมดอายุ/ใช้แล้ว |

**หน้า `/login` ต้องมี selector ตายตัวให้ Playwright fixture (`tests/e2e/fixtures.ts` §10.2 ของ F01):**
- ช่องอีเมล: `data-testid="login-email"` (`inputProps`) **และ** label ข้อความ `อีเมล` (อ่านได้ด้วย `getByLabel(/อีเมล|email/i)`)
- ช่องรหัสผ่าน: `data-testid="login-password"` **และ** label `รหัสผ่าน` (`getByLabel(/รหัสผ่าน|password/i)`)
- ปุ่ม: `data-testid="login-submit"` ข้อความ `เข้าสู่ระบบ` (`getByRole('button', { name: /เข้าสู่ระบบ|sign in/i })`)
- **ข้อห้าม (กัน strict-mode ของ Playwright พบหลาย element):** ปุ่มแสดง/ซ่อนรหัสผ่านใช้ `aria-label="แสดงหรือซ่อนตัวอักษร"` (ห้ามมีคำว่า `รหัสผ่าน`/`password`/`อีเมล`/`email` ใน aria-label หรือ label อื่นในหน้า) · มีปุ่มที่ชื่อเข้าข่าย `เข้าสู่ระบบ` เพียงปุ่มเดียว (หัวข้อหน้าเป็น heading ไม่ใช่ปุ่ม) · ลิงก์ "ลืมรหัสผ่าน?" เป็น `<a>` ไม่มี label ที่ซ้ำ
- ข้อความผิดพลาด `role="alert"` + `data-testid="login-error"` · เมื่อสำเร็จ: `session.refresh()` แล้ว `navigate(safeNext(next))`
- ถ้า `GET /api/dev/status` ตอบ enabled บนหน้า login: **ไม่แสดงอะไรเพิ่ม** (dev login เข้าทางหน้า `/dev-login` ของ core เท่านั้น)

**แท็บ "บัญชีของฉัน"** (slot `accountTabs`, id `auth.account`, order 10, ไม่มี permission): การ์ดโปรไฟล์ (ชื่อที่แสดง, ภาษา) · การ์ดอีเมล (สถานะยืนยัน chip + ปุ่ม "ส่งลิงก์ยืนยันอีกครั้ง") · การ์ดรหัสผ่าน (รหัสเดิม/ใหม่) · การ์ด "ออกจากระบบทุกอุปกรณ์" (`ConfirmDialog`) · การ์ด "กล่องจดหมายทดสอบ" (ป้าย **S** `StatusChip kind="feature" status="S"`, ตารางจดหมายของตัวเอง + ปุ่ม "เปิดลิงก์") และสำหรับ platform admin มีสวิตช์ "ดูทุกกล่อง" (`scope=all`)
**ชิปเตือน** (slot `topbarActions`, id `auth.verify-chip`, order 20): แสดง "ยังไม่ยืนยันอีเมล" เมื่อ `emailVerified=false` กดแล้วไป `/account` (ซ่อนเมื่อยืนยันแล้ว/ยังโหลดไม่เสร็จ)

ข้อความอีเมล (ตาราง mail):

| template | locale | subject | body_text (ลิงก์อยู่ในปุ่ม/ช่อง action ของกล่องจดหมาย ไม่ใส่ในข้อความ) |
|---|---|---|---|
| `verify_email` | th | ยืนยันอีเมลสำหรับ Endless | สวัสดี {{name}} กดลิงก์เพื่อยืนยันอีเมลนี้ ลิงก์ใช้ได้ {{minutes}} นาทีและใช้ได้ครั้งเดียว |
| `verify_email` | en | Confirm your email for Endless | Hi {{name}}, open the link to confirm this email. It works for {{minutes}} minutes and only once. |
| `reset_password` | th | ตั้งรหัสผ่านใหม่ของ Endless | มีคำขอตั้งรหัสผ่านใหม่สำหรับบัญชีนี้ กดลิงก์เพื่อตั้งรหัสใหม่ ลิงก์ใช้ได้ {{minutes}} นาทีและใช้ได้ครั้งเดียว ถ้าไม่ได้ขอ ไม่ต้องทำอะไร |
| `reset_password` | en | Reset your Endless password | A password reset was requested for this account. Open the link to choose a new password. It works for {{minutes}} minutes and only once. If you did not ask for it, ignore this email. |
| `invitation` | th | คุณได้รับเชิญเข้าร่วม {{business}} บน Endless | {{inviter}} เชิญคุณเป็นพนักงานของ {{business}} กดลิงก์เพื่อรับคำเชิญ ลิงก์ใช้ได้ถึง {{when}} และใช้ได้ครั้งเดียว |
| `invitation` | en | You are invited to {{business}} on Endless | {{inviter}} invited you to join {{business}} as staff. Open the link to accept. It works until {{when}} and only once. |

i18n (namespace `auth`):

| key | th | en |
|---|---|---|
| `login.title` | เข้าสู่ระบบ | Sign in |
| `login.email` | อีเมล | Email |
| `login.password` | รหัสผ่าน | Password |
| `login.submit` | เข้าสู่ระบบ | Sign in |
| `login.toggle` | แสดงหรือซ่อนตัวอักษร | Show or hide characters |
| `login.forgot` | ลืมรหัสผ่าน? | Forgot your password? |
| `login.noAccount` | ยังไม่มีบัญชี? สมัครใช้งาน | No account yet? Sign up |
| `login.error.invalid` | อีเมลหรือรหัสผ่านไม่ถูกต้อง | Wrong email or password |
| `login.error.locked` | ลองผิดหลายครั้ง ลองใหม่ได้ในอีก {{minutes}} นาที | Too many attempts. Try again in {{minutes}} minutes |
| `login.error.disabled` | บัญชีนี้ถูกปิดใช้งาน | This account is disabled |
| `login.error.csrf` | คำขอไม่ผ่านการตรวจสอบ ลองโหลดหน้าใหม่ | The request failed validation. Reload the page |
| `signup.title` | สมัครใช้งาน | Create your account |
| `signup.name` | ชื่อของคุณ | Your name |
| `signup.business` | ชื่อร้าน | Business name |
| `signup.email` | อีเมล | Email |
| `signup.password` | รหัสผ่าน (อย่างน้อย 10 ตัวอักษร) | Password (at least 10 characters) |
| `signup.submit` | สมัครและเริ่มใช้งาน | Sign up and start |
| `signup.haveAccount` | มีบัญชีแล้ว? เข้าสู่ระบบ | Already have an account? Sign in |
| `signup.invite` | คุณกำลังสมัครเพื่อรับคำเชิญเข้าร่วมร้าน ใช้อีเมลเดียวกับที่ได้รับเชิญ | You are signing up to accept an invitation. Use the invited email |
| `signup.error.email_taken` | อีเมลนี้มีบัญชีแล้ว ลองเข้าสู่ระบบ | This email already has an account. Try signing in |
| `signup.error.email_mismatch` | อีเมลนี้ไม่ตรงกับอีเมลที่ได้รับเชิญ | This email is not the invited email |
| `password.error.too_short` | รหัสผ่านต้องยาวอย่างน้อย 10 ตัวอักษร | Password must be at least 10 characters |
| `password.error.too_long` | รหัสผ่านยาวเกิน 128 ตัวอักษร | Password is longer than 128 characters |
| `password.error.common` | รหัสผ่านนี้เดาง่ายเกินไป | This password is too easy to guess |
| `password.error.same_as_email` | รหัสผ่านต้องไม่เหมือนอีเมล | The password must not match your email |
| `forgot.title` | ลืมรหัสผ่าน | Forgot password |
| `forgot.submit` | ส่งลิงก์ตั้งรหัสใหม่ | Send reset link |
| `forgot.done` | ถ้าอีเมลนี้มีบัญชี เราสร้างลิงก์ตั้งรหัสใหม่แล้ว | If this email has an account, a reset link has been created |
| `forgot.sandbox` | ระบบอยู่ในโหมดทดสอบอีเมล ยังไม่ส่งอีเมลจริง ผู้ดูแลระบบเปิดลิงก์รีเซ็ตให้ได้จากกล่องจดหมายทดสอบ | Email is in test mode: no real email is sent. An admin can open the reset link from the sandbox mailbox |
| `reset.title` | ตั้งรหัสผ่านใหม่ | Set a new password |
| `reset.new` | รหัสผ่านใหม่ | New password |
| `reset.submit` | บันทึกรหัสผ่านใหม่ | Save new password |
| `reset.done` | ตั้งรหัสผ่านใหม่แล้ว เข้าสู่ระบบด้วยรหัสใหม่ได้เลย | Password updated. Sign in with the new one |
| `reset.error.expired` | ลิงก์นี้หมดอายุแล้ว ขอลิงก์ใหม่ | This link has expired. Request a new one |
| `reset.error.used` | ลิงก์นี้ถูกใช้ไปแล้ว | This link was already used |
| `reset.error.notFound` | ไม่พบลิงก์นี้ | Link not found |
| `verify.title` | ยืนยันอีเมล | Confirm email |
| `verify.working` | กำลังยืนยัน… | Confirming… |
| `verify.done` | ยืนยันอีเมลเรียบร้อย | Email confirmed |
| `verify.error` | ลิงก์ยืนยันใช้ไม่ได้ (หมดอายุหรือถูกใช้แล้ว) | The link cannot be used (expired or already used) |
| `account.tab` | บัญชีของฉัน | My account |
| `account.profile` | โปรไฟล์ | Profile |
| `account.displayName` | ชื่อที่แสดง | Display name |
| `account.locale` | ภาษาของหน้าจอ | Interface language |
| `account.emailStatus` | สถานะอีเมล | Email status |
| `account.verified` | ยืนยันแล้ว | Verified |
| `account.unverified` | ยังไม่ยืนยัน | Not verified |
| `account.resend` | ส่งลิงก์ยืนยันอีกครั้ง | Send the confirmation link again |
| `account.changePassword` | เปลี่ยนรหัสผ่าน | Change password |
| `account.currentPassword` | รหัสผ่านเดิม | Current password |
| `account.newPassword` | รหัสผ่านใหม่ | New password |
| `account.passwordChanged` | เปลี่ยนรหัสผ่านแล้ว อุปกรณ์อื่นถูกออกจากระบบ | Password changed. Other devices were signed out |
| `account.error.wrong_current_password` | รหัสผ่านเดิมไม่ถูกต้อง | The current password is wrong |
| `account.logoutAll` | ออกจากระบบทุกอุปกรณ์ | Sign out everywhere |
| `account.logoutAllMessage` | ทุกอุปกรณ์รวมถึงเครื่องนี้จะต้องเข้าสู่ระบบใหม่ | Every device, including this one, must sign in again |
| `mailbox.title` | กล่องจดหมายทดสอบ | Sandbox mailbox |
| `mailbox.note` | อีเมลที่ระบบสร้างไม่ได้ถูกส่งออกจริง (โหมดทดสอบ) เปิดลิงก์จากที่นี่ได้ | Emails are not really sent (test mode). Open links from here |
| `mailbox.empty` | ยังไม่มีจดหมายถึงอีเมลของคุณ | No mail for your address yet |
| `mailbox.open` | เปิดลิงก์ | Open link |
| `mailbox.all` | ดูทุกกล่อง (ผู้ดูแลระบบ) | Show all mailboxes (admin) |
| `chip.unverified` | ยังไม่ยืนยันอีเมล | Email not confirmed |
| `common.retry` | ลองใหม่ | Retry |
| `common.passwordShow` | แสดงหรือซ่อนตัวอักษร | Show or hide characters |

## 8. Jobs, schedules, events

| รายการ | ค่า |
|---|---|
| schedule `auth.outbox-purge` | ทุก 3600 วินาที · handler (`{ slot }`): `DELETE FROM email_outbox WHERE expires_at < now()` และ `DELETE FROM auth_tokens WHERE expires_at < now() - interval '7 days'` และ `DELETE FROM auth_login_attempts WHERE updated_at < now() - interval '1 day' AND (locked_until IS NULL OR locked_until < now())` · idempotent |
| jobs อื่น | ไม่มี (ส่งอีเมล sandbox ทำใน request: เป็นแค่ INSERT) |
| Realtime | ไม่มี |
| Audit (`<slug>.<noun>.<verb>`) | `auth.signup` · `auth.login.success` · `auth.login.failed` · `auth.logout` · `auth.logout-all` · `auth.password.forgot` · `auth.password.reset` · `auth.password.change` · `auth.email.verify` · `auth.profile.update` (ใส่ `userId`, `ipHash`/`emailHash`; ไม่ใส่อีเมลเต็ม รหัสผ่าน token ลิงก์) |
| `notify` | ไม่ใช้ |

## 9. Seed และ fixtures

`server/src/features/auth/seed.ts` (`dependsOn: ['core', 'tenancy']`):
- `run(ctx)`: `syncSeedPasswords()` (§5.7) · ตั้ง `email_verified_at = COALESCE(email_verified_at, now())` ให้ผู้ใช้ SEED ทั้ง 5 · ไม่สร้างผู้ใช้ (core seed สร้างแล้ว) · idempotent
- `runDemo(ctx)`: ไม่มี · `resetDemo(ctx)`: ลบ `auth_login_attempts` ของอีเมล SEED และ `email_outbox` ทั้งหมดที่ส่งถึงอีเมล `@example.test` · **ไม่แตะรหัสผ่าน**
- ผู้ใช้ SEED เป็น `owner.a@`, `staff.a@`, `owner.b@`, `staff.b@`, `admin@example.test` (ตาม `SEED`) ทุกคนใช้ `SEED_USER_PASSWORD` · test ใน CI ตั้ง `SEED_USER_PASSWORD='test-password-123456'` ใน env ของ vitest เท่านั้น (ไม่ใช่ค่าจริง)
- fixtures ของ test: helper `signupUser(agent, overrides)` สร้างผู้ใช้อีเมล `e2e-<random>@example.test` · helper `readOutbox(email)` อ่านจากตาราง `email_outbox` + `decryptSecret` เพื่อดึงลิงก์ในเทสต์

## 10. Tests

Unit (`password.test.ts`, `tokens.test.ts`, `csrf.test.ts`):
1. hash: รูปแบบ `scrypt$N=16384,r=8,p=1$…` · hash สองครั้งของรหัสเดียวกันไม่เท่ากัน · `verifyPassword` ถูก/ผิด · รูปแบบเสียคืน false ไม่ throw · `needsRehash` ตรวจพารามิเตอร์ต่าง · รหัสไทย (NFKC) ใช้ได้
2. `validatePassword`: 9 ตัว → `too_short` · 129 → `too_long` · `password123` → `common` · เท่ากับส่วนหน้าอีเมล → `same_as_email` · `correct-horse-battery` ผ่าน
3. token: 43 ตัว base64url · hash sha256 · `consumeToken` สองครั้ง: ครั้งที่สอง `used` · หมดอายุ (`UPDATE expires_at`) → `expired` · ไม่มี → `NOT_FOUND` · สองคำขอพร้อมกัน → หนึ่งสำเร็จ
4. `safeNext`: `/chat` ผ่าน · `//evil.com`, `https://x`, `/\evil`, `javascript:` → `/`
5. `assertSameOriginRequest`: ไม่มี header → 403 · Origin ต่างโดเมน → 403 · header + Origin ตรง → ผ่าน

Route (supertest + test DB, `SEED_USER_PASSWORD` ตั้งใน env ของ test):
6. **login**: owner.a + รหัสถูก → 200 + cookie `nless_session` (HttpOnly) · `GET /api/v1/me` ด้วย cookie เห็นร้าน A เท่านั้น และ `sessionKind:'password'` · รหัสผิด → 401 `invalid_credentials` ข้อความเดียวกับอีเมลไม่มีอยู่ · ไม่ส่ง `X-Requested-With` → 403 `csrf`
7. **lockout**: ผิด 5 ครั้งติด → ครั้งที่ 6 (แม้รหัสถูก) = 429 พร้อม `retryAfterSeconds` ≈ 900 · อีเมลไม่มีอยู่ก็ล็อกเหมือนกัน · เลื่อนเวลา (`UPDATE locked_until`) แล้ว login ถูกได้และแถวถูกลบ · IP เดียวผิดเกิน 20 ครั้ง/นาที → 429
8. **logout / หมดอายุ**: logout → cookie เดิมเรียก `/me` = 401 · session ที่ `expires_at` ผ่านแล้ว = 401 · `logout-all`: login สองครั้ง (สองเอเจนต์) → `logout-all` ที่เอเจนต์หนึ่ง → ทั้งสอง cookie = 401 · session ของ user อื่นใช้แทนไม่ได้ (cookie ของ staff.a เรียก path ร้าน B ได้ 404)
9. **disabled**: `users.status='disabled'` + รหัสถูก → 403 `ACCOUNT_DISABLED` · รหัสผิด → 401 (ไม่เผย)
10. **signup**: ไม่มี invite → 201 ได้ user + account + ร้าน + membership owner + `business_settings` ค่าเริ่มต้น + verify mail 1 ใบ + cookie · ยิงซ้ำอีเมลเดิม → 422 `email_taken` และจำนวน accounts ไม่เพิ่ม · สองคำขอพร้อมกัน (`Promise.all`) → หนึ่ง 201 อีกอัน `email_taken` · รหัสอ่อน → 400 · ไม่มี businessName → 400 · บังคับให้ `provisionAccountForUser` throw → ไม่มีแถว `users` ค้าง
11. **signup ผ่านคำเชิญ**: owner A เชิญ `new-<r>@example.test` → ลิงก์ → signup ด้วย `inviteToken` + อีเมลตรง → 201 เป็นสมาชิก staff ร้าน A ตามสิทธิ์ที่เชิญ **ไม่มี account/ร้านใหม่** และ `email_verified_at` ไม่ null · อีเมลอื่น → 403 `email_mismatch` และไม่มีผู้ใช้ใหม่ · token หมดอายุ/ถูกยกเลิก/ใช้แล้ว → 422 และไม่มีผู้ใช้ใหม่ · ร้านถูกระงับ → 403 `BUSINESS_INACTIVE`
12. **verify email**: ผู้ใช้ใหม่ `email_verified_at` null · อ่านลิงก์จาก outbox (`readOutbox`) → `POST /email/verify` → ไม่ null · ใช้ซ้ำ → 422 `used` · หมดอายุ → 422 `expired` · ใบใหม่จาก `resend` ทำให้ใบเก่าใช้ไม่ได้ · ยืนยันแล้ว `resend` → 422 `already_verified`
13. **reset password**: `forgot` อีเมลมี/ไม่มี/disabled → ตอบ `{ok:true}` เหมือนกันทั้งหมด (เทียบ body) · มีแถว outbox เฉพาะผู้ใช้ active · `forgot` สองครั้งติด → ลิงก์แรกใช้ไม่ได้ · `reset` สำเร็จ → login ด้วยรหัสใหม่ได้ รหัสเก่าไม่ได้ · session เดิมทั้งหมดถูกยกเลิก (401) · token ใช้ซ้ำ 422 · หมดอายุ 422 · รหัสใหม่อ่อน 400 (token ไม่ถูกใช้: ลองใหม่ได้) · rate limit อีเมล: ครั้งที่ 4 ใน 1 ชม. = 429
14. **change password**: รหัสเดิมผิด → 401 `wrong_current_password` · ถูก → 200, cookie ใหม่ใช้ได้, cookie เก่าทุกใบ 401
15. **mailbox**: ผู้ใช้เห็นเฉพาะจดหมายที่ถึงอีเมลตัวเองและ `actionUrl` ถอดรหัสได้ · `scope=all` โดยผู้ใช้ทั่วไป → 403 · admin เห็นทุกใบ · ไม่ login → 401 · ตาราง `email_outbox` ไม่มีสตริง token ดิบ (ค้น `action_url_enc` ไม่พบ `token=`)
16. **seed passwords**: `syncSeedPasswords` ตั้ง hash ให้ 5 คน · เรียกซ้ำไม่เปลี่ยน hash · เปลี่ยน env → hash ใหม่ + session เดิมถูกยกเลิก · ผู้ใช้ที่เปลี่ยนรหัสเอง (fingerprint ตรง) ไม่ถูกเขียนทับ · env ว่าง/สั้น → ไม่ตั้งอะไร
17. **ไม่รั่ว**: log capture ระหว่าง signup/login/reset ไม่มีสตริงรหัสผ่าน/token/ลิงก์/อีเมลเต็มของผู้ใช้ทดสอบ (ใช้ pino test stream)
18. **dev login ปิดแล้วระบบยังใช้ได้**: ตั้ง `DEV_LOGIN_ENABLED=false` ใน test app → `/api/dev/login` = 404 · login ผ่าน `/api/v1/auth/login` ได้ · `/api/v1/me` ปกติ

Playwright smoke `web/src/features/auth/e2e/auth.smoke.spec.ts` (**ไม่ใช้ `ownerPage`** เพราะพิสูจน์หน้า login เอง; อ่าน `E2E_EMAIL`/`E2E_PASSWORD` ตาม fixture):
- `login: owner A เข้าด้วยหน้า /login จริง` — context ใหม่ ไม่มี cookie → `/login` → `getByTestId('login-email')` กรอก → `login-password` → `login-submit` → เห็น sidebar → `GET /api/v1/me` เห็นร้าน A เท่านั้น
- `login: รหัสผิดแสดงข้อผิดพลาดโดยไม่เผยว่าอีเมลมีจริง` — กรอกอีเมล owner A + รหัสผิด → `login-error` มีข้อความ `login.error.invalid` (ใช้รหัสผิดแค่ 1 ครั้ง: ไม่ทำให้ติด lockout)
- `logout: ออกแล้ว cookie เดิมใช้ไม่ได้` — login → เมนูผู้ใช้ → ออกจากระบบ → เห็นหน้า `/login` · `api.get('/api/v1/me')` ด้วย cookie เดิมที่เก็บไว้ = 401
- `forgot: ตอบเหมือนกันทุกอีเมล` — `/forgot-password` กรอก `e2e-<marker>@example.test` (ไม่มีจริง) → เห็น `forgot.done` และ Alert `forgot.sandbox` (ป้ายโหมดทดสอบ)
- `protected: ไม่ login แล้วเปิด /members` → ถูกพาไป `/login`
- `signup: สมัครร้านใหม่` **ข้ามเว้นแต่ตั้ง `E2E_ALLOW_SIGNUP=1`** (ตัวแปรใหม่ของ Playwright เท่านั้น; การสมัครสร้างผู้ใช้/ร้านจริงบน production ซึ่งลบไม่ได้) · เมื่อรัน: สมัคร `e2e-<marker>@example.test` + ร้าน `e2e-<marker>` → เข้าแอปได้ → เห็นชิป "ยังไม่ยืนยันอีเมล" → เปิดกล่องจดหมายทดสอบ → กดลิงก์ยืนยัน → ชิปหาย

## 11. Acceptance: R ตาม D6

- [ ] สมัคร → login → logout ได้ผ่านหน้าจริง บน production · หลัง logout/หมดอายุ cookie เดิม 401 · session ของคนอื่นใช้แทนไม่ได้ (test 6, 8)
- [ ] lockout + rate limit ทำงานจริง (test 7) · รหัสผ่านเก็บด้วย scrypt (test 1) · ไม่มีรหัสผ่าน/token/ลิงก์ใน log/audit/ตารางอย่างอ่านได้ (test 15, 17)
- [ ] reset/verify token: ครั้งเดียว หมดอายุตาม `AUTH_TOKEN_TTL_MINUTES` เก็บเป็น hash (test 3, 12, 13) · invite signup ไม่สร้างร้านใหม่ (test 11) · สมัครซ้ำไม่เกิด account ที่สอง (test 10)
- [ ] **ปิด dev login บน production สำเร็จตาม §5.9** (`/api/dev/status` = 404) และ login ด้วยหน้า `/login` + fixture `ownerPage` ผ่านด้วย `E2E_PASSWORD` · บัญชี SEED ทั้ง 5 login ได้ด้วยรหัสจาก env
- [ ] loading/empty/error state · ข้อความไทยผ่าน i18n · unit + route test เขียว · Playwright smoke ผ่านกับ production · deploy แล้ว
- **สถานะที่รายงาน: auth = R · อีเมล = S** (กล่องจดหมายทดสอบ: ไม่มีการส่งออกจริง ไม่มี delivery receipt) · ถ้าการ cutover §5.9 ยังไม่ทำ ให้ auth เป็น **S** และบอกในบอร์ดว่า dev login ยังเปิดอยู่
- ห้ามรายงานอีเมลเป็น R หรือใช้คำว่า "ส่งแล้ว" ในหน้าใด ๆ

## 12. Security และ privacy

- รหัสผ่าน: scrypt + salt ต่อผู้ใช้ · ไม่ log ไม่ audit · เทียบแบบ constant-time · บังคับยาว ≥ 10 + blocklist · เปลี่ยนรหัส/รีเซ็ต = ยกเลิกทุก session
- session: token สุ่ม 32 ไบต์ เก็บเป็น HMAC ใน DB (โดย core) · cookie HttpOnly + SameSite=Lax + Secure · token ใหม่ทุก login (ไม่มี fixation) · logout ยกเลิกแถว session จริง
- CSRF: SameSite=Lax + `X-Requested-With: nless` + ตรวจ Origin บนทุกเส้นเปลี่ยนสถานะ รวม login/signup/forgot/reset ที่ไม่มี cookie (login CSRF)
- anti-enumeration: login ตอบข้อความเดียวและเวลาใกล้เคียงกัน (verify กับ `DUMMY_HASH`) · forgot ตอบเหมือนกันทุกกรณี · lockout นับแม้อีเมลไม่มีอยู่ · **ข้อยกเว้นที่ยอมรับ:** signup บอก `email_taken` (UX) และ lock ทำให้ผู้โจมตีล็อกอีเมลคนอื่น 15 นาทีได้ (ยอมรับเพราะระบบเดโม; มี rate limit ต่อ IP)
- token ยืนยัน/รีเซ็ต/คำเชิญ: เก็บ SHA-256, หมดอายุตาม `expires_at`, ใช้ครั้งเดียวแบบอะตอมมิก, ลิงก์อยู่ใน DB เฉพาะแบบเข้ารหัส (`encryptSecret`) และถูกลบใน 24 ชม. · ไม่มีเส้นสาธารณะที่คืนลิงก์ · ลบ token ออกจาก URL ด้วย `history.replaceState`
- กล่องจดหมายทดสอบ: ดูได้เฉพาะเจ้าของอีเมลที่ login แล้วหรือ platform admin (สิทธิ์ admin ไม่ใช่ key ของร้าน) · ติดป้าย S
- ผู้ใช้ SEED: รหัสผ่านจาก env เท่านั้น (ไม่ใน git, fixture, log, โพสต์บอร์ด) · ค่าเดียวใช้ 5 บัญชี (ความเสี่ยงที่ยอมรับสำหรับ demo; เปลี่ยนหลังงาน)
- ไม่มี platform-admin feature: `isPlatformAdmin` ใช้เฉพาะ `scope=all` ของกล่องจดหมายทดสอบและเครื่องมือ ops ของ F35
- PII: อีเมล/ชื่อ (ไม่เก็บเบอร์/ที่อยู่ที่นี่) · audit เก็บ hash ของอีเมลที่ล้มเหลว ไม่เก็บอีเมลเต็ม · `userAgent` ไม่ถูกเก็บโดย F02

## 13. Edge cases

| กรณี | ผลที่ต้องได้ |
|---|---|
| login ซ้ำขณะมี session อยู่แล้ว | session เดิมถูกยกเลิก สร้างใหม่ให้บัญชีที่ login |
| อีเมลตัวพิมพ์ต่าง/ช่องว่างหัวท้าย (`Owner.A@Example.Test `) | normalize (`lower(btrim)`) → ตรงบัญชีเดียวกัน |
| สมัครด้วยอีเมลที่ถูกเชิญแต่ไม่ใส่ `inviteToken` | สร้างร้านใหม่ตามปกติ (คำเชิญยัง pending ผู้ใช้รับได้ภายหลังผ่าน login + `/invitations/accept` แต่ติดกฎ 1 account → `user_in_other_account`: UI แนะนำให้สมัครผ่านลิงก์คำเชิญ) |
| ผู้ใช้เปิดลิงก์รีเซ็ตสองแท็บ | แท็บแรกที่ส่งสำเร็จใช้ token · แท็บที่สอง `used` |
| รีเซ็ตรหัสแล้ว session ของแท็บอื่นยังเปิดอยู่ | request ถัดไป 401 → เว็บพาไป `/login` (core) |
| ผู้ใช้ SEED ที่ `password_hash` ว่างและ `SEED_USER_PASSWORD` ไม่ตั้ง | login ไม่ได้ (ข้อความเดียวกับรหัสผิด) · dev login ยังใช้ได้ · cutover §5.9 ห้ามทำก่อนตั้ง env |
| Render restart ระหว่าง lockout | ข้อมูลอยู่ใน DB: lock ยังอยู่ (rate limit ในหน่วยความจำของ core หายได้ แต่ lockout ต่ออีเมลไม่หาย) |
| ผู้ใช้ปิดแท็บก่อนลิงก์ verify ถูกใช้ | กล่องจดหมายทดสอบยังมีลิงก์ 24 ชม. หรือกด "ส่งอีกครั้ง" |
| คำสั่ง `?next=` เป็น URL ภายนอก | `safeNext` คืน `/` |
| `SESSION_SECRET` เปลี่ยน | fingerprint ของ seed password เปลี่ยน → sync ใหม่ + session เดิมใช้ไม่ได้ (ทุกคน login ใหม่) |
| `EMAIL_MODE` ตั้งเป็นค่าอื่นที่ไม่ใช่ `sandbox` | log warn และทำงานแบบ sandbox (ไม่มี provider) · `/auth/config` ยังคืน `emailMode:'sandbox'` |

## 14. Build order (slices)

| Slice | เวลา | ทำอะไร | merge เมื่อ |
|---|---|---|---|
| **S1 · password + login/logout** | ≤ 30 นาที | migration `001` (ทุกตาราง) · `password.ts`, `csrf.ts`, `login.ts` (+lockout/rate limit), `POST /login`, `/logout`, `/logout-all`, `/status`, `/config` · `sessions-port.ts` · `seed-passwords.ts` + boot sync + `seed.ts` · หน้า `/login` (selector ครบตาม §7) · test 1, 4–9, 16, 18 | CI เขียว **และ** deploy แล้ว login ผ่านหน้า `/login` กับ SEED (ยังไม่ปิด dev login) |
| S2 · signup + invite | ≤ 25 นาที | `signup.ts` (เรียก F03), `POST /signup`, หน้า `/signup`, `queueEmail` (`mail.ts`) + verify token, `POST /email/verify`, `/email/resend`, หน้า `/verify-email` · test 10–12 | slice ผ่าน test |
| S3 · reset/change + mailbox | ≤ 25 นาที | `forgot`/`reset`/`change`, หน้า `/forgot-password` `/reset-password`, `GET /mailbox`, แท็บ `accountTabs` + ชิป `topbarActions`, schedule `auth.outbox-purge`, `PATCH /profile` · test 13–15, 17 | slice ผ่าน test |
| **S4 · cutover + smoke** | ≤ 20 นาที | ทำตาม §5.9 ขั้น 2–5 ร่วมกับคน C (ตั้ง env, ทดสอบ, ปิด dev login, โพสต์ DONE) · Playwright smoke รันกับ production · แก้ `invitation-mail.ts` ของ F03 ให้เรียก `queueEmail` (lane เดียวกัน: `deliverInvitation` คืน `'email_sandbox'`) แล้วรัน test ของ F03 ซ้ำ · EVIDENCE.md (auth R, email S, วันเวลาที่ปิด dev login) | smoke ผ่าน + `/api/dev/status` = 404 |

หมายเหตุ: S1 เป็นส่วนที่ cutover รออยู่ จึง merge ให้เร็วที่สุดเมื่อ F03 slice 1 เสร็จ · หลัง S1 ใครต้องการ login จริงบน production ก็ใช้ได้แล้ว แม้ S2–S3 ยังไม่เสร็จ · ห้ามเริ่ม cutover ในช่วง 12:30–13:00

## 15. UNCONFIRMED และสิ่งที่ต้องตรวจในวันงาน

| ข้อ | วิธีตรวจ |
|---|---|
| (ปิดแล้ว 21 พ.ย.) core export `revokeUserSessions` | อยู่ใน contracts.ts (`server/src/core/auth.ts`, real ตั้งแต่ setup) · ถ้า `rg revokeUserSessions server/src/core` ไม่เจอตอน S1 = setup ขาด: โพสต์ `NEED TO:C1` ไม่เขียน `UPDATE sessions` เอง |
| `createSession` ตั้ง cookie ตามที่ F02 ต้องการเมื่อเรียกใน handler ของ route `auth:'none'` (`res` ใช้ได้) | test 6 ตรวจ `set-cookie` ใน response · ถ้า `RouteContext` ไม่ให้ `res` ตรง ๆ ให้ถาม C1 ว่าเข้าถึง `ResponseLike` ของ route อย่างไร (`ctx.res`?) ก่อนเขียน S1 (contracts.ts `RouteContext` ไม่มี `res` ณ ตอนเขียนสเปกนี้: **ต้องตรวจเป็นอย่างแรก**; ถ้าไม่มี โพสต์ `CHANGE TO:C1` ขอ `ctx.res` หรือ `ctx.setSession(userId, kind)`) |
| `ctx.req.ip` มีค่าถูกต้องหลัง Render proxy (`trust proxy` ตั้งแล้วตาม F01) สำหรับ rate limit รายไอพี | ดู log ของ request บน production หรือยิง `/api/v1/auth/config` สองครั้งดู key ใน test hook |
| Playwright `getByLabel(/รหัสผ่าน|password/i)` พบ element เดียวบนหน้า `/login` จริง | รัน `npm run e2e -- core` หลังเปลี่ยนหน้า login · พบหลาย element = แก้ label/aria ตาม §7 |
| `Intl`/Node `crypto.scrypt` ที่ N=16384 ใช้ CPU/เวลาบน Render instance ที่เล็กที่สุด | วัด `hashPassword` ตอน S1 (เป้า < 150 ms) · ถ้าช้ากว่า 300 ms ลด N เป็น 8192 และอัปเดตค่าใน `SCRYPT` (`needsRehash` จะย้ายผู้ใช้เดิมให้เอง) |
| `FEATURES` webPaths ของ F02 ไม่มีหน้า "กล่องจดหมายทดสอบ" สาธารณะ | ออกแบบเป็นแท็บใน `/account` (slot `accountTabs` ของ core) จึงไม่ต้องเพิ่ม path · ถ้า slot `accountTabs`/`topbarActions` ยังไม่ถูกวาดโดย core (F01 §13 ข้อ 7) ให้รายงานว่ากล่องจดหมายทดสอบเป็น A และให้ admin อ่านผ่าน `GET /api/v1/auth/mailbox?scope=all` ด้วย curl ชั่วคราว |
| ตัวแปร env ใหม่ `E2E_ALLOW_SIGNUP` | ใช้เฉพาะ Playwright (ไม่เข้า config ของ server) · ถ้า C1 ไม่ต้องการเพิ่มใน `.env.example` ก็อ่านจาก `process.env` ตรงในสเปก |
| `GET /api/v1/_meta/routes` แสดงเส้น auth ทั้งหมด (ใช้ใน isolation test ของ F03) | เส้น `auth: 'none'` ต้องถูกข้ามโดย sweep (ไม่มี `:businessId`) |
