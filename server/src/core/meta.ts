import { execFileSync } from 'node:child_process';
import type { Application } from 'express';
import { FEATURES } from '@nless/shared/core/features';
import { config, providerMode, rootDir } from './config';
import { db } from './db';
import { AppError } from './errors';
import { migrationStatus } from './migrate';
import { schedulerState } from './scheduler';
import { checkStorage } from './storage';
import { workerState } from './worker';

function buildSha(): string {
  if (config.BUILD_SHA || config.RENDER_GIT_COMMIT) return config.BUILD_SHA || config.RENDER_GIT_COMMIT;
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: rootDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { return 'unknown'; }
}
export const BUILD_SHA = buildSha();
const startedAt = new Date().toISOString();
let draining = false;
export function markDraining(): void { draining = true; }

export function mountMeta(app: Application, features: () => number) {
  app.get(['/healthz', '/health/live'], async (_req, res) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        db.query('SELECT 1'),
        new Promise<never>((_resolve, reject) => { timer = setTimeout(reject, 2000); }),
      ]);
    } catch { throw new AppError('SERVICE_NOT_READY', 'Database unavailable', { retryable: true }); }
    finally { clearTimeout(timer); }
    res.json({ status: 'ok', db: 'ok' });
  });
  app.get(['/readyz', '/health/ready'], async (_req, res) => {
    if (draining) { res.status(503).json({ status: "draining" }); return; }
    const [migrations, storage] = await Promise.allSettled([migrationStatus(), checkStorage()]);
    const { enabled, running, lastPollAt } = workerState();
    const worker = { enabled, running, lastPollAt };
    const scheduler = schedulerState();
    const failed: string[] = [];
    const now = Date.now();
    if (features() !== FEATURES.length) failed.push('features');
    if (migrations.status === 'rejected' || migrations.value.pending > 0) failed.push('migrations');
    if (storage.status === 'rejected') failed.push('uploadDir');
    if (enabled && (!running || !lastPollAt || now - Date.parse(lastPollAt) > 30_000)) failed.push('worker');
    const anotherScheduler = scheduler.observedOtherAt && now - Date.parse(scheduler.observedOtherAt) <= 60_000;
    if (scheduler.enabled && !scheduler.holdsLock && !anotherScheduler) failed.push('scheduler');
    if (failed.length) throw new AppError('SERVICE_NOT_READY', 'Application is starting', { retryable: true, details: { failed } });
    res.json({ status: 'ready', worker, scheduler, migrations: migrations.status === 'fulfilled' ? migrations.value : null, uploadDir: 'ok' });
  });
  app.get('/build-info', async (_req, res) => {
    const schema = await migrationStatus().then((state) => state.schema, () => null);
    const models = {
      chat: config.OPENAI_CHAT_MODEL, fast: config.OPENAI_CHAT_MODEL_FAST, strong: config.OPENAI_CHAT_MODEL_STRONG,
      embed: config.OPENAI_EMBED_MODEL, moderate: config.OPENAI_MODERATION_MODEL, transcribe: config.OPENAI_TRANSCRIBE_MODEL,
      realtime: config.OPENAI_REALTIME_MODEL,
    };
    res.json({
      sha: BUILD_SHA, startedAt, lane: config.LANE, env: config.NODE_ENV, schema, modelMode: config.MODEL_MODE, models, featuresLoaded: features(),
      providerModes: { line: providerMode('line'), meta: providerMode('meta'), google: providerMode('google'), payment: providerMode('payment'), slip: config.SLIP_VERIFY_MODE },
    });
  });
}
