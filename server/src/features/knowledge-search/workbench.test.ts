import { randomUUID } from 'node:crypto';
import { beforeAll, expect, it, vi } from 'vitest';
import { SEED } from '@nless/shared/core/fixtures';
import type { RetrievalCaseResult } from '@nless/shared/features/knowledge-search/types';
import { AppError, config, db, model } from '../../core';
import { createTestAgent, loginAs } from '../../core/test-utils';
import { computeRetrievalMetrics, resolveFixtureExpectation } from './eval';
import { retrievalSettings } from './search';

const bizA = SEED.businesses.find(({ alias }) => alias === 'biz_demo_a')!.id;
const bizB = SEED.businesses.find(({ alias }) => alias === 'biz_demo_b')!.id;
const faq = SEED.knowledge.find(({ alias }) => alias === 'kn_a_faq')!;
const rootA = '/api/v1/businesses/' + bizA + '/knowledge-search';
const rootB = '/api/v1/businesses/' + bizB + '/knowledge-search';
const header = ['X-Requested-With', 'nless'] as const;
let staffA: Awaited<ReturnType<typeof createTestAgent>>;
let ownerB: Awaited<ReturnType<typeof createTestAgent>>;

beforeAll(async () => {
  staffA = await createTestAgent();
  ownerB = await createTestAgent();
  await loginAs(staffA, SEED.users.find(({ alias }) => alias === 'staff_a')!.email);
  await loginAs(ownerB, SEED.users.find(({ alias }) => alias === 'owner_b')!.email);
}, 20_000);

it('serves scoped index status, real debug search and the exact source for staff', async () => {
  const status = await staffA.get(rootA + '/status').expect(200);
  expect(status.body.data).toMatchObject({ mode: 'fake', embedModel: 'fake-hash', embedDim: 1536 });
  expect(status.body.data.counts.ready).toBeGreaterThanOrEqual(3);
  expect(status.body.data.searchableItems).toBeGreaterThanOrEqual(3);
  const stale = await db.one<{ count: number }>(
    "SELECT count(*)::int AS count FROM knowledge_chunks WHERE business_id=$1 AND (embed_model<>'fake-hash' OR embed_dim<>1536)", [bizA],
  );
  expect(status.body.data.staleModelChunks).toBe(stale.count);
  const back = await staffA.post(rootA + '/search').set(...header)
    .send({ query: 'ร้านเปิดกี่โมง', strategy: 'lexical' }).expect(200);
  expect(back.body.data).toMatchObject({ strategy: 'lexical', mode: 'fake' });
  expect(back.body.data.hits[0]).toMatchObject({
    knowledgeItemId: faq.id, revision: 1, status: 'active', score: expect.any(Number),
    chunkText: expect.stringContaining('10:00'), debug: expect.objectContaining({ lex: expect.any(Number), cos: null }),
  });
  const sourceUrl = '/sources/' + faq.id + '/1';
  const source = await staffA.get(rootA + sourceUrl).expect(200);
  expect(source.body.data).toMatchObject({
    knowledgeItemId: faq.id, revision: 1, title: faq.title, body: faq.body, status: 'active', isCurrent: true,
    chunks: [expect.objectContaining({ text: expect.stringContaining('10:00') })],
  });
  await ownerB.get(rootB + sourceUrl).expect(404);
  await staffA.get(rootA + '/sources/' + faq.id + '/2147483648').expect(404);
  await staffA.get(rootB + '/status').expect(404);
}, 20_000);

it('validates strategy inputs and never returns the other tenant marker even below threshold', async () => {
  for (const body of [{ query: ' ' }, { query: 'X'.repeat(501) }, { query: 'ไทย', topK: 21 },
    { query: 'ไทย', weights: { vec: 0.6, lex: 0.4, c0: 0.4, c1: 0.4 } }]) {
    await staffA.post(rootA + '/search').set(...header).send(body).expect(400);
  }
  const foreign = await staffA.post(rootA + '/search').set(...header)
    .send({ query: 'TENANT_B_ONLY_OWL_482', strategy: 'vector', minScore: 0 }).expect(200);
  expect(foreign.body.data).toMatchObject({ hits: [], belowThreshold: [], mode: 'fake', strategy: 'lexical' });
  const english = await staffA.post(rootA + '/search').set(...header)
    .send({ query: 'What is your return policy?', strategy: 'lexical' }).expect(200);
  expect(english.body.data.hits[0]).toMatchObject({ title: 'นโยบายรับคืนสินค้า' });
}, 20_000);

it('compares identical cases and index scope while preserving older runs as unknown', async () => {
  const legacy = await db.one<{ id: string }>(
    'INSERT INTO retrieval_runs (business_id,config,metrics,per_case) VALUES ($1,$2::jsonb,$3::jsonb,\'[]\') RETURNING id',
    [bizA, JSON.stringify(retrievalSettings('lexical')), JSON.stringify(computeRetrievalMetrics([]))],
  );
  const request = () => staffA.post(rootA + '/eval/run').set(...header)
    .send({ strategy: 'hybrid', includeFixture: true, includeSaved: false });
  const first = (await request().expect(200)).body.data;
  expect(first.config.strategy).toBe('lexical');
  expect(first.config.embedModel).toBe('fake-hash');
  expect(first.metrics.cases).toBe(22);
  expect(first.coverage).toEqual({
    fixtureCasesPlanned: 49, fixtureCasesEvaluated: 22, savedCasesEvaluated: 0, unresolvedForbiddenCases: 0,
  });
  expect(first.strategyCounts).toEqual({ lexical: 22, vector: 0, hybrid: 0 });
  expect(first.comparison).toBe('unknown');
  expect(first.previous).toBeNull();
  expect(first.metrics.forbidPassRate).toBe(1);
  expect(Object.keys(first.metrics.byGroup).sort()).toEqual(['en', 'th', 'xlang']);
  expect(first.perCase).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'q01', kind: 'positive', source: 'fixture', group: 'th', pass: true, rank: 1, strategy: 'lexical' }),
    expect.objectContaining({ id: 'f01', kind: 'forbid', pass: true, topTitle: null }),
    expect.objectContaining({ id: 'x09', group: 'xlang' }),
  ]));
  const second = (await request().expect(200)).body.data;
  expect(second.id).not.toBe(first.id);
  expect(second.metrics).toEqual(first.metrics);
  expect(second.comparison).toBe('comparable');
  expect(second.previous).toEqual(first.metrics);
  const aRuns = await staffA.get(rootA + '/eval/runs?limit=3').expect(200);
  expect(aRuns.body.data.items[0]).toMatchObject({ id: second.id, coverage: first.coverage });
  expect(aRuns.body.data.items).toContainEqual(expect.objectContaining({ id: legacy.id, coverage: null, strategyCounts: null }));
  const bRuns = await ownerB.get(rootB + '/eval/runs').expect(200);
  expect(bRuns.body.data.items.map(({ id }: { id: string }) => id)).not.toContain(second.id);
  const updateVisibility = (searchable: boolean) => db.query(
    'UPDATE knowledge_chunks SET searchable=$3 WHERE business_id=$1 AND item_id=$2 AND revision=1',
    [bizA, faq.id, searchable],
  );
  await updateVisibility(false);
  try {
    const changed = (await request().expect(200)).body.data;
    expect(changed.metrics.cases).toBe(22);
    expect(changed.comparison).toBe('different_scope');
    expect(changed.previous).toBeNull();
  } finally {
    await updateVisibility(true);
  }
}, 40_000);

it('reads and measures saved cases only in the selected business', async () => {
  const aCase = randomUUID();
  const bCase = randomUUID();
  await db.query(
    `INSERT INTO retrieval_cases (id,business_id,query,expect_item_ids,expect_none)
    VALUES ($1,$2,$3,$4,false),($5,$6,$7,'{}',true)`,
    [aCase, bizA, 'TENANT_A_ONLY_FOX_731', [faq.id], bCase, bizB, 'ร้าน A เท่านั้น'],
  );
  const listed = await staffA.get(rootA + '/eval/cases').expect(200);
  expect(listed.body.data.items).toContainEqual(expect.objectContaining({ id: aCase, expectTitles: [faq.title] }));
  expect(listed.body.data.items).not.toContainEqual(expect.objectContaining({ id: bCase }));
  const evaluated = await staffA.post(rootA + '/eval/run').set(...header)
    .send({ strategy: 'lexical', includeFixture: false, includeSaved: true }).expect(200);
  expect(evaluated.body.data.perCase).toContainEqual(expect.objectContaining({ id: aCase, source: 'saved', pass: true }));
  expect(evaluated.body.data.perCase).not.toContainEqual(expect.objectContaining({ id: bCase }));
}, 20_000);

it('records the effective method of each case when one query falls back to words', async () => {
  const hybridCase = randomUUID();
  const fallbackCase = randomUUID();
  const fallbackQuery = 'English fallback check';
  await db.query(
    `INSERT INTO retrieval_cases (id,business_id,query,expect_item_ids,expect_none)
    VALUES ($1,$2,'Hybrid check',$3,false),($4,$2,$5,$3,false)`,
    [hybridCase, bizA, [faq.id], fallbackCase, fallbackQuery],
  );
  const baseline = await model.embed({
    usage: { featureId: 'F07', purpose: 'test', businessId: bizA }, texts: ['Synthetic runs'], purpose: 'query',
  });
  const original = config.MODEL_MODE;
  const embed = vi.spyOn(model, 'embed').mockImplementation(async (input) => {
    if (input.texts[0] === fallbackQuery) throw new AppError('PROVIDER_UNAVAILABLE', 'Synthetic provider fallback');
    return { ...baseline, mode: 'openai', model: 'fake-hash' };
  });
  try {
    config.MODEL_MODE = 'openai';
    const run = (await staffA.post(rootA + '/eval/run').set(...header)
      .send({ strategy: 'hybrid', includeFixture: false, includeSaved: true }).expect(200)).body.data;
    expect(run.perCase).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: hybridCase, strategy: 'hybrid' }),
      expect.objectContaining({ id: fallbackCase, strategy: 'lexical' }),
    ]));
    expect(run.strategyCounts.lexical).toBe(1);
    expect(run.strategyCounts.hybrid).toBe(run.perCase.length - 1);
  } finally {
    config.MODEL_MODE = original;
    embed.mockRestore();
  }
}, 20_000);

it('does not resolve a forbidden case when any of its aliases are missing', () => {
  const itemId = randomUUID();
  const ids = new Map([['known', itemId]]);
  const query = { id: 'forbid', business: 'A', text: 'Synthetic forbidden case', expect: [] };
  expect(resolveFixtureExpectation({ ...query, forbid: ['known', 'unavailable'] }, ids, new Set())).toBeNull();
  expect(resolveFixtureExpectation({ ...query, forbid: ['known'] }, ids, new Set()))
    .toEqual({ kind: 'forbid', itemIds: [itemId] });
});

it('computes grouped recall, reciprocal rank and independent none and forbidden pass rates', () => {
  const result = (id: string, kind: RetrievalCaseResult['kind'], group: RetrievalCaseResult['group'],
    pass: boolean, rank: number | null): RetrievalCaseResult =>
    ({ id, query: id, source: 'fixture', group, kind, rank, pass, topTitle: null, topScore: null });
  const metrics = computeRetrievalMetrics([
    result('one', 'positive', 'th', true, 1), result('two', 'positive', 'en', true, 4),
    result('none', 'none', 'xlang', true, null), result('forbid', 'forbid', 'th', false, null),
  ]);
  expect(metrics).toMatchObject({
    cases: 4, positives: 2, recallAt1: 0.5, recallAt3: 0.5, recallAt5: 1, mrr: 0.625,
    nonePassRate: 1, forbidPassRate: 0,
    byGroup: { th: { positives: 1, recallAt1: 1 }, en: { positives: 1, recallAt3: 0 }, xlang: { positives: 0, nonePassRate: 1 } },
  });
});
