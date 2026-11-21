# F35 core/jobs — งานเบื้องหลังที่ทนทาน, scheduler และหน้า /ops

| | |
|---|---|
| Lane / คน | **C1** / **C** · ลำดับ 2 ใน lane (F01 → F35 → F39 → F36) |
| Tier / เป้า | **P0** · เป้า **R** (golden path ใช้ `ai.reply` และ `core.deliver` ผ่าน worker นี้) |
| Timebox | 60–150 นาที (ประมาณ 12:00–12:45 ตามนาฬิกา เริ่มหลัง `SETUP READY`) |
| พึ่ง | F01 (base schema `001_core.sql`, worker ขั้นต่ำ, `createApp`, `loadFeatures`, `audit`, `publish`, `storage`, `rateLimit`) · F31 `notify` (ใช้ fake ได้ก่อน) |
| ให้ | `jobs.enqueue` / `jobs.get` ตาม contract (`JobsApi`, `EnqueueOptions`, `JobContext`, `JobHandler`, `ScheduleDefinition`) · scheduler ที่ปลอดภัยเมื่อมีหลาย process · หน้า `/ops` (jobs, dead letters, feature flags, demo reset, build info, route catalog) · `/readyz` ที่ตรวจ worker/scheduler · outbox สำหรับ `core.deliver` ที่มีสถานะ `unknown` อย่างซื่อสัตย์ · upload limits · `redactText()` |
| ใช้ | `db`, `publish`, `audit`, `notify` (F31), `resetDemoData()` และ `resetDemo`/`runDemo` ของทุกฟีเจอร์ (F01 §9) |
| โฟลเดอร์ | `server/src/core/` เท่านั้น: `jobs.ts` · `worker.ts` · `scheduler.ts` · `outbox.ts` · `redact.ts` · `upload-limits.ts` · `expected-schedules.ts` · `ops.ts` (routes ของ ops) · `migrations/002_jobs_hardening.sql` · `web/src/core/ops/**` · `shared/core/ops.ts` · `tests/e2e/core-jobs.smoke.spec.ts` · `server/src/core/EVIDENCE.md` |
| Web path | `/ops` (เมนูกลุ่ม `admin` · `platformAdminOnly` · label "งานเบื้องหลัง") · ไม่มีโฟลเดอร์ `features/core` |

อ่าน: `contracts.ts` (ส่วน jobs, `FeatureRoutes`, `RouteOptions.auth: 'platform_admin'`, `requirePlatformAdmin`, `audit`, `NotifyInput`) · [F01-core](F01-core.md) §2 (ตาราง `jobs`, `audit_events`, `feature_flags`), §3 (feature flag + health), §4 (`jobs.ts`, `meta.ts`, `server.ts`), §8, §9.3 · [F31](F31-notifications.md) §5.3 · [COOKBOOK](../COOKBOOK.md) §6 (job handler)

หมายเหตุขอบเขต: F01 ส่ง worker ขั้นต่ำที่ทำงานตาม contract ตั้งแต่ setup แล้ว (claim ด้วย `SKIP LOCKED`, concurrency 4, lease, backoff, dead). F35 **ทำให้ทนทานจริง** (claim token, heartbeat, reap, graceful shutdown, reschedule cap, retention), เขียน scheduler ใหม่ให้ถูกต้องหลาย process, เพิ่ม outbox, และสร้างหน้า `/ops` ไม่เปลี่ยน signature ใด ๆ ใน contract

## 1. เป้าหมายและ user stories

ทำไมมี: ทุกงานที่ช้า ผิดพลาดได้ หรือต้องส่งออกนอกระบบ (ตอบแชต, ส่งข้อความหาลูกค้า, index ความรู้, broadcast, web push) วิ่งผ่านตาราง `jobs` ของ Postgres ใน process เดียวกับเว็บ (D7: Render instance เดียว ไม่มี SQS/Redis) ถ้าชั้นนี้เปราะ golden path พัง เช่น ข้อความหาลูกค้าหาย, ตอบซ้ำสองรอบ, หรือ deploy ระหว่างงานทำให้งานค้าง

ผู้ใช้: ทุก lane (เรียก `jobs.enqueue`, ประกาศ `jobs`/`schedules` ใน `routes.ts`) · **ผู้ดูแลระบบของทีม** (`isPlatformAdmin`, ใช้หน้า `/ops`) · ไม่มีหน้าของร้านค้า

User stories:
1. ฟีเจอร์ enqueue งานแล้ว process ล้ม/deploy กลางงาน → งานถูกทำต่อโดย worker ตัวใหม่ **ครั้งเดียวที่สำเร็จ** (handler idempotent ตามกติกา) และไม่มีงานค้างเป็น `running` ตลอดไป
2. งานที่ล้มเหลวถูกลองใหม่ด้วย backoff แล้วหยุดที่ `dead` เมื่อครบ ผู้ดูแลเห็นที่ `/ops` พร้อมสาเหตุ (ข้อความ redact แล้ว) กด retry หรือ cancel ได้ · เจ้าของร้านได้ in-app notification เมื่องานของร้านตัวเอง dead
3. `enqueue` ซ้ำด้วย `dedupKey` เดิมไม่สร้างงานใหม่ · งานที่มี `lockKey` เดียวกันไม่รันพร้อมกัน (เช่น ทุกอย่างของแชตเดียวกัน)
4. schedule ทุกตัวที่ฟีเจอร์ประกาศ รันครั้งเดียวต่อช่วงเวลา แม้เปิดสอง instance ชั่วคราวตอน deploy
5. ผู้ดูแลสลับซ่อน/แสดงฟีเจอร์ได้จากหน้าเดียว (D6) และกด **Demo reset** ก่อนขึ้นเวทีเพื่อล้างข้อมูลเดโมแล้ว seed ใหม่ตามลำดับที่ปลอดภัย
6. ข้อความที่ส่งออกช่องทางภายนอกแล้ว "ไม่แน่ใจว่าถึงไหม" แสดงเป็น `unknown` ตามจริง ไม่ถูกส่งซ้ำเงียบ ๆ และผู้ดูแลตัดสินได้
7. log ไม่มี secret/ข้อความลูกค้า · upload ถูกจำกัดขนาดและชนิด

นอกขอบเขต: คิวนอก Postgres, cron แบบ cron-expression (ใช้ `everySeconds` เท่านั้น ตาม contract), priority queue, หน้า ops ของร้านค้า, backfill ของ slot ที่พลาด, หลาย web instance (ถ้าเปิดสองตัว worker ปลอดภัยอยู่แล้วเพราะ `SKIP LOCKED` และ scheduler มี lock แต่ rate limit/WS ใน memory ไม่รองรับ จึงไม่ตั้งเป้า)

## 2. Data model

`server/src/core/migrations/002_jobs_hardening.sql` (owner `core`, เพิ่มไฟล์ใหม่เท่านั้น ห้ามแก้ `001_core.sql`):

```sql
-- dependsOn:
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS claim_token uuid;             -- token ของรอบที่ claim; complete/fail/heartbeat ต้องตรง
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS started_at timestamptz;       -- เวลา claim ครั้งล่าสุด
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS reschedules int NOT NULL DEFAULT 0;   -- จำนวนครั้งที่คืน { retryAt }
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS dead_at timestamptz;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS retried_by uuid REFERENCES users(id) ON DELETE SET NULL;  -- ผู้ดูแลที่กด retry ล่าสุด
ALTER TABLE jobs ADD CONSTRAINT jobs_payload_size CHECK (pg_column_size(payload) <= 20000);
CREATE INDEX IF NOT EXISTS jobs_state_type ON jobs (state, type, created_at DESC);
CREATE INDEX IF NOT EXISTS jobs_business_state ON jobs (business_id, state) WHERE business_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS jobs_lock_running ON jobs (lock_key) WHERE state = 'running' AND lock_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS jobs_finished ON jobs (finished_at) WHERE state IN ('succeeded','cancelled','dead');
CREATE INDEX IF NOT EXISTS audit_events_action_time ON audit_events (action, created_at DESC);
CREATE INDEX IF NOT EXISTS messages_delivery_attention ON messages (delivery_state, created_at DESC) WHERE delivery_state IN ('unknown','failed');
```

กฎ: ตารางเดียวกับ F01 §2 (`jobs`: `id, type, payload, business_id, dedup_key UNIQUE, lock_key, state, attempts, max_attempts, run_at, locked_until, locked_by, last_error, progress, result, created_at, updated_at, finished_at`) · ไม่สร้างตาราง outbox แยก: outbox ของแชต = `messages.delivery_*` + job `core.deliver`; ฟีเจอร์อื่นที่ส่งออกนอกระบบ (email F02, web push F31) ใช้ตารางของตัวเองตามแบบใน §5.9 · ค่าคงที่ของ `state`: `queued | running | succeeded | failed | dead | cancelled` (`failed` ใช้เฉพาะแถวที่ผู้ดูแลหยุด retry มือ — worker เองไม่เขียน `failed`: ล้ม = `queued` พร้อม `run_at` ใหม่ หรือ `dead`)

State machine ของ job:

| from | event | to | หมายเหตุ |
|---|---|---|---|
| (ไม่มี) | `enqueue` | queued | `run_at` = `runAt ?? now()` |
| queued | claim (`run_at <= now()`) | running | `attempts + 1`, `claim_token` ใหม่, `locked_until = now() + lease` |
| running | handler สำเร็จ / คืน `{ result }` | succeeded | `finished_at = now()` |
| running | handler คืน `{ retryAt }` | queued | `run_at = retryAt`, `attempts - 1` (ไม่นับ), `reschedules + 1` |
| running | throw (retryable) และ `attempts < max_attempts` | queued | `run_at = now() + 5s × attempts²` |
| running | throw (`retryable:false`) หรือ `attempts >= max_attempts` | dead | `dead_at = now()`, notify เจ้าของ |
| running | lease หมด (process ตาย) และ `attempts < max_attempts` | running (reclaim) | worker อื่น claim ซ้ำ `attempts + 1` |
| running | lease หมด และ `attempts >= max_attempts` | dead | `last_error = 'lease expired, attempts exhausted'` |
| running | SIGTERM ครบเวลา grace (ยังไม่จบ) | queued | คืน lease `attempts - 1` ไม่นับ (ไม่ใช่ความผิดของงาน) |
| queued/failed/dead/cancelled | ops retry | queued | `attempts = 0`, `run_at = now()`, `reschedules = 0`, ล้าง error |
| queued | ops cancel | cancelled | |
| running | ops cancel | cancelled | `claim_token = NULL` → ผลของ handler ที่ยังวิ่งอยู่ถูกทิ้ง, heartbeat รอบถัดไปพบว่าเสียสิทธิ์ แล้ว abort signal |

## 3. API endpoints

ทุก path ใต้ `/api/v1` · สร้างใน `server/src/core/ops.ts` ด้วย `FeatureApi` ตัวเดียวกับฟีเจอร์ (ลงทะเบียนเป็น featureId `F35` ผ่าน `core/ops-routes.ts` ที่ `loadFeatures` เรียกเอง เพราะไม่มีโฟลเดอร์ feature) · ทั้งหมด auth `platform_admin` (`requirePlatformAdmin`) · ผู้ใช้ทั่วไป/owner → `PERMISSION_DENIED` 403 · ไม่ล็อกอิน → `UNAUTHENTICATED`

| Method | Path | Request | Response | Errors |
|---|---|---|---|---|
| GET | `/ops/summary` | — | `OpsSummary` | — |
| GET | `/ops/jobs` | `JobsQuery` | `Page<OpsJobRow>` | VALIDATION_ERROR |
| GET | `/ops/jobs/:id` | — | `OpsJobDetail` | NOT_FOUND |
| POST | `/ops/jobs/:id/retry` | — | `OpsJobRow` | NOT_FOUND, POLICY_BLOCKED (`details.reason='job_running'` เมื่อ state = running หรือ succeeded) |
| POST | `/ops/jobs/:id/cancel` | — | `OpsJobRow` | NOT_FOUND, POLICY_BLOCKED (`job_finished` เมื่อ succeeded/dead/cancelled) |
| POST | `/ops/jobs/retry-dead` | `RetryDeadBody` | `{ retried: number }` | VALIDATION_ERROR |
| GET | `/ops/schedules` | — | `{ items: OpsScheduleRow[] }` | — |
| GET | `/ops/deliveries` | `DeliveriesQuery` | `Page<OpsDeliveryRow>` | VALIDATION_ERROR |
| POST | `/ops/deliveries/:messageId/resolve` | `ResolveDeliveryBody` | `OpsDeliveryRow` | NOT_FOUND, POLICY_BLOCKED (`not_unknown`) |
| GET | `/ops/features` | — | `{ production: boolean; items: OpsFeatureRow[] }` | — |
| POST | `/ops/features/bulk` | `BulkFlagsBody` | `{ items: FeatureFlagView[] }` | VALIDATION_ERROR |
| GET | `/ops/build` | — | `OpsBuild` | — |
| GET | `/ops/routes` | `RoutesQuery` | `{ items: OpsRouteRow[] }` | — |
| GET | `/ops/audit` | `AuditQuery` | `Page<OpsAuditRow>` | VALIDATION_ERROR |
| POST | `/ops/demo/reset` | `DemoResetBody` | `DemoResetResult` | POLICY_BLOCKED (`demo_reset_disabled` \| `reset_in_progress`), RATE_LIMITED |

(การสลับฟีเจอร์รายตัว `PUT /ops/features/:featureId` และ `GET /features` เป็นของ F01 §3 อยู่แล้ว หน้า `/ops` เรียกสองตัวนั้นโดยตรง `bulk` เป็นทางลัดสำหรับเวลา 15:30)

```ts
// shared/core/ops.ts  (re-export ใน shared/core/index.ts)
import { z } from 'zod';
export const JOB_STATES = ['queued', 'running', 'succeeded', 'failed', 'dead', 'cancelled'] as const;

export const JobsQuery = z.object({
  state: z.enum(JOB_STATES).optional(),
  type: z.string().max(80).optional(),            // exact
  businessId: z.string().uuid().optional(),
  q: z.string().max(80).optional(),               // ค้น type ILIKE และ last_error ILIKE
  cursor: z.string().max(200).optional(),         // base64url(JSON {createdAt,id})
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export const RetryDeadBody = z.object({
  type: z.string().max(80).optional(),
  businessId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(100).default(50),
}).strict();
export const DeliveriesQuery = z.object({
  state: z.enum(['unknown', 'failed']).default('unknown'),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export const ResolveDeliveryBody = z.object({
  resolution: z.enum(['sent', 'failed', 'resend']),
  note: z.string().max(200).optional(),
}).strict();
export const BulkFlagsBody = z.object({
  hide: z.array(z.string().regex(/^F\d{2}$/)).max(40).default([]),
  show: z.array(z.string().regex(/^F\d{2}$/)).max(40).default([]),
  reason: z.string().max(200).optional(),
}).strict().refine(b => !b.hide.some(id => b.show.includes(id)), { message: 'hide and show overlap' });
export const RoutesQuery = z.object({ featureId: z.string().optional(), q: z.string().max(80).optional() });
export const AuditQuery = z.object({
  action: z.string().max(80).optional(),
  businessId: z.string().uuid().optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export const DemoResetBody = z.object({ confirm: z.literal('RESET DEMO') }).strict();

export interface OpsJobRow {
  id: string; type: string; state: typeof JOB_STATES[number]; businessId: string | null;
  attempts: number; maxAttempts: number; runAt: string; startedAt: string | null; finishedAt: string | null;
  lockKey: string | null; dedupKey: string | null; lastError: string | null; progress: { done: number; total: number } | null;
  reschedules: number; createdAt: string;
}
export interface OpsJobDetail extends OpsJobRow {
  payloadView: Record<string, unknown>;     // ผ่าน redactObject() และตัดแต่ละค่า ≤ 300 ตัวอักษร
  result: Record<string, unknown> | null;   // ผ่าน redactObject()
  lockedBy: string | null; lockedUntil: string | null; retriedBy: string | null;
}
export interface OpsSummary {
  now: string;
  counts: Record<typeof JOB_STATES[number], number>;
  oldestQueuedAgeSeconds: number | null;     // queued ที่ run_at <= now
  dead24h: number;
  byType24h: { type: string; succeeded: number; dead: number; avgMs: number | null }[];
  worker: { enabled: boolean; running: boolean; inFlight: number; concurrency: number; lastPollAt: string | null; instanceId: string };
  scheduler: { enabled: boolean; holdsLock: boolean; lastTickAt: string | null };
  deliveriesNeedingAttention: number;        // messages.delivery_state = 'unknown' ใน 7 วัน
}
export interface OpsScheduleRow {
  name: string; everySeconds: number; ownerFeature: string; source: 'registered' | 'expected_missing';
  status: 'declared' | 'planned';            // จาก expected-schedules.ts
  lastSlot: string | null; lastState: string | null; lastFinishedAt: string | null; lastError: string | null;
}
export interface OpsDeliveryRow {
  messageId: string; conversationId: string; businessId: string; channel: string;
  deliveryState: 'unknown' | 'failed'; deliveryError: string | null; createdAt: string;   // ไม่มีเนื้อหาข้อความ
}
export interface OpsFeatureRow extends FeatureFlagView { tierOpen: boolean; routeCount: number; }  // FeatureFlagView จาก F01
export interface OpsBuild {
  sha: string; shortSha: string; env: string; schema: string; node: string; uptimeSeconds: number; startedAt: string;
  modelMode: 'openai' | 'fake'; providerModes: Record<string, string>; featuresLoaded: number;
  db: { ok: boolean; latencyMs: number; poolTotal: number; poolIdle: number; poolWaiting: number };
  memoryMb: { rss: number; heapUsed: number };
  uploadDirWritable: boolean; demoResetEnabled: boolean; devLoginEnabled: boolean; mcpEnabled: boolean;
}
export interface OpsRouteRow { method: string; path: string; featureId: string; auth: string; permission: string | null; summary: string | null; placeholder: boolean }
export interface OpsAuditRow { id: string; action: string; actorUserId: string | null; businessId: string | null; targetType: string | null; targetId: string | null; details: Record<string, unknown>; createdAt: string }
export interface DemoResetResult { ok: true; startedAt: string; durationMs: number; steps: { name: string; ok: boolean; ms: number; error?: string }[] }
```

`OpsBuild` ห้ามมี secret (ไม่ส่งค่า env ใด ๆ นอกจาก mode/ชื่อ) · `/build-info` สาธารณะของ F01 ยังคงเดิม

## 4. Service functions และ contracts

ไฟล์ภายใน (ห้ามฟีเจอร์อื่น import ตรง ใช้ผ่าน `server/src/core/index.ts` เท่านั้น):

| ไฟล์ | หน้าที่ |
|---|---|
| `jobs.ts` | `jobs` (`JobsApi`), `registerJobHandlers(map)`, `enqueueInternal`, `getJobStats()`, `retryJob`, `cancelJob`, `retryDead` |
| `worker.ts` | `startWorker()`, `stopWorker(graceMs?)`, `drainJobs()` (test), `workerState()` |
| `scheduler.ts` | `startScheduler()`, `stopScheduler()`, `registerSchedules(list)`, `schedulerState()`, `tickOnce(now?)` (test) |
| `outbox.ts` | `markInflight`, `resolveAmbiguous`, `classifySendError` (§5.9) ใช้ใน `core.deliver` |
| `redact.ts` | `redactText(s)`, `redactObject(o)` |
| `upload-limits.ts` | `UPLOAD_LIMITS`, `assertUploadAllowed(input)`, `sniffMime(bytes)` |
| `expected-schedules.ts` | `EXPECTED_SCHEDULES` (§8) |
| `ops.ts` | routes ของ §3 + `runDemoReset(actor)` |

### Contract ที่ต้องตรงตาม `contracts.ts` ทุกตัวอักษร

```ts
export interface EnqueueOptions { dedupKey?: string; businessId?: string; runAt?: string; maxAttempts?: number; lockKey?: string }
export interface JobContext<P> { id: string; type: string; payload: P; businessId: string | null; attempt: number; maxAttempts: number; signal: AbortSignal; progress(done: number, total: number): Promise<void> }
export type JobHandler<P = any> = (job: JobContext<P>) => Promise<void | { retryAt: string } | { result: Record<string, unknown> }>;
export interface JobsApi {
  enqueue<P extends Record<string, unknown>>(type: string, payload: P, opts?: EnqueueOptions): Promise<{ jobId: string; deduped: boolean }>;
  get(jobId: string): Promise<{ id: string; type: string; state: JobState; attempts: number; lastError: string | null; progress: { done: number; total: number } | null } | null>;
}
export interface ScheduleDefinition { name: string; everySeconds: number; handler: JobHandler<{ slot: string }> }
```

### Contract additions

```ts
// server/src/core/index.ts เพิ่ม export (additive; ไม่เปลี่ยน signature เดิม)
/** @owner F35 core/jobs · C1 · consumers: tests ของทุก lane, F36 smoke.
 *  Runs the worker in-process until no job is runnable (state queued with run_at <= now, or reclaimable), or `maxMs` (default 20000) passes.
 *  Only for NODE_ENV=test / MODEL_MODE=fake test helpers; throws AppError('POLICY_BLOCKED') in production. */
export declare function drainJobs(opts?: { type?: string; maxMs?: number }): Promise<{ ran: number; dead: number }>;
/** @owner F35 · C1 · consumers: F31 (job dead → notify) and any feature that must redact text before it is stored in last_error, log or audit.
 *  Removes bearer tokens, API keys (sk-…), JWTs, connection strings, long base64/hex, `key=value` secrets, Thai phone numbers and e-mail addresses. Never throws. */
export declare function redactText(input: string, maxLen?: number): string;
export declare function redactObject<T>(input: T, opts?: { maxStringLen?: number }): T;
/** @owner F35 · C1 · consumer: storage.save (core) and every upload route. Throws VALIDATION_ERROR (details.reason 'too_large' | 'mime_not_allowed' | 'mime_mismatch'). */
export declare function assertUploadAllowed(input: { purpose: string; mimeType: string; size: number; bytes?: Uint8Array }): { mimeType: string };
/** Sender error class (channels.ts) that tells core.deliver whether the provider may have received the request. */
export declare class ChannelSendError extends Error { constructor(message: string, opts: { code: string; definitelyNotSent: boolean; retryable: boolean; providerStatus?: number }); }
```

(`drainJobs` เดิมอยู่ใน `test-utils.ts` ของ F01 แล้ว F35 ย้ายตัวจริงมาไว้ที่ `worker.ts` และให้ `test-utils` re-export) · `ChannelSendError` เป็นของ core เพราะ C2 (F17/F18) throw ใน sender ของตัวเอง: หัวหน้า merge ลง `contracts.ts` แล้วแจ้ง C2 ตอน `DONE F35`

## 5. Algorithms

ค่าคงที่ (env ชื่อเดิมใน `.env.example`; ค่าที่ไม่มี env คือ const ใน `server/src/core/jobs-config.ts`):

| ค่า | ค่า | ที่มา / ปรับได้ |
|---|---|---|
| `JOBS_CONCURRENCY` | 4 | const (F01) |
| `JOBS_LEASE_SECONDS` | 60 | env (contract: lease 60 วินาที) |
| `JOBS_HEARTBEAT_SECONDS` | `lease / 3` = 20 | derive |
| `JOBS_POLL_MS` | 1000 (idle) · ไม่มี sleep เมื่อเพิ่ง claim ได้ | env |
| `JOBS_MAX_ATTEMPTS` | 5 | env (default ของ `maxAttempts`) |
| `JOBS_MAX_RESCHEDULES` | 500 | const (กัน `{ retryAt }` วนไม่จบ) |
| `JOBS_BACKOFF` | `5 s × attempt²` → 5, 20, 45, 80 วินาที | contract |
| `JOBS_SHUTDOWN_GRACE_MS` | 20000 | const (Render ส่ง SIGTERM แล้วรอก่อน SIGKILL: ค่า 30 วินาทีเป็นค่าเริ่มต้นที่เรา **ไม่ยืนยัน** ดู §15) |
| `JOBS_HANDLER_SOFT_TIMEOUT_MS` | 120000 | const (หลังเวลานี้ abort `signal` + หยุด heartbeat) |
| `JOBS_PAYLOAD_MAX_BYTES` | 16384 | const (CHECK ใน DB = 20000 ตัวเผื่อ jsonb) |
| `JOBS_RETAIN_DAYS` | succeeded/cancelled 7 วัน · dead 30 วัน | const |
| `SCHEDULER_TICK_MS` | 10000 | const |
| `SCHEDULER_LOCK_RETRY_MS` | 30000 | const (ตาม F01) |
| `instanceId` | `<hostname>:<pid>:<boot random 6 ตัว>` | เก็บใน `locked_by` |

### 5.1 `jobs.enqueue(type, payload, opts)`

1. ตรวจ: `type` ตรง `/^[a-z][a-z0-9_.-]{1,79}$/`; `payload` เป็น plain object และ `Buffer.byteLength(JSON.stringify(payload)) ≤ 16384` ไม่งั้น `VALIDATION_ERROR`; `maxAttempts` ใน 1–20 (default `JOBS_MAX_ATTEMPTS`); `runAt` ต้อง parse เป็นเวลาได้ ไม่งั้น `VALIDATION_ERROR`; `lockKey` ≤ 200 ตัวอักษร
2. เฝ้า secret: key ของ payload (ทุกระดับ) ที่ตรง `/token|secret|password|authorization|api[_-]?key|cookie/i` → `log.warn({ type, key })` และ **ใน `NODE_ENV=test` throw `VALIDATION_ERROR`** (ให้ test ของ lane จับได้ ไม่ปิดงานบน production) · **ยกเว้น key ชื่อ `replyToken` ตรงตัว** (ไม่ warn ไม่ throw): job `line.event` ของ F17 ส่ง event ดิบของ LINE ทั้งก้อน ซึ่งมี `replyToken` อายุสั้นใช้ครั้งเดียวอยู่ข้างใน ถ้าไม่ยกเว้น test webhook ของ C2 จะแดงทันทีที่ F35 S1 merge · `reviewToken` ของ F13 ไม่ควรอยู่ใน payload อยู่แล้ว (payload มี id เท่านั้น)
3. `INSERT INTO jobs (type, payload, business_id, dedup_key, lock_key, max_attempts, run_at) VALUES (...) ON CONFLICT (dedup_key) DO NOTHING RETURNING id`
4. ได้แถว → `wake()` (ปลุก loop ใน process ทันทีถ้า `run_at <= now`) → `{ jobId, deduped: false }` · ไม่ได้แถว (ชน dedup) → `SELECT id FROM jobs WHERE dedup_key = $1` → `{ jobId, deduped: true }` (คืน id ของแถวเดิมไม่ว่า state ใด รวมถึง dead: **dedupKey ที่ dead แล้วไม่สร้างงานใหม่**; การลองใหม่ของงาน dead ทำผ่าน ops retry เท่านั้น)
5. `publish(businessId, { type:'job.updated', jobId, jobType, state:'queued' })` เมื่อมี `businessId` (ไม่ throw)
6. ไม่มี `dedupKey` → แถวใหม่เสมอ · `enqueue` ไม่รับ transaction: ผู้เรียกที่ต้องการ "บันทึกแล้วค่อยส่ง" ให้ commit ข้อมูลก่อนแล้วเรียก `enqueue` (ถ้า process ตายระหว่างสองขั้น งานหาย: ใช้ §5.9 หรือให้ schedule scan กู้ เช่น F38) · งานที่ enqueue ใน transaction ของ DB เดียวกันทำได้ด้วย `db.tx` + INSERT ตรง (ไม่แนะนำ ไม่ต้องใช้ในวันงาน)

### 5.2 Claim, lease, heartbeat (worker loop)

Loop ต่อ process (`worker.ts`), เริ่มหลัง `listen`:

```
while (running):
  reap()                                   -- ข้อ 1
  free = JOBS_CONCURRENCY - inFlight
  claimed = 0
  for i in 1..free:  job = claimOne();  if (!job) break;  start(job) (ไม่ await);  claimed++
  if claimed == 0: await sleepOrWake(JOBS_POLL_MS)   -- wake() ปลุกก่อนได้
```

1. **reap** (ทุกรอบ, ชั้นเดียวด้วย SQL ตัวเดียว): `UPDATE jobs SET state='dead', dead_at=now(), finished_at=now(), claim_token=NULL, locked_until=NULL, last_error='lease expired, attempts exhausted' WHERE state='running' AND locked_until < now() AND attempts >= max_attempts RETURNING id, type, business_id` แล้วทำ `onDead` (§5.7) ต่อแถว
2. **claimOne** (ทางเดียวที่ทำให้เป็น `running`):

```sql
UPDATE jobs SET state = 'running', attempts = attempts + 1, claim_token = gen_random_uuid(),
       locked_by = $1, started_at = now(), updated_at = now(),
       locked_until = now() + make_interval(secs => $2)
WHERE id = (
  SELECT j.id FROM jobs j
  WHERE ( (j.state = 'queued' AND j.run_at <= now())
       OR (j.state = 'running' AND j.locked_until < now() AND j.attempts < j.max_attempts) )
    AND ( j.lock_key IS NULL OR NOT EXISTS (
            SELECT 1 FROM jobs r WHERE r.lock_key = j.lock_key AND r.id <> j.id
              AND r.state = 'running' AND r.locked_until >= now()) )
    AND (j.type = ANY($3) OR $3 IS NULL)          -- $3 = ชนิดที่มี handler ใน process นี้ (ถ้ามี handler ไม่ครบให้ดู ข้อ 6)
  ORDER BY j.run_at, j.created_at
  LIMIT 1
  FOR UPDATE SKIP LOCKED
) RETURNING *;
```

   $1 = `instanceId`, $2 = `JOBS_LEASE_SECONDS` · ไม่มี `ORDER BY` อื่นเพราะ `run_at` ตรงกับความเร่งด่วนอยู่แล้ว
3. **lockKey (ชั้นที่สอง):** หลัง claim ถ้า `lock_key` ไม่ว่าง ให้ขอ **session advisory lock แบบไม่รอ** บน connection เฉพาะของ job นั้น: `SELECT pg_try_advisory_lock(hashtext($lockKey))` (ใช้ `hashtext` ตัวเดียวกับ `db.withAdvisoryLock` ของ F01 เพื่อให้โค้ดอื่นที่เรียก `withAdvisoryLock(sameKey)` ชนกันจริง) · ได้ → ถือไว้จนจบ handler แล้ว `pg_advisory_unlock` ใน `finally` และ `client.release()` · ไม่ได้ (มี process อื่นถืออยู่) → คืนงาน: `UPDATE jobs SET state='queued', attempts=attempts-1, claim_token=NULL, locked_until=NULL, run_at = now() + interval '2 seconds' WHERE id=$1 AND claim_token=$2` แล้วไปงานถัดไป (ไม่นับ attempt) · **ผลต่อ handler: worker ถือ lock ของ `lockKey` แทนแล้ว handler ห้ามเรียก `db.withAdvisoryLock(lockKey เดียวกัน)` อีก** (คนละ connection → ติดตายถึงหมดเวลา) · ข้อควรรู้: connection ที่ถือ advisory lock นับรวมใน pool (`DB_POOL_MAX` default 5, concurrency 4): ตั้ง `DB_POOL_MAX ≥ JOBS_CONCURRENCY + 4` บน production (Render `DB_POOL_MAX=12`; จดใน `render.yaml` ของ F01 S9)
4. **start(job)**: สร้าง `AbortController`; `ctx = { id, type, payload, businessId, attempt: attempts, maxAttempts, signal, progress }` · `progress(done,total)` = `UPDATE jobs SET progress = $json, updated_at = now() WHERE id=$1 AND claim_token=$2` (token ไม่ตรง → throw `AbortError` ให้ handler หยุด) + `publish job.updated` เมื่อมี `businessId` (จำกัด 1 ครั้ง/วินาที/job ในโค้ด) · `publish job.updated state:'running'` ตอนเริ่ม
5. **heartbeat** ทุก 20 วินาที ต่อ job: `UPDATE jobs SET locked_until = now() + lease WHERE id=$1 AND claim_token=$2 AND state='running'` · `rowCount = 0` (ถูก cancel, ถูก reclaim, หรือ ops retry) → `abortController.abort()` และหยุด heartbeat · ครบ `JOBS_HANDLER_SOFT_TIMEOUT_MS` → abort + หยุด heartbeat (lease หมดแล้วงานถูก reclaim ได้ — handler เก่าที่ยังวิ่งอยู่ไม่มีสิทธิ์เขียนผลเพราะ token เปลี่ยน แต่ side effect ที่ทำไปแล้วต้อง idempotent ตามกติกา at-least-once)
6. handler ไม่ได้ลงทะเบียน (type ไม่มีใน registry ของ process): ถ้า `NODE_ENV=production` หรือ type ไม่ขึ้นต้น `test.` → `dead` ทันที `last_error='no handler for type'` (ไม่ต้องรอ retry) · ไม่ใช้ `$3` กรองจริง (ส่ง `NULL`) เพื่อให้เห็นงานกำพร้าใน `/ops` เร็ว
7. **finish** ทุกการเขียนผลมีเงื่อนไข `WHERE id=$1 AND claim_token=$2 AND state='running'` (ไม่ตรง = worker นี้เสียสิทธิ์ ทิ้งผลเงียบ ๆ log `debug`):
   - สำเร็จ (`void` หรือ `{ result }`): `state='succeeded', result=$r (redactObject, ≤ 8 KB), finished_at=now(), claim_token=NULL, locked_until=NULL, last_error=NULL`
   - `{ retryAt }`: ตรวจ `reschedules + 1 > JOBS_MAX_RESCHEDULES` → dead `'too many reschedules'` · มิฉะนั้น `state='queued', run_at=GREATEST($retryAt, now() + interval '1 second'), attempts=attempts-1, reschedules=reschedules+1`
   - throw: ดู §5.3
8. ทุกการเปลี่ยน state → `publish job.updated` (มี `businessId`) · ไม่ throw

### 5.3 Retry, dead, ข้อผิดพลาด

1. `err = toAppError(thrown)`; `retryable = err.retryable !== false` (error ที่ไม่ใช่ `AppError` = retryable) · `AbortError` ขณะ `shuttingDown` → ไม่ใช่ความล้มเหลว (ดู §5.5) · `AbortError` จาก soft timeout → นับเป็นความล้มเหลว `last_error='handler timeout'`
2. `last_error = redactText(code + ': ' + message, 500)` (ไม่เก็บ stack ใน DB; stack ลง log ระดับ error ผ่าน pino redact)
3. `retryable && attempts < max_attempts` → `state='queued', run_at = now() + (5 * attempts^2) seconds` · ไม่มี jitter (ผู้ใช้มีไม่กี่ราย)
4. ไม่งั้น → `state='dead', dead_at=now(), finished_at=now()` แล้ว `onDead(job)` (§5.7)
5. ตัวอย่าง `maxAttempts=5`: ล้มครั้งที่ 1→รอ 5 วิ, 2→20, 3→45, 4→80, ครั้งที่ 5 ล้ม = dead (รวมรอ ~2.5 นาที)
6. `PROVIDER_BUDGET_EXHAUSTED` / `RATE_LIMITED` ที่ handler โยน: ปฏิบัติเหมือน error ปกติ (ฟีเจอร์ที่ต้องการรอนานกว่านี้ให้คืน `{ retryAt }` เอง)

### 5.4 Crash recovery (commit แล้วตาย)

กรณีต้องผ่าน test: handler เขียน DB สำเร็จและ commit แต่ process ตายก่อน `finish`:
1. แถวค้าง `running` ที่ `locked_until` ผ่านไปแล้ว (ไม่มี heartbeat) → รอบ claim ถัดไปของ worker ใดก็ตามหยิบซ้ำ (เงื่อนไข `state='running' AND locked_until < now() AND attempts < max_attempts`) `attempts + 1` และ `claim_token` ใหม่
2. handler รันซ้ำจึง **ต้อง idempotent**: ใช้ unique key / `clientRequestId` / ตรวจ state ก่อนทำ (กติกาใน contract; ตัวอย่างใน F38 `sendToCustomer` ที่มี `clientRequestId`)
3. ถ้ารอบนั้นเป็นรอบสุดท้าย (`attempts >= max_attempts`) → `reap` ให้ dead แทน (เห็นใน ops พร้อมข้อความ `lease expired, attempts exhausted`) ไม่รันซ้ำเงียบ ๆ
4. เวลากู้ที่คาดหวัง: `locked_until` + ไม่เกิน `JOBS_POLL_MS` ≈ 61 วินาทีหลัง process ตาย (กรณี Render deploy ปกติ งานได้คืน lease ทันทีตาม §5.5 จึงไม่ต้องรอ)

### 5.5 Graceful shutdown (Render deploy = SIGTERM)

Render deploy แบบ zero-downtime: instance ใหม่ขึ้นและผ่าน health check ก่อน แล้วส่ง SIGTERM ให้ instance เก่า → มีช่วง ~วินาทีถึงสิบวินาทีที่สอง process ทำงานพร้อมกัน (worker ปลอดภัยด้วย `SKIP LOCKED`; scheduler ปลอดภัยด้วย advisory lock §5.6)

`server.ts` ผูก `process.on('SIGTERM'|'SIGINT')` → `shutdown()` ครั้งเดียว (ซ้ำ = ข้าม):
1. `scheduler.stop()` (หยุด tick, `pg_advisory_unlock`, release client) · `/readyz` เริ่มตอบ 503 `{ status:'draining' }` (กัน proxy ส่ง request ใหม่) · `httpServer.close()` หยุดรับ connection ใหม่ (ปิด WS ด้วยรหัส 1001)
2. `worker.stopClaiming()` · รอ in-flight จนครบ `JOBS_SHUTDOWN_GRACE_MS` (20 วินาที) ถ้าจบเองก็บันทึกผลตามปกติ
3. ครบเวลาแล้วยังเหลือ: `abortController.abort()` ทุกตัว (ตั้ง flag `shuttingDown`) แล้วรอ 2 วินาทีให้ handler ที่เคารพ `signal` ออก
4. job ที่ยังเหลือ (หรือ handler โยน `AbortError` ตอน `shuttingDown`): คืนสิทธิ์ทันที `UPDATE jobs SET state='queued', attempts=attempts-1, claim_token=NULL, locked_until=NULL, locked_by=NULL, run_at=now() WHERE id=ANY($ids) AND claim_token = ANY($tokens)` → instance ใหม่หยิบทำต่อโดยไม่ต้องรอ lease และไม่นับ attempt
5. `pool.end()` (timeout 3 วินาที) แล้ว `process.exit(0)` · รวมไม่เกิน ~26 วินาที (ยังต่ำกว่า 30 วินาทีที่ Render ให้โดยปกติ: UNCONFIRMED)
6. handler ที่ทำงานนานเกิน grace ควรเช็ก `job.signal.aborted` ระหว่างลูป (ตัวอย่าง F23 ส่งทีละแบตช์ แต่ละแบตช์สั้น)

### 5.6 Scheduler (instance เดียว, slot-based dedup)

`startScheduler()` (เมื่อ `RUN_SCHEDULER=1`):
1. `registerSchedules(list)` รวมจาก `loadFeatures()` + schedule ของ core (`core.sessions.purge`, `core.jobs.purge`) · ชื่อซ้ำ → boot fail ระบุสองฟีเจอร์ · ตรวจ `everySeconds` เป็นจำนวนเต็ม 10–604800 (น้อยกว่า 10 = boot fail) · ชื่อ schedule ต้องเป็น job type ที่มี handler (loader ลงทะเบียน handler ให้ชื่อเดียวกัน)
2. **lock:** เปิด connection เฉพาะ (`pool.connect()` เก็บไว้ ไม่คืน pool) แล้ว `SELECT pg_try_advisory_lock(hashtext('nless.scheduler'))` · `false` → log info `scheduler: lock held by another instance` `holdsLock=false` แล้วลองใหม่ทุก 30 วินาที (`SCHEDULER_LOCK_RETRY_MS`) · `true` → `holdsLock=true` log info
3. **tick** ทุก 10 วินาที (เมื่อถือ lock): ก่อนทำงานเช็ก connection ของ lock ยังอยู่ด้วย `SELECT 1` บน client นั้น · error → ปล่อย client (destroy), `holdsLock=false`, กลับไปข้อ 2 (กัน split-brain ตอน connection ถูกตัด: lock ของ session ที่ตายหายเองใน Postgres)
4. ต่อ schedule: `slotMs = everySeconds × 1000`; `slotStart = floor(Date.now() / slotMs) × slotMs`; `slot = new Date(slotStart).toISOString()`
5. ข้ามถ้ามี job ชนิดเดียวกัน `state IN ('queued','running')` อยู่แล้ว (กันงานกองเมื่อ handler ช้ากว่า interval) log debug `schedule overlap skipped`
6. `jobs.enqueue(name, { slot }, { dedupKey: \`${name}@${slot}\`, lockKey: \`schedule:${name}\`, maxAttempts: 3 })` — `dedupKey` ทำให้ slot เดียวกันเกิดได้ครั้งเดียวแม้ restart หรือมีสอง instance (unique ใน DB เป็นเกราะชั้นสุดท้าย) · ไม่ backfill slot ที่พลาด (process หยุดนาน = รัน slot ปัจจุบันครั้งเดียว) · ไม่มี `businessId` (schedule ทำงานข้ามร้านเอง: handler วนร้านที่เปิดฟีเจอร์ และข้ามร้านที่ไม่ active)
7. หลัง enqueue `wake()` worker · `lastTickAt` เก็บไว้ให้ `/ops` และ `/readyz`
8. schedule `everySeconds < 10` ไม่รองรับ (voice.sweep = 30 ผ่าน) · เวลาของ slot ใช้นาฬิกาของ process (Render UTC) ไม่ใช่ DB: ถ้า clock เลื่อนไปมา dedupKey ยังกันซ้ำได้
9. SIGTERM: หยุด tick แล้ว `pg_advisory_unlock` + release (instance ใหม่ได้ lock ภายใน ≤ 30 วินาที) · test ใช้ `tickOnce(now)` ที่รับเวลาปลอม และ lock ผ่าน connection ทดสอบ

### 5.7 งานที่ dead: log, audit, notify

`onDead(job)` (ไม่ throw ไม่ว่ากรณีใด; error ภายในแค่ log):
1. `log.error({ jobId, type, attempts, lastError })` (lastError ผ่าน `redactText` แล้ว)
2. `audit({ action:'core.job.dead', actorUserId:null, businessId, targetType:'job', targetId:jobId, details:{ type, attempts } })`
3. `publish(businessId, job.updated state:'dead')` เมื่อมี `businessId`
4. มี `businessId` และ `rateLimit({ key:\`job-dead-notify:${businessId}\`, limit:5, windowSeconds:600 }).allowed` → `notify({ businessId, to:{ role:'owners' }, type:'system', title:'งานเบื้องหลังล้มเหลว', body:\`ชนิดงาน: ${type}\`, link: undefined, dedupKey:\`job:${jobId}:dead\` })` ตาม [F31 §5.3](F31-notifications.md) (ไม่ใส่ payload/ข้อความลูกค้า) · เรียกผ่าน `await import('../features/notifications/service.js')` ภายใน try/catch (core ห้าม import ฟีเจอร์แบบ static) · ไม่มี `businessId` → ไม่ notify (ผู้ดูแลดูที่ `/ops`; จำนวน dead ขึ้นบน badge ของเมนู)

### 5.8 Retention (schedule `core.jobs.purge` ทุก 3600 วินาที)

`DELETE FROM jobs WHERE (state IN ('succeeded','cancelled') AND finished_at < now() - interval '7 days') OR (state='dead' AND finished_at < now() - interval '30 days')` (LIMIT ด้วย CTE 5,000 แถว/รอบ) · คืนจำนวนใน `result` · เหตุผลที่ลบได้: `dedupKey` ของ slot/คำขอเก่าไม่มีใครใช้ซ้ำหลัง 7 วัน · งาน `queued`/`running` ไม่ถูกลบ · `core.sessions.purge` (F01) ทำงานคู่กัน · ตาราง `audit_events` ไม่ลบ

### 5.9 Outbox สำหรับการส่งออกนอกระบบ และสถานะ `unknown`

หลักการ: **บันทึกก่อน ส่งทีหลัง และซื่อสัตย์เมื่อไม่แน่ใจ** ไม่อ้าง exactly-once

แบบมาตรฐาน (ทุกฟีเจอร์ที่ส่งออกนอกระบบ ใช้ตารางของตัวเอง; ข้อความแชตใช้ `messages.delivery_*`):
1. ขั้น A (transaction): บันทึกเจตนาส่งเป็นแถว `pending` (เช่น `saveMessage` outbound → `delivery_state='pending'`) แล้ว commit
2. ขั้น B: `jobs.enqueue('<type>', { rowId }, { dedupKey:'<type>:<rowId>', lockKey })` (ชื่อ dedup ตายตัวต่อแถว)
3. ขั้น C (handler): ตรวจแถวยัง `pending` → **ตั้ง checkpoint ก่อนยิง** → เรียก provider → บันทึกผล

`core.deliver` (`channels.ts`, payload `{ messageId }`, dedupKey `deliver:<messageId>` (ตรงกับ `sendToCustomer` ใน `contracts.ts`), lockKey `conversation:<conversationId>`, `maxAttempts` 5) ที่ F35 ทำให้ครบ:

| ขั้น | ทำ |
|---|---|
| 1 | โหลดแถว ถ้า `delivery_state <> 'pending'` → จบ (idempotent) |
| 2 | **checkpoint:** `UPDATE messages SET delivery_error = 'inflight:<attempt>' WHERE id=$1 AND delivery_state='pending' AND (delivery_error IS NULL OR delivery_error LIKE 'retry:%') RETURNING id` ไม่ได้แถว (พบ `inflight:*` อยู่แล้ว = รอบก่อนอาจส่งไปแล้วก่อนตาย) → ตั้ง `delivery_state='unknown', delivery_error='interrupted: previous attempt may have been sent'` แล้วจบ (**ไม่ส่งซ้ำ**) |
| 3 | เรียก sender ของช่อง (`web` real; `line`/`facebook`/`instagram` ตาม C2) ภายใน timeout 15 วินาที |
| 4 | **อ่านผลที่ sender คืน (`DeliveryResult` ใน `contracts.ts`) ก่อน:** `state:'sent'` → `delivery_state='sent', delivery_external_ref=<externalRef หรือ simulatedRef>, delivery_error=NULL` + `publish message.updated` · `state:'failed'` + `retryable:true` → ทำแบบขั้น 5 · `state:'failed'` (ไม่ retryable) → ขั้น 6 · `state:'unknown'` → ขั้น 7 · sender ของ C2 (F17/F18) **คืนค่าเสมอ ไม่ throw** จึงห้ามตีความ "ไม่ throw" ว่าส่งสำเร็จ |
| 5 | sender คืน `failed` + `retryable`, หรือโยน `ChannelSendError` ที่ `definitelyNotSent && retryable` (DNS, ECONNREFUSED, 429 ก่อนรับ, 5xx ที่ provider ยืนยันว่าไม่ประมวลผล) → `delivery_error='retry:<code>'` แล้ว throw (backoff ปกติ) ; ครบ attempt → `delivery_state='failed'` |
| 6 | sender คืน `failed` ที่ไม่ retryable, หรือ `definitelyNotSent && !retryable` (4xx เช่น token ผิด, user block, ข้อความเกินกำหนด) → `delivery_state='failed', delivery_error=<code>` ไม่ retry |
| 7 | sender คืน `unknown`, หรืออื่น ๆ ที่ไม่แน่ใจ (timeout หลังเขียน request, ปิด connection กลางทาง, 5xx ที่ไม่ยืนยัน, error ที่ไม่ใช่ `ChannelSendError`) → `delivery_state='unknown', delivery_error=<code>` **ไม่ retry** + `audit core.delivery.unknown` |
| 8 | ทุก transition `publish message.updated` (UI inbox ห้ามโชว์ "ส่งแล้ว" ก่อน `sent`) |

`unknown` ไม่ใช่ความล้มเหลวที่ซ่อนได้: `/ops` นับและแสดงรายการ (§7), `OpsSummary.deliveriesNeedingAttention`, ผู้ดูแลเปิดดูในช่อง LINE/Meta แล้วกด `resolve`:
- `sent` → `delivery_state='sent'` (note ลง audit) · `failed` → `delivery_state='failed'` · `resend` → ตั้ง `delivery_state='pending', delivery_error=NULL` แล้ว `enqueue('core.deliver', { messageId }, { dedupKey:'deliver:<id>:resend-<n>', lockKey })` (n = จำนวน audit `core.delivery.resolve` ของแถวนั้น + 1) · audit `core.delivery.resolve` ทุกครั้ง (details: resolution, note; ไม่มีเนื้อหาข้อความ)
- แถวที่ resolve ได้เฉพาะ `unknown` (อื่น → `POLICY_BLOCKED not_unknown`)

### 5.10 Upload limits (`upload-limits.ts`, ถูกเรียกใน `storage.save` และ route upload ทุกตัว)

| purpose | ขนาดสูงสุด | mime ที่รับ |
|---|---|---|
| `product_image`, `chat_image`, `slip`, `knowledge_image` | 8 MB | `image/jpeg`, `image/png`, `image/webp`, `image/gif` |
| `chat_attachment`, `knowledge_file`, `import_file`, `document` | 16 MB | image ข้างบน + `application/pdf`, `text/plain`, `text/csv`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| purpose อื่น (ไม่รู้จัก) | 8 MB | image เท่านั้น |

1. เพดานรวม = `min(ตารางนี้, UPLOAD_MAX_MB)` (`UPLOAD_MAX_MB` ต้องเป็นจำนวนเต็ม 1–32 ไม่งั้น boot ล้ม ไม่พิมพ์ค่า)
2. ตรวจขนาดจาก **จำนวนไบต์จริง** ไม่ใช่ `Content-Length` (multer memory: `limits.fileSize` = เพดานรวม + 1) · เกิน → `VALIDATION_ERROR details.reason='too_large'` พร้อม `maxBytes`
3. `sniffMime(bytes)` ดู magic bytes: PNG `89 50 4E 47`, JPEG `FF D8 FF`, GIF `47 49 46 38`, WEBP `RIFF....WEBP`, PDF `%PDF`, XLSX/DOCX = `PK 03 04` (zip) แล้วตรวจชื่อไฟล์ภายใน (`xl/` หรือ `word/`) ด้วย `adm-zip`; `text/*` = UTF-8 ที่ไม่มี NUL ใน 8 KB แรก · ชนิดที่ sniff ได้ต้องตรงกับ `mimeType` ที่ส่งมา มิฉะนั้น `VALIDATION_ERROR mime_mismatch` · ไม่อยู่ในตาราง → `mime_not_allowed` · SVG และ HTML ไม่รับ (กัน XSS)
4. ชื่อไฟล์เดิมเก็บใน `original_name` หลัง `normalize('NFKC')`, ตัด path separator, อักขระควบคุม, ยาว ≤ 120 · path บนดิสก์สร้างจาก uuid เท่านั้น
5. response ตอนเสิร์ฟไฟล์: `X-Content-Type-Options: nosniff`, `Content-Disposition: inline` เฉพาะ image/pdf ที่เก็บ ไม่งั้น `attachment`

### 5.11 `redactText` / `redactObject`

ลำดับแทนที่ (ผลเป็น `[REDACTED]` ยกเว้นระบุ):
1. `Bearer\s+[A-Za-z0-9._~+/=-]{8,}` · `\bsk-[A-Za-z0-9_-]{16,}` (รวม `sk-proj-…`) · `eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}` (JWT) · `[a-z]+:\/\/[^\s:@\/]+:[^\s@\/]+@` (connection string: คงเฉพาะ scheme `postgres://[REDACTED]@`)
2. `(authorization|cookie|set-cookie|password|passwd|secret|token|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|code|verifier|invite)\s*[:=]\s*\S+` (ไม่สนตัวพิมพ์; เก็บชื่อ key)
3. สตริงที่ไม่มีช่องว่างและมี `[A-Za-z0-9+/_-]{40,}`
4. อีเมล `\b[\w.+-]+@[\w-]+(\.[\w-]+)+\b` → `[email]` · เบอร์ไทย `\b0[689]\d[- ]?\d{3}[- ]?\d{4}\b` → `[phone]` · เลข 13 หลักติดกัน → `[id]` · เลขบัตร 13–19 หลัก (มีขีด/ช่องว่างได้) → `[card]`
5. ตัดความยาวที่ `maxLen` (default 500) ลงท้าย `…`
`redactObject`: เดิน object ลึกสุด 6 ระดับ · key ที่ตรง `/authorization|cookie|password|secret|token|api[_-]?key|slip|image|dataurl|file_data/i` → ค่าเป็น `[REDACTED]` ทั้งก้อน · ค่า string ผ่าน `redactText(maxStringLen=300)` · array ตัดที่ 50 สมาชิก · ไม่ mutate ต้นฉบับ

### 5.12 `/healthz` และ `/readyz` (เพิ่มจาก F01 §3, `meta.ts`)

| endpoint | ใช้กับ | เงื่อนไข |
|---|---|---|
| `GET /healthz` | Render health check (liveness) | process ขึ้น + `SELECT 1` ภายใน 2 วินาที → 200 `{ status:'ok', db:'ok' }` ไม่ผ่าน → 503 · **ไม่ผูกกับ worker/scheduler/migration** เพื่อไม่ให้ Render restart วนเพราะเหตุที่ restart ไม่ช่วย |
| `GET /readyz` | smoke, deploy gate, ผู้ดูแล | 200 `{ status:'ready', worker, scheduler, migrations, uploadDir }` เมื่อ: ไม่มี migration ค้าง · `UPLOAD_DIR` เขียนได้ · features โหลดครบ · ถ้า `RUN_WORKER=1`: loop ทำงานและ `lastPollAt` ไม่เกิน 30 วินาที · ถ้า `RUN_SCHEDULER=1`: `holdsLock` **หรือ** เพิ่งเห็นว่า instance อื่นถือ (ไม่นับเป็นความล้มเหลว) · ไม่ผ่านข้อใด → 503 `SERVICE_NOT_READY` พร้อม `details.failed: string[]` (ชื่อเงื่อนไข ไม่มีค่า secret) · ระหว่าง drain → 503 `{ status:'draining' }` |
| `GET /build-info` | F36, ผู้ดูแล | ตาม F01 (+ `startedAt`) ไม่มี secret |

ทั้งสามไม่ต้อง login, ไม่ log ทุก request ที่ผ่าน (ลด noise: log เฉพาะ non-200), ไม่ผ่าน `rateLimit` (Render เรียกถี่) แต่ตอบเฉพาะ field ที่กำหนด

### 5.13 Demo reset (`runDemoReset`) — ลำดับ

เงื่อนไขก่อนเริ่ม: `DEMO_RESET_ENABLED=1` (ไม่งั้น `POLICY_BLOCKED demo_reset_disabled`) · body `{ confirm:'RESET DEMO' }` · `rateLimit demo-reset:global` 3 ครั้ง/10 นาที · ขอ advisory lock `pg_try_advisory_lock(hashtext('nless.demo-reset'))` ไม่ได้ → `POLICY_BLOCKED reset_in_progress` · เฉพาะธุรกิจเดโมจาก `SEED` (A และ B) เท่านั้น

| # | ขั้น | หมายเหตุ |
|---|---|---|
| 1 | ตั้ง flag `demoResetting` ใน memory + `audit core.demo.reset.start` | worker ข้ามงานของธุรกิจเดโมระหว่างนี้ (claim query เพิ่ม `AND NOT (j.business_id = ANY($demoBusinessIds) AND $resetting)`) |
| 2 | ยกเลิกงาน `queued` ของธุรกิจเดโมทั้งหมด (`state='cancelled'`) และรอ job `running` ของธุรกิจเดโมจบ/หมด lease สูงสุด 10 วินาที (poll ทุก 500 ms; ที่ยังไม่จบ → `cancelled` + `claim_token=NULL` ให้ heartbeat ทำให้ handler หยุด) | กันงานเขียนข้อมูลใหม่ระหว่างลบ |
| 3 | `resetDemoData()` ของ F01 §9.3: **ธุรกรรมเดียว** ลบ `messages`, `conversations`, `customers`, `jobs`, `files` ที่ไม่มี alias ของสองร้านเดโม แล้วลบไฟล์บนดิสก์ของแถวที่ลบ | แถว SEED (users, accounts, businesses, memberships) ไม่ถูกลบ |
| 4 | รัน `resetDemo(ctx)` ของทุกฟีเจอร์ที่ export (ลำดับ **ย้อน** `dependsOn`: ฟีเจอร์ที่พึ่งคนอื่นก่อน เช่น follow-ups, broadcast, payments, orders → ... → inbox → ... → catalog/knowledge ตามกราฟ) | ฟีเจอร์ใดล้ม → บันทึกใน `steps[].error` แล้วไปต่อ (ไม่หยุดทั้งขั้นตอน) |
| 5 | seed ปกติ (`db:seed` = SEED + `seed.ts` ของทุกฟีเจอร์ตาม `dependsOn`) | idempotent |
| 6 | seed เดโม (`--demo` = รูปสินค้าสังเคราะห์, แชตไทย ≥ 8 ห้อง, `runDemo(ctx)` ของแต่ละฟีเจอร์ตาม `dependsOn`) | |
| 7 | ล้าง flag `demoResetting` · `audit core.demo.reset` (details: จำนวนขั้นล้ม) · คืน `DemoResetResult` | |

ข้อห้าม: ไม่ลบ `feature_flags`, `audit_events`, config ของร้านนอกเหนือจากที่ `resetDemo` ของฟีเจอร์ลบเอง · ไม่รันบนร้านที่ไม่ใช่ SEED · ไม่เรียก OpenAI (รูปสินค้า/แชตสร้างด้วยโค้ด) · ใช้เวลาเป้าหมาย < 20 วินาที (เวลาจริงจดใน EVIDENCE.md; ถ้าเกิน 60 วินาที request จะถูก proxy ตัด: หน้า UI แสดงสถานะ "กำลังทำงาน" และ poll `GET /ops/summary` ไม่พึ่ง response) · ฟังก์ชัน `resetDemoData()` จะถูกเรียกครั้งเดียวต่อ reset จึงไม่มีการ reset ซ้อน

## 6. AI calls

ไม่มี AI call (F35 ไม่เรียก `model.*`) · `model_usage` ไม่ถูกเขียน · `MODEL_MODE` ไม่มีผล

## 7. UI

Route `/ops` (`web/src/core/ops/OpsPage.tsx`, ลงทะเบียนในตาราง MENU ของ F01 แล้ว: group `admin`, `platformAdminOnly`, icon `WorkOutlineOutlined`) · ผู้ใช้ที่ไม่ใช่ platform admin เห็นหน้า NotFound (เมนูไม่ขึ้น) · ข้อความของหน้า core อยู่ใน `web/src/core/ops/i18n/{th,en}.json` (namespace `ops`) · ใช้ UI kit ของ core · หน้าเดียวแบ่ง 7 แท็บ (`Tabs`, สถานะแท็บเก็บใน `?tab=` ของ URL):

| แท็บ (`?tab=`) | เนื้อหา |
|---|---|
| `jobs` (default) | แถบสรุป `OpsSummary` (queued / running / succeeded 24h / dead / อายุงาน queued เก่าสุด / worker + scheduler สถานะ) · ตัวกรอง state, type (Select จาก byType24h), ค้นหา · `DataTable` ของ `GET /ops/jobs`: type, state (`StatusChip` generic), business (ชื่อสั้น), attempts/max, run_at, last_error (ตัด 80 ตัว + title เต็ม), ปุ่ม: ดูรายละเอียด (Drawer แสดง `payloadView`, `result`, lockKey, dedupKey), "ลองใหม่" (state ∈ queued/failed/dead/cancelled), "ยกเลิก" (queued/running) ใช้ `ConfirmDialog` |
| `dead` | `GET /ops/jobs?state=dead` + ปุ่ม "ลองใหม่ทั้งหมดของชนิดนี้" (`retry-dead`, ConfirmDialog ระบุจำนวน) |
| `deliveries` | `GET /ops/deliveries` (unknown/failed): ช่องทาง, ธุรกิจ, เวลา, error · ปุ่ม "ยืนยันว่าส่งแล้ว" / "ยืนยันว่าไม่ถึง" / "ส่งใหม่" (ConfirmDialog + ช่องโน้ตสั้น) · คำอธิบายว่า unknown คืออะไร |
| `features` | ตาราง `GET /ops/features` (id, ชื่อ, lane, tier, route นับได้, placeholder, สถานะ) · `Switch` "แสดงในเมนู" ต่อแถว → `PUT /ops/features/:id` (ConfirmDialog เมื่อซ่อน, ช่องเหตุผล) · ปุ่ม "ซ่อนทั้งหมดที่ยังเป็น placeholder" และ "ซ่อนรายการที่เลือก" (ใช้ `bulk`) · ฟีเจอร์ `folder:false` (F01, F35) ไม่แสดงสวิตช์ · ป้ายเตือน "ซ่อนเฉพาะเมนู/หน้าเว็บ; API ยังตอบอยู่" |
| `schedules` | `GET /ops/schedules`: ชื่อ, ทุกกี่วินาที, เจ้าของ, slot ล่าสุด, ผลล่าสุด · แถวสีเตือนสำหรับ `expected_missing` ที่ `status='declared'` |
| `system` | `GET /ops/build`: SHA (ย่อ + เต็ม), env, schema, uptime, node, pool, memory, mode ของ provider, ธง (demoReset, devLogin, mcp) · ปุ่ม "คัดลอกข้อมูล build" · **Demo reset** (`SectionCard` สีเตือน): ปุ่มแดง "ล้างข้อมูลเดโมแล้วสร้างใหม่" disabled เมื่อ `demoResetEnabled=false` พร้อมคำอธิบาย · `FormDialog` ให้พิมพ์ `RESET DEMO` ยืนยัน · แสดงผลทีละขั้น (`DemoResetResult.steps`) |
| `routes` | `GET /ops/routes`: ตาราง method/path/feature/auth/permission/summary · ค้นหา · ตัวกรองฟีเจอร์ · ธงสีส้มสำหรับ route ที่เป็น placeholder · ปุ่มส่งออก CSV (ทำฝั่ง client จากข้อมูลที่โหลด) |
| `audit` (ในแท็บ system ด้านล่าง ไม่ต้องแท็บแยก) | `GET /ops/audit` 30 แถวล่าสุด กรองตาม action |

States: loading (`DataTable loading`), empty (`EmptyState` "ไม่มีงานตามตัวกรอง"), error (`EmptyState` + "ลองใหม่"), polling: tab `jobs`/`dead` รีเฟรชทุก 5 วินาทีเมื่อหน้าอยู่หน้าจอ (`document.visibilityState`), และ `useRealtime('job.updated')` ใช้เฉพาะการ์ดสรุป (event มี businessId เท่านั้น จึงไม่ใช่แหล่งเดียว) · ทุก mutation: `useApiMutation` + `useToast` + `ConfirmDialog` · ไม่มีปุ่มที่ไม่ทำงาน (ปุ่ม demo reset ที่ถูกปิดแสดงเหตุผล)

i18n (namespace `ops`):

| key | th | en |
|---|---|---|
| `menu.title` | งานเบื้องหลัง | Jobs |
| `page.title` | เครื่องมือผู้ดูแลระบบ | Operations |
| `page.subtitle` | งานเบื้องหลัง ฟีเจอร์ที่เปิดใช้ การรีเซ็ตเดโม และข้อมูล build | Background jobs, feature visibility, demo reset and build info |
| `tabs.jobs` | งาน | Jobs |
| `tabs.dead` | งานที่ล้มเหลวถาวร | Dead letters |
| `tabs.deliveries` | ข้อความที่ไม่แน่ใจ | Uncertain deliveries |
| `tabs.features` | ฟีเจอร์ | Features |
| `tabs.schedules` | ตารางเวลา | Schedules |
| `tabs.system` | ระบบ | System |
| `tabs.routes` | เส้นทาง API | Route catalog |
| `summary.queued` | รอคิว | Queued |
| `summary.running` | กำลังทำ | Running |
| `summary.dead` | ล้มเหลวถาวร | Dead |
| `summary.oldest` | งานรอนานสุด | Oldest queued |
| `summary.worker` | Worker | Worker |
| `summary.scheduler` | Scheduler | Scheduler |
| `summary.holdsLock` | ถือ lock | Holds lock |
| `summary.otherInstance` | instance อื่นถืออยู่ | Another instance holds it |
| `jobs.type` | ชนิดงาน | Type |
| `jobs.state` | สถานะ | State |
| `jobs.business` | ร้าน | Business |
| `jobs.attempts` | ครั้งที่ลอง | Attempts |
| `jobs.runAt` | เวลาที่จะรัน | Run at |
| `jobs.lastError` | ข้อผิดพลาดล่าสุด | Last error |
| `jobs.detail` | รายละเอียดงาน | Job detail |
| `jobs.retry` | ลองใหม่ | Retry |
| `jobs.cancel` | ยกเลิก | Cancel |
| `jobs.retryDead` | ลองใหม่ทั้งหมดของชนิดนี้ | Retry all of this type |
| `jobs.confirmRetry` | ส่งงานนี้กลับเข้าคิวและเริ่มนับครั้งที่ลองใหม่? | Re-queue this job and reset its attempts? |
| `jobs.confirmCancel` | ยกเลิกงานนี้? งานที่กำลังทำจะถูกสั่งหยุด | Cancel this job? A running job will be told to stop |
| `jobs.confirmRetryDead` | ลองใหม่ {{count}} งานของชนิด {{type}}? | Retry {{count}} dead jobs of type {{type}}? |
| `jobs.empty` | ไม่มีงานตามตัวกรอง | No jobs match the filters |
| `jobs.retried` | ส่งกลับเข้าคิวแล้ว | Re-queued |
| `jobs.cancelled` | ยกเลิกแล้ว | Cancelled |
| `state.queued` | รอคิว | Queued |
| `state.running` | กำลังทำ | Running |
| `state.succeeded` | สำเร็จ | Succeeded |
| `state.failed` | หยุดแล้ว | Stopped |
| `state.dead` | ล้มเหลวถาวร | Dead |
| `state.cancelled` | ยกเลิก | Cancelled |
| `deliveries.intro` | ข้อความที่ส่งออกช่องทางภายนอกแล้วไม่แน่ใจว่าถึงลูกค้าหรือไม่ ระบบไม่ส่งซ้ำเอง ตรวจในช่องทางนั้นแล้วเลือกผล | Messages sent to an external channel where we cannot tell if they arrived. We never resend on our own. Check the channel, then pick the outcome |
| `deliveries.markSent` | ยืนยันว่าส่งแล้ว | Mark as sent |
| `deliveries.markFailed` | ยืนยันว่าไม่ถึง | Mark as failed |
| `deliveries.resend` | ส่งใหม่ | Resend |
| `deliveries.note` | หมายเหตุ (ไม่ใส่ข้อมูลลูกค้า) | Note (no customer data) |
| `deliveries.empty` | ไม่มีข้อความที่รอตรวจ | Nothing needs attention |
| `features.title` | ฟีเจอร์ที่แสดงในเมนู | Features shown in the menu |
| `features.note` | ซ่อนเฉพาะเมนูและหน้าเว็บ API และ webhook ยังตอบอยู่ | Hides the menu entry and web routes only. APIs and webhooks keep answering |
| `features.visible` | แสดง | Visible |
| `features.placeholder` | ยังไม่ได้สร้าง | Not built |
| `features.reason` | เหตุผล | Reason |
| `features.hideSelected` | ซ่อนที่เลือก | Hide selected |
| `features.hidePlaceholders` | ซ่อนทั้งหมดที่ยังไม่ได้สร้าง | Hide everything not built |
| `features.confirmHide` | ซ่อน {{id}} จากเมนู? | Hide {{id}} from the menu? |
| `features.saved` | บันทึกแล้ว | Saved |
| `schedules.missing` | ประกาศไว้ในสเปกแต่ยังไม่ลงทะเบียน | Declared in the spec but not registered |
| `schedules.every` | ทุก {{seconds}} วินาที | Every {{seconds}} s |
| `schedules.lastSlot` | slot ล่าสุด | Last slot |
| `system.title` | ข้อมูล build | Build info |
| `system.copy` | คัดลอกข้อมูล build | Copy build info |
| `system.demoTitle` | รีเซ็ตข้อมูลเดโม | Reset demo data |
| `system.demoBody` | ลบแชต ลูกค้า และข้อมูลธุรกรรมของร้านเดโมทั้งสองร้าน แล้วสร้างข้อมูลเดโมใหม่ ไม่แตะการตั้งค่าร้านและบัญชีผู้ใช้ | Deletes chats, customers and transactional data of both demo shops, then re-creates demo data. Shop settings and user accounts stay |
| `system.demoDisabled` | ปิดอยู่ (ตั้ง DEMO_RESET_ENABLED=1 ใน Render ก่อน) | Disabled (set DEMO_RESET_ENABLED=1 in Render first) |
| `system.demoButton` | ล้างและสร้างใหม่ | Reset and re-seed |
| `system.demoConfirm` | พิมพ์ RESET DEMO เพื่อยืนยัน | Type RESET DEMO to confirm |
| `system.demoRunning` | กำลังรีเซ็ต อย่าปิดหน้านี้ | Resetting, keep this page open |
| `system.demoDone` | รีเซ็ตเสร็จใน {{ms}} มิลลิวินาที | Reset finished in {{ms}} ms |
| `routes.search` | ค้นหา path หรือฟีเจอร์ | Search path or feature |
| `routes.export` | ส่งออก CSV | Export CSV |
| `audit.title` | กิจกรรมล่าสุด | Recent activity |
| `error.retry` | ลองใหม่ | Retry |
| `error.forbidden` | ต้องเป็นผู้ดูแลระบบ | Platform admin only |

## 8. Jobs, schedules, events

### 8.1 Job และ schedule ที่ core ลงทะเบียนเอง

| ชื่อ | ชนิด | ค่า |
|---|---|---|
| `core.deliver` | job | payload `{ messageId }` · dedupKey `deliver:<messageId>` (ตรงกับ `sendToCustomer` ใน `contracts.ts`) · lockKey `conversation:<conversationId>` · `maxAttempts 5` · ดู §5.9 |
| `core.sessions.purge` | schedule | `everySeconds: 3600` (F01) |
| `core.jobs.purge` | schedule | `everySeconds: 3600` (§5.8) |

### 8.2 ตารางครบทุก schedule/job ที่สเปกอื่นประกาศ (ตรวจด้วย `EXPECTED_SCHEDULES`)

`status: declared` = สเปกที่ merge แล้วประกาศไว้ (test บังคับว่าต้องลงทะเบียนเมื่อฟีเจอร์ถูก build จริง ไม่ใช่ placeholder) · `planned` = ยังไม่มีสเปก/สเปกเขียนว่าอาจมี (แสดงเตือนใน `/ops` อย่างเดียว ไม่ fail test) · ชื่อ planned เป็นข้อเสนอ เจ้าของฟีเจอร์ใช้ชื่อในสเปกของตัวเองและแก้แถวนี้ผ่าน `NEED TO:C1`

| Schedule | ทุก (วินาที) | เจ้าของ | status | สเปก/หมายเหตุ |
|---|---|---|---|---|
| `core.sessions.purge` | 3600 | F01 | declared | ลบ session หมดอายุ |
| `core.jobs.purge` | 3600 | F35 | declared | §5.8 |
| `team.idle-scan` | 60 | F11 | declared | [F11 §5.6](F11-team.md) นโยบายแชตค้าง |
| `team.auto-close` | 300 | F11 | declared (ทางเลือก) | F11 §5.8 เฉพาะร้านที่ `auto_close=true`; ถ้าไม่ได้ทำ ให้ลบแถวออกจากไฟล์ |
| `voice.sweep` | 30 | F30 | declared | [F30 §5.6](F30-voice.md) ปิด session เสียงที่ค้าง |
| `follow-ups.scan` | 60 | F38 | declared | [F38 §5.2](F38-follow-ups.md) |
| `follow-ups.recover` | 300 | F38 | declared | F38 §5.4 |
| `auth.outbox-purge` | 3600 | F02 | declared | [F02](F02-auth.md) §8 |
| `notifications.purge` | 86400 | F31 | declared | [F31](F31-notifications.md) §8 |
| `payments.expire` | 600 | F14 | declared | [F14 §5.10](F14-payments.md) |
| `knowledge-search.reconcile` | 600 | F07 | declared (ทางเลือก) | F07 §8 |
| `knowledge.purge-drafts` | 86400 | F05 | declared (ทางเลือก) | F05 §8 |
| `orders.sweep` | 600 | F13 | declared | [F13](F13-orders.md) §8: ใบสรุปหมดอายุ, คืนสต็อกของออเดอร์ที่ยกเลิก |
| `live-commerce.sweep` | 600 | F22 | declared | [F22](F22-live-commerce.md) §8: ตะกร้า live ที่ค้าง |
| `booking.maintain` | 300 | F15 | declared | [F15](F15-booking.md) §8: ใบสรุปนัดหมดอายุ, waitlist หมดอายุ |
| `booking.repair` | 120 | F15 | declared | F15 §8: นัดที่ side effect ค้าง (reminder เป็น job `booking.reminder` ไม่ใช่ schedule) |
| `calendar.repair` | 600 | F16 | declared | [F16](F16-calendar.md) §8: sync ไป Google ที่ค้าง |
| `calendar.maintain` | 3600 | F16 | declared | F16 §8: ลบ OAuth state ที่หมดอายุ |
| `crm.automation` | 900 | F24 | declared | [F24](F24-crm.md) §8: กฎแท็กอัตโนมัติและ inactivity |
| `insights.scan` | 120 | F26 | declared | [F26](F26-insights.md) §8: หาแชตที่เงียบหรือปิดแล้วเพื่อสรุป |
| `knowledge-import.sweep` | 600 | F06 | declared | [F06](F06-knowledge-import.md) §5.10: งานนำเข้าที่ค้าง |
| `line.maintenance` | 600 | F17 | declared | [F17](F17-line.md) §8 |
| `meta.maintenance` | 600 | F18 | declared | [F18](F18-meta.md) §8 |
| `comments.reconcile` | 300 | F21 | declared | [F21](F21-comments.md) §8: private reply ที่สถานะไม่ทราบ |

อัปเดตหลัง spec ครบทั้ง 31 ไฟล์ (20 พ.ย. ค่ำ): ชื่อและช่วงเวลาในตารางนี้ตรงกับ §8 ของ spec เจ้าของทุกตัวแล้ว ไม่มีแถว `planned` เหลือ · ถ้าเจ้าของเปลี่ยนชื่อ schedule ในวันงาน ต้องโพสต์ `NEED TO:C1` ให้แก้ `EXPECTED_SCHEDULES`


Job (ไม่ใช่ schedule) ที่ลงทะเบียนในโค้ดแล้ว (ไว้ใช้อ้างใน `/ops` และเขียน test ว่าไม่มีชื่อซ้ำ): `ai.reply` (F10, lockKey `conversation:<id>`) · `core.deliver` (core) · `knowledge.index` (F07) · `knowledge-search.fixture-load` (F07) · `notifications.push` (F31) · `payments.message` (F14) · `follow-ups.send` (F38) · `evals.run` (F37, `maxAttempts:1`) · `broadcast.send-batch`, `broadcast.finalize` (F23)

### 8.3 Realtime, audit, notify

| รายการ | ค่า |
|---|---|
| Realtime | `job.updated` (`jobId, jobType, state, progress?`) เมื่อ job มี `businessId` (ทุกการเปลี่ยน state + progress ≤ 1/วินาที) · `message.updated` (outbox) |
| Audit | `core.job.dead` · `ops.job.retry` · `ops.job.cancel` · `ops.job.retry-dead` (details: type, count) · `core.delivery.unknown` · `core.delivery.resolve` · `core.feature.toggle` (F01, รวมเมื่อมาจาก `bulk`: หนึ่งแถวต่อฟีเจอร์ + `ops.features.bulk` หนึ่งแถว) · `core.demo.reset.start` · `core.demo.reset` · ไม่ audit การอ่านและ tick ของ scheduler |
| notify | `system` ถึง `{ role:'owners' }` เมื่อ job ของธุรกิจนั้น dead (§5.7) · dedupKey `job:<jobId>:dead` |

## 9. Seed และ fixtures

- ไม่มี seed ของตารางใหม่ (migration 002 เพิ่มเฉพาะคอลัมน์/ดัชนี) · `feature_flags`: ไม่ seed (ค่าเริ่มต้นมาจาก env `HIDDEN_FEATURES` ตาม F01) · ผู้ดูแล = `admin@example.test` (SEED `platform_admin`) ที่ F01/F02 ตั้งรหัสผ่าน (F02 หลัง merge; ก่อนนั้น dev login)
- Fixtures ของ test (สร้างด้วยโค้ด): `registerTestHandler(type, fn)` ใส่ใน registry เฉพาะ `NODE_ENV=test` (type ขึ้นต้น `test.`); นาฬิกาปลอมด้วย `vi.useFakeTimers({ toFake:['Date'] })` ร่วมกับ `tickOnce(now)` และตัวช่วย `forceExpireLease(jobId)` (`UPDATE jobs SET locked_until = now() - interval '1 second'`) แทนการรอเวลาจริง · จำลอง "process ตาย" = เรียก `worker.__abandon(jobId)` (ทิ้ง in-flight โดยไม่ finish/ไม่ unlock; ใช้เฉพาะ test) แล้วสร้าง worker ตัวที่สองด้วย `instanceId` ต่างกัน · จำลองสอง scheduler = เปิด connection ที่สองถือ lock เดียวกัน
- `demo:reset` / `runDemo` / `resetDemo` ของแต่ละฟีเจอร์เป็นของฟีเจอร์นั้น F35 มีหน้าที่เรียกให้ครบและรายงานผลต่อขั้นใน `DemoResetResult`

## 10. Tests

Unit/service (`MODEL_MODE=fake`, ฐานข้อมูล `TEST_DATABASE_URL`, `fileParallelism:false` ตาม F01) · ทุกไฟล์อยู่ใน `server/src/core/`:

| ไฟล์ | case |
|---|---|
| `jobs.test.ts` (enqueue) | enqueue + `get` ได้ state `queued` · `dedupKey` เดิมสองครั้ง = `deduped:true` id เดียวกัน (รวมกรณีงานเดิม dead/succeeded) · payload เกิน 16 KB → `VALIDATION_ERROR` · payload ที่มี key `apiKey` ใน test env → `VALIDATION_ERROR` · type รูปแบบผิด → 400 · `runAt` ในอนาคตไม่ถูก claim ก่อนเวลา (นาฬิกาปลอม) · `maxAttempts` นอก 1–20 → 400 |
| `worker.test.ts` (claim/retry) | สอง worker แข่งกันหนึ่งงาน → รันครั้งเดียว (`SKIP LOCKED`) · ล้มสองครั้งแล้วผ่าน: `run_at` ห่าง 5 s และ 20 s ตามสูตร (นาฬิกาปลอม), `attempt` ใน ctx = 1,2,3 · ล้มครบ `maxAttempts` → `dead` + `last_error` ผ่าน redact + `dead_at` · `AppError retryable:false` → dead ทันทีที่ attempt 1 · `{ retryAt }` ไม่นับ attempt, `reschedules` เพิ่ม, เกิน 500 → dead · type ไม่มี handler → dead `no handler` · `{ result }` เก็บใน `result` (redact) · `progress()` เขียน `progress` และ publish · งานต่าง `lockKey` ขนานได้ (concurrency 4), `lockKey` เดียวกันไม่ซ้อน (แม้ concurrency 4) · งาน `lockKey` ที่ advisory lock ถูกถือโดย connection อื่น → คืนคิว ไม่นับ attempt · handler เรียก `db.withAdvisoryLock` คนละ key ได้ปกติ |
| `worker-crash.test.ts` | commit ข้อมูลแล้ว `__abandon` ก่อน finish → ก่อน lease หมด worker B ไม่หยิบ · `forceExpireLease` → worker B หยิบ `attempts=2` และผลสุดท้ายสำเร็จเพียงครั้งเดียว (handler idempotent ด้วย unique key) · worker A ที่ตื่นมาเขียนผลด้วย token เก่า → ไม่มีผล (`succeeded` ไม่ถูกทับ) · รอบสุดท้ายแล้วหมด lease → `reap` ให้ `dead` ข้อความ `lease expired, attempts exhausted` · heartbeat ต่ออายุ `locked_until` (นาฬิกาปลอม) · cancel ระหว่าง running → heartbeat ถัดไป abort `signal` |
| `shutdown.test.ts` | `stopWorker(grace)` รอ handler สั้นให้จบ · handler ยาว → abort หลัง grace แล้วงานกลับ `queued` `attempts` ลดลง 1 `run_at<=now` · หลัง shutdown worker ตัวใหม่หยิบทันที · `shutdown()` เรียกสองครั้งไม่พัง · `/readyz` ตอบ 503 `draining` ระหว่างปิด |
| `scheduler.test.ts` | `tickOnce(t)` สร้าง job `<name>` dedupKey `<name>@<slot ISO>` payload `{ slot }` · tick สองครั้งใน slot เดียวกัน = job เดียว · ข้าม slot เมื่อมีงานชนิดเดียวกันค้าง `queued/running` · เวลาเดินไป slot ถัดไป → job ใหม่ (`everySeconds` 60, 30, 3600) · สอง scheduler ที่ถือ connection ต่างกัน: ตัวที่สองได้ `pg_try_advisory_lock=false` และไม่ enqueue · ตัวแรก release → ตัวที่สองได้ lock หลังรอบลองใหม่ · connection ของ lock ตาย → `holdsLock=false` · `everySeconds` 5 → boot fail · ชื่อซ้ำสองฟีเจอร์ → boot fail ระบุทั้งสอง |
| `expected-schedules.test.ts` | หลัง `loadFeatures()` ทุกแถว `declared` ของฟีเจอร์ที่ **ไม่ใช่ placeholder** ต้องลงทะเบียนด้วย `everySeconds` ตรงตาราง §8.2 (ฟีเจอร์ placeholder ข้าม) · ไม่มี schedule ที่ลงทะเบียนนอกตาราง (ชื่อใหม่ต้องเพิ่มแถวก่อน: ป้องกันการตกหล่นใน `/ops`) · `planned` ที่ยังไม่ลงทะเบียนไม่ทำให้ test ล้ม แต่ `/ops/schedules` คืน `source:'expected_missing'` |
| `outbox.test.ts` | `core.deliver` สำเร็จ → `sent` + `external_ref` · sender **คืน** `{state:'failed', retryable:true}` → `retry:<code>` แล้วรันใหม่ · คืน `{state:'failed'}` → `failed` ไม่ retry · คืน `{state:'unknown'}` → `unknown` ไม่ retry (ห้ามบันทึก `sent`) · sender โยน `definitelyNotSent+retryable` → `retry:<code>` และรันใหม่ตาม backoff, ครบ attempt → `failed` · `definitelyNotSent+!retryable` → `failed` ไม่ retry · error ทั่วไป/timeout → `unknown` ไม่ retry · งานถูก reclaim หลังตาย (พบ `inflight:*`) → `unknown` ไม่ส่งซ้ำ (sender ถูกเรียก 1 ครั้งรวม) · `resolve sent|failed|resend` ถูกต้องและ audit · resolve แถวที่ไม่ใช่ unknown → `POLICY_BLOCKED` |
| `redact.test.ts` | Bearer, `sk-proj-…`, JWT, connection string, `password=…`, ข้อความ base64 ยาว, อีเมล, เบอร์ `081-234-5678`, เลข 13 หลัก ถูกแทนที่ · ข้อความธรรมดาไม่เปลี่ยน · `redactObject` ซ่อน key `authorization`/`slipImage`, ตัดความยาว, ไม่ mutate ต้นฉบับ, วนลึกเกิน 6 ไม่พัง · log: โยน error ที่ message มี token → บรรทัด log ไม่มี token (จับ stream ของ pino) |
| `upload-limits.test.ts` | image 8 MB พอดีผ่าน / 8 MB + 1 ไบต์ → `too_large` · pdf 16 MB ผ่าน · PNG ที่ประกาศเป็น `image/jpeg` → `mime_mismatch` · SVG/HTML → `mime_not_allowed` · xlsx จริงผ่าน, zip ธรรมดาที่ตั้งชื่อ xlsx ไม่ผ่าน · `UPLOAD_MAX_MB=abc` → boot ล้ม · ชื่อไฟล์ `../../x.png` ถูกทำความสะอาด |
| `ops.test.ts` (route, supertest) | owner A / staff A เรียกทุก `/ops/*` → 403 · ไม่ล็อกอิน → 401 · admin → 200 · `retry` ของ dead → `queued attempts=0` และ audit · `retry` ของ running/succeeded → `POLICY_BLOCKED` · `cancel` queued → cancelled · `retry-dead` ตาม `type`/`limit` · `GET /ops/jobs` กรอง state/type/q และ cursor ไม่ซ้ำแถว · `payloadView` ไม่เผย key secret · `features/bulk` ซ่อน/แสดงถูกต้องและ audit ทุกตัว, `hide`∩`show` → 400, id ที่ไม่มีโฟลเดอร์ → 400 · `GET /ops/build` ไม่มีคีย์ที่มีคำว่า key/secret/token/password · `GET /ops/routes` ครบ route ที่ registry รู้จัก + `placeholder` ถูกต้อง |
| `demo-reset.test.ts` | `DEMO_RESET_ENABLED` ปิด → `POLICY_BLOCKED demo_reset_disabled` · confirm ผิด → 400 · สำเร็จ: ข้อมูลทดสอบที่สร้างในร้าน A หาย, SEED ยังอยู่, ลำดับขั้นตรง §5.13 (mock `resetDemo` สองฟีเจอร์ที่ dependsOn ต่อกัน → เรียกแบบย้อนลำดับ), `resetDemo` ตัวหนึ่ง throw → ขั้นนั้น `ok:false` และขั้นอื่นยังทำ · งาน queued ของร้านเดโมถูก cancel ก่อนลบ · เรียกซ้อน → `reset_in_progress` · ครั้งที่ 4 ใน 10 นาที → `RATE_LIMITED` · ไม่แตะร้านที่ไม่ใช่ SEED |
| `meta.test.ts` (เพิ่มจาก F01) | `/healthz` ไม่ขึ้นกับ worker · `/readyz` 503 เมื่อ worker ไม่ poll เกิน 30 วินาที (นาฬิกาปลอม) พร้อม `details.failed` · `/readyz` ปกติเมื่อ scheduler ไม่ถือ lock แต่มี instance อื่นถือ · `/build-info` ไม่มี secret |
| `dead-notify.test.ts` | dead ของงานที่มี `businessId` → เรียก `notify` (mock ของ F31) `type:'system'` `to:{role:'owners'}` dedupKey `job:<id>:dead` ไม่มี payload ในข้อความ · เกิน 5 ครั้ง/10 นาที/ร้าน → ข้าม · `notify` โยน error → ไม่กระทบสถานะ dead · ไม่มี `businessId` → ไม่เรียก |

Web (`web/src/core/ops/ops.test.tsx`, vitest jsdom): แท็บ jobs แสดงแถว/ไม่มีข้อมูล = `EmptyState` · ปุ่ม retry เปิด `ConfirmDialog` แล้วเรียก API ถูก path · ปุ่ม demo reset disabled เมื่อ `demoResetEnabled=false` และ enable เมื่อพิมพ์ `RESET DEMO` · สวิตช์ feature เรียก `PUT /ops/features/:id`

Playwright smoke `tests/e2e/core-jobs.smoke.spec.ts` (production-safe; ไม่มีข้อมูลธุรกิจใหม่):
1. `api` fixture (owner A): `GET /api/v1/ops/summary` → 403 (หลักฐานว่าเครื่องมือไม่รั่วถึงเจ้าของร้าน)
2. `GET /healthz` → 200 `ok` · `GET /readyz` → 200 และ `worker.running=true` · `GET /build-info` → มี `sha` ไม่เป็น `unknown` และไม่มีคำว่า secret
3. ถ้ามี `E2E_ADMIN_EMAIL` + `E2E_ADMIN_PASSWORD` (ใหม่; ไม่มี → `test.skip` พร้อมเหตุผล ไม่นับ pass): ล็อกอินเป็นผู้ดูแล เปิด `/ops` เห็นสรุปงานและตาราง · แท็บ features: สลับซ่อน `E2E_FLAG_FEATURE` (default `F12`) แล้วกลับค่าเดิมใน `finally` ตรวจ `GET /api/v1/features` เปลี่ยนแล้วกลับ · แท็บ schedules ไม่มีแถวสีเตือน `declared` · แท็บ system เห็น SHA เท่ากับ `/build-info`
4. (ไม่ทำใน smoke บน production) demo reset จริง: ครอบด้วย `demo-reset.test.ts` และทดสอบมือบน staging/dev 1 ครั้งก่อนเวที (จด `durationMs` ใน EVIDENCE.md)

## 11. Acceptance: R ตาม D6

- [ ] enqueue → ทำงานจริงด้วย worker → สำเร็จ · `dedupKey` ซ้ำ = `deduped:true` · `lockKey` ไม่รันซ้อน (test ผ่าน)
- [ ] ฆ่า process กลางงาน (ทดสอบมือบน dev 1 ครั้ง: enqueue งาน `test.sleep`, kill, เปิดใหม่) → ทำต่อจนเสร็จครั้งเดียว · กรณี commit-then-crash ผ่าน `worker-crash.test.ts`
- [ ] ล้มซ้ำ → backoff → `dead` เห็นที่ `/ops` พร้อมปุ่ม retry/cancel ที่ทำงานจริงบน production · เจ้าของร้านได้ notification (ผ่าน F31 จริงเมื่อ merge ไม่งั้นบันทึกว่า A)
- [ ] SIGTERM บน Render: deploy จริงหนึ่งครั้งระหว่างมีงานยาว (`ai.reply` หรืองานทดสอบ) ไม่มีงานค้าง `running` ค้างเกิน lease และไม่มีข้อความตอบซ้ำ (บันทึกในEVIDENCE.md พร้อมเวลา deploy)
- [ ] scheduler: log ว่าได้ lock · ตอน deploy ซ้อนสอง instance ไม่มี slot ซ้ำ (ตรวจ `SELECT count(*) … GROUP BY dedup_key HAVING count(*)>1` = 0) · `/ops/schedules` ไม่มีแถว `declared` ที่ missing สำหรับฟีเจอร์ที่ R แล้ว
- [ ] `core.deliver`: `unknown` ถูกแสดงตามจริงและไม่ส่งซ้ำ · `resolve` ทำงาน (ทดสอบด้วยการฉีด `ChannelSendError` ใน sandbox sender)
- [ ] `/ops` ครบ 7 แท็บ ไม่มีปุ่มเปล่า · feature flags สลับแล้วเมนูเปลี่ยนจริงทันทีหลังรีเฟรช · demo reset รันสำเร็จบน dev หนึ่งครั้งพร้อมเวลา และ `DEMO_RESET_ENABLED` ปิดบน production จนกว่าจะใช้
- [ ] `/healthz` vs `/readyz` ตามตาราง §5.12 · Render health check ชี้ `/healthz`
- [ ] ไม่มี secret/ข้อความลูกค้าใน log, `last_error`, ops response (test + ตรวจ log production จริงหนึ่งรอบ)
- [ ] upload limits ทำงานทุกเส้นทางที่ใช้ `storage.save` (test + ลองอัปโหลดไฟล์ใหญ่หนึ่งครั้งใน dev)
- [ ] unit + route test ผ่าน, Playwright smoke ผ่านบน production, loading/empty/error + i18n th/en, audit ครบ, ตรวจ permission (ทุก `/ops/*` เฉพาะ platform admin)
- **S**: ไม่มี (ใช้งานได้จริงหรือไม่ก็ A) · **A**: worker ขั้นต่ำของ F01 ยังทำงานแต่ไม่มี `/ops` · ถ้าส่วนใดไม่ถึง R ตอน 15:30 ให้บันทึกใน `server/src/core/EVIDENCE.md` ตามจริง (ไม่ซ่อนได้ด้วย feature flag เพราะไม่ใช่ฟีเจอร์เมนู: ซ่อนแท็บเองด้วย `if (!available)` ไม่ได้ จึงต้องไม่ปล่อยปุ่มเปล่า — ตัดแท็บนั้นออกจากโค้ดก่อน freeze)

## 12. Security และ privacy

- ทุก `/ops/*` เป็น `platform_admin` เท่านั้น (เช็ก `isPlatformAdmin` ฝั่ง server ทุก request จาก DB) · ผู้ดูแลระบบ **ไม่ได้สิทธิ์ของร้าน** (ไม่มี merchant key) และหน้า ops ไม่แสดงเนื้อหาข้อความลูกค้า ชื่อลูกค้า หรือ payload เต็ม: `payloadView` ผ่าน `redactObject` · `OpsDeliveryRow` ไม่มีเนื้อหา
- `payload` ของ job มีเฉพาะ id และพารามิเตอร์เล็ก ๆ (ห้ามใส่ข้อความลูกค้า/secret: warn ใน prod, fail ใน test)
- `last_error` และ `result` ผ่าน `redactText`/`redactObject` ก่อนเก็บ · stack trace ลง log เท่านั้น (pino redact ของ F01 ยังใช้)
- CSRF: route เปลี่ยนข้อมูลของ ops ใช้ `X-Requested-With: nless` ของ core ตามปกติ · `rateLimit` ที่ `demo/reset` · `retry-dead` ≤ 100 แถว/ครั้ง
- Demo reset: `DEMO_RESET_ENABLED` ปิดโดยค่าเริ่มต้นบน production · ยืนยันด้วยข้อความ · จำกัดที่ธุรกิจ SEED (ตรวจ id ซ้ำใน SQL ไม่ใช่แค่ใน UI) · audit start/end
- Advisory lock: ใช้ `hashtext` ของชื่อคงที่/`lockKey` ที่ฟีเจอร์ตั้ง (ไม่รับจากผู้ใช้ภายนอก) กัน DoS ด้วยการล็อกชื่อเอง
- Scheduler/worker ไม่เปิด endpoint ใหม่ที่ไม่ต้อง login นอกจาก `/healthz`, `/readyz`, `/build-info` (ไม่มี secret)
- Upload: ตรวจ magic bytes, ไม่รับ SVG/HTML, `nosniff`, ชื่อไฟล์ทำความสะอาด, path จาก uuid
- ห้าม log: payload เต็ม, ข้อความลูกค้า, token, cookie, รูปสลิป · log ทุกบรรทัดมี `requestId` เมื่ออยู่ใน request และ `jobId`/`type` เมื่ออยู่ใน handler (AsyncLocalStorage)

## 13. Edge cases

| กรณี | ผลที่ต้องได้ |
|---|---|
| เปิดสอง instance ชั่วคราวตอน deploy | worker ไม่ซ้ำงาน (`SKIP LOCKED` + token) · scheduler ทำงานที่ instance เดียว (advisory lock) · slot เดียวกันไม่ซ้ำด้วย `dedupKey` · instance เก่าได้ SIGTERM แล้วคืน lock |
| connection ที่ถือ scheduler lock ถูกตัด (Neon/Render DB restart) | `holdsLock=false` ลองใหม่ทุก 30 วิ · งานที่ enqueue ไปแล้วไม่หาย |
| Postgres ล่มช่วงสั้น | loop จับ error, log, sleep 5 วินาทีแล้วลองใหม่ ไม่ crash · `/healthz` 503 ช่วงนั้น · heartbeat ล้มเหลวหลายรอบ → handler ถูก abort (lease หมดอยู่แล้ว) |
| handler ไม่เคารพ `signal` และวิ่งเกิน lease | งานถูก reclaim โดย worker อื่น → handler สองตัวรันพร้อมกันได้ (at-least-once): ต้อง idempotent · ผลของตัวเก่าถูกทิ้งเพราะ token ไม่ตรง |
| งานคืน `{ retryAt }` ในอดีต | ใช้ `now() + 1 s` ขั้นต่ำ |
| `enqueue` ใน handler ของงานอื่น (งานต่อเนื่อง) | ได้ (แนะนำ `dedupKey` ตายตัวต่อขั้น) · ห้ามรอผลของงานลูกใน handler (deadlock กับ concurrency) |
| ธุรกิจ soft-delete (ไม่ active) | ฟีเจอร์ต้องข้ามเอง (brief §6): worker ไม่รู้จักสถานะ แต่ `onDead` ไม่ notify ธุรกิจที่ไม่ active |
| `lockKey` เดียวกันงานเยอะ | ทำเรียงทีละงานตาม `run_at`; worker ตัวอื่นไม่ถูกบล็อก (เลือกงาน lockKey อื่นแทน) |
| job ถูก cancel ขณะ handler ทำงานอยู่ | handler รับ abort ที่ heartbeat ถัดไป (≤ 20 วินาที) ผลที่คืนมาถูกทิ้ง · side effect ที่ทำไปแล้วไม่ถูกย้อน (ระบุใน UI: "งานที่กำลังทำจะถูกสั่งหยุด") |
| ops retry งานที่ dedupKey เดิม | ใช้แถวเดิม (ไม่สร้างใหม่) จึงไม่ชน unique |
| `core.jobs.purge` ลบแถวที่ dedup ไว้ แล้ว enqueue key เดิมซ้ำหลัง 7 วัน | ยอมรับได้: key ที่อิง slot/เวลาไม่ซ้ำ · key ที่อิง id ของแถวที่ยังอยู่ (เช่น `ai.reply:<msgId>`) ไม่เกิดซ้ำเพราะข้อความไม่ถูก enqueue ซ้ำ |
| นาฬิกา Render กับ DB ต่างกันเล็กน้อย | เงื่อนไข lease/`run_at` ใช้ `now()` ของ DB ทั้งหมด · slot ของ scheduler ใช้เวลา process (dedupKey กันซ้ำ) |
| `/ops` เปิดบนมือถือ | ตารางเลื่อนแนวนอนใน `DataTable` · ปุ่มอันตรายอยู่หลัง ConfirmDialog เสมอ |
| ผู้ดูแลกด demo reset ซ้ำขณะรัน | `reset_in_progress` · UI poll `GET /ops/summary` จนกว่า flag หาย |
| ฟีเจอร์ที่ซ่อน | `/ops/features` แสดงสถานะจริงจาก `feature_flags` และ placeholder จาก registry · job ของฟีเจอร์ที่ซ่อนยังทำงานตามปกติ (ซ่อนเฉพาะเว็บ) |

## 14. Build order (slices ≤ 45 นาที)

| Slice | เวลา | ส่งมอบ |
|---|---|---|
| **S1 worker ทนทาน** (gate รอ) | 40 | migration `002` · `jobs-config.ts`, `jobs.ts` (enqueue + validation + dedup), `worker.ts` (claim ด้วย token, lease, heartbeat, retry/dead, `{ retryAt }`, reap, lockKey 2 ชั้น, graceful shutdown ผูกกับ `server.ts`), `redact.ts` + ใช้กับ `last_error` · `drainJobs` ย้ายมา · tests: jobs, worker, worker-crash, shutdown, redact · **PR แรกก่อน 12:20** (ทุก lane ใช้ `ai.reply` ผ่านตัวนี้ และ C0 ตรวจ gate 13:00) |
| **S2 scheduler + outbox + health** | 40 | `scheduler.ts` (lock บน connection เฉพาะ, slot, overlap skip, `core.jobs.purge`), `expected-schedules.ts` + test, `outbox.ts` + แก้ `core.deliver` ใน `channels.ts` (`ChannelSendError`), `/readyz` ขยาย, `upload-limits.ts` ต่อเข้า `storage.save`, notify เมื่อ dead (ใช้ fake ของ F31 ได้) · tests: scheduler, expected-schedules, outbox, upload-limits, meta, dead-notify |
| **S3 `/ops` server + web** | 45 | `ops.ts` routes ทั้งหมด (§3) · `OpsPage` ทั้งแท็บ jobs/dead/deliveries/features/schedules/system/routes + i18n · `runDemoReset` · tests: ops, demo-reset, web ops.test · Playwright smoke · EVIDENCE.md (`server/src/core/EVIDENCE.md`) · ทดสอบ demo reset บน dev หนึ่งครั้งและจดเวลา |

ลำดับ: S1 ต้องเสร็จก่อนใครต้องพึ่ง retry/lease จริง (ทุก lane ใช้ worker ขั้นต่ำของ F01 ได้ระหว่างรอ) · S3 ต้องทันก่อน 15:30 เพราะใช้ซ่อนฟีเจอร์ที่ไม่ถึง R (ถ้า S3 ช้า ให้ซ่อนด้วย `HIDDEN_FEATURES` ใน Render env แล้ว redeploy) · F39 ต่อทันทีหลัง S3

## 15. UNCONFIRMED และสิ่งที่ต้องตรวจในวันงาน

1. เวลาที่ Render รอระหว่าง SIGTERM กับ SIGKILL (ค่าเริ่มต้นที่เราเข้าใจคือ 30 วินาที และตั้งเพิ่มได้ในบริการ: UNCONFIRMED) ตรวจใน Render dashboard (Settings → Shutdown delay / เอกสาร Render) ตอน S9 ของ F01 และปรับ `JOBS_SHUTDOWN_GRACE_MS` ให้ต่ำกว่าอย่างน้อย 8 วินาที
2. Render zero-downtime deploy ทำให้สอง instance ซ้อนกันกี่วินาที (สมมติว่ามี): ตรวจโดยดู log `scheduler: lock held by another instance` ตอน deploy ครั้งแรก
3. `db.withAdvisoryLock(key)` ของ F01 ใช้ `hashtext(key)` จริงหรือไม่ และเป็น blocking หรือ try: ตรวจโค้ด F01 `db.ts`; ถ้าไม่ใช้ `hashtext` ให้ปรับ `worker.ts` ใช้ฟังก์ชันเดียวกัน (สำคัญ: ชนิดเดียวกับที่ handler ใช้ถึงจะเรียงลำดับกันจริง)
4. ขนาด pool: `DB_POOL_MAX` ของ F01 default 5 น้อยเกินสำหรับ concurrency 4 + lock connection + request: ตรวจ `render.yaml` ตั้ง ≥ 12 และตรวจขีดจำกัด connection ของแผน Postgres บน Render (UNCONFIRMED จนเปิด dashboard)
5. `notify()` type `system` ของ F31: ตรวจว่าแสดงชื่อ/ข้อความไทยถูกต้องเมื่อ F31 merge · ถ้ายังเป็น fake ให้บันทึก A
6. `ChannelSendError` ที่ C2 ใช้ใน sender ของ F17/F18: ตรวจ C2 throw ถูกชนิด (โดยเฉพาะ timeout = ไม่ใช่ `definitelyNotSent`) ไม่ใช้ก็จะตกเป็น `unknown` ทุกกรณี (ปลอดภัยแต่เสียงดัง)
7. ผู้ดูแลระบบบน production: F02 ต้องตั้งรหัสผ่าน `admin@example.test` (ไม่เผยในเอกสาร) หรือใช้ dev login ก่อนปิด · ตรวจว่า `E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD` ถูกเพิ่มลง `.env.example` (ตัวแปรใหม่: C1 เพิ่มเองใน S3)
8. จำนวน jobs ที่ `enqueue` ใน `saveMessage` + `core.deliver` ต่อข้อความ: ตรวจบน production ว่า queue ไม่สะสม (ดู `oldestQueuedAgeSeconds` หลังรัน Demo Chat 10 ข้อความ ควร < 3 วินาที)
9. `pg_column_size` CHECK บน `payload` ใช้ได้กับ jsonb: ตรวจตอนรัน migration 002 (ถ้า error ให้เปลี่ยนเป็นตรวจในโค้ดอย่างเดียว)
10. ตารางเวลา `planned` ใน §8.2 อาจเปลี่ยนเมื่อ F13, F15, F16, F17, F18, F21, F24, F26, F06 เขียนสเปกเสร็จ: ตรวจ `grep -n "everySeconds" docs/specs/*.md` ตอนเริ่ม S2 แล้วอัปเดต `EXPECTED_SCHEDULES`
