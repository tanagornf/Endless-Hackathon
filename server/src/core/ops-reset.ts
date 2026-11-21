import { setTimeout as sleep } from 'node:timers/promises';
import type { DemoResetResult } from '@nless/shared/core/ops';
import { config } from './config';
import { db } from './db';
import { clearDemoData, seedDemoData, withDemoResetLock } from './demo';
import { DEMO_BUSINESS_IDS, DEMO_RESET_LOCK } from './demo-scope';
import { opsAudit, opsPolicy } from './ops-audit';
import { assertRateLimit } from './ratelimit';
import { redactText } from './redact';
import { featureSeeds, seed, seedContext } from './seed';

let demoResetting = false;

export async function isDemoResetting(): Promise<boolean> {
  if (demoResetting) return true;
  // PostgreSQL stores the bigint advisory-lock key in the high/low OID fields.
  const { resetting } = await db.one<{ resetting: boolean }>(`
    WITH reset_key AS (SELECT hashtext($1)::bigint AS value)
    SELECT EXISTS (
      SELECT 1 FROM pg_locks,reset_key
      WHERE locktype='advisory' AND mode='ExclusiveLock' AND granted
        AND database=(SELECT oid FROM pg_database WHERE datname=current_database())
        AND objsubid=1 AND classid::bigint=((value >> 32) & 4294967295)
        AND objid::bigint=(value & 4294967295)
    ) AS resetting`, [DEMO_RESET_LOCK]);
  return resetting;
}

async function waitForDemoJobs() {
  const deadline = performance.now() + 10000;
  for (;;) {
    const active = await db.maybeOne<{ uncertain: boolean }>(`SELECT
      COALESCE(locked_until<=now(), true) AS uncertain
      FROM jobs WHERE business_id=ANY($1::uuid[]) AND state='running'
      ORDER BY locked_until ASC NULLS FIRST LIMIT 1`, [DEMO_BUSINESS_IDS]);
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
    WHERE business_id=ANY($1::uuid[]) AND state='queued'`, [DEMO_BUSINESS_IDS]);
}

export async function runDemoReset(actorUserId: string): Promise<DemoResetResult> {
  if (!config.DEMO_RESET_ENABLED) throw opsPolicy('demo_reset_disabled');
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
          let modules: Awaited<ReturnType<typeof featureSeeds>> = [];
          const loaded = await step('load_feature_resets', async () => { modules = await featureSeeds(); });
          if (loaded) {
            for (const module of modules.reverse()) {
              const reset = module.resetDemo;
              if (reset) await step('reset:' + module.default.featureId, () => reset(seedContext));
            }
            await step('seed', seed);
            await step('seed_demo', async () => {
              const failures: string[] = [];
              await seedDemoData((featureId, error) => {
                const message = error instanceof Error ? error.message : 'Demo seed failed';
                failures.push(featureId + ': ' + redactText(message, 100));
              });
              if (failures.length) throw new Error(failures.join(', '));
            });
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
