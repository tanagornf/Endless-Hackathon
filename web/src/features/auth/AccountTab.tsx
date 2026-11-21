import { useState } from 'react';
import type { FormEvent } from 'react';
import { Alert, Button, FormControlLabel, LinearProgress, MenuItem, Stack, Switch, TextField, Typography } from '@mui/material';
import type { WebApiError } from '@nless/shared/core/loader';
import type { AuthStatus, MailboxItem, MailboxResult } from '@nless/shared/features/auth/types';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  apiRequest, ConfirmDialog, DataTable, EmptyState, formatDateTime, SectionCard, StatusChip, useApiMutation, useApiQuery, useSession,
} from '../../core';
import { recoveryPasswordError } from './recoveryErrors';

const globalMutation = { businessScoped: false, toastOnError: false };

function ProfileCard({ data }: { data: AuthStatus }) {
  const { t, i18n } = useTranslation('auth');
  const session = useSession();
  const [saved, setSaved] = useState(false);
  const patch = useApiMutation<Pick<AuthStatus, 'displayName' | 'locale'>, AuthStatus>('PATCH', '/auth/profile', globalMutation);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (patch.running) return;
    setSaved(false);
    const form = new FormData(event.currentTarget);
    try {
      const result = await patch.run({ displayName: String(form.get('displayName')), locale: form.get('locale') === 'en' ? 'en' : 'th' });
      await i18n.changeLanguage(result.locale);
      await session.refresh();
      setSaved(true);
    } catch {
      // The mutation exposes localized inline feedback.
    }
  }

  return <SectionCard title={t('account.profile')}>
    <Stack component="form" spacing={2} noValidate onSubmit={(event) => void submit(event)}>
      {patch.error && <Alert severity="error">{t('account.error.profile')}</Alert>}
      {saved && !patch.error && <Alert severity="success" role="status">{t('account.saved')}</Alert>}
      <Typography data-user-content color="text.secondary">{data.email}</Typography>
      <TextField name="displayName" label={t('account.displayName')} defaultValue={data.displayName} required
        autoComplete="name" slotProps={{ htmlInput: { maxLength: 80 } }} />
      <TextField select name="locale" label={t('account.locale')} defaultValue={data.locale}>
        <MenuItem value="th">{t('account.language.th')}</MenuItem>
        <MenuItem value="en">{t('account.language.en')}</MenuItem>
      </TextField>
      <Button type="submit" variant="contained" loading={patch.running} sx={{ alignSelf: 'flex-start', minHeight: 44 }}>
        {t('account.save')}
      </Button>
    </Stack>
  </SectionCard>;
}

function PasswordCard() {
  const { t } = useTranslation('auth');
  const session = useSession();
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string>();
  const [changed, setChanged] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    setChanged(false);
    setErrorKey(undefined);
    setBusy(true);
    try {
      // A bad current password is a form error. Preserve the current page on that 401.
      const base = import.meta.env.VITE_API_BASE || '/api/v1';
      await apiRequest(base + '/auth/password/change', {
        method: 'POST', redirectOnUnauthorized: false,
        body: JSON.stringify({ currentPassword: values.get('currentPassword'), newPassword: values.get('newPassword') }),
      });
      form.reset();
      setChanged(true);
    } catch (cause) {
      const error = (cause as WebApiError | undefined)?.failure?.error;
      if (error?.details?.reason === 'wrong_current_password') setErrorKey('account.error.wrong_current_password');
      else if (error?.code === 'AUTH_REQUIRED') await session.refresh();
      else setErrorKey(recoveryPasswordError(error) ?? (error?.code === 'RATE_LIMITED' ? 'recovery.limited' : 'recovery.unavailable'));
    } finally {
      setBusy(false);
    }
  }

  return <SectionCard title={t('account.changePassword')}>
    <Stack component="form" spacing={2} noValidate onSubmit={(event) => void submit(event)}>
      {errorKey && <Alert severity="error">{t(errorKey)}</Alert>}
      {changed && <Alert severity="success" role="status">{t('account.passwordChanged')}</Alert>}
      <TextField name="currentPassword" label={t('account.currentPassword')} type="password" autoComplete="current-password"
        required slotProps={{ htmlInput: { maxLength: 128 } }} />
      <TextField name="newPassword" label={t('account.newPassword')} type="password" autoComplete="new-password"
        required slotProps={{ htmlInput: { maxLength: 128 } }} />
      <Button type="submit" variant="contained" loading={busy} sx={{ alignSelf: 'flex-start', minHeight: 44 }}>
        {t('account.changePassword')}
      </Button>
    </Stack>
  </SectionCard>;
}

export default function AccountTab() {
  const { t } = useTranslation('auth');
  const navigate = useNavigate();
  const session = useSession();
  const status = useApiQuery<AuthStatus>('/auth/status', { businessScoped: false });
  const [all, setAll] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const admin = Boolean(status.data?.isPlatformAdmin);
  const mailbox = useApiQuery<MailboxResult>(status.data ? '/auth/mailbox?scope=' + (admin && all ? 'all' : 'mine') : null, { businessScoped: false });
  const logoutAll = useApiMutation<undefined, { ok: true; revoked: number }>('POST', '/auth/logout-all', globalMutation);

  async function signOut() {
    await logoutAll.run(undefined);
    await session.refresh();
    navigate('/login', { replace: true });
  }

  const data = status.data;
  if (status.error) return <Alert severity="error" action={<Button onClick={status.reload}>{t('common.retry')}</Button>}>
    {t('account.error.load')}
  </Alert>;
  if (!data) return <LinearProgress aria-label={t('account.loading')} />;

  return <Stack spacing={2.5} aria-label={t('account.tab')}>
    <ProfileCard data={data} />
    <PasswordCard />
    <SectionCard title={t('account.logoutAll')}>
      {logoutAll.error && <Alert severity="error" sx={{ mb: 2 }}>{t('recovery.unavailable')}</Alert>}
      <Button color="error" variant="outlined" onClick={() => setConfirmLogout(true)} sx={{ minHeight: 44 }}>
        {t('account.logoutAll')}
      </Button>
      <ConfirmDialog open={confirmLogout} title={t('account.logoutAll')} message={t('account.logoutAllMessage')}
        confirmLabel={t('account.logoutAll')} danger onConfirm={signOut} onClose={() => setConfirmLogout(false)} />
    </SectionCard>
    <SectionCard title={t('mailbox.title')} actions={<StatusChip kind="feature" status="S" />}>
      <Stack spacing={2}>
        <Alert severity="info">{t('mailbox.note')}</Alert>
        {admin && <FormControlLabel control={<Switch checked={all} onChange={(_, checked) => setAll(checked)} />} label={t('mailbox.all')} />}
        {mailbox.error
          ? <Alert severity="error" action={<Button onClick={mailbox.reload}>{t('common.retry')}</Button>}>{t('mailbox.error')}</Alert>
          : <DataTable<MailboxItem> rows={mailbox.data?.items ?? []} rowKey={(mail) => mail.id}
            loading={mailbox.loading || !mailbox.data}
            empty={<EmptyState title={t(admin && all ? 'mailbox.emptyAll' : 'mailbox.empty')} />}
            columns={[
              { key: 'to', header: t('mailbox.to'), render: (mail) => <span data-user-content>{mail.to}</span> },
              { key: 'subject', header: t('mailbox.subject'), render: (mail) => <Stack data-user-content>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{mail.subject}</Typography>
                <Typography variant="body2" sx={{ whiteSpace: 'normal', minWidth: 220 }}>{mail.bodyText}</Typography>
              </Stack> },
              { key: 'createdAt', header: t('mailbox.created'), render: (mail) => formatDateTime(mail.createdAt) },
              { key: 'action', header: t('mailbox.action'), render: (mail) =>
                <Button component="a" href={mail.actionUrl} rel="noreferrer" sx={{ minHeight: 44 }}>{t('mailbox.open')}</Button> },
            ]} />}
      </Stack>
    </SectionCard>
  </Stack>;
}
