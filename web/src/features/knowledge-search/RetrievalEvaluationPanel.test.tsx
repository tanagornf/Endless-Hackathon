import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, expect, it, vi } from 'vitest';
import type { RetrievalRunResult, RetrievalRunSummary } from '@nless/shared/features/knowledge-search/types';
import RetrievalEvaluationPanel from './RetrievalEvaluationPanel';
import en from './i18n/en.json';
import th from './i18n/th.json';

const mocked = vi.hoisted(() => ({ history: vi.fn(), evaluate: vi.fn() }));

vi.mock('../../core', async (load) => ({
  ...await load<typeof import('../../core')>(),
  useApiQuery: () => ({ data: { items: mocked.history() }, error: null, loading: false, reload: vi.fn() }),
  useApiMutation: () => ({ run: mocked.evaluate, running: false, error: null }),
}));

afterEach(cleanup);

const metrics = {
  cases: 22, positives: 12, recallAt1: 1, recallAt3: 1, recallAt5: 1, nonePassRate: 1, forbidPassRate: 1, mrr: 1,
  byGroup: {
    th: { positives: 7, recallAt1: 1, recallAt3: 1, recallAt5: 1, nonePassRate: 1 },
    en: { positives: 1, recallAt1: 1, recallAt3: 1, recallAt5: 1, nonePassRate: null },
    xlang: { positives: 4, recallAt1: 1, recallAt3: 1, recallAt5: 1, nonePassRate: 1 },
  },
};
const old: RetrievalRunSummary = {
  id: 'historical', createdAt: '2026-11-21T07:16:32.799Z', metrics, coverage: null, strategyCounts: null,
  config: { strategy: 'hybrid', wVec: 0.6, wLex: 0.4, wXlang: 0.85, c0Xlang: 0.15, c0: 0.2, c1: 0.6,
    minScore: 0.22, rerank: false, embedModel: 'synthetic-demo' },
};

it.each([
  { lang: 'en', labels: en },
  { lang: 'th', labels: th },
])('shows unknown history and skips an incomparable prior metric in $lang', async ({ lang, labels }) => {
  const i18n = createInstance();
  await i18n.init({ lng: lang, fallbackLng: false, resources: { [lang]: { 'knowledge-search': labels } } });
  mocked.history.mockReturnValue([old]);
  const evaluated: RetrievalRunResult = {
    ...old, id: 'new', perCase: [], comparison: 'unknown', previous: metrics,
    coverage: { fixtureCasesPlanned: 49, fixtureCasesEvaluated: 22, savedCasesEvaluated: 0, unresolvedForbiddenCases: 0 },
    strategyCounts: { lexical: 1, hybrid: 21, vector: 0 },
  };
  mocked.evaluate.mockResolvedValue(evaluated);
  render(<I18nextProvider i18n={i18n}><RetrievalEvaluationPanel strategy="hybrid" valid /></I18nextProvider>);
  expect(screen.getByText(labels.eval.coverageUnknown)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: labels.eval.run }));
  expect(await screen.findByText(labels.comparison.unknown)).toBeTruthy();
  expect(screen.getByText(labels.eval.coverage.replace('{{evaluated}}', '22').replace('{{planned}}', '49'))).toBeTruthy();
  expect(screen.queryByText(labels.eval.previous.replace('{{value}}', '100%'))).toBeNull();
});
