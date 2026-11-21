import { randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { SEED } from '@nless/shared/core/fixtures';
import { createSession } from './auth';
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
const fixtureJobIds: string[] = [];
const fixtureMessageIds: string[] = [];

function newDeliveryFixtureId(id = randomUUID()): string {
  fixtureMessageIds.push(id);
  return id;
}

beforeAll(async () => {
  admin = await createTestAgent();
  await loginAs(admin, 'admin@example.test');
});
afterAll(async () => {
  try {
    await db.tx(async (tx) => {
      await tx.query(`DELETE FROM jobs WHERE id=ANY($1::uuid[]) OR
        (business_id=$3 AND type='core.deliver' AND payload->>'messageId'=ANY($2::text[]))`,
      [fixtureJobIds, fixtureMessageIds, businessId]);
      await tx.query('DELETE FROM messages WHERE business_id=$1 AND id=ANY($2::uuid[])', [businessId, fixtureMessageIds]);
    });
  } finally {
    await closeDb();
  }
});

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
    // The development login intentionally allows only seeded accounts.
    const sessionApp = express();
    sessionApp.post('/session', async (_req, res) => {
      await createSession(userId, 'password', res);
      res.sendStatus(204);
    });
    const issued = await request(sessionApp).post('/session').expect(204);
    const header: unknown = issued.headers['set-cookie'];
    const session = Array.isArray(header) ? header[0] : header;
    if (typeof session !== 'string') throw new Error('Test session cookie was not issued');
    const cookie = session.split(';', 1)[0];
    const operator = await createTestAgent();
    await operator.get(base + '/summary').set('Cookie', cookie).expect(200);
    await db.query('UPDATE users SET is_platform_admin=false WHERE id=$1', [userId]);
    await operator.get(base + '/summary').set('Cookie', cookie).expect(403);
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
  const job = await db.one<{ id: string }>(`INSERT INTO jobs
    (type,state,business_id,attempts,reschedules,last_error,payload,created_at)
    VALUES ($1,$2,$3,2,4,'synthetic failure', '{"secret":"synthetic private marker"}'::jsonb,$4)
    RETURNING id`, [type, state, businessId, createdAt]);
  fixtureJobIds.push(job.id);
  return job;
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
    try {
      const denied = await admin.post(jobRoute + job.id + '/retry').set('X-Requested-With', 'nless').expect(422);
      expect(denied.body.error.details.reason).toBe('job_running');
    } finally {
      // A synthetic running job must not keep the later demo-reset suite busy.
      await db.query('DELETE FROM jobs WHERE id=$1', [job.id]);
    }
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
    // Audit intentionally redacts phone-like digit runs. Use a stable marker for this query.
    const reason = 'ops bulk feature audit fixture';
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

it.each(['F18', 'F21'])('rejects a mixed bulk batch that tries to show %s without changing flags or auditing', async (restricted) => {
  const ids = ['F12', 'F13', restricted];
  const flagQuery = 'SELECT * FROM feature_flags WHERE feature_id=ANY($1::text[]) ORDER BY feature_id';
  const before = await db.query(flagQuery, [ids]);
  const reason = 'ops restricted feature audit fixture ' + restricted;

  const denied = await admin.post(base + '/features/bulk').set('X-Requested-With', 'nless')
    .send({ hide: ['F12'], show: ['F13', restricted], reason }).expect(422);
  expect(denied.body.error).toMatchObject({ code: 'POLICY_BLOCKED', details: { reason: 'release_scope' } });
  expect((await db.query(flagQuery, [ids])).rows).toEqual(before.rows);
  expect((await db.query("SELECT action FROM audit_events WHERE details->>'reason'=$1", [reason])).rows).toEqual([]);
});

it('resolves ambiguous deliveries atomically and redacts the response and audit', async () => {
  const conversationId = SEED.conversations[0].id;
  // The numeric run in this UUID exercises the audit target's redaction.
  const id = newDeliveryFixtureId('f3500000-0000-4000-8000-123456789012');
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
  const auditQuery = { action: 'core.delivery.resolve', businessId, limit: 2 };
  const audit = await admin.get(base + '/audit').query(auditQuery).expect(200);
  expect(audit.body.data.items).toEqual([
    expect.objectContaining({ details: { resolution: 'sent', note: null } }),
    expect.objectContaining({ details: { resolution: 'resend', note: null } }),
  ]);
  const { nextCursor } = audit.body.data;
  expect(nextCursor).toEqual(expect.any(String));
  const next = await admin.get(base + '/audit').query({ ...auditQuery, cursor: nextCursor }).expect(200);
  expect(next.body.data.items).toEqual([
    expect.objectContaining({ details: { resolution: 'resend', note: '[REDACTED]' } }),
  ]);
  expect(next.body.data.nextCursor).toBeNull();
  expect(audit.text + next.text).not.toContain('testonly-secret-marker');
});

it('blocks LINE resend without changing the ambiguous message or enqueuing a job', async () => {
  const conversation = SEED.conversations.find((entry) => entry.channel === 'line' && entry.businessAlias === 'biz_demo_a')!;
  const messageId = newDeliveryFixtureId();
  await db.query(`INSERT INTO messages
      (id,business_id,conversation_id,seq,direction,author,parts,channel,delivery_state)
    SELECT $1,$2,$3,COALESCE(max(seq),0)+1,'outbound','system','[]'::jsonb,'line','unknown'
    FROM messages WHERE conversation_id=$3`, [messageId, businessId, conversation.id]);
  const route = base + '/deliveries/' + messageId + '/resolve';
  const denied = await admin.post(route).set('X-Requested-With', 'nless').send({ resolution: 'resend' }).expect(422);
  expect(denied.body.error.details.reason).toBe('line_resend_unavailable');
  expect(await db.one('SELECT delivery_state FROM messages WHERE id=$1', [messageId])).toEqual({ delivery_state: 'unknown' });
  expect(await db.maybeOne("SELECT id FROM jobs WHERE type='core.deliver' AND payload->>'messageId'=$1", [messageId])).toBeNull();
  expect(await db.maybeOne("SELECT id FROM audit_events WHERE action='core.delivery.resolve' AND target_id=$1", [messageId])).toBeNull();
  const resolution = await admin.post(route).set('X-Requested-With', 'nless').send({ resolution: 'failed' }).expect(200);
  expect(resolution.body.data.deliveryState).toBe('failed');
});

it.each([
  ['facebook', 'sent'],
  ['instagram', 'failed'],
] as const)('blocks %s resend without writing a message, job, or audit', async (channel, resolution) => {
  const customerId = randomUUID();
  const messageId = newDeliveryFixtureId();
  try {
    await db.query(`WITH customer AS (
        INSERT INTO customers (id,business_id,channel,external_id)
        VALUES ($1::uuid,$2,$3,$1::uuid::text) RETURNING id
      ), conversation AS (
        INSERT INTO conversations (business_id,customer_id,channel)
        SELECT $2,id,$3 FROM customer RETURNING id
      )
      INSERT INTO messages (id,business_id,conversation_id,seq,direction,author,parts,channel,
        delivery_state,delivery_error,delivery_external_ref)
      SELECT $4,$2,id,1,'outbound','system','[]'::jsonb,$3,'unknown','synthetic ambiguity','synthetic-ref'
      FROM conversation`, [customerId, businessId, channel, messageId]);

    const messageQuery = 'SELECT * FROM messages WHERE id=$1 AND business_id=$2';
    const before = await db.one(messageQuery, [messageId, businessId]);
    const route = base + '/deliveries/' + messageId + '/resolve';
    const denied = await admin.post(route).set('X-Requested-With', 'nless').send({ resolution: 'resend' }).expect(422);
    expect(denied.body.error).toMatchObject({ code: 'POLICY_BLOCKED', details: { reason: 'channel_deferred' } });
    expect(await db.one(messageQuery, [messageId, businessId])).toEqual(before);
    expect(await db.maybeOne("SELECT id FROM jobs WHERE type='core.deliver' AND payload->>'messageId'=$1", [messageId])).toBeNull();
    expect(await db.maybeOne("SELECT id FROM audit_events WHERE action='core.delivery.resolve' AND target_id=$1", [messageId])).toBeNull();

    const result = await admin.post(route).set('X-Requested-With', 'nless').send({ resolution }).expect(200);
    expect(result.body.data.deliveryState).toBe(resolution);
  } finally {
    await db.query('DELETE FROM customers WHERE id=$1 AND business_id=$2', [customerId, businessId]);
  }
});

it.each([
  ['queued', null, 'failed'],
  ['running', 'inflight:1', 'unknown'],
] as const)('settles a cancelled %s delivery job with checkpoint %s as %s', async (jobState, checkpoint, deliveryState) => {
  const conversationId = SEED.conversations[0].id;
  const messageId = newDeliveryFixtureId();
  await db.query(`INSERT INTO messages
      (id,business_id,conversation_id,seq,direction,author,parts,channel,delivery_state,delivery_error)
    SELECT $1,$2,$3,COALESCE(max(seq),0)+1,'outbound','system','[]'::jsonb,'web','pending',$4
    FROM messages WHERE conversation_id=$3`, [messageId, businessId, conversationId, checkpoint]);
  const job = await db.one<{ id: string }>(`INSERT INTO jobs (type,business_id,state,payload,dedup_key)
    VALUES ('core.deliver',$1,$2,jsonb_build_object('messageId',$3::text),$4) RETURNING id`,
    [businessId, jobState, messageId, 'deliver:' + messageId]);
  const cancelled = await admin.post(base + '/jobs/' + job.id + '/cancel').set('X-Requested-With', 'nless').expect(200);
  expect(cancelled.body.data.state).toBe('cancelled');
  expect(await db.one('SELECT delivery_state FROM messages WHERE id=$1', [messageId])).toEqual({
    delivery_state: deliveryState,
  });
});

it('rejects generic retry of terminal deliveries and bulk retries a pending delivery instead', async () => {
  const conversationId = SEED.conversations[0].id;
  const sample = new Map<string, string>();
  for (const [state, timestamp] of [
    ['unknown', '1999-01-01T00:00:00Z'],
    ['failed', '1999-01-02T00:00:00Z'],
    ['pending', '2000-01-01T00:00:00Z'],
  ]) {
    const messageId = newDeliveryFixtureId();
    await db.query(`INSERT INTO messages
        (id,business_id,conversation_id,seq,direction,author,parts,channel,delivery_state)
      SELECT $1,$2,$3,COALESCE(max(seq),0)+1,'outbound','system','[]'::jsonb,'web',$4
      FROM messages WHERE conversation_id=$3`, [messageId, businessId, conversationId, state]);
    const job = await db.one<{ id: string }>(`INSERT INTO jobs (type,business_id,state,payload,dedup_key,created_at)
      VALUES ('core.deliver',$1,'dead',jsonb_build_object('messageId',$2::text),$3,$4) RETURNING id`,
      [businessId, messageId, 'deliver:' + messageId, timestamp]);
    sample.set(state, job.id);
  }
  for (const state of ['unknown', 'failed']) {
    const route = base + '/jobs/' + sample.get(state) + '/retry';
    const denied = await admin.post(route).set('X-Requested-With', 'nless').expect(422);
    expect(denied.body.error.details.reason).toBe('delivery_not_pending');
  }
  const result = await admin.post(base + '/jobs/retry-dead').set('X-Requested-With', 'nless')
    .send({ businessId, type: 'core.deliver', limit: 1 }).expect(200);
  expect(result.body.data.retried).toBe(1);
  for (const [state, jobId] of sample) {
    expect(await db.one('SELECT state FROM jobs WHERE id=$1', [jobId])).toEqual({
      state: state === 'pending' ? 'queued' : 'dead',
    });
  }
});
