import { Alert, Box, Button, Chip, Collapse, Drawer, LinearProgress, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { IndexStatus, KnowledgeHit, SourceView, WorkbenchSearchOptions, WorkbenchSearchResult } from '@nless/shared/features/knowledge-search/types';
import { DataTable, EmptyState, PageHeader, SectionCard, useApiMutation, useApiQuery, useSession } from '../../core';
import RetrievalEvaluationPanel from './RetrievalEvaluationPanel';
import SavedRetrievalCases from './SavedRetrievalCases';

const root = '/knowledge-search';
const counts = ['ready', 'indexing', 'failed', 'not_started'] as const;
const strategies = ['auto', 'lexical', 'vector', 'hybrid'] as const;
type Strategy = (typeof strategies)[number];
type Source = Pick<KnowledgeHit, 'knowledgeItemId' | 'revision'>;

function IndexPanel() {
  const { t } = useTranslation('knowledge-search');
  const status = useApiQuery<IndexStatus>(root + '/status');
  return <SectionCard title={t('index.title')}>
    {status.error ? <Alert severity="error" action={<Button onClick={status.reload}>{t('common:actions.retry')}</Button>}>
      {t('index.error')}
    </Alert> : !status.data ? <LinearProgress /> : <Stack spacing={1.5}>
      <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: 'wrap' }}>
        <Chip label={t('mode.' + status.data.mode)} color={status.data.mode === 'fake' ? 'warning' : 'success'} />
        <Chip variant="outlined" label={status.data.embedModel + ' · ' + status.data.embedDim} />
        {counts.map((key) => <Chip key={key} variant="outlined" label={t('index.' + key, { count: status.data!.counts[key] })} />)}
      </Stack>
      <Typography color="text.secondary">{t('index.summary', { items: status.data.searchableItems, chunks: status.data.chunkCount })}</Typography>
      {status.data.staleModelChunks > 0 && <Alert severity="warning">{t('index.stale', { count: status.data.staleModelChunks })}</Alert>}
    </Stack>}
  </SectionCard>;
}

function SourceDrawer({ source, onClose }: { source: Source | null; onClose: () => void }) {
  const { t } = useTranslation('knowledge-search');
  const path = source ? root + '/sources/' + source.knowledgeItemId + '/' + source.revision : null;
  const details = useApiQuery<SourceView>(path);
  return <Drawer anchor="right" open={Boolean(source)} onClose={onClose} slotProps={{ paper: { 'aria-label': t('source.title') } }}>
    <Stack spacing={2} sx={{ width: 'min(90vw, 520px)', p: 3 }}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h6" component="h2">{t('source.title')}</Typography>
        <Button onClick={onClose}>{t('source.close')}</Button>
      </Stack>
      {details.error ? <Alert severity="error" action={<Button onClick={details.reload}>{t('common:actions.retry')}</Button>}>
        {t('source.error')}
      </Alert> : !details.data ? <LinearProgress /> : <Stack spacing={1.5}>
        <Typography variant="subtitle1" data-user-content>{details.data.title}</Typography>
        <Typography color="text.secondary">{t('source.revision', { revision: details.data.revision })} · {t(
          details.data.isCurrent ? 'source.current' : 'source.historical',
        )}</Typography>
        <Typography data-user-content sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{details.data.body}</Typography>
        <Button component={Link} to={'/knowledge/' + details.data.knowledgeItemId} sx={{ alignSelf: 'flex-start' }}>
          {t('source.openEditor')}
        </Button>
        {details.data.chunks.map((chunk) => <Box key={chunk.chunkNo}>
          <Typography variant="subtitle2">{t('source.chunk', { number: chunk.chunkNo + 1 })}</Typography>
          <Typography variant="body2" data-user-content sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{chunk.text}</Typography>
        </Box>)}
      </Stack>}
    </Stack>
  </Drawer>;
}

function Workbench() {
  const { t } = useTranslation('knowledge-search');
  const [query, setQuery] = useState('');
  const [strategy, setStrategy] = useState<Strategy>('auto');
  const [topK, setTopK] = useState('5');
  const [minScore, setMinScore] = useState('');
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [result, setResult] = useState<WorkbenchSearchResult>();
  const [source, setSource] = useState<Source | null>(null);
  const search = useApiMutation<WorkbenchSearchOptions & { query: string }, WorkbenchSearchResult>('POST', root + '/search', { toastOnError: false });
  const minimum = minScore === '' ? undefined : Number(minScore);
  const limit = Number(topK);
  const validMinimum = minimum === undefined || (minimum >= 0 && minimum <= 1);
  const valid = Number.isInteger(limit) && limit >= 1 && limit <= 20 && validMinimum;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!query.trim() || !valid || search.running) return;
    try {
      setResult(await search.run({ query: query.trim(), strategy, topK: limit, minScore: minimum }));
    } catch {
      setResult(undefined);
    }
  }
  return <Stack spacing={3}>
    <PageHeader title={t('page.title')} />
    <IndexPanel />
    <SectionCard title={t('search.title')}>
      <Stack component="form" onSubmit={(event) => void submit(event)} spacing={2}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <TextField label={t('search.question')} value={query} onChange={(event) => setQuery(event.target.value)}
            fullWidth slotProps={{ htmlInput: { maxLength: 500 } }} />
          <Button type="submit" variant="contained" disabled={!query.trim() || !valid || search.running}>{t('search.submit')}</Button>
        </Stack>
        <Button type="button" aria-expanded={optionsOpen} onClick={() => setOptionsOpen((open) => !open)} sx={{ alignSelf: 'flex-start' }}>
          {t('search.options')}
        </Button>
        <Collapse in={optionsOpen} unmountOnExit>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ pt: 1 }}>
            <TextField select label={t('search.strategy')} value={strategy}
              onChange={(event) => setStrategy(event.target.value as Strategy)} sx={{ minWidth: 150 }}>
              {strategies.map((value) => <MenuItem key={value} value={value}>{t('strategy.' + value)}</MenuItem>)}
            </TextField>
            <TextField type="number" label={t('search.topK')} value={topK} onChange={(event) => setTopK(event.target.value)}
              slotProps={{ htmlInput: { min: 1, max: 20, step: 1 } }} />
            <TextField type="number" label={t('search.minimum')} value={minScore} onChange={(event) => setMinScore(event.target.value)}
              slotProps={{ htmlInput: { min: 0, max: 1, step: 0.01 } }} />
          </Stack>
        </Collapse>
        {search.error && <Alert severity="error">{t('search.error')}</Alert>}
      </Stack>
      {(result || search.running) && <Stack spacing={2} sx={{ mt: 2 }}>
        {result && <Typography color="text.secondary">{t('search.applied', {
          strategy: t('strategy.' + result.strategy), elapsed: result.timings.totalMs,
        })}</Typography>}
        <DataTable rows={(result?.hits ?? []).map((hit, index) => ({ ...hit, rank: index + 1 }))}
          rowKey={(hit) => hit.knowledgeItemId} loading={search.running} empty={<EmptyState title={t('search.empty')} />}
          columns={[
            { key: 'rank', header: t('hits.rank') },
            { key: 'title', header: t('hits.title'), render: (hit) => <Stack sx={{ alignItems: 'flex-start' }}>
              <Button type="button" onClick={() => setSource(hit)} data-user-content sx={{ textAlign: 'left' }}>{hit.title}</Button>
              <Typography variant="caption">{t('source.revision', { revision: hit.revision })}</Typography>
            </Stack> },
            { key: 'score', header: t('hits.score'), align: 'right', render: ({ score }) => score.toFixed(3) },
            { key: 'vector', header: t('hits.vector'), align: 'right', render: ({ debug }) => debug.cos?.toFixed(3) ?? '—' },
            { key: 'lex', header: t('hits.words'), align: 'right', render: ({ debug }) => debug.lex.toFixed(3) },
            { key: 'snippet', header: t('hits.snippet'), render: ({ snippet, debug }) => <Stack spacing={0.5}>
              <Typography variant="body2" data-user-content sx={{ minWidth: 200, maxWidth: 480 }}>{snippet}</Typography>
              {debug.matchedTerms.length > 0 && <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
                {debug.matchedTerms.slice(0, 10).map((term) => <Chip key={term} size="small" label={term} data-user-content />)}
              </Stack>}
            </Stack> },
          ]} />
        {Boolean(result?.belowThreshold.length) && <Stack spacing={0.5}>
          <Typography variant="subtitle2">{t('hits.below')}</Typography>
          {result?.belowThreshold.map((hit) => <Typography key={hit.knowledgeItemId} color="text.secondary" data-user-content>
            {hit.title} · {hit.final.toFixed(3)}
          </Typography>)}
        </Stack>}
      </Stack>}
    </SectionCard>
    <RetrievalEvaluationPanel strategy={strategy === 'auto' ? 'hybrid' : strategy} minScore={minimum} valid={validMinimum} />
    <SavedRetrievalCases query={query.trim()} />
    {source && <SourceDrawer key={source.knowledgeItemId + ':' + source.revision}
      source={source} onClose={() => setSource(null)} />}
  </Stack>;
}

export default function KnowledgeSearchPage() {
  const businessId = useSession().currentBusiness?.id;
  return businessId ? <Workbench key={businessId} /> : null;
}
