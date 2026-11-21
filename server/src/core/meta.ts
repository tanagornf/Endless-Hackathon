import { execFileSync } from 'node:child_process';
import type { Application } from 'express';
import { config, providerMode, rootDir } from './config';
import { db } from './db';
import { AppError } from './errors';
import { migrationStatus } from './migrate';
import { checkStorage } from './storage';

function buildSha(): string {
  if (config.BUILD_SHA || config.RENDER_GIT_COMMIT) return config.BUILD_SHA || config.RENDER_GIT_COMMIT;
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: rootDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { return 'unknown'; }
}
const sha = buildSha();
let draining = false;
export function markDraining(): void { draining = true; }

export function mountMeta(app: Application, features: () => number) {
  app.get(['/healthz', '/health/live'], async (_req, res) => {
    try { await db.query('SELECT 1'); }
    catch { throw new AppError('SERVICE_NOT_READY', 'Database unavailable', { retryable: true }); }
    res.json({ status: 'ok', db: 'ok' });
  });
  app.get(['/readyz', '/health/ready'], async (_req, res) => {
    if (draining) { res.status(503).json({ status: "draining" }); return; }
    try {
      if (features() < 2 || (await migrationStatus()).pending > 0) throw Error('Application unavailable');
      await checkStorage();
    } catch { throw new AppError('SERVICE_NOT_READY', 'Application is starting', { retryable: true }); }
    res.json({ status: 'ready' });
  });
  app.get('/build-info', async (_req, res) => {
    const schema = await migrationStatus().then((state) => state.schema, () => null);
    const models = {
      chat: config.OPENAI_CHAT_MODEL, fast: config.OPENAI_CHAT_MODEL_FAST, strong: config.OPENAI_CHAT_MODEL_STRONG,
      embed: config.OPENAI_EMBED_MODEL, moderate: config.OPENAI_MODERATION_MODEL, transcribe: config.OPENAI_TRANSCRIBE_MODEL,
      realtime: config.OPENAI_REALTIME_MODEL,
    };
    res.json({
      sha, lane: config.LANE, env: config.NODE_ENV, schema, modelMode: config.MODEL_MODE, models, featuresLoaded: features(),
      providerModes: { line: providerMode('line'), meta: providerMode('meta'), google: providerMode('google'), payment: providerMode('payment'), slip: config.SLIP_VERIFY_MODE },
    });
  });
}
