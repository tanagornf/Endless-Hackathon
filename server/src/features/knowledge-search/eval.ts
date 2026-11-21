import { SEED } from '@nless/shared/core/fixtures';
import type {
  RetrievalCaseResult, RetrievalCaseRow, RetrievalConfig, RetrievalGroup, RetrievalGroupMetrics, RetrievalMetrics,
  RetrievalRunResult, RetrievalRunSummary,
} from '@nless/shared/features/knowledge-search/types';
import type { KnowledgeItemRow } from '@nless/shared/features/knowledge/types';
import { AppError, db } from '../../core';
import type { EvalRunBody } from './schema';
import { searchWorkbench } from './search';
import { mixedQuery, scriptOf } from './text';
import { listBusinessKnowledge } from './workbench';
import fixture from './fixtures/retrieval-v1.json';

type Case = Pick<RetrievalCaseResult, 'id' | 'query' | 'source' | 'group' | 'kind'> & { itemIds: string[] };
type FixtureQuery = {
  id: string; business: string; text: string; expect: string[];
  lang?: string; none?: boolean; forbid?: string[];
};
type SavedRow = { id: string; query: string; expect_item_ids: string[]; expect_none: boolean; created_at: Date };
type RunRow = { id: string; config: RetrievalConfig; metrics: RetrievalMetrics; created_at: Date };
const seedItems = new Map(SEED.knowledge.map((item) => [item.alias, item.id]));
const fixtureCases: { query: FixtureQuery; group: RetrievalGroup }[] = [
  ...fixture.queries.map((query) => ({ query, group: 'lang' in query && query.lang === 'en' ? 'en' as const : 'th' as const })),
  ...fixture.xlangQueries.map((query) => ({ query, group: 'xlang' as const })),
];

function sampleCases(businessId: string, items: KnowledgeItemRow[]): Case[] {
  const business = SEED.businesses.find((entry) => entry.id === businessId)?.alias;
  const shop = business === 'biz_demo_a' ? 'A' : business === 'biz_demo_b' ? 'B' : null;
  if (!shop) return [];
  const available = new Set(items.filter((item) => item.status === 'active' && item.indexState === 'ready').map((item) => item.id));
  const names = new Map(items.filter((item) => item.source === 'fixture' && available.has(item.id))
    .map((item) => [item.title, item.id]));
  const ids = new Map(seedItems);
  for (const item of fixture.items) {
    if (item.business !== shop || item.source !== 'fx') continue;
    const match = names.get(item.title);
    if (match) ids.set(item.key, match);
  }
  const result: Case[] = [];
  for (const { query, group } of fixtureCases) {
    if (query.business !== shop) continue;
    const base = { id: query.id, query: query.text, source: 'fixture' as const, group };
    if (query.none) {
      result.push({ ...base, kind: 'none', itemIds: [] });
    } else if (query.forbid) {
      result.push({ ...base, kind: 'forbid', itemIds: query.forbid.flatMap((key) => ids.has(key) ? [ids.get(key)!] : []) });
    } else {
      const itemIds = query.expect.flatMap((key) => ids.has(key) && available.has(ids.get(key)!) ? [ids.get(key)!] : []);
      if (itemIds.length) result.push({ ...base, kind: 'positive', itemIds });
    }
  }
  return result;
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
  return { items: rows.map((row) => ({
    id: row.id, query: row.query, expectItemIds: row.expect_item_ids, expectNone: row.expect_none,
    expectTitles: row.expect_item_ids.flatMap((id) => titles.has(id) ? [titles.get(id)!] : []), createdAt: row.created_at.toISOString(),
  })) };
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

const viewRun = ({ id, config, metrics, created_at }: RunRow): RetrievalRunSummary =>
  ({ id, config, metrics, createdAt: created_at.toISOString() });

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
  const cases = body.includeFixture ? sampleCases(businessId, items) : [];
  if (body.includeSaved) {
    for (const row of await savedRows(businessId)) cases.push({
      id: row.id, query: row.query, source: 'saved', kind: row.expect_none ? 'none' : 'positive',
      group: savedGroup(row.query, row.expect_item_ids, byId), itemIds: row.expect_item_ids,
    });
  }
  if (!cases.length) throw new AppError('VALIDATION_ERROR', 'No retrieval cases available', { details: { code: 'no_eval_cases' } });
  const perCase: RetrievalCaseResult[] = [];
  let config: RetrievalConfig | undefined;
  for (let offset = 0; offset < cases.length; offset += 4) {
    const results = await Promise.all(cases.slice(offset, offset + 4).map(async ({ itemIds, ...entry }) => {
      const search = await searchWorkbench(businessId, entry.query, { ...body, topK: 5 });
      const found = search.hits.findIndex(({ knowledgeItemId }) => itemIds.includes(knowledgeItemId));
      const rank = entry.kind === 'positive' && found >= 0 ? found + 1 : null;
      const pass = entry.kind === 'positive' ? rank !== null : entry.kind === 'none' ? search.hits.length === 0 : found < 0;
      return { config: search.config, result: {
        ...entry, pass, rank, topTitle: search.hits[0]?.title ?? null, topScore: search.hits[0]?.score ?? null,
      } };
    }));
    config ??= results[0].config;
    for (const { result } of results) perCase.push(result);
  }
  const metrics = computeRetrievalMetrics(perCase);
  return db.tx(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['retrieval-run:' + businessId]);
    const previous = await tx.maybeOne<{ metrics: RetrievalMetrics }>(
      'SELECT metrics FROM retrieval_runs WHERE business_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1', [businessId],
    );
    const row = await tx.one<RunRow>(
      `INSERT INTO retrieval_runs (business_id,config,metrics,per_case,created_by)
      VALUES ($1,$2::jsonb,$3::jsonb,$4::jsonb,$5) RETURNING id,config,metrics,created_at`,
      [businessId, JSON.stringify(config), JSON.stringify(metrics), JSON.stringify(perCase), userId],
    );
    return { ...viewRun(row), perCase, previous: previous?.metrics ?? null };
  });
}
