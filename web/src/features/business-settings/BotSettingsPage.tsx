import { useState } from 'react';
import { Alert, Button, FormControlLabel, MenuItem, Skeleton, Stack, Switch, TextField, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import OwnerConsultPanel from './OwnerConsultPanel';
import ShopInstructionReviewPanel from './ShopInstructionReviewPanel';
import type {
  AnswerPolicy, AnswerPolicyPatch, MerchantCapabilities, SettingsView,
} from '@nless/shared/features/business-settings/types';
import {
  ConfirmDialog, EmptyState, PageHeader, SectionCard, StatusChip, useApiMutation, useApiQuery, useCan,
  useRealtime, useSession, useToast,
} from '../../core';
import { apiFailure, issueAt } from './settings-errors';

const revealFields = ['price', 'stock', 'contact'] as const;
const revealValues = ['always', 'ask_staff', 'never'] as const;
const capabilityFields = [
  'canQuotePrices', 'canTakeOrders', 'canTakeBookings', 'canHandoffToHuman', 'canShareContact',
] as const;

type Reveal = typeof revealValues[number];
type PolicyUpdate = { expectedVersion: number; policy: AnswerPolicyPatch | null };
type CapabilityUpdate = { expectedVersion: number; capabilities: MerchantCapabilities };

export default function BotSettingsPage() {
  const businessId = useSession().currentBusiness?.id;
  const [search] = useSearchParams();
  const consult = search.get('consult');
  const { t } = useTranslation('business-settings');
  return (
    <>
      <PageHeader title={t('bot.title')} />
      {businessId && consult && <OwnerConsultPanel key={businessId + ':' + consult} caseId={consult} />}
      {businessId && <BotSettings key={businessId} />}
      {businessId && <ShopInstructionReviewPanel key={'instructions:' + businessId} />}
    </>
  );
}

function BotSettings() {
  const { t } = useTranslation('business-settings');
  const query = useApiQuery<SettingsView>('/settings');
  const canEdit = useCan('business.bot_settings');

  useRealtime('custom', (event) => {
    if (event.featureId === 'F04' && event.name === 'business-settings.changed') query.reload();
  });

  if (query.error) {
    return <EmptyState title={t('settings.error')}
      action={<Button onClick={query.reload}>{t('settings.retry')}</Button>} />;
  }

  return (
    <Stack spacing={2}>
      <AiSwitchCard view={query.data} canEdit={canEdit} reload={query.reload} />
      <PolicyCards view={query.data} canEdit={canEdit} reload={query.reload} />
    </Stack>
  );
}

interface CardsProps {
  view: SettingsView | undefined;
  canEdit: boolean;
  reload: () => void;
}

function AiSwitchCard({ view, canEdit, reload }: CardsProps) {
  const { t } = useTranslation('business-settings');
  const update = useApiMutation<{ enabled: boolean }, SettingsView>('PUT', '/settings/ai');
  const toast = useToast();
  const [confirmOff, setConfirmOff] = useState(false);

  async function save(enabled: boolean) {
    await update.run({ enabled });
    toast.success(t('settings.saved'));
    reload();
  }

  return (
    <SectionCard title={t('ai.title')}>
      {view ? (
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <Switch
              checked={view.aiSwitch}
              disabled={!canEdit || update.running}
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
      ) : <Skeleton height={68} />}
      <ConfirmDialog open={confirmOff} title={t('ai.confirmOffTitle')} message={t('ai.confirmOffMessage')}
        onClose={() => setConfirmOff(false)} onConfirm={() => save(false)} />
    </SectionCard>
  );
}

function PolicyCards({ view, canEdit, reload }: CardsProps) {
  const { t } = useTranslation('business-settings');
  const toast = useToast();
  const patch = useApiMutation<PolicyUpdate, SettingsView>('PATCH', '/settings/answer-policy', { toastOnError: false });
  const saveCapabilities = useApiMutation<CapabilityUpdate, SettingsView>('PUT', '/settings/capabilities', { toastOnError: false });
  const [policyDraft, setPolicyDraft] = useState<{ patch: AnswerPolicyPatch; expectedVersion: number } | null>(null);
  const [capabilityDraft, setCapabilityDraft] = useState<CapabilityUpdate | null>(null);

  if (!view) return <Skeleton height={160} />;

  const storedPolicy = view.settings.answerPolicy ?? {};
  const changes = policyDraft?.patch;
  const capabilities = capabilityDraft?.capabilities ?? view.capabilities;
  const disabled = !canEdit || patch.running || saveCapabilities.running;

  function changePolicy<Key extends keyof AnswerPolicy>(key: Key, value: AnswerPolicy[Key]) {
    setPolicyDraft((previous) => ({
      expectedVersion: previous?.expectedVersion ?? view!.settings.version,
      patch: { ...previous?.patch, [key]: value },
    }));
  }

  function changeReveal(key: (typeof revealFields)[number], reveal: Reveal) {
    if (key === 'contact') changePolicy('contact', { reveal: reveal === 'never' ? 'never' : 'always' });
    else changePolicy(key, { reveal });
  }

  async function save(action: () => Promise<SettingsView>, reset: () => void) {
    try {
      await action();
      reset();
      toast.success(t('settings.saved'));
      reload();
    } catch (error) {
      const failure = apiFailure(error);
      if (failure?.error.code === 'VERSION_CONFLICT') {
        reset();
        toast.error(t('settings.conflict'));
        reload();
      } else {
        toast.error(failure ?? t('settings.error'));
      }
    }
  }

  function submitPolicy(reset: boolean) {
    if (!view) return;
    const input = reset
      ? { policy: null, expectedVersion: view.settings.version }
      : policyDraft && { policy: policyDraft.patch, expectedVersion: policyDraft.expectedVersion };
    if (input) void save(() => patch.run(input), () => setPolicyDraft(null));
  }

  return (
    <>
      <SectionCard title={t('policy.title')} actions={(
        <Stack direction="row" spacing={1}>
          <Button disabled={disabled || (!view.settings.answerPolicy && !policyDraft)} onClick={() => submitPolicy(true)}>
            {t('policy.reset')}
          </Button>
          <Button variant="contained" disabled={disabled || !policyDraft} onClick={() => submitPolicy(false)}>
            {t('common:actions.save')}
          </Button>
        </Stack>
      )}>
        <Stack spacing={2}>
          {revealFields.map((key) => {
            const value = changes?.[key]?.reveal ?? storedPolicy[key]?.reveal ?? 'always';
            const values = key === 'contact' ? (['always', 'never'] as const) : revealValues;
            const invalid = Boolean(issueAt(patch.error, 'policy.' + key));
            return (
              <TextField key={key} select label={t('policy.' + key)} value={value} data-testid={'policy-' + key}
                disabled={disabled} error={invalid} helperText={invalid ? t('settings.invalid') : undefined}
                onChange={(event) => changeReveal(key, event.target.value as Reveal)}>
                {values.map((option) => <MenuItem key={option} value={option}>{t('policy.reveal.' + option)}</MenuItem>)}
              </TextField>
            );
          })}
          <FormControlLabel label={t('policy.generalKnowledge')} control={(
            <Switch disabled={disabled} checked={(changes?.generalKnowledge ?? storedPolicy.generalKnowledge) === false}
              onChange={(_, checked) => changePolicy('generalKnowledge', !checked)} />
          )} />
          <FormControlLabel label={t('policy.booking')} control={(
            <Switch disabled={disabled} checked={(changes?.booking?.enabled ?? storedPolicy.booking?.enabled) !== false}
              onChange={(_, enabled) => changePolicy('booking', { enabled })} />
          )} />
        </Stack>
      </SectionCard>
      <SectionCard title={t('caps.title')} actions={(
        <Button variant="contained" disabled={disabled || !capabilityDraft} onClick={() => {
          if (capabilityDraft) void save(() => saveCapabilities.run(capabilityDraft), () => setCapabilityDraft(null));
        }}>{t('common:actions.save')}</Button>
      )}>
        <Stack spacing={0.5}>
          {capabilityFields.map((key) => (
            <FormControlLabel key={key} label={t('caps.' + key)} control={(
              <Switch checked={capabilities[key]} disabled={disabled} onChange={(_, checked) => setCapabilityDraft({
                capabilities: { ...capabilities, [key]: checked },
                expectedVersion: capabilityDraft?.expectedVersion ?? view.settings.version,
              })} />
            )} />
          ))}
        </Stack>
      </SectionCard>
      <SectionCard title={t('effective.title')}>
        <Stack spacing={1}>
          {Object.entries(view.effectiveRules).map(([key, value]) => {
            const field = key === 'orders' || key === 'handoff' || key === 'generalKnowledge' ? 'effective.' + key : 'policy.' + key;
            const state = typeof value === 'boolean' ? t(value ? 'effective.on' : 'effective.off') : t('policy.reveal.' + value);
            return (
              <Stack key={key} direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="body2">{t(field)}</Typography>
                <StatusChip label={state} status={value === true || value === 'always' ? 'active' : 'inactive'} />
              </Stack>
            );
          })}
          <Typography color="text.secondary" variant="body2">{t('effective.note')}</Typography>
        </Stack>
      </SectionCard>
    </>
  );
}
