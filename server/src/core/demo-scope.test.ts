import { randomUUID } from 'node:crypto';
import { SEED } from '@nless/shared/core/fixtures';
import { afterAll, expect, test, vi } from 'vitest';
import { closeDb, db } from './db';
import { withDemoResetLock } from './demo';
import { jobs, registerJob } from './jobs';
import { drainJobs } from './worker';

afterAll(closeDb);

test('a demo reset lock pauses only fixture business claims across pooled connections', async () => {
  const owner = SEED.users.find(({ alias }) => alias === 'owner_a')!;
  const fixture = SEED.businesses.find(({ alias }) => alias === 'biz_demo_a')!;
  const accountId = randomUUID();
  const ordinaryId = randomUUID();
  const type = 'test.demo-reset-claim';
  await db.tx(async (tx) => {
    await tx.query('INSERT INTO accounts (id,name,owner_user_id) VALUES ($1,$2,$3)', [accountId, 'Reset test account', owner.id]);
    await tx.query('INSERT INTO businesses (id,account_id,name) VALUES ($1,$2,$3)', [ordinaryId, accountId, 'Ordinary test business']);
  });
  const run = vi.fn(async (businessId: string | null) => { expect(businessId).toBeTruthy(); });
  registerJob(type, async ({ businessId }) => run(businessId));
  const fixtureJob = await jobs.enqueue(type, {}, { businessId: fixture.id });
  const ordinaryJob = await jobs.enqueue(type, {}, { businessId: ordinaryId });
  try {
    await withDemoResetLock(async () => {
      await expect(withDemoResetLock(async () => {})).rejects.toMatchObject({
        code: 'POLICY_BLOCKED', details: { reason: 'reset_in_progress' },
      });
      expect(await drainJobs({ type })).toEqual({ ran: 1, dead: 0 });
      expect(run.mock.calls).toEqual([[ordinaryId]]);
      expect(await jobs.get(fixtureJob.jobId)).toMatchObject({ state: 'queued', attempts: 0 });
      expect(await jobs.get(ordinaryJob.jobId)).toMatchObject({ state: 'succeeded' });
    });
    expect(await drainJobs({ type })).toEqual({ ran: 1, dead: 0 });
    expect(run.mock.calls).toEqual([[ordinaryId], [fixture.id]]);
  } finally {
    await db.query('DELETE FROM jobs WHERE id=ANY($1::uuid[])', [[fixtureJob.jobId, ordinaryJob.jobId]]);
  }
}, 20_000);
