import { createHash } from 'node:crypto';
import { z } from 'zod';
import { SEED } from '@nless/shared/core/fixtures';
import type {
  RetrievalCaseResult, RetrievalCaseRow, RetrievalConfig, RetrievalCoverage, RetrievalGroup, RetrievalGroupMetrics,
  RetrievalMetrics, RetrievalRunResult, RetrievalRunSummary, RetrievalStrategy,
} from '@nless/shared/features/knowledge-search/types';
import type { KnowledgeItemRow } from '@nless/shared/features/knowledge/types';
import { AppError, auditInTransaction, db } from '../../core';
import { getActiveKnowledgeItemIds, getKnowledgeItem } from '../knowledge/service';
import type { CaseBody, EvalRunBody } from './schema';
import { retrievalSettings, searchWorkbench } from './search';
import { mixedQuery, scriptOf } from './text';
import { listBusinessKnowledge } from './workbench';
import fixture from './fixtures/retrieval-v1.json';

type Case = Pick<RetrievalCaseResult, 'id' | 'query' | 'source' | 'group' | 'kind'> & { itemIds: string[] };
type FixtureQuery = {
  id: string; business: string; text: string; expect: string[];
  lang?: string; none?: boolean; forbid?: string[];
};
type SavedRow = { id: string; query: string; expect_item_ids: string[]; expect_none: boolean; created_at: Date };
type EvaluationMetadata = {
  coverage: RetrievalCoverage;
  strategyCounts: Record<RetrievalStrategy, number>;
  comparisonKey: string | null;
};
type StoredConfig = RetrievalConfig & { evaluation?: EvaluationMetadata };
type RunRow = { id: string; config: StoredConfig; metrics: RetrievalMetrics; created_at: Date };
const seedItems = new Map(SEED.knowledge.map((item) => [item.alias, item.id]));
const fixtureCases: { query: FixtureQuery; group: RetrievalGroup }[] = [
  ...fixture.queries.map((query) => ({ query, group: 'lang' in query && query.lang === 'en' ? 'en' as const : 'th' as const })),
  ...fixture.xlangQueries.map((query) => ({ query, group: 'xlang' as const })),
];

export function resolveFixtureExpectation(query: FixtureQuery, ids: Map<string, string>, available: Set<string>) {
  if (query.none) return { kind: 'none' as const, itemIds: [] };
  if (query.forbid) {
    const itemIds = query.forbid.flatMap((key) => ids.has(key) ? [ids.get(key)!] : []);
    return itemIds.length === query.forbid.length && itemIds.length
      ? { kind: 'forbid' as const, itemIds } : null;
  }
  const itemIds = query.expect.flatMap((key) => ids.has(key) && available.has(ids.get(key)!) ? [ids.get(key)!] : []);
  return itemIds.length ? { kind: 'positive' as const, itemIds } : null;
}

function sampleCases(businessId: string, items: KnowledgeItemRow[]): {
  cases: Case[]; planned: number; unresolvedForbiddenCases: number;
} {
  const business = SEED.businesses.find((entry) => entry.id === businessId)?.alias;
  const shop = business === 'biz_demo_a' ? 'A' : business === 'biz_demo_b' ? 'B' : null;
  if (!shop) return { cases: [], planned: 0, unresolvedForbiddenCases: 0 };
  const available = new Set(items.filter((item) => item.status === 'active' && item.indexState === 'ready').map((item) => item.id));
  const names = new Map(items.filter((item) => item.source === 'fixture' && available.has(item.id))
    .map((item) => [item.title, item.id]));
  const ids = new Map(seedItems);
  for (const item of fixture.items) {
    if (item.business !== shop || item.source !== 'fx') continue;
    const match = names.get(item.title);
    if (match) ids.set(item.key, match);
  }
  const availableCases = fixtureCases.filter(({ query }) => query.business === shop);
  const cases: Case[] = [];
  let unresolvedForbiddenCases = 0;
  for (const { query, group } of availableCases) {
    const expectation = resolveFixtureExpectation(query, ids, available);
    if (expectation) cases.push({ id: query.id, query: query.text, source: 'fixture', group, ...expectation });
    else if (query.forbid) unresolvedForbiddenCases++;
  }
  return { cases, planned: availableCases.length, unresolvedForbiddenCases };
}

async function savedRows(businessId: string): Promise<SavedRow[]> {
  const { rows } = await db.query<SavedRow>(
    'SELECT id,query,expect_item_ids,expect_none,created_at FROM retrieval_cases WHERE business_id=$1 ORDER BY created_at DESC,id LIMIT 50',
    [businessId],
  );
  return rows;
}

function savedGroup(query: string, ids: string[], items: Map<string, KnowledgeItemRow>): RetrievalGroup {
  const script = scriptOf(query);
  if (mixedQuery(query) || ids.some((id) => items.has(id) && scriptOf(items.get(id)!.snippet) !== script)) return 'xlang';
  return script === 'latin' ? 'en' : 'th';
}

export async function listRetrievalCases(businessId: string): Promise<{ items: RetrievalCaseRow[] }> {
  const rows = await savedRows(businessId);
  if (!rows.length) return { items: [] };
  const titles = new Map((await listBusinessKnowledge(businessId)).map((item) => [item.id, item.title]));
  return { items: rows.map((row) => caseView(row, titles)) };
}

function caseView(row: SavedRow, titles: Map<string, string>): RetrievalCaseRow {
  return {
    id: row.id, query: row.query, expectItemIds: row.expect_item_ids, expectNone: row.expect_none,
    expectTitles: row.expect_item_ids.flatMap((id) => titles.has(id) ? [titles.get(id)!] : []), createdAt: row.created_at.toISOString(),
  };
}

export async function createRetrievalCase(businessId: string, userId: string, body: CaseBody): Promise<RetrievalCaseRow> {
  const ids = [...new Set(body.expectItemIds.map((id) => id.toLowerCase()))];
  const titles = new Map<string, string>();
  for (const id of ids) {
    const item = await getKnowledgeItem(businessId, id);
    if (!item || item.status === 'deleted') throw new AppError('NOT_FOUND', 'Expected knowledge item not found');
    titles.set(id, item.title);
  }
  return db.tx(async (tx) => {
    const row = await tx.one<SavedRow>(
      `INSERT INTO retrieval_cases (business_id, query, expect_item_ids, expect_none, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING id,query,expect_item_ids,expect_none,created_at`,
      [businessId, body.query, body.expectNone ? [] : ids, body.expectNone, userId],
    );
    await auditInTransaction(tx, [{ action: 'knowledge-search.case.create', actorUserId: userId, businessId,
      targetType: 'business', targetId: businessId, details: { caseId: row.id } }]);
    return caseView(row, titles);
  });
}

export async function deleteRetrievalCase(businessId: string, userId: string, id: string): Promise<void> {
  const caseId = z.string().uuid().safeParse(id);
  if (!caseId.success) throw new AppError('NOT_FOUND', 'Saved retrieval case not found');
  await db.tx(async (tx) => {
    const removed = await tx.maybeOne<{ id: string }>(
      'DELETE FROM retrieval_cases WHERE business_id=$1 AND id=$2 RETURNING id', [businessId, caseId.data],
    );
    if (!removed) throw new AppError('NOT_FOUND', 'Saved retrieval case not found');
    await auditInTransaction(tx, [{ action: 'knowledge-search.case.delete', actorUserId: userId, businessId,
      targetType: 'business', targetId: businessId, details: { caseId: removed.id } }]);
  });
}

function metricsFor(rows: RetrievalCaseResult[]): RetrievalGroupMetrics {
  const positives = rows.filter((row) => row.kind === 'positive');
  const none = rows.filter((row) => row.kind === 'none');
  const recall = (k: number) => positives.length
    ? positives.filter(({ rank }) => rank !== null && rank <= k).length / positives.length : 0;
  return {
    positives: positives.length, recallAt1: recall(1), recallAt3: recall(3), recallAt5: recall(5),
    nonePassRate: none.length ? none.filter(({ pass }) => pass).length / none.length : null,
  };
}

export function computeRetrievalMetrics(rows: RetrievalCaseResult[]): RetrievalMetrics {
  const total = metricsFor(rows);
  const forbidden = rows.filter(({ kind }) => kind === 'forbid');
  return {
    ...total, cases: rows.length,
    mrr: total.positives
      ? rows.reduce((sum, row) => sum + (row.kind === 'positive' && row.rank ? 1 / row.rank : 0), 0) / total.positives : 0,
    forbidPassRate: forbidden.length ? forbidden.filter(({ pass }) => pass).length / forbidden.length : null,
    byGroup: {
      th: metricsFor(rows.filter(({ group }) => group === 'th')),
      en: metricsFor(rows.filter(({ group }) => group === 'en')),
      xlang: metricsFor(rows.filter(({ group }) => group === 'xlang')),
    },
  };
}

function viewRun({ id, config: stored, metrics, created_at }: RunRow): RetrievalRunSummary {
  const { evaluation, ...config } = stored;
  return {
    id, config, metrics, createdAt: created_at.toISOString(),
    coverage: evaluation?.coverage ?? null, strategyCounts: evaluation?.strategyCounts ?? null,
  };
}

async function publishedCorpus(businessId: string) {
  return db.tx(async (tx) => {
    const { rows } = await tx.query<{
      item_id: string; revision: number; embed_model: string; embed_dim: number; chunks: number; vectors: number;
    }>(
      `SELECT item_id,revision,embed_model,embed_dim,count(*)::int AS chunks,count(embedding)::int AS vectors
      FROM knowledge_chunks WHERE business_id=$1 AND searchable GROUP BY item_id,revision,embed_model,embed_dim
      ORDER BY item_id,revision,embed_model,embed_dim`, [businessId],
    );
    const activeIds = await getActiveKnowledgeItemIds(businessId, [...new Set(rows.map((row) => row.item_id))], tx);
    return JSON.stringify(rows.filter((row) => activeIds.has(row.item_id)));
  });
}

function measurementKey(cases: Case[], corpus: string, coverage: RetrievalCoverage): string {
  const requests = [...cases].sort((left, right) => left.id.localeCompare(right.id)).map((entry) => ({
    ...entry, itemIds: [...entry.itemIds].sort(),
  }));
  return createHash('sha256').update(JSON.stringify([fixture.version, coverage, requests, corpus])).digest('hex');
}

export async function listRetrievalRuns(businessId: string, limit: number): Promise<{ items: RetrievalRunSummary[] }> {
  const { rows } = await db.query<RunRow>(
    'SELECT id,config,metrics,created_at FROM retrieval_runs WHERE business_id=$1 ORDER BY created_at DESC,id DESC LIMIT $2',
    [businessId, limit],
  );
  return { items: rows.map(viewRun) };
}

export async function runRetrievalEvaluation(businessId: string, userId: string, body: EvalRunBody): Promise<RetrievalRunResult> {
  const items = await listBusinessKnowledge(businessId);
  const byId = new Map(items.map((item) => [item.id, item]));
  const sample = body.includeFixture ? sampleCases(businessId, items) : { cases: [], planned: 0, unresolvedForbiddenCases: 0 };
  const coverage: RetrievalCoverage = {
    fixtureCasesPlanned: sample.planned, fixtureCasesEvaluated: sample.cases.length,
    savedCasesEvaluated: 0, unresolvedForbiddenCases: sample.unresolvedForbiddenCases,
  };
  const cases = [...sample.cases];
  if (body.includeSaved) {
    const rows = await savedRows(businessId);
    coverage.savedCasesEvaluated = rows.length;
    for (const row of rows) cases.push({
      id: row.id, query: row.query, source: 'saved', kind: row.expect_none ? 'none' : 'positive',
      group: savedGroup(row.query, row.expect_item_ids, byId), itemIds: row.expect_item_ids,
    });
  }
  if (!cases.length) throw new AppError('VALIDATION_ERROR', 'No retrieval cases available', { details: { code: 'no_eval_cases' } });
  const perCase: RetrievalCaseResult[] = [];
  const before = await publishedCorpus(businessId);
  const strategies = new Map<RetrievalStrategy, RetrievalConfig>();
  const strategyCounts = { lexical: 0, vector: 0, hybrid: 0 };
  for (let offset = 0; offset < cases.length; offset += 4) {
    const results = await Promise.all(cases.slice(offset, offset + 4).map(async ({ itemIds, ...entry }) => {
      const search = await searchWorkbench(businessId, entry.query, { ...body, topK: 5 });
      const found = search.hits.findIndex(({ knowledgeItemId }) => itemIds.includes(knowledgeItemId));
      const rank = entry.kind === 'positive' && found >= 0 ? found + 1 : null;
      const pass = entry.kind === 'positive' ? rank !== null : entry.kind === 'none' ? search.hits.length === 0 : found < 0;
      return { config: search.config, result: {
        ...entry, pass, rank, strategy: search.strategy,
        topTitle: search.hits[0]?.title ?? null, topScore: search.hits[0]?.score ?? null,
      } };
    }));
    for (const { config, result } of results) {
      strategies.set(config.strategy, config);
      strategyCounts[config.strategy]++;
      perCase.push(result);
    }
  }
  const after = await publishedCorpus(businessId);
  const comparisonKey = before === after ? measurementKey(cases, before, coverage) : null;
  const actual = strategies.size === 1 ? strategies.values().next().value : undefined;
  const config: StoredConfig = {
    ...(actual ?? retrievalSettings(body.strategy, body)), evaluation: { coverage, strategyCounts, comparisonKey },
  };
  const metrics = computeRetrievalMetrics(perCase);
  return db.tx(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['retrieval-run:' + businessId]);
    const previous = await tx.maybeOne<{ metrics: RetrievalMetrics; config: StoredConfig }>(
      'SELECT metrics,config FROM retrieval_runs WHERE business_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1', [businessId],
    );
    const previousKey = previous?.config.evaluation?.comparisonKey;
    const comparison = !comparisonKey ? 'scope_changed' : !previous ? 'first' : !previousKey ? 'unknown'
      : comparisonKey === previousKey ? 'comparable' : 'different_scope';
    const row = await tx.one<RunRow>(
      `INSERT INTO retrieval_runs (business_id,config,metrics,per_case,created_by)
      VALUES ($1,$2::jsonb,$3::jsonb,$4::jsonb,$5) RETURNING id,config,metrics,created_at`,
      [businessId, JSON.stringify(config), JSON.stringify(metrics), JSON.stringify(perCase), userId],
    );
    return { ...viewRun(row), perCase, comparison, previous: comparison === 'comparable' ? previous!.metrics : null };
  });
}
