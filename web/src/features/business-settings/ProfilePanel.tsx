import { useState } from 'react';
import { Autocomplete, Button, MenuItem, Skeleton, Stack, TextField, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { BusinessProfile, BusinessSettings, SettingsView } from '@nless/shared/features/business-settings/types';
import {
  ConfirmDialog, EmptyState, SectionCard, useApiMutation, useApiQuery, useCan, useRealtime, useSession, useToast,
} from '../../core';
import { apiFailure, issueAt } from './settings-errors';

type ProfileUpdate = BusinessProfile & { expectedVersion: number };
type LocaleUpdate = Pick<BusinessSettings, 'language' | 'timezone'> & { expectedVersion: number };
const zones = ['Asia/Bangkok', 'Asia/Singapore', 'Asia/Tokyo', 'UTC'];
const fields = [
  ['name', 'name', 'text'],
  ['description', 'description', 'text'],
  ['contactPhone', 'phone', 'tel'],
  ['contactEmail', 'email', 'email'],
  ['address', 'address', 'text'],
] as const;

export default function ProfilePanel() {
  const { t } = useTranslation('business-settings');
  const { refresh } = useSession();
  const toast = useToast();
  const canEdit = useCan('business.update');
  const settings = useApiQuery<SettingsView>('/settings');
  const updateProfile = useApiMutation<ProfileUpdate, SettingsView>('PUT', '/settings/profile', { toastOnError: false });
  const updateLocale = useApiMutation<LocaleUpdate, SettingsView>('PUT', '/settings/locale', { toastOnError: false });
  const [profileDraft, setProfileDraft] = useState<ProfileUpdate | null>(null);
  const [localeDraft, setLocaleDraft] = useState<LocaleUpdate | null>(null);
  const [confirmZone, setConfirmZone] = useState(false);

  useRealtime('custom', (event) => {
    if (event.featureId === 'F04' && event.name === 'business-settings.changed') settings.reload();
  });

  const view = settings.data;
  const profile = profileDraft ?? view?.profile;
  const locale = localeDraft ?? view?.settings;

  function showError(error: unknown, reset: () => void) {
    const failure = apiFailure(error);
    if (failure?.error.code === 'VERSION_CONFLICT') {
      reset();
      toast.error(t('settings.conflict'));
      settings.reload();
    } else {
      toast.error(failure ?? t('settings.error'));
    }
  }

  async function saveProfile() {
    if (!profileDraft) return;
    try {
      await updateProfile.run(profileDraft);
      setProfileDraft(null);
      toast.success(t('settings.saved'));
      settings.reload();
      await refresh();
    } catch (error) {
      showError(error, () => setProfileDraft(null));
    }
  }

  async function saveLocale() {
    if (!localeDraft) return;
    try {
      await updateLocale.run(localeDraft);
      setLocaleDraft(null);
      toast.success(t('settings.saved'));
      settings.reload();
      await refresh();
      setConfirmZone(false);
    } catch (error) {
      showError(error, () => setLocaleDraft(null));
      if (apiFailure(error)?.error.code === 'VERSION_CONFLICT') setConfirmZone(false);
      throw error;
    }
  }

  function editTimezone(timezone: string) {
    if (!view) return;
    setLocaleDraft((draft) => ({
      ...(draft ?? { language: view.settings.language, timezone: view.settings.timezone, expectedVersion: view.settings.version }),
      timezone,
    }));
  }

  if (settings.error) {
    return <EmptyState title={t('settings.error')} action={<Button onClick={settings.reload}>{t('settings.retry')}</Button>} />;
  }
  if (!view || !profile || !locale) return <Skeleton height={180} />;

  const profileDisabled = !canEdit || updateProfile.running || updateLocale.running;
  const timezoneIssue = issueAt(updateLocale.error, 'timezone');

  return (
    <Stack spacing={2}>
      {!canEdit && <Typography variant="body2" color="text.secondary">{t('settings.readOnly')}</Typography>}
      <SectionCard title={t('tabs.profile')} actions={(
        <Button variant="contained" disabled={profileDisabled || !profileDraft} onClick={() => void saveProfile()}>
          {t('common:actions.save')}
        </Button>
      )}>
        <Stack spacing={2}>
          {fields.map(([key, label, type]) => {
            const invalid = Boolean(issueAt(updateProfile.error, key));
            return (
              <TextField
                key={key} label={t('profile.' + label)} type={type} value={profile[key] ?? ''}
                multiline={key === 'description' || key === 'address'} disabled={profileDisabled}
                error={invalid} helperText={invalid ? t('settings.invalid') : undefined}
                onChange={(event) => setProfileDraft({
                  ...(profileDraft ?? { ...view.profile, expectedVersion: view.settings.version }), [key]: event.target.value,
                })}
              />
            );
          })}
        </Stack>
      </SectionCard>
      <SectionCard title={t('locale.title')} actions={(
        <Button variant="contained" disabled={profileDisabled || !localeDraft} onClick={() => {
          if (localeDraft && localeDraft.timezone !== view.settings.timezone) setConfirmZone(true);
          else void saveLocale().catch(() => {});
        }}>{t('common:actions.save')}</Button>
      )}>
        <Stack spacing={2}>
          <TextField select value={locale.language} label={t('locale.language')} helperText={t('locale.languageHelp')}
            disabled={profileDisabled} onChange={(event) => setLocaleDraft({
              ...(localeDraft ?? { language: view.settings.language, timezone: view.settings.timezone, expectedVersion: view.settings.version }),
              language: event.target.value === 'en' ? 'en' : 'th',
            })}>
            <MenuItem value="th">{t('locale.th')}</MenuItem>
            <MenuItem value="en">{t('locale.en')}</MenuItem>
          </TextField>
          <Autocomplete freeSolo options={zones} value={locale.timezone} inputValue={locale.timezone} disabled={profileDisabled}
            onChange={(_, timezone) => editTimezone(timezone ?? '')}
            onInputChange={(_, timezone, reason) => {
              if (reason === 'input' || reason === 'clear') editTimezone(timezone);
            }}
            renderInput={(params) => <TextField {...params} label={t('locale.timezone')} error={Boolean(timezoneIssue)}
              helperText={timezoneIssue ? t('locale.invalidTimezone') : undefined} />}
          />
        </Stack>
      </SectionCard>
      <ConfirmDialog open={confirmZone} title={t('locale.timezone')} message={t('locale.timezoneWarn')}
        onClose={() => setConfirmZone(false)} onConfirm={saveLocale} />
    </Stack>
  );
}
