import { useState } from 'react';
import { Alert, Button, CircularProgress, Link, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { FEATURES } from '@nless/shared/core/features';
import type { Mode, ReleaseFeatureRow, ReleaseStatusView } from '@nless/shared/features/release/types';
import { DataTable, EmptyState, PageHeader, SectionCard, StatusChip, useApiQuery } from '../../core';

const modes = ['R', 'S', 'A', 'U'] as const;
const lanes = [...new Set(FEATURES.map((feature) => feature.lane))].sort();
const english = new Map(FEATURES.map((feature) => [feature.id as string, feature.title]));

export default function ReleasePage() {
  const { t, i18n } = useTranslation('release');
  const request = useApiQuery<ReleaseStatusView>('/release/status', { businessScoped: false });
  const [mode, setMode] = useState('');
  const [lane, setLane] = useState('');
  const data = request.data;
  const flags = new Map(data?.flags.map((flag) => [flag.featureId, flag]));
  const selected = data?.rows.filter((row) => (!mode || mode === row.actualMode) && (!lane || lane === row.lane)) ?? [];
  const modeLabel = (value: Mode) => value + ' · ' + t('mode.' + value);
  const featureName = (row: ReleaseFeatureRow) => i18n.resolvedLanguage?.startsWith('en') ? english.get(row.featureId) ?? row.name : row.name;

  return <Stack spacing={2} sx={{ minWidth: 0 }}>
    <PageHeader title={t('page.title')} />
    {!data && !request.error && <Stack role="status" direction="row" spacing={2} sx={{ alignItems: 'center' }}>
      <CircularProgress size={20} /><Typography>{t('page.loading')}</Typography>
    </Stack>}
    {request.error && <Alert severity="error" action={<Button onClick={request.reload}>{t('page.retry')}</Button>}>{t('page.error')}</Alert>}
    {data && <>
      <SectionCard title={t('build.title')}>
        <Stack spacing={1}>
          <Typography>{t('build.serving', { sha: data.build.sha })}</Typography>
          <Typography>{t('build.schema', { schema: data.build.schema ?? t('build.unknown') })}</Typography>
          <Typography>{t('build.model', { mode: t('providerMode.' + data.build.modelMode) })}</Typography>
          <Typography>{t('build.rollback', { sha: data.lastGreen?.sha ?? t('build.unknown') })}</Typography>
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
            {Object.entries(data.build.providerModes).map(([provider, state]) => <Typography key={provider} variant="body2">
              {t('build.provider', { provider: t('provider.' + provider), mode: t('providerMode.' + state) })}
            </Typography>)}
          </Stack>
        </Stack>
      </SectionCard>
      {data.stale && data.rows.length > 0 && <Alert severity="info">{t('page.stale')}</Alert>}
      {data.conflicts.length > 0 && <Alert severity="error">
        {data.conflicts.map((conflict) => <Typography key={conflict.featureId + conflict.kind}>
          {t('conflict.' + conflict.kind, { id: conflict.featureId })}
        </Typography>)}
      </Alert>}
      {data.rows.length === 0 ? <EmptyState title={t('page.empty')} /> : <SectionCard title={t('table.title')}>
        <Stack spacing={2}>
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
            {modes.map((value) => <StatusChip key={value} kind="feature" status={value}
              label={t('table.count', { mode: modeLabel(value), count: data.totals[value] })} />)}
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 1 }}>
            <TextField size="small" select label={t('table.status')} value={mode} onChange={(event) => setMode(event.target.value)} sx={{ minWidth: 160 }}>
              <MenuItem value="">{t('table.all')}</MenuItem>
              {modes.map((value) => <MenuItem key={value} value={value}>{modeLabel(value)}</MenuItem>)}
            </TextField>
            <TextField size="small" select label={t('table.lane')} value={lane} onChange={(event) => setLane(event.target.value)} sx={{ minWidth: 100 }}>
              <MenuItem value="">{t('table.all')}</MenuItem>
              {lanes.map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}
            </TextField>
          </Stack>
          <DataTable rows={selected} rowKey={(row) => row.featureId} empty={<EmptyState title={t('table.noMatches')} />}
            columns={[
              { key: 'name', header: t('table.feature'), render: (row) => row.featureId + ' · ' + featureName(row) },
              { key: 'lane', header: t('table.lane') },
              { key: 'tier', header: t('table.tier') },
              { key: 'actualMode', header: t('table.status'), render: (row) =>
                <StatusChip kind="feature" status={row.actualMode} label={modeLabel(row.actualMode)} /> },
              { key: 'targetMode', header: t('table.target'), render: (row) => modeLabel(row.targetMode) },
              { key: 'flag', header: t('table.menu'), render: (row) => {
                const flag = flags.get(row.featureId);
                return t('flag.' + (flag?.placeholder ? 'placeholder' : flag?.visible ? 'visible' : flag ? 'hidden' : 'unlisted'));
              } },
              { key: 'evidence', header: t('table.evidence'), render: (row) => <Stack>
                <Link href={row.links.evidence} target="_blank" rel="noopener noreferrer">{t('table.openEvidence')}</Link>
                {row.links.commit && <Link href={row.links.commit} target="_blank" rel="noopener noreferrer">{t('table.openCommit')}</Link>}
              </Stack> },
              { key: 'blocker', header: t('table.blocker'), render: (row) =>
                <span data-user-content>{row.blocker || t('table.noBlocker')}</span> },
            ]} />
        </Stack>
      </SectionCard>}
    </>}
  </Stack>;
}
