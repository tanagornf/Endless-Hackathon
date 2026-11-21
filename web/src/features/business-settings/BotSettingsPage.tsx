import { useState } from 'react';
import { Alert, Button, Skeleton, Stack, Switch, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { SettingsView } from '@nless/shared/features/business-settings/types';
import {
  ConfirmDialog, EmptyState, PageHeader, SectionCard, useApiMutation, useApiQuery, useCan,
  useRealtime, useSession, useToast,
} from '../../core';

export default function BotSettingsPage() {
  const businessId = useSession().currentBusiness?.id;
  const { t } = useTranslation('business-settings');

  return (
    <>
      <PageHeader title={t('bot.title')} />
      {businessId && <AiSwitchCard key={businessId} />}
    </>
  );
}

function AiSwitchCard() {
  const { t } = useTranslation('business-settings');
  const canEdit = useCan('business.bot_settings');
  const query = useApiQuery<SettingsView>('/settings');
  const update = useApiMutation<{ enabled: boolean }, SettingsView>('PUT', '/settings/ai');
  const toast = useToast();
  const [confirmOff, setConfirmOff] = useState(false);
  useRealtime('custom', (event) => {
    if (event.featureId === 'F04' && event.name === 'business-settings.changed') query.reload();
  });

  async function save(enabled: boolean) {
    await update.run({ enabled });
    toast.success(t('settings.saved'));
    query.reload();
  }

  if (query.error) {
    return (
      <EmptyState
        title={t('settings.error')}
        action={<Button onClick={query.reload}>{t('settings.retry')}</Button>}
      />
    );
  }

  const view = query.data;
  return (
    <SectionCard title={t('ai.title')}>
      {view ? (
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <Switch
              checked={view.aiSwitch}
              disabled={!canEdit || query.loading || update.running}
              slotProps={{
                input: { role: 'switch', 'aria-label': t('ai.title'), ...{ 'data-testid': 'ai-switch' } },
              }}
              onChange={(_, enabled) => {
                if (enabled) void save(true).catch(() => {});
                else setConfirmOff(true);
              }}
            />
            <Typography color="text.secondary" variant="body2">
              {t(view.settings.aiEnabled ? 'ai.on' : 'ai.off')}
            </Typography>
          </Stack>
          {view.aiBlockedReason && <Alert severity="warning">{t('ai.blocked.' + view.aiBlockedReason)}</Alert>}
          {!canEdit && <Typography color="text.secondary" variant="body2">{t('settings.readOnly')}</Typography>}
        </Stack>
      ) : (
        <Skeleton height={68} />
      )}
      <ConfirmDialog
        open={confirmOff}
        title={t('ai.confirmOffTitle')}
        message={t('ai.confirmOffMessage')}
        onClose={() => setConfirmOff(false)}
        onConfirm={() => save(false)}
      />
    </SectionCard>
  );
}
