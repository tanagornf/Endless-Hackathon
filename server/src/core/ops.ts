import { z } from 'zod';
import {
  AuditQuery, BulkFlagsBody, DeliveriesQuery, DemoResetBody, JobsQuery, ResolveDeliveryBody, RetryDeadBody, RoutesQuery,
} from '@nless/shared/core/ops';
import type { OpsBuild, OpsRouteRow, OpsScheduleRow, OpsSummary } from '@nless/shared/core/ops';
import { config, providerMode } from './config';
import { db, dbPool } from './db';
import { AppError } from './errors';
import { EXPECTED_SCHEDULES } from './expected-schedules';
import type { createHttpApp } from './http';
import { registeredSchedules } from './jobs';
import { BUILD_SHA } from './meta';
import { migrationStatus } from './migrate';
import { safeOpsText } from './ops-audit';
import { listOpsAudit, listOpsDeliveries, listOpsFeatures, resolveOpsDelivery, setOpsFeatures } from './ops-data';
import { changeOpsJob, getOpsJob, listOpsJobs, retryDeadOpsJobs, summarizeOpsJobs } from './ops-jobs';
import { isDemoResetting, runDemoReset } from './ops-reset';
import { schedulerState } from './scheduler';
import { checkStorage } from './storage';
import type { FeatureApi } from './types';
import { workerState } from './worker';

type Registry = ReturnType<typeof createHttpApp>['routes'];
const startedAt = new Date(Date.now() - process.uptime() * 1000).toISOString();
const uuid = z.string().uuid();
const admin = { auth: 'platform_admin' } as const;

function resourceId(input: string) {
  const result = uuid.safeParse(input);
  if (!result.success) throw new AppError('NOT_FOUND', 'Resource not found');
  return result.data.toLowerCase();
}

async function getOpsSummary(): Promise<OpsSummary> {
  const [stats, deliveries] = await Promise.all([
    summarizeOpsJobs(),
    db.one<{ count: number }>(`SELECT count(*)::int AS count FROM messages
      WHERE direction='outbound' AND delivery_state='unknown' AND created_at>=now()-interval '7 days'`),
  ]);
  const { enabled, holdsLock, lastTickAt } = schedulerState();
  return {
    ...stats, worker: workerState(), scheduler: { enabled, holdsLock, lastTickAt },
    deliveriesNeedingAttention: deliveries.count, demoResetting: isDemoResetting(),
  };
}

async function listOpsSchedules(): Promise<{ items: OpsScheduleRow[] }> {
  const expected = new Map(EXPECTED_SCHEDULES.map((schedule) => [schedule.name, schedule]));
  const registered = new Map(registeredSchedules().map((schedule) => [schedule.name, schedule]));
  const names = [...new Set([...expected.keys(), ...registered.keys()])].sort();
  const result = await db.query<Pick<OpsScheduleRow, 'lastSlot' | 'lastState' | 'lastFinishedAt' | 'lastError'> & { type: string }>(`
    SELECT DISTINCT ON (type) type, payload->>'slot' AS "lastSlot", state AS "lastState",
      finished_at AS "lastFinishedAt",last_error AS "lastError"
    FROM jobs WHERE type=ANY($1::text[]) ORDER BY type,created_at DESC,id DESC`, [names]);
  const byName = new Map(result.rows.map((row) => [row.type, row]));
  return { items: names.map((name) => {
    const actual = registered.get(name);
    const planned = expected.get(name);
    const row = byName.get(name);
    return {
      name, everySeconds: actual?.everySeconds ?? planned!.everySeconds,
      ownerFeature: actual?.ownerFeature ?? planned!.ownerFeature,
      source: actual ? 'registered' : 'expected_missing',
      status: planned?.status ?? 'declared', lastSlot: safeOpsText(row?.lastSlot ?? null, 100),
      lastState: row?.lastState ?? null, lastFinishedAt: row?.lastFinishedAt ?? null,
      lastError: safeOpsText(row?.lastError ?? null),
    };
  }) };
}

async function getOpsBuild(featuresLoaded: () => number): Promise<OpsBuild> {
  const pool = dbPool();
  const pingStarted = performance.now();
  const [ping, schema, uploadDirWritable] = await Promise.all([
    db.query('SELECT 1').then(() => ({ ok: true, latencyMs: Math.round(performance.now() - pingStarted) }),
      () => ({ ok: false, latencyMs: Math.round(performance.now() - pingStarted) })),
    migrationStatus().then((value) => value.schema ?? 'unknown', () => 'unknown'),
    checkStorage().then(() => true, () => false),
  ]);
  const memory = process.memoryUsage();
  return {
    sha: BUILD_SHA, shortSha: BUILD_SHA.slice(0, 7), env: config.NODE_ENV, schema, node: process.version,
    uptimeSeconds: Math.floor(process.uptime()), startedAt, modelMode: config.MODEL_MODE,
    providerModes: {
      line: providerMode('line'), meta: providerMode('meta'), google: providerMode('google'),
      payment: providerMode('payment'), slip: config.SLIP_VERIFY_MODE,
    },
    featuresLoaded: featuresLoaded(),
    db: { ...ping, poolTotal: pool.totalCount, poolIdle: pool.idleCount, poolWaiting: pool.waitingCount },
    memoryMb: { rss: Math.round(memory.rss / 1048576), heapUsed: Math.round(memory.heapUsed / 1048576) },
    uploadDirWritable, demoResetEnabled: config.DEMO_RESET_ENABLED,
    devLoginEnabled: config.DEV_LOGIN && config.DEV_LOGIN_ENABLED &&
      (config.NODE_ENV !== 'production' || config.DEV_LOGIN_TOKEN.length >= 24),
    mcpEnabled: config.MCP_ENABLED,
  };
}

function listOpsRoutes(routes: Registry, query: z.output<typeof RoutesQuery>): { items: OpsRouteRow[] } {
  const search = query.q?.toLowerCase() ?? '';
  const items = routes.filter((route) =>
    (!query.featureId || route.featureId === query.featureId) &&
    (!search || route.path.toLowerCase().includes(search) || route.featureId.toLowerCase().includes(search)),
  ).map((route) => ({
    method: route.method, path: route.path, featureId: route.featureId, auth: route.auth,
    permission: route.permission ?? null, summary: route.summary ?? null,
    placeholder: route.summary === 'placeholder status',
  }));
  return { items };
}

export function registerOpsRoutes(api: FeatureApi, routes: Registry, featuresLoaded: () => number) {
  api.get('/ops/summary', admin, getOpsSummary);
  api.get('/ops/jobs', { ...admin, query: JobsQuery }, ({ query }) => listOpsJobs(query));
  api.get('/ops/jobs/:id', admin, ({ params }) => getOpsJob(resourceId(params.id)));
  api.post('/ops/jobs/:id/retry', admin, ({ params, user }) => changeOpsJob(resourceId(params.id), 'retry', user!.id));
  api.post('/ops/jobs/:id/cancel', admin, ({ params, user }) => changeOpsJob(resourceId(params.id), 'cancel', user!.id));
  api.post('/ops/jobs/retry-dead', { ...admin, body: RetryDeadBody }, ({ body, user }) => retryDeadOpsJobs(body, user!.id));
  api.get('/ops/schedules', admin, listOpsSchedules);
  api.get('/ops/deliveries', { ...admin, query: DeliveriesQuery }, ({ query }) => listOpsDeliveries(query));
  api.post('/ops/deliveries/:messageId/resolve', { ...admin, body: ResolveDeliveryBody },
    ({ params, body, user }) => resolveOpsDelivery(resourceId(params.messageId), body, user!.id));
  // Lead board tier changes are not stored in the application. This display does not control access.
  api.get('/ops/features', admin, () => listOpsFeatures(routes, (tier) => tier === 'P0'));
  api.post('/ops/features/bulk', { ...admin, body: BulkFlagsBody }, ({ body, user }) => setOpsFeatures(routes, body, user!.id));
  api.get('/ops/build', admin, () => getOpsBuild(featuresLoaded));
  api.get('/ops/routes', { ...admin, query: RoutesQuery }, ({ query }) => Promise.resolve(listOpsRoutes(routes, query)));
  api.get('/ops/audit', { ...admin, query: AuditQuery }, ({ query }) => listOpsAudit(query));
  api.post('/ops/demo/reset', { ...admin, body: DemoResetBody }, ({ user }) => runDemoReset(user!.id));
}
