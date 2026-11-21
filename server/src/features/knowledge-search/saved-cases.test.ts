import { randomUUID } from 'node:crypto';
import { SEED } from '@nless/shared/core/fixtures';
import { beforeAll, expect, it } from 'vitest';
import { db } from '../../core';
import { createTestAgent, loginAs } from '../../core/test-utils';

const bizA = SEED.businesses.find(({ alias }) => alias === 'biz_demo_a')!.id;
const bizB = SEED.businesses.find(({ alias }) => alias === 'biz_demo_b')!.id;
const faqA = SEED.knowledge.find(({ alias }) => alias === 'kn_a_faq')!;
const faqB = SEED.knowledge.find(({ businessAlias }) => businessAlias === 'biz_demo_b')!;
const ownerUser = SEED.users.find(({ alias }) => alias === 'owner_a')!;
const casesA = '/api/v1/businesses/' + bizA + '/knowledge-search/eval/cases';
const casesB = '/api/v1/businesses/' + bizB + '/knowledge-search/eval/cases';
const header = ['X-Requested-With', 'nless'] as const;
let owner: Awaited<ReturnType<typeof createTestAgent>>;
let staff: Awaited<ReturnType<typeof createTestAgent>>;
let other: Awaited<ReturnType<typeof createTestAgent>>;

beforeAll(async () => {
  owner = await createTestAgent();
  staff = await createTestAgent();
  other = await createTestAgent();
  await loginAs(owner, ownerUser.email);
  await loginAs(staff, SEED.users.find(({ alias }) => alias === 'staff_a')!.email);
  await loginAs(other, SEED.users.find(({ alias }) => alias === 'owner_b')!.email);
}, 20_000);

it('creates and evaluates cases with knowledge or no-hit expectations, then deletes once and audits safely', async () => {
  const query = 'ร้านเปิดกี่โมง';
  const created = (await owner.post(casesA).set(...header)
    .send({ query: ' ' + query + ' ', expectItemIds: [faqA.id, faqA.id.toUpperCase()] }).expect(201)).body.data;
  const none = (await owner.post(casesA).set(...header)
    .send({ query: 'syntheticofftopicx' + randomUUID().replaceAll('-', ''), expectNone: true }).expect(201)).body.data;
  try {
    expect(created).toMatchObject({ query, expectNone: false, expectItemIds: [faqA.id], expectTitles: [faqA.title] });
    expect(none).toMatchObject({ expectNone: true, expectItemIds: [], expectTitles: [] });
    const listed = (await staff.get(casesA).expect(200)).body.data.items;
    expect(listed).toEqual(expect.arrayContaining([created, none]));
    const evaluated = (await staff.post(casesA.replace('/cases', '/run')).set(...header)
      .send({ strategy: 'lexical', includeFixture: false }).expect(200)).body.data;
    expect(evaluated.perCase).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: created.id, source: 'saved', kind: 'positive', pass: true, rank: 1 }),
      expect.objectContaining({ id: none.id, source: 'saved', kind: 'none', pass: true }),
    ]));
    await staff.delete(casesA + '/' + created.id).set(...header).expect(403);
    await other.delete(casesB + '/' + created.id).set(...header).expect(404);
    const deletions = await Promise.all([1, 2].map(() => owner.delete(casesA + '/' + created.id).set(...header)));
    expect(deletions.map(({ status }) => status).sort()).toEqual([204, 404]);
    expect((await staff.get(casesA).expect(200)).body.data.items).not.toContainEqual(created);
    const { rows } = await db.query(`SELECT action,actor_user_id,target_type,target_id,details FROM audit_events
      WHERE business_id=$1 AND details->>'caseId'=$2 ORDER BY action`, [bizA, created.id]);
    expect(rows).toEqual(['create', 'delete'].map((action) => ({ action: 'knowledge-search.case.' + action,
      actor_user_id: ownerUser.id, target_type: 'business', target_id: bizA, details: { caseId: created.id } })));
  } finally {
    await owner.delete(casesA + '/' + none.id).set(...header).expect(204);
    await db.query('DELETE FROM retrieval_cases WHERE business_id=$1 AND id=$2', [bizA, created.id]);
  }
}, 25_000);

it('rejects unauthorised writes, invalid expectations and foreign or missing items without creating a row', async () => {
  const query = 'Synthetic rejected case ' + randomUUID();
  await staff.post(casesA).set(...header).send({ query, expectNone: true }).expect(403);
  await owner.post(casesA).set(...header).send({ query }).expect(400);
  await owner.post(casesA).set(...header).send({ query, expectItemIds: [faqA.id, faqB.id] }).expect(404);
  await owner.post(casesA).set(...header).send({ query, expectItemIds: [randomUUID()] }).expect(404);
  await owner.post(casesA).set(...header).send({ query, expectItemIds: Array(6).fill(faqA.id) }).expect(400);
  await owner.delete(casesA + '/not-an-id').set(...header).expect(404);
  expect(await db.maybeOne('SELECT 1 FROM retrieval_cases WHERE business_id=$1 AND query=$2', [bizA, query])).toBeNull();
}, 15_000);
