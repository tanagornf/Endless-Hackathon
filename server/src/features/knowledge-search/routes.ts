import { assertRateLimit, defineFeatureRoutes } from '../../core';
import { createRetrievalCase, deleteRetrievalCase, listRetrievalCases, listRetrievalRuns, runRetrievalEvaluation } from './eval';
import { FIXTURE_JOB, fixtureJobHandler, queueDemoFixture, removeDemoFixture } from './fixture-job';
import { indexJobHandler } from './index-job';
import { INDEX_JOB } from './indexing';
import { CaseBody, EvalRunBody, RunsQuery, SearchBody } from './schema';
import { searchWorkbench } from './search';
import { readIndexStatus, readSource } from './workbench';

const root = '/businesses/:businessId/knowledge-search';
const read = { auth: 'business', permission: 'product.read' } as const;
const write = { auth: 'business', permission: 'product.write' } as const;

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
    api.post(root + '/eval/cases', { ...write, body: CaseBody, summary: 'Save a retrieval case' }, async ({ business, user, body }) => ({
      kind: 'json', status: 201, data: await createRetrievalCase(business!.id, user!.id, body),
    }));
    api.delete(root + '/eval/cases/:caseId', { ...write, summary: 'Delete a saved retrieval case' }, async ({ business, user, params }) => {
      await deleteRetrievalCase(business!.id, user!.id, params.caseId);
      return { kind: 'no_content' };
    });
    api.post(root + '/fixture/load', { ...write, summary: 'Queue the demo retrieval fixture' },
      async ({ business, user }) => ({
        kind: 'json', status: 202, data: await queueDemoFixture(business!.id, user!.id),
      }));
    api.post(root + '/fixture/remove', { ...write, summary: 'Remove the demo retrieval fixture' },
      ({ business, user }) => removeDemoFixture(business!.id, user!.id));
  },
  jobs: { [INDEX_JOB]: indexJobHandler, [FIXTURE_JOB]: fixtureJobHandler },
});
