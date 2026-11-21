import { Alert, Button, MenuItem, Stack, TextField } from '@mui/material';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Page } from '@nless/shared/core/types';
import { ConfirmDialog, useApiMutation, useApiQuery, useToast } from '../ui';
import { actionSize, opsDate, opsPath, OpsTable, Pagination, platformScope, reportStaleAction } from './OpsControls';
import type { OpsDeliveryRow } from './opsTypes';

const resolutions = { sent: 'markSent', failed: 'markFailed', resend: 'resend' } as const;
type Resolution = keyof typeof resolutions;

export function DeliveriesPanel() {
  const { t } = useTranslation('ops');
  const toast = useToast();
  const [state, setState] = useState('unknown');
  const [cursor, setCursor] = useState<string>();
  const [action, setAction] = useState<{ row: OpsDeliveryRow; resolution: Resolution } | null>(null);
  const [note, setNote] = useState('');
  const query = useApiQuery<Page<OpsDeliveryRow>>(opsPath('/ops/deliveries', { state, cursor }), platformScope);
  const mutation = useApiMutation<{ resolution: Resolution; note?: string }, unknown>('POST',
    '/ops/deliveries/' + encodeURIComponent(action?.row.messageId ?? '') + '/resolve', { ...platformScope, toastOnError: false });

  return <Stack spacing={2}>
    <Alert severity="info">{t('deliveries.intro')}</Alert>
    <TextField select size="small" label={t('jobs.state')} value={state} sx={{ maxWidth: 260 }}
      onChange={(event) => { setState(event.target.value); setCursor(undefined); }}>
      <MenuItem value="unknown">{t('deliveries.unknown')}</MenuItem>
      <MenuItem value="failed">{t('deliveries.failed')}</MenuItem>
    </TextField>
    <OpsTable query={query} rows={query.data?.items ?? []} rowKey={(row) => row.messageId} empty={t('deliveries.empty')} columns={[
      { key: 'channel', header: t('deliveries.channel') },
      { key: 'businessId', header: t('jobs.business'), render: (row) => <span title={row.businessId}>{row.businessId.slice(0, 8)}</span> },
      { key: 'createdAt', header: t('common.date'), render: (row) => opsDate(row.createdAt) },
      { key: 'deliveryError', header: t('jobs.lastError') },
      { key: 'actions', header: t('common.actions'), render: (row) => row.deliveryState === 'unknown'
        ? <Stack direction="row" spacing={0.5}>
          {(Object.keys(resolutions) as Resolution[]).map((resolution) =>
            <Button key={resolution} sx={actionSize} color={resolution === 'resend' ? 'error' : 'primary'}
              onClick={() => { setNote(''); setAction({ row, resolution }); }}>{t(`deliveries.${resolutions[resolution]}`)}</Button>)}
        </Stack> : null },
    ]} />
    <Pagination cursor={cursor} nextCursor={query.data?.nextCursor} onChange={setCursor} />
    {action && <ConfirmDialog open danger onClose={() => setAction(null)}
      title={t(`deliveries.${resolutions[action.resolution]}`)}
      confirmLabel={t(`deliveries.${resolutions[action.resolution]}`)}
      message={<Stack spacing={2}>
        <span>{t(`deliveries.confirm.${action.resolution}`)}</span>
        <TextField fullWidth label={t('deliveries.note')} value={note} onChange={(event) => setNote(event.target.value)}
          slotProps={{ htmlInput: { maxLength: 200 } }} />
      </Stack>}
      onConfirm={async () => {
        try {
          await mutation.run({ resolution: action.resolution, note: note.trim() || undefined });
          toast.success(t('deliveries.resolved'));
        } catch (error) {
          if (!reportStaleAction(error, t, toast)) throw error;
        }
        query.reload();
      }} />}
  </Stack>;
}
