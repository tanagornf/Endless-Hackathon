import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { SEED } from '@nless/shared/core/fixtures';
import { config } from './config';
import { closeDb, db, dbPool } from './db';
import { createTestAgent, loginAs } from './test-utils';

const observed = vi.hoisted(() => ({ hooks: [] as string[], jobId: '' }));

vi.mock('./seed', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./seed')>();
  return {
    ...actual,
    async featureSeeds() {
      const rows = await actual.featureSeeds();
      return [
        ...rows,
        {
          default: { featureId: 'F08' },
          async resetDemo() { observed.hooks.push('F08'); },
        },
        {
          default: { featureId: 'F13' },
          async resetDemo() {
            observed.hooks.push('F13');
            throw new Error('Temporary Bearer reset-testsecret');
          },
        },
      ];
    },
  };
});

vi.mock('./demo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./demo')>();
  return {
    ...actual,
    async clearDemoData() {
      if (observed.jobId) {
        const { state } = await db.one<{ state: string }>('SELECT state FROM jobs WHERE id=$1', [observed.jobId]);
        expect(state).toBe('cancelled');
      }
      await actual.clearDemoData();
    },
  };
});

const base = '/api/v1/ops';
const fixture = SEED.businesses[0];
const actorUserId = SEED.users.find((user) => user.isPlatformAdmin)!.id;
let admin: Awaited<ReturnType<typeof createTestAgent>>;

beforeAll(async () => {
  admin = await createTestAgent();
  await loginAs(admin, 'admin@example.test');
});
afterAll(closeDb);

const reset = (confirm = 'RESET DEMO') =>
  admin.post(base + '/demo/reset').set('X-Requested-With', 'nless').send({ confirm });

it('validates reset confirmation and respects the environment switch', async () => {
  const previous = config.DEMO_RESET_ENABLED;
  config.DEMO_RESET_ENABLED = false;
  try {
    expect((await reset().expect(422)).body.error.details.reason).toBe('demo_reset_disabled');
    await reset('reset demo').expect(400);
  } finally {
    config.DEMO_RESET_ENABLED = previous;
  }
});

it('locks, safely resets and re-seeds only the demo businesses, and enforces the rate limit', async () => {
  const previous = config.DEMO_RESET_ENABLED;
  config.DEMO_RESET_ENABLED = true;
  const outside = randomUUID();
  try {
    const synthetic = await db.one<{ id: string }>(`INSERT INTO customers
      (business_id,channel,external_id,display_name) VALUES ($1,'web',$2,'synthetic extra') RETURNING id`, [fixture.id, randomUUID()]);
    await db.query('INSERT INTO businesses (id,account_id,name) SELECT $1,account_id,$2 FROM businesses WHERE id=$3',
      [outside, 'synthetic non-fixture', fixture.id]);
    const external = await db.one<{ id: string }>(`INSERT INTO customers
      (business_id,channel,external_id,display_name) VALUES ($1,'web',$2,'synthetic outside') RETURNING id`, [outside, randomUUID()]);
    observed.jobId = (await db.one<{ id: string }>("INSERT INTO jobs (business_id,type) VALUES ($1,'test.ops.reset') RETURNING id", [fixture.id])).id;
    const client = await dbPool().connect();
    try {
      await client.query("SELECT pg_advisory_lock(hashtext('nless.demo-reset'))");
      expect((await reset().expect(422)).body.error.details.reason).toBe('reset_in_progress');
    } finally {
      await client.query("SELECT pg_advisory_unlock(hashtext('nless.demo-reset'))");
      client.release();
    }
    const running = await db.one<{ id: string }>(`INSERT INTO jobs (business_id,type,state,locked_until)
      VALUES ($1,'test.ops.reset','running',now() + interval '2 minutes') RETURNING id`, [fixture.id]);
    const busy = await reset().expect(422);
    expect(busy.body.error.details.reason).toBe('reset_in_progress');
    expect(await db.maybeOne('SELECT id FROM customers WHERE id=$1', [synthetic.id])).toBeTruthy();
    expect(await db.one('SELECT state FROM jobs WHERE id=$1', [running.id])).toEqual({ state: 'running' });
    expect(await db.one('SELECT state FROM jobs WHERE id=$1', [observed.jobId])).toEqual({ state: 'queued' });
    await db.query('DELETE FROM jobs WHERE id=$1', [running.id]);

    const response = await reset().expect(200);
    expect(response.body.data).toMatchObject({ ok: true, durationMs: expect.any(Number) });
    expect(response.body.data.steps).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'cancel_jobs', ok: true }),
      expect.objectContaining({ name: 'clear_demo_data', ok: true }),
      expect.objectContaining({ name: 'reset:F13', ok: false, error: expect.stringContaining('[REDACTED]') }),
      expect.objectContaining({ name: 'reset:F08', ok: true }),
      expect.objectContaining({ name: 'seed', ok: true }),
      expect.objectContaining({ name: 'seed_demo', ok: true }),
    ]));
    expect(observed.hooks).toEqual(['F13', 'F08']);
    expect(await db.maybeOne('SELECT id FROM customers WHERE id=$1', [synthetic.id])).toBeNull();
    expect(await db.maybeOne('SELECT id FROM customers WHERE id=$1', [external.id])).toBeTruthy();
    expect(await db.maybeOne('SELECT id FROM businesses WHERE id=$1', [fixture.id])).toBeTruthy();
    expect(await db.maybeOne('SELECT id FROM conversations WHERE id=$1', [SEED.conversations[0].id])).toBeTruthy();
    expect(await db.maybeOne('SELECT id FROM jobs WHERE id=$1', [observed.jobId])).toBeNull();
    const audit = await db.query<{ action: string; actor_user_id: string }>(`SELECT action,actor_user_id FROM audit_events
      WHERE action IN ('core.demo.reset.start','core.demo.reset') AND actor_user_id=$1 ORDER BY created_at`, [actorUserId]);
    expect(audit.rows.map(({ action }) => action)).toEqual(['core.demo.reset.start', 'core.demo.reset']);
    await reset().expect(429);
  } finally {
    config.DEMO_RESET_ENABLED = previous;
    await db.query('DELETE FROM businesses WHERE id=$1', [outside]);
  }
}, 60000);
