import { z } from 'zod';
import type { FeatureFlagView } from './types';
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
  demoResetting: boolean;
  deliveriesNeedingAttention: number;        // messages.delivery_state = 'unknown' ใน 7 วัน
}
export interface OpsScheduleRow {
  name: string; everySeconds: number; ownerFeature: string; source: 'registered' | 'expected_missing';
  status: 'declared' | 'planned';            // จาก expected-schedules.ts
  lastSlot: string | null; lastState: string | null; lastFinishedAt: string | null; lastError: string | null;
}
export interface OpsDeliveryRow {
  messageId: string; conversationId: string; businessId: string; channel: string;
  deliveryState: 'unknown' | 'failed' | 'sent' | 'pending'; deliveryError: string | null; createdAt: string;   // ไม่มีเนื้อหาข้อความ
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
