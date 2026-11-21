# F24 crm — ข้อมูลลูกค้า แท็ก กฎแท็กอัตโนมัติ และความยินยอมการตลาด

| | |
|---|---|
| Lane / คน | **A3** / **A** · ลำดับ 1 ใน lane (F24 → F15 → F16) |
| Tier / เป้า | **P1** · เป้า **R** (ไม่มี provider ภายนอก) |
| Timebox | 45–90 นาที |
| เริ่มเมื่อ | หัวหน้าโพสต์ `LEAD: OPEN P1` (ตาราง core `customers` `conversations` มีอยู่แล้วตั้งแต่ `SETUP READY`) |
| พึ่ง | F09 `getConversation` (หาลูกค้าจากแชต) · core (`db`, `jobs`/schedules, `audit`, `publish`) · ตาราง core `customers` `conversations` (อ่านอย่างเดียว) · A2 `listOrdersByCustomer` (เฉพาะกฎ `order_count_gte`, ไม่บังคับ) · F15 `countAppointmentsByCustomers` (เฉพาะกฎ `booking_count_gte`, ไม่บังคับ) |
| ให้ | contracts `getCustomer`, `listCustomersByTags`, `listTags` (ผู้ใช้: A1 F23 broadcast, B2 F10/F38, B3 F26/F27, A2) · exports นอก contract: `setMarketingConsent`, `addInferredTag` |
| ใช้ | ดู §4 |
| โฟลเดอร์ | `server/src/features/crm/` · `shared/features/crm/types.ts` · `web/src/features/crm/` |
| Web path | `/customers` (เมนูกลุ่ม `customers`) · slot `chatSidePanels` ของ `/chat` (แผงลูกค้าในแชต) |

อ่าน: `contracts.ts` (ส่วน crm, `Channel`, `MarketingConsent`, `SlotContribution`, `Page<T>`, PERMISSIONS, SEED customers/tags) · F01 spec §2 (ตาราง `customers` `conversations`) · F09 spec §7 (host ของ `chatSidePanels`) · F23 spec §4–§5 (ผู้ใช้ `listTags`, `listCustomersByTags`, `getCustomer`) · [COOKBOOK](../COOKBOOK.md) §6, §8

## 1. เป้าหมายและ user stories

ทำไมมี: ตาราง `customers` ของ core เก็บแค่ตัวตนต่อช่องทาง (LINE/Messenger/Instagram/web) ร้านต้องมีที่จดว่าลูกค้าคนนี้คือใคร ติดต่อทางไหน ติดแท็กอะไร และ **ยอมรับข่าวสารการตลาดหรือไม่** F23 (broadcast) และ F38 (ทักตาม) อ่านค่ายินยอมจากที่นี่ทุกครั้งก่อนส่ง · B3 ใช้แท็กและจำนวนลูกค้าทำรายงาน F24 จึงเป็นเจ้าของ "ข้อมูลที่ร้านเพิ่มเอง" ทั้งหมด ส่วนตัวตนและข้อความยังเป็นของ F09

ผู้ใช้: เจ้าของ/แอดมินร้าน (จัดการแท็ก กฎ ความยินยอม รวมตัวตน) · พนักงาน (ดูแผงลูกค้าในแชต ติด/ถอดแท็ก แก้เบอร์ติดต่อ) · ฟีเจอร์อื่น (อ่านผ่าน contract)

User stories:
1. พนักงานเปิดแชต เห็นแผงข้างขวา: ชื่อ ช่องทาง เห็นครั้งแรก/ล่าสุด แท็ก สถานะความยินยอม แล้วกดเพิ่มแท็ก "VIP" ให้ลูกค้าได้ทันที ไม่ต้องออกจากแชต
2. เจ้าของสร้างแท็ก "ลูกค้าเงียบ 30 วัน" พร้อมกฎ "ไม่ทักมา 30 วัน → ติดแท็ก, กลับมาทัก → ถอดแท็ก" แล้วเห็นผลหลังกฎรัน โดยแท็กที่พนักงานติดเองไม่เคยถูกกฎถอด
3. เจ้าของเปิดหน้า `/customers` กรองตามแท็ก/ความยินยอม/ช่องทาง ค้นด้วยชื่อหรือเบอร์ และเปิดโปรไฟล์ลูกค้าแก้เบอร์ อีเมล ที่อยู่ โน้ต
4. ลูกค้าคนเดียวกันทักทั้ง LINE และ Messenger: เจ้าของรวมสองตัวตนเป็นคนเดียว แท็ก/ติดต่อ/ความยินยอมใช้ร่วมกัน (ถ้าฝั่งใดปฏิเสธข่าวสาร ถือว่าปฏิเสธทั้งคน)
5. เจ้าของตั้งความยินยอมการตลาด granted/revoked/unknown ของลูกค้า (พนักงานถอนความยินยอมได้เสมอ แต่ให้ยินยอมต้องมีสิทธิ์สูงกว่า) F23/F38 ข้ามคนที่ไม่ใช่ granted/ถอนแล้วจริง
6. ลูกค้าของ eval (externalId ขึ้นต้น `eval-`) ไม่ปรากฏในรายการ จำนวน หรือ `customerCount`

นอกขอบเขต: ส่งข้อความหาลูกค้า (F23) · ให้โมเดลเดาแท็กเอง (F26 เรียก export `addInferredTag` เมื่อเสร็จ ถ้าไม่ทัน แท็ก `inferred` แสดงได้แต่ไม่มีใครเขียน) · import/export CSV ลูกค้า · stage/pipeline ของลูกค้า · รวมตัวตนอัตโนมัติโดยไม่ถามคน · ลบลูกค้า (เป็นงานของ core/F09)

## 2. Data model

`server/src/features/crm/migrations/001_crm.sql` (ไฟล์เดียวครบทุกตาราง: merge แล้วแก้ไม่ได้):

```sql
-- dependsOn: core
-- "person" = ตัวตนหลักของลูกค้าหนึ่งคน = id ของแถว customers ตัวแรกในกลุ่ม ลูกค้าที่ไม่เคยถูกรวม: person = id ของตัวเอง
-- ลูกค้าที่ถูกรวมมีแถวใน crm_person_members ชี้ไป person (ไม่มีโซ่: person_id ไม่เป็น member ของใครเสมอ)

CREATE TABLE crm_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 32),
  name_key text NOT NULL,                              -- NFKC + lowercase + ยุบช่องว่างซ้อน (คำนวณในโค้ด) ใช้กันชื่อซ้ำ
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 200),
  color text NOT NULL DEFAULT 'grey' CHECK (color IN ('grey','red','orange','amber','green','teal','blue','purple')),
  version int NOT NULL DEFAULT 1,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, name_key)
);

CREATE TABLE crm_person_members (
  customer_id uuid PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  merged_by uuid REFERENCES users(id),
  merged_at timestamptz NOT NULL DEFAULT now(),
  CHECK (customer_id <> person_id)
);
CREATE INDEX crm_person_members_person ON crm_person_members (person_id);

CREATE TABLE crm_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  enabled boolean NOT NULL DEFAULT true,
  kind text NOT NULL CHECK (kind IN ('inactive_days','new_customer_days','booking_count_gte','order_count_gte')),
  params jsonb NOT NULL,                               -- ตรวจด้วย zod ตาม kind (§3) ก่อนเขียนเสมอ
  tag_id uuid NOT NULL REFERENCES crm_tags(id) ON DELETE RESTRICT,
  last_run_at timestamptz,
  last_run_summary jsonb,                              -- { added, removed, skipped?: string, evaluated }
  version int NOT NULL DEFAULT 1,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crm_rules_business ON crm_rules (business_id, enabled);

CREATE TABLE crm_customer_tags (
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES crm_tags(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('manual','automation','inferred')),
  rule_id uuid REFERENCES crm_rules(id) ON DELETE SET NULL,   -- เฉพาะ source = 'automation'
  evidence text CHECK (evidence IS NULL OR char_length(evidence) <= 300),  -- เฉพาะ 'inferred'
  added_by uuid REFERENCES users(id),
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (person_id, tag_id)
);
CREATE INDEX crm_customer_tags_tag ON crm_customer_tags (business_id, tag_id);

-- พนักงานถอดแท็กที่กฎติดไว้ → กฎต้องไม่ติดซ้ำจนกว่าเงื่อนไขจะเลิกเป็นจริง (ลบตอนกฎรันแล้วเงื่อนไขไม่เป็นจริง)
CREATE TABLE crm_tag_suppressions (
  person_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES crm_tags(id) ON DELETE CASCADE,
  rule_id uuid NOT NULL REFERENCES crm_rules(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (person_id, tag_id)
);

CREATE TABLE crm_profiles (
  person_id uuid PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  phone text NOT NULL DEFAULT '' CHECK (char_length(phone) <= 32),
  phone_norm text NOT NULL DEFAULT '',                 -- เฉพาะตัวเลข ใช้ค้นหา/หาคู่รวมตัวตน
  email text NOT NULL DEFAULT '' CHECK (char_length(email) <= 254),
  email_norm text NOT NULL DEFAULT '',                 -- lowercase
  address text NOT NULL DEFAULT '' CHECK (char_length(address) <= 500),
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 2000),
  version int NOT NULL DEFAULT 1,
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crm_profiles_phone ON crm_profiles (business_id, phone_norm) WHERE phone_norm <> '';
CREATE INDEX crm_profiles_email ON crm_profiles (business_id, email_norm) WHERE email_norm <> '';

-- ไม่มีแถว = 'unknown'
CREATE TABLE crm_consents (
  person_id uuid PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('granted','revoked','unknown')),
  source text NOT NULL CHECK (source IN ('staff','customer','import','merge','seed','system')),
  actor_user_id uuid REFERENCES users(id),
  reason text NOT NULL DEFAULT '' CHECK (char_length(reason) <= 300),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE crm_consent_events (                      -- ประวัติ append-only
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  previous_status text NOT NULL,
  status text NOT NULL,
  source text NOT NULL,
  actor_user_id uuid REFERENCES users(id),
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crm_consent_events_person ON crm_consent_events (person_id, created_at DESC);
```

กฎ: ไม่แก้ตาราง core · ทุก query กรอง `business_id` (และตรวจ `customers.business_id` เมื่อรับ customer id จาก path) · ค่าคงที่ใน `config.ts`: `MAX_TAGS_PER_BUSINESS = 30` (เหตุผล: แผงในแชตต้องกวาดตาได้; Papi ใช้ 20) · `MAX_RULES_PER_BUSINESS = 20` · `TAG_NAME_MAX = 32` (นับ grapheme ด้วย `Intl.Segmenter`) · `EVAL_PREFIX = 'eval-'`

**ซ่อนลูกค้า eval:** ทุก SQL ที่แจกแจง/นับลูกค้าต้องมี `c.external_id NOT LIKE 'eval-%'` (helper `notEval('c')` ใน `repo.ts`) · `getCustomer(id)` ตรง ๆ ยังคืนข้อมูลได้ (เพื่อไม่ทำให้ flow AI ของ F37 พัง) แต่ `listCustomersByTags`, `listTags.customerCount`, `GET /customers`, `total`, ผลกฎ ไม่รวมลูกค้า eval

**Person resolution** (ใช้ซ้ำทุก query): `FROM customers c LEFT JOIN crm_person_members m ON m.customer_id = c.id` แล้วใช้ `COALESCE(m.person_id, c.id)` เป็น `person_id`

## 3. API endpoints

ทุก path ใต้ `/api/v1/businesses/:businessId/crm` · auth `business` · `defineFeatureRoutes({ featureId: 'F24', slug: 'crm' })` · ผู้ใช้ที่ "อ่านลูกค้า" = มี `chat.read` หรือ `broadcast.read` หรือ `insights.read` อย่างใดอย่างหนึ่ง (helper `requireAnyPermission(ctx, [...])` เช็คจาก `ctx.scope.permissions` ไม่มี → `PERMISSION_DENIED`)

| Method | Path | permission | Request | Response | Errors |
|---|---|---|---|---|---|
| GET | `/customers` | อ่านลูกค้า | `ListCustomersQuery` | `{ items: CrmCustomerRow[]; nextCursor: string \| null; total: number }` | VALIDATION_ERROR |
| GET | `/customers/:customerId` | อ่านลูกค้า | — | `CrmCustomerDetail` | NOT_FOUND |
| PATCH | `/customers/:customerId/profile` | `chat.reply` | `UpdateProfileBody` | `CrmCustomerDetail` | NOT_FOUND, VALIDATION_ERROR, VERSION_CONFLICT |
| POST | `/customers/:customerId/tags` | `chat.reply` (+ `broadcast.tags` ถ้าสร้างแท็กใหม่) | `AssignTagBody` | `CrmCustomerDetail` | NOT_FOUND, VALIDATION_ERROR, PERMISSION_DENIED, POLICY_BLOCKED (`tag_limit`) |
| DELETE | `/customers/:customerId/tags/:tagId` | `chat.reply` | — | `CrmCustomerDetail` | NOT_FOUND |
| PUT | `/customers/:customerId/consent` | ถอน (`revoked`) = `chat.reply` · อื่น ๆ = `broadcast.tags` | `SetConsentBody` | `CrmCustomerDetail` | NOT_FOUND, PERMISSION_DENIED |
| GET | `/customers/:customerId/merge-candidates` | `broadcast.tags` | — | `{ items: MergeCandidate[] }` | NOT_FOUND |
| POST | `/customers/:customerId/merge` | `broadcast.tags` | `MergeBody` | `CrmCustomerDetail` | NOT_FOUND, POLICY_BLOCKED (`same_person`, `different_business` ไม่เกิดเพราะ 404) |
| DELETE | `/customers/:customerId/members/:memberId` | `broadcast.tags` | — | `CrmCustomerDetail` | NOT_FOUND |
| GET | `/conversations/:conversationId/panel` | `chat.read` | — | `CustomerPanelData` | NOT_FOUND |
| GET | `/tags` | อ่านลูกค้า | — | `{ items: TagSummary[] }` (+ `description`, `color`, `version`, `ruleCount`) | — |
| POST | `/tags` | `broadcast.tags` | `CreateTagBody` | `CrmTag` (201) | VALIDATION_ERROR, POLICY_BLOCKED (`tag_limit`, `tag_exists` + `details.tagId`) |
| PATCH | `/tags/:tagId` | `broadcast.tags` | `UpdateTagBody` | `CrmTag` | NOT_FOUND, VERSION_CONFLICT, POLICY_BLOCKED (`tag_exists`) |
| DELETE | `/tags/:tagId` | `broadcast.tags` | — | no_content | NOT_FOUND, POLICY_BLOCKED (`tag_has_rules`) |
| GET | `/rules` | `broadcast.tags` | — | `{ items: CrmRule[] }` | — |
| POST | `/rules` | `broadcast.tags` | `CreateRuleBody` | `CrmRule` (201) | VALIDATION_ERROR, NOT_FOUND (tag), POLICY_BLOCKED (`rule_limit`, `rule_kind_unavailable`) |
| PATCH | `/rules/:ruleId` | `broadcast.tags` | `UpdateRuleBody` | `CrmRule` | NOT_FOUND, VERSION_CONFLICT, VALIDATION_ERROR |
| DELETE | `/rules/:ruleId` | `broadcast.tags` | — | no_content | NOT_FOUND |
| POST | `/rules/:ruleId/run` | `broadcast.tags` | — | `RuleRunResult` | NOT_FOUND |

Zod (`shared/features/crm/types.ts` ส่วนที่ web ใช้ร่วม, `server/.../schemas.ts` ที่เหลือ):

```ts
import { z } from 'zod';
export const TagColor = z.enum(['grey','red','orange','amber','green','teal','blue','purple']);
const TagName = z.string().trim().min(1).max(64); // นับ grapheme ≤ 32 ในโค้ด (VALIDATION_ERROR issue `name_too_long`)
export const ListCustomersQuery = z.object({
  q: z.string().trim().max(100).optional(),                        // ชื่อ (ILIKE) หรือตัวเลขเบอร์ (prefix ของ phone_norm) หรืออีเมล
  tagId: z.union([z.string().uuid(), z.array(z.string().uuid()).max(10)]).optional().transform(v => v === undefined ? [] : Array.isArray(v) ? v : [v]), // ANY
  consent: z.enum(['granted', 'revoked', 'unknown']).optional(),
  channel: z.enum(['web', 'line', 'facebook', 'instagram']).optional(),
  cursor: z.string().max(300).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export const UpdateProfileBody = z.object({
  expectedVersion: z.number().int().min(1),                         // profile.version ที่ UI เห็น (ยังไม่มีแถว = 1)
  phone: z.string().trim().max(32).refine(v => v === '' || /^[0-9+()\-\s.]{6,32}$/.test(v) && v.replace(/\D/g, '').length >= 8 && v.replace(/\D/g, '').length <= 15).optional(),
  email: z.union([z.literal(''), z.string().trim().toLowerCase().email().max(254)]).optional(),
  address: z.string().trim().max(500).optional(),
  note: z.string().trim().max(2000).optional(),
}).strict();                                                         // ฟิลด์ที่ไม่ส่ง = ไม่แก้ · '' = ล้างค่า
export const AssignTagBody = z.union([
  z.object({ tagId: z.string().uuid() }).strict(),
  z.object({ name: TagName, color: TagColor.optional() }).strict(),   // สร้างถ้าไม่มี (idempotent ด้วย name_key) แล้วติด
]);
export const SetConsentBody = z.object({
  status: z.enum(['granted', 'revoked', 'unknown']),
  reason: z.string().trim().max(300).default(''),
  attestation: z.boolean().default(false),                          // status 'granted' ต้องเป็น true (ร้านยืนยันว่าลูกค้ายินยอมแล้ว)
}).strict();
export const MergeBody = z.object({ sourceCustomerId: z.string().uuid() }).strict();
export const CreateTagBody = z.object({ name: TagName, description: z.string().trim().max(200).default(''), color: TagColor.default('grey') }).strict();
export const UpdateTagBody = z.object({ expectedVersion: z.number().int().min(1), name: TagName.optional(), description: z.string().trim().max(200).optional(), color: TagColor.optional() }).strict();
export const RuleParams = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('inactive_days'), days: z.number().int().min(1).max(3650), includeWeb: z.boolean().default(false) }),
  z.object({ kind: z.literal('new_customer_days'), days: z.number().int().min(1).max(90) }),
  z.object({ kind: z.literal('booking_count_gte'), count: z.number().int().min(1).max(50), statuses: z.array(z.enum(['booked', 'completed'])).min(1).default(['booked', 'completed']) }),
  z.object({ kind: z.literal('order_count_gte'), count: z.number().int().min(1).max(500) }),
]);
export const CreateRuleBody = z.object({ name: z.string().trim().min(1).max(60), tagId: z.string().uuid(), enabled: z.boolean().default(true), params: RuleParams }).strict();
export const UpdateRuleBody = z.object({ expectedVersion: z.number().int().min(1), name: z.string().trim().min(1).max(60).optional(), enabled: z.boolean().optional(), tagId: z.string().uuid().optional(), params: RuleParams.optional() }).strict();
```

```ts
export type TagSource = 'manual' | 'automation' | 'inferred';
export interface CrmTag { id: string; name: string; description: string; color: string; version: number; customerCount: number; ruleCount: number }
export interface CrmCustomerRow {
  id: string; displayName: string; channel: Channel; tags: { id: string; name: string; color: string; source: TagSource }[];
  marketingConsent: MarketingConsent; lastSeenAt: string | null; phone: string | null; memberCount: number; /* 1 = ไม่เคยรวม */
}
export interface CrmCustomerDetail extends CrmCustomerRow {
  externalIdMasked: string;                                  // 4 ตัวท้าย เช่น "…a3f1" (ไม่ส่ง externalId เต็มไป UI รายการ/รายละเอียด)
  firstSeenAt: string | null;
  contact: { phone: string | null; email: string | null; address: string | null }; note: string | null; profileVersion: number;
  members: { customerId: string; displayName: string; channel: Channel; lastSeenAt: string | null; isPrimary: boolean }[];
  consent: { status: MarketingConsent; source: string | null; updatedAt: string | null; history: { status: string; previousStatus: string; source: string; actorName: string | null; reason: string; createdAt: string }[] };
  lastConversationId: string | null;
}
export interface CustomerPanelData { customerId: string; detail: CrmCustomerDetail; canEditTags: boolean; canCreateTags: boolean; availableTags: { id: string; name: string; color: string }[]; mergeCandidateCount: number }
export interface MergeCandidate { customerId: string; displayName: string; channel: Channel; reason: 'same_phone' | 'same_email' }
export interface CrmRule { id: string; name: string; enabled: boolean; tagId: string; tagName: string; params: z.infer<typeof RuleParams>; lastRunAt: string | null; lastRunSummary: { added: number; removed: number; evaluated: number; skipped?: string } | null; version: number }
export interface RuleRunResult { added: number; removed: number; evaluated: number; skipped?: string }
```

`CrmCustomerRow.phone` ส่งเฉพาะคนที่อ่านลูกค้าได้ (ทุก route ของฟีเจอร์นี้อยู่หลังสิทธิ์นั้นอยู่แล้ว) · `GET /conversations/:id/panel` เรียก F09 `getConversation(id, { businessId })` (null → `NOT_FOUND`) แล้วใช้ `customerId` · cursor ของ `/customers` = base64url(JSON `{ sort, id }`) เรียง `last_seen_at DESC NULLS LAST, id`

## 4. Service functions และ contracts

ไฟล์ภายใน: `service.ts` (public) · `config.ts` · `schemas.ts` · `repo.ts` · `person.ts` (resolution, merge) · `tags.ts` · `consent.ts` · `automation.ts` (ประเมินกฎ) · `routes.ts` · `seed.ts` · `*.test.ts`

**Contract ต้องตรง `contracts.ts` ทุกตัวอักษร** (ห้ามเพิ่ม/ลดฟิลด์ใน `CustomerSummary`, `CustomerProfile`, `TagSummary`):

```ts
export declare function getCustomer(businessId: string, customerId: string): Promise<CustomerProfile | null>;
export declare function listCustomersByTags(
  businessId: string, tagIds: string[],
  opts?: { cursor?: string | null; limit?: number; requireConsent?: 'granted' },
): Promise<Page<CustomerSummary>>;
export declare function listTags(businessId: string): Promise<TagSummary[]>;
```

พฤติกรรม (ผูกกับ R3/R4 ของ contracts):

- `getCustomer`: ไม่พบ หรือเป็นของ business อื่น = **`null`** (ไม่ throw, ไม่แยกสองกรณี) · คืน `CustomerProfile`: `id/businessId/displayName/channel/externalId/lastSeenAt/firstSeenAt` จากแถว `customers` ของ id นั้น · `tags` + `tagIds` จาก **person** ของลูกค้า (รวมทุก source, เรียงชื่อ) · `contact`/`note` จาก `crm_profiles` ของ person (ไม่มีแถว = `{ phone: null, email: null, address: null }`, `note: null`; สตริงว่างในตาราง → `null`) · `marketingConsent` = สถานะของ person (ไม่มีแถว = `'unknown'`) · ใช้ได้กับลูกค้า `eval-*` (ไม่ซ่อน)
- `listCustomersByTags`: `tagIds` ว่าง = หน้าว่าง · tag id ที่ไม่ใช่ของร้านนี้ถูกทิ้งเงียบ ๆ (ไม่ใช่ error: F23 ตรวจกับ `listTags` เอง) · ลูกค้า **ที่ person มีแท็กใดแท็กหนึ่ง** (ANY) → ทุกตัวตน (customer id) ในกลุ่ม person นั้นถูกคืนเป็นแถวแยก (เพราะ broadcast ส่งต่อช่องทาง) · `requireConsent: 'granted'` ตัด revoked/unknown · ไม่รวม `eval-*` · เรียง `customers.created_at, id` · cursor = base64url(JSON `{ createdAt, id }`) · `limit` ค่าเริ่ม 50 สูงสุด 200 (เกิน → 200, `< 1` หรือไม่ใช่จำนวนเต็ม → `VALIDATION_ERROR`) · `lastSeenAt` เป็น ISO หรือ null
- `listTags`: ทุกแท็กของร้านเรียง `name` (collation `C` หลัง `name_key`) · `customerCount` = จำนวน **customer id** (ตัวตนต่อช่องทาง) ที่ person มีแท็กนั้น ไม่รวม `eval-*` · ร้านไม่มีแท็ก = `[]` · ตัวอย่าง SEED: ร้าน A → `[{ id: tag_vip_a, name: 'VIP', customerCount: 2 }]`, ร้าน B → `[{ id: tag_vip_b, name: 'VIP', customerCount: 1 }]`

### Contract additions

ไม่มี contract ใหม่ (`listTags`/`TagSummary` อยู่ใน `contracts.ts` แล้ว) · exports นอก contract ใน `service.ts` (ผู้ใช้ตกลงกันด้วย `NEED/DONE`, ไม่ต้องรอหัวหน้า merge):

```ts
/** Records the shop's marketing consent for the PERSON that owns customerId. 'revoked' always wins over concurrent grants:
 *  if the current status is 'revoked' and the caller sets 'granted' with source other than 'staff' → POLICY_BLOCKED.
 *  Consumers: A1 (a future STOP-keyword handler), A3 UI. Writes crm_consents + crm_consent_events + audit. */
export declare function setMarketingConsent(input: { businessId: string; customerId: string; status: MarketingConsent; source: 'staff' | 'customer' | 'import' | 'system'; actorUserId?: string | null; reason?: string }): Promise<{ status: MarketingConsent; changed: boolean }>;
/** For B3 F26. Adds an 'inferred' tag (never replaces manual/automation). tagName is created if missing only when allowCreate. */
export declare function addInferredTag(input: { businessId: string; customerId: string; tagId: string; evidence: string }): Promise<{ added: boolean }>;
```

ที่ F24 เรียกข้ามฟีเจอร์: F09 `getConversation(conversationId, { businessId })` (หาลูกค้าของแชต, ตรวจ tenant) · A2 `listOrdersByCustomer(businessId, customerId, { limit })` (กฎ `order_count_gte` เท่านั้น: ยังเป็น fake → คืน `[]` ถือว่าไม่ถึงเกณฑ์ ไม่ throw; throw `SERVICE_NOT_READY` → ข้ามกฎ `skipped: 'orders_not_ready'`) · F15 `countAppointmentsByCustomers` (ดู F15 spec §4; ไม่มี/throw → `skipped: 'booking_not_ready'`; **import แบบ lazy ใน `automation.ts` ด้วย `await import('../booking/service')` และจับ error ของ module ไม่พบ** เพื่อให้ F24 merge ได้ก่อน F15)

## 5. Algorithms

### 5.1 ชื่อแท็กและขีดจำกัด

`name_key` = `name.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()` · ว่างหลัง trim → `VALIDATION_ERROR` · นับ grapheme `[...new Intl.Segmenter('th', { granularity: 'grapheme' }).segment(name)].length > 32` → `VALIDATION_ERROR` (issue `name_too_long`) · สร้างแท็กที่ `name_key` ซ้ำ → `POLICY_BLOCKED` `details.reason='tag_exists'` + `details.tagId` · แท็กครบ 30 → `POLICY_BLOCKED` `tag_limit` · การสร้างแบบ create-or-get (จากแชต) ใช้ `INSERT … ON CONFLICT (business_id, name_key) DO NOTHING RETURNING id` แล้ว SELECT ถ้าไม่ได้แถว: ไม่ทับแท็กที่เพื่อนเพิ่งสร้างพร้อมกัน (นับ limit ก่อน INSERT ใน tx เดียว + advisory lock `crm:tags:<businessId>`)

### 5.2 ติด/ถอดแท็ก (ลำดับความสำคัญของ source)

ลำดับ `manual` > `automation` > `inferred` (ไม่เคยลดระดับ) · แถวคือ `(person_id, tag_id)` เดียว

| การกระทำ | แถวเดิม | ผล |
|---|---|---|
| staff ติด | ไม่มี | INSERT `manual` (`added_by`) |
| staff ติด | `automation` หรือ `inferred` | UPDATE → `manual`, `rule_id = NULL`, `evidence = NULL` (กฎจะไม่ถอดอีก; ยืนยันแท็ก inferred) + ลบ suppression ของคู่นี้ |
| staff ติด | `manual` | no-op (คืนเดิม ไม่ error) |
| กฎติด | ไม่มี และไม่มี suppression | INSERT `automation` + `rule_id` |
| กฎติด | มีแล้ว (ทุก source) หรือมี suppression | no-op |
| `addInferredTag` | ไม่มี | INSERT `inferred` + evidence · มีแล้ว = no-op |
| staff ถอด | `manual`/`inferred` | DELETE |
| staff ถอด | `automation` | DELETE + INSERT `crm_tag_suppressions (person, tag, rule_id)` |
| กฎถอด (เงื่อนไขไม่เป็นจริงแล้ว) | `automation` ที่ `rule_id` ตรงกฎนี้ | DELETE · `manual`/`inferred`/กฎอื่น = **ไม่แตะ** |

ทุกการเปลี่ยน: audit `crm.tag.assign` / `crm.tag.unassign` (`details: { tagId, source, via: 'staff'|'rule'|'inferred' }`, targetType `customer`) · `publish(businessId, { type:'custom', featureId:'F24', name:'crm.customer.changed', data:{ customerId } })` สำหรับทุกตัวตนในกลุ่ม person (แผงในแชตรีเฟรช) · การรันกฎ audit รวมครั้งเดียวต่อการรัน (`crm.rule.run` รวม added/removed) ไม่ audit ต่อลูกค้า

### 5.3 กฎแท็กอัตโนมัติ (trigger → condition → add/remove tag)

โครง: กฎหนึ่งตัว = `kind` (ตัวกำหนด **trigger** = ตอนที่ถูกประเมิน และ **condition**) + `tag_id` · เมื่อ condition จริง → ติดแท็ก (`automation`) · เมื่อเลิกเป็นจริง → ถอด (เฉพาะแถว `automation` ที่ `rule_id` = กฎนี้) · ปิดกฎ (`enabled=false`) = ไม่ทำอะไร และ **ไม่ถอด** แท็กที่ติดไปแล้ว (ถอดเองได้ หรือลบกฎ → `rule_id` กลายเป็น NULL แถวคงอยู่ในฐานะ automation ที่ไม่มีเจ้าของ; UI บอกก่อนลบ และเสนอ checkbox "ถอดแท็กที่กฎนี้ติดไว้ด้วย" ซึ่งทำ DELETE `source='automation' AND rule_id=$id` ก่อนลบกฎ)

| kind | Trigger (เมื่อประเมิน) | Condition (ต่อ person) |
|---|---|---|
| `inactive_days` {days, includeWeb=false} | schedule `crm.automation` ทุก 15 นาที + ปุ่มรันเอง | มี inbound อย่างน้อยหนึ่งครั้ง และ `now − lastInboundAt ≥ days × 24h` |
| `new_customer_days` {days} | เหมือนกัน | `now − firstSeenAt < days × 24h` (firstSeen = min `customers.first_seen_at` ของทุกตัวตนใน person) |
| `booking_count_gte` {count, statuses} | เหมือนกัน (เฉพาะ person ที่มีกิจกรรมใน 2 วันล่าสุด + รอบเต็มวันละครั้งเวลา 00:00–00:15 Bangkok) | จำนวนนัดสถานะใน `statuses` ของทุกตัวตนใน person ≥ count (จาก F15) |
| `order_count_gte` {count} | เหมือน `booking_count_gte` | จำนวนออเดอร์ที่ไม่ยกเลิกของทุกตัวตน ≥ count (จาก A2) |

**นาฬิกาของ inactivity (`inactive_days`):** `lastInboundAt(person) = MAX(conversations.last_inbound_at)` ของทุก customer id ใน person (ตาราง core อ่านอย่างเดียว; `last_inbound_at` ถูกเขียนโดย `saveMessage` ของ F09 เฉพาะข้อความขาเข้าจากลูกค้า ไม่ใช่ข้อความของ AI/staff/system) · ช่อง `web` (Demo Chat) ไม่นับเป็นกิจกรรมจริงของลูกค้าเมื่อ `includeWeb=false` (ตัดตัวตนช่อง web ออกจากการคำนวณทั้ง lastInbound และผู้สมัคร) · person ที่ไม่เคยมี inbound ไม่ติด (ไม่รู้ว่าเงียบตั้งแต่เมื่อไร)

**SQL ชุดประเมิน `inactive_days`** (`$1` business, `$2` includeWeb, `$3` cutoff = now − days×24h; `automation.ts` ส่ง `now` เข้ามาเพื่อให้ test ใช้ `CLOCK_FIXTURE`):

```sql
SELECT p.person_id
FROM (
  SELECT COALESCE(m.person_id, c.id) AS person_id, MAX(cv.last_inbound_at) AS last_in
  FROM customers c
  LEFT JOIN crm_person_members m ON m.customer_id = c.id
  JOIN conversations cv ON cv.customer_id = c.id AND cv.business_id = c.business_id
  WHERE c.business_id = $1 AND c.external_id NOT LIKE 'eval-%'
    AND ($2::boolean OR c.channel <> 'web') AND cv.last_inbound_at IS NOT NULL
  GROUP BY 1
) p
WHERE p.last_in <= $3;
```

**ใช้ผล (ทุก kind ร่วมกัน; ใน tx เดียวต่อกฎ ภายใต้ advisory lock `crm:rule:<ruleId>` กันสองรอบทับกัน):**
1. `met = ` ชุด person ที่ condition จริง (อาจใหญ่: จำกัด 5,000 person ต่อรอบ เรียงตาม person_id; เกิน → ทำต่อรอบถัดไปไม่ได้เพราะเป็น set-based ทั้งชุด จึงถือว่าไม่รองรับร้านเกิน 5,000 ลูกค้าในวันงาน: `skipped: 'too_many'` + log warn)
2. ติด: `INSERT INTO crm_customer_tags (…source 'automation', rule_id) SELECT … FROM unnest($met) WHERE NOT EXISTS (suppression) ON CONFLICT (person_id, tag_id) DO NOTHING` → `added = rowCount`
3. ถอด: `DELETE FROM crm_customer_tags WHERE tag_id = $tag AND rule_id = $rule AND source = 'automation' AND person_id <> ALL($met)` → `removed`
4. ล้าง suppression ที่ condition เลิกจริง: `DELETE FROM crm_tag_suppressions WHERE rule_id = $rule AND person_id <> ALL($met)`
5. `UPDATE crm_rules SET last_run_at = now, last_run_summary = {added, removed, evaluated: |met|}` · audit `crm.rule.run` · ถ้า `added+removed > 0` publish `crm.customers.changed` (หน้ารายการรีโหลด)
6. kind ที่เรียกฟีเจอร์อื่น: ถ้าฟีเจอร์เจ้าของยังไม่พร้อม (import ไม่ได้/`SERVICE_NOT_READY`) → ข้ามทั้งกฎ ตั้ง `last_run_summary.skipped` โดยไม่เปลี่ยนแท็ก (ห้ามถอดแท็กเพราะข้อมูลไม่พร้อม) · `POST /rules` ของ kind นั้นเมื่อฟีเจอร์เจ้าของไม่พร้อม = `POLICY_BLOCKED` `rule_kind_unavailable`

ตัวอย่างที่ test ต้องได้ (CLOCK_FIXTURE `2026-11-21T03:00:00Z`, `days = 30`): ลูกค้า X inbound ล่าสุด `2026-10-21T03:00:00Z` (31 วันพอดี) → ติด · inbound `2026-10-23T03:00:00Z` (29 วัน) → ไม่ติด · X ทักใหม่ (`last_inbound_at = 2026-11-21T02:00:00Z`) แล้วรันซ้ำ → แท็กถูกถอด · แท็ก `VIP` ที่ staff ติดไว้ (manual) ยังอยู่ทุกกรณี · แท็กเดียวกันที่ staff ติดซ้อนบน automation → เป็น manual แล้วกฎถอดไม่ได้

### 5.4 รวมตัวตนต่อช่องทาง (merge)

ตัวตนในระบบคือ `(business, channel, externalId)` ใน `customers` (F09 เป็นผู้สร้าง) · F24 **ไม่รวมอัตโนมัติ** · `GET …/merge-candidates` เสนอตัวตนอื่นในร้านเดียวกันที่ `phone_norm` เท่ากัน (ไม่ว่าง) หรือ `email_norm` เท่ากัน (ไม่ว่าง) กับ person ของลูกค้านี้ (ไม่รวมตัวตนที่อยู่ person เดียวกันแล้ว, ไม่รวม `eval-*`) · การรวมต้องกดยืนยันโดยคนที่มี `broadcast.tags` (ห้ามรวมด้วยชื่อเหมือน: ไม่มีสัญญาณที่ปลอดภัย)

`POST /customers/:customerId/merge { sourceCustomerId }` (ใน tx + advisory lock `crm:merge:<businessId>`):
1. โหลดทั้งสองแถว `customers` ของร้านนี้ (ไม่พบ → `NOT_FOUND`) · `P = person(:customerId)`, `S = person(source)` · `P = S` → `POLICY_BLOCKED` `same_person`
2. ย้ายสมาชิก: ทุกสมาชิกของ S (รวม S เอง) → `INSERT/UPDATE crm_person_members SET person_id = P` · แล้วไม่มีโซ่ (S ไม่เป็น person อีก)
3. **tags:** union ของ `crm_customer_tags` ของ S เข้า P · แถวซ้ำเก็บ source สูงกว่า (manual > automation > inferred) · ลบแถวของ S · ย้าย suppressions ที่ไม่ชนเข้า P
4. **profile:** ต่อฟิลด์ phone/email/address: ค่าของ P ที่ไม่ว่างชนะ ไม่ว่างค่อยใช้ของ S · `note` = `P.note` + `\n---\n` + `S.note` (ถ้าทั้งคู่ไม่ว่าง) ตัดที่ 2000 · คำนวณ `*_norm` ใหม่ · `version+1` · ลบแถว profile ของ S
5. **consent (ปลอดภัยไว้ก่อน):** ถ้าฝั่งใดฝั่งหนึ่ง `revoked` → `revoked` · ไม่งั้นถ้าฝั่งใดฝั่งหนึ่ง `granted` → `granted` · ไม่งั้น `unknown` (ไม่มีแถว) · เขียน event `source='merge'` ถ้าสถานะของ P เปลี่ยน · ลบแถว consent ของ S
6. audit `crm.customer.merge` (`details: { primary, merged, fields: ['tags','profile','consent'] }` ไม่ใส่ค่าเบอร์/อีเมล) · publish `crm.customer.changed` ทุกตัวตน
7. ผลต่อภายนอก: `getCustomer(id)` ของทุกตัวตนในกลุ่มคืน tags/contact/consent เดียวกัน · `listCustomersByTags` คืนทุกตัวตน (แถวแยกต่อช่องทาง; F23 ตัดซ้ำด้วย customer id เท่านั้น จึงลูกค้าที่รวมแล้วอาจได้ข้อความทั้งสองช่องทาง ซึ่งตั้งใจ: คนละช่อง = คนละที่อยู่ส่ง) · `listTags.customerCount` นับตัวตน
8. **ยกเลิกการรวม** `DELETE …/members/:memberId`: ลบแถว member (memberId ต้องเป็นสมาชิกของ person นี้ ไม่ใช่ตัวหลัก, ไม่งั้น `NOT_FOUND`) · ตัวตนที่แยกออกได้ **consent เดียวกับ person ตอนแยก** (คัดลอกแถว consent เพื่อไม่ให้ revoked หายไป) · แท็ก/ติดต่อ **ไม่คัดลอก** (เริ่มว่าง) · audit `crm.customer.unmerge`

### 5.5 ความยินยอมการตลาด (`MarketingConsent`)

เก็บที่ `crm_consents` ต่อ person · `getCustomer().marketingConsent` เป็นช่องทางเดียวที่ F23/F38 อ่าน (และ `listCustomersByTags({ requireConsent })`) · ผู้ส่งต้องตรวจซ้ำตอนส่งเสมอ (ตามที่ F23 ทำ)

- ค่าเริ่ม `unknown` (ไม่มีแถว) → F23 ข้าม (marketing ต้องเป็น granted) · F38 ข้ามเฉพาะ `revoked`
- เปลี่ยนค่า: `setMarketingConsent` (UPDATE/INSERT แถว + INSERT `crm_consent_events` + audit `crm.consent.change` `details: { from, to, source }` ไม่ใส่ข้อมูลติดต่อ)
- **กฎสิทธิ์ใน route:** `revoked` ← `chat.reply` พอ (ถอนง่าย) · `granted` และการล้างกลับ `unknown` ← `broadcast.tags` · `granted` ต้อง `attestation: true` (UI เป็น checkbox "ลูกค้ายินยอมรับข่าวสารแล้ว") และ `reason` (เช่น "ลูกค้าพิมพ์ขอรับโปรทางแชต") ไม่งั้น `VALIDATION_ERROR`
- **`revoked` ชนะ:** `setMarketingConsent` ที่ source ≠ `staff` พยายามเปลี่ยนจาก `revoked` เป็นอย่างอื่น → `POLICY_BLOCKED` (`revoked_is_sticky`); staff เปลี่ยนได้ (บันทึกประวัติ) · merge ตาม §5.4 ข้อ 5
- seed จาก `SEED.customers[].consent`: `granted`/`revoked` เขียน `source='seed'`; `unknown` ไม่เขียนแถว

### 5.6 ค้นหา/แบ่งหน้า `GET /customers`

SQL เดียวด้วย person resolution: `FROM customers c LEFT JOIN crm_person_members m … LEFT JOIN crm_profiles p ON p.person_id = COALESCE(m.person_id, c.id) LEFT JOIN crm_consents k ON k.person_id = …` · เงื่อนไข `c.business_id = $1 AND notEval` · `q`: ตัวเลขล้วน ≥ 3 ตัว → `p.phone_norm LIKE $q || '%'` OR ชื่อ · มี `@` → `p.email_norm LIKE lower($q) || '%'` · อื่น ๆ → `c.display_name ILIKE '%' || escapeLike($q) || '%'` · `tagId[]` = `EXISTS (SELECT 1 FROM crm_customer_tags t WHERE t.person_id = person AND t.tag_id = ANY($tags))` · `consent` = `COALESCE(k.status,'unknown') = $consent` · แถวต่อ **ตัวตน** (ไม่ยุบ person: ผู้ใช้เห็น "LINE: นาย ก", "Messenger: นาย ก" และ chip `memberCount`) · `total` = `count(*)` ด้วยเงื่อนไขเดียวกัน (ตัวเลขนี้ไม่รวม `eval-*`) · แท็กของแต่ละแถวดึงรอบเดียวด้วย `WHERE person_id = ANY($ids)` (ไม่ N+1) · `escapeLike` escape `% _ \`

### 5.7 ที่อยู่ติดต่อและ PII

`phone_norm = phone.replace(/\D/g, '')` · `email_norm = email.toLowerCase()` · ตรวจรูปแบบตาม zod เท่านั้น ไม่ยืนยันว่าเบอร์/อีเมลใช้ได้จริง · ฟิลด์ติดต่อและโน้ต **ไม่ถูกส่งให้โมเดล** โดย F24 และไม่อยู่ใน `CustomerSummary` (มีแค่ใน `CustomerProfile.contact`) · UI รายการแสดงเบอร์ได้ (ผู้ใช้ผ่านสิทธิ์อ่านลูกค้าแล้ว) แต่ audit/log ไม่เก็บค่า

## 6. AI calls

ไม่มี AI call (F24 ไม่เรียก `model.*`) · แท็ก `inferred` ถูกเขียนโดย F26 ผ่าน `addInferredTag` เท่านั้น: F24 ตรวจ tenant + `tagId` เป็นของร้าน + `evidence` 1–300 ตัวอักษร + ไม่ทับ manual/automation · ค่าที่โมเดลเดาแสดงเป็น "AI เดา" (ไม่ใช่ข้อเท็จจริง) ใน UI และไม่ถูกนับเป็นเหตุผลให้ F23/F38 ส่งข้อความ

## 7. UI

**Route:** `/customers` (`permission:'chat.read'` ที่ route; API ยอมรับ `broadcast.read`/`insights.read` ด้วย แต่ UI เมนูใช้ `chat.read` ตาม F01) · `/customers/:customerId` (หน้ารายละเอียดเต็ม) · `titleKey:'crm:page.title'` · เมนู `{ path:'/customers', labelKey:'crm:menu.title', group:'customers', icon:'PeopleAltOutlined', order:10, permission:'chat.read', searchTerms:['ลูกค้า','crm','แท็ก','tag','customer'] }`

**หน้า `/customers`** (`CustomersPage.tsx`, MUI `Tabs`): 
1. แท็บ **ลูกค้า**: `PageHeader` + แถบกรอง (ค้นหา · เลือกแท็ก (หลายตัว) · ความยินยอม · ช่องทาง) + `DataTable` คอลัมน์ ชื่อ (+ ป้ายช่องทาง) · แท็ก (`TagChip`) · ความยินยอม (`StatusChip`) · เบอร์ · เห็นล่าสุด (`formatDateTime`) · กดแถว → หน้า `/customers/:id` · ท้ายตารางแสดง `total` และปุ่ม "โหลดเพิ่ม" (cursor)
2. แท็บ **แท็ก** (ต้องมี `broadcast.tags` มิฉะนั้นอ่านอย่างเดียว): `DataTable` ชื่อ · คำอธิบาย · สี · จำนวนลูกค้า · จำนวนกฎ + `FormDialog` สร้าง/แก้ + `ConfirmDialog` ลบ (บล็อกถ้ามีกฎ แสดงข้อความ `tag_has_rules`)
3. แท็บ **กฎอัตโนมัติ** (ต้องมี `broadcast.tags`): รายการกฎ (ชื่อ · เงื่อนไขอ่านง่าย "ไม่ทักมา 30 วัน → แท็ก X" · เปิด/ปิด Switch · รันล่าสุด + ผล) + `FormDialog` เลือก kind → ฟิลด์ตาม kind + แท็ก + ปุ่ม "รันเดี๋ยวนี้" → toast "ติด n ถอด m" · kind ที่ฟีเจอร์เจ้าของไม่พร้อมถูก disable พร้อมคำอธิบาย

**หน้า `/customers/:customerId`** (`CustomerDetailPage.tsx`): `SectionCard` โปรไฟล์ (ฟอร์มเบอร์/อีเมล/ที่อยู่/โน้ต + บันทึกด้วย `expectedVersion`; `VERSION_CONFLICT` → toast + โหลดใหม่) · `SectionCard` แท็ก (chip + ปุ่มเพิ่ม/ถอด; รูปแบบ chip: manual = ทึบ, automation = เส้นขอบ + ไอคอนฟันเฟือง + tooltip "ติดโดยกฎ <ชื่อ>", inferred = เส้นประ + ไอคอน AI + tooltip "AI เดา: <evidence> (ยังไม่ยืนยัน)" + ปุ่มเล็ก "ยืนยัน") · `SectionCard` ความยินยอม (สถานะ + ประวัติ 10 รายการ + ปุ่มเปลี่ยน → `FormDialog` มี checkbox attestation เมื่อเลือก granted; ปุ่ม "ปฏิเสธข่าวสาร" ทำได้ทุกคนที่มี `chat.reply`) · `SectionCard` ตัวตนที่รวมกัน (รายการ member + ปุ่ม "รวมกับ…" เปิดรายการ candidates + `ConfirmDialog` อธิบายผล (แท็ก/ติดต่อ/ความยินยอมจะใช้ร่วมกัน; ถ้ามีฝั่งปฏิเสธ = ปฏิเสธทั้งคน) + ปุ่ม "แยกออก") · ปุ่ม "เปิดแชต" (`/chat?c=<lastConversationId>`)

**Slot `chatSidePanels`** (`CustomerPanel.tsx`, contribution `{ slot:'chatSidePanels', id:'crm.customer-panel', labelKey:'crm:panel.title', order:10, permission:'chat.read', load: () => import('./CustomerPanel') }`, host ส่ง prop `{ conversationId }`): เรียก `GET /crm/conversations/:conversationId/panel` (`useApiQuery`) · แสดง ชื่อ + ช่องทาง + "เห็นครั้งแรก/ล่าสุด" · chip ความยินยอม · แท็กทั้งหมดเป็น chip (ถอดด้วย × เมื่อ `canEditTags`) · `Autocomplete` เพิ่มแท็ก (ตัวเลือก = `availableTags`; พิมพ์ชื่อใหม่ → ตัวเลือก "สร้างแท็ก '<ชื่อ>'" เมื่อ `canCreateTags`) · ฟิลด์เบอร์ อีเมล โน้ต แก้ได้ในแผง (บันทึกเมื่อ blur ด้วย `PATCH profile`) · ถ้า `mergeCandidateCount > 0` แสดง Alert "อาจเป็นลูกค้าคนเดียวกับ n ตัวตน" + ลิงก์ไปหน้ารายละเอียด · ลิงก์ "ดูโปรไฟล์ทั้งหมด" · realtime `useRealtime('custom', e => e.featureId==='F24' && refetch())` · `data-testid`: `crm-panel`, `crm-tag-add` (input), `crm-tag-chip`, `crm-phone`, `crm-consent-chip`

States: รายการ = `DataTable loading` / `EmptyState` "ยังไม่มีลูกค้า ลองคุยใน Demo Chat" / error `EmptyState` + ปุ่มลองใหม่ · แผงข้าง: skeleton / error บรรทัดเดียวพร้อมลองใหม่ (แผงล้มต้องไม่ทำให้หน้าแชตพัง: ห่อด้วย error boundary ของ host)

i18n (namespace `crm`, ไฟล์ `web/src/features/crm/i18n/{th,en}.json`):

| key | th | en |
|---|---|---|
| `menu.title` | ลูกค้า | Customers |
| `page.title` | ลูกค้า | Customers |
| `tabs.customers` | ลูกค้า | Customers |
| `tabs.tags` | แท็ก | Tags |
| `tabs.rules` | กฎอัตโนมัติ | Automation |
| `filter.search` | ค้นหาชื่อ เบอร์ หรืออีเมล | Search name, phone or email |
| `filter.tags` | แท็ก | Tags |
| `filter.consent` | ความยินยอม | Consent |
| `filter.channel` | ช่องทาง | Channel |
| `list.total` | ทั้งหมด {{count}} ราย | {{count}} customers |
| `list.loadMore` | โหลดเพิ่ม | Load more |
| `list.name` | ชื่อ | Name |
| `list.tags` | แท็ก | Tags |
| `list.consent` | ความยินยอม | Consent |
| `list.phone` | เบอร์ | Phone |
| `list.lastSeen` | เห็นล่าสุด | Last seen |
| `list.linked` | รวม {{count}} ช่องทาง | {{count}} linked |
| `list.empty` | ยังไม่มีลูกค้า ลองคุยใน Demo Chat | No customers yet. Try Demo Chat |
| `consent.granted` | ยินยอมรับข่าวสาร | Opted in |
| `consent.revoked` | ปฏิเสธข่าวสาร | Opted out |
| `consent.unknown` | ยังไม่ระบุ | Not recorded |
| `consent.title` | ความยินยอมการตลาด | Marketing consent |
| `consent.attestation` | ลูกค้ายินยอมรับข่าวสารแล้ว | The customer has agreed to receive promotions |
| `consent.reason` | เหตุผล/หลักฐานสั้น ๆ | Short reason or evidence |
| `consent.revoke` | ปฏิเสธข่าวสาร | Mark as opted out |
| `consent.history` | ประวัติ | History |
| `consent.changed` | อัปเดตความยินยอมแล้ว | Consent updated |
| `profile.title` | ข้อมูลติดต่อ | Contact details |
| `profile.phone` | เบอร์โทร | Phone |
| `profile.email` | อีเมล | Email |
| `profile.address` | ที่อยู่ | Address |
| `profile.note` | โน้ต | Note |
| `profile.saved` | บันทึกแล้ว | Saved |
| `profile.conflict` | มีคนแก้ข้อมูลนี้ไปแล้ว โหลดใหม่ให้แล้ว | Someone changed this. Reloaded |
| `profile.phoneInvalid` | เบอร์ไม่ถูกต้อง | Invalid phone number |
| `profile.emailInvalid` | อีเมลไม่ถูกต้อง | Invalid email |
| `tags.title` | แท็ก | Tags |
| `tags.add` | เพิ่มแท็ก | Add tag |
| `tags.create` | สร้างแท็ก "{{name}}" | Create tag "{{name}}" |
| `tags.name` | ชื่อแท็ก | Tag name |
| `tags.description` | คำอธิบาย | Description |
| `tags.color` | สี | Colour |
| `tags.customerCount` | ลูกค้า | Customers |
| `tags.ruleCount` | กฎ | Rules |
| `tags.source.manual` | ติดโดยพนักงาน | Added by staff |
| `tags.source.automation` | ติดโดยกฎ {{rule}} | Added by rule {{rule}} |
| `tags.source.inferred` | AI เดา: {{evidence}} (ยังไม่ยืนยัน) | AI guess: {{evidence}} (unconfirmed) |
| `tags.confirm` | ยืนยัน | Confirm |
| `tags.deleteTitle` | ลบแท็กนี้? | Delete this tag? |
| `tags.deleteHasRules` | ลบไม่ได้ ยังมีกฎใช้แท็กนี้อยู่ | Cannot delete: a rule still uses this tag |
| `tags.limit` | มีแท็กครบ 30 แล้ว | The 30-tag limit is reached |
| `tags.exists` | มีแท็กชื่อนี้แล้ว | A tag with this name already exists |
| `tags.nameTooLong` | ชื่อแท็กยาวเกิน 32 ตัวอักษร | Tag name is longer than 32 characters |
| `tags.empty` | ยังไม่มีแท็ก | No tags yet |
| `rules.title` | กฎอัตโนมัติ | Automation rules |
| `rules.add` | เพิ่มกฎ | Add rule |
| `rules.kind.inactive_days` | ลูกค้าไม่ทักมา N วัน | Customer silent for N days |
| `rules.kind.new_customer_days` | ลูกค้าใหม่ใน N วัน | New customer within N days |
| `rules.kind.booking_count_gte` | มีนัดตั้งแต่ N ครั้ง | At least N bookings |
| `rules.kind.order_count_gte` | สั่งซื้อตั้งแต่ N ครั้ง | At least N orders |
| `rules.days` | จำนวนวัน | Days |
| `rules.count` | จำนวนครั้ง | Count |
| `rules.includeWeb` | นับ Demo Chat (เว็บ) ด้วย | Include Demo Chat (web) |
| `rules.explain.inactive_days` | ไม่ทักมา {{days}} วัน → ติดแท็ก "{{tag}}" · ลูกค้ากลับมาทัก → ถอดแท็กนี้ (ไม่ถอดแท็กที่พนักงานติดเอง) | Silent {{days}} days → add "{{tag}}" · customer writes again → remove it (never removes tags added by staff) |
| `rules.run` | รันเดี๋ยวนี้ | Run now |
| `rules.ran` | ติด {{added}} ถอด {{removed}} | Added {{added}}, removed {{removed}} |
| `rules.lastRun` | รันล่าสุด {{time}} | Last run {{time}} |
| `rules.skipped` | ข้ามรอบนี้: ฟีเจอร์ที่เกี่ยวข้องยังไม่พร้อม | Skipped: the related feature is not ready |
| `rules.unavailable` | ยังใช้ไม่ได้ (ฟีเจอร์ที่เกี่ยวข้องยังไม่เปิด) | Not available yet |
| `rules.deleteWithTags` | ถอดแท็กที่กฎนี้ติดไว้ด้วย | Also remove tags this rule added |
| `merge.title` | ตัวตนที่รวมกัน | Linked identities |
| `merge.candidates` | อาจเป็นลูกค้าคนเดียวกัน | Possibly the same person |
| `merge.reason.same_phone` | เบอร์เดียวกัน | Same phone |
| `merge.reason.same_email` | อีเมลเดียวกัน | Same email |
| `merge.action` | รวมกับตัวตนนี้ | Merge with this identity |
| `merge.confirm` | แท็ก ข้อมูลติดต่อ และความยินยอมจะใช้ร่วมกัน ถ้าฝั่งใดปฏิเสธข่าวสาร จะถือว่าปฏิเสธทั้งคน | Tags, contact details and consent will be shared. If either side opted out, the whole person is opted out |
| `merge.done` | รวมแล้ว | Merged |
| `merge.split` | แยกออก | Unlink |
| `panel.title` | ลูกค้า | Customer |
| `panel.firstSeen` | เห็นครั้งแรก | First seen |
| `panel.lastSeen` | เห็นล่าสุด | Last seen |
| `panel.mergeHint` | อาจเป็นลูกค้าคนเดียวกับอีก {{count}} ตัวตน | May be the same person as {{count}} other identities |
| `panel.openProfile` | ดูโปรไฟล์ทั้งหมด | View full profile |
| `panel.openChat` | เปิดแชต | Open chat |
| `common.retry` | ลองใหม่ | Retry |
| `common.save` | บันทึก | Save |
| `common.readOnly` | คุณดูได้อย่างเดียว | You have read-only access |

## 8. Jobs, schedules, events

| รายการ | ค่า |
|---|---|
| Schedule `crm.automation` | `everySeconds: 900` · handler: ต่อ business ที่มีกฎ `enabled` ประเมินทุกกฎด้วย `now = new Date()` (ฟังก์ชันรับ `now` เป็นพารามิเตอร์เพื่อ test) · ข้าม business ที่ไม่ active (F03) · กฎ `booking_count_gte`/`order_count_gte` รอบเต็มเฉพาะ 00:00–00:15 Bangkok มิฉะนั้นเฉพาะ person ที่มีกิจกรรม ≤ 2 วัน · dedup โดย core (`<name>@<slot>`) · ข้อผิดพลาดของกฎหนึ่งตัวไม่ทำให้กฎอื่นหยุด (จับต่อกฎ, log `warn` ไม่มีข้อมูลลูกค้า) |
| Jobs | ไม่มี job รายตัว (ไม่มี I/O ภายนอก) |
| Realtime | `publish(businessId, { type:'custom', featureId:'F24', name:'crm.customer.changed', data:{ customerId } })` · `name:'crm.customers.changed'` (หลังกฎรันที่มีการเปลี่ยน) |
| Audit | `crm.tag.create/update/delete` · `crm.tag.assign/unassign` · `crm.profile.update` (`details.fields` = ชื่อฟิลด์ที่เปลี่ยน ไม่ใส่ค่า) · `crm.consent.change` · `crm.customer.merge/unmerge` · `crm.rule.create/update/delete/run` |
| notify | ไม่มี |
| `model_usage` | ไม่มี |

## 9. Seed และ fixtures

`server/src/features/crm/seed.ts` (`FeatureSeed`, `dependsOn: ['core']`, idempotent `ON CONFLICT DO NOTHING`):
- แท็ก: `SEED.tags` ทั้งสอง (id ตาม SEED, `name 'VIP'`, `name_key 'vip'`, `color 'amber'`) · `crm_customer_tags` ตาม `customerAliases` (`person_id = customer id`, `source 'manual'`, `added_by` = owner ของร้าน) → ร้าน A: cust_a1 + cust_a2, ร้าน B: cust_b1
- consent จาก `SEED.customers[].consent`: cust_a1 granted, cust_a2 revoked, cust_b1 granted (`source 'seed'`) · cust_b2 unknown (ไม่มีแถว)
- `crm_profiles`: ไม่ seed (null ทั้งหมด ตาม `@fake`)
- `crm_rules`: ร้าน A หนึ่งกฎ `inactive_days` 30 วัน → แท็กใหม่ "ลูกค้าเงียบ" (id คงที่ derived ด้วย uuid v5 จาก `crm:tag:quiet:<businessId>` ในโค้ด seed) `enabled false` (ไม่รันเองบน production จนกว่าเจ้าของเปิด)
- `runDemo(ctx)` (ร้าน A): สร้างลูกค้าเดโม 6 ราย (externalId `demo-crm-1…6` ช่อง line/facebook ผสม, ชื่อสังเคราะห์ เช่น "ลูกค้าเดโม 1") + แถว `conversations` ที่ `last_inbound_at` ห่างกัน 2/10/45/90 วัน (ผ่านเครื่องมือ seed ของ F09 ถ้ามี ไม่งั้น INSERT ตรง `ON CONFLICT DO NOTHING` ตามที่ core อนุญาตให้ seed) + ติดแท็ก VIP/"ลูกค้าเงียบ" บางราย + เบอร์สังเคราะห์ `0800000001…` · `resetDemo(ctx)`: ลบ `crm_*` ของร้านเดโมที่ผูกกับลูกค้า `demo-crm-*` และคืนค่า SEED consent/แท็กของ cust_a1/a2 (ลบ assignment ที่ไม่ใช่ seed, ลบ profile, ลบ member, ลบ events)

Fixtures (สร้างด้วยโค้ดใน test): `CLOCK_FIXTURE` + `vi.useFakeTimers({ now, toFake: ['Date'] })` · ลูกค้าใหม่ต่อ test ด้วย `saveMessage` หรือ INSERT ตรงเข้า `customers`/`conversations` ใน test helper ของ F24 (externalId `e2e-<ts>-<n>` สำหรับ smoke, `crm-test-<n>` สำหรับ unit; กรณี eval ใช้ `eval-case-1`) · ผู้ใช้ SEED `owner_a`, `staff_a`, `owner_b`

## 10. Tests

Unit/service (`MODEL_MODE=fake`, `CLOCK_FIXTURE`):

| ไฟล์ | case |
|---|---|
| `contract.test.ts` | `getCustomer(biz_a, cust_a1)` = ชื่อ "A Customer One" ช่อง line consent granted tags [VIP] · `getCustomer(biz_a, cust_b1)` = `null` · id ไม่มีอยู่ = `null` · `getCustomer(biz_a, cust_a2).marketingConsent === 'revoked'` · `listCustomersByTags(biz_a,[tag_vip_a])` = cust_a1 + cust_a2 · `{ requireConsent: 'granted' }` = cust_a1 อย่างเดียว · `listCustomersByTags(biz_a,[tag_vip_b])` = ว่าง (tag ต่างร้านทิ้งเงียบ) · `[]` = ว่าง · `limit: 0` = `VALIDATION_ERROR` · cursor ต่อหน้าได้ครบไม่ซ้ำ (สร้าง 5 ลูกค้า limit 2) · `listTags(biz_a)` = `[{VIP, 2}]`, `listTags(biz_b)` = `[{VIP, 1}]` ต่าง id · ลูกค้า `eval-x` ที่ติด VIP ไม่นับใน `customerCount` ไม่อยู่ใน list · shape ตรง `CustomerSummary` (ไม่มีฟิลด์เกิน: ตรวจด้วย `Object.keys`) |
| `tags.test.ts` | ชื่อซ้ำไม่สนตัวพิมพ์/ช่องว่าง (`VIP` vs ` vip `) = `tag_exists` · 33 grapheme = VALIDATION_ERROR · ภาษาไทยที่มีสระซ้อน นับ grapheme ถูก · ครบ 30 = `tag_limit` · create-or-get สองคำขอพร้อมกันชื่อเดียว = แท็กเดียวทั้งคู่ติดได้ · ลบแท็กที่มีกฎ = `tag_has_rules` · ลบแท็กที่ไม่มีกฎ ล้าง assignment |
| `assign.test.ts` | ตาราง §5.2 ทุกแถว: manual ทับ automation (rule_id → NULL) · automation ไม่ทับ manual · ถอด automation สร้าง suppression · กฎติดซ้ำไม่ได้ขณะมี suppression · suppression ล้างเมื่อ condition เลิกจริง · `addInferredTag` ไม่ทับของเดิม |
| `automation.test.ts` | inactivity ตามตัวอย่าง §5.3 (31 วัน ติด / 29 วัน ไม่ติด / ทักใหม่ถอด) · `includeWeb=false` ไม่นับช่อง web · ไม่มี inbound ไม่ติด · **manual VIP ไม่ถูกถอดแม้เงื่อนไขหาย** · ปิดกฎ = ไม่ถอดของเดิม · รันซ้ำสองรอบผลเท่าเดิม (idempotent) · สองรอบพร้อมกัน = ไม่ error ไม่ซ้ำ (advisory lock) · `new_customer_days` · kind ที่ฟีเจอร์ไม่พร้อม → `skipped` แท็กไม่เปลี่ยน · ลูกค้า eval ไม่ติด |
| `merge.test.ts` | รวม LINE+Messenger: tags union (manual ชนะ), profile ค่าไม่ว่างของตัวหลักชนะ, note ต่อกัน, consent revoked ชนะ granted, granted+unknown = granted, unknown+unknown = unknown · `getCustomer` ของสองตัวตนเหมือนกัน · `listCustomersByTags` คืนสองแถว · รวมตัวตนเดิมซ้ำ = `same_person` · ข้าม business = `NOT_FOUND` · unmerge: consent คัดลอก (revoked ไม่หาย) แท็กไม่คัดลอก · candidates จากเบอร์/อีเมลเดียวกัน ไม่เสนอชื่อเหมือนอย่างเดียว |
| `consent.test.ts` | revoked โดยพนักงานที่มีแค่ `chat.reply` ได้ · granted โดย `chat.reply` อย่างเดียว = `PERMISSION_DENIED` · granted ไม่มี attestation = VALIDATION_ERROR · `setMarketingConsent` source `system` เปลี่ยน revoked→granted = `POLICY_BLOCKED` · ประวัติถูกเขียนทุกครั้งที่เปลี่ยน ไม่เขียนเมื่อค่าเดิม (`changed:false`) |
| `routes.test.ts` | owner B เรียกลูกค้า/แท็ก/กฎของ A ทุกเส้น = 404 (ไม่รั่วข้อมูล) · staff A (`STAFF_DEFAULT_PERMISSIONS`) สร้างแท็ก = 403, ติดแท็กที่มีอยู่ = 200, แก้เบอร์ = 200, สร้างแท็กผ่าน `POST /customers/:id/tags {name}` = 403 · `PATCH profile` ด้วย version เก่า = `VERSION_CONFLICT` · เบอร์ `12` = 400 · user ที่มีแต่ `insights.read` อ่านรายการได้ แต่ติดแท็กไม่ได้ · `GET /conversations/:id/panel` ของแชตร้านอื่น = 404 · `GET /customers` ไม่มี `eval-*` และ `total` ตรง · `q` เบอร์/ชื่อ/อีเมล · response ไม่มี externalId เต็ม |

Playwright smoke `web/src/features/crm/e2e/crm.smoke.spec.ts` (production-safe: marker `e2e-<ts>`, ลบแท็กที่สร้างเอง):
1. เปิด `/demo-chat/s/demo-boardgame` ส่ง `สวัสดี (e2e-<ts>)` (`demo-chat-input` / `demo-chat-send`) รอ `demo-chat-message` ของลูกค้าโผล่
2. `ownerPage` เปิด `/chat` เลือกแชตล่าสุด → เห็น `crm-panel` · พิมพ์ `e2e-<ts>` ใน `crm-tag-add` เลือก "สร้างแท็ก" → เห็น `crm-tag-chip` ข้อความนั้น · กรอก `crm-phone` = `0800000000` blur → รีโหลดหน้า → ทั้งสองค่ายังอยู่
3. เปิด `/customers` กรองแท็ก `e2e-<ts>` → พบแถวเดียว · เปิดโปรไฟล์ → กดปฏิเสธข่าวสาร → chip เป็น "ปฏิเสธข่าวสาร" (ยืนยัน consent เป็น `revoked` ผ่าน `api` fixture: `GET …/customers/:id` ได้ `consent.status === 'revoked'`)
4. cleanup: ลบแท็ก `e2e-<ts>` ผ่านแท็บแท็ก (หรือ `api` DELETE) · ลูกค้า demo ปล่อยทิ้งได้ (ข้อมูลสังเคราะห์ในร้านเดโม)
5. (ไม่ทำใน smoke) รอกฎ 15 นาที · ครอบด้วย unit ที่ใช้นาฬิกาปลอม + ปุ่ม "รันเดี๋ยวนี้" ใน smoke ของกฎ (ถ้าทัน): สร้างกฎ `new_customer_days 1` → แท็ก `e2e-<ts>-auto` → รัน → ลูกค้าที่เพิ่งสร้างติดแท็ก (ใช้ได้เพราะลูกค้า e2e ใหม่เสมอ) แล้วลบกฎและแท็ก

## 11. Acceptance: R ตาม D6

- [ ] `getCustomer`, `listCustomersByTags`, `listTags` เป็นของจริงบน production ตรง signature (A1 F23 ใช้ audience picker + preview ได้จริง: ตรวจกับ `tag_vip_a` = 2 คน, ส่งได้ 1) · โพสต์ `DONE F24 … TO:A1 TO:B2 TO:B3 TO:A2`
- [ ] แผงลูกค้าในแชตทำงานจริง: ติด/ถอดแท็ก แก้เบอร์ ดูสถานะความยินยอม รีโหลดแล้วค่ายังอยู่ (slot ปรากฏใน `/chat` ของ A1 โดยไม่แก้ไฟล์ของ A1)
- [ ] CRUD แท็ก + กฎ + ปุ่มรัน ทำงาน; automation ไม่ถอด manual (test + ลองมือ); inactivity ผ่าน test ด้วย clock fixture
- [ ] consent: granted/revoked/unknown + ประวัติ + สิทธิ์ถอด/ให้ต่างกัน · `revoked` ชนะ (test) · F23 ข้าม cust_a2 บน production จริง (ดู smoke ของ F23)
- [ ] merge/unmerge ตามกติกา §5.4 ผ่าน test · ลูกค้า `eval-*` ไม่โผล่ในรายการ/จำนวน (test + ตรวจกับ F37 ถ้า merge แล้ว)
- [ ] ตรวจ tenant: ทุก route ข้ามร้าน = 404 · permission ตามตาราง §3 (route test) · audit ครบตาม §8 · ไม่มีค่าเบอร์/อีเมลใน log (ตรวจ log test run ด้วย grep)
- [ ] loading/empty/error, i18n th/en, Playwright smoke ผ่านบน production
- **S**: ไม่มีสถานะ sandbox (ไม่มี provider) · **A**: มีแค่ contract + ตาราง ไม่มี UI · กฎ `booking_count_gte`/`order_count_gte` เป็น "ยังไม่พร้อม" ได้ถ้าฟีเจอร์เจ้าของไม่ merge (ไม่ลด R ของ F24) · ไม่ถึง R ตอน 15:30 → ซ่อน `/customers` ด้วย feature flag แต่ **contract ต้องยังทำงาน** (F23 ใช้)

## 12. Security และ privacy

- Tenant: ทุก query กรอง `business_id`; customer id/tag id/rule id จาก path ตรวจกับ business ของ session (ไม่ตรง = `NOT_FOUND`/404 ไม่ใช่ 403) · `tagIds` ที่ส่งเข้า contract ต่างร้านถูกทิ้ง · merge ตรวจทั้งสองตัวตนอยู่ร้านเดียวกัน
- Permission: ตาม §3 (absent means denied) · `requireAnyPermission` อ่านจาก `ctx.scope` ที่ core สร้าง ไม่รับจาก body · การให้ความยินยอมต้องสิทธิ์สูงกว่าการถอน (กันพนักงานเปิดรับโปรแทนลูกค้า)
- PII: เบอร์/อีเมล/ที่อยู่/โน้ตเก็บเป็นข้อความธรรมดา (ต้องค้นด้วย prefix) แต่ **ไม่ลง log, ไม่ลง audit details, ไม่ลง realtime payload, ไม่ส่งให้โมเดล, ไม่อยู่ใน `CustomerSummary`** · list/detail ส่ง `externalId` ได้แค่ 4 ตัวท้าย (`externalIdMasked`) เพราะ UI ไม่ต้องใช้ตัวเต็ม · log ใช้ customer id เท่านั้น · เสริม pino redaction: `phone`, `email`, `address`, `note`
- ความยินยอมไม่ใช่เอกสารทางกฎหมาย (ตาม comment ของ `MarketingConsent`): เป็นสวิตช์ที่ร้านรับรองเองพร้อมประวัติ; ไม่มีฟีเจอร์ PDPA/หน้ากฎหมายในแอป
- ข้อมูลทดสอบ: เบอร์สังเคราะห์ `080000000x` เท่านั้น ไม่ใช้ข้อมูลจริง
- Rate limit: ไม่มี route สาธารณะ · `POST /rules/:id/run` จำกัด 6 ครั้ง/นาที/business ด้วย `assertRateLimit` (การรันกวาดทั้งร้าน)

## 13. Edge cases

| กรณี | ผลที่ต้องได้ |
|---|---|
| ลูกค้าถูกรวมแล้วมีแท็กเดียวกันสองตัวตน | แถวเดียวหลังรวม source สูงสุดชนะ |
| ตัวตนหลัก (primary) ถูกลบโดย core (CASCADE) | แถว member/assignment ของกลุ่มหาย: สมาชิกที่เหลือกลายเป็น person ของตัวเองโดยไม่มีแท็ก/ติดต่อ (รับได้: การลบลูกค้าไม่ใช่ flow ปกติ) |
| กฎ `inactive_days` และ staff ติดแท็กเดียวกันซ้อน | เป็น manual; กฎไม่ถอด; ลบแท็ก manual แล้วถ้าเงื่อนไขยังจริง กฎติดใหม่รอบถัดไป (ไม่มี suppression เพราะไม่ใช่ automation ที่ถูกถอด) |
| พนักงานถอดแท็ก automation ทั้งที่เงื่อนไขยังจริง | suppression → ไม่ติดซ้ำจนกว่าลูกค้าทักกลับแล้วเงียบอีก |
| ลูกค้าไม่เคยมี inbound (มีแต่ข้อความ outbound จาก broadcast) | `inactive_days` ไม่ติด |
| ชื่อแท็กไทยมีสระ/วรรณยุกต์ซ้อน | นับ grapheme ถูก (ไม่เกิน 32 grapheme แม้ code point มากกว่า) |
| `PATCH profile` ที่ส่งเฉพาะ `note` | ฟิลด์อื่นไม่เปลี่ยน; `version` เพิ่ม; ไม่มีแถวเดิม = INSERT ด้วย `expectedVersion: 1` |
| ลูกค้า revoked แล้วเจ้าของกด granted ไม่มี attestation | `VALIDATION_ERROR` ไม่เปลี่ยนค่า |
| tag id ของร้านอื่นถูกส่งเข้า `AssignTagBody` | `NOT_FOUND` |
| `GET /conversations/:id/panel` ของแชตที่ลูกค้าไม่มีแถว (ลบแล้ว) | `NOT_FOUND` (แผงแสดง error บรรทัดเดียว ไม่ทำให้แชตพัง) |
| ร้านมีลูกค้ามากกว่า 5,000 person ตอนกฎรัน | กฎถูกข้ามด้วย `skipped:'too_many'` (วันงานไม่เกิน) |
| สอง instance รัน schedule พร้อมกัน | core dedup `<name>@<slot>` + advisory lock ต่อกฎ ผลเดียว |
| ลูกค้า web (Demo Chat) ที่ไม่มี externalId มาตรฐาน | ถือเป็นลูกค้าปกติ; ไม่นับใน inactivity ด้วย `includeWeb=false` |
| ปิดกฎแล้วลบ | ถามก่อนว่าจะถอดแท็กที่กฎติดด้วยหรือไม่ (ค่าเริ่ม: ไม่ถอด) |

## 14. Build order (slices ≤ 45 นาที)

| Slice | เวลา | ส่งมอบ |
|---|---|---|
| **S1 contracts + tags + แผงในแชต** (คนอื่นรอ: A1 F23, B2, B3) | 45 | migration `001_crm.sql` ทั้งไฟล์ · `getCustomer` `listCustomersByTags` `listTags` ของจริง (ตัด fake) · tags CRUD + assign/unassign ตาม §5.2 · consent อ่าน/เขียนพื้นฐาน (`setMarketingConsent`, route PUT) · `GET /conversations/:id/panel` · `pages.tsx` พร้อม slot `chatSidePanels` (`CustomerPanel`) + หน้า `/customers` แท็บลูกค้า/แท็ก แบบกรองพื้นฐาน · seed · tests: contract, tags, assign, consent (บางส่วน), routes · **DONE → TO:A1 TO:B2 TO:B3 TO:A2 TO:C2** |
| **S2 โปรไฟล์ + consent เต็ม + merge** | 35 | `PATCH profile`, `crm_profiles`, หน้า `/customers/:id` (ติดต่อ, ความยินยอม + ประวัติ), merge/unmerge + candidates · tests: merge, consent สิทธิ์ · แผงในแชตแก้เบอร์/โน้ตได้ |
| **S3 กฎอัตโนมัติ + smoke** | 40 | `automation.ts`, schedule `crm.automation`, routes rules + `run`, แท็บกฎ, `new_customer_days` + `inactive_days` (booking/order kind: เพิ่มเมื่อ F15/A2 พร้อม) · `runDemo`/`resetDemo` · Playwright smoke + EVIDENCE.md |

ลำดับ: S1 คือสิ่งที่ F23 รอ (ถ้า F23 เริ่มก่อน ใช้ fake ใน `service.ts`) · ถ้าเวลาไม่พอ ตัด S3 ส่วน kind ที่เรียกฟีเจอร์อื่น และตัด unmerge ไปเป็นงานถัดไป (ต้องบันทึกใน EVIDENCE.md)

## 15. UNCONFIRMED และสิ่งที่ต้องตรวจในวันงาน

1. **slot `chatSidePanels` ของ A1**: host ส่ง prop `{ conversationId }` ตรง `SlotContribution.load` จริงหรือไม่ และแสดงเป็น panel คอลัมน์ขวา (F09 §7) · ตรวจตอนเริ่ม S1 จาก `web/src/features/inbox/` ที่ merge แล้ว ถ้าต่าง โพสต์ `NEED TO:A1`
2. **`conversations.last_inbound_at` ถูกเขียนเฉพาะข้อความ inbound ของลูกค้า**: ตรวจ `saveMessage` ของ F09 (A1) · ถ้าเขียนจากทุกข้อความ นาฬิกา inactivity ผิด → `CHANGE TO:A1`
3. **คอลัมน์ `customers.last_seen_at` ถูกอัปเดตเมื่อไร** (F09 ว่าที่ upsert ข้อความขาเข้า) ตรวจกับ `getCustomer().lastSeenAt` ใน test จริง
4. **`listOrdersByCustomer` (A2)** ยังไม่อยู่ใน `contracts.ts` ตอนเขียน: ตรวจ signature เมื่อ A2 DONE; กฎ `order_count_gte` ใช้เฉพาะเมื่อมีจริง · fake ต้องคืน `[]` ไม่ throw
5. **`countAppointmentsByCustomers` (F15)** เป็น export นอก contract ของ lane เดียวกัน: ลายเซ็นกำหนดใน F15 §4 · เรียก lazy
6. **ลูกค้าที่รวมแล้วได้ข้อความ broadcast หลายช่องทาง**: ตั้งใจ (คนละที่อยู่) · ถ้าเจ้าของไม่ต้องการ ต้องขอ `CHANGE` contract `CustomerSummary` เพิ่ม `personId` (ไม่ทำวันนี้: contract ล็อกแล้ว)
7. **PERMISSIONS**: ใช้เฉพาะคีย์ที่มีอยู่ (`chat.read`, `chat.reply`, `broadcast.read`, `broadcast.tags`, `insights.read`) · การให้ความยินยอมต้อง `broadcast.tags` (ค่าเริ่มของ staff = off) เป็นการตัดสินใจของ spec นี้ ถ้าเจ้าของอยากให้พนักงานให้ความยินยอมได้ ต้องเปิดคีย์นั้นให้พนักงานในหน้าทีม
8. **สีแท็ก 8 ค่า** map เป็น MUI palette ในโค้ด UI เอง (ไม่มีใน contract)
9. **pino redaction**: ตรวจว่า core ตั้ง redact paths ได้ผ่าน config หรือไม่; ถ้าไม่ได้ ให้ฟีเจอร์นี้ไม่ log object ที่มีฟิลด์เหล่านั้นเลย (กติกาโค้ด: log เฉพาะ id)
