# F11 team — ทีม คนรับช่วง (human handoff) และตารางงาน

| | |
|---|---|
| Lane / คน | **A1** / **A** · ลำดับ 2 ใน lane (F09 → **F11** → F12 → F23) |
| Tier / เป้า | **P0** · เป้า **R** · ส่วน takeover/คืน AI/staff reply อยู่ใน CORE-LOOP GATE 13:00 ขั้น 5 → **slice 1 ต้อง merge ก่อน 12:15** · schedule, idle, auto-assign, notes เป็น R หรือ S ตามที่ทันและจดใน EVIDENCE.md |
| Timebox | 45–90 นาที (S1+S2 = ขั้นต่ำ 45 · ครบ S1–S4 ≈ 90) |
| พึ่ง | F09 (`getConversation`, `sendStaffMessage` เรียกกลับมาที่ `assignConversation`) · F03 (ตาราง `memberships` อ่านอย่างเดียว) · F31 `notify` (fake ได้) · core (`db`, `publish`, `audit`, `jobs` + `schedules`, `defineFeatureRoutes`) |
| ให้ | `isHumanTakeover` · `assignConversation` (contracts.ts) · ของใหม่ใน §4: `requestHumanHandoff` (B2 F10/F30 เรียก) · `closeConversation` · `reopenConversation` · `getTeamAvailability` |
| ใช้ | contracts ใน §4 · F09 service (`getConversation`) · ตาราง core `conversations` `memberships` `users` `customers` (เขียนเฉพาะคอลัมน์ handler/assignee/version/status ของ `conversations` ผ่านฟังก์ชันของ F11 เท่านั้น) |
| โฟลเดอร์ | `server/src/features/team/` · `shared/features/team/types.ts` · `web/src/features/team/` |
| Web path | `/team` (ทีมและตารางงาน) + แผงใน `/chat` ผ่าน slot `chatSidePanels` และปุ่มลัดผ่าน `chatComposerActions` |
| ห้ามหลุด 5 ข้อ | (1) `conversations.handler/assignee_user_id/version` เขียนผ่าน F11 ที่เดียว (2) takeover แล้ว `isHumanTakeover()` = true ทันที และ AI เงียบ (3) assignment ที่ `expectedVersion` ไม่ตรง = 409 `VERSION_CONFLICT` ไม่เขียนทับเงียบ ๆ (4) โน้ตเป็นข้อมูลภายใน: ไม่เคยเขียนตาราง `messages` ไม่เคยเรียก `sendToCustomer` (5) แชตที่ถูกทิ้งต้องคืน AI/ปิดได้เสมอ ไม่ติด 409 |

อ่าน: `contracts.ts` (team, inbox, notifications, ScheduleDefinition, RealtimeEvent) · [F09-inbox.md](F09-inbox.md) §5.4 (นิยาม waiting) · [F10-ai-agent.md](F10-ai-agent.md) §4 หัวข้อ "ขอจาก lane อื่น" · [COOKBOOK](../COOKBOOK.md) §2 §6 · know-how เดิม: [porting brief](../porting/F11-team.md) (ไม่ต้องใช้ในการสร้าง)

## 1. เป้าหมายและ user stories

ทำไมมี: AI ตอบได้ แต่ลูกค้าบางคนต้องการคน และเจ้าของต้องรู้ว่า "ใครถือแชตไหน" บอทต้องหยุดทันทีเมื่อคนรับช่วง และต้องไม่มีแชตที่ไม่มีใครดูแลโดยไม่มีใครรู้

ผู้ใช้: พนักงาน (รับช่วง ตอบ คืน AI) · เจ้าของ (จัดทีม ตารางงาน นโยบายแชตค้าง) · B2 (AI ขอคนผ่าน `requestHumanHandoff`)

User stories:
1. พนักงานกด "รับช่วงแชต" ในแชตที่ AI ตอบอยู่ → บอทหยุด ลูกค้าส่งข้อความต่อแล้วไม่มีคำตอบอัตโนมัติ ข้อความยังบันทึก
2. พนักงานกด "คืนให้ AI" → ข้อความถัดไปของลูกค้าได้คำตอบจาก AI อีกครั้ง
3. ลูกค้าพิมพ์ "ขอคุยกับพนักงาน" → AI รับทราบแล้วแชตเข้า "รอพนักงานรับ" ทีมได้แจ้งเตือน (ถ้าเปิดมอบหมายอัตโนมัติ ระบบเลือกพนักงานที่ว่างให้)
4. พนักงานสองคนกดรับช่วงพร้อมกัน → คนแรกได้ คนที่สองเห็น "<ชื่อ> ดูแลแชตนี้อยู่" และเลือกรับช่วงต่อได้
5. เจ้าของตั้งตารางงานรายสัปดาห์ของพนักงาน (เวลา Asia/Bangkok, พัก) → สถานะ "ว่าง/พัก/นอกเวลา" เปลี่ยนตามเวลาเอง
6. เจ้าของตั้ง "แชตรอตอบนานเกิน 30 นาที → แจ้งเตือน/โอนให้คนอื่น"
7. พนักงานจดโน้ตภายในในแชต (กล่าวถึงเพื่อนด้วย @) ปักหมุดโน้ตของลูกค้า ลูกค้าไม่เห็นเด็ดขาด

นอกขอบเขต: โอนแชตเป็นชุดพร้อม preview (Papi มี; เราตัด: reassign ทีละแชตเพียงพอสำหรับเดโม) · `chat.view_all` scoping · `ai_force_on` · การตรวจว่าลูกค้าขอคน (F10) · ส่งข้อความหาลูกค้า (F09 `sendStaffMessage`) · ปิดแชตอัตโนมัติด้วย AI summary (F26)

## 2. Data model

`conversations.handler` `assignee_user_id` `version` `status` `closed_at` อยู่ใน `001_core.sql`: F11 เป็นผู้เขียนเดียว (UPDATE เฉพาะคอลัมน์เหล่านี้) · ไม่ ALTER ไม่ CREATE INDEX บนตาราง core

`server/src/features/team/migrations/001_team.sql`:
```sql
-- dependsOn: core
CREATE TABLE team_settings (
  business_id uuid PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  auto_assign boolean NOT NULL DEFAULT false,            -- เลือกคนว่างให้เมื่อแชตเข้าคิว
  idle_policy text NOT NULL DEFAULT 'off' CHECK (idle_policy IN ('off','alert','reassign')),
  idle_minutes int NOT NULL DEFAULT 30 CHECK (idle_minutes BETWEEN 5 AND 1440),
  auto_close boolean NOT NULL DEFAULT false,             -- ปิดแชตค้างตาม §5.8
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE team_availability (
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  manual_status text NOT NULL DEFAULT 'available' CHECK (manual_status IN ('available','away','off_shift')),
  schedule jsonb,                                         -- null = ไม่มีตาราง (ใช้ manual) · รูปแบบ §5.4
  schedule_paused boolean NOT NULL DEFAULT false,         -- เลือกสถานะเองขณะมีตาราง = พักตาราง
  last_assigned_at timestamptz,                           -- round-robin
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, user_id),
  CHECK (schedule IS NULL OR jsonb_typeof(schedule) = 'object')
);
CREATE TABLE conversation_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,   -- null = โน้ตของลูกค้า (ติดไปทุกแชตของลูกค้านั้น)
  kind text NOT NULL DEFAULT 'note' CHECK (kind IN ('note','handover','assistance')),  -- handover/assistance = audit แก้ลบไม่ได้
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  pinned boolean NOT NULL DEFAULT false,
  mention_user_ids uuid[] NOT NULL DEFAULT '{}',
  author_user_id uuid REFERENCES users(id) ON DELETE SET NULL,           -- null = ระบบ/AI
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (kind = 'note' OR conversation_id IS NOT NULL)
);
CREATE INDEX conversation_notes_conv ON conversation_notes (business_id, conversation_id, created_at) WHERE deleted_at IS NULL;
CREATE INDEX conversation_notes_customer ON conversation_notes (business_id, customer_id) WHERE pinned AND deleted_at IS NULL;
CREATE TABLE team_idle_events (                           -- 1 event ต่อการรอหนึ่งรอบ
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  wait_started_at timestamptz NOT NULL,
  action text NOT NULL CHECK (action IN ('alerted','reassigned','no_one_available')),
  from_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  to_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, wait_started_at)
);
```
- ไม่มีแถว `team_settings` = ค่าเริ่มต้น (auto_assign false, idle off, auto_close false) · ไม่มีแถว `team_availability` = `available` (manual) ไม่มีตาราง
- ตาราง `memberships` ของ F03: อ่านอย่างเดียว (`status='active'`, `permissions`, `role`)
- ชื่อผู้ใช้อ่านจาก `users.display_name` (ผู้ใช้ `status<>'active'` ไม่นับเป็นเจ้าของ)

## 3. API endpoints

path ใต้ `/api/v1` · route แบบ `:conversationId` ใช้ `auth:'user'` แล้ว `ctx.requireBusiness(conv.businessId, key)` ก่อนอ่านอย่างอื่น (ไม่มี/ร้านอื่น = `NOT_FOUND`) · route ที่ใช้ `:businessId` ใช้ `auth:'business'`

| Method | Path | auth | permission | Request | Response | Errors |
|---|---|---|---|---|---|---|
| GET | `/conversations/:conversationId/team` | user | `chat.read` | — | `ConversationTeamState` | NOT_FOUND |
| POST | `/conversations/:conversationId/takeover` | user | `chat.takeover` | `TakeoverBody` | `AssignmentResult` | NOT_FOUND, VERSION_CONFLICT (`details.holder`, `reason:'conversation_taken'`), POLICY_BLOCKED (`conversation_closed`) |
| POST | `/conversations/:conversationId/release` | user | `chat.takeover` | `{ note?: string }` | `AssignmentResult` (handler `ai`) | NOT_FOUND |
| POST | `/conversations/:conversationId/queue` | user | `chat.takeover` | `{ note?: string }` | `AssignmentResult` (human, ไม่มีผู้ดูแล) | NOT_FOUND |
| POST | `/conversations/:conversationId/assign` | user | `chat.schedule` | `{ userId: uuid, expectedVersion: int }` | `AssignmentResult` | NOT_FOUND, VERSION_CONFLICT, VALIDATION_ERROR (ไม่ใช่สมาชิก/สิทธิ์) |
| POST | `/conversations/:conversationId/close` | user | `chat.takeover` | `{ note?: string }` | `{ status:'closed', version }` | NOT_FOUND |
| POST | `/conversations/:conversationId/reopen` | user | `chat.takeover` | — | `{ status:'open', version }` | NOT_FOUND, POLICY_BLOCKED (`customer_has_open_conversation`) |
| POST | `/conversations/:conversationId/ask-help` | user | `chat.reply` | `{ message?: string ≤300 }` | `{ notified: number }` | NOT_FOUND |
| GET | `/conversations/:conversationId/notes` | user | `chat.read` | — | `{ customerPinned: NoteView[]; notes: NoteView[] }` | NOT_FOUND |
| POST | `/conversations/:conversationId/notes` | user | `chat.reply` | `NoteBody` | `NoteView` (201) | NOT_FOUND, VALIDATION_ERROR |
| PATCH | `/conversations/:conversationId/notes/:noteId` | user | `chat.reply` | `NotePatchBody` | `NoteView` | NOT_FOUND, PERMISSION_DENIED (ไม่ใช่เจ้าของโน้ต/เจ้าของร้าน), POLICY_BLOCKED (`audit_note`) |
| DELETE | `/conversations/:conversationId/notes/:noteId` | user | `chat.reply` | — | no_content | เหมือน PATCH |
| GET | `/businesses/:businessId/team` | business | `chat.read` | — | `TeamOverview` | — |
| PUT | `/businesses/:businessId/team/me/availability` | business | `chat.read` | `{ status: 'available'\|'away'\|'off_shift' }` | `TeamMemberView` | — |
| PUT | `/businesses/:businessId/team/:userId/schedule` | business | `chat.schedule` | `{ schedule: Schedule \| null }` | `TeamMemberView` | NOT_FOUND, VALIDATION_ERROR (`invalid_schedule` `schedule_empty`) |
| POST | `/businesses/:businessId/team/:userId/schedule/resume` | business | `chat.schedule` (หรือ userId = ตัวเอง) | — | `TeamMemberView` | NOT_FOUND |
| GET | `/businesses/:businessId/team/settings` | business | `chat.read` | — | `TeamSettingsView` | — |
| PUT | `/businesses/:businessId/team/settings` | business | `chat.schedule` | `TeamSettingsBody` | `TeamSettingsView` | VALIDATION_ERROR |

```ts
export const TakeoverBody = z.object({ expectedVersion: z.number().int().min(1).optional(), force: z.boolean().default(false) });
export const NoteBody = z.object({
  body: z.string().trim().min(1).max(2000),
  pinned: z.boolean().default(false),
  scope: z.enum(['conversation', 'customer']).default('conversation'),      // customer = โน้ตของลูกค้า ติดทุกแชต
  mentionUserIds: z.array(z.string().uuid()).max(10).default([]),
});
export const NotePatchBody = z.object({ body: z.string().trim().min(1).max(2000).optional(), pinned: z.boolean().optional() });
const HM = /^([01]\d|2[0-3]):[0-5]\d$/, HM_END = /^(([01]\d|2[0-3]):[0-5]\d|24:00)$/;
export const Schedule = z.object({ days: z.record(z.enum(['1','2','3','4','5','6','7']), z.object({
  start: z.string().regex(HM), end: z.string().regex(HM_END),
  breaks: z.array(z.object({ start: z.string().regex(HM), end: z.string().regex(HM_END) })).max(6).default([]),
})) }).strict();                                                            // ตรวจ start<end / พักอยู่ในเวลางาน / ไม่ทับกัน / ว่างทั้งสัปดาห์ ใน validateSchedule()
export const TeamSettingsBody = z.object({
  autoAssign: z.boolean(), idlePolicy: z.enum(['off', 'alert', 'reassign']),
  idleMinutes: z.number().int().min(5).max(1440), autoClose: z.boolean(),
});

export type EffectiveAvailability = 'available' | 'away' | 'off_shift';
export interface ConversationTeamState {
  conversationId: string; version: number; status: 'open' | 'closed';
  handler: 'ai' | 'human'; assigneeUserId: string | null; assigneeName: string | null;
  isQueued: boolean;                    // human && ไม่มีผู้ดูแล (active)
  canTakeover: boolean;                 // ผู้เรียกมี chat.takeover และแชตเปิดอยู่
  candidates: { userId: string; displayName: string; availability: EffectiveAvailability; openCount: number }[];  // ใช้ใน dialog มอบหมาย (ว่างเปล่าถ้าไม่มี chat.schedule)
}
export interface NoteView { id: string; conversationId: string | null; kind: 'note' | 'handover' | 'assistance'; body: string; pinned: boolean; authorUserId: string | null; authorName: string | null; mentionUserIds: string[]; createdAt: string; updatedAt: string; editable: boolean }
export interface TeamMemberView {
  userId: string; displayName: string; email: string; role: 'owner' | 'staff';
  manualStatus: EffectiveAvailability; schedule: Schedule | null; schedulePaused: boolean;
  availability: EffectiveAvailability; nextChange: { at: string; availability: EffectiveAvailability } | null;
  openConversations: number;
}
export interface TeamOverview { members: TeamMemberView[]; settings: TeamSettingsView }
export interface TeamSettingsView { autoAssign: boolean; idlePolicy: 'off' | 'alert' | 'reassign'; idleMinutes: number; autoClose: boolean }
```

## 4. Service functions และ contracts

`server/src/features/team/service.ts` · สองตัวแรกตรง `contracts.ts` ทุกตัวอักษร:

```ts
export async function isHumanTakeover(conversationId: string): Promise<boolean>;
export async function assignConversation(
  conversationId: string, userId: string | null,
  opts?: { expectedVersion?: number; actorUserId?: string; businessId?: string },
): Promise<AssignmentResult>;
```
- `isHumanTakeover`: `SELECT handler = 'human' FROM conversations WHERE id = $1` · ไม่ใช่ uuid/ไม่มีแถว → `false` (ไม่ throw) · ไม่ cache
- `assignConversation(id, userId, opts)`: โหลดแถว (`opts.businessId` ไม่ตรง/ไม่มี → `NOT_FOUND`) · `userId` ไม่ null: ต้องเป็นสมาชิก active ของร้านและ `users.status='active'` ไม่งั้น `VALIDATION_ERROR` · แชต `closed` และ `userId` ไม่ null → `POLICY_BLOCKED` (`conversation_closed`) · `UPDATE conversations SET handler = <'human' เมื่อ userId, 'ai' เมื่อ null>, assignee_user_id = $userId, version = version + 1, updated_at = now() WHERE id = $1 AND business_id = $2 [AND version = $expected] RETURNING …` · ไม่คืนแถวและแถวมีอยู่ (version ต่าง) → `VERSION_CONFLICT` (`details: { currentVersion, holder? }`) · สำเร็จ → โน้ต audit `handover` (§5.2) · `publish('conversation.updated')` · `audit('conversation.assign', { details: { from, to, handler } })` · ไม่มี `expectedVersion` = เขียนทับตามแถวปัจจุบัน (ใช้โดย dev route/ระบบ) · เรียกซ้ำสถานะเดิม (ผู้ถือเดิม = userId เดิม) = no-op คืนค่าเดิมไม่เพิ่ม version

### Contract additions

```ts
// ═══ F11 team · A1 additions (วางต่อท้ายส่วน F11 ใน contracts.ts) ═══
/**
 * @owner F11 team · A1 · consumers: B2 F10 (escalation / budget exhausted), B2 F30 voice (ลูกค้าขอคน)
 * ตั้งแชตเป็นคนดูแลโดยไม่มีผู้ดูแล: handler 'human', assignee null → isHumanTakeover() = true, บอทเงียบ, แชตขึ้นคิว "รอพนักงานรับ",
 * โน้ต audit 'handover', publish 'conversation.updated', audit 'conversation.handoff.requested',
 * notify({ type: 'chat.handoff', to: { permission: 'chat.takeover' }, link: '/chat?c=<id>' }) และถ้า team_settings.auto_assign
 * เปิด → เลือกพนักงานที่ว่างแบบ round-robin ให้ทันที. Idempotent: ถ้า handler เป็น 'human' อยู่แล้วคืนค่าปัจจุบัน ไม่เพิ่ม version
 * ไม่แจ้งซ้ำ. แชตปิดแล้ว → POLICY_BLOCKED. ไม่พบ/ร้านอื่น → NOT_FOUND.
 * @fake พลิก flag ในหน่วยความจำให้ isHumanTakeover(conversationId) คืน true; คืน { conversationId, assigneeUserId: null, handler: 'human', version: 1 }
 */
export declare function requestHumanHandoff(
  conversationId: string,
  input: { reason: string; actor: 'ai' | 'customer' | 'staff' },
  opts?: { businessId?: string },
): Promise<AssignmentResult>;
/**
 * @owner F11 team · A1 · consumers: A1 F09 (Demo Chat reset), F11 timers
 * ปิดแชต (status 'closed', closed_at, version+1, publish 'conversation.updated', audit 'conversation.close'). ไม่เคย 409.
 * ปิดซ้ำ = no-op. reason ใช้บันทึกโน้ต audit.
 */
export declare function closeConversation(conversationId: string, opts: { actorUserId: string | null; reason?: string; businessId?: string }): Promise<{ status: 'closed'; version: number }>;
/** @owner F11 team · A1. เปิดแชตที่ปิดล่าสุดของลูกค้าอีกครั้งเมื่อลูกค้าไม่มีแชตเปิดอยู่ ไม่งั้น POLICY_BLOCKED 'customer_has_open_conversation'. */
export declare function reopenConversation(conversationId: string, opts: { actorUserId: string; businessId?: string }): Promise<{ status: 'open'; version: number }>;
/**
 * @owner F11 team · A1 · consumers: A1 F23 (ไม่ใช้) , C3 F31 (ไม่ใช้) , B3 F27 (อ่านจำนวนคนว่าง)
 * สถานะที่มีผลตอนนี้ของสมาชิกที่ถือ chat.takeover ทุกคนของร้าน
 * @fake [] 
 */
export declare function getTeamAvailability(businessId: string, at?: string): Promise<{ userId: string; displayName: string; availability: 'available' | 'away' | 'off_shift' }[]>;
```
ฟังก์ชันภายในที่ route ใช้ (ไม่ใช่ contract): `takeoverConversation`, `releaseConversation`, `queueConversation`, `autoAssign`, `scheduleStateAt`, `validateSchedule`, `effectiveAvailability`.

## 5. Algorithms

### 5.1 State machine (handler, assignee, status)

สถานะ: **AI** = (`ai`, ไม่มีผู้ดูแล, open) · **QUEUE** = (`human`, ไม่มีผู้ดูแล, open) · **HELD(u)** = (`human`, u, open) · **CLOSED** = status `closed`

| from | event | to | หมายเหตุ |
|---|---|---|---|
| AI | `takeover` (staff) / `assign` (เจ้าของ) | HELD(u) | `version+1`, โน้ต handover, publish |
| AI | `requestHumanHandoff` | QUEUE (หรือ HELD(u) เมื่อ auto-assign เลือกได้) | AI เงียบทันที |
| QUEUE | `takeover` | HELD(u) | |
| QUEUE | `autoAssign` | HELD(u) | โน้ต "มอบหมายอัตโนมัติ" |
| QUEUE | `release` | AI | |
| HELD(u) | `takeover` โดย u เดิม | HELD(u) | no-op |
| HELD(u) | `takeover` โดย v ≠ u, ไม่มี `force` | (ไม่เปลี่ยน) | **409** `conversation_taken` + holder |
| HELD(u) | `takeover` โดย v, `force` (หรือ `expectedVersion` ตรงกับ version ปัจจุบัน) | HELD(v) | โน้ต handover (u → v) |
| HELD(u) | `assign` ให้ v (chat.schedule) | HELD(v) | ต้อง `expectedVersion` ตรง ไม่งั้น 409 |
| HELD(u) | `release` | AI | ล้ม assignee · ไม่เคย 409 |
| HELD(u) | `queue` (คืนเข้าคิว) | QUEUE | ไม่เคย 409 |
| HELD(u) | idle policy `reassign` เมื่อมีคนว่างอื่น | HELD(w) | §5.6 |
| HELD(u) | ผู้ถือ u ถูก revoke/disabled | QUEUE (คำนวณตอนอ่านและตอน sweep) | §5.9 |
| AI / QUEUE / HELD | `close` | CLOSED | ไม่เคย 409 |
| CLOSED | `reopen` | เดิมก่อนปิด (handler, assignee คงไว้; ถ้าผู้ถือไม่ active → QUEUE) | เมื่อลูกค้าไม่มีแชตเปิดอื่น |
| CLOSED | ลูกค้าทักใหม่ | (conversation ใหม่) AI | ทำโดย F09 `saveMessage` ไม่ใช่ F11 |

`ask-help` ไม่เปลี่ยนสถานะ (แจ้งเตือนอย่างเดียว + โน้ต `assistance`)

### 5.2 takeover / release / queue / close (route → service)

1. โหลด conversation (`getConversation`) → `requireBusiness(conv.businessId, key)` · `release` `queue` `close` ไม่เช็กผู้ถือ
2. `takeoverConversation(conv, actor, { expectedVersion, force })`: ปิดแล้ว → `POLICY_BLOCKED` · ถือโดย actor อยู่แล้ว → คืนค่าปัจจุบัน · ถือโดยคนอื่นที่ยัง active และ `!force` และ `expectedVersion` ไม่เท่า `conv.version` → `VERSION_CONFLICT` `details: { reason:'conversation_taken', holder:{ userId, displayName }, currentVersion }` · มิฉะนั้น `assignConversation(id, actor, { expectedVersion: conv.version, actorUserId: actor, businessId })` (ใช้ version ที่เพิ่งอ่านเพื่อกันแข่ง; ชนอีก → อ่านใหม่แล้ววนสูงสุด 2 รอบแล้ว 409)
3. `releaseConversation` = `assignConversation(id, null, …)` + โน้ต handover "คืนให้ AI โดย <ชื่อ>" + (ตัวเลือก) note ที่กรอก
4. `queueConversation` = UPDATE handler `human`, assignee null (version+1) + โน้ต handover "ส่งกลับคิว" + (ถ้า `auto_assign`) `autoAssign`
5. `closeConversation`: UPDATE `status='closed', closed_at = now(), version = version+1 WHERE id AND status='open'` · publish · audit `conversation.close` · โน้ต handover "ปิดแชต"
6. โน้ต audit (`kind='handover'`): `author_user_id = actor`, `body` เป็นข้อความสั้นภาษาไทยจากเหตุการณ์ (ตาราง i18n `team.audit.*` — เก็บเป็นข้อความที่สร้างตอนเกิดเหตุ ไม่ใช่ key) ไม่มีข้อมูลลูกค้าเกินจำเป็น

### 5.3 `requestHumanHandoff(conversationId, input, opts)`

1. โหลดแชต (`opts.businessId` ไม่ตรง → `NOT_FOUND`) · `closed` → `POLICY_BLOCKED`
2. `handler = 'human'` อยู่แล้ว → คืน `{ conversationId, assigneeUserId, handler:'human', version }` โดยไม่เขียนอะไร (idempotent)
3. `UPDATE … SET handler='human', assignee_user_id=NULL, version=version+1 WHERE id AND handler='ai'` (0 แถว = แข่งกัน → อ่านใหม่แล้วคืนเหมือนข้อ 2)
4. โน้ต `handover` ผู้เขียน null: "<ผู้ขอ> ขอให้พนักงานดูแล (เหตุผล: <reason ตัดเหลือ 80 ตัว>)" · `publish('conversation.updated')` · `audit('conversation.handoff.requested', { actorUserId: null, details: { reason, actor } })`
5. `notify({ businessId, to: { permission: 'chat.takeover' }, type: 'chat.handoff', title: 'ลูกค้าต้องการคุยกับพนักงาน', body: <ชื่อลูกค้า>, link: '/chat?c=' + id, dedupKey: 'handoff:' + id + ':v' + version })` · ล้ม → log ไม่ throw
6. `team_settings.auto_assign` → `autoAssign(conversationId)` (§5.5) · คืนผลล่าสุด

### 5.4 Availability และตาราง (Asia/Bangkok, คำนวณตอนอ่าน ไม่มี cron พลิกค่า)

รูปแบบ `schedule`: `{ "days": { "1": { "start": "09:00", "end": "18:00", "breaks": [{ "start": "12:00", "end": "13:00" }] } } }` · key = วัน ISO 1=จันทร์ … 7=อาทิตย์ · วันที่ไม่มี key = วันหยุด · `end` เป็น `24:00` ได้ · กะไม่ข้ามเที่ยงคืน (แบ่งสองวัน)

`validateSchedule`: start < end · พักอยู่ภายในเวลางานและ start<end · พักเรียงแล้วไม่ทับกัน · ≤ 6 พักต่อวัน · ว่างทั้งสัปดาห์ → `schedule_empty` · ผิดรูป → `invalid_schedule` · `null` = ลบตาราง

`scheduleStateAt(schedule, at)`: แปลง `at` เป็นเวลาท้องถิ่น UTC+7 (ไม่มี DST): `isoDay`, `minute` = ชั่วโมง×60+นาที · ไม่มีรายการของวัน → `off_shift` · `minute < start` หรือ `minute >= end` → `off_shift` · อยู่ในพักใดพักหนึ่ง (`start <= minute < end`) → `away` · อื่น → `available` (ขอบ: เริ่มงานนับ, เลิกงานไม่นับ)

`effectiveAvailability(row, at)`: มี schedule และ `!schedule_paused` → `scheduleStateAt` · มิฉะนั้น `manual_status` · ไม่มีแถว → `available`
`nextChange`: ไล่จุดเปลี่ยน (start/end/break) ของ 8 วันข้างหน้าที่ `> at` เรียงน้อย→มาก คืนจุดแรกที่ state ต่างจากปัจจุบัน; ไม่มี → null
เลือกสถานะเองขณะมีตาราง → `manual_status = <ค่า>, schedule_paused = true` · `resume` หรือบันทึกตารางใหม่ → `schedule_paused = false`

### 5.5 `autoAssign(conversationId)`

เงื่อนไขเข้า: แชต open, handler human, ไม่มีผู้ดูแล active · ผู้มีสิทธิ์ถูกเลือก (eligible): สมาชิก active ที่ถือ `chat.takeover` (owner มีทุก key) และ (`role='staff'` หรือ owner ที่มีแถว `team_availability`) และ `effectiveAvailability = 'available'` ณ ตอนนี้ และ (กรณี idle reassign) ไม่ใช่ผู้ถือเดิม
1. ไม่มีผู้มีสิทธิ์ → ไม่เปลี่ยน (ยังเป็น QUEUE) คืน null (ผู้เรียกแจ้งเจ้าของ)
2. เลือกคนที่ `last_assigned_at` เก่าสุด (null มาก่อน) เสมอกันเรียง `user_id` · อัปเดต `last_assigned_at = now()` ใน tx เดียวกับ `assignConversation`
3. `assignConversation(id, picked, { actorUserId: undefined })` แล้วโน้ต handover "มอบหมายอัตโนมัติให้ <ชื่อ>" · `notify({ to: { userIds: [picked] }, type: 'chat.handoff', title: 'มีแชตมอบหมายให้คุณ', link })`
4. ปิดสวิตช์ `auto_assign` → ข้ามทั้งหมด (ค่าเริ่มต้นปิด เพื่อให้ขั้น takeover ของ gate คาดเดาได้)

### 5.6 นโยบายแชตค้าง (idle) — schedule `team.idle-scan` ทุก 60 วินาที

เรียกผ่าน `schedules: [{ name: 'team.idle-scan', everySeconds: 60, handler }]` (core บังคับ 1 instance ด้วย advisory lock)
1. ทุกร้านที่ `idle_policy <> 'off'`: หา conversation `status='open' AND handler='human'` ที่ **กำลังรอพนักงาน** = มีข้อความลูกค้าที่ยังไม่มีข้อความ staff ตอบ: `wait_started_at` = `min(created_at)` ของ inbound ลูกค้าที่ `seq >` seq ของข้อความ outbound `author IN ('staff')` ล่าสุด (อ่านตาราง `messages` อย่างเดียว) และ `wait_started_at < now() - idle_minutes`
2. `INSERT INTO team_idle_events (…, wait_started_at) ON CONFLICT (conversation_id, wait_started_at) DO NOTHING RETURNING id` · ไม่ได้แถว = จัดการรอบนี้แล้ว ข้าม (1 event ต่อการรอหนึ่งรอบ)
3. นโยบาย `alert` (หรือแชตอยู่ QUEUE): `notify({ to: { userIds: [ผู้ถือ] } ∪ { role: 'owners' }, type: 'chat.handoff', title: 'แชตรอตอบนานเกินกำหนด', link, dedupKey: 'idle:' + id + ':' + wait_started_at })` · action `alerted`
4. นโยบาย `reassign` และมีผู้ถือ: `autoAssign` แบบไม่รวมผู้ถือเดิม → สำเร็จ action `reassigned` (from/to) · ไม่มีคนว่าง → **คงผู้ถือเดิม** แล้ว `notify({ businessId, to: { role: 'owners' }, type: 'chat.handoff', title: 'ไม่มีพนักงานว่างรับแชตที่รอนาน', link: '/chat?c=' + id, dedupKey: 'idle-none:' + id + ':' + wait_started_at })` (รูปเต็มตาม `NotifyInput` ใน contracts.ts: `to` เป็น object, `role` ไม่ใช่ key ระดับบน) action `no_one_available`
5. ทั้งหมดอยู่ใน try/catch รายแชต: แชตหนึ่งล้มไม่ล้มทั้งรอบ · จำกัด 200 แชตต่อรอบ

### 5.7 โน้ตและ mention

- สร้าง: ตรวจ `mentionUserIds` ทุกคนเป็นสมาชิก active ที่มี `chat.read` (ไม่ใช่ → ตัดทิ้ง ไม่ error) · `scope: 'customer'` → `conversation_id = NULL` (ใช้ `customer_id` ของแชต) และ `pinned` ได้ · `scope: 'conversation'` → ผูกแชต
- ผู้ถูกกล่าวถึง (ไม่รวมตัวเอง) → `notify({ to: { userIds }, type: 'chat.mention', title: '<ชื่อ> กล่าวถึงคุณในแชต', body: <60 ตัวแรกของโน้ต>, link: '/chat?c=<id>', dedupKey: 'mention:' + noteId })`
- แก้/ลบ: เจ้าของโน้ตหรือ owner ของร้าน (ไม่งั้น `PERMISSION_DENIED`) · `kind <> 'note'` → `POLICY_BLOCKED` `audit_note` · ลบ = ตั้ง `deleted_at` (ไม่ลบแถว)
- `GET notes`: `customerPinned` = โน้ตของลูกค้านี้ที่ `conversation_id IS NULL AND pinned` · `notes` = โน้ตของแชตนี้ทั้งหมด (รวม audit) เรียงเวลา · `editable` = ผู้เรียกเป็นเจ้าของ/owner และ kind note
- **โน้ตไม่เขียนตาราง `messages` ไม่เรียก `sendToCustomer` ไม่ส่งให้ sender ใด** (test บังคับ)

### 5.8 ปิดแชตค้างอัตโนมัติ (ทางเลือก, schedule `team.auto-close` ทุก 300 วินาที, เฉพาะร้านที่ `auto_close=true`)

ค่าเริ่มต้นปรับได้ใน `limits.ts`: AI ตอบอยู่ (`ai`) ไม่มีความเคลื่อนไหว **24 ชม.** · QUEUE **48 ชม.** · HELD **168 ชม.** (วัดจาก `last_message_at`) → `closeConversation(id, { actorUserId: null, reason: 'timeout' })` · จำกัด 200 แชตต่อรอบ

### 5.9 ผู้ถือที่ไม่ active

อ่านผู้ถือด้วยการ join `memberships(status='active')` และ `users(status='active')` · ไม่ active → แสดงเป็น "ยังไม่มีผู้ดูแล" (QUEUE) และ `takeover` ไม่ติด 409 · sweep ใน `team.idle-scan` (ถ้าร้านเปิดนโยบายใด ๆ): แชต HELD(u) ที่ u ไม่ active → `queueConversation` อัตโนมัติ

ค่าคงที่: `IDLE_SCAN_SECONDS=60` · `AUTO_CLOSE_SCAN_SECONDS=300` · `MAX_PER_SCAN=200` · `NOTE_MAX=2000` · `MENTION_MAX=10` (ทั้งหมดใน `limits.ts`)

## 6. AI calls

ไม่มี AI call (การตรวจว่าลูกค้าขอคนเป็นงานของ F10 ซึ่งเรียก `requestHumanHandoff`)

## 7. UI

routes (`web/src/features/team/pages.tsx`): `/team` layout app, permission `chat.read`, `titleKey: 'team:page.title'` · เมนู `/team` กลุ่ม `settings` icon `BadgeOutlined` order 20 permission `chat.read` searchTerms `['ทีม','พนักงาน','ตารางงาน','team']`

slots: `chatSidePanels` id `team.panel` order 10 (props `{ conversationId }`) · `chatComposerActions` id `team.quick` order 10 (ปุ่มลัดรับช่วง/คืน AI ใกล้ช่องพิมพ์; สำหรับมือถือที่แผงข้างซ่อน)

**แผงในแชต (`ConversationPanel`)**: ส่วนบน = สถานะ: `StatusChip kind="conversation"` handler + "ดูแลโดย <ชื่อ>" หรือ "รอพนักงานรับช่วง" · ปุ่มตามสถานะ (แสดงเฉพาะที่ทำได้):
- AI/QUEUE → **รับช่วงแชต** (`data-testid="team-takeover"`)
- HELD โดยตัวเอง → **คืนให้ AI** (`data-testid="team-release"`), **ส่งกลับคิว**, **มอบหมายให้…** (เมื่อมี `chat.schedule`: dialog รายชื่อ + สถานะว่าง/พัก/นอกเวลา + จำนวนแชตที่ถือ)
- HELD โดยคนอื่น → **รับช่วงต่อ** (ConfirmDialog "<ชื่อ> ดูแลแชตนี้อยู่ รับช่วงต่อหรือไม่?" แล้วส่ง `force`) และ **คืนให้ AI**
- ทุกสถานะ: **ขอให้เพื่อนช่วย** (ช่องข้อความ ≤300), **ปิดแชต** (ConfirmDialog) / **เปิดแชตอีกครั้ง**
- ตัวชิปสถานะมี `data-testid="team-handler-chip"` (`data-handler="ai|human"`)
- แท็บ "โน้ต": โน้ตปักหมุดของลูกค้า (พื้นเหลืองอ่อน) + โน้ตของแชต + แถว audit (ตัวเอียง, ไม่มีปุ่มแก้) · ช่องพิมพ์โน้ต + สวิตช์ "ปักหมุดที่ลูกค้า" + `@` เปิดรายชื่อสมาชิกให้เลือก (เก็บเป็น `mentionUserIds`) · ป้าย "ลูกค้าไม่เห็นโน้ตนี้" ใต้ช่องพิมพ์เสมอ
- หลัง takeover/release ทุกครั้ง: toast ผล + invalidate (`conversation.updated` ผ่าน `/ws` ก็รีเฟรชแผงให้ทุกคน)

**หน้า `/team`**: `SectionCard` "สมาชิกทีม": `DataTable` คอลัมน์ ชื่อ · บทบาท · สถานะตอนนี้ (`StatusChip generic`: `available`→"ว่าง" `away`→"พัก" `off_shift`→"นอกเวลา" ใช้ label ของ i18n เพราะ map กลางไม่มี) · เปลี่ยนสถานะ (select เฉพาะแถวตัวเอง) · ตารางงาน (สรุป "จ–ศ 10:00–20:00 · พัก 12:00–13:00" หรือ "ไม่มีตาราง" + ป้าย "หยุดชั่วคราว" + ปุ่ม "ใช้ตารางต่อ") · เปลี่ยนสถานะถัดไป "ว่างอีกครั้ง 13:00" · แชตที่ถือ · ปุ่ม "แก้ตารางงาน" (เฉพาะ `chat.schedule`) · `FormDialog` แก้ตาราง: 7 แถว (สวิตช์ทำงาน, เริ่ม–เลิก `type=time`, พัก ≤ 6 รายการต่อวัน), ปุ่ม "คัดลอกวันจันทร์ไปทุกวัน", ปุ่ม "ล้างตาราง" (= null) · `SectionCard` "นโยบายแชต" (เฉพาะ `chat.schedule` แก้ได้; คนอื่นอ่านอย่างเดียว): สวิตช์ "เลือกพนักงานที่ว่างให้อัตโนมัติ", select นโยบายแชตค้าง (ปิด/แจ้งเตือน/โอนให้คนอื่น) + นาที (5–1440), สวิตช์ "ปิดแชตที่ไม่มีความเคลื่อนไหว (AI 24 ชม. · รอคน 48 ชม. · มีคนถือ 7 วัน)" · state: loading skeleton, error + ลองใหม่, empty (มีสมาชิกอย่างน้อย 1 เสมอ) · ข้อความเวลาแสดง Asia/Bangkok

### ตาราง i18n (namespace `team`)

| key | th | en |
|---|---|---|
| `menu.title` | ทีมและตารางงาน | Team |
| `page.title` | ทีมและตารางงาน | Team and schedule |
| `panel.title` | การดูแลแชต | Chat handling |
| `panel.handlerAi` | AI ตอบ | AI replying |
| `panel.handlerHuman` | พนักงานตอบ | Staff replying |
| `panel.heldBy` | ดูแลโดย {{name}} | Handled by {{name}} |
| `panel.queued` | รอพนักงานรับช่วง | Waiting for staff |
| `actions.takeover` | รับช่วงแชต | Take over |
| `actions.takeoverFrom` | รับช่วงต่อ | Take over from {{name}} |
| `actions.release` | คืนให้ AI | Hand back to AI |
| `actions.queue` | ส่งกลับคิว | Return to queue |
| `actions.assign` | มอบหมายให้… | Assign to… |
| `actions.askHelp` | ขอให้เพื่อนช่วย | Ask a teammate |
| `actions.close` | ปิดแชต | Close chat |
| `actions.reopen` | เปิดแชตอีกครั้ง | Reopen chat |
| `toast.takenOver` | รับช่วงแชตแล้ว AI จะหยุดตอบแชตนี้ | You took over. The AI stops replying here |
| `toast.released` | คืนให้ AI แล้ว | Handed back to AI |
| `toast.queued` | ส่งกลับคิวแล้ว | Returned to queue |
| `toast.assigned` | มอบหมายแล้ว | Assigned |
| `toast.closed` | ปิดแชตแล้ว | Chat closed |
| `toast.reopened` | เปิดแชตอีกครั้งแล้ว | Chat reopened |
| `toast.helpSent` | แจ้งเพื่อนร่วมทีมแล้ว | Teammates notified |
| `conflict.title` | รับช่วงต่อหรือไม่? | Take over? |
| `conflict.message` | {{name}} ดูแลแชตนี้อยู่ ต้องการรับช่วงต่อหรือไม่ | {{name}} is handling this chat. Take over? |
| `close.title` | ปิดแชตนี้? | Close this chat? |
| `close.message` | ถ้าลูกค้าทักมาใหม่ ระบบจะเปิดแชตใหม่ให้ | If the customer writes again, a new chat opens |
| `assign.title` | มอบหมายแชต | Assign chat |
| `assign.openCount` | ถือ {{n}} แชต | Holds {{n}} chats |
| `assign.none` | ไม่มีสมาชิกที่เลือกได้ | No one to assign |
| `help.title` | ขอให้เพื่อนช่วย | Ask a teammate to help |
| `help.placeholder` | บอกเพื่อนว่าต้องการอะไร (ไม่บังคับ) | Tell them what you need (optional) |
| `help.send` | ส่งแจ้งเตือน | Send alert |
| `notes.title` | โน้ต | Notes |
| `notes.customerPinned` | โน้ตของลูกค้า | Customer notes |
| `notes.placeholder` | เขียนโน้ตภายใน พิมพ์ @ เพื่อกล่าวถึงเพื่อนร่วมทีม | Write an internal note. Type @ to mention a teammate |
| `notes.internalOnly` | ลูกค้าไม่เห็นโน้ตนี้ | The customer cannot see this note |
| `notes.pin` | ปักหมุดที่ลูกค้า | Pin to customer |
| `notes.add` | เพิ่มโน้ต | Add note |
| `notes.audit` | บันทึกอัตโนมัติ | Automatic record |
| `notes.empty` | ยังไม่มีโน้ต | No notes yet |
| `notes.deleteTitle` | ลบโน้ตนี้? | Delete this note? |
| `status.available` | ว่าง | Available |
| `status.away` | พัก | Away |
| `status.off_shift` | นอกเวลา | Off shift |
| `members.title` | สมาชิกทีม | Team members |
| `members.name` | ชื่อ | Name |
| `members.role` | บทบาท | Role |
| `members.status` | สถานะตอนนี้ | Current status |
| `members.schedule` | ตารางงาน | Schedule |
| `members.noSchedule` | ไม่มีตาราง | No schedule |
| `members.paused` | หยุดชั่วคราว | Paused |
| `members.resume` | ใช้ตารางต่อ | Resume schedule |
| `members.nextChange` | {{status}} อีกครั้ง {{time}} | {{status}} again at {{time}} |
| `members.openCount` | แชตที่ถือ | Open chats |
| `members.editSchedule` | แก้ตารางงาน | Edit schedule |
| `schedule.title` | ตารางงานรายสัปดาห์ ({{name}}) | Weekly schedule ({{name}}) |
| `schedule.day.1` … `schedule.day.7` | จันทร์ อังคาร พุธ พฤหัสบดี ศุกร์ เสาร์ อาทิตย์ | Monday … Sunday |
| `schedule.working` | ทำงาน | Working |
| `schedule.start` | เริ่ม | Start |
| `schedule.end` | เลิก | End |
| `schedule.addBreak` | เพิ่มเวลาพัก | Add break |
| `schedule.copyMonday` | คัดลอกวันจันทร์ไปทุกวัน | Copy Monday to all days |
| `schedule.clear` | ล้างตาราง | Clear schedule |
| `schedule.invalid` | เวลาไม่ถูกต้อง ตรวจเวลาเริ่ม เลิก และพัก | Invalid times. Check start, end and breaks |
| `schedule.empty` | ต้องมีอย่างน้อยหนึ่งวันทำงาน | At least one working day is required |
| `schedule.timezone` | เวลา Asia/Bangkok | Asia/Bangkok time |
| `settings.title` | นโยบายแชต | Chat policy |
| `settings.autoAssign` | เลือกพนักงานที่ว่างให้อัตโนมัติ | Auto-assign to available staff |
| `settings.idlePolicy` | เมื่อแชตรอตอบนาน | When a chat waits too long |
| `settings.idle.off` | ไม่ทำอะไร | Do nothing |
| `settings.idle.alert` | แจ้งเตือน | Alert |
| `settings.idle.reassign` | โอนให้คนอื่นที่ว่าง | Reassign to someone available |
| `settings.idleMinutes` | รอนานเกิน (นาที) | Wait longer than (minutes) |
| `settings.autoClose` | ปิดแชตที่ไม่มีความเคลื่อนไหว (AI 24 ชม. · รอคน 48 ชม. · มีคนถือ 7 วัน) | Close inactive chats (AI 24h · queue 48h · held 7d) |
| `settings.readOnly` | คุณดูนโยบายได้อย่างเดียว | You can view the policy only |
| `audit.takeover` | {{name}} รับช่วงแชต | {{name}} took over |
| `audit.takeoverFrom` | {{name}} รับช่วงต่อจาก {{from}} | {{name}} took over from {{from}} |
| `audit.release` | {{name}} คืนแชตให้ AI | {{name}} handed back to AI |
| `audit.queue` | {{name}} ส่งแชตกลับคิว | {{name}} returned the chat to the queue |
| `audit.assign` | {{name}} มอบหมายแชตให้ {{to}} | {{name}} assigned the chat to {{to}} |
| `audit.auto` | ระบบมอบหมายให้ {{to}} อัตโนมัติ | Auto-assigned to {{to}} |
| `audit.handoff` | ขอให้พนักงานดูแล ({{reason}}) | Staff requested ({{reason}}) |
| `audit.close` | {{name}} ปิดแชต | {{name}} closed the chat |
| `audit.timeout` | ระบบปิดแชตเพราะไม่มีความเคลื่อนไหว | Closed automatically (inactive) |
| `audit.help` | {{name}} ขอให้เพื่อนช่วย | {{name}} asked for help |

หมายเหตุ: ข้อความ `audit.*` ถูกแสดงจากแถวโน้ตที่ server เขียนเป็นภาษาไทยตอนเกิดเหตุ (ไม่แปลย้อนหลังตามภาษาผู้ดู) · ตาราง `audit.*` ข้างบนคือแม่แบบข้อความที่ server ใช้ (ไฟล์ `messages.ts` ฝั่ง server) และอยู่ใน th.json/en.json ให้ครบเพื่อทดสอบ

## 8. Jobs, schedules, events

- schedules (ประกาศใน `routes.ts`): `team.idle-scan` ทุก 60 วินาที · `team.auto-close` ทุก 300 วินาที · handler รับ `{ slot }` (core enqueue ด้วย dedupKey `<name>@<slot>`) · ทำงานซ้ำได้ปลอดภัย (idempotent ด้วย `team_idle_events` และเงื่อนไข `status='open'`)
- jobs อื่น: ไม่มี
- realtime ที่ publish: `conversation.updated` (ทุกการเปลี่ยน handler/assignee/status) · custom `{ featureId:'F11', name:'team.changed' }` เมื่อ availability/schedule/settings เปลี่ยน
- audit: `conversation.assign` · `conversation.handoff.requested` · `conversation.close` · `conversation.reopen` · `team.schedule.update` · `team.availability.update` · `team.settings.update` · `team.note.create` / `.delete` (details ไม่มีเนื้อหาโน้ต)
- notify: `chat.handoff` (handoff, มอบหมาย, idle) · `chat.mention` (mention)

## 9. Seed และ fixtures

`server/src/features/team/seed.ts` (`dependsOn: ['core']`, `run` + `runDemo` + `resetDemo`):
- `run`: `team_settings` สองร้าน (autoAssign false, idle off, 30 นาที, autoClose false) · `team_availability`: `staff_a` manual available + ตารางทุกวัน ISO 1–7 `10:00–20:00` พัก `12:00–13:00` (ตรงเวลาเปิด SEED ของร้าน A) · `staff_b` manual available + ตารางจันทร์–เสาร์ (1–6) `09:00–18:00` พัก `12:00–13:00` · owner ไม่มีแถว · `ON CONFLICT DO NOTHING`
- `runDemo`: โน้ตปักหมุดของ `cust_a1` "ลูกค้าประจำ ชอบให้โทรก่อนส่งของ" (ผู้เขียน `staff_a`) · โน้ต 1 อันในแชต `conv_a_staff` กล่าวถึง `owner_a` · ตั้ง `team_settings` ร้าน A: autoAssign true, idle alert 30 นาที (เพื่อโชว์กรรมการ; `resetDemo` คืนค่าเดิม)
- `resetDemo`: ลบโน้ตทั้งหมดที่ไม่ใช่ audit ของแชต/ลูกค้าในร้านเดโม A/B ที่สร้างหลัง seed (ใช้ marker `created_at > seed` ไม่ได้ จึงลบโน้ตทุกอันแล้วสร้างโน้ตตัวอย่างใหม่ของ `runDemo`) · ลบ `team_idle_events` · คืน `team_settings` เป็นค่าเริ่มต้น · คืน conversations ของ SEED (`conv_a_ai` handler ai, `conv_a_staff` human staff_a ฯลฯ) ให้ตรงค่า SEED ด้วย `UPDATE … version = version + 1` (เขียนผ่านฟังก์ชันภายใน ไม่ใช่ SQL นอก F11)
- fixture test: `makeSchedule(partial)` · เวลาเทียบด้วย `CLOCK_FIXTURE` = 2026-11-21T03:00:00Z (**เสาร์ 10:00 Bangkok**, ISO day 6) · สร้าง conversation ใหม่ทุกเคสผ่าน `saveMessage` ด้วย externalId `t-<uuid>`

## 10. Tests

Unit (`team.service.test.ts`, vitest):
1. `isHumanTakeover`: handler ai → false · หลัง `assignConversation(id, staff)` → true · id ไม่มี/ไม่ใช่ uuid → false
2. `assignConversation`: userId null → handler ai, assignee null, version+1 · ซ้ำสถานะเดิม → ไม่เพิ่ม version · `expectedVersion` เก่า → `VERSION_CONFLICT` และแถวไม่เปลี่ยน · assignee ไม่ใช่สมาชิก/ร้านอื่น/revoked → `VALIDATION_ERROR` · ร้านอื่น (`opts.businessId`) → `NOT_FOUND` · แชตปิด + userId → `POLICY_BLOCKED` · publish `conversation.updated` เรียก 1 ครั้ง · audit `conversation.assign` ถูกเขียน · โน้ต handover 1 แถว
3. race: สอง `takeoverConversation` พร้อมกัน (staff A กับ owner) → คนเดียวสำเร็จโดยไม่ force อีกคน `VERSION_CONFLICT` details.holder มีชื่อผู้ถือ · ใช้ `force` → ได้
4. `release`/`close` ทำสำเร็จแม้ผู้ถือเป็นคนอื่น (ไม่ 409)
5. `requestHumanHandoff`: handler → human assignee null; เรียกซ้ำ → ไม่เพิ่ม version ไม่แจ้งซ้ำ (`notify` fake เรียก 1 ครั้ง) · แชตปิด → `POLICY_BLOCKED` · ร้านอื่น → `NOT_FOUND` · เปิด auto_assign → ได้ผู้ถือที่ `available` และ `last_assigned_at` อัปเดต
6. auto-assign round-robin: staff 2 คนว่าง, 4 แชตเข้าคิว → สลับกันคนละ 2 · คน `away`/`off_shift` ไม่ถูกเลือก · ไม่มีคนว่าง → ยังเป็น QUEUE
7. schedule (clock fixture): 10:00 เสาร์ (ตาราง 10–20 พัก 12–13) → available · 12:30 → away · 20:00 → off_shift (ขอบเลิกงานไม่นับ) · 09:59 → off_shift · วันที่ไม่มีตาราง → off_shift · `nextChange` ที่ 10:00 = 12:00 away · เลือกสถานะเองขณะมีตาราง → paused และใช้ manual · `resume` → กลับใช้ตาราง
8. `validateSchedule`: start≥end, พักนอกเวลา/ทับกัน, >6 พัก, ว่างทั้งสัปดาห์, key วัน 8 → ผิดตามรหัส
9. idle: ร้าน policy alert, แชต HELD รอ 31 นาที → `notify` 1 ครั้ง + event `alerted` · สแกนซ้ำ → ไม่แจ้งซ้ำ · ลูกค้าส่งข้อความใหม่หลัง staff ตอบแล้วรอรอบใหม่ → event ใหม่ได้ · policy reassign ไม่มีคนว่าง → ผู้ถือเดิมคงอยู่ + notify owners · policy off → ไม่ทำอะไร
10. auto-close: AI 25 ชม. → ปิด · AI 23 ชม. → ไม่ปิด · QUEUE 49 ชม. → ปิด · HELD 169 ชม. → ปิด · `auto_close=false` → ไม่ปิดเลย
11. notes: สร้าง/แก้/ลบ (soft) · kind handover แก้/ลบ → `POLICY_BLOCKED` · ผู้ไม่ใช่เจ้าของโน้ต (staff อื่น) แก้ → `PERMISSION_DENIED` แต่ owner แก้ได้ · mention คนนอกร้าน/ไม่มี chat.read ถูกตัด · mention → `notify` ถูกเรียกด้วย `chat.mention` · pinned ระดับลูกค้าปรากฏในอีก conversation ของลูกค้าเดียวกัน · **โน้ตไม่สร้างแถวใน `messages` และ `sendToCustomer` ไม่ถูกเรียก** (spy)

Route (supertest):
12. takeover: staff A (มี `chat.takeover`) → 200 · ไม่มี `chat.takeover` → 403 แม้ UI ซ่อน · tenant B conversation → 404 ทุก route · release/close โดยผู้ไม่มีสิทธิ์ → 403
13. staff ส่งข้อความ (F09 `sendStaffMessage`) ในแชต AI → ถูก takeover อัตโนมัติ; ไม่มี `chat.reply` → 403 (ทดสอบคู่กับ F09)
14. gate ขั้น 5 (integration): inbound → `drainJobs()` → มีข้อความ ai → `POST takeover` → inbound ถัดไป → `drainJobs()` → **ไม่มีข้อความ ai ใหม่** (job ข้ามด้วย takeover) → `POST release` → inbound ถัดไป → มีข้อความ ai
15. `PUT team/:userId/schedule` ไม่มี `chat.schedule` → 403 · ตัวเอง `PUT me/availability` ได้ · settings PUT ไม่มี `chat.schedule` → 403 · `idleMinutes` 4 → 400
16. stale: client ถือ version เก่าเรียก `assign` → 409 พร้อม `currentVersion`

Playwright smoke `web/src/features/team/e2e/team.smoke.spec.ts` (กับ production, ใช้ conversation ใหม่ผ่าน Demo Chat visitor ใหม่ + marker):
- `takeover silences the bot and release brings it back`: ลูกค้า (หน้า `/demo-chat/s/demo-boardgame`) ถามราคา → AI ตอบ · `ownerPage` เปิดแชตนั้นใน `/chat` → กด `[data-testid=team-takeover]` → chip เป็น `data-handler=human` · ลูกค้าถามอีกข้อ → รอ 12 วินาทีไม่มีข้อความ ai ใหม่ (`[data-testid=demo-chat-message][data-author=ai]` นับเท่าเดิม) · owner พิมพ์ตอบ → ลูกค้าเห็นข้อความ `data-author=staff` · กด `team-release` → ลูกค้าถามอีกข้อ → ได้คำตอบ AI
- `note is never visible to the customer`: owner เพิ่มโน้ต `<marker>` → โน้ตขึ้นในแท็บโน้ต · หน้าลูกค้าไม่มีข้อความที่มี marker
- `team page shows schedule`: `/team` เห็นแถว Staff A สถานะ ว่าง/พัก/นอกเวลา และตารางงาน
- `tenant isolation`: `api` (owner A) `POST /api/v1/conversations/<id ของ B>/takeover` → 404
- ทำความสะอาด: จบด้วยคืน AI · ไม่แตะการตั้งค่าร้านถาวร

## 11. Acceptance: R ตาม D6

- [ ] takeover → `isHumanTakeover()` true → `ai.reply` ข้ามด้วย `takeover` · คืน AI แล้วข้อความถัดไปได้คำตอบ (gate ขั้น 5) บน production
- [ ] ปุ่มรับช่วง/คืน AI/ส่งกลับคิว/ปิด/เปิด/มอบหมาย ใช้งานจริงจาก UI (ไม่มีปุ่มตาย)
- [ ] staff ส่งได้เฉพาะเมื่อมี `chat.reply` (403 แม้ UI ซ่อน) · โน้ตไม่เคยเรียก `sendToCustomer` และไม่เข้า `messages`
- [ ] assignment ที่ stale ได้ 409 พร้อมชื่อผู้ถือ · ปิด/คืน AI แชตที่คนอื่นถืออยู่ได้เสมอ
- [ ] schedule ด้วย clock fixture: ในเวลางาน = ว่าง, ช่วงพัก = พัก, นอกเวลา = นอกเวลา (Asia/Bangkok)
- [ ] `requestHumanHandoff` ใช้ได้จริงกับ F10 (idempotent, แจ้งเตือน, ขึ้นคิว)
- [ ] tenant: ทุก route ของร้านอื่น = 404 · i18n ไทย · loading/empty/error · Playwright smoke ผ่านบน production
- ลดเป็น **S** (ส่วนนั้น) ถ้า idle scan หรือ auto-assign ไม่ครบ: จดแยกส่วนใน EVIDENCE.md (เช่น "takeover=R, schedule=R, idle=S") · ส่วน takeover ต้องเป็น R เสมอ (อยู่บน gate)

## 12. Security และ privacy

- ทุก SQL กรอง `business_id` · route ที่มี `:conversationId` เรียก `requireBusiness` ก่อน · ผู้ใช้ร้านอื่น = 404
- สิทธิ์: takeover/release/queue/close/reopen = `chat.takeover` · ตอบ/โน้ต/ขอความช่วย = `chat.reply` · จัดทีม ตาราง นโยบาย โอนให้คนอื่น = `chat.schedule` · ดูภาพรวมทีม = `chat.read` · API เป็นผู้ตัดสิน (UI ซ่อนปุ่มเพื่อความสะดวก) · สิทธิ์ถูกอ่านใหม่ทุก request โดย core (revoke มีผลทันที)
- โน้ต: ข้อมูลภายใน ห้ามไปถึงลูกค้าในทางใด (ไม่ถูก join เข้าผลของ Demo Chat/F09 public) · ห้าม log เนื้อหาโน้ต · audit ไม่เก็บเนื้อหา
- `assignee` ต้องเป็นสมาชิก active ของ**ร้านเดียวกัน**เท่านั้น (กัน assign ข้ามร้าน)
- `notify` link เป็น path ภายใน `/chat?c=<uuid>` เท่านั้น
- ข้อมูลส่วนบุคคลของพนักงาน (อีเมล) แสดงเฉพาะในหน้า `/team` ให้ผู้มี `chat.read` ของร้านเดียวกัน

## 13. Edge cases

| กรณี | ผลที่ต้องได้ |
|---|---|
| สองคนกดรับช่วงพร้อมกัน | คนแรกสำเร็จ คนที่สอง 409 `conversation_taken` + ชื่อผู้ถือ แล้ว UI ถามรับช่วงต่อ |
| ผู้ถือถูก revoke/disabled | แสดงเป็นคิว (ไม่มีผู้ดูแล) รับช่วงได้โดยไม่ติด 409 · sweep ย้ายกลับคิว |
| AI ขอคน (`requestHumanHandoff`) ขณะ staff ถืออยู่แล้ว | no-op idempotent ไม่แจ้งซ้ำ |
| ลูกค้าส่งข้อความระหว่าง takeover | บันทึกตามปกติ ไม่มีคำตอบ AI · ขึ้น "รอตอบ" ในรายการ (F09) |
| คืนให้ AI ตอนมีข้อความลูกค้าที่ยังไม่ได้ตอบค้างอยู่ | ไม่ตอบย้อนหลังอัตโนมัติ (ตอบเมื่อมีข้อความใหม่) — จดใน UI ว่า "AI จะตอบเมื่อลูกค้าส่งข้อความถัดไป" |
| takeover แชตที่ปิดแล้ว | `POLICY_BLOCKED` ข้อความ "แชตนี้ปิดแล้ว" |
| `reopen` เมื่อลูกค้ามีแชตเปิดอยู่แล้ว | `POLICY_BLOCKED` (unique index ของ core กันอยู่) |
| auto-assign เลือกคนที่เพิ่ง `off_shift` ตอนเลย 1 วินาที | ใช้เวลาของ server ตอนเลือก (คำนวณทันที) ไม่ cache |
| ตารางที่ปักไว้แต่ผู้ใช้เลือกสถานะเอง | หยุดตาราง (`schedule_paused`) จนกด "ใช้ตารางต่อ" หรือบันทึกตารางใหม่ |
| idle scan พร้อมกันสองรอบ | `team_idle_events` unique กันซ้ำ |
| เจ้าของคนเดียว ไม่มีพนักงาน เปิด auto-assign | ไม่มีผู้มีสิทธิ์ → คิวและแจ้งเจ้าของ |
| mention คนที่ไม่มี `chat.read` | ตัดชื่อทิ้งเงียบ ๆ ไม่แจ้งเตือน |
| ลบโน้ตที่มี mention แล้ว | แจ้งเตือนเดิมยังอยู่ (ไม่ลบย้อนหลัง) |
| ผู้ใช้กด `release` สองครั้ง | ครั้งที่สอง no-op ไม่เพิ่ม version |

### ถ้าช้า (ตัดตามลำดับนี้)
1. ตัด auto-close (§5.8) · 2. ตัด idle `reassign` (เหลือ `alert`) · 3. ตัด dialog แก้ตารางแบบกราฟิก (ใช้ฟอร์ม 7 แถวธรรมดา) · 4. ตัด auto-assign · 5. ตัด mention
**ห้ามตัด**: takeover/release + `isHumanTakeover`, 409 stale, ไม่เคยส่งโน้ตถึงลูกค้า, `requestHumanHandoff`

## 14. Build order (slices)

Tier ต่อ slice (PLAN.md 21 พ.ย.): S1 = P0 (gate 13:00) · **S2–S3 = P1 และทำก่อนงาน P1/P2 อื่นของ lane** เมื่อ `LEAD: OPEN P1` (สิ่งที่ต้องได้: พนักงานตั้ง ว่าง/พัก/นอกเวลา, auto-assign เลือกเฉพาะคนที่ว่างและมีสิทธิ์, ไม่มีคนว่างให้แชตอยู่ในคิว `รอพนักงานรับ`) · S4 ตามเวลาที่เหลือ

| slice | เวลา | เนื้อหา | merge เมื่อ |
|---|---|---|---|
| **S1 · takeover (gate ขั้น 5)** | ≤ 20 นาที | `service.ts`: `isHumanTakeover`, `assignConversation` (version, 409, audit, publish) · `requestHumanHandoff` · routes `GET team`, `takeover`, `release` · ปุ่มใน `ConversationPanel` + `team.quick` · โน้ต audit handover (เขียนอย่างเดียว) · migration `001_team.sql` ทั้งไฟล์ · test 1–5, 12 (เฉพาะ takeover/release), 14 | **เป้า 12:15** · แล้วโพสต์ `DONE F11 … TO:B2 TO:C2` (B2 เรียก `requestHumanHandoff`) |
| **S2 · คิว ปิด โน้ต** | ≤ 20 นาที | `queue`, `assign`, `close`, `reopen`, `ask-help` · โน้ต (CRUD, pinned ลูกค้า, mention + notify) · แท็บโน้ต · test 4, 11, 12 ที่เหลือ, 16 | หลัง gate |
| **S3 · ทีมและตารางงาน** | ≤ 25 นาที | availability/schedule (`scheduleStateAt`, `validateSchedule`, `nextChange`) · `team_availability` routes · หน้า `/team` + dialog ตาราง + นโยบาย · auto-assign · `getTeamAvailability` · seed `run` · test 6–8, 15 | ก่อน 14:30 |
| **S4 · idle, auto-close, smoke** | ≤ 25 นาที | schedules `team.idle-scan`, `team.auto-close` · sweep ผู้ถือไม่ active · `runDemo`/`resetDemo` · Playwright smoke + รันกับ production · EVIDENCE.md · test 9, 10 | ก่อน 15:30 |

## 15. UNCONFIRMED และสิ่งที่ต้องตรวจในวันงาน

1. **รูป `requestHumanHandoff` ที่ B2 คาดหวัง**: F10 เขียน `reason` เป็น union และ `actor: 'ai'` ส่วน contract ฉบับนี้กว้างกว่า (`reason: string`, actor `ai|customer|staff`) ซึ่งรับค่าของ B2 ได้ทุกค่า · ตรวจ: หลังหัวหน้าวาง contract ให้ B2 ตรวจ typecheck; ตั้งแต่ DONE ของ F11 B2 ต้องเลิกใช้ทางสำรอง `ai_handoff_waits`
2. **รูป `schedules` ของ core** (`handler` รับ `{ slot }`, advisory lock) · ตรวจ: อ่าน F35 spec/โค้ด core ตอน S4; ถ้า schedule ยังไม่ทำงานบน production ให้ idle scan ใช้ job ที่ enqueue ตัวเองด้วย `runAt`
3. **สิทธิ์ที่เจ้าของโอน/assign ให้คนอื่น**: ใช้ `chat.schedule` (staff ค่าเริ่มต้นไม่มี) · ตรวจกับ A: เจ้าของพอไหมสำหรับเดโม
4. **`notify()` type ที่มีอยู่**: ใช้ `chat.handoff` กับ `chat.mention` ตาม `NotifyInput` ใน contracts · ตรวจ: F31 รองรับ `to: { permission }` จริงเมื่อ merge (fake log เฉย ๆ)
5. **ชื่อตัวแปร clock ใน test** (`CLOCK_FIXTURE`): เสาร์ 10:00 Bangkok · ตรวจ: คำนวณวัน ISO ของ 2026-11-21 ด้วยโค้ดใน test ไม่ hard-code
6. **`conversation.updated` ของ realtime**: payload ไม่มีชื่อผู้ถือ → UI refetch `GET /conversations/:id/team` เมื่อได้ event · ตรวจ: ผลใน S1
