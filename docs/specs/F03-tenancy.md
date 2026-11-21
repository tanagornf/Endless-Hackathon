# F03 tenancy — บัญชี ร้าน สมาชิก คำเชิญ และสิทธิ์

| | |
|---|---|
| Lane / คน | **C3** / **C** · ลำดับ 2 ใน lane (F04 → F03 → F02 → F31) |
| Tier / เป้า | **P0** · เป้า **R** · อยู่บน golden path (gate 13:00 ขั้น 1: owner A เห็นเฉพาะร้าน A) |
| Timebox | 45–90 นาที · **slice 1 (สมาชิก + สิทธิ์ + isolation test) merge ก่อน 12:45** |
| เริ่มเมื่อ | หลัง F04 slice 1 merge (ใช้ dev login ของ core จน F02 เสร็จ) |
| พึ่ง | core: `getUser`, `getBusiness`, `requirePermission`, `db`, `audit`, `publish`, `assertRateLimit`, `defineFeatureRoutes` · ตารางกลาง `users`, `accounts`, `businesses`, `memberships`, `seed_aliases` (F03 เป็นผู้เขียนแถวของ `accounts` `businesses` `memberships`: INSERT/UPDATE เท่านั้น ไม่ ALTER) · F04 `ensureBusinessSettings` (Contract addition ใน [F04](F04-business-settings.md) §4 ใช้ fake จนกว่า F04 จะ merge) · F31 `notify` (type `invitation`, ใช้ fake ได้) |
| ให้ | ไม่มี contract ข้าม lane ใน contracts.ts: `getBusiness()`/`requirePermission()` ของ core อ่านตาราง `memberships` ที่ F03 เขียนทุก request · service ภายใน (ให้ F02 เรียก): `provisionAccountForUser`, `previewInvitation`, `acceptInvitation`, `declineInvitation` · เครื่องมือทดสอบ isolation ของทุก lane (§10) |
| ใช้ | ดู §4 |
| โฟลเดอร์ | `server/src/features/tenancy/` · `shared/features/tenancy/types.ts` · `web/src/features/tenancy/` |
| Web path | `/members`, `/invitations` (รวม `/invitations/accept`), `/businesses`, `/onboarding` |

อ่าน: `contracts.ts` (`PERMISSIONS`, `STAFF_DEFAULT_PERMISSIONS`, `MembershipRole`, `AuthScope`, `BusinessContext`, `getBusiness`, `requirePermission`, `RealtimeEvent`) · [F01-core](F01-core.md) §2 (`accounts`, `businesses`, `memberships`), §4 (auth.ts, dev.ts) · [F04](F04-business-settings.md) §4 · [COOKBOOK](../COOKBOOK.md) §2, §4, §5, §9

## 1. เป้าหมายและ user stories

ทำไมมี: ระบบเป็นหลายร้านใน instance เดียว ความปลอดภัยทั้งระบบขึ้นกับสองข้อ: (1) ทุก request ผูกกับ **membership ที่ active** และ (2) ผู้ใช้ร้าน A อ่าน/เขียนข้อมูลร้าน B ไม่ได้เลย (404 ไม่เผยว่ามีอยู่) core ตรวจสองข้อนี้ทุก request ([contracts.ts](../competition-plan/templates/contracts.ts) `getBusiness`) แต่แถวที่ core อ่านถูกเขียนโดย F03: การสร้างร้าน, การเชิญ, การให้/ถอดสิทธิ์ ฟีเจอร์นี้จึงต้องถูกและมีบททดสอบ isolation ที่ lane อื่นเอาไปรันซ้ำได้

ผู้ใช้: เจ้าของร้าน (จัดการสมาชิก/คำเชิญ/ร้านในบัญชี) · พนักงานที่ได้รับเชิญ · ผู้ใช้ใหม่ที่เพิ่งสมัคร (onboarding)

User stories:
1. เจ้าของเชิญพนักงานด้วยอีเมล เลือกชุดสิทธิ์ (หรือกำหนดรายข้อ) แล้วได้ลิงก์คำเชิญที่หมดอายุใน `INVITATION_TTL_HOURS` (72 ชม.) ใช้ได้ครั้งเดียว · พนักงานเปิดลิงก์ สมัคร/login แล้วเข้าร้านได้ตามสิทธิ์
2. เจ้าของแก้สิทธิ์พนักงานรายคนในหน้าเดียว เห็นข้อที่ล็อก (`never`) แบบกดไม่ได้ · ถอดสิทธิ์ (revoke) แล้วพนักงานคนนั้นเข้าร้านไม่ได้ **ตั้งแต่ request ถัดไป** · คืนสิทธิ์ภายหลังได้โดยไม่ต้องเชิญใหม่
3. ผู้ใช้ที่มีหลายร้านสลับร้านจาก business switcher (core) แล้วทุกหน้าใช้ร้านที่เลือก · เจ้าของสร้างร้านเพิ่มใน account เดียวกัน (ไม่จำกัดจำนวน) และลบร้านที่ไม่ใช้ได้
4. ผู้ใช้ใหม่ที่สมัครแล้วได้ร้านแรกพร้อมค่าเริ่มต้น และเห็นหน้า onboarding ที่พาไปทำ 5 ขั้นแรก
5. ผู้ใช้ร้าน A พยายามเปิด/แก้ข้อมูลร้าน B ไม่ได้ทุกเส้นทาง (404) · พนักงานที่ไม่มีสิทธิ์ได้ 403
6. เจ้าของหนึ่งคนถอดตัวเอง/ลดตัวเองจนร้านไม่มีเจ้าของไม่ได้

นอก scope: การย้ายความเป็นเจ้าของ account, ปิด/เปิดบัญชีผู้ใช้ (`users.status` เป็นของ ops/F02), การระงับร้านโดยแพลตฟอร์ม (ไม่มี platform admin feature), SSO/Google, เชิญเป็น `owner` ตั้งต้น (เชิญได้เฉพาะ `staff` แล้วเลื่อนเป็น owner ภายหลัง), เชิญหลายร้านในลิงก์เดียว, จำกัดจำนวนร้าน/สมาชิก (ไม่มีแผนหรือโควตา)

## 2. Data model

ตารางกลางที่ใช้ (อยู่ใน `001_core.sql` ห้าม ALTER): `users`, `accounts` (`owner_user_id`, `status`), `businesses` (`account_id`, `status`, `timezone`, `language`, `version`), `memberships` (`role` owner/staff, `permissions text[]`, `status` active/revoked, `UNIQUE (business_id, user_id)`), `seed_aliases`

`server/src/features/tenancy/migrations/001_tenancy.sql`:

```sql
-- dependsOn: core
CREATE TABLE invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (char_length(email) <= 200),
  email_normalized text GENERATED ALWAYS AS (lower(btrim(email))) STORED,
  role text NOT NULL DEFAULT 'staff' CHECK (role = 'staff'),          -- เชิญเป็น staff เท่านั้น
  permissions text[] NOT NULL DEFAULT '{}',                           -- ผ่าน validatePermissionKeys ก่อนเขียนเสมอ
  token_hash text NOT NULL UNIQUE,                                    -- SHA-256 (hex) ของ token ดิบ ไม่เก็บ token ดิบ
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','revoked','declined')),
  invited_by uuid REFERENCES users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  accepted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- หนึ่งร้านมีคำเชิญ pending ได้หนึ่งใบต่ออีเมล (ใบที่หมดอายุแล้วถูกเปลี่ยนเป็น revoked ก่อนสร้างใบใหม่ใน transaction เดียวกัน)
CREATE UNIQUE INDEX invitations_one_pending ON invitations (business_id, email_normalized) WHERE status = 'pending';
CREATE INDEX invitations_by_business ON invitations (business_id, created_at DESC);
CREATE INDEX invitations_by_email ON invitations (email_normalized) WHERE status = 'pending';
```

กฎ:
- สถานะ `expired` **ไม่เก็บ** คำนวณจาก `status = 'pending' AND expires_at <= now()` (ความหมดอายุดูจาก `expires_at` ไม่เชื่อคอลัมน์ status)
- token ดิบ = 32 ไบต์สุ่ม (`crypto.randomBytes(32)`) base64url; DB เก็บ `sha256(token)` hex เท่านั้น · ลิงก์ = `${APP_BASE_URL}/invitations/accept?token=<token>` · token ดิบคืนให้ผู้เชิญเฉพาะตอนสร้าง/ส่งซ้ำ (ส่งเมล์ผ่าน F02 เมื่อมี)
- ทุกการเปลี่ยน `memberships` ทำใน transaction ภายใต้ `pg_advisory_xact_lock(hashtext('tenancy:' || business_id))` เพื่อให้กฎ "เหลือ owner อย่างน้อยหนึ่งคน" ไม่ชนกันเมื่อมีสองคนกดพร้อมกัน
- ไม่มีตารางเพิ่มสำหรับ account/ร้าน/สมาชิก: ใช้ตารางกลางทั้งหมด

โมเดลสิทธิ์ (ไม่มีตารางเพิ่ม · ตรงกับ contracts.ts):
| role | สิทธิ์ที่มีผลจริง | เก็บใน |
|---|---|---|
| `owner` | **ทุก key** ใน `PERMISSIONS` (ไม่อ่าน array) | `memberships.permissions` = `'{}'` เสมอ (F03 บังคับตอนเขียน) |
| `staff` | **เท่ากับ** `memberships.permissions` เป๊ะ · ไม่มี key = ไม่มีสิทธิ์ (absent = denied) · key ที่ไม่รู้จักถูกทิ้งตอนอ่าน (fail closed) | `memberships.permissions` |
| staff + key `never` (`account.members`, `account.businesses`) | **ห้ามมี** · F03 ปฏิเสธตอนบันทึก | — |
| platform admin | ไม่ได้ key ของร้านใด ๆ ตามอัตโนมัติ (ต้องมี membership จริงของร้านนั้น) | `users.is_platform_admin` (ไม่เกี่ยว F03) |

## 3. API endpoints

ทุก path ใต้ `/api/v1` · `defineFeatureRoutes({ featureId: 'F03', slug: 'tenancy' })` · ฝั่ง `business`: core ทำ `getBusiness` + permission ให้แล้วก่อนถึง handler

| Method | Path | auth | permission | Request | Response | Errors |
|---|---|---|---|---|---|---|
| GET | `/businesses/:businessId/members` | business | `account.members` | — | `{ items: MemberRow[] }` | — |
| PUT | `/businesses/:businessId/members/:userId/permissions` | business | `account.members` | `SetPermissionsBody` | `MemberRow` | VALIDATION_ERROR, NOT_FOUND, POLICY_BLOCKED |
| PUT | `/businesses/:businessId/members/:userId/role` | business | `account.members` | `SetRoleBody` | `MemberRow` | VALIDATION_ERROR, NOT_FOUND, POLICY_BLOCKED |
| POST | `/businesses/:businessId/members/:userId/revoke` | business | `account.members` | — | `MemberRow` | NOT_FOUND, POLICY_BLOCKED |
| POST | `/businesses/:businessId/members/:userId/restore` | business | `account.members` | — | `MemberRow` | NOT_FOUND, POLICY_BLOCKED |
| GET | `/businesses/:businessId/invitations` | business | `account.members` | `InvitationListQuery` | `{ items: InvitationRow[] }` | — |
| POST | `/businesses/:businessId/invitations` | business | `account.members` | `CreateInvitationBody` | `InvitationCreated` (201) | VALIDATION_ERROR, POLICY_BLOCKED, RATE_LIMITED |
| POST | `/businesses/:businessId/invitations/:invitationId/revoke` | business | `account.members` | — | `InvitationRow` | NOT_FOUND, POLICY_BLOCKED |
| POST | `/businesses/:businessId/invitations/:invitationId/resend` | business | `account.members` | — | `InvitationCreated` | NOT_FOUND, POLICY_BLOCKED, RATE_LIMITED |
| GET | `/invitations/preview` | none | — | `{ token }` (query) | `InvitationPreview` | NOT_FOUND, POLICY_BLOCKED, RATE_LIMITED |
| POST | `/invitations/accept` | user | — | `{ token }` | `{ businessId: string }` | NOT_FOUND, PERMISSION_DENIED, POLICY_BLOCKED, BUSINESS_INACTIVE, RATE_LIMITED |
| POST | `/invitations/decline` | none | — | `{ token }` | `{ ok: true }` | NOT_FOUND, POLICY_BLOCKED, RATE_LIMITED |
| GET | `/businesses` | user | — | — | `{ items: MyBusinessRow[] }` | — |
| POST | `/businesses` | user | — (ต้องเป็นเจ้าของ account) | `CreateBusinessBody` | `MyBusinessRow` (201) | VALIDATION_ERROR, PERMISSION_DENIED, POLICY_BLOCKED |
| DELETE | `/businesses/:businessId` | business | `account.businesses` | `{ confirmName }` (query) | no_content | VALIDATION_ERROR, POLICY_BLOCKED |

หมายเหตุ: `GET /businesses/:businessId` และ `GET /me` เป็นของ core ไม่ซ้ำที่นี่ · เส้น `none` ต้องมี header `X-Requested-With: nless` เช่นเดียวกับที่ web api client ส่ง (core บังคับ CSRF เมื่อมี session cookie; เส้น decline/preview ไม่ทำอะไรที่เปลี่ยนสถานะผู้ใช้อื่น และ rate limit ตาม IP) · `POST /invitations/accept` ต้อง login ด้วย session (kind ใดก็ได้) · การจำกัดจำนวน: preview/decline 30 ครั้ง/นาที/IP, accept 20 ครั้ง/นาที/ผู้ใช้, สร้าง/ส่งซ้ำคำเชิญ 30 ครั้ง/ชั่วโมง/ร้าน ด้วย `assertRateLimit`

```ts
import { z } from 'zod';
import { PERMISSIONS, STAFF_DEFAULT_PERMISSIONS } from '@nless/shared/core';
const PermissionKeyZ = z.string().max(64);                       // ตรวจจริงใน validatePermissionKeys (ต้องรายงานรายการที่ผิดทั้งหมด)
export const SetPermissionsBody = z.object({ permissions: z.array(PermissionKeyZ).max(40) }).strict();
export const SetRoleBody = z.object({
  role: z.enum(['owner', 'staff']),
  permissions: z.array(PermissionKeyZ).max(40).optional(),       // ใช้เมื่อ role = staff (ไม่ส่ง = STAFF_DEFAULT_PERMISSIONS)
}).strict();
export const CreateInvitationBody = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  permissions: z.array(PermissionKeyZ).max(40).optional(),       // ไม่ส่ง = STAFF_DEFAULT_PERMISSIONS
}).strict();
export const InvitationListQuery = z.object({ status: z.enum(['pending', 'accepted', 'revoked', 'declined', 'expired']).optional() });
export const TokenBody = z.object({ token: z.string().min(40).max(64).regex(/^[A-Za-z0-9_-]+$/) }).strict();   // 32 ไบต์ base64url = 43 ตัว
export const CreateBusinessBody = z.object({
  name: z.string().trim().min(2).max(80),
  timezone: z.string().min(1).max(64).default('Asia/Bangkok'),
  language: z.enum(['th', 'en']).default('th'),
}).strict();
export const DeleteBusinessQuery = z.object({ confirmName: z.string().min(1).max(80) });
```

```ts
// shared/features/tenancy/types.ts
import type { PermissionKey, MembershipRole } from '@nless/shared/core';
export interface MemberRow {
  userId: string; email: string; displayName: string;
  role: MembershipRole; status: 'active' | 'revoked';
  permissions: PermissionKey[];            // permission ที่มีผลจริง: owner = ทุก key (คำนวณ ไม่ใช่ค่าใน DB)
  isAccountOwner: boolean;                 // = accounts.owner_user_id ของร้านนี้ (ลด/ถอดไม่ได้)
  isSelf: boolean;
  lastSeenAt: string | null;               // max(sessions.last_seen_at)
  createdAt: string;
}
export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'declined' | 'expired';
export interface InvitationRow {
  id: string; email: string; status: InvitationStatus; permissions: PermissionKey[];
  expiresAt: string; createdAt: string; invitedByName: string | null; acceptedAt: string | null;
}
export interface InvitationCreated {
  invitation: InvitationRow;
  link: string;                            // มี token ดิบ แสดงครั้งนี้ครั้งเดียว (ต้องมี account.members)
  delivery: 'link_only' | 'email_sandbox' | 'email_sent';   // 'link_only' จนกว่า F02 จะต่อเมล (§5.7)
}
export interface InvitationPreview {
  businessName: string; emailMasked: string;     // 'ab***@example.test'
  role: 'staff'; expiresAt: string; permissionsCount: number;
}
export interface MyBusinessRow {
  businessId: string; name: string; status: 'active' | 'suspended' | 'deleted';
  role: MembershipRole; isCurrentAccount: boolean;
}
export interface PermissionPreset { id: 'viewer' | 'chat_team' | 'manager'; keys: PermissionKey[] }
```

## 4. Service functions และ contracts

ไฟล์ภายใน: `service.ts` (public: ใช้โดย F02) · `permissions.ts` (`STAFF_ASSIGNABLE`, `validatePermissionKeys`, `PRESETS`, `effectivePermissions`) · `members.ts` · `invitations.ts` · `invitation-mail.ts` · `businesses.ts` · `tokens.ts` · `repo.ts` · `routes.ts` · `seed.ts` · `*.test.ts`

**ไม่มี contract ข้าม lane ที่ F03 ต้องจัดหาใน contracts.ts** (`getBusiness`, `requirePermission`, `createSession` เป็นของ core) · ไม่มี Contract additions ข้าม lane · F11/F31 อ่าน `memberships` ตรงตามที่ spec ของเขากำหนด (ตารางกลาง)

service ภายในที่ F02 เรียก (ผ่าน `server/src/features/tenancy/service.ts`):

```ts
// ตัวเลือก ex: ถ้ามี ใช้ transaction ของผู้เรียก (F02 signup), ถ้าไม่มี เปิด db.tx เอง
export declare function provisionAccountForUser(
  userId: string,
  input: { businessName: string; timezone?: string; language?: 'th' | 'en' },
  ex?: DbExecutor,
): Promise<{ accountId: string; businessId: string; created: boolean }>;
export declare function previewInvitation(token: string): Promise<InvitationPreview>;
export declare function acceptInvitation(userId: string, token: string, ex?: DbExecutor): Promise<{ businessId: string }>;
export declare function declineInvitation(token: string): Promise<void>;
export declare function validatePermissionKeys(keys: readonly string[]): PermissionKey[];   // throws VALIDATION_ERROR
```

พฤติกรรม:
- `provisionAccountForUser`: **ปลอดภัยเมื่อรันซ้ำ**: advisory xact lock `tenancy-user:<userId>`; ถ้าผู้ใช้เป็น `owner_user_id` ของ account อยู่แล้ว → คืน account เดิม + ร้านแรกที่ active (`created:false`) ไม่สร้างซ้ำ · มิฉะนั้น INSERT `accounts` (name = ชื่อร้าน), `businesses` (status active), `memberships` (role owner, permissions `{}`) ใน transaction เดียว ล้มกลางทาง rollback ทั้งหมด (ไม่มี user ที่ไม่มีร้านค้างอยู่) · ชื่อร้านตรวจ 2–80 ตัว · ผู้ใช้ที่เป็นสมาชิก staff ของ account อื่นอยู่ → `POLICY_BLOCKED` (`details.reason:'already_member'`)
- `acceptInvitation` / `previewInvitation` / `declineInvitation`: ดู §5.4

Contract ที่ใช้ (signature ตาม contracts.ts): `getBusiness`/`requirePermission` (ผ่าน route options), `createSession` (F02 เท่านั้น ไม่ใช่ F03) · F04 `ensureBusinessSettings(businessId)` · F31 `notify({ businessId, to:{role:'owners'}, type:'invitation', title, … })` (ล้ม = log ไม่ throw) · core `db`, `audit`, `publish`, `assertRateLimit`

## 5. Algorithms

ค่าคงที่ (`config.ts` ของฟีเจอร์): `INVITATION_TTL_HOURS` จาก env (default 72) · `TOKEN_BYTES = 32` · `MAX_PENDING_INVITES_PER_BUSINESS = 100` · `INVITE_RATE = 30/ชม./ร้าน` · `STAFF_ASSIGNABLE` = ทุก key ใน `PERMISSIONS` ที่ `staff !== 'never'` (23 key)

### 5.1 `validatePermissionKeys(keys)`

1. dedupe แล้วเทียบกับ `PERMISSIONS`: key ที่ไม่มีในนั้น → `unknown[]` · key ที่ `staff === 'never'` → `forbidden[]`
2. มี `unknown` หรือ `forbidden` → `AppError('VALIDATION_ERROR', …, { details: { issues: [{ path:'permissions', code:'unknown_permission'|'forbidden_permission', keys:[…] }] } })` (**ไม่ทิ้งเงียบ**)
3. คืนรายการเรียงตามลำดับใน `PERMISSIONS`
4. `PRESETS`: `viewer` = `chat.read, orders.read, product.read, appointments.read, business.read` · `chat_team` = `STAFF_DEFAULT_PERMISSIONS` · `manager` = `STAFF_ASSIGNABLE` ทั้งหมด (ทุกอย่างที่ staff ถือได้)
5. `effectivePermissions(role, stored)`: `owner` → ทุก key ของ `PERMISSIONS` · `staff` → `stored ∩ STAFF_ASSIGNABLE` (key ที่หลุดเข้า DB ถูกทิ้ง) · ใช้เพื่อแสดงผลใน `MemberRow` ให้ตรงกับ core (test เทียบกับ `/me`)

### 5.2 จัดการสมาชิก (ทุกเส้นรันใน transaction + advisory lock ของร้าน)

ลำดับตรวจ: โหลด membership เป้าหมายของ **ร้านนี้** (ไม่มี = `NOT_FOUND`) → ตรวจกฎด้านล่าง → เขียน → `audit` → `publish`:
- **self**: เปลี่ยน role/สิทธิ์/ถอดตัวเอง = `POLICY_BLOCKED` `details.reason:'self_change'`
- **account owner**: เป้าหมายคือ `accounts.owner_user_id` ของร้านนี้ = `POLICY_BLOCKED` `'account_owner'` (ลด role/ถอด ไม่ได้)
- **set permissions**: เป้าหมายต้องเป็น `staff` (เป็น owner = `POLICY_BLOCKED` `'target_is_owner'`) · `validatePermissionKeys` · `UPDATE memberships SET permissions=$ …`
- **set role** `staff → owner`: `permissions = '{}'`, role owner · `owner → staff`: ต้องเหลือ owner active อื่นอย่างน้อยหนึ่งคนในร้านนี้ (`SELECT count(*) … FOR UPDATE`) ไม่เหลือ = `POLICY_BLOCKED` `'last_owner'` (HTTP 422; ข้อกำหนด "409" ใน brief เดิมแทนด้วยรหัสของ contract: `POLICY_BLOCKED` 422 และ `details.reason`) · permissions = ที่ส่งมา (validate) หรือ `STAFF_DEFAULT_PERMISSIONS`
- **revoke**: `status='revoked'` (ไม่ลบแถว: คืนสิทธิ์ได้) · เป้าหมาย owner ต้องผ่านกฎ last_owner เหมือนข้างบน · ไม่มีผลต่อร้านอื่นของผู้ใช้
- **restore**: เฉพาะ `revoked` → `active` (permissions เดิมคงอยู่; ผู้ใช้ `disabled` ก็คืนได้แต่ core ยังปิดทางเข้า) · `active` อยู่แล้ว = `POLICY_BLOCKED` `'not_revoked'`
- **ผลทันที**: core อ่าน `memberships` ใหม่ทุก request จึงมีผลกับ request ถัดไปโดยไม่ต้องทำอะไรเพิ่ม · F03 เพิ่ม `publish(businessId, { type:'custom', featureId:'F03', name:'tenancy.membership.changed', data:{ userId } }, { userIds:[userId] })` (best effort) ให้แท็บของผู้ถูกเปลี่ยน refresh session
- audit: `tenancy.member.permissions` `{userId, before, after}` · `tenancy.member.role` `{userId, from, to}` · `tenancy.member.revoke` / `.restore` `{userId}`

### 5.3 สร้างคำเชิญ / ส่งซ้ำ / ยกเลิก

`create`: (1) `assertRateLimit({ key:'tenancy.invite:'+businessId, limit:30, windowSeconds:3600 })` (2) validate permissions (3) tx + lock: `UPDATE invitations SET status='revoked', revoked_at=now() WHERE business_id=$1 AND status='pending' AND expires_at <= now()` (เคลียร์ใบหมดอายุ) (4) อีเมลนี้เป็นสมาชิก **active** ของร้านนี้อยู่แล้ว = `POLICY_BLOCKED` `'already_member'` · เป็นสมาชิกที่ถูกถอดอยู่ = `POLICY_BLOCKED` `'member_revoked'` (บอกให้ใช้ restore) · มี pending อยู่ = `POLICY_BLOCKED` `'already_invited'` (ชี้ให้ใช้ resend) · pending ≥ 100 = `POLICY_BLOCKED` `'too_many_pending'` (5) ผู้ใช้อีเมลนี้อยู่ใน account อื่น (เป็น `owner_user_id` ของ account อื่น หรือเป็นสมาชิก active ของร้านใน account อื่น) = `POLICY_BLOCKED` `'user_in_other_account'` (1 ผู้ใช้ = 1 account) (6) สร้าง token, INSERT (`expires_at = now() + INVITATION_TTL_HOURS`) (7) `deliverInvitation(inv, link)` §5.7 (8) audit `tenancy.invitation.create` `{invitationId, emailHash}` (`emailHash` = sha256 ตัดเหลือ 12 hex ไม่ใส่อีเมล) · คืนลิงก์
`resend`: คำเชิญต้อง pending (หมดอายุแล้วก็ resend ได้: สร้าง token ใหม่ + `expires_at` ใหม่ ทับใบเดิม; `accepted/revoked/declined` = `POLICY_BLOCKED` `'not_pending'`) · token เดิมใช้ไม่ได้ทันที (hash ถูกแทนที่) · audit `tenancy.invitation.resend`
`revoke`: `UPDATE … SET status='revoked' WHERE id=$1 AND business_id=$2 AND status='pending' RETURNING` · ได้แถว = สำเร็จ · ไม่ได้แถวแต่ใบมีอยู่และ `revoked` อยู่แล้ว = สำเร็จ (idempotent) · `accepted` = `POLICY_BLOCKED` `'already_accepted'` · ใบของร้านอื่น/ไม่มี = `NOT_FOUND` (UPDATE มีเงื่อนไขจึงไม่ชนกับ accept)

### 5.4 `previewInvitation` / `acceptInvitation` / `declineInvitation`

`lookup(token)`: `hash = sha256(token)` → แถว `invitations` ตาม `token_hash` (ไม่มี = `NOT_FOUND` ข้อความกลาง ๆ)
สถานะที่ไม่ใช่ใช้ได้ → `POLICY_BLOCKED` พร้อม `details.reason`: `expired` (`status='pending'` แต่ `expires_at <= now()`) · `revoked` · `accepted` · `declined`
**preview**: lookup + ธุรกิจต้อง `active` (ไม่ใช่ = `BUSINESS_INACTIVE`) → `{ businessName, emailMasked, role:'staff', expiresAt, permissionsCount }` (ไม่คืนอีเมลเต็ม, ไม่คืนชื่อผู้เชิญ)
**accept(userId, token)** ใน transaction + lock ของร้านและ `SELECT … FROM invitations … FOR UPDATE`:
1. lookup + ตรวจสถานะด้านบน · ร้าน `active` และ account `active` (มิฉะนั้น `BUSINESS_INACTIVE`: ไม่รับ invite ของร้านที่ถูกระงับ/ลบ)
2. โหลดผู้ใช้: `status='active'` (มิฉะนั้น `ACCOUNT_DISABLED`) · `email_normalized` **ต้องเท่ากับ** `invitations.email_normalized` (ไม่เท่า = `PERMISSION_DENIED` `details.reason:'email_mismatch'`; ไม่ match ด้วยอีเมลโดยไม่มี token: ต้องมี token ที่ hash ตรง)
3. กฎ account เดียว: ผู้ใช้ที่เป็นเจ้าของ account อื่น หรือมี membership (ทุกสถานะ) ในร้านของ account อื่น = `POLICY_BLOCKED` `'user_in_other_account'`
4. membership เดิมในร้านนี้: ไม่มี → INSERT (role staff, permissions จาก invitation) · เป็น `revoked` → UPDATE เป็น active, role staff, permissions จาก invitation · เป็น `active` → `POLICY_BLOCKED` `'already_member'` (ไม่แตะ role/สิทธิ์เดิม: คำเชิญห้ามเปลี่ยนสิทธิ์สมาชิกเดิม)
5. `UPDATE invitations SET status='accepted', accepted_by, accepted_at WHERE id=$ AND status='pending'` (ไม่ได้แถว = มีคนรับไปแล้ว = `POLICY_BLOCKED` `'accepted'`) · แล้ว `UPDATE invitations SET status='revoked'` ของคำเชิญ pending อื่นของอีเมลนี้ที่เป็นร้านใน account อื่น (เหลือ account เดียวตามกฎ)
6. audit `tenancy.invitation.accept` `{invitationId, businessId, userId}` · publish `tenancy.membership.changed` ให้ผู้รับ · **นอก transaction**: `notify({ businessId, to:{ role:'owners' }, type:'invitation', title:'พนักงานใหม่เข้าร่วมแล้ว', body: ชื่อหรืออีเมลที่ mask, link:'/members', dedupKey:'invite-accepted:'+id })` (try/catch)
**decline(token)**: lookup · `pending` เท่านั้น → `status='declined'` (ทำได้โดยไม่ต้องมีบัญชี) · audit `tenancy.invitation.decline`

### 5.5 สร้างร้านใหม่ / ลบร้าน

`POST /businesses`: ผู้เรียกต้องเป็น `accounts.owner_user_id` ของ account หนึ่ง (ไม่ใช่ = `PERMISSION_DENIED`; ไม่มี account เลย = `POLICY_BLOCKED` `'no_account'`; บัญชี `suspended` = `BUSINESS_INACTIVE`) · ตรวจชื่อ/timezone (`isValidTimeZone` เหมือน F04) · INSERT `businesses` + `memberships` (owner, `{}`) ใน tx · `ensureBusinessSettings` นอก tx (best effort) · audit `tenancy.business.create` · ไม่จำกัดจำนวนร้าน
`DELETE /businesses/:businessId?confirmName=`: ต้องมี `account.businesses` (owner) · `confirmName` เท่ากับชื่อร้านเป๊ะ (ไม่ใช่ = `VALIDATION_ERROR` issue `confirm_name_mismatch`) · **ห้ามลบ**: ร้านเดโมใน `SEED` (`seed_aliases.kind='business'` มี id นี้: `POLICY_BLOCKED` `'seed_business'`) · ร้านสุดท้ายที่ active ของ account (`'last_business'`) · ผ่านแล้ว `UPDATE businesses SET status='deleted', version=version+1` (soft delete: ข้อมูลอยู่; core ตอบ `BUSINESS_INACTIVE` ทุก request ต่อไป และ F04 ทำให้ `aiEnabled:false`) · ไม่ปิด channel ในที่นี้ (จัดการโดย F17/F18 ที่ต้องเลิกประมวลผล inbound ของร้านที่ไม่ active) · audit `tenancy.business.delete`
`GET /businesses`: ร้านทั้งหมดที่ผู้ใช้มี membership **active** (ไม่รวม `deleted`) พร้อม role · เรียงตามชื่อ

### 5.6 สลับร้าน (business switcher)

การสลับเป็นเรื่องฝั่ง client ของ core (`useSession().selectBusiness`, เก็บ `nless.businessId` ใน localStorage) · F03 ให้ข้อมูล (`/me` ของ core + `GET /businesses`) และหน้า `/businesses` · **server ไม่เชื่อค่าที่ client เลือก**: ทุก request มี `businessId` ใน path และ core ตรวจ membership ใหม่ทุกครั้ง · ร้านที่ถูกถอดสิทธิ์/ลบแล้ว core ไม่คืนใน `/me` และ request ได้ 404/403

### 5.7 อีเมลคำเชิญ

`invitation-mail.ts` ส่งออก `deliverInvitation(invitation, link): Promise<'link_only' | 'email_sandbox' | 'email_sent'>` · **ตอน F03 ส่งมอบคืนค่า `'link_only'`** (ผู้เชิญคัดลอกลิงก์ส่งเอง; UI บอกชัด) · F02 slice สุดท้ายแทนเนื้อในด้วย `queueEmail` ของ F02 (lane เดียวกัน ไม่เปลี่ยน signature) ดู [F02](F02-auth.md) §8 · ห้ามใส่ token/ลิงก์ใน log (`log.ts` redact + ไม่เรียก logger กับ `link`)

### 5.8 Onboarding (ร้านใหม่ได้ค่าเริ่มต้น)

ร้านที่สร้างด้วย `provisionAccountForUser` หรือ `POST /businesses` ได้: membership owner · `business_settings` ค่าเริ่มต้นผ่าน F04 `ensureBusinessSettings` (AI เปิด, เวลา จ–ส 09:00–18:00, policy `null`) · หน้า `/onboarding` แสดง checklist 5 ขั้นพร้อมลิงก์ไปหน้าจริงของฟีเจอร์อื่น (ซ่อนลิงก์ของฟีเจอร์ที่ถูกซ่อนด้วย flag ของ core) ไม่มีสถานะในฐานข้อมูล: แต่ละขั้นตรวจจากข้อมูลจริงผ่าน API ของหน้านั้น ๆ ไม่ได้ จึงเป็นรายการลิงก์ที่ผู้ใช้ติ๊กเองใน localStorage (`nless.onboarding.<businessId>`; ล้มได้ไม่กระทบอะไร)

## 6. AI calls

ไม่มี AI call

## 7. UI

ใช้ UI kit ของ core: `PageHeader`, `DataTable`, `FormDialog`, `ConfirmDialog`, `EmptyState`, `StatusChip`, `SectionCard`, `useToast`, `useApiQuery`, `useApiMutation`, `useSession`, `useCan`, `formatDateTime` · namespace i18n `tenancy`

| Route | layout / auth / permission | เมนู |
|---|---|---|
| `/members` | app · business · `account.members` | `{ group:'settings', icon:'GroupOutlined', order:30, permission:'account.members', labelKey:'tenancy:menu.members', searchTerms:['สมาชิก','พนักงาน','สิทธิ์','members','permissions'] }` |
| `/invitations` | app · business · `account.members` | `{ group:'settings', icon:'MarkEmailReadOutlined', order:35, permission:'account.members', labelKey:'tenancy:menu.invitations', searchTerms:['คำเชิญ','เชิญ','invite'] }` |
| `/invitations/accept` | **public** · none | ไม่มีเมนู |
| `/businesses` | app · user (ไม่ต้องมี business ที่เลือก) | `{ group:'settings', icon:'StoreMallDirectoryOutlined', order:40, permission:'account.businesses', labelKey:'tenancy:menu.businesses', searchTerms:['ร้าน','สลับร้าน','เพิ่มร้าน','business'] }` |
| `/onboarding` | app · business | ไม่มีเมนู (core พาไปหลังสมัคร; ลิงก์จากหน้าแรกเมื่อร้านใหม่) |

**`/members`** (`MembersPage.tsx`): `DataTable` คอลัมน์: ชื่อ+อีเมล · บทบาท (`StatusChip kind="generic"` ใช้ label เอง: เจ้าของ/พนักงาน) · สถานะ (ใช้งาน/ถูกถอดสิทธิ์) · เข้าใช้ล่าสุด · การกระทำ: "แก้สิทธิ์" (เฉพาะ staff active) · "เปลี่ยนบทบาท" · "ถอดสิทธิ์" (`ConfirmDialog danger`) · "คืนสิทธิ์" · แถวตัวเอง/เจ้าของบัญชีปิดปุ่มและมี tooltip เหตุผล · **dialog แก้สิทธิ์** (`FormDialog`): ปุ่ม preset 3 อัน (ดูอย่างเดียว · ทีมแชต · ผู้จัดการ) + เมทริกซ์ checkbox จัดกลุ่มตามชื่อกลุ่มใน `PERMISSIONS` (chat, orders, appointments, product, broadcast, insights, business, account) · key `never` แสดงเป็น checkbox ที่ปิดใช้งาน มีไอคอนกุญแจ + คำอธิบาย "ใช้ได้เฉพาะเจ้าของ" (ไม่ซ่อน) · ช่องค้นหา key · ข้อผิดพลาด `details.issues` แสดงใต้ checkbox นั้น
**`/invitations`**: ตัวกรองสถานะ + `DataTable` (อีเมล, สถานะ chip, หมดอายุ, ผู้เชิญ, การกระทำ: ส่งลิงก์ใหม่ · ยกเลิก) + ปุ่ม "เชิญพนักงาน" → `FormDialog` (อีเมล + preset/เมทริกซ์เดียวกัน) · หลังสร้าง/ส่งซ้ำ แสดง dialog ผลลัพธ์: ช่องลิงก์อ่านอย่างเดียว + ปุ่ม "คัดลอกลิงก์" (`navigator.clipboard`, ล้มก็เลือกข้อความให้) + ข้อความตาม `delivery` (`link_only`: "ระบบยังไม่ได้ส่งอีเมลให้ ส่งลิงก์นี้ให้พนักงานเอง ลิงก์ใช้ได้ถึง …")
**`/invitations/accept`** (`AcceptInvitationPage.tsx`, public): อ่าน `?token=` → เก็บใน `sessionStorage('nless.invite')` แล้ว `history.replaceState` ลบ token ออกจาก URL (กันหลุดทาง referrer/ประวัติ) → `GET /invitations/preview`: สถานะหน้า: loading · ใช้ได้: การ์ดชื่อร้าน + อีเมล (mask) + หมดอายุ + ปุ่ม "รับคำเชิญ" และ "ปฏิเสธ" · ยังไม่ login → ปุ่มรับพาไป `/login?next=/invitations/accept` (ถ้าไม่มีบัญชี: ลิงก์ `/signup?invite=1` ที่ F02 อ่าน token จาก sessionStorage) · login แล้ว → `POST /invitations/accept` สำเร็จ → `selectBusiness(businessId)` + `refresh()` → ไปหน้าแรก · สถานะผิด (`details.reason`): หมดอายุ/ถูกยกเลิก/ใช้แล้ว/ปฏิเสธแล้ว/ร้านไม่ active/อีเมลไม่ตรง/อยู่ account อื่น → `EmptyState` ข้อความเฉพาะเหตุผล
**`/businesses`**: การ์ดร้านของผู้ใช้ (ชื่อ, บทบาท, chip ร้านปัจจุบัน) + ปุ่ม "สลับมาใช้ร้านนี้" (`selectBusiness`) · ปุ่ม "เพิ่มร้านใหม่" (เฉพาะเจ้าของ account; `FormDialog` ชื่อ/ภาษา/timezone) · "ลบร้าน" (เจ้าของ; `ConfirmDialog danger` + ช่องพิมพ์ชื่อร้านยืนยัน) · ร้านเดโมแสดงไอคอนล็อกและปุ่มลบปิด
**`/onboarding`**: `PageHeader` "ยินดีต้อนรับ" + 5 การ์ดขั้น (ตั้งค่าร้าน `/business` · เพิ่มความรู้ `/knowledge` · เพิ่มสินค้า `/catalog` · เชื่อม LINE `/channels` · ลองคุยกับบอท `/demo-chat`) แต่ละการ์ดมีปุ่มเปิดหน้า + checkbox "เสร็จแล้ว" (localStorage) · การ์ดของฟีเจอร์ที่ซ่อนไม่แสดง (`GET /features`)

states: ตารางทุกอัน loading/empty/error ตาม UI kit · หน้า accept ไม่มี loading ค้าง (timeout 10 วินาที → error + ลองใหม่)

i18n (namespace `tenancy`):

| key | th | en |
|---|---|---|
| `menu.members` | สมาชิกและสิทธิ์ | Members |
| `menu.invitations` | คำเชิญ | Invitations |
| `menu.businesses` | ร้านของฉัน | My businesses |
| `members.title` | สมาชิกและสิทธิ์ | Members and permissions |
| `members.subtitle` | กำหนดว่าพนักงานแต่ละคนทำอะไรได้บ้าง | Decide what each staff member can do |
| `members.col.member` | สมาชิก | Member |
| `members.col.role` | บทบาท | Role |
| `members.col.status` | สถานะ | Status |
| `members.col.lastSeen` | เข้าใช้ล่าสุด | Last seen |
| `role.owner` | เจ้าของ | Owner |
| `role.staff` | พนักงาน | Staff |
| `status.active` | ใช้งาน | Active |
| `status.revoked` | ถูกถอดสิทธิ์ | Revoked |
| `actions.editPermissions` | แก้สิทธิ์ | Edit permissions |
| `actions.changeRole` | เปลี่ยนบทบาท | Change role |
| `actions.revoke` | ถอดสิทธิ์ | Revoke access |
| `actions.restore` | คืนสิทธิ์ | Restore access |
| `revoke.title` | ถอดสิทธิ์สมาชิก? | Revoke this member? |
| `revoke.message` | คนนี้จะเข้าร้านนี้ไม่ได้ตั้งแต่คำขอถัดไป คืนสิทธิ์ได้ภายหลัง | They lose access from the next request. You can restore access later |
| `permissions.title` | สิทธิ์ของ {{name}} | Permissions for {{name}} |
| `permissions.search` | ค้นหาสิทธิ์ | Search permissions |
| `permissions.locked` | ใช้ได้เฉพาะเจ้าของ | Owner only |
| `permissions.preset.viewer` | ดูอย่างเดียว | View only |
| `permissions.preset.chat_team` | ทีมแชต | Chat team |
| `permissions.preset.manager` | ผู้จัดการ | Manager |
| `permissions.saved` | บันทึกสิทธิ์แล้ว | Permissions saved |
| `permissions.group.chat` | แชต | Chat |
| `permissions.group.orders` | ออเดอร์ | Orders |
| `permissions.group.appointments` | นัดหมาย | Appointments |
| `permissions.group.product` | สินค้าและความรู้ | Products and knowledge |
| `permissions.group.broadcast` | บรอดแคสต์ | Broadcast |
| `permissions.group.insights` | รายงาน | Insights |
| `permissions.group.business` | ร้าน | Business |
| `permissions.group.account` | บัญชี | Account |
| `permission.chat.read` | ดูแชต | View chats |
| `permission.chat.reply` | ตอบแชต | Reply in chats |
| `permission.chat.takeover` | รับช่วงแชตจาก AI | Take over chats |
| `permission.chat.schedule` | ตั้งตารางเวรพนักงาน | Edit staff schedules |
| `permission.chat.view_all` | ดูแชตของทุกคน | View everyone's chats |
| `permission.orders.read` | ดูออเดอร์ | View orders |
| `permission.orders.write` | แก้ไขออเดอร์ | Edit orders |
| `permission.appointments.read` | ดูนัดหมาย | View appointments |
| `permission.appointments.write` | จัดการนัดหมาย | Manage appointments |
| `permission.appointments.settings` | ตั้งค่าระบบนัดหมาย | Booking settings |
| `permission.product.read` | ดูสินค้าและความรู้ | View products and knowledge |
| `permission.product.write` | แก้สินค้าและความรู้ | Edit products and knowledge |
| `permission.product.delete` | ลบสินค้าและความรู้ | Delete products and knowledge |
| `permission.broadcast.read` | ดูบรอดแคสต์ | View broadcasts |
| `permission.broadcast.send` | ส่งบรอดแคสต์ | Send broadcasts |
| `permission.broadcast.tags` | จัดการแท็กลูกค้า | Manage customer tags |
| `permission.insights.read` | ดูรายงานและการวิเคราะห์ | View reports and insights |
| `permission.insights.demo` | ใช้โหมดเดโมของรายงาน | Use the insights demo mode |
| `permission.business.read` | ดูข้อมูลร้าน | View business info |
| `permission.business.update` | แก้ข้อมูลร้านและเวลาทำการ | Edit business info and hours |
| `permission.business.bot_settings` | ตั้งค่าบอท | Bot settings |
| `permission.business.channels` | เชื่อมต่อช่องทาง | Manage channels |
| `permission.business.commerce` | ตั้งค่าการขาย (ค่าส่ง การชำระเงิน) | Commerce settings |
| `permission.account.members` | จัดการสมาชิกและคำเชิญ | Manage members and invitations |
| `permission.account.businesses` | จัดการร้านในบัญชี | Manage businesses in the account |
| `role.change.title` | เปลี่ยนบทบาทของ {{name}} | Change role for {{name}} |
| `role.change.toOwner` | เลื่อนเป็นเจ้าของ (มีทุกสิทธิ์) | Promote to owner (all permissions) |
| `role.change.toStaff` | ลดเป็นพนักงาน | Demote to staff |
| `block.self_change` | ทำกับตัวเองไม่ได้ | You cannot do this to yourself |
| `block.account_owner` | เจ้าของบัญชีลดหรือถอดสิทธิ์ไม่ได้ | The account owner cannot be changed |
| `block.last_owner` | ร้านต้องมีเจ้าของอย่างน้อยหนึ่งคน | A business needs at least one owner |
| `block.target_is_owner` | เจ้าของมีทุกสิทธิ์อยู่แล้ว | Owners already have every permission |
| `invitations.title` | คำเชิญ | Invitations |
| `invitations.invite` | เชิญพนักงาน | Invite staff |
| `invitations.email` | อีเมลพนักงาน | Staff email |
| `invitations.col.expires` | หมดอายุ | Expires |
| `invitations.col.invitedBy` | ผู้เชิญ | Invited by |
| `invitations.resend` | ส่งลิงก์ใหม่ | Send a new link |
| `invitations.revoke` | ยกเลิกคำเชิญ | Cancel invitation |
| `invitations.state.pending` | รอการตอบรับ | Pending |
| `invitations.state.accepted` | รับแล้ว | Accepted |
| `invitations.state.revoked` | ยกเลิกแล้ว | Cancelled |
| `invitations.state.declined` | ปฏิเสธ | Declined |
| `invitations.state.expired` | หมดอายุ | Expired |
| `invitations.link.title` | ลิงก์คำเชิญ | Invitation link |
| `invitations.link.copy` | คัดลอกลิงก์ | Copy link |
| `invitations.link.copied` | คัดลอกแล้ว | Copied |
| `invitations.link.manual` | ระบบยังไม่ได้ส่งอีเมลให้ ส่งลิงก์นี้ให้พนักงานเอง ลิงก์ใช้ได้ถึง {{when}} และใช้ได้ครั้งเดียว | No email was sent. Send this link to the staff member yourself. It works until {{when}} and only once |
| `invitations.link.sandbox` | อีเมลอยู่ในกล่องจดหมายทดสอบ (ยังไม่ส่งออกจริง) ลิงก์ใช้ได้ถึง {{when}} | The email is in the sandbox mailbox (not really sent). The link works until {{when}} |
| `invitations.block.already_member` | เป็นสมาชิกของร้านนี้อยู่แล้ว | Already a member of this business |
| `invitations.block.member_revoked` | คนนี้ถูกถอดสิทธิ์อยู่ ให้ใช้ "คืนสิทธิ์" | This person was revoked. Use "Restore access" |
| `invitations.block.already_invited` | มีคำเชิญที่รอตอบรับอยู่แล้ว ให้ส่งลิงก์ใหม่ | An invitation is already pending. Send a new link |
| `invitations.block.user_in_other_account` | อีเมลนี้อยู่ในบัญชีของร้านอื่นแล้ว | This email already belongs to another account |
| `accept.title` | คำเชิญเข้าร่วมร้าน | Invitation to join a business |
| `accept.body` | คุณได้รับเชิญเข้าร่วม "{{name}}" ในฐานะพนักงาน (อีเมล {{email}}) | You are invited to join "{{name}}" as staff ({{email}}) |
| `accept.accept` | รับคำเชิญ | Accept |
| `accept.decline` | ปฏิเสธ | Decline |
| `accept.needLogin` | เข้าสู่ระบบหรือสมัครด้วยอีเมลที่ได้รับเชิญเพื่อรับคำเชิญ | Sign in or sign up with the invited email to accept |
| `accept.done` | เข้าร่วมร้านแล้ว | You have joined the business |
| `accept.declined` | ปฏิเสธคำเชิญแล้ว | Invitation declined |
| `accept.error.expired` | คำเชิญนี้หมดอายุแล้ว ขอให้เจ้าของส่งลิงก์ใหม่ | This invitation has expired. Ask the owner for a new link |
| `accept.error.revoked` | คำเชิญนี้ถูกยกเลิกแล้ว | This invitation was cancelled |
| `accept.error.accepted` | คำเชิญนี้ถูกใช้ไปแล้ว | This invitation was already used |
| `accept.error.declined` | คำเชิญนี้ถูกปฏิเสธไปแล้ว | This invitation was declined |
| `accept.error.email_mismatch` | อีเมลที่ login อยู่ไม่ตรงกับอีเมลที่ได้รับเชิญ | The signed-in email is not the invited email |
| `accept.error.user_in_other_account` | อีเมลนี้อยู่ในบัญชีของร้านอื่นแล้ว รับคำเชิญนี้ไม่ได้ | This email belongs to another account and cannot accept |
| `accept.error.business_inactive` | ร้านนี้ไม่เปิดใช้งานแล้ว | This business is no longer active |
| `accept.error.notFound` | ไม่พบคำเชิญนี้ | Invitation not found |
| `businesses.title` | ร้านของฉัน | My businesses |
| `businesses.switch` | สลับมาใช้ร้านนี้ | Switch to this business |
| `businesses.current` | ร้านที่ใช้อยู่ | Current |
| `businesses.add` | เพิ่มร้านใหม่ | Add a business |
| `businesses.name` | ชื่อร้าน | Business name |
| `businesses.delete` | ลบร้าน | Delete business |
| `businesses.deleteMessage` | พิมพ์ชื่อร้าน "{{name}}" เพื่อยืนยัน ร้านจะหยุดทำงานทันที | Type the business name "{{name}}" to confirm. It stops working immediately |
| `businesses.block.seed_business` | ร้านตัวอย่างลบไม่ได้ | The demo business cannot be deleted |
| `businesses.block.last_business` | ต้องเหลืออย่างน้อยหนึ่งร้านในบัญชี | Keep at least one business in the account |
| `onboarding.title` | ยินดีต้อนรับ เริ่มตั้งค่าร้านกันเลย | Welcome. Let us set up your shop |
| `onboarding.step.business` | ตั้งค่าข้อมูลร้านและเวลาทำการ | Set up shop info and hours |
| `onboarding.step.knowledge` | เพิ่มความรู้ให้บอท | Add knowledge for the bot |
| `onboarding.step.catalog` | เพิ่มสินค้าและราคา | Add products and prices |
| `onboarding.step.channels` | เชื่อม LINE | Connect LINE |
| `onboarding.step.chat` | ลองคุยกับบอทใน Demo Chat | Try the bot in Demo Chat |
| `onboarding.done` | เสร็จแล้ว | Done |
| `common.retry` | ลองใหม่ | Retry |

## 8. Jobs, schedules, events

- Jobs / schedules: ไม่มี (ใบหมดอายุคำนวณตอนอ่าน ไม่ต้องมี cron) · ล้างข้อมูลคำเชิญเก่า: ไม่ทำ
- Realtime: `custom` `F03` `tenancy.membership.changed` `{ userId }` (ส่งเฉพาะ `userIds:[userId]`) หลังเปลี่ยน/ถอด/คืน/รับคำเชิญ
- Audit: `tenancy.business.create` · `tenancy.business.delete` · `tenancy.member.permissions` · `tenancy.member.role` · `tenancy.member.revoke` · `tenancy.member.restore` · `tenancy.invitation.create` · `tenancy.invitation.resend` · `tenancy.invitation.revoke` · `tenancy.invitation.accept` · `tenancy.invitation.decline` (ทุกแถวมี `actorUserId`, `businessId`, `accountId`, `targetType`, `targetId`; ไม่ใส่ token ดิบ ไม่ใส่อีเมลเต็ม)
- `notify`: `type:'invitation'` เมื่อพนักงานรับคำเชิญ (ผู้รับ = เจ้าของร้าน)

## 9. Seed และ fixtures

core seed สร้างผู้ใช้ 5 คน, account A/B, ร้าน A/B และ membership ของ SEED แล้ว (owner มี `permissions='{}'`, staff = `STAFF_DEFAULT_PERMISSIONS`) · `server/src/features/tenancy/seed.ts` (`dependsOn:['core']`):
- `run(ctx)`: ไม่เขียนอะไร (ไม่มีข้อมูลเริ่มต้นของตาราง `invitations`) แต่ **ตรวจ** ว่า membership ของ SEED ตรง `SEED.memberships` (role/สถานะ/permissions) และ log warn ถ้าไม่ตรง
- `runDemo(ctx)`: ร้าน A มีคำเชิญ pending 1 ใบถึง `new.staff.a@example.test` (token สุ่มที่ไม่เก็บ/ไม่แสดง: ใช้ "ส่งลิงก์ใหม่" ในหน้าเพื่อได้ลิงก์ใช้งานจริง) ใช้ `ON CONFLICT` ผ่าน `invitations_one_pending`
- `resetDemo(ctx)`: ลบ `invitations` ทั้งหมดของร้านเดโมสองร้าน · คืน membership ของ SEED ให้ตรง `SEED` (`UPDATE … status='active', role, permissions`) · ลบ membership ที่ไม่อยู่ใน SEED ของร้านเดโม (สมาชิกที่ test สร้าง) · ร้านเพิ่มเติมใน account เดโมที่สร้างขณะเดโม (`name LIKE 'e2e-%'` หรือ `status='deleted'`) ถูกลบจริงพร้อมข้อมูล (cascade) ยกเว้นร้านใน SEED
- fixtures ของ test: helper `createTenant(prefix)` สร้าง user ×3 (owner, staff, outsider) + account + ร้านใหม่ด้วย SQL ตรง (อีเมล `<prefix>-owner@example.test` ฯลฯ ไม่ซ้ำ) และ `loginAs(agent, email)` ของ core · ห้ามแก้แถว SEED

## 10. Tests

Unit (`permissions.test.ts`, `tokens.test.ts`):
1. `validatePermissionKeys`: key ที่ไม่รู้จัก → `VALIDATION_ERROR` พร้อมรายการ `unknown` · `account.members` ของ staff → `forbidden` · dedupe + เรียงตามลำดับ · ว่าง `[]` ผ่าน (staff ไม่มีสิทธิ์ใดเลย)
2. `effectivePermissions('owner', [])` มีครบทุก key ของ `PERMISSIONS` · `('staff', ['chat.read','x','account.members'])` = `['chat.read']`
3. token: 43 ตัว base64url · hash sha256 hex 64 ตัว · สองครั้งไม่ซ้ำ · `maskEmail('abcd@example.test')` = `ab**@example.test`
4. `PRESETS`: `chat_team` เท่ากับ `STAFF_DEFAULT_PERMISSIONS` · ไม่มี preset ใดมี key `never`

Route (supertest + test DB, helper `createTenant`):
5. **สมาชิก/สิทธิ์ (เทียบ core)**: owner ตั้ง staff = `['chat.read','orders.read']` → `GET /me` ของ staff คนนั้น (ผ่าน `loginAs`) คืน permissions เท่ากันเป๊ะ และ `GET` ที่ต้องใช้ `chat.reply` ได้ 403 · owner ตั้งเป็น `[]` → ทุกเส้น business ที่ต้องมี key ได้ 403 แต่ `GET /businesses/:id` ได้ 200
6. **revoke มีผลทันที**: staff ล็อกอินแล้วเรียก `GET /…/members`(ไม่มีสิทธิ์ → 403) และเรียกเส้นที่ได้รับสิทธิ์สำเร็จ (200) → owner `revoke` → **session เดิมของ staff** เรียกเส้นเดิมได้ **404/403 ตั้งแต่ request ถัดไป** (ตามที่ core ตอบกับ membership ไม่ active: ยึดผลจริงของ core แล้วเขียนค่าที่ถูกใน test, ดู §15) · `/me` ไม่มีร้านนั้น · `restore` แล้วกลับมา 200 โดยสิทธิ์เดิม
7. **never keys**: `PUT …/permissions` ใส่ `account.members` → 400 พร้อม `forbidden` · staff ที่พยายามเรียก `/members` → 403
8. **last owner**: ร้านมี owner คนเดียว: demote/revoke ตัวเอง → 422 `self_change` · มี owner สองคน demote คนที่สอง → ได้ · demote คนสุดท้าย (ผ่าน owner อื่นที่ถูกถอด/ลำดับแข่ง) → `last_owner` · เจ้าของ account (`accounts.owner_user_id`) ถูก demote → `account_owner` · ส่งสองคำขอ demote พร้อมกัน (`Promise.all`) → อย่างมากหนึ่งสำเร็จ ร้านเหลือ owner ≥ 1
9. **คำเชิญ**: สร้าง → `link` มี token 43 ตัว · แถว DB มีแต่ `token_hash` (ไม่มีสตริงของ token ในตารางใด ๆ ค้นด้วย `SELECT … WHERE token_hash = token` ไม่พบ) · `expires_at ≈ now + INVITATION_TTL_HOURS` (ใช้ CLOCK) · สร้างซ้ำอีเมลเดิม → 422 `already_invited` · `resend` → token เก่า preview ได้ 404 · token ใหม่ได้ 200
10. **accept**: ผู้ใช้อีเมลตรง → สมาชิก staff พร้อมสิทธิ์ตามคำเชิญ · ใช้ซ้ำ → 422 `accepted` · หมดอายุ (เลื่อนเวลาด้วย `UPDATE expires_at`) → 422 `expired` · ผู้ใช้อีเมลอื่น → 403 `email_mismatch` และใบยังคงเป็น pending · ร้านถูกระงับ → 403 `BUSINESS_INACTIVE` · ผู้ใช้เป็น owner ของ account อื่น → 422 `user_in_other_account` · สมาชิก active เดิมที่ถูกเชิญ ไม่เปลี่ยน role/สิทธิ์เดิม · สมาชิกที่ถูกถอดเดิมกลับมา active ด้วยสิทธิ์ของใบเชิญ · สอง accept พร้อมกัน → หนึ่งสำเร็จ หนึ่ง 422
11. **revoke/decline คำเชิญ**: ยกเลิกแล้ว accept → 422 `revoked` · ยกเลิกซ้ำ → 200 (idempotent) · ยกเลิกใบที่ accepted แล้ว → 422 · decline โดยไม่ login → ใบเป็น `declined`
12. **ร้านและ account**: `POST /businesses` โดย owner → ร้านใหม่ + membership owner + `getBusinessSettings` คืนค่าเริ่มต้น (F04) · โดย staff → 403 · `DELETE` ชื่อไม่ตรง → 400 · ร้านเดโม (SEED) → 422 `seed_business` · ร้านสุดท้าย → 422 `last_business` · ลบแล้ว request ถัดไปของร้านนั้น → `BUSINESS_INACTIVE` (403) · `provisionAccountForUser` สองครั้ง → account เดียว (`created:false` ครั้งที่สอง) · ล้มกลางทาง (บังคับ error ใน INSERT membership) → ไม่มีแถว account/business ค้าง
13. **rate limit**: สร้างคำเชิญ 31 ครั้งใน 1 ชั่วโมง → ครั้งที่ 31 = 429 · preview 31 ครั้ง/นาที/IP → 429

**Isolation เต็ม (`isolation.test.ts`: lane อื่นรันซ้ำได้ด้วย `npm test -- tenancy/isolation`)** — ใช้ SEED A/B:
14. ผ่าน route registry (`GET /api/v1/_meta/routes`): ทุกเส้น `auth: 'business'` ที่เป็น `GET` ที่มี `:businessId` (แทนด้วย id ของร้าน B; param อื่นแทนด้วย uuid สุ่ม) เรียกด้วย cookie ของ `owner_a` → ต้องได้ **404** ทุกเส้น (ไม่ใช่ 200, ไม่ใช่ 403) · ด้วย `staff_a` ได้ 404 เช่นกัน · แล้วกลับด้าน (`owner_b` เรียกร้าน A) · ผลรวมต้องมีจำนวนเส้นที่ทดสอบ ≥ 15 (ป้องกันกรณีรายการว่าง) และพิมพ์รายชื่อเส้นที่ผ่าน/ข้าม
15. เขียนข้าม tenant: `PUT /ai`, `POST /invitations` (F04/F03), `POST /businesses/:B/members/:userId/revoke` ด้วย `owner_a` → 404 และข้อมูลร้าน B ไม่เปลี่ยน (เทียบก่อน/หลัง) · `owner_a` เรียกร้านที่ตัวเอง "ถูกถอด" → 404
16. marker: ข้อมูล marker `TENANT_B_ONLY_OWL_482` ไม่ปรากฏในผลของเส้นใดที่ `owner_a` เรียก (ค้นใน JSON ของทุก response ที่ได้ 200)
17. dev login/`/me`: `owner_a` ได้ businesses = ร้าน A เท่านั้น · `platform_admin` ได้ businesses = `[]` และเรียกร้าน A/B → 404 (admin ไม่ได้ key ร้านอัตโนมัติ)

Playwright smoke `web/src/features/tenancy/e2e/tenancy.smoke.spec.ts` (ใช้ `ownerPage`, `api`, `e2eMarker`; ปลอดภัยบน production):
- `members: owner A เห็นรายชื่อและเมทริกซ์สิทธิ์ที่ล็อก key never` — `/members` เห็น `owner.a`/`staff.a` · เปิด dialog แก้สิทธิ์ของ staff A → เห็น `permissions.locked` สองรายการ (checkbox ปิดใช้งาน) · ปิด dialog ไม่บันทึก (ไม่เปลี่ยนสิทธิ์ SEED บน production)
- `invitations: เชิญ → ได้ลิงก์ → preview → ยกเลิก` — เชิญ `<marker>@example.test` (e2e-…) → dialog ลิงก์มีข้อความ link_only/sandbox → เปิดลิงก์ในหน้าใหม่ (ไม่ login) เห็นชื่อร้าน + อีเมล mask → กลับมายกเลิกคำเชิญ → แถวเป็น "ยกเลิกแล้ว" · (ไม่ accept บน production)
- `businesses: สร้างร้าน e2e → สลับ → ลบ` — `/businesses` เพิ่มร้านชื่อ `e2e-<marker>` → การ์ดใหม่ → "สลับมาใช้ร้านนี้" → ชื่อใน TopBar เปลี่ยน → สลับกลับร้าน A → ลบร้าน e2e (พิมพ์ชื่อยืนยัน) · `finally` ลบผ่าน API ถ้าค้าง · ร้านเดโม A ปุ่มลบปิดอยู่
- `tenant: owner A เปิดร้าน B` — `api.get('/api/v1/businesses/<B id>/members')` = 404 และ `/api/v1/businesses/<B id>` = 404
- `accept page ไม่เผย token` — เปิด `/invitations/accept?token=xxxxxxxx…` (token ปลอมยาวถูกรูปแบบ) → เห็น `accept.error.notFound` และ URL ไม่มี `token=` หลังโหลด

## 11. Acceptance: R ตาม D6

- [ ] UI จริง `/members` `/invitations` `/invitations/accept` `/businesses` `/onboarding` ต่อ API + DB จริง ไม่มีปุ่มที่ไม่ทำงาน
- [ ] ผู้ใช้ร้าน A อ่าน/เขียนร้าน B ไม่ได้ **ทุกเส้นที่ลงทะเบียน** (test 14–17 เขียวบน CI และบน test DB หลัง merge) · staff ไม่มี key = 403 · revoke มีผลกับ request ถัดไป (test 6)
- [ ] คำเชิญ: token ถูก hash, หมดอายุตาม `INVITATION_TTL_HOURS`, ใช้ครั้งเดียว, ยกเลิกได้, ปฏิเสธได้ (test 9–11) · การรับคำเชิญผูกกับ login/signup ของ F02 (ทดสอบรวมเมื่อ F02 merge)
- [ ] กฎเจ้าของ: ร้านเหลือ owner ≥ 1, account owner ลดไม่ได้, key `never` ให้ staff ไม่ได้ (test 7–8)
- [ ] สร้างร้านใหม่ได้พร้อมค่าเริ่มต้นของ F04 · สลับร้านแล้ว scope ถูก (smoke)
- [ ] ทุกการเปลี่ยน role/สิทธิ์/สถานะ/คำเชิญมีแถว `audit_events` (ตรวจใน test 5–11)
- [ ] seed SPEC §5 ยังใช้ได้ทั้ง dev login และ password login (หลัง F02)
- [ ] loading/empty/error state · ข้อความไทยผ่าน i18n · unit + route test เขียว · Playwright smoke ผ่านกับ production · deploy แล้ว
- ส่วนที่ทำให้เป็น **S/A**: การส่งอีเมลคำเชิญ (`delivery` = `link_only`/`email_sandbox` จนกว่าจะมีผู้ให้บริการอีเมลจริง จดใน EVIDENCE.md ว่า "คำเชิญ: R, อีเมลคำเชิญ: S") · `/onboarding` เป็น checklist ลิงก์ (R ในฐานะหน้า)

## 12. Security และ privacy

- **ทุก query กรองด้วย `business_id`** ที่ core ยืนยันแล้ว · เส้น `/members/:userId` และ `/invitations/:id` โหลดแถวด้วย `AND business_id = $ctx` เสมอ (id ของร้านอื่น = `NOT_FOUND`)
- ไม่เชื่อ `role`, `permissions`, `businessId` ที่มาจากร่างคำขอนอกจากที่ route อนุญาต (permissions ผ่าน `validatePermissionKeys` ทุกครั้ง) · ไม่ให้ผู้ใช้ยกระดับตัวเอง: `account.members` เป็น key `never` ของ staff, ห้าม `self_change`
- token คำเชิญ: สุ่มจาก CSPRNG 32 ไบต์, เก็บ SHA-256, เปรียบเทียบด้วยการค้นหา hash (ไม่มี string compare ของ token), ลิงก์แสดงครั้งเดียว, ไม่อยู่ใน log/audit/notification (`redact` ครอบ field `token`, `link`), หลัง preview ลบออกจาก URL ฝั่ง client · preview ไม่คืนอีเมลเต็มหรือชื่อผู้เชิญ · ตอบ `NOT_FOUND` เหมือนกันทั้งกรณีไม่มีและ token ผิดรูปแบบ
- rate limit ตาม §3 · accept ต้องใช้ session ของผู้รับ + อีเมลตรง (ถือ token อย่างเดียวไม่พอ)
- 1 ผู้ใช้ = 1 account (กันการข้ามผู้เช่าผ่านคำเชิญ) · soft delete ร้าน · ร้านเดโมลบไม่ได้
- ข้อมูลส่วนบุคคลในหน้า: อีเมลสมาชิก (เห็นเฉพาะผู้มี `account.members`) · audit เก็บ hash ของอีเมลที่เชิญไม่เก็บอีเมลเต็ม

## 13. Edge cases

| กรณี | ผลที่ต้องได้ |
|---|---|
| เชิญอีเมลที่ยังไม่มีบัญชี | สร้างคำเชิญได้ · ผู้รับสมัครผ่านลิงก์ (F02 `inviteToken`) แล้วเข้าร้านโดยไม่สร้าง account/ร้านใหม่ |
| ผู้รับ login ด้วยอีเมลอื่น | 403 `email_mismatch` ใบยัง pending ให้ลองด้วยบัญชีที่ถูก |
| คำเชิญใบเก่าหมดอายุ แล้วเชิญซ้ำ | ใบเก่าถูกเปลี่ยนเป็น revoked อัตโนมัติ สร้างใบใหม่ได้ |
| ผู้ใช้อยู่ในสองร้านของ account เดียวกัน | อนุญาต (switcher) · สิทธิ์ต่อร้านแยกกัน |
| ถอดสิทธิ์ระหว่างที่ผู้ใช้เปิดหน้าอยู่ | request ถัดไปล้มตามที่ core ตอบ · เหตุการณ์ realtime ทำให้ UI refresh session (best effort) |
| เจ้าของสองคนถอดกันพร้อมกัน | lock ต่อร้าน: สำเร็จแค่หนึ่ง อีกฝั่ง `last_owner` |
| ร้านถูกลบแล้วคำเชิญค้างอยู่ | preview/accept ได้ `BUSINESS_INACTIVE` |
| ผู้ใช้ `disabled` ถูกเชิญ/รับ | accept = `ACCOUNT_DISABLED` · restore ได้แต่ core ยังปิดทางเข้า |
| staff พยายามเปิด `/members` ผ่าน URL | route guard ของ core ขึ้น Forbidden · API 403 |
| `permissions` ใน DB มี key เก่าที่ถูกเอาออกจาก `PERMISSIONS` | `effectivePermissions` ทิ้ง · หน้าแก้สิทธิ์ไม่แสดง · บันทึกครั้งต่อไปล้างออก |
| ชื่อร้านซ้ำกัน | อนุญาต (ไม่ unique) |
| ผู้ใช้ไม่มีร้านเลย (เช่น platform admin) | `/businesses` ว่าง + ข้อความ · ไม่มีปุ่มสร้าง (ไม่ใช่เจ้าของ account) |

## 14. Build order (slices)

| Slice | เวลา | ทำอะไร | merge เมื่อ |
|---|---|---|---|
| **S1 · สมาชิก + สิทธิ์ + isolation** (gate) | ≤ 40 นาที (เป้า merge ก่อน 12:45) | migration `001` ครบทั้งตาราง `invitations` · `permissions.ts` (validate/presets/effective) · `GET /members`, `PUT …/permissions`, `PUT …/role`, `revoke`, `restore` + กฎ §5.2 + audit + publish · หน้า `/members` (ตาราง + dialog สิทธิ์) · test 1–2, 5–8, **14–17 (isolation)** · EVIDENCE.md | CI เขียว · โพสต์ `DONE F03 … TO:A1 TO:B1 TO:B2 TO:C1 TO:C2 TO:A2 TO:A3 TO:B3` + ข้อความ "รัน `npm test -- tenancy/isolation` ใน lane ของคุณหลัง rebase" |
| S2 · คำเชิญ | ≤ 30 นาที | `tokens.ts`, `invitations.ts`, `invitation-mail.ts` (`link_only`), routes คำเชิญ + preview/accept/decline, หน้า `/invitations` + `/invitations/accept`, `notify` (fake ได้) · test 3, 9–11, 13 | slice ผ่าน test |
| S3 · ร้านและ onboarding | ≤ 25 นาที | `businesses.ts`, `GET/POST/DELETE /businesses`, `provisionAccountForUser`, หน้า `/businesses` + `/onboarding`, `runDemo`/`resetDemo` · test 12 | slice ผ่าน test |
| S4 · smoke + production | ≤ 15 นาที | Playwright smoke (§10) กับ production · EVIDENCE.md · โพสต์ `DONE` พร้อมสถานะ | smoke ผ่านบน production |

ห้าม merge อะไรของ F03 ที่เสี่ยงต่อ login/สิทธิ์ช่วง 12:30–13:00 (กฎ gate) · หลัง 14:30 PR ที่แตะ golden path ต้องเดิน gate 5 ขั้นก่อน merge

## 15. UNCONFIRMED และสิ่งที่ต้องตรวจในวันงาน

| ข้อ | วิธีตรวจ |
|---|---|
| core ตอบ **404 หรือ 403** เมื่อผู้ใช้มี membership ที่ `status='revoked'` (contracts.ts ระบุว่า "ไม่ใช่สมาชิก = NOT_FOUND") | เขียน test 6 ให้ยืนยันกับ core จริง: ถ้าได้ 403 ให้ปรับ test + จดใน EVIDENCE.md และแจ้ง C1 หาก ต้องการ 404 เพื่อไม่เผยการมีอยู่ของร้าน |
| รูปแบบของ `GET /api/v1/_meta/routes` (ชื่อฟิลด์ method/path/auth) | อ่านผลจริงตอน S1 แล้วเขียน parser ใน `isolation.test.ts` · ถ้าไม่พอใช้ ให้ test ใช้รายการเส้นที่ import จาก `server/src/core` registry ตรง ๆ |
| ลำดับตรวจของ core: ตรวจ body ก่อนหรือหลังสมาชิกภาพ (มีผลต่อ test 15) | ส่ง body ถูกต้องเสมอใน test ข้าม tenant · จดผลใน EVIDENCE.md |
| F03 เขียน `accounts`/`businesses`/`memberships` ด้วย INSERT/UPDATE (ไม่ ALTER) ผ่านเช็ก ownership ของ C1 | ดูผล `npm run check:paths` ใน PR แรก · ไม่ผ่านโพสต์ `NEED TO:C1` |
| ชื่อ path ของฟีเจอร์อื่นใน checklist onboarding (`/knowledge`, `/catalog`, `/channels`, `/demo-chat`) | ตรวจกับ `FEATURES[].webPaths` ใน contracts.ts ตอน S3 (ตรงกันอยู่แล้วตอนเขียน) |
| `notify` type `invitation` ถูกยอมรับโดย F31 จริง (ผู้รับต้องเป็นสมาชิก) | ใช้ fake จน F31 merge · ตอน F31 merge รัน test ที่รับคำเชิญซ้ำและตรวจแถวใน `notifications` |
| ใครปิดช่องทาง (LINE/Meta) เมื่อร้านถูกลบ | F03 ไม่ทำ · โพสต์ `NEED TO:C2` ให้ F17/F18 ละเว้น inbound ของร้านที่ไม่ active |
