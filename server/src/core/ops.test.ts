import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { SEED } from '@nless/shared/core/fixtures';
import { closeDb, db } from './db';
import { createTestAgent, loginAs } from './test-utils';

const base = '/api/v1/ops';
const businessId = SEED.businesses[0].id;
const id = '00000000-0000-4000-8000-000000000001';
const paths = {
  get: ['/summary', '/jobs', '/jobs/' + id, '/schedules', '/deliveries', '/features', '/build', '/routes', '/audit'],
  post: ['/jobs/' + id + '/retry', '/jobs/' + id + '/cancel', '/jobs/retry-dead',
    '/deliveries/' + id + '/resolve', '/features/bulk', '/demo/reset'],
  put: ['/features/F13'],
};
let admin: Awaited<ReturnType<typeof createTestAgent>>;

beforeAll(async () => {
  admin = await createTestAgent();
  await loginAs(admin, 'admin@example.test');
});
afterAll(closeDb);

it.each([['owner.a@example.test', 403], ['staff.a@example.test', 403], ['', 401]] as const)(
  'enforces platform admin on every operations route for %s', async (email, status) => {
    const agent = await createTestAgent();
    if (email) await loginAs(agent, email);
    for (const path of paths.get) expect((await agent.get(base + path)).status, path).toBe(status);
    for (const path of paths.post) expect((await agent.post(base + path).set('X-Requested-With', 'nless')).status, path).toBe(status);
    for (const path of paths.put) expect((await agent.put(base + path).set('X-Requested-With', 'nless')).status, path).toBe(status);
  },
);

it('uses the current database admin bit and the core CSRF guard', async () => {
  const email = 'ops-privilege-' + randomUUID() + '@example.test';
  const { id: userId } = await db.one<{ id: string }>(
    "INSERT INTO users (email,display_name,is_platform_admin) VALUES ($1,'Test operator',true) RETURNING id", [email]);
  try {
    const operator = await createTestAgent();
    await loginAs(operator, email);
    await operator.get(base + '/summary').expect(200);
    await db.query('UPDATE users SET is_platform_admin=false WHERE id=$1', [userId]);
    await operator.get(base + '/summary').expect(403);
  } finally {
    await db.query('DELETE FROM users WHERE id=$1', [userId]);
  }
  expect((await admin.post(base + '/features/bulk').send({})).status).toBe(403);
});

it('provides live admin reads and a sanitized route catalog/build summary', async () => {
  for (const path of paths.get.filter((path) => path !== '/jobs/' + id)) {
    expect((await admin.get(base + path)).status, path).toBe(200);
  }
  const catalog = await admin.get(base + '/routes');
  const registered = await admin.get('/api/v1/_meta/routes').expect(200);
  expect(catalog.body.data.items).toEqual(expect.arrayContaining(registered.body.data.map((route: Record<string, unknown>) =>
    expect.objectContaining({
      method: route.method, path: route.path, featureId: route.featureId, auth: route.auth,
      placeholder: route.summary === 'placeholder status',
    }))));
  expect(catalog.body.data.items).toHaveLength(registered.body.data.length);
  const build = await admin.get(base + '/build');
  expect(build.text).not.toMatch(/"(?:[^"]*(?:key|secret|token|password)[^"]*)"\s*:/i);
  const publicBuild = await admin.get('/build-info');
  expect(build.body.data.sha).toBe(publicBuild.body.sha);
});

async function createJob(type: string, state: string, createdAt = '2026-11-21T08:00:00.123456Z') {
  return db.one<{ id: string }>(`INSERT INTO jobs
    (type,state,business_id,attempts,reschedules,last_error,payload,created_at)
    VALUES ($1,$2,$3,2,4,'synthetic failure', '{"secret":"synthetic private marker"}'::jsonb,$4)
    RETURNING id`, [type, state, businessId, createdAt]);
}

it('paginates jobs across microsecond precision, limits search, and redacts stored job detail', async () => {
  const type = 'test.ops.page';
  await createJob(type, 'succeeded');
  const newest = await createJob(type, 'dead', '2026-11-21T08:00:00.123456Z');
  const oldest = await createJob(type, 'dead', '2026-11-21T08:00:00.123455Z');
  const query = { type, state: 'dead', q: 'synthetic', businessId, limit: '1' };
  const first = await admin.get(base + '/jobs').query(query).expect(200);
  expect(first.body.data.items.map((item: { id: string }) => item.id)).toEqual([newest.id]);
  const second = await admin.get(base + '/jobs').query({ ...query, cursor: first.body.data.nextCursor }).expect(200);
  expect(second.body.data.items.map((item: { id: string }) => item.id)).toEqual([oldest.id]);
  expect(second.body.data.nextCursor).toBeNull();
  await admin.get(base + '/jobs').query({ cursor: 'e30' }).expect(400);
  const detail = await admin.get(base + '/jobs/' + newest.id).expect(200);
  expect(detail.body.data.payloadView).toHaveProperty('secret');
  expect(detail.text).not.toContain('synthetic private marker');
});

it('retries and cancels jobs, rejects invalid transitions, and audits successful changes', async () => {
  const type = 'test.ops.transitions';
  const dead = await createJob(type, 'dead');
  const jobRoute = base + '/jobs/';
  const retried = await admin.post(jobRoute + dead.id + '/retry').set('X-Requested-With', 'nless').expect(200);
  expect(retried.body.data).toMatchObject({ id: dead.id, state: 'queued', attempts: 0, reschedules: 0 });
  const cancelled = await admin.post(jobRoute + dead.id + '/cancel').set('X-Requested-With', 'nless').expect(200);
  expect(cancelled.body.data.state).toBe('cancelled');
  const forbiddenCancel = await admin.post(jobRoute + dead.id + '/cancel').set('X-Requested-With', 'nless').expect(422);
  expect(forbiddenCancel.body.error.details.reason).toBe('job_finished');
  for (const state of ['running', 'succeeded']) {
    const job = await createJob(type, state);
    const denied = await admin.post(jobRoute + job.id + '/retry').set('X-Requested-With', 'nless').expect(422);
    expect(denied.body.error.details.reason).toBe('job_running');
  }
  const { rows } = await db.query<{ action: string }>('SELECT action FROM audit_events WHERE target_id=$1 ORDER BY action', [dead.id]);
  expect(rows.map(({ action }) => action)).toEqual(['ops.job.cancel', 'ops.job.retry']);
});

it('filters and bounds bulk dead-letter retries', async () => {
  const type = 'test.ops.bulk';
  await createJob(type, 'dead');
  await createJob(type, 'dead');
  const unrelated = await createJob(type + '.other', 'dead');
  const response = await admin.post(base + '/jobs/retry-dead').set('X-Requested-With', 'nless')
    .send({ type, businessId, limit: 1 }).expect(200);
  expect(response.body.data.retried).toBe(1);
  const status = await db.one<{ state: string }>('SELECT state FROM jobs WHERE id=$1', [unrelated.id]);
  expect(status.state).toBe('dead');
  const audit = await admin.get(base + '/audit').query({ action: 'ops.job.retry-dead', businessId }).expect(200);
  expect(audit.body.data.items).toEqual(expect.arrayContaining([expect.objectContaining({ details: { type, count: 1 } })]));
});

it('prevalidates bulk feature flags and records one audit per feature plus the batch', async () => {
  const ids = ['F12', 'F13'];
  const before = await db.query<{ feature_id: string; hidden: boolean; reason: string | null; updated_by: string | null; updated_at: Date }>(
    'SELECT feature_id,hidden,reason,updated_by,updated_at FROM feature_flags WHERE feature_id=ANY($1::text[])', [ids]);
  const bulk = base + '/features/bulk';
  try {
    await admin.post(bulk).set('X-Requested-With', 'nless').send({ hide: ['F12'], show: ['F12'] }).expect(400);
    await admin.post(bulk).set('X-Requested-With', 'nless').send({ hide: ['F12', 'F35'] }).expect(400);
    const invalid = await db.query('SELECT feature_id,hidden,reason,updated_by,updated_at FROM feature_flags WHERE feature_id=ANY($1::text[])', [ids]);
    expect(invalid.rows).toEqual(before.rows);
    const reason = 'ops feature test ' + randomUUID();
    const flags = await admin.post(bulk).set('X-Requested-With', 'nless')
      .send({ hide: ['F12', 'F12'], show: ['F13'], reason }).expect(200);
    expect(flags.body.data.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ featureId: 'F12', hidden: true }), expect.objectContaining({ featureId: 'F13', hidden: false }),
    ]));
    const actions = await db.query<{ action: string }>(
      'SELECT action FROM audit_events WHERE details->>\'reason\'=$1 ORDER BY action', [reason]);
    expect(actions.rows.map(({ action }) => action)).toEqual(['core.feature.toggle', 'core.feature.toggle', 'ops.features.bulk']);
  } finally {
    await db.query('DELETE FROM feature_flags WHERE feature_id=ANY($1::text[])', [ids]);
    for (const row of before.rows) await db.query(
      'INSERT INTO feature_flags (feature_id,hidden,reason,updated_by,updated_at) VALUES ($1,$2,$3,$4,$5)',
      [row.feature_id, row.hidden, row.reason, row.updated_by, row.updated_at]);
  }
});

it('resolves ambiguous deliveries atomically and redacts the response and audit', async () => {
  const conversationId = SEED.conversations[0].id;
  const id = randomUUID();
  await db.query(`INSERT INTO messages
      (id,business_id,conversation_id,seq,direction,author,parts,text,channel,delivery_state,delivery_error)
    SELECT $1,$2,$3,COALESCE(max(seq),0)+1,'outbound','system','[]'::jsonb,
      'synthetic outbound content','web','unknown','Bearer testonly-secret-marker'
    FROM messages WHERE conversation_id=$3`, [id, businessId, conversationId]);
  const listed = await admin.get(base + '/deliveries').expect(200);
  expect(listed.body.data.items).toEqual(expect.arrayContaining([expect.objectContaining({ messageId: id })]));
  expect(listed.text).not.toContain('synthetic outbound content');
  expect(listed.text).not.toContain('testonly-secret-marker');
  expect(listed.body.data.items.find((row: { messageId: string }) => row.messageId === id)).not.toHaveProperty('parts');
  const resolveRoute = base + '/deliveries/' + id + '/resolve';
  const requests = await Promise.all(Array.from({ length: 2 }, () =>
    admin.post(resolveRoute).set('X-Requested-With', 'nless')
      .send({ resolution: 'resend', note: 'Bearer testonly-secret-marker' })));
  expect(requests.map((response) => response.status).sort()).toEqual([200, 422]);
  expect(requests.find((response) => response.status === 200)?.body.data.deliveryState).toBe('pending');
  expect(requests.find((response) => response.status === 422)?.body.error.details.reason).toBe('not_unknown');
  const queued = await db.one<{ dedup_key: string; lock_key: string; state: string }>(`
    SELECT dedup_key,lock_key,state FROM jobs WHERE type='core.deliver' AND payload->>'messageId'=$1`, [id]);
  expect(queued).toEqual({ dedup_key: 'deliver:' + id + ':resend-1', lock_key: 'conversation:' + conversationId, state: 'queued' });
  await db.query("UPDATE messages SET delivery_state='unknown' WHERE id=$1", [id]);
  const upperRoute = base + '/deliveries/' + id.toUpperCase() + '/resolve';
  await admin.post(upperRoute).set('X-Requested-With', 'nless').send({ resolution: 'resend' }).expect(200);
  const secondResend = await db.maybeOne('SELECT id FROM jobs WHERE dedup_key=$1', ['deliver:' + id + ':resend-2']);
  expect(secondResend).toBeTruthy();
  await db.query("UPDATE messages SET delivery_state='unknown' WHERE id=$1", [id]);
  const sent = await admin.post(resolveRoute).set('X-Requested-With', 'nless').send({ resolution: 'sent' }).expect(200);
  expect(sent.body.data.deliveryState).toBe('sent');
  const audit = await admin.get(base + '/audit').query({ action: 'core.delivery.resolve', businessId }).expect(200);
  expect(audit.body.data.items.filter((row: { targetId: string }) => row.targetId === id)).toHaveLength(3);
  expect(audit.text).not.toContain('testonly-secret-marker');
});
