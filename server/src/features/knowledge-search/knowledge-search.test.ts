import { setTimeout as delay } from 'node:timers/promises';
import { describe, expect, it, vi } from 'vitest';
import { SEED } from '@nless/shared/core/fixtures';
import { evidenceIdOf, parseEvidenceId } from '@nless/shared/features/knowledge-search/types';
import { AppError, config, db, drainJobs, jobs, model } from '../../core';
import { createTestAgent } from '../../core/test-utils';
import { activateKnowledgeItem, createKnowledgeItem, deactivateKnowledgeItem, deleteKnowledgeItem, patchKnowledgeItem, submitKnowledgeItem } from '../knowledge/service';
import { chunkKnowledge } from './chunker';
import { INDEX_DIMENSIONS } from './config';
import { scoreChunk } from './score';
import seed from './seed';
import { getIndexStates, indexKnowledgeRevision, searchKnowledge, setSearchable } from './service';
import { countTerms, mixedQuery, scriptOf, termsOf } from './text';

const bizA = SEED.businesses.find((entry) => entry.alias === 'biz_demo_a')!.id;
const bizB = SEED.businesses.find((entry) => entry.alias === 'biz_demo_b')!.id;
const owner = SEED.users.find((entry) => entry.alias === 'owner_a')!;
const actor = { userId: owner.id };
const faq = SEED.knowledge.find((entry) => entry.alias === 'kn_a_faq')!;

async function indexFaq(businessId: string, title: string, body: string) {
  const item = await createKnowledgeItem(businessId, { userId: null }, { title, body, kind: 'faq', folderId: null });
  await submitKnowledgeItem(businessId, { userId: null }, item.id, item.revision);
  await drainJobs({ type: 'knowledge.index', maxMs: 30_000 });
  await activateKnowledgeItem(businessId, { userId: null }, item.id, { expectedRevision: item.revision, acknowledgeModeration: false });
  return item;
}

describe('F07 Thai and English chunking', () => {
  it('separates Thai words and preserves normalized SKU terms', () => {
    expect(countTerms('ร้านเปิดกี่โมง')).toBeGreaterThan(1);
    expect(termsOf('วันนี้มี Ａ-ＧＡＭＥ-０１ ไหม').skus).toEqual(['a-game-01']);
    expect(termsOf('How much is A-GAME-01?').words).not.toContain('how');
    expect(scriptOf('ระยะเวลาจัดส่ง 1-2 วัน')).toBe('th');
    expect(scriptOf('How long does delivery take?')).toBe('latin');
    expect(mixedQuery('อยาก return ของ ได้ไหม')).toBe(true);
    expect(mixedQuery('A-GAME-01 ราคาเท่าไหร่')).toBe(false);
  });

  it('keeps FAQ pairs and table rows together and bounds long Thai articles', () => {
    const question = chunkKnowledge({ kind: 'faq', title: 'ร้านเปิดเมื่อไหร่', body: 'เปิดทุกวัน' }).chunks;
    expect(question).toHaveLength(1);
    expect(question[0].text).toContain('คำถาม: ร้านเปิดเมื่อไหร่\nคำตอบ: เปิดทุกวัน');
    const article = chunkKnowledge({ kind: 'article', title: 'การจัดส่ง', body: 'พัสดุจะมาถึงร้านวันพรุ่งนี้'.repeat(140) }).chunks;
    expect(article.length).toBeGreaterThan(1);
    expect(article.every((chunk) => chunk.termCount <= 260 && chunk.text.startsWith('การจัดส่ง\n'))).toBe(true);
    const table = chunkKnowledge({ kind: 'article', title: 'สินค้า', body: 'ชื่อ | SKU | ราคา\nGame | A-GAME-01 | 1490\nCard | A-CARD-01 | 99' }).chunks;
    expect(table).toHaveLength(2);
    expect(table[0]).toMatchObject({ kind: 'row', lexicalTerms: expect.arrayContaining(['a-game-01']) });
    expect(table[0].text).toContain('ชื่อ | SKU | ราคา');
  });

  it('scores cross-language matches and preserves the SKU floor', () => {
    const base = { text: 'ระยะเวลาจัดส่ง 1-2 วัน', lexical_terms: [], cos: 0.4, population: 0, document_frequency: {} };
    const query = 'How long does delivery take?';
    const cross = scoreChunk(query, termsOf(query), base, 'hybrid');
    expect(cross.crossScript).toBe(true);
    expect(cross.final).toBeCloseTo(0.47222, 4);
    const thai = scoreChunk('ส่งถึงเมื่อไหร่', termsOf('ส่งถึงเมื่อไหร่'), base, 'hybrid');
    expect(thai.final).toBeCloseTo(0.30, 4);
    const sku = scoreChunk('A-GAME-01', termsOf('A-GAME-01'),
      { ...base, cos: 0.2, lexical_terms: ['a-game-01'] }, 'hybrid');
    expect(sku.final).toBeGreaterThanOrEqual(0.85);
  });
});

describe('F07 durable knowledge indexing', () => {
  it('deduplicates queued jobs and replaces an active revision only after the next one indexes', async () => {
    await createTestAgent();
    const item = await createKnowledgeItem(bizA, actor, { title: 'Plum workshop', body: 'Details are PLUM-CLASS-14.', kind: 'faq', folderId: null });
    await submitKnowledgeItem(bizA, actor, item.id, item.revision);
    const replay = await indexKnowledgeRevision({ businessId: bizA, itemId: item.id, revision: item.revision });
    expect(replay.deduped).toBe(true);
    expect((await getIndexStates(bizA, [item.id]))[item.id].state).toBe('not_started');
    expect((await searchKnowledge(bizA, 'PLUM-CLASS-14')).hits).toEqual([]);
    await drainJobs({ type: 'knowledge.index', maxMs: 30_000 });
    expect((await jobs.get(replay.jobId))?.state).toBe('succeeded');
    expect((await getIndexStates(bizA, [item.id]))[item.id]).toMatchObject({ state: 'ready', revision: 1 });
    const active = await activateKnowledgeItem(bizA, actor, item.id, { expectedRevision: 1, acknowledgeModeration: false });
    expect(active.status).toBe('active');
    const hit = (await searchKnowledge(bizA, 'PLUM-CLASS-14')).hits[0];
    expect(hit).toMatchObject({ knowledgeItemId: item.id, revision: 1, score: 1 });
    expect(parseEvidenceId(evidenceIdOf(hit))).toEqual({ knowledgeItemId: item.id, revision: 1 });

    await patchKnowledgeItem(bizA, actor, item.id, { expectedRevision: 1, body: 'Details are PLUM-CLASS-15.' });
    expect((await searchKnowledge(bizA, 'PLUM-CLASS-14')).hits[0]).toMatchObject({ revision: 1 });
    await drainJobs({ type: 'knowledge.index', maxMs: 30_000 });
    expect((await searchKnowledge(bizA, 'PLUM-CLASS-14')).hits).toEqual([]);
    expect((await searchKnowledge(bizA, 'PLUM-CLASS-15')).hits[0]).toMatchObject({ revision: 2 });
  }, 20_000);


  it('retries transient embedding errors through the durable F35 worker', async () => {
    await createTestAgent();
    const item = await createKnowledgeItem(bizA, actor, { title: 'Retryable index', body: 'Fixture RETRY-INDEX-22.', kind: 'faq', folderId: null });
    await submitKnowledgeItem(bizA, actor, item.id, 1);
    const { jobId } = await indexKnowledgeRevision({ businessId: bizA, itemId: item.id, revision: 1 });
    const spy = vi.spyOn(model, 'embed').mockRejectedValueOnce(
      new AppError('PROVIDER_UNAVAILABLE', 'Transient fixture failure', { retryable: true }),
    );
    try {
      await drainJobs({ type: 'knowledge.index', maxMs: 30_000 });
      expect(await jobs.get(jobId)).toMatchObject({ state: 'queued', attempts: 1 });
      expect((await getIndexStates(bizA, [item.id]))[item.id].state).toBe('indexing');
      await delay(5100);
      await drainJobs({ type: 'knowledge.index', maxMs: 30_000 });
      expect(await jobs.get(jobId)).toMatchObject({ state: 'succeeded', attempts: 2 });
      expect((await getIndexStates(bizA, [item.id]))[item.id].state).toBe('ready');
      expect((await searchKnowledge(bizA, 'RETRY-INDEX-22')).hits).toEqual([]);
    } finally { spy.mockRestore(); }
  }, 25_000);

  it('orders two writers so a stale activation cannot republish an inactive revision', async () => {
    await createTestAgent();
    const item = await indexFaq(bizA, 'Jade workshop', 'Details are JADE-CLASS-41.');
    const target = { businessId: bizA, itemId: item.id, revision: 1 };
    let proceed!: () => void;
    const release = new Promise<void>((resolve) => { proceed = resolve; });
    const delayedActivation = release.then(() => setSearchable(target));
    try {
      await deactivateKnowledgeItem(bizA, actor, item.id, 1);
    } finally { proceed(); }
    await delayedActivation;
    const chunk = await db.one<{ searchable: boolean }>(
      'SELECT searchable FROM knowledge_chunks WHERE business_id=$1 AND item_id=$2', [bizA, item.id],
    );
    expect(chunk.searchable).toBe(false);
    expect((await searchKnowledge(bizA, 'JADE-CLASS-41')).hits).toEqual([]);

    await db.query('UPDATE knowledge_chunks SET searchable=true WHERE business_id=$1 AND item_id=$2', [bizA, item.id]);
    expect((await searchKnowledge(bizA, 'JADE-CLASS-41')).hits).toEqual([]);
    await activateKnowledgeItem(bizA, actor, item.id, { expectedRevision: 1, acknowledgeModeration: false });
    await setSearchable({ ...target, revision: null });
    expect((await searchKnowledge(bizA, 'JADE-CLASS-41')).hits[0]).toMatchObject({ knowledgeItemId: item.id });
    await deleteKnowledgeItem(bizA, actor, item.id);
    expect((await searchKnowledge(bizA, 'JADE-CLASS-41')).hits).toEqual([]);
  }, 20_000);

  it('seeds exactly the expected published revisions and retrieval honors tenant, folder and readiness', async () => {
    const aliases = new Map([...SEED.businesses, ...SEED.knowledge].map((entry) => [entry.alias, entry.id]));
    await seed.run({ db, fixtures: SEED, id: (alias) => aliases.get(alias)!, log: () => {} });
    const state = await db.query<{ item_id: string; searchable: boolean }>(
      'SELECT DISTINCT item_id,searchable FROM knowledge_chunks WHERE business_id=ANY($1::uuid[]) AND item_id=ANY($2::uuid[])',
      [[bizA, bizB], SEED.knowledge.map((entry) => entry.id)],
    );
    expect(state.rows.filter((row) => row.searchable)).toHaveLength(6);
    expect(state.rows.filter((row) => !row.searchable)).toHaveLength(2);
    const answer = await searchKnowledge(bizA, 'ร้านเปิดกี่โมง');
    expect(answer).toMatchObject({ mode: 'fake', strategy: 'lexical', hits: [expect.objectContaining({ knowledgeItemId: faq.id, revision: 1 })] });
    expect(answer.hits[0].snippet.length).toBeLessThanOrEqual(400);
    expect((await searchKnowledge(bizA, 'What is your return policy?')).hits[0]?.title).toBe('นโยบายรับคืนสินค้า');
    expect((await searchKnowledge(bizA, 'TENANT_B_ONLY_OWL_482')).hits).toEqual([]);
    expect((await searchKnowledge(bizA, 'โปรโมชันลด 50%')).hits).not.toContainEqual(expect.objectContaining({ title: 'โปรโมชันร่าง' }));
    expect((await searchKnowledge(bizA, 'ราคาเก่า 990')).hits).not.toContainEqual(expect.objectContaining({ title: 'ราคาเก่า' }));
    expect((await searchKnowledge(bizB, 'บริการรับส่งถึงบ้าน')).hits).not.toContainEqual(expect.objectContaining({ title: 'บริการที่ปิดแล้ว' }));
    const folder = SEED.knowledgeFolders.find((entry) => entry.alias === 'folder_a_policy')!;
    expect((await searchKnowledge(bizA, 'ร้านเปิดกี่โมง', { folderIds: [folder.id] })).hits)
      .not.toContainEqual(expect.objectContaining({ knowledgeItemId: faq.id }));
    expect(await searchKnowledge(bizA, '  ')).toEqual({ query: '', hits: [], strategy: 'lexical', mode: 'fake' });
  }, 15_000);

  it('uses matching provider vectors for cross-language queries and excludes a closer other-tenant vector', async () => {
    await createTestAgent();
    const thai = await indexFaq(bizA, 'ระยะเวลาจัดส่ง', 'สินค้าจะถึงภายในสองวันทำการ');
    const other = await indexFaq(bizB, 'ขนส่งด่วน', 'ทีมส่งของภายในวันเดียว');
    const vector = Array(INDEX_DIMENSIONS).fill(0) as number[];
    vector[0] = 1;
    const distant = [...vector];
    distant[0] = 0.40;
    distant[1] = Math.sqrt(1 - 0.40 ** 2);
    for (const [business, id, values] of [[bizA, thai.id, distant], [bizB, other.id, vector]] as const) {
      await db.query(
        "UPDATE knowledge_chunks SET embedding=$3::vector,embed_model='fixture-embed' WHERE business_id=$1 AND item_id=$2",
        [business, id, db.toVector(values)],
      );
    }
    const baseline = await model.embed({ usage: { featureId: 'F07', purpose: 'embed-query', businessId: bizA }, purpose: 'query', texts: ['fixture'] });
    const previousMode = config.MODEL_MODE;
    const spy = vi.spyOn(model, 'embed').mockResolvedValue({ ...baseline, model: 'fixture-embed', mode: 'openai', vectors: [vector] });
    try {
      config.MODEL_MODE = 'openai';
      const result = await searchKnowledge(bizA, 'How long until delivery arrives?');
      expect(result.strategy).toBe('hybrid');
      expect(result.hits[0]).toMatchObject({ knowledgeItemId: thai.id, score: 0.472 });
      expect(result.hits).not.toContainEqual(expect.objectContaining({ knowledgeItemId: other.id }));
    } finally {
      spy.mockRestore();
      config.MODEL_MODE = previousMode;
    }
  }, 25_000);
});
