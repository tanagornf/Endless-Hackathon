import { setTimeout as wait } from 'node:timers/promises';
import { beforeAll, expect, it } from 'vitest';
import { SEED } from '@nless/shared/core/fixtures';
import { drainJobs, jobs } from '../../core';
import { createTestAgent, loginAs } from '../../core/test-utils';
import { createKnowledgeItem, deleteKnowledgeItem, getKnowledgeItem } from '../knowledge/service';
import { FIXTURE_JOB } from './fixture-job';
import { listBusinessKnowledge } from './workbench';

const businessA = SEED.businesses.find(({ alias }) => alias === 'biz_demo_a')!;
const businessB = SEED.businesses.find(({ alias }) => alias === 'biz_demo_b')!;
const ownerA = SEED.users.find(({ alias }) => alias === 'owner_a')!;
const ownerB = SEED.users.find(({ alias }) => alias === 'owner_b')!;
const staffA = SEED.users.find(({ alias }) => alias === 'staff_a')!;
const rootA = '/api/v1/businesses/' + businessA.id + '/knowledge-search';
const rootB = '/api/v1/businesses/' + businessB.id + '/knowledge-search';
const header = ['X-Requested-With', 'nless'] as const;
let owner: Awaited<ReturnType<typeof createTestAgent>>;
let other: Awaited<ReturnType<typeof createTestAgent>>;
let staff: Awaited<ReturnType<typeof createTestAgent>>;

beforeAll(async () => {
  owner = await createTestAgent();
  other = await createTestAgent();
  staff = await createTestAgent();
  await loginAs(owner, ownerA.email);
  await loginAs(other, ownerB.email);
  await loginAs(staff, staffA.email);
}, 20_000);

const load = () => owner.post(rootA + '/fixture/load').set(...header).send({});
const remove = () => owner.post(rootA + '/fixture/remove').set(...header).send({});
const fixtureItems = async () => (await listBusinessKnowledge(businessA.id)).filter((item) => item.source === 'fixture');

async function finishWithOneWorker(jobId: string) {
  const deadline = Date.now() + 80_000;
  while (Date.now() < deadline) {
    await drainJobs({ maxMs: Math.max(1, deadline - Date.now()) });
    const job = await jobs.get(jobId);
    if (job?.state === 'succeeded' || job?.state === 'dead' || job?.state === 'failed' || job?.state === 'cancelled') return job;
    await wait(200);
  }
  throw new Error('The fixture job did not settle in time');
}

it('limits sample-loading operations to authorised Demo A merchants', async () => {
  await staff.post(rootA + '/fixture/load').set(...header).send({}).expect(403);
  await staff.post(rootA + '/fixture/remove').set(...header).send({}).expect(403);
  const denied = await other.post(rootB + '/fixture/load').set(...header).send({}).expect(422);
  expect(denied.body.error).toMatchObject({ code: 'POLICY_BLOCKED', details: { reason: 'demo_only' } });
  await other.post(rootB + '/fixture/remove').set(...header).send({}).expect(422);
}, 20_000);

it('loads, indexes and activates all samples through one worker, with deduplication and scoped removal', async () => {
  const actor = { userId: ownerA.id };
  const manual = await createKnowledgeItem(businessA.id, actor,
    { title: 'วิธีชำระเงิน', body: 'Manual synthetic record', kind: 'article', folderId: null });
  try {
    const [left, right] = await Promise.all([load().expect(202), load().expect(202)]);
    const jobId = left.body.data.jobId;
    expect(right.body.data.jobId).toBe(jobId);
    const done = await finishWithOneWorker(jobId);
    expect(done).toMatchObject({ type: FIXTURE_JOB, state: 'succeeded', progress: { done: 12, total: 12 } });
    const first = await fixtureItems();
    expect(first).toHaveLength(12);
    expect(first.every((item) => item.status === 'active' && item.indexState === 'ready')).toBe(true);
    expect(first.some((item) => item.id === manual.id)).toBe(false);
    const qa = await owner.post(rootA + '/eval/run').set(...header)
      .send({ strategy: 'lexical', includeFixture: true, includeSaved: false }).expect(200);
    expect(qa.body.data.coverage).toMatchObject({ fixtureCasesPlanned: 49, fixtureCasesEvaluated: 49 });
    expect(qa.body.data.metrics.forbidPassRate).toBe(1);
    expect(qa.body.data.metrics.byGroup.th.recallAt5).toBeGreaterThanOrEqual(0.85);
    const replay = await load().expect(202);
    expect((await finishWithOneWorker(replay.body.data.jobId)).state).toBe('succeeded');
    expect((await fixtureItems()).map((item) => item.id).sort()).toEqual(first.map((item) => item.id).sort());
    expect((await remove().expect(200)).body.data).toEqual({ removed: 12 });
    expect((await remove().expect(200)).body.data).toEqual({ removed: 0 });
    expect(await fixtureItems()).toEqual([]);
    expect(await getKnowledgeItem(businessA.id, manual.id)).toMatchObject({ source: 'manual', status: 'draft' });
  } finally {
    await remove().expect(200);
    await deleteKnowledgeItem(businessA.id, actor, manual.id);
  }
}, 100_000);

it('fences a queued loader when the user removes the sample set', async () => {
  const queued = await load().expect(202);
  expect((await remove().expect(200)).body.data).toEqual({ removed: 0 });
  expect((await finishWithOneWorker(queued.body.data.jobId)).state).toBe('succeeded');
  expect(await fixtureItems()).toEqual([]);
}, 35_000);
