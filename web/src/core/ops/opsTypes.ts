import type { FeatureFlagView, JobState } from '@nless/shared/core/types';

// F35 §3 response models used by the browser. Mutation request bodies are typed at their call sites.
export const jobStates = ['queued', 'running', 'succeeded', 'failed', 'dead', 'cancelled'] as const satisfies readonly JobState[];

export interface OpsJobRow {
  id: string;
  type: string;
  state: JobState;
  businessId: string | null;
  attempts: number;
  maxAttempts: number;
  runAt: string;
  lastError: string | null;
}

export interface OpsJobDetail extends OpsJobRow {
  payloadView: Record<string, unknown>;
  result: Record<string, unknown> | null;
  lockKey: string | null;
  dedupKey: string | null;
}

export interface OpsSummary {
  demoResetting: boolean;
  counts: Record<JobState, number>;
  oldestQueuedAgeSeconds: number | null;
  dead24h: number;
  byType24h: { type: string; succeeded: number; dead: number; avgMs: number | null }[];
  worker: { enabled: boolean; running: boolean; inFlight: number; concurrency: number };
  scheduler: { enabled: boolean; holdsLock: boolean };
  deliveriesNeedingAttention: number;
}

export interface OpsDeliveryRow {
  messageId: string;
  businessId: string;
  channel: string;
  deliveryState: 'unknown' | 'failed';
  deliveryError: string | null;
  createdAt: string;
}

export interface OpsFeatureRow extends FeatureFlagView {
  tierOpen: boolean;
  routeCount: number;
}

export interface OpsScheduleRow {
  name: string;
  everySeconds: number;
  ownerFeature: string;
  source: 'registered' | 'expected_missing';
  status: 'declared' | 'planned';
  lastSlot: string | null;
  lastState: string | null;
  lastFinishedAt: string | null;
  lastError: string | null;
}

export interface OpsRouteRow {
  method: string;
  path: string;
  featureId: string;
  auth: string;
  permission: string | null;
  summary: string | null;
  placeholder: boolean;
}

export interface OpsBuild {
  sha: string;
  shortSha: string;
  env: string;
  schema: string;
  node: string;
  uptimeSeconds: number;
  startedAt: string;
  modelMode: 'openai' | 'fake';
  providerModes: Record<string, string>;
  featuresLoaded: number;
  db: { ok: boolean; latencyMs: number; poolTotal: number; poolIdle: number; poolWaiting: number };
  memoryMb: { rss: number; heapUsed: number };
  uploadDirWritable: boolean;
  demoResetEnabled: boolean;
  devLoginEnabled: boolean;
  mcpEnabled: boolean;
}

export interface OpsAuditRow {
  id: string;
  action: string;
  actorUserId: string | null;
  businessId: string | null;
  targetType: string | null;
  targetId: string | null;
  createdAt: string;
}

export interface DemoResetResult {
  ok: true;
  startedAt: string;
  durationMs: number;
  steps: { name: string; ok: boolean; ms: number; error?: string }[];
}
