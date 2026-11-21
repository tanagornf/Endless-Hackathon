import { Alert, Button, FormControlLabel, Stack, Switch, Typography } from '@mui/material';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RetrievalGroup, RetrievalRunResult, RetrievalRunSummary, RetrievalStrategy } from '@nless/shared/features/knowledge-search/types';
import { DataTable, EmptyState, SectionCard, formatDateTime, useApiMutation, useApiQuery } from '../../core';

const groups = ['th', 'en', 'xlang'] as const;
type Input = { strategy: RetrievalStrategy; minScore?: number };
type Props = Input & { valid: boolean };

export default function RetrievalEvaluationPanel({ strategy, minScore, valid }: Props) {
  const { t, i18n } = useTranslation('knowledge-search');
  const formatter = new Intl.NumberFormat(i18n.language, { style: 'percent', maximumFractionDigits: 1 });
  const percentage = (value: number | null) => value === null ? '—' : formatter.format(value);
  const [result, setResult] = useState<RetrievalRunResult>();
  const [failedOnly, setFailedOnly] = useState(false);
  const check = useApiMutation<Input, RetrievalRunResult>('POST', '/knowledge-search/eval/run', { toastOnError: false });
  const history = useApiQuery<{ items: RetrievalRunSummary[] }>('/knowledge-search/eval/runs?limit=5');
  const failureDetails = check.error?.error.details;
  const noCases = failureDetails && typeof failureDetails === 'object' && 'code' in failureDetails &&
    failureDetails.code === 'no_eval_cases';
  async function run() {
    try {
      setResult(await check.run({ strategy, minScore }));
      history.reload();
    } catch {
      setResult(undefined);
    }
  }
  const resultGroups = result && [
    { label: 'all' as const, ...result.metrics },
    ...groups.map((label: RetrievalGroup) => ({ label, ...result.metrics.byGroup[label] })),
  ];
  return <SectionCard title={t('eval.title')}
    actions={<Button variant="contained" disabled={check.running || !valid} onClick={() => void run()}>
      {t(check.running ? 'eval.running' : 'eval.run')}
    </Button>}>
    <Stack spacing={2}>
      <Typography color="text.secondary">{t('eval.scope')}</Typography>
      {check.error && <Alert severity={noCases ? 'info' : 'error'}>{t(noCases ? 'eval.noCases' : 'eval.error')}</Alert>}
      {result && <Stack spacing={2}>
        <Typography>{t('eval.summary', {
          count: result.metrics.cases, strategy: t('strategy.' + result.config.strategy), mrr: result.metrics.mrr.toFixed(3),
          none: percentage(result.metrics.nonePassRate), forbid: percentage(result.metrics.forbidPassRate),
        })}</Typography>
        {result.previous && <Typography color="text.secondary">
          {t('eval.previous', { value: percentage(result.previous.recallAt3) })}
        </Typography>}
        <DataTable rows={resultGroups ?? []} rowKey={(row) => row.label} columns={[
          { key: 'group', header: t('eval.group'), render: ({ label }) => t('group.' + label) },
          { key: 'positives', header: t('eval.positive'), align: 'right' },
          { key: 'r1', header: t('eval.recall', { rank: 1 }), align: 'right', render: (row) => percentage(row.recallAt1) },
          { key: 'r3', header: t('eval.recall', { rank: 3 }), align: 'right', render: (row) => percentage(row.recallAt3) },
          { key: 'r5', header: t('eval.recall', { rank: 5 }), align: 'right', render: (row) => percentage(row.recallAt5) },
          { key: 'none', header: t('eval.none'), align: 'right', render: (row) => percentage(row.nonePassRate) },
        ]} />
        <FormControlLabel label={t('eval.onlyFailed')} control={<Switch checked={failedOnly}
          onChange={(event) => setFailedOnly(event.target.checked)} />} />
        <DataTable rows={result.perCase.filter((item) => !failedOnly || !item.pass)}
          rowKey={(item) => item.id} empty={<EmptyState title={t('eval.emptyFailures')} />} columns={[
            { key: 'query', header: t('search.question'), render: ({ query }) => <span data-user-content>{query}</span> },
            { key: 'group', header: t('eval.group'), render: ({ group }) => t('group.' + group) },
            { key: 'kind', header: t('eval.kind'), render: ({ kind }) => t('kind.' + kind) },
            { key: 'pass', header: t('eval.outcome'), render: ({ pass }) => t(pass ? 'eval.pass' : 'eval.fail') },
            { key: 'rank', header: t('hits.rank'), align: 'right' },
            { key: 'topTitle', header: t('eval.topItem'), render: ({ topTitle }) => <span data-user-content>{topTitle ?? '—'}</span> },
          ]} />
      </Stack>}
      <Typography variant="subtitle2">{t('eval.history')}</Typography>
      {history.error ? <Alert severity="error" action={<Button onClick={history.reload}>{t('common:actions.retry')}</Button>}>
        {t('eval.historyError')}
      </Alert> : <DataTable rows={history.data?.items ?? []} rowKey={(row) => row.id}
        loading={history.loading || !history.data} empty={<EmptyState title={t('eval.noRuns')} />} columns={[
          { key: 'createdAt', header: t('eval.date'), render: ({ createdAt }) => formatDateTime(createdAt) },
          { key: 'cases', header: t('eval.count'), align: 'right', render: ({ metrics }) => metrics.cases },
          { key: 'recall', header: t('eval.recall', { rank: 3 }), align: 'right', render: ({ metrics }) => percentage(metrics.recallAt3) },
        ]} />}
    </Stack>
  </SectionCard>;
}
