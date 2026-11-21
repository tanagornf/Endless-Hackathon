import { Alert, Box, Button, Stack, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Page } from '@nless/shared/core/types';
import { FormDialog, SectionCard, StatusChip, useApiMutation, useApiQuery, useToast } from '../ui';
import { getFailure } from '../ui/toast';
import {
  actionSize, opsDate, opsPath, OpsError, OpsSearch, OpsTable, Pagination, platformScope, useSearchFilter, useVisiblePolling,
} from './OpsControls';
import type { DemoResetResult, OpsAuditRow, OpsBuild, OpsSummary } from './opsTypes';

const resetPhrase = 'RESET DEMO';

function BuildInfo({ build }: { build: OpsBuild }) {
  const { t } = useTranslation('ops');
  const toast = useToast();
  const enabled = (value: boolean) => t(value ? 'common.enabled' : 'common.disabled');
  const pairs = [
    [t('system.sha'), `${build.shortSha} · ${build.sha}`],
    [t('system.env'), build.env],
    [t('system.schema'), build.schema],
    [t('system.node'), build.node],
    [t('system.uptime'), t('summary.seconds', { value: build.uptimeSeconds })],
    [t('system.started'), opsDate(build.startedAt)],
    [t('system.model'), build.modelMode],
    [t('system.features'), build.featuresLoaded],
    [t('system.providers'), Object.entries(build.providerModes).map(([provider, mode]) => `${provider}: ${mode}`).join(' · ')],
    [t('system.database'), t(build.db.ok ? 'system.dbHealthy' : 'system.dbUnavailable', { ms: build.db.latencyMs })],
    [t('system.pool'), t('system.poolStats', { total: build.db.poolTotal, idle: build.db.poolIdle, waiting: build.db.poolWaiting })],
    [t('system.memory'), t('system.memoryStats', build.memoryMb)],
    [t('system.upload'), enabled(build.uploadDirWritable)],
    [t('system.demoTitle'), enabled(build.demoResetEnabled)],
    [t('system.devLogin'), enabled(build.devLoginEnabled)],
    [t('system.mcp'), enabled(build.mcpEnabled)],
  ] as const;
  return <SectionCard title={t('system.title')} actions={<Button sx={actionSize} onClick={async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(build, null, 2));
      toast.success(t('system.copied'));
    } catch {
      toast.error(t('system.copyFailed'));
    }
  }}>{t('system.copy')}</Button>}>
    <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(9rem, max-content) 1fr' }, gap: 1, m: 0 }}>
      {pairs.map(([label, value]) => <Box key={label} sx={{ display: 'contents' }}>
        <Typography component="dt" color="text.secondary">{label}</Typography>
        <Typography component="dd" sx={{ m: 0, overflowWrap: 'anywhere' }}>{value}</Typography>
      </Box>)}
    </Box>
  </SectionCard>;
}

function DemoReset({ enabled, reloadBuild }: { enabled?: boolean; reloadBuild: () => void }) {
  const { t } = useTranslation('ops');
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [observingSince, setObservingSince] = useState<OpsSummary | null>();
  const observing = observingSince !== undefined;
  const [result, setResult] = useState<DemoResetResult>();
  const summary = useApiQuery<OpsSummary>(enabled || observing ? '/ops/summary' : null, platformScope);
  const active = summary.data?.demoResetting === true;
  const [remoteWasActive, setRemoteWasActive] = useState(false);
  if (active && !remoteWasActive) setRemoteWasActive(true);
  if (summary.data?.demoResetting === false) {
    if (remoteWasActive) setRemoteWasActive(false);
    if (observing && summary.data !== observingSince) setObservingSince(undefined);
  }
  const mutation = useApiMutation<{ confirm: typeof resetPhrase }, DemoResetResult>('POST', '/ops/demo/reset',
    { ...platformScope, toastOnError: false });
  const resetBusy = mutation.running || observing || active || remoteWasActive;
  useVisiblePolling(summary, resetBusy);
  async function submit() {
    if (input !== resetPhrase || !enabled || resetBusy) return;
    setResult(undefined);
    try {
      const completed = await mutation.run({ confirm: resetPhrase });
      setResult(completed);
      setOpen(false);
      reloadBuild();
    } catch (error) {
      const failure = getFailure(error);
      const reason = failure?.error.details?.reason;
      if (reason === 'reset_in_progress') {
        setOpen(false);
        setObservingSince(summary.data ?? null);
        summary.reload();
        toast.info(t('system.demoRunning'));
      } else if (reason === 'demo_reset_disabled') {
        setOpen(false);
        reloadBuild();
        toast.error(t('system.demoDisabled'));
      } else if (failure?.error.retryable && failure.error.code !== 'RATE_LIMITED') {
        setOpen(false);
        setObservingSince(summary.data ?? null);
        summary.reload();
        toast.error(t('system.demoUnknown'));
      } else {
        toast.error(error);
      }
    }
  }
  return <SectionCard title={t('system.demoTitle')}>
    <Stack spacing={1.5} sx={{ alignItems: 'flex-start' }}>
      <Alert severity="warning">{t('system.demoBody')}</Alert>
      {enabled === false && <Typography>{t('system.demoDisabled')}</Typography>}
      {resetBusy && <Typography role="status">{t('system.demoRunning')}</Typography>}
      {resetBusy && summary.error && <OpsError reload={summary.reload} />}
      <Button variant="contained" color="error" sx={actionSize} disabled={!enabled || resetBusy} onClick={() => {
        setInput('');
        setOpen(true);
      }}>{t('system.demoButton')}</Button>
      {result && <Box role="status">
        <Typography sx={{ fontWeight: 600 }}>{t('system.demoDone', { ms: result.durationMs })}</Typography>
        <Box component="ul" sx={{ pl: 3, my: 1 }}>
          {result.steps.map((step, index) => <li key={step.name + index}>
            {step.name} · {t('system.stepTime', { ms: step.ms })} · <StatusChip status={step.ok ? 'succeeded' : 'failed'}
              label={t(step.ok ? 'state.succeeded' : 'system.stepFailed')} />
            {step.error && <Typography variant="body2">{step.error}</Typography>}
          </li>)}
        </Box>
      </Box>}
    </Stack>
    <FormDialog open={open} title={t('system.demoTitle')} submitLabel={t('system.demoButton')}
      submitting={mutation.running} submitDisabled={input !== resetPhrase || !enabled || resetBusy}
      onClose={() => setOpen(false)} onSubmit={submit}>
      <Typography>{t('system.demoBody')}</Typography>
      <TextField autoFocus autoComplete="off" label={t('system.demoConfirm')} value={input}
        onChange={(event) => setInput(event.target.value)} />
    </FormDialog>
  </SectionCard>;
}

function AuditPanel() {
  const { t } = useTranslation('ops');
  const search = useSearchFilter();
  const [position, setPosition] = useState<{ filter: string; cursor?: string }>();
  const cursor = position?.filter === search.filter ? position.cursor : undefined;
  const query = useApiQuery<Page<OpsAuditRow>>(opsPath('/ops/audit', { action: search.filter, cursor }), platformScope);
  return <SectionCard title={t('audit.title')}>
    <Stack spacing={1.5}>
      <OpsSearch label={t('audit.action')} value={search.input} onChange={search.setInput} />
      <OpsTable query={query} rows={query.data?.items ?? []} rowKey={(row) => row.id} columns={[
        { key: 'createdAt', header: t('common.date'), render: (row) => opsDate(row.createdAt) },
        { key: 'action', header: t('audit.action') },
        { key: 'actorUserId', header: t('audit.actor') },
        { key: 'businessId', header: t('jobs.business') },
        { key: 'targetType', header: t('audit.targetType') },
        { key: 'targetId', header: t('audit.targetId') },
      ]} />
      <Pagination cursor={cursor} nextCursor={query.data?.nextCursor}
        onChange={(next) => setPosition({ filter: search.filter, cursor: next })} />
    </Stack>
  </SectionCard>;
}

export function SystemPanel() {
  const { t } = useTranslation('ops');
  const query = useApiQuery<OpsBuild>('/ops/build', platformScope);
  const [lastBuild, setLastBuild] = useState<OpsBuild>();
  if (query.data && query.data !== lastBuild) setLastBuild(query.data);
  const build = query.data ?? lastBuild;
  return <Stack spacing={2}>
    {query.error ? <OpsError reload={query.reload} /> : !build
      ? <Typography role="status">{t('common.loading')}</Typography> : <BuildInfo build={build} />}
    {build && <DemoReset enabled={query.data?.demoResetEnabled} reloadBuild={query.reload} />}
    <AuditPanel />
  </Stack>;
}
