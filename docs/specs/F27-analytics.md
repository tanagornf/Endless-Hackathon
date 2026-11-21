# F27 analytics — dashboard, ผลลัพธ์ของร้าน (seller impact), ต้นทุน AI, latency, trace, export

| | |
|---|---|
| Lane / คน | **B3** / **B** · ลำดับ 3 ใน lane (F06 → F26 → F27) |
| Tier / เป้า | **P2** · เป้า **R** (KPI เฉพาะตัวที่มี SQL test = R · tile ที่ต้นทางยังเป็น fake = แสดง "ยังไม่มีข้อมูล" ไม่นับว่าผ่าน) |
| Timebox | 60–165 นาที |
| เริ่มเมื่อ | หัวหน้าโพสต์ `LEAD: OPEN P2` · ตัวเลขผลลัพธ์ของร้านต้องนิ่งก่อน **16:15** (เวลาที่ทีมคัดลอกเลขไปพิตช์) |
| พึ่ง | core: ตารางกลาง `messages`, `conversations`, `customers`, `model_usage`, `audit_events`, `businesses` (อ่านอย่างเดียว) · A2 F13 `getOrderMetrics` · B2 F10 `getAiTurnMetrics`, `getTurnTrace`, `listTurns` · B2 F38 `getFollowUpMetrics` · A1 F11 `getTeamAvailability` (ไม่บังคับ) · B3 F26 `getInsightTotals` (ภายใน lane) |
| ให้ | หน้า `/dashboard`, `/usage`, `/traces` · slot รับ `dashboardCards` (host: ฟีเจอร์นี้) · export CSV/JSON · **ไม่มี contract ข้าม lane** |
| ใช้ | ดู §4 |
| โฟลเดอร์ | `server/src/features/analytics/` · `shared/features/analytics/types.ts` · `web/src/features/analytics/` |
| Web path | `/dashboard` (เมนูกลุ่ม `home`) · `/usage`, `/traces` (กลุ่ม `insights`) |

อ่าน: `contracts.ts` (`MetricsRange`, `AiTurnMetrics`, `FollowUpMetrics`, `getTeamAvailability`, slot `dashboardCards`, `useSlot`, `useCan`, PERMISSIONS) · F13 spec §4 (`OrderMetrics`, `getOrderMetrics`) · F10 spec §3–§4 (`AiTurnTrace`, `AiTurnSummary`, `ListTurnsQuery`) · [COOKBOOK](../COOKBOOK.md) §6, §8

## 1. เป้าหมายและ user stories

ทำไมมี (D8 "F27+"): กรรมการและร้านค้าต้องเห็นว่า AI ทำให้ร้าน "ได้อะไร" ไม่ใช่แค่ "ทำอะไรได้" ฟีเจอร์นี้ตอบด้วยตัวเลขที่ตรวจซ้ำได้ด้วย SQL จากแถวที่ถูกบันทึกจริง (ไม่นับจาก state ฝั่งเว็บ) ในส่วน **"ผลลัพธ์ของร้าน"** ที่ทีมคัดลอกเลขไปใส่พิตช์ตอน 16:15 และมีหน้าต้นทุน AI กับ trace สำหรับเจ้าของที่อยากตรวจ ทุกตัวเลขที่เป็นประมาณการต้องติดป้าย "ประมาณการ" และเลขที่ไม่รู้ต้องเป็น "ไม่ทราบ" ไม่ใช่ 0

ผู้ใช้: เจ้าของร้าน (ทุกหน้า) · พนักงานที่เจ้าของให้ `insights.read` (เห็น dashboard และผลลัพธ์ของร้าน) · ผู้มี `business.bot_settings` (เห็นต้นทุนรายละเอียด trace export)

User stories:
1. เจ้าของเปิด `/dashboard` เห็นภาพรวมช่วง 7 วัน: จำนวนแชต/ลูกค้าใหม่/ข้อความ, กราฟรายวัน, ช่วงเวลาที่ลูกค้าทัก, ช่องทาง, คิวที่รอพนักงาน และ latency ของ AI
2. เจ้าของเห็นส่วน "ผลลัพธ์ของร้าน": AI ดูแลแชตจบเอง กี่ %, ตอบครั้งแรกเร็วแค่ไหน (AI เทียบพนักงาน), ส่งต่อพนักงานกี่ %, ออเดอร์ที่มาจากแชต, ลูกค้าที่ทักตามแล้วกลับมา, ต้นทุน AI ต่อแชตที่จบเอง และเวลาที่ประหยัดโดยประมาณ พร้อมปุ่ม "คัดลอกสรุปสำหรับพิตช์"
3. ฟีเจอร์ที่ยังไม่พร้อม (เช่น ออเดอร์ยังเป็น fake) แสดง tile "ยังไม่มีข้อมูล" ไม่แสดงเลขปลอม
4. เจ้าของเปิด `/usage` เห็นต้นทุน AI ประมาณการตามฟีเจอร์/จุดประสงค์/โมเดล, tokens (รวม cached และ reasoning), จำนวนครั้งที่ไม่ทราบราคา, และแยกว่าอะไรเป็นการทดสอบ
5. ผู้มีสิทธิ์เปิด `/traces` ดูว่า AI แต่ละ turn ใช้เครื่องมืออะไร ใช้หลักฐานใด ช้าแค่ไหน (ไม่เห็นข้อความดิบ) และทุกการเปิดดู trace ถูกบันทึก
6. เจ้าของส่งออกตัวเลขเป็น CSV/JSON (เฉพาะตัวเลขและ id ไม่มีข้อความลูกค้า ไม่มี prompt ไม่มี secret)

นอกขอบเขต: dashboard ระดับ platform/ผู้ดูแลระบบ · quota/plan/billing/invoice (ไม่มีในแอป: ทุกอย่างใช้ได้ไม่จำกัด) · การแปลง USD→THB (ไม่มีอัตราแลกเปลี่ยนในระบบ: แสดง USD ตามที่ core ประมาณ) · การคาดการณ์/ML · alert ตามเกณฑ์ · เปรียบเทียบข้ามร้าน · export traces ที่มีข้อความ

## 2. Data model

`server/src/features/analytics/migrations/001_analytics.sql`:

```sql
-- dependsOn: core
CREATE TABLE analytics_settings (
  business_id uuid PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  minutes_per_conversation int NOT NULL DEFAULT 3 CHECK (minutes_per_conversation BETWEEN 1 AND 60),   -- สมมติฐานสำหรับ "เวลาที่ประหยัด" (ประมาณการ)
  version int NOT NULL DEFAULT 1,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

กฎ: นี่คือตารางเดียวของฟีเจอร์ · ตัวเลขทั้งหมดคำนวณตอนอ่านจากตารางกลางของ core (`messages`, `conversations`, `customers`, `model_usage`, `audit_events`, `businesses`) แบบ **อ่านอย่างเดียว** ด้วย SQL ใน §5 · ตัวเลขของฟีเจอร์เจ้าของอื่น (ออเดอร์, AI turns, follow-ups) **ห้าม query ตารางของเขาตรง ๆ** ใช้ contract `get…Metrics` เท่านั้น (การตรวจว่า "ต้นทางมีของจริงหรือยัง" ใช้ `to_regclass('<table>')` อย่างเดียว ไม่อ่านแถว: §5.7) · ไม่มี cache ในตาราง (cache ในหน่วยความจำ 15 วินาทีต่อ `(business, from, to)` เพื่อกันกดรัว ไม่ใช่แหล่งความจริง)

## 3. API endpoints

ทุก path ใต้ `/api/v1` · `defineFeatureRoutes({ featureId: 'F27', slug: 'analytics' })` · `auth: 'business'`

| Method | Path | permission | Request | Response | Errors |
|---|---|---|---|---|---|
| GET | `/businesses/:businessId/analytics/dashboard` | `insights.read` | `RangeQuery` | `DashboardData` | VALIDATION_ERROR |
| GET | `/businesses/:businessId/analytics/impact` | `insights.read` | `RangeQuery` | `SellerImpact` | VALIDATION_ERROR |
| GET | `/businesses/:businessId/analytics/usage` | `business.bot_settings` | `UsageQuery` | `UsageReport` | VALIDATION_ERROR |
| GET | `/businesses/:businessId/analytics/traces` | `business.bot_settings` | `TraceListQuery` | `Page<AiTurnSummary>` (จาก F10) | VALIDATION_ERROR |
| GET | `/businesses/:businessId/analytics/traces/:turnId` | `business.bot_settings` | — | `RedactedTrace` | NOT_FOUND |
| GET | `/businesses/:businessId/analytics/settings` | `insights.read` | — | `AnalyticsSettings` | — |
| PUT | `/businesses/:businessId/analytics/settings` | `business.bot_settings` | `UpdateSettingsBody` | `AnalyticsSettings` | VALIDATION_ERROR, VERSION_CONFLICT |
| GET | `/businesses/:businessId/analytics/export` | `business.bot_settings` | `ExportQuery` | ไฟล์ CSV/JSON (`HttpResponse` kind `file`) | VALIDATION_ERROR, RATE_LIMITED |

```ts
import { z } from 'zod';
const YMD = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const RangeQuery = z.object({ from: YMD.optional(), to: YMD.optional() });       // วันเต็มตามเวลาร้าน รวมวันปลายทาง · ไม่ส่ง = 7 วันล่าสุดรวมวันนี้ · เกิน 93 วัน หรือ from > to = VALIDATION_ERROR
export const UsageQuery = RangeQuery.extend({ includeFake: z.coerce.boolean().default(false) });
export const TraceListQuery = z.object({
  cursor: z.string().max(200).optional(), limit: z.coerce.number().int().min(1).max(100).default(30),
  state: z.enum(['running','completed','awaiting_confirmation','handoff','failed','skipped','superseded']).optional(),
  intent: z.string().max(40).optional(), conversationId: z.string().uuid().optional(),
});
export const UpdateSettingsBody = z.object({ expectedVersion: z.number().int().min(1), minutesPerConversation: z.number().int().min(1).max(60) }).strict();
export const ExportQuery = RangeQuery.extend({
  dataset: z.enum(['kpi', 'daily', 'usage', 'traces']),
  format: z.enum(['csv', 'json']).default('csv'),
});
```

```ts
// shared/features/analytics/types.ts
export type Tile<T> = { available: true; value: T } | { available: false; reason: 'not_built' | 'error' };
export interface RangeInfo { from: string; to: string; timezone: string; fromUtc: string; toUtc: string }   // from/to = YYYY-MM-DD ตามเวลาร้าน; fromUtc/toUtc ครึ่งเปิด

export interface DashboardData {
  range: RangeInfo; computedAt: string;
  conversations: { active: number; customersActive: number; newCustomers: number };
  messages: { customer: number; ai: number; staff: number };
  now: { openConversations: number; waitingForStaff: number; staffAvailable: Tile<number> };
  daily: { date: string; conversations: number; customerMessages: number; aiReplies: number; staffMessages: number }[];   // เติมวันว่างเป็น 0
  hourly: { hour: number; customerMessages: number }[];                                                                  // 0..23 ตามเวลาร้าน (ครบ 24 ค่า)
  channels: { channel: string; conversations: number }[];
  ai: Tile<{ turns: number; completed: number; awaitingConfirmation: number; handoff: number; failed: number; skipped: number; medianTurnLatencyMs: number | null }>;
  modelLatency: { purpose: string; calls: number; p50Ms: number | null; p95Ms: number | null }[];                        // จาก model_usage (core) เฉพาะ mode 'openai' ไม่ error
  insights: Tile<{ analysed: number; negative: number; followUpOpen: number }>;
}

export interface SellerImpact {
  range: RangeInfo; computedAt: string;
  activeConversations: number;
  autoResolved: { count: number; pct: number | null };                       // pct = count / active (null เมื่อ active = 0)
  handoff: { count: number; ratePct: number | null };
  staffTouched: number;
  firstResponse: { ai: { n: number; medianSeconds: number | null }; staff: { n: number; medianSeconds: number | null }; all: { n: number; medianSeconds: number | null }; unanswered: number };
  orders: Tile<{ created: number; fromChat: number; paid: number; revenueMinor: number }>;
  followUps: Tile<{ scheduled: number; sent: number; cancelled: number; recovered: number; recoveryPct: number | null }>;
  aiCost: { basis: 'openai' | 'none'; calls: number; knownUsdMicros: number | null; unknownRows: number; perAutoResolvedUsdMicros: number | null; isEstimate: true };
  staffMinutesSaved: { minutes: number | null; minutesPerConversation: number; isEstimate: true };
  pitchText: string;                                                          // ข้อความไทยสรุปสำหรับคัดลอก (§5.6)
}

export interface UsageRow { featureId: string; featureLabel: string; purpose: string; kind: string; model: string; mode: 'openai' | 'fake';
  calls: number; inputTokens: number | null; outputTokens: number | null; cachedInputTokens: number | null; cacheWriteTokens: number | null;
  reasoningTokens: number | null; audioInputTokens: number | null; audioOutputTokens: number | null; audioSeconds: number | null;
  knownUsdMicros: number | null; unknownCostRows: number; isClientReported: boolean }
export interface UsageReport {
  range: RangeInfo; includeFake: boolean;
  totals: { calls: number; inputTokens: number | null; outputTokens: number | null; cachedInputTokens: number | null; reasoningTokens: number | null;
            knownUsdMicros: number | null; unknownCostRows: number; failedCalls: number };
  byFeature: { featureId: string; featureLabel: string; calls: number; knownUsdMicros: number | null; unknownCostRows: number }[];
  rows: UsageRow[];
  unpricedModels: string[];                                                    // model ที่มีแถว cost = null / cost_reason 'no_rate'
  daily: { date: string; calls: number; knownUsdMicros: number | null }[];
}
export interface RedactedTrace { turnId: string; conversationId: string; state: string; intent: string | null; startedAt: string; finishedAt: string | null;
  latencyMs: number | null; tools: { name: string; ok: boolean; ms: number; error?: string }[]; evidenceIds: string[]; guardActions: { guard: string; action: string; detail: string }[];
  usage: { calls: number; inputTokens: number | null; outputTokens: number | null; cachedTokens: number | null; costUsdMicros: number | null } | null;
  timings: Record<string, number | number[]>; errorCode: string | null; attempts: number; retryUsed: boolean; handoffOffered: boolean; escalated: boolean }
export interface AnalyticsSettings { businessId: string; minutesPerConversation: number; version: number }
```

หมายเหตุ: `featureLabel` เป็นชื่อฟีเจอร์ไทยจากตาราง `FEATURE_LABELS` ใน `config.ts` (F10 → "AI ตอบลูกค้า", F26 → "สรุปแชต", F06 → "นำเข้าข้อมูล", F37 → "ทดสอบคุณภาพ AI", F38 → "ทักตามลูกค้า", F30 → "เสียง", F05/F07 → "ความรู้", F09 → "แชต", F14 → "ตรวจสลิป", อื่น ๆ → ใช้ `featureId`) · `RedactedTrace` ไม่มี field `inboundMessageId`, `replyMessageId`, `productRefs`, `reply_parts` (ไม่ส่งออกทาง API นี้)

## 4. Service functions และ contracts

ไฟล์ภายใน: `service.ts` (public) · `config.ts` · `range.ts` · `kpi.ts` · `impact.ts` · `usage.ts` · `latency.ts` · `probe.ts` · `trace.ts` · `redact.ts` · `export.ts` · `pitch.ts` · `routes.ts` · `*.test.ts`

Contract ที่ใช้ (signature ตาม `contracts.ts` / spec เจ้าของ ทุกตัวอักษร) — `MetricsRange = { from; to }` UTC ISO ครึ่งเปิด:

| ต้นทาง | ฟังก์ชัน | ใช้ทำอะไร | fake (ก่อนเจ้าของ merge) |
|---|---|---|---|
| A2 F13 | `getOrderMetrics(businessId, range): Promise<{ ordersCreated; ordersFromChat; ordersPaid; revenueMinor }>` | tile ออเดอร์ | ศูนย์ทั้งหมด → tile "ยังไม่มีข้อมูล" (probe §5.7) |
| B2 F10 | `getAiTurnMetrics(businessId, range): Promise<AiTurnMetrics>` | การ์ด AI + latency ของ turn | ศูนย์, `medianLatencyMs` null |
| B2 F10 | `getTurnTrace(businessId, turnId): Promise<AiTurnTrace \| null>` · `listTurns(businessId, ListTurnsQuery): Promise<Page<AiTurnSummary>>` (export ของ `ai-agent/service.ts` ไม่ใช่ contract) | หน้า `/traces` + export traces | `null` / หน้าว่าง → หน้า "ยังไม่มีข้อมูล" |
| B2 F38 | `getFollowUpMetrics(businessId, range): Promise<FollowUpMetrics>` | tile ทักตามลูกค้า | ศูนย์ → "ยังไม่มีข้อมูล" |
| A1 F11 | `getTeamAvailability(businessId, at?)` (ไม่บังคับ) | จำนวนพนักงานพร้อมรับแชตตอนนี้ | `[]` → "ยังไม่มีข้อมูล" |
| B3 F26 | `getInsightTotals(businessId, range)` (ภายใน lane) | การ์ดสรุปแชต | ไม่มี fake: ถ้ายังไม่ merge tile "ยังไม่มีข้อมูล" |
| core | `db` (อ่าน), `audit`, `rateLimit`/`assertRateLimit` | SQL, บันทึกการเปิด trace, จำกัด export | — |

ฟังก์ชันใน `service.ts` (public ของฟีเจอร์):
`getDashboard(businessId, range)` · `getSellerImpact(businessId, range)` · `getUsageReport(businessId, range, opts)` · `listTraces(businessId, query)` · `openTrace(businessId, turnId, actorUserId)` (เขียน audit) · `getSettings` · `updateSettings` · `buildExport(businessId, query)`

### Contract additions

ไม่มี (F27 เป็นผู้ใช้ปลายทาง ไม่ให้ฟังก์ชันที่ lane อื่นเรียก) · slot `dashboardCards` ที่ F27 เป็น host มีอยู่ใน `contracts.ts` แล้ว (`useSlot('dashboardCards')`) · **ข้อกำหนดกับ lane อื่น:** `getOrderMetrics` ต้องอยู่ใน `contracts.ts` ตาม spec F13 (หัวหน้า merge) ก่อน F27 slice S2 · ถ้า contract ที่ใช้ยังไม่เข้า `contracts.ts` ให้ใช้ `declare` ชั่วคราวในไฟล์ภายใน `upstream.ts` ของ F27 (ห้ามคัดลอกฟังก์ชันของเขามาคำนวณเอง)

พฤติกรรมสำคัญ: ทุกฟังก์ชันรับ `businessId` กรองทุก query · ลูกค้าที่ `customers.external_id` ขึ้นต้น `eval-` (F37) หรือ `live-sim:` (ตัวจำลองคอมเมนต์ไลฟ์ของ F22) ถูกตัดออกจาก **ทุก KPI และทุกเซตของ impact** · ทุก timestamp ที่ส่ง contract ของเจ้าของอื่นเป็น UTC ISO ครึ่งเปิด `[fromUtc, toUtc)`

## 5. Algorithms

### 5.1 ช่วงวัน (`range.ts`)

รับ `from`/`to` เป็น `YYYY-MM-DD` ตามเวลาร้าน (`businesses.timezone`, ค่าเริ่มต้น `Asia/Bangkok`) รวมทั้งสองวัน · `fromUtc` = 00:00 ของ `from` ในเวลาร้าน และ `toUtc` = 00:00 ของ (`to`+1) ในเวลาร้าน คำนวณใน DB: `SELECT ($1::date)::timestamp AT TIME ZONE $tz AS from_utc, (($2::date + 1))::timestamp AT TIME ZONE $tz AS to_utc` · ไม่ส่ง `to` = วันนี้ตามเวลาร้าน (`(now() AT TIME ZONE $tz)::date`) · ไม่ส่ง `from` = `to − 6 วัน` · `from > to` หรือ > 93 วัน = `VALIDATION_ERROR` · ตัวอย่างที่ test ต้องได้ (`Asia/Bangkok`, UTC+7): `from=to=2026-11-21` → `[2026-11-20T17:00:00Z, 2026-11-21T17:00:00Z)` · ข้อความ `2026-11-21T16:59:00Z` ตกวันที่ 21 · `2026-11-21T17:00:00Z` ตกวันที่ 22 (`CLOCK_FIXTURE` ใช้ขอบ 17:00Z นี้) · `Asia/Tokyo` (UTC+9): `[2026-11-20T15:00:00Z, 2026-11-21T15:00:00Z)`

ตัวกรองร่วมของทุก SQL (เรียก `$biz,$from,$to,$tz`): `cu.external_id NOT LIKE 'eval-%' AND cu.external_id NOT LIKE 'live-sim:%'` กับ `JOIN conversations c ON c.id = m.conversation_id JOIN customers cu ON cu.id = c.customer_id`

### 5.2 KPI ภาพรวม (`kpi.ts`)

```sql
-- K1 แชตที่ "มีลูกค้าทักในช่วง" และจำนวนลูกค้า
SELECT count(DISTINCT m.conversation_id) AS conversations, count(DISTINCT c.customer_id) AS customers
FROM messages m JOIN conversations c ON c.id = m.conversation_id JOIN customers cu ON cu.id = c.customer_id
WHERE m.business_id = $1 AND m.direction = 'inbound' AND m.author = 'customer'
  AND m.created_at >= $2 AND m.created_at < $3 AND cu.external_id NOT LIKE 'eval-%' AND cu.external_id NOT LIKE 'live-sim:%';

-- K2 ข้อความตามผู้ส่ง (AI นับเฉพาะคำตอบจริง ไม่นับ nudge/broadcast/comment)
SELECT count(*) FILTER (WHERE m.author = 'customer' AND m.direction = 'inbound') AS customer,
       count(*) FILTER (WHERE m.author = 'ai' AND m.direction = 'outbound' AND m.origin IN ('live','demo')) AS ai,
       count(*) FILTER (WHERE m.author = 'staff' AND m.direction = 'outbound' AND m.origin <> 'broadcast') AS staff
FROM messages m JOIN conversations c ON c.id = m.conversation_id JOIN customers cu ON cu.id = c.customer_id
WHERE m.business_id = $1 AND m.created_at >= $2 AND m.created_at < $3 AND cu.external_id NOT LIKE 'eval-%' AND cu.external_id NOT LIKE 'live-sim:%';

-- K3 ลูกค้าใหม่
SELECT count(*) FROM customers WHERE business_id = $1 AND first_seen_at >= $2 AND first_seen_at < $3 AND external_id NOT LIKE 'eval-%' AND external_id NOT LIKE 'live-sim:%';

-- K4 ตอนนี้ (ไม่ผูกช่วงวัน)
SELECT count(*) FILTER (WHERE c.status = 'open') AS open_now,
       count(*) FILTER (WHERE c.status = 'open' AND c.handler = 'human' AND c.assignee_user_id IS NULL) AS waiting_for_staff
FROM conversations c JOIN customers cu ON cu.id = c.customer_id
WHERE c.business_id = $1 AND cu.external_id NOT LIKE 'eval-%' AND cu.external_id NOT LIKE 'live-sim:%';

-- K5 รายวัน (วันตามเวลาร้าน) · เติมวันที่ว่างเป็น 0 ในโค้ด
SELECT (m.created_at AT TIME ZONE $4)::date AS day,
       count(DISTINCT m.conversation_id) FILTER (WHERE m.author = 'customer' AND m.direction = 'inbound') AS conversations,
       count(*) FILTER (WHERE m.author = 'customer' AND m.direction = 'inbound') AS customer_messages,
       count(*) FILTER (WHERE m.author = 'ai' AND m.direction = 'outbound' AND m.origin IN ('live','demo')) AS ai_replies,
       count(*) FILTER (WHERE m.author = 'staff' AND m.direction = 'outbound' AND m.origin <> 'broadcast') AS staff_messages
FROM messages m JOIN conversations c ON c.id = m.conversation_id JOIN customers cu ON cu.id = c.customer_id
WHERE m.business_id = $1 AND m.created_at >= $2 AND m.created_at < $3 AND cu.external_id NOT LIKE 'eval-%' AND cu.external_id NOT LIKE 'live-sim:%'
GROUP BY 1 ORDER BY 1;

-- K6 ช่วงเวลาที่ลูกค้าทัก (ชั่วโมงตามเวลาร้าน) · เติมครบ 0..23
SELECT EXTRACT(hour FROM m.created_at AT TIME ZONE $4)::int AS hour, count(*) AS n
FROM messages m JOIN conversations c ON c.id = m.conversation_id JOIN customers cu ON cu.id = c.customer_id
WHERE m.business_id = $1 AND m.direction = 'inbound' AND m.author = 'customer' AND m.created_at >= $2 AND m.created_at < $3
  AND cu.external_id NOT LIKE 'eval-%' AND cu.external_id NOT LIKE 'live-sim:%' GROUP BY 1;

-- K7 ช่องทาง (แชตที่มีลูกค้าทักในช่วง)
SELECT c.channel, count(DISTINCT m.conversation_id) AS conversations
FROM messages m JOIN conversations c ON c.id = m.conversation_id JOIN customers cu ON cu.id = c.customer_id
WHERE m.business_id = $1 AND m.direction = 'inbound' AND m.author = 'customer' AND m.created_at >= $2 AND m.created_at < $3
  AND cu.external_id NOT LIKE 'eval-%' AND cu.external_id NOT LIKE 'live-sim:%' GROUP BY 1 ORDER BY 2 DESC;
```

หมายเหตุ: ผลรวมของ `daily.conversations` อาจมากกว่า `conversations.active` (แชตเดียวนับในหลายวัน) · UI ต้องไม่รวมรายวันเป็นยอดรวม · `now.staffAvailable`: `getTeamAvailability(businessId)` นับ `availability === 'available'` เมื่อ probe `team_availability` ผ่าน (§5.7) ไม่งั้น tile ไม่มีข้อมูล

### 5.3 ผลลัพธ์ของร้าน (seller impact) — คำนิยามและ SQL แน่นอน (`impact.ts`)

ทุกข้อใช้ตัวกรองร่วม §5.1 และช่วงเดียวกัน `[$2,$3)` · เซตตั้งต้น **"แชตที่มีลูกค้าทัก" (active)** = แชตที่มีข้อความ `direction='inbound' AND author='customer'` อย่างน้อยหนึ่งข้อความที่ `created_at` ในช่วง

```sql
WITH active AS (
  SELECT DISTINCT m.conversation_id
  FROM messages m JOIN conversations c ON c.id = m.conversation_id JOIN customers cu ON cu.id = c.customer_id
  WHERE m.business_id = $1 AND m.direction = 'inbound' AND m.author = 'customer'
    AND m.created_at >= $2 AND m.created_at < $3 AND cu.external_id NOT LIKE 'eval-%' AND cu.external_id NOT LIKE 'live-sim:%'
), ai_reply AS (       -- คำตอบของ AI ในแชตนั้นในช่วง (ไม่นับ nudge origin 'system', broadcast, comment)
  SELECT DISTINCT m.conversation_id FROM messages m JOIN active a ON a.conversation_id = m.conversation_id
  WHERE m.direction = 'outbound' AND m.author = 'ai' AND m.origin IN ('live','demo') AND m.created_at >= $2 AND m.created_at < $3
), staff_msg AS (      -- ข้อความจากพนักงานในช่วง (ไม่นับ broadcast)
  SELECT DISTINCT m.conversation_id FROM messages m JOIN active a ON a.conversation_id = m.conversation_id
  WHERE m.direction = 'outbound' AND m.author = 'staff' AND m.origin <> 'broadcast' AND m.created_at >= $2 AND m.created_at < $3
), handoff AS (        -- ส่งต่อให้คน: AI/ลูกค้าขอพนักงาน หรือมีการมอบหมาย/รับช่วงเป็นคน (audit ของ F11)
  SELECT DISTINCT e.target_id::uuid AS conversation_id FROM audit_events e
  WHERE e.business_id = $1 AND e.target_type = 'conversation' AND e.created_at >= $2 AND e.created_at < $3
    AND e.target_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND ( e.action = 'conversation.handoff.requested' OR (e.action = 'conversation.assign' AND e.details->>'handler' = 'human') )
)
SELECT (SELECT count(*) FROM active) AS active,
  (SELECT count(*) FROM active a WHERE a.conversation_id IN (SELECT conversation_id FROM ai_reply)
      AND a.conversation_id NOT IN (SELECT conversation_id FROM staff_msg)
      AND a.conversation_id NOT IN (SELECT conversation_id FROM handoff)) AS auto_resolved,
  (SELECT count(*) FROM active a WHERE a.conversation_id IN (SELECT conversation_id FROM handoff)) AS handed_off,
  (SELECT count(*) FROM active a WHERE a.conversation_id IN (SELECT conversation_id FROM staff_msg)) AS staff_touched;
```

คำนิยาม (ตรงกับตัวเลขบนหน้า ต้องใส่ในคำอธิบายของ tile):
- **AI ดูแลจบเอง (auto-resolved)** = แชตใน `active` ที่มี **คำตอบจาก AI ≥ 1**, **ไม่มีข้อความจากพนักงาน**, **ไม่มีการส่งต่อให้คน** ภายในช่วง · `pct = auto_resolved / active × 100` (null เมื่อ `active = 0`) · ข้อจำกัดที่ต้องบอกในหน้า: ไม่ได้พิสูจน์ว่าลูกค้าพอใจ (ใช้คู่กับอารมณ์ใน F26)
- **อัตราส่งต่อ (handoff rate)** = แชตใน `active` ที่มี event `conversation.handoff.requested` หรือ `conversation.assign` ที่ `details.handler='human'` ในช่วง ÷ `active` · ไม่นับการที่พนักงานพิมพ์เองโดยไม่มีการรับช่วง (นับใน `staff_touched` แต่ไม่นับใน handoff)

**ตอบครั้งแรกเร็วแค่ไหน (first response time)** — ต่อแชต: ข้อความลูกค้าแรกในช่วง (`t_in`) → ข้อความขาออกแรกหลังจากนั้นของ AI หรือพนักงาน (`t_out`) · แยกตามผู้ตอบ

```sql
WITH first_in AS (
  SELECT m.conversation_id, min(m.created_at) AS t_in
  FROM messages m JOIN conversations c ON c.id = m.conversation_id JOIN customers cu ON cu.id = c.customer_id
  WHERE m.business_id = $1 AND m.direction = 'inbound' AND m.author = 'customer' AND m.created_at >= $2 AND m.created_at < $3
    AND cu.external_id NOT LIKE 'eval-%' AND cu.external_id NOT LIKE 'live-sim:%' GROUP BY m.conversation_id
), first_out AS (
  SELECT DISTINCT ON (f.conversation_id) f.conversation_id, f.t_in, m.author, m.created_at AS t_out
  FROM first_in f JOIN messages m ON m.conversation_id = f.conversation_id
   AND m.direction = 'outbound' AND m.author IN ('ai','staff') AND m.origin IN ('live','demo') AND m.created_at > f.t_in
  ORDER BY f.conversation_id, m.created_at ASC, m.seq ASC
), pairs AS (
  SELECT author, extract(epoch FROM (t_out - t_in)) AS secs FROM first_out WHERE t_out - t_in <= interval '24 hours'
)
SELECT author, count(*) AS n, percentile_cont(0.5) WITHIN GROUP (ORDER BY secs) AS median_seconds FROM pairs GROUP BY author
UNION ALL SELECT 'all', count(*), percentile_cont(0.5) WITHIN GROUP (ORDER BY secs) FROM pairs;
-- unanswered = (SELECT count(*) FROM first_in) - (SELECT count(*) FROM first_out)  (ไม่นับคู่ที่เกิน 24 ชม. เป็นตอบแล้ว: นับเป็น unanswered ด้วย)
```

หมายเหตุ: เวลา = เวลาที่บันทึกข้อความในระบบ (ไม่ใช่เวลาที่ถึงมือลูกค้า) · `origin IN ('live','demo')` ตัด nudge/broadcast/comment · ผลเป็นวินาที (UI แสดง "x วินาที" หรือ "y นาที") · `n = 0` → `medianSeconds = null` (แสดง "—")

**ออเดอร์จากแชต:** `getOrderMetrics(businessId, { from: fromUtc, to: toUtc })` → `created = ordersCreated`, `fromChat = ordersFromChat` (เฉพาะออเดอร์ที่ AI เสนอในแชตแล้วลูกค้ายืนยัน origin 'ai' ไม่ใช่ทุกออเดอร์ที่ผูกกับแชต), `paid = ordersPaid`, `revenueMinor` (สตางค์ → `formatMoney`) · tile "ยังไม่มีข้อมูล" เมื่อ §5.7 บอกว่าต้นทางยังไม่พร้อม

**ลูกค้าที่ทักตามแล้วกลับมา (recovered follow-ups):** `getFollowUpMetrics(...)` → `{ scheduled, sent, cancelled, recovered }` · `recoveryPct = recovered / sent × 100` (null เมื่อ `sent = 0`) · ห้ามคำนวณ recovered เอง

**ต้นทุน AI ต่อแชตที่ AI ดูแลจบเอง:** ต้นทุน = ผลรวม `cost_usd_micros` ของแถว `model_usage` ที่ `mode = 'openai'` และ `conversation_id IN (แชต auto_resolved)` ในช่วง `created_at ∈ [$2,$3)` (รวมทุก feature ที่ผูกแชตนั้น: F10 ตอบ, F26 สรุป, F38 ทัก, F30 เสียง):

```sql
SELECT count(*) AS calls,
       sum(mu.cost_usd_micros) FILTER (WHERE mu.cost_usd_micros IS NOT NULL) AS known_micros,
       count(*) FILTER (WHERE mu.cost_usd_micros IS NULL) AS unknown_rows
FROM model_usage mu
WHERE mu.business_id = $1 AND mu.mode = 'openai' AND mu.created_at >= $2 AND mu.created_at < $3
  AND mu.conversation_id IN (<auto_resolved conversation ids>);
```
- `knownUsdMicros = null` เมื่อ `calls = 0` (ไม่มีการเรียกจริงในช่วง: ไม่ทราบ ไม่ใช่ 0) หรือเมื่อทุกแถวไม่มีราคา (`known_micros IS NULL`) · `perAutoResolvedUsdMicros = knownUsdMicros / auto_resolved.count` **เฉพาะเมื่อ `unknown_rows = 0` และ `auto_resolved.count > 0`** ไม่งั้น null และ UI แสดง "ไม่ทราบ" พร้อมจำนวนแถวที่ไม่มีราคา · `basis = 'none'` เมื่อไม่มีแถว `openai` (เช่น dev ใช้ fake: แสดงข้อความ "โหมดทดสอบ ไม่มีต้นทุนจริง") · ป้าย **"ประมาณการจากตารางราคา ไม่ใช่ใบแจ้งหนี้ของ OpenAI"** ทุกที่ที่แสดงเงินจาก `model_usage` · แถว `kind='realtime'` ที่ browser รายงาน (`voice.*`) ติดป้าย "ประมาณการจากฝั่งเบราว์เซอร์"
- ใช้ id ของแชตเป็นอาร์เรย์ (`ANY($4::uuid[])`) จากผลของ CTE ข้างบน (≤ 5,000 แชตในช่วง 93 วัน: เกินกว่านี้ตัดและเตือน `capped: true` ใน response ภายใน (UNCONFIRMED: ไม่น่าถึงในเดโม))

**เวลาพนักงานที่ประหยัด (ประมาณการ):** `minutes = auto_resolved.count × minutes_per_conversation` (ค่าเริ่มต้น **3 นาที**/แชต, ปรับ 1–60 ได้ในหน้า) · **สมมติฐาน:** แต่ละแชตที่ AI ดูแลจบเองจะใช้เวลาพนักงานเฉลี่ยตามจำนวนนาทีนี้ถ้าไม่มี AI (ตัวเลขนี้เป็นค่าที่เจ้าของตั้งหรือค่าเริ่มต้นของเรา **ไม่ได้มาจากการวัด**) · UI ต้องติดป้าย "ประมาณการ" และแสดงสมมติฐาน ("ตามสมมติฐาน 3 นาทีต่อแชต") และห้ามใช้ตัวเลขนี้เป็นความจริงในพิตช์โดยไม่พูดว่าเป็นประมาณการ · null เมื่อ `auto_resolved.count = 0`

### 5.4 ต้นทุนและ usage (`usage.ts`) — หน้า `/usage`

```sql
SELECT mu.feature_id, mu.purpose, mu.kind, mu.model, mu.mode, count(*) AS calls,
       sum(mu.input_tokens) AS input_tokens, sum(mu.output_tokens) AS output_tokens,
       sum(mu.cached_input_tokens) AS cached_input_tokens, sum(mu.cache_write_tokens) AS cache_write_tokens,
       sum(mu.reasoning_tokens) AS reasoning_tokens, sum(mu.audio_input_tokens) AS audio_input_tokens,
       sum(mu.audio_output_tokens) AS audio_output_tokens, sum(mu.audio_seconds) AS audio_seconds,
       sum(mu.cost_usd_micros) FILTER (WHERE mu.cost_usd_micros IS NOT NULL) AS known_micros,
       count(*) FILTER (WHERE mu.cost_usd_micros IS NULL) AS unknown_cost_rows,
       count(*) FILTER (WHERE mu.error_code IS NOT NULL) AS failed_calls
FROM model_usage mu
WHERE mu.business_id = $1 AND mu.created_at >= $2 AND mu.created_at < $3 AND ($4::boolean OR mu.mode = 'openai')
GROUP BY 1,2,3,4,5 ORDER BY known_micros DESC NULLS LAST, calls DESC;
```
- `includeFake=false` (ค่าเริ่มต้น) ตัดแถว `mode='fake'` · true = แสดงแยกแถวพร้อมป้าย "ทดสอบ" (ต้นทุน 0 จาก `fake_mode` ไม่นับเป็น "ไม่ทราบ")
- **"ไม่ทราบราคา" ≠ 0:** `known_micros` ใช้ `sum` เฉพาะแถวที่มีราคา · ถ้าแถวทั้งหมดของกลุ่มไม่มีราคา `known_micros` = null (`sum` ของเซตว่างให้ null) · `unknown_cost_rows` นับแยกเสมอ · แถวที่เรียกล้ม (`error_code`) มี `cost_usd_micros` = null และ `cost_reason 'provider_error'`: นับใน `failed_calls` ไม่ถือว่า "ไม่รู้ราคา" ของโมเดล (กรองออกจาก `unknown_cost_rows` ด้วย `AND mu.error_code IS NULL`) · `unpricedModels` = model ที่มีแถว `cost_reason = 'no_rate'`
- **รวมต้นทุนจากการทดสอบ:** หน้านี้รวมทุกฟีเจอร์รวม F37 (ทดสอบคุณภาพ) เพราะเป็นเงินที่จ่ายจริง · ติดป้ายแยกในตาราง "byFeature" · ไม่ตัด `eval-` ออก (แถว `model_usage` ไม่มี customer) ต่างจาก KPI/impact ที่ตัด
- รวม `totals`: `knownUsdMicros = null` เมื่อทุกแถวที่นับไม่มีราคา, มิฉะนั้นผลรวม + แสดง `unknownCostRows` ข้างตัวเลข ("มี n ครั้งที่ไม่ทราบราคา") · `inputTokens` ฯลฯ เป็น null เมื่อแถวทั้งหมดเป็น null (โหมด fake) ไม่ใช่ 0
- รายวัน: `(mu.created_at AT TIME ZONE $tz)::date` · แสดงเป็น USD ด้วย `formatUsdMicros(n)` = `$` + `(n / 1e6)` 4 ตำแหน่ง (ตัวช่วยของฟีเจอร์ เพราะ `formatMoney` ของ core เป็นบาท)
- ราคาตามโมเดลมาจาก `MODEL_PRICE_TABLE` ที่ core ใช้ตอนเขียน `cost_usd_micros` แล้ว: F27 ไม่คำนวณราคาซ้ำ

### 5.5 Latency (`latency.ts`)

```sql
SELECT mu.purpose, count(*) AS calls,
       percentile_cont(0.5)  WITHIN GROUP (ORDER BY mu.latency_ms) AS p50,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY mu.latency_ms) AS p95
FROM model_usage mu
WHERE mu.business_id = $1 AND mu.kind = 'chat' AND mu.mode = 'openai' AND mu.error_code IS NULL AND mu.latency_ms IS NOT NULL
  AND mu.feature_id <> 'F37' AND mu.created_at >= $2 AND mu.created_at < $3
GROUP BY mu.purpose ORDER BY calls DESC LIMIT 12;
```
นี่คือเวลาของ "การเรียกโมเดลหนึ่งครั้ง" (ไม่ใช่เวลาทั้ง turn) · เวลาทั้ง turn ของ AI = `medianTurnLatencyMs` จาก `getAiTurnMetrics` · ผลเป็นจำนวนเต็ม ms (ปัด) · `p95` ที่ `calls < 20` แสดงพร้อมป้าย "ข้อมูลน้อย" (UI) · ไม่มีแถว = รายการว่าง (ไม่ใช่ 0)

### 5.6 สรุปสำหรับพิตช์ (`pitch.ts`, pure)

สร้างข้อความไทยบรรทัดเดียวต่อหัวข้อจากตัวเลขที่ **available เท่านั้น** (ข้อที่ null/ไม่พร้อมถูกข้าม ไม่เขียนเลขปลอม):

```
ผลลัพธ์ร้านช่วง {from}–{to} ({n} แชต):
- AI ดูแลแชตจบเอง {pct}% ({auto} จาก {active} แชต)
- ตอบครั้งแรก: AI มัธยฐาน {aiMedian} · พนักงาน {staffMedian}
- ส่งต่อให้พนักงาน {handoffPct}% ({handoffCount} แชต)
- ออเดอร์จากแชต {fromChat} จาก {created} ออเดอร์ (ชำระแล้ว {paid})
- ทักตามลูกค้า: ส่ง {sent} กลับมา {recovered}
- ต้นทุน AI ต่อแชตที่จบเอง ประมาณ ${cost} (ประมาณการ ไม่ใช่ใบแจ้งหนี้)
- เวลาพนักงานที่ประหยัด ประมาณ {hours} ชั่วโมง (ประมาณการ: {M} นาทีต่อแชต)
เวลาเป็นเวลาที่บันทึกในระบบ · คำนวณ {computedAt}
```
`aiMedian` รูปแบบ: < 60 วินาที = "{x} วินาที", ไม่งั้น "{y} นาที" (1 ตำแหน่งทศนิยม) · ตัวเลข `pct` ปัดเป็นจำนวนเต็ม · เงิน `formatMoney` · USD 4 ตำแหน่ง · ถ้า tile ไม่พร้อมบรรทัดนั้นหายไป · test: snapshot ของข้อความจากตัวเลขตัวอย่าง

### 5.7 ต้นทางพร้อมหรือยัง (`probe.ts`) — ป้าย "ยังไม่มีข้อมูล"

contract fake คืนศูนย์ซึ่งแยกไม่ออกจากศูนย์จริง จึงตรวจจากโครงสร้าง: `SELECT to_regclass('public.<table>') IS NOT NULL` (cache 60 วินาที) ต่อต้นทาง: `orders` (F13) · `ai_turns` (F10) · `follow_ups` (F38) · `team_availability` (F11) · `conversation_insights` (F26)

- ตารางไม่มี → tile `{ available: false, reason: 'not_built' }` (UI: **"ยังไม่มีข้อมูล"**) โดยไม่เรียกฟังก์ชัน
- ตารางมี → เรียกฟังก์ชัน (timeout 5 วินาที) · สำเร็จ = `{ available: true, value }` (ศูนย์เป็นศูนย์จริง แสดงเลข 0) · throw/timeout → `{ available: false, reason: 'error' }` ("โหลดไม่สำเร็จ ลองใหม่") และ log `warn` ไม่ทำให้หน้าล้ม
- ข้อจำกัดที่รู้: ตารางมีแล้วแต่ฟังก์ชันยังเป็น fake (migration merge ก่อน body จริง) จะแสดง 0 ได้ → กติกา acceptance ข้อ "ตัวเลขต้องตรงกับ SQL spot-check ของเจ้าของ" และ EVIDENCE.md ต้องบันทึกว่า contract ไหนเป็นของจริงตอนนั้น (ตรวจจาก `DONE` บนบอร์ด)

### 5.8 Trace และการ redact (`trace.ts`, `redact.ts`)

- `listTraces` = `listTurns(businessId, query)` ของ F10 ตรง ๆ (ไม่ query `ai_turns` เอง) · `openTrace(businessId, turnId, actorUserId)`: `getTurnTrace(businessId, turnId)` (null = `NOT_FOUND` · ข้ามร้านก็ null ตามสัญญา F10) → `redactTrace()` → `audit({ action:'analytics.trace.view', actorUserId, businessId, targetType:'ai_turn', targetId: turnId, details:{ state, intent } })` (เขียน audit ก่อนส่ง response; audit ล้ม = ไม่คืน trace)
- `redactTrace(t)`: คืนเฉพาะฟิลด์ใน `RedactedTrace` (allowlist) · ทุก string ใน `tools[].error`, `guardActions[].detail` ตัด 300 ตัวอักษร · ลบ/แทนที่ด้วย `[redacted]` ค่าที่ key ตรง `/key|token|secret|authorization|password|cookie/i` (กรณีอนาคตที่ trace มี object) · mask อีเมล/เบอร์/เลข 13+ หลักด้วย `maskSensitive` (คัดลอกกติกา §5.4 ของ F26 เป็นฟังก์ชันของ F27เอง ห้าม import ไฟล์ของ F26) · ไม่ส่ง `inboundMessageId`, `replyMessageId`, `productRefs`, ข้อความลูกค้า
- สิทธิ์: `business.bot_settings` (เจ้าของโดยค่าเริ่มต้น) · พนักงานที่ไม่มีสิทธิ์ = `PERMISSION_DENIED` ทั้ง list และ detail

### 5.9 Export (`export.ts`)

`GET …/analytics/export?dataset=<kpi|daily|usage|traces>&format=csv|json&from&to` · `assertRateLimit({ key:'f27:export:'+businessId, limit: 12, windowSeconds: 60 })`

- `kpi`: แถว `metric,value,unit,note` จาก `DashboardData` + `SellerImpact` (ชื่อ metric เป็น ASCII: `conversations_active`, `auto_resolved_count`, `auto_resolved_pct`, `first_response_ai_median_s`, `handoff_rate_pct`, `orders_from_chat`, `recovered_followups`, `ai_cost_per_auto_resolved_usd`, `staff_minutes_saved_estimate` …) · ค่าที่ไม่ทราบ = ช่องว่างใน CSV / `null` ใน JSON (ห้าม 0) · ประมาณการมี `note='estimate'`
- `daily`: `date,conversations,customer_messages,ai_replies,staff_messages`
- `usage`: ทุกคอลัมน์ของ `UsageRow` (ตัวเลขล้วน)
- `traces`: ≤ 1,000 แถวล่าสุดของช่วง ผ่าน `listTurns` ทีละหน้า 100: `turn_id,conversation_id,started_at,state,intent,tool_count,evidence_count,guard_count,latency_ms` เท่านั้น
- **ห้ามส่งออก:** ข้อความลูกค้า, ข้อความ AI, prompt, ชื่อ/อีเมล/เบอร์ลูกค้า, external id, token, key · allowlist ของคอลัมน์ตายตัวต่อ dataset (test เทียบรายชื่อคอลัมน์)
- CSV: UTF-8 พร้อม BOM, `\r\n`, quote ด้วย `"`, เซลล์ที่ขึ้นต้น `= + - @` ใส่ `'` นำหน้า (กัน formula injection) · ชื่อไฟล์ `nless-<dataset>-<from>_<to>.csv` · audit `analytics.export` (dataset, range, rows: ไม่มีเนื้อหา)

### 5.10 ค่าคงที่ (`config.ts`)

`MAX_RANGE_DAYS 93` · `CACHE_SECONDS 15` · `PROBE_CACHE_SECONDS 60` · `UPSTREAM_TIMEOUT_MS 5000` · `MINUTES_PER_CONVERSATION_DEFAULT 3` · `LATENCY_LOW_SAMPLE 20` · `EXPORT_MAX_TRACES 1000` · `AUTO_RESOLVED_IDS_CAP 5000`

## 6. AI calls

ไม่มี AI call (F27 อ่านผลของ `model_usage` ที่ core เขียนเท่านั้น และไม่เรียก `model.*`)

## 7. UI

Routes (`pages.tsx`): `/dashboard` (`permission:'insights.read'`, `titleKey:'analytics:dashboard.title'`) · `/usage` (`permission:'business.bot_settings'`) · `/traces` (`permission:'business.bot_settings'`) · เมนู: `{ path:'/dashboard', group:'home', icon:'DashboardOutlined', order:10, permission:'insights.read', searchTerms:['dashboard','ภาพรวม','ผลลัพธ์','kpi'] }` · `{ path:'/usage', group:'insights', icon:'PaidOutlined', order:30, permission:'business.bot_settings', searchTerms:['usage','ต้นทุน','token','ค่า AI'] }` · `{ path:'/traces', group:'insights', icon:'AccountTreeOutlined', order:40, permission:'business.bot_settings', searchTerms:['trace','ติดตาม AI','เครื่องมือ'] }`

**`/dashboard` (`DashboardPage.tsx`)** — ใช้ UI kit ของ core + `recharts`:
1. `PageHeader` + ตัวเลือกช่วงวัน (`ToggleButtonGroup` วันนี้/7/30 วัน + `TextField type="date"` สองช่อง ตามเวลาร้าน) + ปุ่ม "ส่งออก" (เมนู: ตัวเลขสรุป/รายวัน/ต้นทุน/trace · CSV/JSON; เฉพาะ `business.bot_settings`)
2. **ส่วน "ผลลัพธ์ของร้าน"** (`SectionCard`, `data-testid="impact-section"`) ขึ้นก่อนเสมอ: กริด tile 8 ใบ ใบละ `data-testid` (`impact-auto-resolved`, `impact-first-response`, `impact-handoff`, `impact-orders`, `impact-followups`, `impact-ai-cost`, `impact-time-saved`, `impact-active`) · tile = ตัวเลขใหญ่ + คำอธิบายสั้น + บรรทัดนิยาม (ไอคอนข้อมูล tooltip แสดงคำนิยามจาก §5.3) · tile ประมาณการมี `Chip` "ประมาณการ" · tile ที่ `available:false` แสดง "ยังไม่มีข้อมูล" (ไม่มีเลข ไม่มีกราฟ) · tile ที่เลข null แสดง "—" หรือ "ไม่ทราบ" พร้อมเหตุผล · ปุ่ม "คัดลอกสรุปสำหรับพิตช์" (`impact-copy`) → `navigator.clipboard.writeText(pitchText)` + toast · ปุ่ม "ตั้งสมมติฐานเวลา" (เฉพาะ `business.bot_settings`) เปิด `FormDialog` แก้ `minutesPerConversation`
3. การ์ดตัวเลข: แชตที่ทักมา · ลูกค้าใหม่ · ข้อความ (ลูกค้า/AI/พนักงาน) · คิวรอพนักงานตอนนี้ · พนักงานพร้อมรับ (tile)
4. กราฟ (recharts; มีป้ายตัวเลข/ชื่อกำกับ ไม่พึ่งสีอย่างเดียว; สีจากธีม): `AreaChart` รายวัน (แชต, ข้อความลูกค้า, AI, พนักงาน) · `BarChart` ช่วงเวลาที่ลูกค้าทัก 24 แท่ง · `BarChart` ช่องทาง · การ์ด "คุณภาพ AI" (`ai` tile: turns, ส่งต่อ, ล้ม, มัธยฐานเวลา turn) · ตาราง latency การเรียกโมเดล (purpose, ครั้ง, p50, p95 พร้อมป้าย "ข้อมูลน้อย") · การ์ด "สรุปแชต" (`insights` tile) ลิงก์ไป `/insights`
5. `Slots`: `useSlot('dashboardCards')` เรียงตาม `order` เรนเดอร์ใต้กราฟ (lane อื่นเพิ่มการ์ดได้โดยไม่แก้ไฟล์เรา)
6. states: loading (skeleton ต่อการ์ด), empty ต่อกราฟ (`EmptyState` "ยังไม่มีข้อมูลในช่วงนี้"), error (`EmptyState` + ลองใหม่) · refresh เองทุก 60 วินาทีและเมื่อกด · `useRealtime('message.created', debounce 5 วินาที → reload)`

**`/usage` (`UsagePage.tsx`)**: ช่วงวัน + Switch "รวมโหมดทดสอบ (fake)" · ป้าย Alert info "ต้นทุนเป็นประมาณการจากตารางราคา ไม่ใช่ใบแจ้งหนี้ของ OpenAI · ไม่มีโควตาหรือแพ็กเกจ ใช้ได้ไม่จำกัด" · การ์ดรวม (ต้นทุนที่ทราบ, ครั้งที่ไม่ทราบราคา, calls, tokens in/out/cached/reasoning) · `BarChart` ต้นทุนรายวัน · ตารางตามฟีเจอร์ · `DataTable` รายละเอียด (ฟีเจอร์, purpose, kind, model, โหมด, ครั้ง, tokens, cached, reasoning, ต้นทุน USD, ไม่ทราบ n) · แถว realtime มีป้าย "ประมาณการจากเบราว์เซอร์" · รายการ model ที่ไม่มีราคา (`unpricedModels`) เป็น `Alert warning` เมื่อไม่ว่าง

**`/traces` (`TracesPage.tsx`)**: ตัวกรอง สถานะ / intent / conversationId · `DataTable` (`GET /analytics/traces`: เวลา, สถานะ `StatusChip`, intent, จำนวนเครื่องมือ, หลักฐาน, guard, latency) · แถวคลิก → `Drawer` (`GET traces/:id`): เส้นเวลา timings, ตารางเครื่องมือ (ชื่อ, ok, ms, error), `evidenceIds`, guard actions, ข้อมูล usage · ป้าย "ข้อความลูกค้าไม่แสดงในหน้านี้" · ทุกครั้งที่เปิด drawer = เขียน audit (ผู้ใช้เห็นข้อความ "การเปิดดูถูกบันทึก") · `EmptyState` เมื่อไม่มี turn หรือ F10 ยังไม่พร้อม ("ยังไม่มีข้อมูล")

i18n (namespace `analytics`):

| key | th | en |
|---|---|---|
| `menu.dashboard` | ภาพรวมร้าน | Dashboard |
| `menu.usage` | ต้นทุน AI | AI usage |
| `menu.traces` | ติดตามการทำงาน AI | AI traces |
| `dashboard.title` | ภาพรวมร้าน | Shop dashboard |
| `range.today` | วันนี้ | Today |
| `range.7d` | 7 วัน | 7 days |
| `range.30d` | 30 วัน | 30 days |
| `range.from` | ตั้งแต่ | From |
| `range.to` | ถึง | To |
| `range.tz` | วันตามเวลาร้าน ({{tz}}) | Days use the shop timezone ({{tz}}) |
| `impact.title` | ผลลัพธ์ของร้าน | Shop results |
| `impact.subtitle` | ตัวเลขจากแชตจริงที่บันทึกในระบบ ตรวจซ้ำได้ ตัวที่เป็นประมาณการมีป้ายกำกับ | Numbers from real recorded chats. Estimates are labelled |
| `impact.estimate` | ประมาณการ | Estimate |
| `impact.unavailable` | ยังไม่มีข้อมูล | No data yet |
| `impact.unknown` | ไม่ทราบ | Unknown |
| `impact.copy` | คัดลอกสรุปสำหรับพิตช์ | Copy summary for the pitch |
| `impact.copied` | คัดลอกแล้ว | Copied |
| `impact.assumption` | ตั้งสมมติฐานเวลา | Set time assumption |
| `impact.active` | แชตที่ลูกค้าทักมา | Chats started by customers |
| `impact.autoResolved` | AI ดูแลแชตจบเอง | Handled by AI alone |
| `impact.autoResolvedDef` | แชตที่ AI ตอบอย่างน้อย 1 ครั้ง ไม่มีข้อความจากพนักงาน และไม่ถูกส่งต่อให้คน (ไม่ได้แปลว่าลูกค้าพอใจ ดูอารมณ์ที่หน้า ภาพรวมแชต) | Chats where the AI replied at least once, with no staff message and no handoff (does not mean the customer was satisfied) |
| `impact.autoResolvedOf` | {{n}} จาก {{m}} แชต | {{n}} of {{m}} chats |
| `impact.firstResponse` | ตอบครั้งแรก (มัธยฐาน) | First reply (median) |
| `impact.firstResponseDef` | จากข้อความแรกของลูกค้าในช่วง ถึงข้อความตอบแรกของ AI หรือพนักงาน ตามเวลาที่บันทึกในระบบ | From the customer's first message in the period to the first AI or staff reply, by recorded time |
| `impact.byAi` | AI | AI |
| `impact.byStaff` | พนักงาน | Staff |
| `impact.unanswered` | ยังไม่มีคนตอบ {{n}} แชต | {{n}} chats not answered |
| `impact.handoff` | ส่งต่อให้พนักงาน | Handed to staff |
| `impact.handoffDef` | แชตที่ AI หรือลูกค้าขอพนักงาน หรือมีการมอบหมาย/รับช่วงเป็นคน | Chats where AI or the customer asked for staff, or a person took over or was assigned |
| `impact.orders` | ออเดอร์ที่ AI เสนอและลูกค้ายืนยัน | Orders the AI proposed and customers confirmed |
| `impact.ordersOf` | จาก {{n}} ออเดอร์ทั้งหมด · ชำระแล้ว {{paid}} | of {{n}} orders · {{paid}} paid |
| `impact.revenue` | ยอดที่ชำระแล้ว {{amount}} | Paid revenue {{amount}} |
| `impact.followUps` | ทักตามแล้วลูกค้ากลับมา | Customers won back by follow-up |
| `impact.followUpsOf` | ส่งทัก {{sent}} ครั้ง กลับมา {{recovered}} | {{sent}} sent, {{recovered}} came back |
| `impact.aiCost` | ต้นทุน AI ต่อแชตที่จบเอง | AI cost per self-handled chat |
| `impact.aiCostDef` | ผลรวมต้นทุน AI ของแชตที่ AI ดูแลจบเอง ÷ จำนวนแชตเหล่านั้น เป็นประมาณการจากตารางราคา ไม่ใช่ใบแจ้งหนี้ | Total AI cost of self-handled chats ÷ their number. Estimated from a rate card, not an invoice |
| `impact.aiCostUnknown` | มี {{n}} ครั้งที่ไม่ทราบราคา จึงไม่คำนวณ | {{n}} calls have no known price, so no figure is shown |
| `impact.aiCostFake` | โหมดทดสอบ ไม่มีต้นทุนจริง | Test mode: no real cost |
| `impact.timeSaved` | เวลาพนักงานที่ประหยัด | Staff time saved |
| `impact.timeSavedDef` | จำนวนแชตที่ AI ดูแลจบเอง × {{m}} นาทีต่อแชต (สมมติฐาน ไม่ได้วัดจริง) | Self-handled chats × {{m}} minutes each (an assumption, not measured) |
| `impact.hours` | {{h}} ชั่วโมง | {{h}} hours |
| `impact.minutes` | {{m}} นาที | {{m}} min |
| `impact.seconds` | {{s}} วินาที | {{s}} s |
| `impact.assumptionTitle` | สมมติฐานเวลาต่อแชต | Time per chat assumption |
| `impact.assumptionLabel` | นาทีที่พนักงานใช้ต่อแชต (1–60) | Staff minutes per chat (1–60) |
| `impact.assumptionHelp` | ใช้คำนวณ "เวลาพนักงานที่ประหยัด" เท่านั้น | Used only for "staff time saved" |
| `kpi.conversations` | แชตที่ทักมา | Active chats |
| `kpi.newCustomers` | ลูกค้าใหม่ | New customers |
| `kpi.messages` | ข้อความ | Messages |
| `kpi.customer` | ลูกค้า | Customers |
| `kpi.ai` | AI | AI |
| `kpi.staff` | พนักงาน | Staff |
| `kpi.waiting` | รอพนักงานรับ | Waiting for staff |
| `kpi.openNow` | แชตที่เปิดอยู่ | Open chats |
| `kpi.staffAvailable` | พนักงานพร้อมรับแชต | Staff available |
| `chart.daily` | รายวัน | By day |
| `chart.hourly` | ช่วงเวลาที่ลูกค้าทัก | When customers write |
| `chart.channels` | ช่องทาง | Channels |
| `chart.hourLabel` | {{h}}:00 | {{h}}:00 |
| `ai.title` | คุณภาพ AI | AI quality |
| `ai.turns` | ครั้งที่ AI ตอบ | AI turns |
| `ai.handoff` | ส่งต่อ | Handoff |
| `ai.failed` | ล้มเหลว | Failed |
| `ai.medianTurn` | เวลาตอบต่อครั้ง (มัธยฐาน) | Median time per turn |
| `latency.title` | ความเร็วการเรียกโมเดล | Model call speed |
| `latency.purpose` | จุดประสงค์ | Purpose |
| `latency.calls` | ครั้ง | Calls |
| `latency.lowSample` | ข้อมูลน้อย | Few samples |
| `insights.card` | สรุปแชต: วิเคราะห์แล้ว {{n}} · ควรตามต่อ {{f}} | Chat insights: {{n}} analysed · {{f}} need follow-up |
| `export.button` | ส่งออก | Export |
| `export.kpi` | ตัวเลขสรุป | Summary numbers |
| `export.daily` | รายวัน | Daily |
| `export.usage` | ต้นทุน AI | AI usage |
| `export.traces` | ติดตามการทำงาน AI | AI traces |
| `export.note` | ส่งออกเฉพาะตัวเลขและรหัส ไม่มีข้อความลูกค้า | Numbers and ids only, no customer text |
| `usage.title` | ต้นทุน AI | AI usage and cost |
| `usage.disclaimer` | ต้นทุนเป็นประมาณการจากตารางราคา ไม่ใช่ใบแจ้งหนี้ของ OpenAI · ไม่มีโควตาหรือแพ็กเกจ ใช้ได้ไม่จำกัด | Costs are estimates from a rate card, not an OpenAI invoice. There are no quotas or plans |
| `usage.includeFake` | รวมโหมดทดสอบ (fake) | Include test mode (fake) |
| `usage.knownCost` | ต้นทุนที่ทราบ | Known cost |
| `usage.unknownRows` | มี {{n}} ครั้งที่ไม่ทราบราคา | {{n}} calls have no known price |
| `usage.calls` | จำนวนครั้ง | Calls |
| `usage.tokens` | โทเค็น | Tokens |
| `usage.input` | อินพุต | Input |
| `usage.output` | เอาต์พุต | Output |
| `usage.cached` | แคช | Cached |
| `usage.reasoning` | การคิด | Reasoning |
| `usage.byFeature` | ตามฟีเจอร์ | By feature |
| `usage.rows` | รายละเอียด | Details |
| `usage.feature` | ฟีเจอร์ | Feature |
| `usage.purpose` | จุดประสงค์ | Purpose |
| `usage.kind` | ชนิด | Kind |
| `usage.model` | โมเดล | Model |
| `usage.mode` | โหมด | Mode |
| `usage.cost` | ต้นทุน (USD) | Cost (USD) |
| `usage.test` | ทดสอบ | Test |
| `usage.clientReported` | ประมาณการจากเบราว์เซอร์ | Estimated from the browser |
| `usage.unpriced` | โมเดลที่ไม่มีราคาในตาราง: {{models}} | Models without a price: {{models}} |
| `usage.failed` | เรียกล้มเหลว {{n}} ครั้ง | {{n}} failed calls |
| `usage.dailyCost` | ต้นทุนรายวัน | Cost by day |
| `trace.title` | ติดตามการทำงานของ AI | AI traces |
| `trace.note` | ไม่แสดงข้อความลูกค้า · การเปิดดูแต่ละรายการถูกบันทึก | Customer text is not shown. Each view is logged |
| `trace.time` | เวลา | Time |
| `trace.state` | สถานะ | State |
| `trace.intent` | ความต้องการ | Intent |
| `trace.tools` | เครื่องมือ | Tools |
| `trace.evidence` | หลักฐาน | Evidence |
| `trace.guards` | ตัวตรวจ | Guards |
| `trace.latency` | เวลา | Latency |
| `trace.timings` | เวลาในแต่ละขั้น | Timings |
| `trace.usage` | การใช้โมเดล | Model usage |
| `trace.empty` | ยังไม่มีข้อมูล | No data yet |
| `common.retry` | ลองใหม่ | Retry |
| `common.noData` | ยังไม่มีข้อมูลในช่วงนี้ | No data in this period |
| `common.error` | โหลดไม่สำเร็จ | Failed to load |
| `settings.saved` | บันทึกแล้ว | Saved |
| `settings.conflict` | มีคนแก้ไปแล้ว โหลดใหม่ให้แล้ว | Someone changed it. Reloaded |

## 8. Jobs, schedules, events

| รายการ | ค่า |
|---|---|
| Jobs / schedules | ไม่มี (คำนวณตอนอ่าน; cache 15 วินาทีในหน่วยความจำ) |
| Realtime | ฟัง `message.created` (debounce 5 วินาที) เพื่อรีโหลดฝั่งหน้า · ไม่ publish |
| Audit | `analytics.trace.view` (turnId, state, intent) · `analytics.export` (dataset, range, rows) · `analytics.settings.update` |
| notify | ไม่มี |
| `model_usage` | ไม่เขียน (อ่านอย่างเดียว) |

## 9. Seed และ fixtures

`seed.ts` (`FeatureSeed`, `dependsOn: ['core']`): ร้าน A `analytics_settings` `minutes_per_conversation = 3` (ON CONFLICT DO NOTHING) · ร้าน B ไม่มีแถว (ค่าเริ่มต้นตอนอ่าน = 3, `version 1`; `PUT` ที่ `expectedVersion 1` เมื่อไม่มีแถว = INSERT แล้ว `version 2`)

Fixtures (สร้างด้วยโค้ดใน test, `CLOCK_FIXTURE = 2026-11-21T03:00:00Z`, `vi.useFakeTimers({ now, toFake:['Date'] })` สำหรับ route; SQL ใช้เวลาจาก INSERT ที่กำหนด `created_at` ตรง):
- helper `seedChat({ business, customerExternalId, messages: [{ at, direction, author, origin, text }], status })` INSERT ลง `customers/conversations/messages` ของ core โดยตรง (ตารางกลาง ใช้ใน test ได้) · helper `seedUsage({ business, conversationId, feature, purpose, kind, mode, costMicros|null, latencyMs, tokens… })` INSERT `model_usage` · helper `seedAudit(action, target, details)` INSERT `audit_events`
- ชุด "เดโมตัวเลขรู้คำตอบ" (ร้านทดสอบใหม่ต่อ test เพื่อไม่ชนข้อมูล seed): 10 แชต active ในช่วง: **6 แชต AI ล้วน** (มีคำตอบ ai, ไม่มี staff/handoff) · 1 แชต AI + staff ตอบ · 1 แชต AI + audit handoff (`conversation.handoff.requested`) · 1 แชตมีแต่ข้อความลูกค้า (ยังไม่มีใครตอบ) · 1 แชตของลูกค้า `eval-c1` (ต้องถูกตัด) → คาด: `active = 9`, `auto_resolved = 6` (66.7%), `handed_off = 1`, `staff_touched = 1`, `unanswered = 1`
- เวลาตอบแรก: แชต AI ล้วน 6 ใบมี `t_out − t_in` = 3, 4, 4, 5, 5, 9 วินาที (มัธยฐาน 4.5 วินาที) · แชต staff ตอบแรก 12 นาที (720 วินาที) · แชต handoff AI ตอบก่อน 6 วินาที
- usage: แถว openai 6 แถวของแชต auto-resolved (ต้นทุน 1,000, 1,200, 800, 1,000, 900, 1,100 micros → รวม 6,000 → ต่อแชต 1,000 micros = $0.0010) · อีกชุดมีแถว `cost_usd_micros NULL` 1 แถว → `perAutoResolvedUsdMicros = null`, `unknownRows = 1` · แถว fake (cost 0) ไม่ถูกนับเมื่อ `includeFake=false`
- ขอบวัน: ข้อความ `2026-11-21T16:59:00Z` และ `2026-11-21T17:00:00Z` (Bangkok) ตกคนละวัน

## 10. Tests

| ไฟล์ | case |
|---|---|
| `range.test.ts` | ตัวอย่าง §5.1 ทั้ง Bangkok/Tokyo · ขอบ 16:59Z/17:00Z · ไม่ส่งพารามิเตอร์ = 7 วันรวมวันนี้ · `from > to` และ > 93 วัน = VALIDATION_ERROR |
| `kpi.test.ts` | ตัวเลข = `SELECT count(*)` ตรงจาก fixture (K1–K7) · `eval-*` ไม่ถูกนับทุก query · ร้านอื่นไม่ปน · nudge (`author ai origin system`) และ broadcast ไม่นับเป็น AI reply · รายวันเติม 0 · hourly ครบ 24 ค่า · ขอบวันตามเวลาร้าน |
| `impact.test.ts` (ชุดหลัก) | ชุด "เดโมตัวเลขรู้คำตอบ" §9 ได้ `active 9`, `autoResolved 6` (`pct 66.7`), `handoff 1`, `staffTouched 1` · แชตที่ staff ตอบ/มี handoff ไม่ใช่ auto-resolved · แชตไม่มี AI reply ไม่ใช่ auto-resolved · `conversation.assign` ที่ `handler:'ai'` (คืนให้ AI) ไม่นับ handoff · first response: มัธยฐาน AI 4.5 วินาที, staff 720 วินาที, `unanswered 1` · คู่ > 24 ชม. ไม่นับ · ต้นทุนต่อแชต = 1,000 micros · มีแถวไม่ทราบราคา 1 แถว → per = null (ไม่ใช่ 0) และ `unknownRows 1` · ไม่มีแถว openai (fake) → `basis 'none'`, cost null · `auto_resolved = 0` → per null, minutes null · `staffMinutesSaved = 6 × 3 = 18` และ `isEstimate true` · แก้ `minutes_per_conversation` เป็น 5 → 30 |
| `usage.test.ts` | รวมกลุ่มตาม feature/purpose/kind/model/mode · `includeFake=false` ตัด fake · `cost NULL` ไม่ถูกรวมเป็น 0 และนับ `unknownCostRows` · ทุกแถว null → `knownUsdMicros null` · แถว error ไม่นับ unknown แต่นับ `failedCalls` · `unpricedModels` มาจาก `cost_reason 'no_rate'` · รวม F37 และแยกใน byFeature · tokens null เมื่อทุกแถว null · รายวันตามเวลาร้าน · realtime `isClientReported` |
| `latency.test.ts` | p50/p95 ถูกต้อง (percentile_cont) · ตัด error, fake, F37 · ไม่มีแถว = `[]` |
| `probe.test.ts` | ต้นทางไม่มีตาราง → `available:false not_built` และ **ไม่เรียกฟังก์ชัน** (spy) · มีตารางและฟังก์ชันคืนศูนย์ → `available:true` เลข 0 · ฟังก์ชัน throw → `reason 'error'` หน้าไม่พัง · timeout 5 วินาที · cache 60 วินาที |
| `upstream.test.ts` | ส่งช่วง UTC ครึ่งเปิดให้ `getOrderMetrics`/`getFollowUpMetrics`/`getAiTurnMetrics` ตรง `[fromUtc, toUtc)` · `recoveryPct` null เมื่อ `sent 0` |
| `pitch.test.ts` | snapshot ข้อความจากตัวเลขตัวอย่าง · tile ไม่พร้อมถูกข้าม · null ไม่กลายเป็น "0" · รูปแบบ วินาที/นาที |
| `trace.test.ts` | `openTrace` เขียน audit ก่อนตอบ · audit ล้ม = ไม่คืน trace · `getTurnTrace` null (ร้านอื่น) = 404 · `redactTrace` ตัด field นอก allowlist, mask อีเมล/เบอร์, ตัด 300 ตัว, ลบ key ที่ชื่อ token/secret |
| `export.test.ts` | คอลัมน์ต่อ dataset ตรงรายชื่อตายตัว (ไม่มี text/name/external id) · CSV มี BOM + `\r\n` + กัน `=cmd` · ค่า null = ช่องว่าง/`null` ไม่ใช่ 0 · traces ≤ 1,000 · rate limit ครั้งที่ 13/นาที = 429 · audit `analytics.export` ไม่มีเนื้อหา |
| `routes.test.ts` | permission: ผู้ไม่มี `insights.read` = 403 บน dashboard/impact/settings GET · ไม่มี `business.bot_settings` = 403 บน usage, traces, export, PUT settings · tenant: `turnId` ของร้าน B จากร้าน A = 404 · `VERSION_CONFLICT` · ร้านใหม่ไม่มี settings = ค่าเริ่มต้น 3 |

Playwright smoke `web/src/features/analytics/e2e/analytics.smoke.spec.ts` (production-safe: อ่านอย่างเดียว ยกเว้นการตั้งสมมติฐานที่คืนค่าเดิม):
1. `ownerPage` เปิด `/dashboard` → เห็น `impact-section` และ tile ทั้ง 8 (`impact-*`) ไม่ว่างเปล่า (มีเลข, "—", หรือ "ยังไม่มีข้อมูล" เท่านั้น: ห้ามมี `NaN`/`undefined`/`null` ในข้อความ)
2. สร้างข้อมูลจริงหนึ่งแชตผ่าน Demo Chat (`/demo-chat/s/demo-boardgame`, ข้อความ `A-GAME-01 ราคาเท่าไหร่ (e2e-<ts>)`, รอ AI ตอบ) แล้วรีโหลด `/dashboard` ช่วงวันนี้ → `impact-active` เพิ่มจากก่อนหน้าอย่างน้อย 1 (เทียบผ่าน `GET /analytics/impact` ของ fixture `api` ก่อน/หลัง) และ `ai` card turns ≥ 1 (ถ้า F10 เป็นของจริง)
3. ตัวเลขใน tile `impact-active` เท่ากับ `activeConversations` จาก API (หน้าไม่แต่งเลขเอง)
4. กดคัดลอก (`impact-copy`) → toast "คัดลอกแล้ว" และข้อความที่คัดลอก (อ่านผ่าน `navigator.clipboard.readText` ถ้า permission ให้ หรือ intercept) มี "ผลลัพธ์ร้านช่วง"
5. `/usage` เปิดได้สำหรับ owner: มี Alert "ไม่ใช่ใบแจ้งหนี้" และตารางหรือ `EmptyState` · `/traces` เปิดได้ · คลิกแถวแรก (ถ้ามี) → drawer แสดง และไม่มีข้อความลูกค้า (ไม่พบ marker `e2e-<ts>` ในข้อความของ drawer)
6. เปลี่ยนสมมติฐาน 3 → 4 → บันทึก → tile `impact-time-saved` คำนวณใหม่ → เปลี่ยนกลับ 3 (ใน `finally`)
7. export: `api.get('/analytics/export?dataset=kpi&format=csv')` → status 200, `content-type` text/csv, ขึ้นต้นด้วย BOM, **ไม่มี** marker `e2e-<ts>` (ไม่ปนข้อความลูกค้า)

## 11. Acceptance: R ตาม D6

- [ ] KPI ภาพรวมทุกตัวมี SQL test ตรงกับ `SELECT count(*)` ของ fixture · ตัดวันที่ 17:00Z (เที่ยงคืน Bangkok) · ตัด `eval-*` ทุกตัว (test)
- [ ] ส่วน "ผลลัพธ์ของร้าน" แสดง 8 tile ตามนิยามใน §5.3 พร้อมคำนิยามให้เห็นในหน้า · ประมาณการมีป้าย · เลขที่ไม่ทราบเป็น "ไม่ทราบ/—" ไม่ใช่ 0 (test: ต้นทุนต่อแชตเมื่อมีแถวไม่ทราบราคา)
- [ ] tile ที่ต้นทาง contract ยังเป็น fake แสดง "ยังไม่มีข้อมูล" (test probe) · เมื่อ A2/B2 DONE: ตัวเลขออเดอร์/ทักตาม/AI turns มาจาก `get…Metrics` ของจริง และ EVIDENCE.md บันทึกว่าตรวจแล้วว่าไม่ใช่ fake
- [ ] **ตัวเลขที่ทีมคัดลอกไปพิตช์ 16:15 ถูกตรวจ:** รัน `/analytics/impact` บน production ช่วงเดโมแล้วเทียบ `autoResolved`, `active`, `firstResponse` กับ SQL ที่รันตรงบน DB (spot-check 3 ตัว) จดผลใน EVIDENCE.md พร้อมเวลา
- [ ] `/usage`: ต้นทุนมาจาก `model_usage` ของ core, แยก feature/purpose/model/kind, tokens รวม cached/reasoning/audio, null ไม่ถูกแปลงเป็น 0, ป้ายประมาณการ, ไม่มีโควตา/แพ็กเกจ
- [ ] `/traces`: เฉพาะผู้มี `business.bot_settings` · ดึงจาก F10 (ไม่มี trace ชุดที่สอง) · ทุกการเปิดมี audit · redact ผ่าน test · ร้านอื่นเปิดไม่ได้ (404)
- [ ] export: allowlist คอลัมน์ · ไม่มีข้อความ/ชื่อ/secret (test + smoke ข้อ 7) · rate limit · audit
- [ ] permission + tenant (route test), loading/empty/error, i18n th/en, recharts แสดงจริง (smoke), Playwright smoke ผ่านบน production, slot `dashboardCards` เรนเดอร์การ์ดของ lane อื่นได้
- **S/A:** KPI ภาพรวม + usage/trace ทำงานแต่ tile ผลลัพธ์ของร้านครึ่งหนึ่งยัง "ยังไม่มีข้อมูล" = **S** (ซื่อสัตย์ได้ แต่พิตช์ใช้ได้เฉพาะ tile ที่มีเลข) · ตัวเลขใดมาจาก fake ถูกแสดงเป็นเลข = ผิดกติกา (ต้องแก้ก่อน merge) · ไม่ถึง R ตอน 15:30 → ซ่อน `/traces` และ `/usage` ด้วย feature flag แต่ **ต้องเก็บ `/dashboard` ไว้** ถ้าส่วนผลลัพธ์ของร้านผ่าน test
- **Status floor:** `/dashboard` KPI + impact = R เฉพาะตัวที่มี SQL test · usage + trace = R · export = A/U ตามจริง

## 12. Security และ privacy

- Tenant: ทุก query กรอง `business_id` ที่ผูกกับผู้เรียกจาก `getBusiness()` ไม่รับ `businessId` จาก body · `turnId` ผ่าน `getTurnTrace(businessId, …)` ที่คืน null ข้ามร้าน · ไม่มี endpoint สาธารณะ
- สิทธิ์: ต้นทุน/trace/export ใช้ `business.bot_settings` (เจ้าของโดยค่าเริ่มต้น ไม่ใช่ platform admin: ต้นทุนเป็นของร้านที่ร้านเห็นได้ ต่างจากที่ Papi ซ่อนเพราะมีโควตาของแพ็กเกจ ซึ่งเราไม่มี) · dashboard/impact ใช้ `insights.read` (พนักงานปิดโดยค่าเริ่มต้น)
- ไม่แสดง/ไม่ส่งออกข้อความลูกค้า, prompt, ชื่อ/อีเมล/เบอร์, external id, token, key · trace ผ่าน allowlist + mask + ตัดความยาว · export ใช้ allowlist คอลัมน์ตายตัว · ไม่ส่งชื่อลูกค้าออกใน `pitchText`
- ตารางกลางที่อ่าน (`messages`, `conversations`, `customers`, `model_usage`, `audit_events`): อ่านอย่างเดียวด้วย `db` ของ core · ไม่เขียน/ไม่แก้ · ไม่ query ตารางของฟีเจอร์อื่นยกเว้นตรวจการมีอยู่ด้วย `to_regclass`
- ห้าม log: ค่า KPI รายแชต, ข้อความ, id ลูกค้า · log ได้เฉพาะ businessId, endpoint, ระยะเวลา, จำนวนแถว
- CSV export กัน formula injection · rate limit export 12/นาที/ร้าน

## 13. Edge cases

| กรณี | ผลที่ต้องได้ |
|---|---|
| ช่วงวันไม่มีแชตเลย | active 0 · pct null ("—") · tile ไม่หารศูนย์ · กราฟ `EmptyState` · pitchText บอกว่าไม่มีแชตในช่วงนี้ |
| ลูกค้า `eval-*` ทัก | ไม่ปรากฏทุก KPI/impact/คิว/ช่องทาง (usage รวมต้นทุน F37 ตามที่เป็นเงินจริง) |
| AI ตอบแล้วพนักงานทักทีหลัง | ไม่ใช่ auto-resolved (staff_msg ในช่วง) |
| พนักงานรับช่วงแล้ว **คืนให้ AI** | `conversation.assign` ที่ `handler:'ai'` ไม่นับ handoff; แต่ถ้ามีข้อความ staff แล้ว ไม่ใช่ auto-resolved |
| nudge ของ F38 (`author ai origin system`) | ไม่นับเป็นคำตอบ AI ไม่เป็น first response |
| ลูกค้าทักข้ามเที่ยงคืน Bangkok | นับ `active` ในแชตเดียวทั้งสองวัน (daily รวมไม่เท่ายอดรวม) · แต่ `active` รวมนับครั้งเดียว |
| ต้นทาง contract throw | tile "โหลดไม่สำเร็จ" · tile อื่นยังแสดง |
| `getOrderMetrics` ยัง fake | probe `orders` ไม่มีตาราง → "ยังไม่มีข้อมูล" |
| `model_usage` มีแถว cost null (ไม่มีราคา) | ต้นทุนรวมแสดงเฉพาะส่วนที่ทราบ + "มี n ครั้งที่ไม่ทราบราคา"; ต้นทุนต่อแชต = null |
| dev ใช้ fake model | `basis 'none'` "โหมดทดสอบ ไม่มีต้นทุนจริง" (ไม่แสดง $0.0000 ราวกับรู้ว่าฟรี) |
| ช่วง 93 วันเกิน | VALIDATION_ERROR |
| ร้านใช้ timezone อื่น | ขอบวัน/ชั่วโมงเปลี่ยนตามร้าน |
| มีแชตเกือบ 5,000 ใบในช่วง | ตัด id ที่ส่งเข้า `ANY()` ที่ cap และตั้งธง capped ในหน้า (ไม่ล้ม) |
| `PUT settings` พร้อมกันสองคน | `VERSION_CONFLICT` |
| ผู้ใช้ไม่มี `business.bot_settings` เปิด `/usage` | Forbidden ของ core · API 403 |
| trace ของ turn ที่ยังรันอยู่ | แสดง state `running` timings บางส่วน ไม่ล้ม |

## 14. Build order (slices ≤ 45 นาที)

| Slice | เวลา | ส่งมอบ |
|---|---|---|
| **S1 KPI + ผลลัพธ์ของร้าน (SQL แท้)** | 45 | migration + seed settings · types/zod · `range.ts`, `kpi.ts`, `impact.ts` (SQL ใน §5.2–§5.3, first response, cost per resolved, minutes saved), `pitch.ts`, `probe.ts` · routes `dashboard`, `impact`, `settings` · tests range/kpi/impact/probe/pitch · **นี่คือสิ่งที่พิตช์ 16:15 ต้องใช้: merge ให้ไวที่สุด** |
| **S2 ต้นทางจริง + UI dashboard** | 45 | `upstream.ts` (`getOrderMetrics`, `getAiTurnMetrics`, `getFollowUpMetrics`, `getTeamAvailability`, `getInsightTotals` ผ่านตัวห่อ timeout/probe) · `latency.ts` · `DashboardPage` (recharts, tile ผลลัพธ์, คัดลอกพิตช์, slot) + i18n · test upstream/latency · rebase เมื่อ A2/B2 DONE และทดสอบกับของจริง |
| **S3 usage + traces + export** | 45 | `usage.ts`, `trace.ts`, `redact.ts`, `export.ts` · routes usage/traces/export · `UsagePage`, `TracesPage` · tests usage/trace/export/routes |
| **S4 smoke + EVIDENCE + spot-check** | 25 | Playwright smoke · spot-check ตัวเลขพิตช์บน production เทียบ SQL · EVIDENCE.md (ทุก tile บอกว่าต้นทางเป็นของจริงหรือ fake ณ ตอนนั้น) |

ลำดับ: S1 ก่อนเสมอ (ไม่พึ่ง lane ใด) · S2 รอ `getOrderMetrics` เข้า `contracts.ts` ถ้ายังไม่เข้า ใช้ `upstream.ts` ประกาศชั่วคราวและแจ้ง `NEED TO:B0` · อย่ารอ A2/B2 เพื่อ merge S1

## 15. UNCONFIRMED และสิ่งที่ต้องตรวจในวันงาน

1. **audit ของ F11:** `audit_events.target_type` ของ `conversation.handoff.requested` / `conversation.assign` เป็น `'conversation'` และ `target_id` เป็น id ของแชต, `details.handler` มีค่า `'human'|'ai'` จริงหรือไม่ (spec F11 บอกเพียง `audit('conversation.assign', { details: { from, to, handler } })` โดยไม่ระบุ target) · ตรวจหลัง F11 DONE ด้วย `SELECT action, target_type, target_id, details FROM audit_events WHERE action LIKE 'conversation.%' LIMIT 5` · ไม่ตรง = ปรับ SQL `handoff` CTE ใน `impact.ts` (หรือใช้ `conversations.handler='human'` ณ ปัจจุบันเป็นทางสำรอง: ติดป้ายในหน้า)
2. **`getOrderMetrics`:** อยู่ใน spec F13 แต่ตอนเขียนยังไม่อยู่ใน `contracts.ts` · ตรวจ signature ตรง `{ ordersCreated; ordersFromChat; ordersPaid; revenueMinor }` · ตาราง `orders` มีชื่อตรงที่ probe ตรวจ
3. **`to_regclass` เป็นตัวบอก "ต้นทางพร้อม":** ไม่สมบูรณ์ (ดู §5.7 ข้อจำกัด) · วิธีตรวจ: ก่อน 16:00 เปิด `/dashboard` บน production แล้วดูว่า tile ใดแสดง 0 ทั้งที่ยังไม่มีข้อมูลจริง เทียบกับ `DONE` บนบอร์ด
4. **ดัชนีของตารางกลาง:** SQL อ่าน `messages` ตามช่วง `created_at` ต่อ `business_id` ซึ่ง base schema ไม่มีดัชนีเฉพาะ (มีแต่ `(conversation_id, seq)`) · ปริมาณเดโมน้อยจึงไม่น่ามีปัญหา · ถ้าช้าให้ขอ `NEED TO:C1` เพิ่ม `messages (business_id, created_at)` และ `audit_events (business_id, action, created_at)` (F27 ไม่ใช้ ALTER เอง) · วัดเวลา `/analytics/impact` ของ production หลังเดโมจริง (เป้า < 1.5 วินาที: ไม่ใช่ตัวเลขยืนยัน)
5. **ความหมาย "จบเอง":** ตามนิยามที่ได้รับมอบหมาย (มี AI reply ≥ 1, ไม่มี staff, ไม่มี handoff) ไม่รู้ว่าลูกค้าได้คำตอบที่ถูกหรือไม่ · พิตช์ต้องพูดว่า "AI ดูแลแชตจบเองโดยไม่ต้องมีพนักงาน" ไม่ใช่ "แก้ปัญหาได้ X%" · ให้คู่กับอัตราส่งต่อและอารมณ์ (F26)
6. **สมมติฐาน 3 นาทีต่อแชต** เป็นค่าที่เราตั้งเอง (ไม่มีข้อมูลวัด) · อย่าอ้างเป็นตัวเลขจริงของร้านเดโม · เจ้าของปรับได้ใน UI
7. **USD อย่างเดียว:** ไม่มีอัตรา USD/THB ในระบบ (ไม่มี env) จึงไม่แปลงเป็นบาท · ถ้าหัวหน้าต้องการบาทในพิตช์ ให้ตัดสินอัตราเองและพูดด้วยปากว่าเป็นการแปลง
8. **ราคาโมเดล:** `cost_usd_micros` มาจาก `MODEL_PRICE_TABLE` ของ core (ตาม `docs/openai-api.md` §1.1) F27 ไม่ตรวจความถูกต้องของราคา · ตรวจใบแจ้งหนี้จริงของ OpenAI เทียบ `/usage` หลังงาน (ความต่างที่คาดได้: ปัดเศษ, prompt cache write, ราคาเวลา)
9. **`listTurns`/`getTurnTrace`:** export ของ `ai-agent/service.ts` (ไม่ใช่ contract ใน `contracts.ts`) · ตรวจชื่อ/signature หลัง F10 S5 merge · ไม่มี → หน้า `/traces` แสดง "ยังไม่มีข้อมูล" และรายงาน U
10. **`useSlot('dashboardCards')`** และ `useRealtime('message.created')` ใน web core: ตรวจชื่อ API จริงใน `web/src/core` หลัง C1 merge (contracts ระบุ `useSlot`; `useRealtime` ตามตัวอย่างใน F38 spec)
11. **`navigator.clipboard`** ต้อง HTTPS/localhost: production ใช้ HTTPS ได้ · ใน Playwright อาจต้องให้สิทธิ์ clipboard (ถ้าไม่ได้ ตรวจแค่ toast)
12. **ลำดับ percentile:** `percentile_cont` คืนค่าแทรก (ไม่ใช่สมาชิกจริง) จึงมัธยฐาน 4.5 วินาทีจากชุดตัวอย่างข้างบนเป็นค่าที่ถูก · ตรวจว่า pg คืน `numeric/double` เป็น number ใน `db` ของ core (ไม่ใช่ string)
