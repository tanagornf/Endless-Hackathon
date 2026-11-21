import { randomUUID } from 'node:crypto';
import { SEED } from '@nless/shared/core/fixtures';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { AppError, config, db, model } from '../../core';
import { createTestAgent, loginAs } from '../../core/test-utils';
import { INDEX_DIMENSIONS } from './config';
import { pruneQueryCache, queryCacheKey, queryEmbedding } from './embed-cache';
import { resetDemo } from './seed';

const businessA = SEED.businesses.find(({ alias }) => alias === 'biz_demo_a')!.id;
const businessB = SEED.businesses.find(({ alias }) => alias === 'biz_demo_b')!.id;
const ownerA = SEED.users.find(({ alias }) => alias === 'owner_a')!;
const originalModel = config.OPENAI_EMBED_MODEL;
const originalMode = config.MODEL_MODE;
const originalDimensions = config.EMBED_DIM;
const modelId = 'synthetic-query-embedding';
const values = Array.from({ length: INDEX_DIMENSIONS }, (_, index) => index === 0 ? 1 : 0);
let agent: Awaited<ReturnType<typeof createTestAgent>>;
let fakeResult: Awaited<ReturnType<typeof model.embed>>;
let query: string;

beforeAll(async () => {
  agent = await createTestAgent();
  await loginAs(agent, ownerA.email);
  fakeResult = await model.embed({ usage: { featureId: 'F07', purpose: 'test', businessId: businessA },
    texts: ['Synthetic cache response'], purpose: 'query' });
}, 20_000);

beforeEach(() => {
  query = 'Synthetic  Cache ' + randomUUID();
  config.MODEL_MODE = 'openai';
  config.OPENAI_EMBED_MODEL = modelId;
  config.EMBED_DIM = INDEX_DIMENSIONS;
});

afterEach(async () => {
  config.MODEL_MODE = originalMode;
  config.OPENAI_EMBED_MODEL = originalModel;
  config.EMBED_DIM = originalDimensions;
  vi.restoreAllMocks();
  await db.query('DELETE FROM knowledge_query_cache WHERE business_id=ANY($1::uuid[]) AND cache_key=ANY($2::text[])',
    [[businessA, businessB], [modelId, 'different-embedding'].map((id) => queryCacheKey(id, INDEX_DIMENSIONS, query))]);
});

function successfulEmbedding() {
  return vi.spyOn(model, 'embed').mockImplementation(async () => ({ ...fakeResult, mode: 'openai',
    model: config.OPENAI_EMBED_MODEL, dim: INDEX_DIMENSIONS, vectors: [values] }));
}

it('reports a normalized hit through the search API and scopes vectors by tenant, model and dimensions', async () => {
  const embed = successfulEmbedding();
  const search = (text: string) => agent.post('/api/v1/businesses/' + businessA + '/knowledge-search/search')
    .set('X-Requested-With', 'nless').send({ query: text, strategy: 'hybrid' }).expect(200);
  expect((await search(query)).body.data.cacheHit).toBe(false);
  const normalized = query.toUpperCase().replace(/ +/g, ' ');
  expect((await search(normalized)).body.data.cacheHit).toBe(true);
  expect(embed).toHaveBeenCalledTimes(1);
  expect(await queryEmbedding(businessB, normalized)).toMatchObject({ cacheHit: false, vector: { model: modelId } });
  config.OPENAI_EMBED_MODEL = 'different-embedding';
  expect(await queryEmbedding(businessA, query)).toMatchObject({ cacheHit: false, vector: { model: 'different-embedding' } });
  config.EMBED_DIM = 512;
  expect(await queryEmbedding(businessA, query)).toEqual({ vector: null, cacheHit: false });
  expect(queryCacheKey(modelId, 512, query)).not.toBe(queryCacheKey(modelId, INDEX_DIMENSIONS, query));
  expect(embed).toHaveBeenCalledTimes(3);
  const stored = await db.one<{ cache_key: string }>(
    'SELECT cache_key FROM knowledge_query_cache WHERE business_id=$1 AND cache_key=$2',
    [businessA, queryCacheKey(modelId, INDEX_DIMENSIONS, query)],
  );
  expect(stored.cache_key).toMatch(/^[a-f0-9]{64}$/);
});

it('refreshes an expired entry and prunes only expired rows in the selected tenant', async () => {
  const embed = successfulEmbedding();
  const key = queryCacheKey(modelId, INDEX_DIMENSIONS, query);
  await db.query(`INSERT INTO knowledge_query_cache (business_id,cache_key,embedding,created_at)
    VALUES ($1,$3,$4,now() - interval '15 days'),($2,$3,$4,now() - interval '15 days')`,
    [businessA, businessB, key, db.toVector(values)]);
  expect((await queryEmbedding(businessA, query)).cacheHit).toBe(false);
  expect((await queryEmbedding(businessA, query)).cacheHit).toBe(true);
  expect(embed).toHaveBeenCalledTimes(1);
  await pruneQueryCache(businessB);
  expect(await db.maybeOne('SELECT 1 FROM knowledge_query_cache WHERE business_id=$1 AND cache_key=$2', [businessB, key])).toBeNull();
  expect((await queryEmbedding(businessA, query)).cacheHit).toBe(true);
});

it('uses lexical search on provider errors and in fake mode without caching unusable embeddings', async () => {
  const embed = vi.spyOn(model, 'embed').mockRejectedValueOnce(new AppError('PROVIDER_BUDGET_EXHAUSTED', 'Synthetic limit'))
    .mockResolvedValueOnce({ ...fakeResult, model: modelId });
  const search = () => agent.post('/api/v1/businesses/' + businessA + '/knowledge-search/search')
    .set('X-Requested-With', 'nless').send({ query, strategy: 'hybrid' }).expect(200);
  expect((await search()).body.data).toMatchObject({ cacheHit: false, strategy: 'lexical' });
  expect((await search()).body.data).toMatchObject({ cacheHit: false, strategy: 'lexical' });
  config.MODEL_MODE = 'fake';
  expect((await search()).body.data).toMatchObject({ cacheHit: false, strategy: 'lexical', mode: 'fake' });
  expect(embed).toHaveBeenCalledTimes(2);
  expect(await db.maybeOne('SELECT 1 FROM knowledge_query_cache WHERE business_id=$1 AND cache_key=$2',
    [businessA, queryCacheKey(modelId, INDEX_DIMENSIONS, query)])).toBeNull();
});

it('clears demo query vectors with fixture requests, cases and runs in the same reset', async () => {
  const key = queryCacheKey(modelId, INDEX_DIMENSIONS, query);
  const shops = [businessA, businessB];
  const rollback = new Error('Restore unrelated test data after the reset assertion');
  await expect(db.tx(async (tx) => {
    for (const businessId of shops) {
      await tx.query('INSERT INTO knowledge_query_cache (business_id,cache_key,embedding) VALUES ($1,$2,$3)',
        [businessId, key, db.toVector(values)]);
      await tx.query(`INSERT INTO knowledge_fixture_requests (business_id,request_key) VALUES ($1,$2)
        ON CONFLICT (business_id) DO UPDATE SET request_key=EXCLUDED.request_key`, [businessId, randomUUID()]);
      await tx.query('INSERT INTO retrieval_cases (business_id,query,expect_none) VALUES ($1,$2,true)', [businessId, query]);
      await tx.query("INSERT INTO retrieval_runs (business_id,config,metrics,per_case) VALUES ($1,'{}','{}','[]')", [businessId]);
    }
    await resetDemo({ db: { ...db, ...tx, tx: (work) => work(tx) }, fixtures: SEED,
      id: (alias) => SEED.businesses.find((business) => business.alias === alias)!.id, log: () => {} });
    for (const table of ['knowledge_query_cache', 'knowledge_fixture_requests', 'retrieval_cases', 'retrieval_runs']) {
      expect(await tx.maybeOne(`SELECT 1 FROM ${table} WHERE business_id=ANY($1::uuid[]) LIMIT 1`, [shops])).toBeNull();
    }
    throw rollback;
  })).rejects.toBe(rollback);
});
