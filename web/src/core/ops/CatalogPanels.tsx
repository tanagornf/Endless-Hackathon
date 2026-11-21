import { alpha, Box, Button, MenuItem, Stack, TextField } from '@mui/material';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FEATURES } from '@nless/shared/core/features';
import { StatusChip, useApiQuery } from '../ui';
import { actionSize, dash, opsDate, opsPath, OpsSearch, OpsTable, platformScope, useSearchFilter } from './OpsControls';
import type { OpsRouteRow, OpsScheduleRow } from '@nless/shared/core/ops';

function missingSchedule(row: OpsScheduleRow) {
  return row.source === 'expected_missing' && row.status === 'declared';
}

export function SchedulesPanel() {
  const { t } = useTranslation('ops');
  const query = useApiQuery<{ items: OpsScheduleRow[] }>('/ops/schedules', platformScope);
  return <Box sx={(theme) => ({ '& tr:has([data-schedule-missing]) td': {
    backgroundColor: alpha(theme.palette.warning.main, 0.12), borderBottomColor: 'warning.main',
  } })}>
    <OpsTable query={query} rows={query.data?.items ?? []} rowKey={(row) => row.name} columns={[
      { key: 'name', header: t('schedules.name') },
      { key: 'everySeconds', header: t('schedules.frequency'), render: (row) => t('schedules.every', { seconds: row.everySeconds }) },
      { key: 'ownerFeature', header: t('schedules.owner') },
      { key: 'lastSlot', header: t('schedules.lastSlot'), render: (row) => opsDate(row.lastSlot) },
      { key: 'lastState', header: t('schedules.lastState'), render: (row) => row.lastState
        ? <StatusChip status={row.lastState} label={t(`state.${row.lastState}`, { defaultValue: row.lastState })} /> : dash },
      { key: 'lastFinishedAt', header: t('schedules.finished'), render: (row) => opsDate(row.lastFinishedAt) },
      { key: 'lastError', header: t('jobs.lastError') },
      { key: 'status', header: t('jobs.state'), render: (row) => missingSchedule(row)
        ? <span data-schedule-missing><StatusChip status="pending" label={t('schedules.missing')} /></span>
        : t(row.source === 'registered' ? 'schedules.registered' : 'schedules.planned') },
    ]} />
  </Box>;
}

function csvField(value: string) {
  // Protect cells from interpretation as formulas by spreadsheet software.
  const safe = /^[\s]*[=+\-@]|^[\t\r\n]/.test(value) ? "'" + value : value;
  return '"' + safe.replaceAll('"', '""') + '"';
}

function exportRoutes(rows: OpsRouteRow[]) {
  const values = [
    ['method', 'path', 'featureId', 'auth', 'permission', 'summary', 'placeholder'],
    ...rows.map((row) => [
      row.method, row.path, row.featureId, row.auth, row.permission ?? '', row.summary ?? '', String(row.placeholder),
    ]),
  ];
  const csv = values.map((row) => row.map(csvField).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: 'endless-api-routes.csv' });
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function RoutesPanel() {
  const { t } = useTranslation('ops');
  const search = useSearchFilter();
  const [featureId, setFeature] = useState('');
  const query = useApiQuery<{ items: OpsRouteRow[] }>(opsPath('/ops/routes', { featureId, q: search.filter }), platformScope);
  const rows = query.data?.items ?? [];
  return <Stack spacing={2}>
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
      <OpsSearch label={t('routes.search')} value={search.input} onChange={search.setInput} />
      <TextField select size="small" label={t('routes.feature')} value={featureId} sx={{ minWidth: 170 }}
        onChange={(event) => setFeature(event.target.value)}>
        <MenuItem value="">{t('common.all')}</MenuItem>
        {FEATURES.map(({ id, title }) => <MenuItem key={id} value={id}>
          {id} · {t(`featureName.${id}`, { defaultValue: title })}
        </MenuItem>)}
      </TextField>
      <Button disabled={query.loading || !rows.length || search.input.trim() !== search.filter}
        sx={actionSize} onClick={() => exportRoutes(rows)}>{t('routes.export')}</Button>
    </Stack>
    <OpsTable query={query} rows={rows} rowKey={(row) => row.method + ' ' + row.path} columns={[
      { key: 'method', header: t('routes.method') },
      { key: 'path', header: t('routes.path') },
      { key: 'featureId', header: t('routes.feature') },
      { key: 'auth', header: t('routes.auth') },
      { key: 'permission', header: t('routes.permission') },
      { key: 'summary', header: t('routes.summary') },
      { key: 'placeholder', header: t('jobs.state'), render: (row) => row.placeholder
        ? <StatusChip status="pending" label={t('features.placeholder')} /> : null },
    ]} />
  </Stack>;
}
