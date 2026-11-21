import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { FEATURES } from '@nless/shared/core/features';
import type { FeatureId } from '@nless/shared/core/features';
import type { FeatureFlagView } from '@nless/shared/core/types';
import { audit } from './audit';
import { config, rootDir } from './config';
import { db } from './db';
import { AppError } from './errors';
import type { createHttpApp } from './http';
import { registerJob, registerSchedule } from './jobs';
import { log } from './log';
import type { FeatureRoutes } from './types';

export const defineFeatureRoutes = (definition: FeatureRoutes): FeatureRoutes => definition;

const registered = new WeakSet<FeatureRoutes>();
export async function loadFeatures({ api, app }: ReturnType<typeof createHttpApp>): Promise<Set<FeatureId>> {
  const loaded = new Set<FeatureId>(['F01', 'F35']);
  const mounts = [];
  for (const feature of FEATURES) {
    if (!feature.folder) continue;
    const location = join(rootDir, 'server', 'src', 'features', feature.slug, 'routes.ts');
    if (!existsSync(location)) continue;
    const { default: route } = await import(pathToFileURL(location).href) as { default: FeatureRoutes };
    if (route?.featureId !== feature.id || route.slug !== feature.slug) throw new Error('Invalid feature route registration for ' + feature.slug);
    await route.register(api(feature.id));
    if (!registered.has(route)) {
      for (const [type, handler] of Object.entries(route.jobs ?? {})) registerJob(type, handler);
      for (const schedule of route.schedules ?? []) registerSchedule(schedule, feature.id);
      registered.add(route);
    }
    if (route.mountExpress) mounts.push(route.mountExpress);
    loaded.add(feature.id);
  }
  for (const mount of mounts) mount(app);
  return loaded;
}

const selectable = FEATURES.filter((feature) => feature.folder);
const releaseDeferred = ['F18', 'F21'] as const;
const isReleaseDeferred = (id: string) => releaseDeferred.some((featureId) => featureId === id);
export async function initializeFlags() {
  await db.query(`INSERT INTO feature_flags (feature_id,hidden,reason)
    SELECT unnest($1::text[]),true,'Deferred for the LINE-only release'
    ON CONFLICT (feature_id) DO UPDATE SET hidden=true,reason=excluded.reason,updated_at=now()
    WHERE NOT feature_flags.hidden`, [releaseDeferred]);
  for (const entry of new Set(config.HIDDEN_FEATURES.split(/[\s,]+/).filter(Boolean))) {
    if (!selectable.some((feature) => feature.id === entry)) {
      log.warn('Ignoring unknown HIDDEN_FEATURES entry');
      continue;
    }
    await db.query("INSERT INTO feature_flags (feature_id,hidden,reason) VALUES ($1,true,'env HIDDEN_FEATURES') ON CONFLICT DO NOTHING", [entry]);
  }
}

export async function isFeatureHidden(featureId: FeatureId): Promise<boolean> {
  return Boolean((await db.maybeOne<{ hidden: boolean }>('SELECT hidden FROM feature_flags WHERE feature_id=$1', [featureId]))?.hidden);
}

export async function featureFlags(routes: ReturnType<typeof createHttpApp>['routes']): Promise<FeatureFlagView[]> {
  const { rows } = await db.query<{ feature_id: string; hidden: boolean; reason: string | null }>('SELECT feature_id,hidden,reason FROM feature_flags');
  const rowsById = new Map(rows.map((row) => [row.feature_id, row]));
  return selectable.map((feature) => {
    const value = rowsById.get(feature.id);
    const ownRoutes = routes.filter((route) => route.featureId === feature.id);
    const placeholder = ownRoutes.every((route) => route.summary === 'placeholder status');
    const hidden = value?.hidden ?? false;
    return {
      featureId: feature.id, slug: feature.slug, lane: feature.lane, tier: feature.tier, hidden,
      reason: value?.reason ?? null, placeholder, visible: !hidden && !(placeholder && config.NODE_ENV === 'production'),
    };
  });
}

export function assertFeatureVisibilityAllowed(featureId: string, hidden: boolean): void {
  if (!hidden && isReleaseDeferred(featureId)) throw new AppError('POLICY_BLOCKED', 'Feature is deferred for the LINE-only release', {
    details: { reason: 'release_scope' },
  });
}

export async function setFeatureFlag(actorUserId: string, featureId: string, hidden: boolean, reason?: string) {
  if (!selectable.some((feature) => feature.id === featureId)) throw new AppError('NOT_FOUND', 'Feature not found');
  assertFeatureVisibilityAllowed(featureId, hidden);
  await db.query(`INSERT INTO feature_flags (feature_id,hidden,reason,updated_by) VALUES ($1,$2,$3,$4)
    ON CONFLICT (feature_id) DO UPDATE SET hidden=excluded.hidden,reason=excluded.reason,
      updated_by=excluded.updated_by,updated_at=now()`, [featureId, hidden, reason ?? null, actorUserId]);
  await audit({ action: 'core.feature.toggle', actorUserId, targetType: 'feature', targetId: featureId, details: { featureId, hidden, reason: reason ?? null } });
}

export async function visiblePublicFeatures(routes: ReturnType<typeof createHttpApp>['routes']): Promise<string[]> {
  const publicIds = new Set<string>(routes.filter((route) =>
    route.auth === 'none' && route.path.startsWith('/api/v1/') && route.summary !== 'placeholder status',
  ).map((route) => route.featureId));
  return (await featureFlags(routes))
    .filter(({ featureId, visible }) => visible && publicIds.has(featureId))
    .map(({ featureId }) => featureId);
}
