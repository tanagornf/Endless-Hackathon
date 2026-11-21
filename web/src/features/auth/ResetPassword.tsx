import { useLayoutEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Alert, Box, Button, Link, Stack, TextField } from '@mui/material';
import type { ApiFailure } from '@nless/shared/core/types';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import { LanguageSwitch, PageHeader, SectionCard, useApiMutation } from '../../core';
import { recoveryPasswordError } from './recoveryErrors';

function errorKey(error: ApiFailure['error']): string {
  if (error.code === 'NOT_FOUND') return 'reset.error.notFound';
  if (error.code === 'RATE_LIMITED') return 'recovery.limited';
  if (error.details?.reason === 'expired') return 'reset.error.expired';
  if (error.details?.reason === 'used') return 'reset.error.used';
  return recoveryPasswordError(error) ?? 'recovery.unavailable';
}

export default function ResetPassword() {
  const { t } = useTranslation('auth');
  const [token] = useState(() => new URLSearchParams(window.location.search).get('token'));
  const [done, setDone] = useState(false);
  const [mismatch, setMismatch] = useState(false);
  const reset = useApiMutation<{ token: string; newPassword: string }, { ok: true }>('POST', '/auth/password/reset', {
    businessScoped: false, toastOnError: false,
  });
  const resetError = reset.error?.error;
  const tokenError = !token || resetError?.code === 'NOT_FOUND'
    || resetError?.details?.reason === 'expired' || resetError?.details?.reason === 'used';

  useLayoutEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('token')) return;
    url.searchParams.delete('token');
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || reset.running) return;
    const values = new FormData(event.currentTarget);
    const newPassword = String(values.get('newPassword'));
    const differs = newPassword !== values.get('confirmPassword');
    setMismatch(differs);
    if (differs) return;
    try {
      await reset.run({ token, newPassword });
      setDone(true);
    } catch {
      // The mutation exposes localized inline feedback.
    }
  }

  return <Box sx={{ width: 'min(520px, 100%)', mx: 'auto', px: { xs: 1, sm: 3 }, pt: { xs: 3, sm: 6 } }}>
    <PageHeader title={t('reset.title')} actions={<LanguageSwitch compact />} />
    <SectionCard>
      <Stack spacing={2}>
        {done && <Alert severity="success" role="status">{t('reset.done')}</Alert>}
        {!done && (mismatch || resetError || !token) && <Alert severity="error" data-testid="reset-error">
          {t(mismatch ? 'reset.error.mismatch' : resetError ? errorKey(resetError) : 'reset.error.notFound')}
        </Alert>}
        {!done && !tokenError && <Stack component="form" spacing={2} noValidate onSubmit={(event) => void submit(event)}>
          <TextField name="newPassword" type="password" label={t('reset.new')} autoComplete="new-password" required />
          <TextField name="confirmPassword" type="password" label={t('reset.confirm')} autoComplete="new-password" required />
          <Button type="submit" variant="contained" loading={reset.running} sx={{ minHeight: 44 }}>{t('reset.submit')}</Button>
        </Stack>}
        <Link component={RouterLink} to={tokenError ? '/forgot-password' : '/login'} sx={{ alignSelf: 'flex-start', py: 1 }}>
          {t(tokenError ? 'reset.requestLink' : 'login.title')}
        </Link>
      </Stack>
    </SectionCard>
  </Box>;
}
