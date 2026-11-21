import { useState } from 'react';
import { Alert, Box, Button, Link, Pagination, Skeleton, Stack, TextField, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { WebApiError } from '@nless/shared/core/loader';
import type { ConnectLineInput, LineConnectionView, LineEventRow } from '@nless/shared/features/line/types';
import {
  ConfirmDialog, DataTable, EmptyState, FormDialog, PageHeader, SectionCard, StatusChip, formatDateTime,
  useApiMutation, useApiQuery, useCan, useRealtime, useSession, useToast,
} from '../../core';

const connectionPath = '/channels/line';
const blankCredentials = { channelId: '', channelSecret: '', accessToken: '' };
const pageSize = 10;

function RecentEvents({ items, loading, failed, reload }: {
  items: LineEventRow[]; loading: boolean; failed: boolean; reload: () => void;
}) {
  const { t } = useTranslation('line');
  const [page, setPage] = useState(1);
  const pageCount = Math.ceil(items.length / pageSize);
  const visiblePage = Math.min(page, Math.max(1, pageCount));
  const visible = items.slice((visiblePage - 1) * pageSize, visiblePage * pageSize);
  return (
    <SectionCard title={t('events.title')} actions={<Button onClick={reload} disabled={loading}>{t('actions.refresh')}</Button>}>
      {failed ? <EmptyState title={t('error.events')} action={<Button onClick={reload}>{t('actions.retry')}</Button>} /> : (
        <Stack spacing={2} sx={{ minWidth: 0 }}>
          <DataTable rows={visible} loading={loading} rowKey={(row) => row.webhookEventId} empty={<EmptyState title={t('events.empty')} />} columns={[
            { key: 'receivedAt', header: t('events.time'), render: (row) => formatDateTime(row.receivedAt) },
            { key: 'eventType', header: t('events.type'), render: (row) => t('eventType.' + row.eventType, { defaultValue: t('events.other') }) },
            { key: 'messageType', header: t('events.messageType'), render: (row) => row.messageType ? t('messageType.' + row.messageType, { defaultValue: t('events.other') }) : t('information.unavailable') },
            { key: 'isRedelivery', header: t('events.redelivery'), render: (row) => row.isRedelivery ? <StatusChip status="queued" label={t('events.yes')} /> : t('events.no') },
            { key: 'state', header: t('events.state'), render: (row) => <StatusChip status={row.state === 'done' ? 'completed' : row.state} label={t('eventState.' + row.state, { defaultValue: t('events.other') })} /> },
            { key: 'note', header: t('events.note'), render: (row) => row.note ? t('eventNote.' + row.note, { defaultValue: t('events.other') }) : t('information.unavailable') },
          ]} />
          {pageCount > 1 && <Pagination count={pageCount} page={visiblePage} onChange={(_, value) => setPage(value)}
            aria-label={t('events.pages')} getItemAriaLabel={(type, value) => t('events.pagination.' + type, { page: value })} />}
        </Stack>
      )}
    </SectionCard>
  );
}

export default function LineChannelPage() {
  const businessId = useSession().currentBusiness?.id;
  return <LineChannelSettings key={businessId} />;
}

function LineChannelSettings() {
  const { t } = useTranslation('line');
  const toast = useToast();
  const canManage = useCan('business.channels');
  const connection = useApiQuery<LineConnectionView>(connectionPath);
  const events = useApiQuery<{ items: LineEventRow[] }>(canManage ? connectionPath + '/events?limit=50' : null);
  const connect = useApiMutation<ConnectLineInput, LineConnectionView>('POST', connectionPath + '/connect', { toastOnError: false });
  const verify = useApiMutation<void, LineConnectionView>('POST', connectionPath + '/verify', { toastOnError: false });
  const disconnect = useApiMutation<void, void>('DELETE', connectionPath, { toastOnError: false });
  const [credentials, setCredentials] = useState(blankCredentials);
  const [formOpen, setFormOpen] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [pendingReplacement, setPendingReplacement] = useState<ConnectLineInput | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const view = connection.data;
  const live = view?.status === 'active' || view?.status === 'error';

  function reload() {
    connection.reload();
    if (canManage) events.reload();
  }
  useRealtime('custom', (event) => {
    if (event.featureId === 'F17' && event.name === 'line.connection.changed') reload();
  });

  function closeForm() {
    setFormOpen(false);
    setCredentials(blankCredentials);
    setFormError(null);
  }

  async function submitConnection(input: ConnectLineInput) {
    try {
      await connect.run(input);
      closeForm();
      toast.success(t('connect.success'));
      reload();
    } catch (cause) {
      const error = cause as Partial<WebApiError> | null;
      const reason = error?.details?.reason;
      if (reason === 'channel_in_use' || reason === 'credentials_rejected' || reason === 'secret_mismatch') {
        setFormError('connect.err.' + reason);
      } else {
        setFormError('connect.err.provider');
      }
      setPendingReplacement(null);
    }
  }

  async function validateForm() {
    const input = {
      channelId: credentials.channelId.trim(),
      channelSecret: credentials.channelSecret.trim(),
      ...(credentials.accessToken.trim() ? { accessToken: credentials.accessToken.trim() } : {}),
    };
    if (!/^[0-9]{5,20}$/.test(input.channelId)) return setFormError('connect.err.channelId');
    if (!/^[0-9a-f]{32}$/i.test(input.channelSecret)) return setFormError('connect.err.channelSecret');
    if (input.accessToken && (input.accessToken.length < 40 || input.accessToken.length > 400)) return setFormError('connect.err.accessToken');

    setFormError(null);
    if (live && view?.channelId !== input.channelId) setPendingReplacement(input);
    else await submitConnection(input);
  }

  async function verifyConnection() {
    try {
      const result = await verify.run();
      if (result.connected) toast.success(t('verify.success'));
      else toast.error(t('status.reason.' + result.statusReason, { defaultValue: t('verify.error') }));
    } catch {
      toast.error(t('verify.error'));
    }
    reload();
  }

  async function disconnectChannel() {
    try {
      await disconnect.run();
      toast.success(t('disconnect.success'));
      reload();
    } catch (error) {
      toast.error(t('disconnect.error'));
      throw error;
    }
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t('actions.copied'));
    } catch {
      toast.error(t('actions.copyFailed'));
    }
  }

  const manageActions = canManage && live ? (
    <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
      <Button onClick={() => { void verifyConnection(); }} disabled={verify.running}>{t('actions.verify')}</Button>
      <Button onClick={() => setFormOpen(true)}>{t('actions.reconnect')}</Button>
      <Button color="error" onClick={() => setConfirmDisconnect(true)}>{t('actions.disconnect')}</Button>
    </Stack>
  ) : undefined;

  return (
    <Box sx={{ width: '100%', minWidth: 0, '& .MuiButton-root': { minHeight: 44 } }}>
      <PageHeader title={t('page.title')} description={t('page.subtitle')} />
      <Stack spacing={2.5}>
        {!canManage && <Alert severity="info">{t('readOnly')}</Alert>}
        {connection.error ? (
          <EmptyState title={t('error.connection')} action={<Button onClick={reload}>{t('actions.retry')}</Button>} />
        ) : !view ? <Skeleton variant="rounded" height={185} aria-label={t('information.loading')} /> : <>
          {view.mode === 'sandbox' && <Alert severity="info">{t('sandbox.notice')}</Alert>}
          <SectionCard title={t('status.title')} actions={manageActions}>
            {!live ? <EmptyState title={t('status.none')} description={t('status.emptyDescription')} action={canManage &&
              <Button variant="contained" onClick={() => setFormOpen(true)}>{t('actions.connect')}</Button>} /> : (
              <Stack spacing={1.5} sx={{ alignItems: 'flex-start' }}>
                <StatusChip status={view.status === 'error' ? 'failed' : view.status} label={t('status.' + view.status)} />
                {view.status === 'error' && <Alert severity="warning">{t('status.reason.' + view.statusReason, { defaultValue: t('verify.error') })}</Alert>}
                <Typography variant="h6" data-user-content>{view.displayName}</Typography>
                <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'auto 1fr' }, gap: 0.75, m: 0, '& dd': { m: 0, overflowWrap: 'anywhere' } }}>
                  <dt>{t('information.channelId')}</dt><dd data-user-content>{view.channelId ?? t('information.unavailable')}</dd>
                  <dt>{t('information.basicId')}</dt><dd data-user-content>{view.basicId ?? t('information.unavailable')}</dd>
                  <dt>{t('information.lastEvent')}</dt><dd>{view.lastEventAt ? formatDateTime(view.lastEventAt) : t('information.never')}</dd>
                  <dt>{t('information.lastVerified')}</dt><dd>{view.lastVerifiedAt ? formatDateTime(view.lastVerifiedAt) : t('information.never')}</dd>
                  <dt>{t('information.eventsTotal')}</dt><dd>{view.eventsTotal}</dd>
                </Box>
              </Stack>
            )}
          </SectionCard>

          {live && view.addFriendUrl && <SectionCard title={t('friend.title')}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { xs: 'flex-start', sm: 'center' } }}>
              {view.addFriendQrDataUrl && <Box component="img" src={view.addFriendQrDataUrl} alt={t('friend.qrAlt')} width={152} height={152} />}
              <Stack spacing={0.5} sx={{ minWidth: 0, alignItems: 'flex-start' }}>
                <Typography>{t('friend.help')}</Typography>
                <Link href={view.addFriendUrl} target="_blank" rel="noreferrer" sx={{ overflowWrap: 'anywhere' }}>{view.addFriendUrl}</Link>
                <Button onClick={() => { void copy(view.addFriendUrl!); }}>{t('actions.copy')}</Button>
              </Stack>
            </Stack>
          </SectionCard>}

          {live && view.webhookUrl && <SectionCard title={t('webhook.title')}>
            <Stack spacing={1.25}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <TextField label={t('webhook.url')} value={view.webhookUrl} fullWidth size="small" slotProps={{ input: { readOnly: true } }} />
                <Button onClick={() => { void copy(view.webhookUrl!); }}>{t('actions.copy')}</Button>
              </Stack>
              {!view.webhookUrl.startsWith('https://') && <Alert severity="warning">{t('webhook.httpsWarning')}</Alert>}
              <Box component="ol" sx={{ m: 0, pl: 3 }}>
                {['step1', 'step2', 'step3', 'step4'].map((step) => <Typography component="li" key={step} sx={{ mb: 0.75 }}>{t('webhook.' + step)}</Typography>)}
              </Box>
            </Stack>
          </SectionCard>}

          <SectionCard title={t('usage.title')}>
            <Stack spacing={0.75}>
              <Typography>{t('usage.mine', view.push)}</Typography>
              {view.push.lineQuota && <Typography>{view.push.lineQuota.value === null ? t('usage.lineUnlimited', view.push.lineQuota) : t('usage.line', view.push.lineQuota)}</Typography>}
              <Typography variant="body2" color="text.secondary">{t('usage.note')}</Typography>
            </Stack>
          </SectionCard>
        </>}

        {canManage && <RecentEvents items={events.data?.items ?? []} loading={events.loading} failed={Boolean(events.error)} reload={events.reload} />}
      </Stack>
      {canManage && <>
        <FormDialog open={formOpen} title={t('connect.title')} submitLabel={t('actions.connect')} submitting={connect.running}
          error={formError ? t(formError) : null} onSubmit={validateForm} onClose={closeForm}>
          {live && <Alert severity="warning">{t('connect.replaceWarning')}</Alert>}
          <TextField label={t('connect.channelId')} value={credentials.channelId} required autoComplete="off"
            onChange={(event) => setCredentials({ ...credentials, channelId: event.target.value })} />
          <TextField label={t('connect.channelSecret')} value={credentials.channelSecret} required type="password" autoComplete="new-password"
            onChange={(event) => setCredentials({ ...credentials, channelSecret: event.target.value })} />
          <TextField label={t('connect.accessToken')} value={credentials.accessToken} type="password" autoComplete="new-password" helperText={t('connect.accessTokenHelp')}
            onChange={(event) => setCredentials({ ...credentials, accessToken: event.target.value })} />
        </FormDialog>
        <ConfirmDialog open={Boolean(pendingReplacement)} title={t('connect.replaceTitle')} message={t('connect.replaceWarning')}
          confirmLabel={t('actions.connect')} onClose={() => setPendingReplacement(null)}
          onConfirm={async () => { if (pendingReplacement) await submitConnection(pendingReplacement); }} />
        <ConfirmDialog open={confirmDisconnect} title={t('disconnect.title')} message={t('disconnect.message')}
          confirmLabel={t('actions.disconnect')} danger onConfirm={disconnectChannel} onClose={() => setConfirmDisconnect(false)} />
      </>}
    </Box>
  );
}
