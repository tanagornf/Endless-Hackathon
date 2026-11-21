import { Alert, Button, Checkbox, Stack, Switch, TextField } from '@mui/material';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FEATURES } from '@nless/shared/core/features';
import type { FeatureFlagView } from '@nless/shared/core/types';
import { ConfirmDialog, StatusChip, useApiMutation, useApiQuery, useToast } from '../ui';
import { actionSize, OpsTable, platformScope } from './OpsControls';
import type { OpsFeatureRow } from './opsTypes';

type FlagAction = { kind: 'single'; id: string } | { kind: 'bulk'; ids: string[] };
const canHide = (row: OpsFeatureRow) => FEATURES.some((feature) => feature.id === row.featureId && feature.folder);

export function FeaturesPanel() {
  const { t } = useTranslation('ops');
  const toast = useToast();
  const [selected, setSelected] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [action, setAction] = useState<FlagAction | null>(null);
  const [singleId, setSingleId] = useState<string>();
  const query = useApiQuery<{ production: boolean; items: OpsFeatureRow[] }>('/ops/features', platformScope);
  const single = useApiMutation<{ hidden: boolean; reason?: string }, FeatureFlagView>('PUT',
    '/ops/features/' + encodeURIComponent(action?.kind === 'single' ? action.id : singleId ?? ''), platformScope);
  const bulk = useApiMutation<{ hide: string[]; show: string[]; reason?: string }, unknown>('POST', '/ops/features/bulk', platformScope);
  const rows = query.data?.items ?? [];
  const selectedIds = rows.filter((row) => canHide(row) && !row.hidden && selected.includes(row.featureId)).map((row) => row.featureId);
  const placeholders = rows.filter((row) => canHide(row) && !row.hidden && row.placeholder).map((row) => row.featureId);
  const pending = single.running || bulk.running;
  function open(next: FlagAction) {
    setReason('');
    setAction(next);
  }
  function saved() {
    setSelected([]);
    toast.success(t('features.saved'));
    query.reload();
  }

  return <Stack spacing={2}>
    <Alert severity="warning">{t('features.note')}</Alert>
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
      <Button sx={actionSize} disabled={pending || !placeholders.length}
        onClick={() => open({ kind: 'bulk', ids: placeholders })}>{t('features.hidePlaceholders')}</Button>
      <Button sx={actionSize} disabled={pending || !selectedIds.length}
        onClick={() => open({ kind: 'bulk', ids: selectedIds })}>{t('features.hideSelected')}</Button>
    </Stack>
    <OpsTable query={query} rows={rows} rowKey={(row) => row.featureId} columns={[
      { key: 'select', header: t('features.select'), render: (row) => canHide(row) && !row.hidden && <Checkbox
        checked={selected.includes(row.featureId)}
        slotProps={{ input: { 'aria-label': t('features.selectNamed', { id: row.featureId }) } }}
        onChange={(_event, checked) => setSelected((ids) => checked ? [...ids, row.featureId] : ids.filter((id) => id !== row.featureId))} /> },
      { key: 'featureId', header: t('common.id') },
      { key: 'name', header: t('features.name'), render: (row) => t(`featureName.${row.featureId}`, { defaultValue: row.slug }) },
      { key: 'lane', header: t('features.lane') },
      { key: 'tier', header: t('features.tier'), render: (row) => `${row.tier} · ${t(row.tierOpen ? 'features.open' : 'features.closed')}` },
      { key: 'routeCount', header: t('tabs.routes') },
      { key: 'placeholder', header: t('features.build'), render: (row) => <StatusChip
        status={row.placeholder ? 'pending' : 'active'} label={t(row.placeholder ? 'features.placeholder' : 'common.available')} /> },
      { key: 'visible', header: t('features.visible'), render: (row) => <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
        {canHide(row) && <Switch checked={!row.hidden} disabled={pending}
          slotProps={{ input: { role: 'switch', 'aria-label': t('features.menuNamed', { id: row.featureId }) } }}
          onChange={() => {
            if (!row.hidden) open({ kind: 'single', id: row.featureId });
            else setSingleId(row.featureId);
          }} />}
        <span>{t(row.visible ? 'features.visible' : row.placeholder && !row.hidden ? 'features.autoHidden' : 'features.hidden')}</span>
      </Stack> },
    ]} />
    {action && <ConfirmDialog open danger onClose={() => setAction(null)} title={t('features.hide')}
      confirmLabel={t('features.hide')}
      message={<Stack spacing={2}>
        <span>{t(action.kind === 'single' ? 'features.confirmHide' : 'features.confirmBulk',
          { id: action.kind === 'single' ? action.id : '', count: action.kind === 'bulk' ? action.ids.length : 1 })}</span>
        <TextField fullWidth label={t('features.reason')} value={reason} onChange={(event) => setReason(event.target.value)}
          slotProps={{ htmlInput: { maxLength: 200 } }} />
      </Stack>}
      onConfirm={async () => {
        const message = reason.trim() || undefined;
        if (action.kind === 'single') await single.run({ hidden: true, reason: message });
        else await bulk.run({ hide: action.ids, show: [], reason: message });
        saved();
      }} />}
    {singleId && <ConfirmDialog open onClose={() => setSingleId(undefined)} title={t('features.show')}
      confirmLabel={t('features.show')} message={t('features.confirmShow', { id: singleId })}
      onConfirm={async () => { await single.run({ hidden: false }); saved(); }} />}
  </Stack>;
}
