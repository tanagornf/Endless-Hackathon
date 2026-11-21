# F05 knowledge — คลังความรู้และวงจรข้อมูล (knowledge lifecycle)

| | |
|---|---|
| Lane / คน | **B1** / **B** · ลำดับ 1 ใน lane (F05 → F07 → F08 → F37) |
| Tier / เป้า | **P0** · เป้า **R** (golden path: gate ขั้น 1 เพิ่ม FAQ ที่ active) |
| Timebox | 45–90 นาที (slice แรก ≤ 40 นาที ต้อง merge ก่อน 11:20) |
| เริ่มเมื่อ | `SETUP READY` |
| พึ่ง | core (`businesses`, `files`, `jobs`, `db`, `storage`, `model.moderate`, `audit`, `publish`) · F35 jobs · F07 (index: `indexKnowledgeRevision`, `setSearchable`, `setItemFolder`, `getIndexStates` — ถ้ายังไม่ merge ใช้ stub ใน `index-port.ts` ตาม §14) |
| ให้ | `createKnowledgeDraft`, `ensureKnowledgeFolder` (B3 F06 — ใน `### Contract additions`) · export ภายใน lane B: `getKnowledgeItem`, `getKnowledgeRevision` (F07), service ของวงจรชีวิต (`submit/activate/deactivate/delete`) |
| ใช้ | F07 `indexKnowledgeRevision`, `setSearchable`, `setItemFolder`, `getIndexStates` · core `model.moderate` |
| โฟลเดอร์ | `server/src/features/knowledge/` · `shared/features/knowledge/types.ts` · `web/src/features/knowledge/` |
| Web path | `/knowledge` (เมนูกลุ่ม `knowledge`) · หน้าย่อย `/knowledge/:itemId` |

อ่าน: `contracts.ts` (`KnowledgeStatus`, `KnowledgeIndexState`, `PERMISSIONS` กลุ่ม `product.*`, `FeatureRoutes`, `StorageApi`, `ModelApi.moderate`, slot `knowledgeActions`) · F07 spec §4 · [docs/openai-api.md](../openai-api.md) §6 · [COOKBOOK](../COOKBOOK.md) · know-how เดิม: [porting brief](../porting/F05-knowledge.md)

## 1. เป้าหมายและ user stories

ทำไมมี: AI ตอบจากข้อมูลร้านเท่านั้น (R5) ข้อมูลที่ร้านพิมพ์ต้องผ่านวงจร **ร่าง → ตรวจแล้ว → ใช้งาน** เพื่อไม่ให้ร่างหรือของที่ลบแล้วหลุดไปถึงลูกค้า และทุกคำตอบอ้างย้อนได้ว่าใช้ revision ไหน F05 เป็นเจ้าของเนื้อหา (ตาราง `knowledge_*`) ส่วนการค้น/ฝังเวกเตอร์เป็นของ F07

ผู้ใช้: เจ้าของ/พนักงานที่มี `product.write` (เขียน) · `product.read` (อ่าน) · `product.delete` (ลบ) · ฟีเจอร์อื่น (F07 อ่าน snapshot, B3 F06 สร้างร่างจากการนำเข้า)

User stories:
1. เจ้าของกด "เพิ่มความรู้" พิมพ์คำถาม/คำตอบ (FAQ) ของร้าน บันทึกเป็นร่างทันที แล้วกด "ส่งตรวจ" → "เปิดใช้งาน" และถามแชต Demo Chat ได้คำตอบจากข้อมูลนั้นภายในไม่กี่วินาที (gate ขั้น 1)
2. เจ้าของแก้เนื้อหา FAQ ที่ใช้งานอยู่ ระบบเก็บ revision ใหม่ ดูประวัติและเนื้อหาของแต่ละ revision ได้ และ query ถัดไปหลังทำดัชนีเสร็จใช้ revision ใหม่
3. เจ้าของจัดความรู้เป็นโฟลเดอร์ (ชื่อไม่ซ้ำแบบไม่สนตัวพิมพ์) ลบโฟลเดอร์แล้วความรู้ไม่หาย กลับไปเป็น "ไม่มีโฟลเดอร์"
4. เจ้าของปิดใช้งาน/ลบความรู้ที่ไม่ตรงความจริง: query ถัดไปไม่เจอทันที ลบแล้วประวัติแชตที่เคยอ้างยังเปิดดูได้
5. พนักงานที่ไม่มี `product.write` เปิดดูได้แต่แก้ไม่ได้ (ปุ่มซ่อน, API ตอบ 403)
6. ระบบตรวจข้อความ/รูปที่ร้านอัปโหลดด้วย `model.moderate` เป็นสัญญาณเตือนให้เจ้าของยืนยันก่อนเปิดใช้งาน ไม่ใช่ตัวบล็อกเดียว

นอกขอบเขต: นำเข้าไฟล์/CSV/เว็บ (F06 ของ B3 เรียก `createKnowledgeDraft`) · การค้น/embedding (F07) · รูปสินค้าและราคา (F08) · knowledge base หลายชุดต่อร้าน, หมวดหมู่/taxonomy, section revisions, สถานะ `blocked` ของแอดมิน, purge ร่างเก่ารายวัน (ทำถ้ามีเวลา: §14 ท้าย)

## 2. Data model

`server/src/features/knowledge/migrations/001_knowledge.sql` (ทุกตารางมี `business_id` · ทุก query กรองด้วยค่านี้):

```sql
-- dependsOn: core
CREATE TABLE knowledge_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100 AND name = btrim(name) AND name !~ '[\n\r\t]'),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX knowledge_folders_name_uq ON knowledge_folders (business_id, lower(name));

CREATE TABLE knowledge_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  folder_id uuid REFERENCES knowledge_folders(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'article' CHECK (kind IN ('faq','article')),
  title text NOT NULL DEFAULT '' CHECK (char_length(title) <= 255),
  body text NOT NULL DEFAULT '' CHECK (char_length(body) <= 20000),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','reviewed','active','inactive','deleted')),
  revision int NOT NULL DEFAULT 1 CHECK (revision >= 1),
  files jsonb NOT NULL DEFAULT '[]'::jsonb,           -- [{ fileId, description, sendToUser, flagged }]
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','import','seed','fixture')),
  source_ref text,                                     -- id ของงานนำเข้า (F06) ถ้ามี
  client_request_id text,                              -- idempotency ของ createKnowledgeDraft
  content_hash text NOT NULL DEFAULT '',               -- sha256(normalize(title) + '\n' + normalize(body)) ใช้เตือนซ้ำ
  moderation jsonb,                                    -- { status:'ok'|'flagged'|'unchecked', categories:[], revision, checkedAt }
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  activated_at timestamptz,
  deactivated_at timestamptz,
  deleted_at timestamptz,
  deleted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  CHECK ((status = 'deleted') = (deleted_at IS NOT NULL))
);
CREATE INDEX knowledge_items_list ON knowledge_items (business_id, status, updated_at DESC, id DESC);
CREATE INDEX knowledge_items_folder ON knowledge_items (business_id, folder_id) WHERE status <> 'deleted';
CREATE INDEX knowledge_items_hash ON knowledge_items (business_id, content_hash) WHERE status <> 'deleted' AND content_hash <> '';
CREATE UNIQUE INDEX knowledge_items_client_req ON knowledge_items (business_id, client_request_id) WHERE client_request_id IS NOT NULL;

CREATE TABLE knowledge_revisions (                      -- snapshot แก้ย้อนไม่ได้ ต่อทุก revision (รวม revision แรก)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
  revision int NOT NULL,
  kind text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  folder_id uuid,                                      -- ค่า ณ ตอนนั้น (ไม่ FK: โฟลเดอร์อาจถูกลบ)
  files jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, revision)
);
CREATE INDEX knowledge_revisions_item ON knowledge_revisions (business_id, item_id, revision DESC);
```

กฎ: ไม่แตะตาราง core · ไม่มีตาราง index ที่นี่ (สถานะ index อยู่กับ F07 อ่านผ่าน `getIndexStates()` เท่านั้น) · `folder_id` เป็นของร้านเดียวกันเสมอ (service ตรวจ ไม่ใช่ FK) · `files` ไม่เก็บ bytes มีแต่ `fileId` ของ core `files` · ข้อความของร้านไม่ใช่ PII ของลูกค้า แต่ห้าม log เนื้อหาเต็ม

### State machine

| from | event | to | ผลข้างเคียง |
|---|---|---|---|
| (ไม่มี) | `create` | draft (rev 1) | snapshot rev 1 |
| draft | `patch` (แก้เนื้อหา) | draft (rev + 1) | snapshot; ไม่ทำดัชนี |
| draft | `submit` (มี title และ body ไม่ว่าง) | reviewed | moderation ทันที + `indexKnowledgeRevision` |
| reviewed / inactive | `patch` | เดิม (rev + 1) | snapshot + index revision ใหม่ |
| reviewed / inactive | `activate` (index ของ revision ปัจจุบัน `ready`) | active | `setSearchable(rev)` |
| active | `patch` | active (rev + 1) | snapshot + index revision ใหม่; **revision เก่ายัง searchable จนกว่าใหม่ `ready`** (F07 สลับเอง) |
| active | `deactivate` | inactive | `setSearchable(null)` |
| draft / reviewed / active / inactive | `delete` | deleted | `setSearchable(null)`; เก็บแถว/ไฟล์/revisions |
| deleted | ทุก event ยกเว้น `delete` | — | `POLICY_BLOCKED` `details.reason='deleted'`; `delete` ซ้ำ = 200 ไม่เปลี่ยน `deleted_at` |
| draft | `activate` / `deactivate` | — | `POLICY_BLOCKED` `details.reason='submit_first'` |
| ไม่ใช่ draft | `submit` | — | `POLICY_BLOCKED` `details.reason='not_draft'` |
| reviewed | `deactivate` | — | `POLICY_BLOCKED` `details.reason='not_active'` |

`kind='faq'`: `title` = คำถาม, `body` = คำตอบ (F07 เก็บคู่ Q+A ใน chunk เดียวกัน) · `article`: เนื้อหายาวแบ่ง chunk ตาม F07

## 3. API endpoints

ทุก path ใต้ `/api/v1/businesses/:businessId/knowledge` · `defineFeatureRoutes({ featureId: 'F05', slug: 'knowledge' })` · auth `business` ทุกตัว · ลบ route placeholder ของ scaffold ใน PR แรก

| Method | Path | permission | Request | Response | Errors |
|---|---|---|---|---|---|
| GET | `/items` | `product.read` | `ListQuery` | `Page<KnowledgeItemRow>` | VALIDATION_ERROR |
| POST | `/items` | `product.write` | `CreateBody` (ว่างได้) | 201 `KnowledgeItemDetail` | VALIDATION_ERROR, NOT_FOUND (folder) |
| GET | `/items/:itemId` | `product.read` | — | `KnowledgeItemDetail` | NOT_FOUND |
| PATCH | `/items/:itemId` | `product.write` | `PatchBody` | `KnowledgeItemDetail` | VALIDATION_ERROR, VERSION_CONFLICT, NOT_FOUND, POLICY_BLOCKED (`deleted`) |
| POST | `/items/:itemId/submit` | `product.write` | `{ expectedRevision }` | `KnowledgeItemDetail` | VALIDATION_ERROR (ไม่มีเนื้อหา), VERSION_CONFLICT, POLICY_BLOCKED |
| POST | `/items/:itemId/activate` | `product.write` | `ActivateBody` | `KnowledgeItemDetail` | KNOWLEDGE_NOT_READY, POLICY_BLOCKED (`submit_first`/`moderation_flagged`/`deleted`), VERSION_CONFLICT |
| POST | `/items/:itemId/deactivate` | `product.write` | `{ expectedRevision }` | `KnowledgeItemDetail` | POLICY_BLOCKED, VERSION_CONFLICT |
| DELETE | `/items/:itemId` | `product.delete` | — | `{ id, status: 'deleted', deletedAt }` (200 ทุกครั้ง) | NOT_FOUND |
| POST | `/items/:itemId/reindex` | `product.write` | — | `KnowledgeItemDetail` | POLICY_BLOCKED (draft/deleted) |
| GET | `/items/:itemId/revisions` | `product.read` | `{ cursor?, limit? }` | `Page<KnowledgeRevisionRow>` | NOT_FOUND |
| GET | `/items/:itemId/revisions/:revision` | `product.read` | — | `KnowledgeRevisionDetail` | NOT_FOUND |
| POST | `/items/:itemId/files` | `product.write` | multipart field `file` (≤ 16 MB, รูป ≤ 8 MB) + `description?` `sendToUser?` | `KnowledgeItemDetail` | VALIDATION_ERROR |
| DELETE | `/items/:itemId/files/:fileId` | `product.write` | — | `KnowledgeItemDetail` | NOT_FOUND |
| GET | `/folders` | `product.read` | — | `{ items: KnowledgeFolderRow[] }` (นับไม่รวม deleted + `unfiledCount`) | — |
| POST | `/folders` | `product.write` | `{ name }` | 201 `KnowledgeFolderRow` | VALIDATION_ERROR (`details.code` = `folder_name_invalid` \| `folder_name_taken`) |
| PATCH | `/folders/:folderId` | `product.write` | `{ name }` | `KnowledgeFolderRow` | เหมือน POST, NOT_FOUND |
| DELETE | `/folders/:folderId` | `product.delete` | — | no_content (ลบแค่การผูก) | NOT_FOUND |

```ts
import { z } from 'zod';
const Title = z.string().max(255);
const Body = z.string().max(20000);
const FileTag = z.object({ fileId: z.string().uuid(), description: z.string().max(300), sendToUser: z.boolean(), flagged: z.boolean() });
export const ListQuery = z.object({
  q: z.string().trim().max(160).optional(),                       // ค้น id หรือ title (escape % _ ฝั่ง SQL)
  status: z.enum(['draft', 'reviewed', 'active', 'inactive']).optional(),   // ไม่ส่ง = ทุกสถานะที่ไม่ใช่ deleted
  includeDeleted: z.coerce.boolean().default(false),
  kind: z.enum(['faq', 'article']).optional(),
  folderId: z.union([z.string().uuid(), z.literal('unfiled')]).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export const CreateBody = z.object({
  kind: z.enum(['faq', 'article']).default('article'),
  title: Title.default(''), body: Body.default(''),
  folderId: z.string().uuid().nullable().default(null),
}).strict();
export const PatchBody = z.object({
  expectedRevision: z.number().int().min(1),
  kind: z.enum(['faq', 'article']).optional(),
  title: Title.optional(), body: Body.optional(),
  folderId: z.string().uuid().nullable().optional(),               // null = ไม่มีโฟลเดอร์
  files: z.array(FileTag.pick({ fileId: true, description: true, sendToUser: true })).max(10).optional(),  // แก้ description/sendToUser/ลำดับ เท่านั้น fileId ต้องมีอยู่แล้ว
}).strict().refine((b) => Object.keys(b).length > 1, 'nothing to change');
export const ActivateBody = z.object({ expectedRevision: z.number().int().min(1), acknowledgeModeration: z.boolean().default(false) }).strict();
```

```ts
// shared/features/knowledge/types.ts
import type { KnowledgeStatus, KnowledgeIndexState } from '../../core/types';
export interface KnowledgeFileTag { fileId: string; description: string; sendToUser: boolean; flagged: boolean; fileName: string; mimeType: string; sizeBytes: number; url: string }
export interface KnowledgeModeration { status: 'ok' | 'flagged' | 'unchecked'; categories: string[]; revision: number; checkedAt: string }
export interface KnowledgeIndexView { state: KnowledgeIndexState; revision: number; error: string | null; indexedAt: string | null }
export interface KnowledgeItemRow {
  id: string; kind: 'faq' | 'article'; title: string; snippet: string;        // snippet = body 160 ตัวแรก
  status: KnowledgeStatus; revision: number; folderId: string | null; folderName: string | null;
  indexState: KnowledgeIndexState; updatedAt: string; source: 'manual' | 'import' | 'seed' | 'fixture';
}
export interface KnowledgeItemDetail extends Omit<KnowledgeItemRow, 'snippet'> {
  body: string; files: KnowledgeFileTag[]; moderation: KnowledgeModeration | null;
  index: KnowledgeIndexView; mutable: boolean;                                // mutable = status ไม่ใช่ deleted
  warnings: { code: 'duplicate_title' | 'duplicate_content'; itemId: string; title: string }[];
  createdAt: string; submittedAt: string | null; activatedAt: string | null; deletedAt: string | null;
}
export interface KnowledgeRevisionRow { revision: number; title: string; createdAt: string; createdByName: string | null; isCurrent: boolean }
export interface KnowledgeRevisionDetail extends KnowledgeRevisionRow { kind: 'faq' | 'article'; body: string; folderId: string | null }
export interface KnowledgeFolderRow { id: string; name: string; itemCount: number; createdAt: string }
```

Cursor ของ `/items` = base64url(JSON `{ updatedAt, id }`) เรียง `updated_at DESC, id DESC` (keyset ไม่ใช้ offset) · `warnings` คำนวณตอนตอบ (ไม่เก็บ): ชื่อซ้ำ (normalize NFKC + lowercase + ตัดช่องว่าง) หรือ `content_hash` ซ้ำกับ item อื่นที่ไม่ deleted ของร้านเดียวกัน (ไม่บล็อก)

## 4. Service functions และ contracts

ไฟล์ภายใน: `service.ts` (public) · `repo.ts` · `lifecycle.ts` (state machine + CAS) · `folders.ts` · `files.ts` · `moderation.ts` · `hash.ts` · `index-port.ts` (ตัวห่อเรียก F07 ให้ mock ง่าย) · `routes.ts` · `seed.ts` · `*.test.ts`

ฟังก์ชันใน `service.ts` (ทุกตัวรับ `businessId` ก่อน และกรองด้วยค่านั้น · ของร้านอื่น = `NOT_FOUND` ตาม R3):

```ts
listKnowledgeItems(businessId, q: ListQuery): Promise<Page<KnowledgeItemRow>>
getKnowledgeItem(businessId, itemId): Promise<KnowledgeItemDetail | null>          // ใช้ใน lane B (F07 workbench, citations)
getKnowledgeRevision(businessId, itemId, revision): Promise<KnowledgeRevisionDetail & { status: KnowledgeStatus; currentRevision: number } | null>  // F07 job อ่านเนื้อหา + เช็กว่ายังเป็นปัจจุบัน
createKnowledgeItem(businessId, actor: Actor, body: CreateBody, opts?: { source?: 'manual' | 'fixture' }): Promise<KnowledgeItemDetail>   // source 'fixture' ใช้โดย F07 fixture loader เท่านั้น (route ใช้ 'manual' เสมอ)
patchKnowledgeItem(businessId, actor, itemId, body: PatchBody): Promise<KnowledgeItemDetail>
submitKnowledgeItem(businessId, actor, itemId, expectedRevision): Promise<KnowledgeItemDetail>
activateKnowledgeItem(businessId, actor, itemId, body: ActivateBody): Promise<KnowledgeItemDetail>
deactivateKnowledgeItem(businessId, actor, itemId, expectedRevision): Promise<KnowledgeItemDetail>
deleteKnowledgeItem(businessId, actor, itemId): Promise<{ id: string; status: 'deleted'; deletedAt: string }>
reindexKnowledgeItem(businessId, actor, itemId): Promise<KnowledgeItemDetail>
listRevisions / addFile / removeFile / listFolders / createFolder / renameFolder / deleteFolder
// type Actor = { userId: string | null }  (null = ระบบ/นำเข้า)
```

ฟังก์ชันของ F07 ที่ F05 เรียก (ผ่าน `index-port.ts`; ผู้ให้ = F07 §4):

```ts
indexKnowledgeRevision(input: { businessId: string; itemId: string; revision: number }): Promise<{ jobId: string; deduped: boolean }>
setSearchable(input: { businessId: string; itemId: string; revision: number | null }): Promise<void>   // null = ปิดทุก revision
setItemFolder(input: { businessId: string; itemId: string; folderId: string | null }): Promise<void>
getIndexStates(businessId: string, itemIds: string[]): Promise<Record<string, { revision: number; state: KnowledgeIndexState; error: string | null; indexedAt: string | null }>>
```

หมายเหตุ import วนระหว่าง F05 ↔ F07 (F07 job เรียก `getKnowledgeRevision`): ใช้ `function` declaration และเรียกตอน runtime เท่านั้น ห้ามมีค่า top-level ที่เรียกอีกฝั่ง

### Contract additions

ลีดรวมวางใน `contracts.ts` ส่วน knowledge (ใต้ F07 หรือก่อน): 

```ts
// ═══ target: shared/features/knowledge/types.ts + server/src/features/knowledge/service.ts — F05 knowledge · B1 ═══

export interface KnowledgeDraftInput {
  businessId: string;
  kind?: 'faq' | 'article';
  /** ≤ 255 chars (longer → VALIDATION_ERROR). */
  title: string;
  /** ≤ 20,000 chars. */
  body: string;
  folderId?: string | null;
  /** Import job id (F06) kept on the row for traceability. */
  sourceRef: string;
  /** Same (businessId, clientRequestId) twice → the existing item, created: false. Use `<importId>:<rowNo>`. */
  clientRequestId: string;
  /** null = system. */
  actorUserId: string | null;
}
export interface KnowledgeDraftResult {
  itemId: string;
  revision: number;
  created: boolean;
  warnings: { code: 'duplicate_title' | 'duplicate_content'; itemId: string }[];
}
/**
 * @owner F05 knowledge · B1 · consumer: B3 (F06 knowledge-import)
 * Writes ONE knowledge item as status 'draft' (source 'import'); never active, never indexed (the shop reviews and
 * submits it in /knowledge). Moderation runs at submit, not here. Empty title AND body → VALIDATION_ERROR.
 * Audit knowledge.item.create. Idempotent by clientRequestId. Does not publish realtime events.
 * @fake inserts nothing: returns { itemId: `fake-draft-<clientRequestId>`, revision: 1, created: true, warnings: [] }.
 */
export declare function createKnowledgeDraft(input: KnowledgeDraftInput): Promise<KnowledgeDraftResult>;

/**
 * @owner F05 knowledge · B1 · consumer: B3 (F06)
 * Finds a folder by name (trimmed, case-insensitive) or creates it. Name rules as the folder routes
 * (1–100 chars, one line) else VALIDATION_ERROR.
 * @fake { id: `fake-folder-<lowercased name>`, name, created: true }.
 */
export declare function ensureKnowledgeFolder(
  businessId: string, name: string, actorUserId: string | null,
): Promise<{ id: string; name: string; created: boolean }>;
```

## 5. Algorithms

ค่าคงที่ใน `config.ts`: `TITLE_MAX=255` · `BODY_MAX=20000` · `FILES_MAX=10` · `IMAGE_MAX_MB=8` · `DOC_MAX_MB=16` · `SNIPPET_LEN=160` · `LIST_LIMIT_MAX=200` · `FOLDER_NAME_MAX=100`

### 5.1 CAS update (`lifecycle.ts`)

ทุกการแก้เป็น `UPDATE knowledge_items SET … WHERE id=$1 AND business_id=$2 AND revision=$3 AND status = ANY($allowedFrom) RETURNING *` ใน transaction เดียวกับการ INSERT snapshot ถ้า `rowCount = 0`: SELECT แถว → ไม่มี/ร้านอื่น `NOT_FOUND` · `status='deleted'` `POLICY_BLOCKED(deleted)` · status ไม่อยู่ใน `allowedFrom` `POLICY_BLOCKED(<reason> จากตาราง §2)` · revision ไม่ตรง `VERSION_CONFLICT` (details `{ currentRevision }`) ห้ามเรียก model หรือ F07 ใน transaction: ทำหลัง COMMIT

### 5.2 create / patch

1. `normalize(s)` = NFKC → ตัดอักขระ zero-width (`U+200B–U+200D`, `U+FEFF`) → รวมช่องว่างติดกัน (ยกเว้นขึ้นบรรทัดใหม่) → trim · `content_hash = sha256(normalize(title) + '\n' + normalize(body))` (hex)
2. `create`: INSERT status `draft`, revision 1 + snapshot 1 · body/title ว่างได้ · `folderId` ที่ให้มาต้องเป็นของร้านนี้ (ไม่ใช่ = `NOT_FOUND`) · audit `knowledge.item.create`
3. `patch` (CAS ตาม 5.1, allowedFrom = draft/reviewed/active/inactive): ถ้า `title`/`body`/`kind` เปลี่ยนจริง (เทียบหลัง normalize) → `revision + 1` + snapshot ใหม่ + คำนวณ `content_hash` ใหม่ + ล้าง `moderation` (ต้องตรวจใหม่) · ถ้าเปลี่ยนแค่ `folderId`/`files` → **ไม่เพิ่ม revision**, ไม่ snapshot (snapshot ถัดไปจะเก็บค่าใหม่) · `folderId` เปลี่ยน → หลัง COMMIT เรียก `setItemFolder` · ไม่มีอะไรเปลี่ยนจริง → คืนเดิม ไม่เพิ่ม revision
4. หลัง COMMIT ถ้า revision เพิ่มและ status ∈ {reviewed, active, inactive}: รัน moderation (5.4) แล้ว `indexKnowledgeRevision({ itemId, revision })` · `publish(businessId, { type:'knowledge.status', knowledgeItemId, indexState:'indexing' })` · ถ้า F07 เรียกล้ม: log + ปล่อยให้ index เป็น `not_started` (UI มีปุ่ม "ทำดัชนีใหม่") ไม่ทำให้ PATCH fail
5. audit `knowledge.item.update` (details: เฉพาะชื่อฟิลด์ที่เปลี่ยน ไม่ใส่เนื้อหา)

### 5.3 submit / activate / deactivate / delete

- `submit` (allowedFrom draft): ตรวจ `title` ไม่ว่างและ `body` ไม่ว่าง (หลัง trim) มิฉะนั้น `VALIDATION_ERROR` · ตั้ง `status='reviewed'`, `submitted_at` · COMMIT แล้ว moderation + `indexKnowledgeRevision` (ตาม 5.2 ข้อ 4)
- `activate` (allowedFrom reviewed/inactive): (1) `getIndexStates` ของ item: `state !== 'ready'` หรือ `revision !== current` → `KNOWLEDGE_NOT_READY` (details `{ state }`) (2) `moderation.status==='flagged'` และ `!acknowledgeModeration` → `POLICY_BLOCKED(moderation_flagged)` (3) CAS ตั้ง `active`, `activated_at` (4) `setSearchable({ revision: current })` ใน request เดียว (ล้ม = ย้อน status กลับเป็นค่าเดิมด้วย CAS แล้ว throw `INTERNAL`) (5) audit `knowledge.item.activate`, publish
- `deactivate` (allowedFrom active): CAS → `inactive`, `deactivated_at` → `setSearchable({ revision: null })` (ล้ม: log error + ลองซ้ำหนึ่งครั้ง ถ้ายังล้ม ย้อน CAS และ `INTERNAL`) → audit `knowledge.item.deactivate`
- `delete` (allowedFrom ทุกสถานะที่ไม่ใช่ deleted): ถ้าเป็น deleted แล้ว → คืน 200 ด้วย `deleted_at` เดิมโดยไม่เขียนอะไร · มิฉะนั้นตั้ง `deleted`, `deleted_at=now()`, `deleted_by` · `setSearchable({ revision: null })` · ไม่ลบแถว/revisions/ไฟล์ · audit `knowledge.item.delete`
- ลำดับสำคัญของความปลอดภัย: **ปิด searchable ก่อนตอบสำเร็จเสมอ** (deactivate/delete) ดังนั้นถ้า `setSearchable(null)` ล้ม ให้ถือว่าคำสั่งล้มทั้งคำสั่ง ไม่ปล่อยให้ item สถานะปิดแต่ยังค้นเจอ

### 5.4 Moderation (`moderation.ts`)

1. ข้อความ: `model.moderate({ usage: { featureId:'F05', purpose:'moderate', businessId }, text: title + '\n' + body.slice(0, 20000) })` · รูป (ตอน upload, mime `image/*`): `images:[{ uploadRef: fileId }]`
2. ผล → `moderation = { status: flagged ? 'flagged' : 'ok', categories, revision, checkedAt }` · provider error (`PROVIDER_UNAVAILABLE`, `PROVIDER_BUDGET_EXHAUSTED`, `RATE_LIMITED`) → `{ status:'unchecked', … }` และไม่บล็อก
3. ใช้เป็นสัญญาณเตือน: UI แสดง Alert พร้อมหมวด และ `activate` ต้องยืนยัน (`acknowledgeModeration`) เมื่อ flagged · ไม่ใช่ตัวบล็อกเดียว (เอกสาร OpenAI ไม่ระบุความแม่นยำภาษาไทย: UNCONFIRMED ใช้ตรวจเมื่อร้านอัปโหลดข้อมูลแย่ ๆ)
4. fake mode: `flagged = text.includes('[flag]')` (ตาม `ModelApi.moderate`) ใช้ในเทสต์

### 5.5 Folders

- ชื่อ: trim, 1–100 ตัว, บรรทัดเดียว, ปฏิเสธ control char และ bidi override (`/[\u0000-\u001F\u007F‪-‮⁦-⁩]/`) → `VALIDATION_ERROR` `details.code='folder_name_invalid'` · ซ้ำแบบไม่สนตัวพิมพ์ในร้าน (unique index) → `details.code='folder_name_taken'` (จับ error `23505` ของ index `knowledge_folders_name_uq`)
- ลบ folder: `DELETE` (FK `SET NULL` ทำให้ item ตกเป็น unfiled) → หลัง COMMIT เรียก `setItemFolder(null)` ของทุก item ที่เคยอยู่ใน folder นั้น (ดึง id ก่อนลบ, ≤ 1,000 ตัว แล้วเป็น batch ละ 100) · audit `knowledge.folder.delete` · ไม่ลบ/ไม่ปิดความรู้
- `itemCount` = นับเฉพาะ `status <> 'deleted'`

### 5.6 Files

`POST /items/:id/files`: ตรวจ mime allow-list (`image/png|jpeg|webp|gif`, `application/pdf`, `text/plain`, `text/csv`) และขนาด (รูป ≤ 8 MB, เอกสาร ≤ 16 MB; core ตรวจ `UPLOAD_MAX_MB` ซ้ำ) → `storage.save({ businessId, uploadedBy, purpose:'knowledge', … })` → ต่อท้าย `files` ด้วย `{ fileId, description: '', sendToUser: mime เป็นรูป, flagged }` (จำกัด 10) · รูป → `model.moderate` (5.4) ตั้ง `flagged` · ไฟล์ที่ item อื่นยังอ้างอยู่ ห้ามลบจริง (ไม่มี hard delete ไฟล์ใน F05: `removeFile` แค่เอา tag ออก)

### 5.7 Query list

`q` ว่าง = ไม่กรอง · ไม่ว่าง: `(id::text ILIKE $q OR title ILIKE $q)` โดย escape `\ % _` และตัดที่ 160 ตัว · `status` ไม่ส่ง = `status <> 'deleted'` · `folderId='unfiled'` → `folder_id IS NULL` · `indexState` ต่อแถวมาจาก `getIndexStates(businessId, ids)` (หนึ่ง call ต่อหน้า) ถ้า F07 ยังเป็น stub = `not_started`

## 6. AI calls

ไม่มี chat/AI call ในฟีเจอร์นี้ ยกเว้น **moderation** ผ่าน `model.moderate()` ของ core (`omni-moderation-latest`, ฟรี): purpose `moderate`, `featureId:'F05'` · ทำตอน submit, ตอนแก้ revision ที่ไม่ใช่ draft, และตอนอัปโหลดรูป · fake mode: `flagged` เมื่อข้อความมี `[flag]` · embedding เป็นของ F07 · ไม่มีการ paraphrase ด้วยโมเดลใน F05 (ตัดออก)

## 7. UI

Routes (`pages.tsx`, `defineFeaturePages({ featureId:'F05', slug:'knowledge' })`):
- `/knowledge` `permission:'product.read'` `titleKey:'knowledge:page.title'` → `KnowledgeListPage.tsx`
- `/knowledge/:itemId` → `KnowledgeEditPage.tsx`
- เมนู `{ path:'/knowledge', labelKey:'knowledge:menu.title', group:'knowledge', icon:'MenuBookOutlined', order:10, permission:'product.read', searchTerms:['knowledge','ความรู้','faq','คำถามที่พบบ่อย','เอกสาร'] }`
- slot: หน้า list เรียก `useSlot('knowledgeActions')` แล้ว render ปุ่มของ feature อื่นข้างปุ่ม "เพิ่มความรู้" (B3 ใส่ "นำเข้า") โดยส่ง props `{ businessId }` · ไม่มี slot = ไม่แสดงอะไร

`KnowledgeListPage`:
1. `PageHeader` (title, actions: "เพิ่มความรู้" เฉพาะ `useCan('product.write')`, "จัดการโฟลเดอร์") → ปุ่มเพิ่ม: `POST /items` (body ว่าง) แล้ว `navigate('/knowledge/<id>')`
2. แถบกรอง: `Tabs` สถานะ (ทั้งหมด/ร่าง/ตรวจแล้ว/ใช้งาน/ปิด + ที่ลบแล้ว) · `Select` โฟลเดอร์ (ทั้งหมด/ไม่มีโฟลเดอร์/แต่ละโฟลเดอร์ พร้อมจำนวน) · `TextField` ค้นหา (debounce 300 ms)
3. `DataTable`: ชื่อ (+ snippet), ชนิด, สถานะ (`StatusChip` generic), ดัชนี (`StatusChip` generic ของ `indexState`), โฟลเดอร์, แก้ไขล่าสุด (`formatDateTime`) · แถวคลิก → หน้าแก้ · ปุ่ม "โหลดเพิ่ม" ใต้ตารางเมื่อ `nextCursor`
4. dialog จัดการโฟลเดอร์ (`FormDialog` เพิ่ม/แก้ชื่อ · `ConfirmDialog` ลบ พร้อมข้อความ "ความรู้ในโฟลเดอร์จะไม่ถูกลบ") แสดง `folder_name_taken` / `folder_name_invalid` ด้วย i18n ตาม `details.code`
5. realtime: `useRealtime('knowledge.status', () => reload())` (อัปเดตชิปดัชนี)
6. states: loading (`DataTable loading`), empty = `EmptyState` "ยังไม่มีความรู้" + ปุ่มเพิ่ม, error = `EmptyState` + ปุ่มลองใหม่

`KnowledgeEditPage` (`/knowledge/:itemId`):
1. หัว: ชื่อ + `StatusChip` สถานะ + `StatusChip` ดัชนี + revision (`r3`) · ปุ่มตามสถานะ (เฉพาะ `product.write`): draft → "บันทึก" "ส่งตรวจ" · reviewed/inactive → "บันทึก" "เปิดใช้งาน" · active → "บันทึก" "ปิดใช้งาน" · "ประวัติ" (Drawer รายการ revision + ดูเนื้อหา) · "ลบ" (`ConfirmDialog danger`, เฉพาะ `product.delete`)
2. ฟอร์ม: `Select` ชนิด (คำถาม-คำตอบ/บทความ) · `TextField` ชื่อ (faq: "คำถาม") · `TextField multiline` เนื้อหา (faq: "คำตอบ") นับตัวอักษร x/20,000 · `Select` โฟลเดอร์ · ส่วนไฟล์แนบ (อัปโหลด, ตัวเลือก "ส่งให้ลูกค้าได้", ลบ) · ผู้ไม่มี `product.write` = ทุกช่องอ่านอย่างเดียว
3. Alert: `warnings` (ชื่อ/เนื้อหาซ้ำ + ลิงก์ไปรายการนั้น) · moderation flagged (หมวด + ถามยืนยันตอนเปิดใช้งาน ผ่าน `ConfirmDialog`) · ดัชนี `indexing` ("กำลังทำดัชนี ปุ่มเปิดใช้งานจะพร้อมเมื่อเสร็จ") · `failed` (ข้อความ error + ปุ่ม "ทำดัชนีใหม่") · item active ที่แก้เนื้อหา: "การแก้ไขมีผลกับแชตเมื่อทำดัชนีเสร็จ ระหว่างนี้ใช้เนื้อหา revision ก่อนหน้า"
4. `VERSION_CONFLICT` → toast + โหลดรายการใหม่ (ไม่ทับสิ่งที่พิมพ์: แสดง Alert "มีคนแก้ไปแล้ว" พร้อมปุ่ม "โหลดเวอร์ชันล่าสุด") · `KNOWLEDGE_NOT_READY` → toast ข้อความดัชนียังไม่เสร็จ
5. ปุ่มบันทึกจะ disabled เมื่อไม่มีการเปลี่ยนแปลง · เตือนก่อนออกจากหน้าเมื่อมีฟอร์มยังไม่บันทึก

i18n (namespace `knowledge`, ไฟล์ `i18n/th.json` + `en.json`):

| key | th | en |
|---|---|---|
| `menu.title` | คลังความรู้ | Knowledge |
| `page.title` | คลังความรู้ | Knowledge base |
| `page.subtitle` | ข้อมูลที่ AI ใช้ตอบลูกค้า ต้องผ่านการตรวจและเปิดใช้งานก่อน | What the AI uses to answer customers. Items must be reviewed and activated first |
| `actions.add` | เพิ่มความรู้ | Add knowledge |
| `actions.folders` | จัดการโฟลเดอร์ | Manage folders |
| `actions.save` | บันทึก | Save |
| `actions.submit` | ส่งตรวจ | Submit for review |
| `actions.activate` | เปิดใช้งาน | Activate |
| `actions.deactivate` | ปิดใช้งาน | Deactivate |
| `actions.delete` | ลบ | Delete |
| `actions.history` | ประวัติการแก้ไข | History |
| `actions.reindex` | ทำดัชนีใหม่ | Rebuild index |
| `actions.loadMore` | โหลดเพิ่ม | Load more |
| `actions.reload` | โหลดเวอร์ชันล่าสุด | Load latest version |
| `tabs.all` | ทั้งหมด | All |
| `tabs.draft` | ร่าง | Draft |
| `tabs.reviewed` | ตรวจแล้ว | Reviewed |
| `tabs.active` | ใช้งาน | Active |
| `tabs.inactive` | ปิดใช้งาน | Inactive |
| `tabs.deleted` | ลบแล้ว | Deleted |
| `filter.folder` | โฟลเดอร์ | Folder |
| `filter.allFolders` | ทุกโฟลเดอร์ | All folders |
| `filter.unfiled` | ไม่มีโฟลเดอร์ | No folder |
| `filter.search` | ค้นหาชื่อหรือรหัส | Search title or id |
| `table.title` | ชื่อ | Title |
| `table.kind` | ชนิด | Type |
| `table.status` | สถานะ | Status |
| `table.index` | ดัชนี | Index |
| `table.folder` | โฟลเดอร์ | Folder |
| `table.updated` | แก้ไขล่าสุด | Last edited |
| `kind.faq` | คำถาม-คำตอบ | Q&A |
| `kind.article` | บทความ | Article |
| `form.question` | คำถาม | Question |
| `form.answer` | คำตอบ | Answer |
| `form.title` | ชื่อเรื่อง | Title |
| `form.body` | เนื้อหา | Content |
| `form.count` | {{n}}/20,000 ตัวอักษร | {{n}}/20,000 characters |
| `form.files` | ไฟล์แนบ | Attachments |
| `form.upload` | อัปโหลดไฟล์ | Upload a file |
| `form.sendToUser` | ส่งให้ลูกค้าได้ | Can be sent to customers |
| `form.unsaved` | มีการแก้ไขที่ยังไม่บันทึก ออกจากหน้านี้? | You have unsaved changes. Leave this page? |
| `empty.title` | ยังไม่มีความรู้ | No knowledge yet |
| `empty.description` | เพิ่มคำถามที่ลูกค้าถามบ่อย แล้วเปิดใช้งานให้ AI ตอบ | Add questions customers often ask, then activate them for the AI |
| `warn.duplicate_title` | มีความรู้ชื่อเดียวกันอยู่แล้ว | An item with the same title already exists |
| `warn.duplicate_content` | มีเนื้อหาเหมือนกันอยู่แล้ว | An item with the same content already exists |
| `moderation.flagged` | ระบบตรวจพบเนื้อหาที่อาจไม่เหมาะสม ({{cats}}) โปรดตรวจก่อนเปิดใช้งาน | The check flagged possibly unsuitable content ({{cats}}). Review it before activating |
| `moderation.confirmTitle` | เปิดใช้งานเนื้อหาที่ถูกเตือน? | Activate flagged content? |
| `moderation.confirmMessage` | คุณตรวจเนื้อหานี้แล้วและยืนยันว่าใช้ตอบลูกค้าได้ | You reviewed this content and confirm it is fine to answer customers with |
| `index.indexing` | กำลังทำดัชนี ปุ่มเปิดใช้งานจะพร้อมเมื่อเสร็จ | Indexing. Activate will be available when it finishes |
| `index.failed` | ทำดัชนีไม่สำเร็จ: {{error}} | Indexing failed: {{error}} |
| `index.pendingRevision` | การแก้ไขมีผลกับแชตเมื่อทำดัชนีเสร็จ ระหว่างนี้ใช้เนื้อหาก่อนหน้า | Your edit applies to chats once indexing finishes. Until then the previous content is used |
| `error.conflict` | มีคนแก้ไขรายการนี้ไปแล้ว | Someone else changed this item |
| `error.notReady` | ดัชนียังไม่พร้อม รอสักครู่แล้วลองใหม่ | The index is not ready yet. Try again shortly |
| `error.deleted` | รายการนี้ถูกลบแล้ว | This item was deleted |
| `toast.saved` | บันทึกแล้ว | Saved |
| `toast.submitted` | ส่งตรวจแล้ว กำลังทำดัชนี | Submitted. Indexing started |
| `toast.activated` | เปิดใช้งานแล้ว AI ใช้ข้อมูลนี้ตอบได้ | Activated. The AI can now use it |
| `toast.deactivated` | ปิดใช้งานแล้ว | Deactivated |
| `toast.deleted` | ลบแล้ว | Deleted |
| `confirm.deleteTitle` | ลบความรู้นี้? | Delete this item? |
| `confirm.deleteMessage` | AI จะไม่ใช้ข้อมูลนี้อีก ประวัติแชตที่เคยอ้างถึงยังเปิดดูได้ | The AI will stop using it. Chat history that cited it stays viewable |
| `history.title` | ประวัติการแก้ไข | Edit history |
| `history.revision` | ฉบับที่ {{n}} | Revision {{n}} |
| `history.current` | ฉบับปัจจุบัน | Current |
| `folders.title` | โฟลเดอร์ | Folders |
| `folders.add` | เพิ่มโฟลเดอร์ | Add folder |
| `folders.rename` | แก้ชื่อ | Rename |
| `folders.name` | ชื่อโฟลเดอร์ | Folder name |
| `folders.count` | {{n}} รายการ | {{n}} items |
| `folders.deleteMessage` | ความรู้ในโฟลเดอร์นี้จะไม่ถูกลบ แต่จะไม่อยู่ในโฟลเดอร์ใด | Knowledge in this folder is kept but will have no folder |
| `folders.folder_name_taken` | มีโฟลเดอร์ชื่อนี้อยู่แล้ว | A folder with this name already exists |
| `folders.folder_name_invalid` | ชื่อโฟลเดอร์ต้องยาว 1–100 ตัวอักษรและอยู่บรรทัดเดียว | Folder name must be 1–100 characters on one line |

## 8. Jobs, schedules, events

| รายการ | ค่า |
|---|---|
| Job | F05 ไม่มี job ของตัวเอง (job `knowledge.index` เป็นของ F07) |
| Schedule | ไม่มี (ถ้ามีเวลา: `knowledge.purge-drafts` รายวัน ลบร่างที่ไม่ได้แก้ 7 วัน = soft delete `status='deleted'` ต่อ `source='manual'` เท่านั้น ไม่แตะไฟล์ที่ item อื่นยังใช้) |
| Realtime | `publish(businessId, { type:'knowledge.status', knowledgeItemId, indexState })` เมื่อ submit/แก้ revision (indexState `indexing`) · F07 publish ตอน ready/failed · ไม่ publish จาก `createKnowledgeDraft` |
| Audit | `knowledge.item.create` · `.update` · `.submit` · `.activate` · `.deactivate` · `.delete` · `knowledge.folder.create` · `.rename` · `.delete` · `knowledge.file.add` · `.remove` (`actorUserId` = ผู้ใช้ · `targetType:'knowledge_item'` หรือ `'knowledge_folder'`) |
| notify | ไม่มี |
| `model_usage` | featureId `F05`, purpose `moderate` (kind moderate, ฟรี) |

## 9. Seed และ fixtures

`seed.ts` (`FeatureSeed`, `featureId:'F05'`, `dependsOn: ['core']`, idempotent ด้วย `ON CONFLICT (id) DO NOTHING`) ใช้ `SEED.knowledgeFolders` และ `SEED.knowledge` ใน `contracts.ts` ตรง ๆ (id = `ctx.id(alias)`):
- `knowledge_folders` 4 แถว · `knowledge_items` 10 แถว: `title/body/status/revision` ตาม SEED · `kind='faq'` ให้ alias ที่ลงท้าย `_faq` ที่เหลือ `article` · `source='seed'` · `folder_id` ตาม `folderAlias` · `content_hash` คำนวณด้วย `hash.ts` · `deleted_at = now()` ของ `kn_a_deleted`
- `knowledge_revisions`: ให้ทุก item มี snapshot ตั้งแต่ revision 1 ถึง `revision` ของ SEED (`kn_a_deleted` มี 2 ฉบับ: ฉบับ 1 = ราคา 990 บาท, ฉบับ 2 = ข้อความเดิม)
- index state ของ SEED (`ready` ของ active) เป็นของ F07 `seed.ts` (ผูกกับ item id เดียวกัน) · F05 ไม่เขียน
- `runDemo(ctx)` (`npm run db:seed -- --demo`): ไม่มี (ข้อมูลเดโมเพิ่มของ FAQ มาจาก F07 fixture loader) · `resetDemo(ctx)`: ลบ item ที่ `source IN ('manual','fixture')` ของร้าน A ที่สร้างหลังเวลา seed (ผ่าน `deleteKnowledgeItem` เพื่อปิด searchable) — ไม่แตะ seed

Fixtures ของ test (สร้างด้วยโค้ด `test-helpers.ts`): `makeItem(businessId, overrides)` เรียก service จริงกับ DB test · F07 mock ด้วย `vi.mock('./index-port')` ให้คืน state ตามที่เทสต์กำหนด · ใช้ `CLOCK_FIXTURE` · ผู้ใช้ owner A = `SEED.users[owner_a]`, staff A (ไม่มี `product.write`) = `staff_a` (permission default ใน `STAFF_DEFAULT_PERMISSIONS` มี `product.read` เท่านั้น)

## 10. Tests

Unit/service (`MODEL_MODE=fake`, DB test จริง):

| ไฟล์ | case |
|---|---|
| `lifecycle.test.ts` | ตาราง state machine §2 ทุกแถว (ผ่านและ `POLICY_BLOCKED` พร้อม `details.reason`) · submit ไม่มีเนื้อหา = `VALIDATION_ERROR` · activate ตอน index ไม่ `ready` = `KNOWLEDGE_NOT_READY` (mock `getIndexStates`) · activate เรียก `setSearchable(rev ปัจจุบัน)` · deactivate/delete เรียก `setSearchable(null)` ก่อนตอบ และถ้า mock ล้ม คำสั่งล้มและสถานะกลับเดิม · delete ซ้ำ = ผลเดิม `deleted_at` ไม่เปลี่ยน · แก้ item ที่ deleted = `POLICY_BLOCKED(deleted)` |
| `revision.test.ts` | patch เนื้อหา = revision + 1 + snapshot · patch โฟลเดอร์/ไฟล์ = ไม่เพิ่ม revision · `expectedRevision` เก่า = `VERSION_CONFLICT` (แถวไม่เปลี่ยน) · สองคำขอแข่งกัน (Promise.all) ผ่านหนึ่ง conflict หนึ่ง · แก้ active item ไม่เปลี่ยน status และเรียก `indexKnowledgeRevision(rev ใหม่)` แต่ไม่เรียก `setSearchable(null)` · snapshot ย้อนดูได้ครบทุกฉบับ |
| `folders.test.ts` | ชื่อซ้ำไม่สนตัวพิมพ์ (`ทั่วไป` vs `ทั่วไป ` vs `ทั่วไป` ตัวพิมพ์เล็ก/ใหญ่ภาษาอังกฤษ `Faq`/`faq`) → `folder_name_taken` · ชื่อมี newline/bidi/ยาว 101 → `folder_name_invalid` · ลบ folder แล้ว item ยังอยู่และ `folder_id` เป็น null · นับไม่รวม deleted · `ensureKnowledgeFolder` idempotent · folder ของร้านอื่น = `NOT_FOUND` |
| `drafts.test.ts` | `createKnowledgeDraft` สร้าง draft `source='import'` ไม่ index · เรียกซ้ำ `clientRequestId` เดิม = `created:false` itemId เดิม · title+body ว่างทั้งคู่ = `VALIDATION_ERROR` · เตือนซ้ำ (`duplicate_title`, `duplicate_content`) · title 256 ตัว = `VALIDATION_ERROR` |
| `moderation.test.ts` | ข้อความมี `[flag]` → `moderation.status='flagged'` ต้อง `acknowledgeModeration` จึง activate ได้ · provider error → `unchecked` ไม่บล็อก · แก้เนื้อหาแล้วล้าง moderation และตรวจใหม่ |
| `tenant.test.ts` | ทุกฟังก์ชันของ `service.ts` กับ item/folder ของร้าน B จาก A = `NOT_FOUND` · `list` ไม่เห็นของ B · item ที่ใช้ `folderId` ของร้านอื่น = `NOT_FOUND` |
| `seed.test.ts` | seed ครบ 10 แถว + revisions · รันซ้ำไม่ซ้ำแถว |
| `routes.test.ts` (supertest) | permission: staff A (มีแค่ `product.read`) GET ได้ POST/PATCH = 403 `PERMISSION_DENIED` · ลบต้อง `product.delete` (owner ผ่าน) · zod: body เกิน 20,000 = 400 · PATCH ไม่มีฟิลด์ = 400 · `GET /items?q=%` ไม่ match ทุกแถว (escape) · cursor เรียงต่อเนื่องไม่ซ้ำ · upload mime ผิด = 400 · ไฟล์ >16 MB = 400 |

Playwright smoke `web/src/features/knowledge/e2e/knowledge.smoke.spec.ts` (production-safe: ใช้ marker `e2e-<ts>` ด้วย `e2eMarker()`, ลบของตัวเองตอนจบ):
1. `ownerPage` เปิด `/knowledge` → เห็นรายการ seed (`เวลาเปิดร้านและบริการ`) และไม่เห็น `ราคาเก่า` (ถูกลบ) ในแท็บทั้งหมด
2. กด "เพิ่มความรู้" → กรอกคำถาม `e2e-<ts> ร้านมีที่จอดรถไหม` คำตอบ `มีที่จอดรถหน้าร้าน 3 คัน` → บันทึก → "ส่งตรวจ" → รอชิปดัชนี "พร้อม" (≤ 60 วินาที) → "เปิดใช้งาน" → สถานะ "ใช้งาน"
3. เปิด `/demo-chat` ถาม `มีที่จอดรถไหม` → คำตอบกล่าวถึงที่จอดรถ 3 คัน (ต้องมี F07/F10 จริง: ถ้ายังไม่ merge ให้ `test.skip` ข้อนี้พร้อมเหตุผล) 
4. กลับมา "ปิดใช้งาน" → ถามซ้ำใน Demo Chat (ข้อความใหม่) → ไม่อ้างข้อมูลเดิม (ตรวจแค่ว่า API `searchKnowledge` ผ่าน `GET /knowledge-search/search?q=` ของ F07 ไม่มี item นี้ ถ้ามี endpoint)
5. ลบรายการ → หายจากแท็บทั้งหมดและขึ้นในแท็บ "ลบแล้ว" · ลบซ้ำผ่าน `api.delete` ได้ 200
6. ล็อกอิน staff A (ถ้า fixture มี) ไม่เห็นปุ่ม "เพิ่มความรู้"

## 11. Acceptance: R ตาม D6

- [ ] ตาราง/migration ขึ้นบน production · route placeholder ถูกลบ · UI จริง (list + แก้ไข + โฟลเดอร์ + ประวัติ) ต่อ API และ DB จริง
- [ ] วงจร draft → reviewed → active ⇄ inactive → deleted ตรง §2 ทุกแถว มีเทสต์ · `submit` เป็นทางเดียวออกจาก draft · activate ผ่านเมื่อ index `ready` เท่านั้น
- [ ] SPEC F05: draft/deleted/inactive/index-ไม่พร้อม ไม่ถูกใช้ตอบ (ตรวจผ่าน `searchKnowledge` ของ F07 จริง: `kn_a_draft`, `kn_a_deleted`, `kn_b_inactive` ไม่โผล่) · activate มีผลใน query ถัดไป · deactivate/delete ทำให้หายทันที
- [ ] revision: แก้เนื้อหาได้ revision ใหม่ + snapshot ดูย้อนได้ · `expectedRevision` เก่า = 409 `VERSION_CONFLICT` · ตรวจ CAS แข่งกัน
- [ ] โฟลเดอร์: ชื่อไม่ซ้ำไม่สนตัวพิมพ์ ลบโฟลเดอร์ไม่ลบความรู้ · นับไม่รวม deleted
- [ ] tenant: ทุก read/write กรอง `business_id` (เทสต์ ร้าน B จาก A) · permission ตรวจ (`product.read/write/delete`, staff A แก้ไม่ได้)
- [ ] moderation ทำงานจริง (ข้อความ + รูป) ผ่าน `model.moderate` ตอน submit/แก้/อัปโหลด: ผลเป็นสัญญาณเตือน (เห็นใน UI + ต้องยืนยัน) · จดผลบน production ครั้งหนึ่งใน EVIDENCE.md · ถ้ายังไม่ทัน: รายงาน moderation เป็น A แยกบรรทัด
- [ ] audit ครบตาม §8 · loading/empty/error ทุกหน้า · i18n th/en ครบ · Playwright smoke ผ่านบน production
- [ ] `createKnowledgeDraft` และ `ensureKnowledgeFolder` เป็นของจริง (ไม่ใช่ fake) → DONE แท็ก `TO:B3`
- **S/A**: ไม่มี S ของ F05 (ไม่มี provider ภายนอก) · ถ้า F07 index ยังเป็น stub = **A** (ห้ามรายงาน R) · ไม่ถึง R ตอน 15:30 → ซ่อน `/knowledge` ด้วย feature flag (แต่ F05 อยู่บน golden path จึงต้องแก้ให้ได้ก่อน)

## 12. Security และ privacy

- Tenant: `business_id` มาจาก `getBusiness()` เท่านั้น (route `auth:'business'`) ทุก SQL มี `AND business_id = $n` · `folderId`, `fileId` ที่รับจาก client ตรวจว่าเป็นของร้านนี้ก่อนใช้ · platform admin ไม่ได้สิทธิ์ร้านโดยอัตโนมัติ
- Permission: อ่าน `product.read` · แก้/เปิด/ปิด/อัปโหลด `product.write` · ลบ item/folder `product.delete`
- เนื้อหาที่ร้านพิมพ์เป็น **ข้อมูล ไม่ใช่คำสั่ง**: F07/F10 ส่งให้โมเดลเป็น snippet ใน prompt ที่ระบุว่าเป็นข้อมูล (ดู F10 §6) F05 ไม่ตีความเนื้อหา
- ไฟล์: allow-list mime + ขนาด + เก็บผ่าน `storage.save` (ชื่อไฟล์บนดิสก์ไม่ใช้ชื่อต้นฉบับ) · ห้าม serve ไฟล์ข้ามร้าน (`storage.read` กรอง business)
- ห้าม log: เนื้อหา `body`/`title` เต็ม (log เฉพาะ id, revision, ความยาว) · ห้ามใส่เนื้อหาใน audit details
- Rate limit: การอัปโหลดและ `reindex` ใช้ `assertRateLimit({ key: 'knowledge:upload:'+businessId, limit: 30, windowSeconds: 60 })` และ `reindex` 10 ต่อนาทีต่อร้าน
- ไม่มี endpoint สาธารณะ · ไม่มี secret

## 13. Edge cases

| กรณี | ผลที่ต้องได้ |
|---|---|
| POST body ว่าง | draft + id ทันที (`title=''`, `body=''`) |
| submit ตอน title ว่างแต่ body มี | `VALIDATION_ERROR` (ต้องมีทั้งสอง) |
| activate ตอน revision ถูกแก้ระหว่างที่ UI เปิดอยู่ | `VERSION_CONFLICT` (`expectedRevision` เก่า) |
| activate ตอน index ของ revision ปัจจุบันยัง `indexing` | `KNOWLEDGE_NOT_READY` · UI รอ realtime แล้วกดซ้ำ |
| index `failed` | ปุ่ม "ทำดัชนีใหม่" (`/reindex`) · item active เดิมยังตอบด้วย revision เก่า |
| แก้ item active แล้ว index ใหม่ `failed` | revision ใหม่ไม่ถูกใช้ตอบ (เก่ายัง searchable) · UI แจ้งชัด |
| ลบ item ที่ F10 เคยอ้างใน evidenceIds | ประวัติแชตเปิดได้ (`getKnowledgeRevision` ยังคืน snapshot แม้ deleted) |
| ลบ folder ที่มี item deleted อยู่ | ลบได้ · item deleted ได้ `folder_id` null |
| ชื่อ folder ภาษาไทยมีสระ/วรรณยุกต์ต่างลำดับ | เทียบด้วย `lower(name)` หลัง NFKC ที่ service (ไม่ใช่แค่ DB) เพื่อกันซ้ำจาก composed/decomposed |
| อัปโหลดไฟล์ซ้ำ (sha256 เดียวกัน) | อนุญาต (แต่ละ tag แยก) |
| `q` มี `%` หรือ `_` | ค้นตรงตัว (escape) |
| สองแท็บกดส่งตรวจพร้อมกัน | หนึ่งผ่าน หนึ่ง `POLICY_BLOCKED(not_draft)` หรือ `VERSION_CONFLICT` |
| F07 ยังไม่ merge | `index-port.ts` stub: `indexKnowledgeRevision` คืน jobId หลอก, `getIndexStates` คืน `ready` สำหรับ item ที่ seed เป็น ready มิฉะนั้น `not_started` → ฟีเจอร์รายงาน A จนกว่า F07 จริง |
| ข้อความของร้านมีคำสั่ง ("ignore all rules") | เก็บตามปกติ เป็นข้อมูล (moderation อาจไม่ติด) การป้องกันอยู่ที่ prompt ของ F10 |

## 14. Build order (slices ≤ 45 นาที)

| Slice | เวลา | ส่งมอบ (gate step 1 พึ่ง slice นี้) |
|---|---|---|
| **S1 แกน CRUD + วงจร + หน้า list/แก้ไข** | 40 | migration · types · `service.ts`/`repo.ts`/`lifecycle.ts` (create, patch, submit, activate, deactivate, delete, list, get, revisions) · `index-port.ts` (stub ถ้า F07 ยังไม่มี) · routes · `KnowledgeListPage` + `KnowledgeEditPage` + i18n · seed · tests lifecycle/revision/tenant · ลบ placeholder route · เป้า merge **11:20** |
| **S2 โฟลเดอร์ + draft API ให้ B3** | 30 | `folders.ts` + routes + dialog จัดการโฟลเดอร์ · `createKnowledgeDraft`, `ensureKnowledgeFolder` เป็นของจริง → DONE `TO:B3` · tests folders/drafts |
| **S3 moderation + ไฟล์ + ประวัติ revision** | 35 | `moderation.ts`, `files.ts`, Drawer ประวัติ, Alert เตือน · tests moderation · Playwright smoke · EVIDENCE.md · (ถ้ามีเวลา) purge ร่างรายวัน |

ลำดับ: S1 ต้องจบก่อน F07 เริ่มต่อ index จริง (F07 อ่านผ่าน `getKnowledgeRevision`) · รอบ F07 merge ให้ลบ stub ใน `index-port.ts` และรัน test ใหม่กับของจริง

## 15. UNCONFIRMED และสิ่งที่ต้องตรวจในวันงาน

1. ข้อความ error ของ unique violation `23505` จาก `pg` ผ่าน `db.query` ของ core: ตรวจว่า core ส่ง error ดิบ (`err.code === '23505'`, `err.constraint`) ออกมาให้ feature จับได้ หรือห่อเป็น `AppError` · ถ้าห่อ ให้ตรวจชื่อซ้ำด้วย SELECT ก่อน INSERT เป็นด่านแรกและจับ race ด้วย try/catch ทั่วไป
2. ชื่อ event realtime ของ `useRealtime('knowledge.status')`: ตรวจกับ web core ว่า type string ตรง `RealtimeEvent['type']`
3. `model.moderate` กับข้อความไทย: เอกสารไม่ระบุความแม่นยำ ทดสอบด้วยข้อความไทยสังเคราะห์ที่ไม่เหมาะสม 2–3 ข้อความ (ไม่ใช้ข้อมูลจริง) จดผลใน EVIDENCE.md · ไม่ใช่เกณฑ์ผ่าน/ตก
4. `storage.save` allow-list และ `UPLOAD_MAX_MB` ของ core ต้องไม่ต่ำกว่า 16 MB: ตรวจ `.env.example`/`F01` · ต่ำกว่า = ใช้ค่าของ core และแก้ข้อความ UI
5. `useSlot('knowledgeActions')` มีจริงใน web core ตามที่ `contracts.ts` ระบุ: ตรวจก่อนใช้ (ไม่มี = ไม่ render ปุ่ม แจ้ง `NEED TO:C1`)
6. ลำดับ merge F05 → F07 → B3: ถ้า B3 เรียก `createKnowledgeDraft` ก่อน S2 ใช้ fake (คืน id หลอก ไม่เขียน DB) ตามที่ระบุใน Contract additions · แจ้ง B3 ตอน DONE
7. สถานะของ item เมื่อร้านแก้ item active และ index ใหม่ `failed` ค้างนาน: ไม่มีตัวจับเวลาให้ย้อน (ยอมรับ) · ตรวจว่า F07 ส่ง `knowledge.status` `failed` ให้ UI เห็น
8. ตัวเลขขนาดไฟล์ 8/16 MB เป็นค่าของเรา (จาก know-how เดิม) ไม่ใช่ขีดจำกัดของ OpenAI: ปรับได้ใน `config.ts`
