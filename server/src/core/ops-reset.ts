import { setTimeout as sleep } from 'node:timers/promises';
import { SEED } from '@nless/shared/core/fixtures';
import type { DemoResetResult } from '@nless/shared/core/ops';
import { config } from './config';
import { assertSafeDbName, db, dbUrl } from './db';
import { clearDemoData, seedDemoData, withDemoResetLock } from './demo';
import { opsAudit, opsPolicy } from './ops-audit';
import { assertRateLimit } from './ratelimit';
import { redactText } from './redact';
import { featureSeeds, seed, seedContext } from './seed';

const demoBusinessIds = SEED.businesses.map(({ id }) => id);
let demoResetting = false;

export function isDemoResetting(): boolean { return demoResetting; }

async function waitForDemoJobs() {
  const deadline = performance.now() + 10000;
  for (;;) {
    const active = await db.maybeOne<{ uncertain: boolean }>(`SELECT
      COALESCE(locked_until<=now(), true) AS uncertain
      FROM jobs WHERE business_id=ANY($1::uuid[]) AND state='running'
      ORDER BY locked_until ASC NULLS FIRST LIMIT 1`, [demoBusinessIds]);
    if (!active) return;
    const remaining = deadline - performance.now();
    // An expired lease does not prove the handler stopped or lost access to the fixture.
    if (active.uncertain || remaining <= 0) throw opsPolicy('reset_in_progress');
    await sleep(Math.min(500, remaining));
  }
}

async function cancelQueuedDemoJobs() {
  await db.query(`UPDATE jobs SET state='cancelled',updated_at=now(),finished_at=now(),
    claim_token=NULL,locked_by=NULL,locked_until=NULL
    WHERE business_id=ANY($1::uuid[]) AND state='queued'`, [demoBusinessIds]);
}

export async function runDemoReset(actorUserId: string): Promise<DemoResetResult> {
  if (!config.DEMO_RESET_ENABLED) throw opsPolicy('demo_reset_disabled');
  if (config.NODE_ENV !== 'production') assertSafeDbName(decodeURIComponent(new URL(dbUrl()).pathname.slice(1)));
  assertRateLimit({ key: 'demo-reset:global', limit: 3, windowSeconds: 600 });

  return withDemoResetLock(async () => {
    demoResetting = true;
    try {
      const startedAt = new Date().toISOString();
      const start = performance.now();
      await waitForDemoJobs();
      const steps: DemoResetResult['steps'] = [];
      const step = async (name: string, run: () => Promise<void>): Promise<boolean> => {
        const time = performance.now();
        try {
          await run();
          steps.push({ name, ok: true, ms: Math.round(performance.now() - time) });
          return true;
        } catch (error) {
          steps.push({
            name, ok: false, ms: Math.round(performance.now() - time),
            error: redactText(error instanceof Error ? error.message : 'Reset step failed', 300),
          });
          return false;
        }
      };
      await opsAudit(db, { action: 'core.demo.reset.start', actorUserId });
      try {
        if (await step('cancel_jobs', cancelQueuedDemoJobs) && await step('clear_demo_data', clearDemoData)) {
          const hooks = await step('load_feature_resets', async () => {
            const modules = (await featureSeeds()).reverse();
            for (const module of modules) {
              const reset = module.resetDemo;
              if (reset) await step('reset:' + module.default.featureId, () => reset(seedContext));
            }
          });
          if (hooks) {
            await step('seed', seed);
            await step('seed_demo', seedDemoData);
          }
        }
      } finally {
        await opsAudit(db, {
          action: 'core.demo.reset', actorUserId, details: { failedSteps: steps.filter((entry) => !entry.ok).length },
        });
      }
      return { ok: true as const, startedAt, durationMs: Math.round(performance.now() - start), steps };
    } finally {
      demoResetting = false;
    }
  });
}
