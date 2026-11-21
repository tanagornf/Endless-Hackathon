import { Alert, Button, Stack, Switch } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { PreferenceRow } from '@nless/shared/features/notifications/types';
import { DataTable, SectionCard, useApiMutation, useApiQuery, useToast } from '../../core';

type Item = Pick<PreferenceRow, 'type' | 'inApp' | 'push'>;
type PreferenceList = { items: PreferenceRow[] };

export default function NotificationPreferences() {
  const { t } = useTranslation('notifications');
  const toast = useToast();
  const query = useApiQuery<PreferenceList>('/notification-preferences', { businessScoped: false });
  const mutation = useApiMutation<{ items: Item[] }, PreferenceList>('PUT', '/notification-preferences', { businessScoped: false });

  async function save(row: PreferenceRow, field: 'inApp' | 'push', enabled: boolean) {
    const item = { type: row.type, inApp: row.inApp, push: row.push, [field]: enabled };
    await mutation.run({ items: [item] });
    query.reload();
    toast.success(t('settings.saved'));
  }

  return <SectionCard title={t('settings.title')}>
    <Stack spacing={2}>
      {query.error && <Alert severity="error" action={<Button onClick={query.reload}>{t('common.retry')}</Button>}>{t('settings.error')}</Alert>}
      {(!query.error || query.loading) && <DataTable rows={query.data?.items ?? []} rowKey={(item) => item.type} loading={query.loading}
        columns={[
          { key: 'type', header: t('col.type'), render: (item) => t('type.' + item.type) },
          { key: 'inApp', header: t('settings.inApp'), render: (item) => <Switch disabled={item.forcedInApp || mutation.running}
            checked={item.inApp} slotProps={{ input: { 'aria-label': t('settings.inAppType', { type: t('type.' + item.type) }) } }}
            onChange={(_event, checked) => { void save(item, 'inApp', checked).catch(() => undefined); }} /> },
          { key: 'push', header: t('settings.push'), render: (item) => <Switch disabled={mutation.running}
            checked={item.push} slotProps={{ input: { 'aria-label': t('settings.pushType', { type: t('type.' + item.type) }) } }}
            onChange={(_event, checked) => { void save(item, 'push', checked).catch(() => undefined); }} /> },
        ]} />}
    </Stack>
  </SectionCard>;
}
