import { Box, Button, Drawer, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { JobState, Page } from '@nless/shared/core/types';
import { useRealtime } from '../realtime';
import { ConfirmDialog, StatusChip, useApiMutation, useApiQuery, useToast } from '../ui';
import {
  actionSize, dash, OpsError, OpsSearch, OpsTable, Pagination, opsDate, opsPath, platformScope,
  reportStaleAction, useSearchFilter, useVisiblePolling,
} from './OpsControls';
import { jobStates } from './opsTypes';
import type { OpsJobDetail, OpsJobRow, OpsSummary } from './opsTypes';

type JobAction = { row: OpsJobRow; kind: 'retry' | 'cancel' | 'retryDead' };
const retryLimit = 100;
const retryable = new Set<JobState>(['queued', 'failed', 'dead', 'cancelled']);

function Summary({ summary }: { summary: OpsSummary }) {
  const { t } = useTranslation('ops');
  const stats = [
    [t('summary.queued'), summary.counts.queued],
    [t('summary.running'), summary.counts.running],
    [t('summary.succeeded'), summary.byType24h.reduce((total, row) => total + row.succeeded, 0)],
    [t('summary.dead'), summary.counts.dead],
    [t('summary.deliveries'), summary.deliveriesNeedingAttention],
    [t('summary.oldest'), summary.oldestQueuedAgeSeconds === null ? dash : t('summary.seconds', { value: summary.oldestQueuedAgeSeconds })],
    [t('summary.worker'), !summary.worker.enabled ? t('common.disabled') : summary.worker.running
      ? t('summary.workerActive', { inflight: summary.worker.inFlight, total: summary.worker.concurrency }) : t('summary.stopped')],
    [t('summary.scheduler'), !summary.scheduler.enabled ? t('common.disabled') : summary.scheduler.holdsLock
      ? t('summary.holdsLock') : t('summary.otherInstance')],
  ];
  return <Box component="dl" sx={{
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 130px), 1fr))', gap: 1.5, m: 0,
  }}>
    {stats.map(([label, value]) => <Paper variant="outlined" sx={{ p: 1.5 }} key={label}>
      <Typography component="dt" variant="body2" color="text.secondary">{label}</Typography>
      <Typography component="dd" sx={{ m: 0, fontWeight: 600 }}>{value}</Typography>
    </Paper>)}
  </Box>;
}

function JobDetail({ id, close }: { id: string; close: () => void }) {
  const { t } = useTranslation('ops');
  const title = useId();
  const query = useApiQuery<OpsJobDetail>('/ops/jobs/' + encodeURIComponent(id), platformScope);
  return <Drawer anchor="right" open onClose={close} slotProps={{ paper: {
    sx: { width: { xs: '100%', sm: 520 }, p: 2 }, role: 'dialog', 'aria-labelledby': title,
  } }}>
    <Stack spacing={2}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography id={title} component="h2" variant="h6">{t('jobs.detail')}</Typography>
        <Button autoFocus sx={actionSize} onClick={close}>{t('common.close')}</Button>
      </Stack>
      {query.error ? <OpsError reload={query.reload} /> : !query.data ? <Typography role="status">{t('common.loading')}</Typography>
        : <>
          <Typography>{query.data.type} · {query.data.id}</Typography>
          {([
            [t('jobs.lastError'), query.data.lastError],
            [t('jobs.lockKey'), query.data.lockKey],
            [t('jobs.dedupKey'), query.data.dedupKey],
            [t('jobs.payload'), JSON.stringify(query.data.payloadView, null, 2)],
            [t('jobs.result'), query.data.result && JSON.stringify(query.data.result, null, 2)],
          ] as const).map(([label, value]) => <Box key={label}>
            <Typography component="h3" variant="subtitle2">{label}</Typography>
            <Typography component="pre" variant="body2" sx={{ m: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{value ?? dash}</Typography>
          </Box>)}
        </>}
    </Stack>
  </Drawer>;
}

function JobResults({ path, dead, cursor, onPage }: {
  path: string; dead: boolean; cursor?: string; onPage: (cursor?: string) => void;
}) {
  const { t } = useTranslation('ops');
  const toast = useToast();
  const query = useApiQuery<Page<OpsJobRow>>(path, platformScope);
  const [snapshot, setSnapshot] = useState<Page<OpsJobRow>>();
  const [action, setAction] = useState<JobAction | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  if (query.data && query.data !== snapshot) setSnapshot(query.data);
  const page = query.data ?? snapshot;
  useVisiblePolling(query);

  const mutation = useApiMutation<{ type: string; limit: number } | undefined, { retried?: number }>('POST',
    action?.kind === 'retryDead' ? '/ops/jobs/retry-dead'
      : '/ops/jobs/' + encodeURIComponent(action?.row.id ?? '') + '/' + action?.kind, { ...platformScope, toastOnError: false });
  async function confirm() {
    if (!action) return;
    try {
      const result = await mutation.run(action.kind === 'retryDead' ? { type: action.row.type, limit: retryLimit } : undefined);
      toast.success(action.kind === 'retryDead' ? t('jobs.retriedCount', { count: result.retried })
        : t(action.kind === 'cancel' ? 'jobs.cancelled' : 'jobs.retried'));
    } catch (error) {
      if (!reportStaleAction(error, t, toast)) throw error;
    }
    query.reload();
  }
  return <>
    <OpsTable query={query} rows={page?.items ?? []} rowKey={(row) => row.id} empty={t('jobs.empty')} columns={[
      { key: 'type', header: t('jobs.type') },
      { key: 'state', header: t('jobs.state'), render: (row) => <StatusChip status={row.state} label={t(`state.${row.state}`)} /> },
      { key: 'businessId', header: t('jobs.business'), render: (row) => row.businessId
        ? <span title={row.businessId}>{row.businessId.slice(0, 8)}</span> : dash },
      { key: 'attempts', header: t('jobs.attempts'), render: (row) => `${row.attempts}/${row.maxAttempts}` },
      { key: 'runAt', header: t('jobs.runAt'), render: (row) => opsDate(row.runAt) },
      { key: 'lastError', header: t('jobs.lastError'), render: (row) => row.lastError
        ? <Typography component="span" variant="body2" title={row.lastError} sx={{ overflowWrap: 'anywhere' }}>
          {row.lastError.length > 80 ? row.lastError.slice(0, 80) + '…' : row.lastError}
        </Typography> : dash },
      { key: 'actions', header: t('common.actions'), render: (row) => <Stack direction="row" spacing={0.5}>
        <Button sx={actionSize} onClick={() => setDetail(row.id)}>{t('jobs.detail')}</Button>
        {(dead || retryable.has(row.state)) && <Button sx={actionSize} onClick={() => setAction({ row, kind: 'retry' })}>{t('jobs.retry')}</Button>}
        {dead && <Button sx={actionSize} onClick={() => setAction({ row, kind: 'retryDead' })}>{t('jobs.retryDead')}</Button>}
        {(row.state === 'queued' || row.state === 'running') &&
          <Button color="error" sx={actionSize} onClick={() => setAction({ row, kind: 'cancel' })}>{t('jobs.cancel')}</Button>}
      </Stack> },
    ]} />
    <Pagination cursor={cursor} nextCursor={page?.nextCursor} onChange={onPage} />
    {detail && <JobDetail id={detail} close={() => setDetail(null)} />}
    {action && <ConfirmDialog open danger
      title={t(`jobs.${action.kind}`)}
      message={t(action.kind === 'retryDead' ? 'jobs.confirmRetryDead' : action.kind === 'cancel' ? 'jobs.confirmCancel' : 'jobs.confirmRetry',
        { count: retryLimit, type: action.row.type })}
      confirmLabel={t(`jobs.${action.kind}`)} onClose={() => setAction(null)} onConfirm={confirm} />}
  </>;
}

export function JobsPanel({ dead = false }: { dead?: boolean }) {
  const { t } = useTranslation('ops');
  const [state, setState] = useState('');
  const [type, setType] = useState('');
  const search = useSearchFilter();
  const summary = useApiQuery<OpsSummary>('/ops/summary', platformScope);
  const [lastSummary, setLastSummary] = useState<OpsSummary>();
  if (summary.data && summary.data !== lastSummary) setLastSummary(summary.data);
  const data = summary.data ?? lastSummary;
  const refresh = useVisiblePolling(summary);
  useRealtime('job.updated', refresh);
  const results = useRef<HTMLDivElement>(null);
  const filters = { state: dead ? 'dead' : state, type, q: search.filter };
  const base = opsPath('/ops/jobs', filters);
  const [position, setPosition] = useState<{ base: string; cursor?: string }>();
  const cursor = position?.base === base ? position.cursor : undefined;
  const path = opsPath('/ops/jobs', { ...filters, cursor });
  const types = [...new Set([...(data?.byType24h.map((row) => row.type) ?? []), ...(type ? [type] : [])])].sort();
  return <Stack spacing={2}>
    {!dead && (summary.error ? <OpsError reload={summary.reload} /> : data
      ? <Summary summary={data} /> : <Typography role="status">{t('common.loading')}</Typography>)}
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
      {!dead && <TextField select size="small" label={t('jobs.state')} value={state} sx={{ minWidth: 160 }}
        onChange={(event) => setState(event.target.value)}>
        <MenuItem value="">{t('common.all')}</MenuItem>
        {jobStates.map((value) => <MenuItem value={value} key={value}>{t(`state.${value}`)}</MenuItem>)}
      </TextField>}
      <TextField select size="small" label={t('jobs.type')} value={type} sx={{ minWidth: 160 }}
        onChange={(event) => setType(event.target.value)}>
        <MenuItem value="">{t('common.all')}</MenuItem>
        {types.map((value) => <MenuItem value={value} key={value}>{value}</MenuItem>)}
      </TextField>
      <OpsSearch label={t('jobs.search')} value={search.input} onChange={search.setInput} />
    </Stack>
    <Box ref={results} role="region" aria-label={t('jobs.results')} tabIndex={-1} sx={{ minWidth: 0 }}>
      <JobResults key={path} path={path} dead={dead} cursor={cursor} onPage={(next) => {
        setPosition({ base, cursor: next });
        results.current?.focus();
      }} />
    </Box>
  </Stack>;
}
