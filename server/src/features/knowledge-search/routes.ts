import { assertRateLimit, defineFeatureRoutes } from '../../core';
import { listRetrievalCases, listRetrievalRuns, runRetrievalEvaluation } from './eval';
import { indexJobHandler } from './index-job';
import { INDEX_JOB } from './indexing';
import { EvalRunBody, RunsQuery, SearchBody } from './schema';
import { searchWorkbench } from './search';
import { readIndexStatus, readSource } from './workbench';

const root = '/businesses/:businessId/knowledge-search';
const read = { auth: 'business', permission: 'product.read' } as const;

export default defineFeatureRoutes({
  featureId: 'F07',
  slug: 'knowledge-search',
  register(api) {
    api.post(root + '/search', { ...read, body: SearchBody, summary: 'Search indexed knowledge' }, ({ business, user, body }) => {
      assertRateLimit({ key: 'ks:search:' + business!.id + ':' + user!.id, limit: 60, windowSeconds: 60 });
      return searchWorkbench(business!.id, body.query, body);
    });
    api.get(root + '/status', { ...read, summary: 'Read knowledge index status' },
      ({ business }) => readIndexStatus(business!.id));
    api.get(root + '/sources/:itemId/:revision', { ...read, summary: 'Read indexed knowledge source' },
      ({ business, params }) => readSource(business!.id, params.itemId, params.revision));
    api.post(root + '/eval/run', { ...read, body: EvalRunBody, summary: 'Evaluate retrieval results' }, ({ business, user, body }) => {
      assertRateLimit({ key: 'ks:eval:' + business!.id + ':' + user!.id, limit: 6, windowSeconds: 60 });
      return runRetrievalEvaluation(business!.id, user!.id, body);
    });
    api.get(root + '/eval/runs', { ...read, query: RunsQuery, summary: 'List retrieval evaluations' },
      ({ business, query }) => listRetrievalRuns(business!.id, query.limit));
    api.get(root + '/eval/cases', { ...read, summary: 'List saved retrieval cases' },
      ({ business }) => listRetrievalCases(business!.id));
  },
  jobs: { [INDEX_JOB]: indexJobHandler },
});
