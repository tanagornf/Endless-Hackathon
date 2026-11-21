import { useState } from 'react';
import type { FormEvent } from 'react';
import { Alert, Box, Button, Link, Stack, TextField } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import { LanguageSwitch, PageHeader, SectionCard, useApiMutation } from '../../core';

export default function ForgotPassword() {
  const { t } = useTranslation('auth');
  const [requested, setRequested] = useState(false);
  const request = useApiMutation<{ email: string }, { ok: true }>('POST', '/auth/password/forgot', {
    businessScoped: false, toastOnError: false,
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (request.running) return;
    const email = String(new FormData(event.currentTarget).get('email'));
    try {
      await request.run({ email });
      setRequested(true);
    } catch {
      // The mutation exposes localized inline feedback.
    }
  }

  const error = request.error?.error.code;
  return <Box sx={{ width: 'min(520px, 100%)', mx: 'auto', px: { xs: 1, sm: 3 }, pt: { xs: 3, sm: 6 } }}>
    <PageHeader title={t('forgot.title')} actions={<LanguageSwitch compact />} />
    <SectionCard>
      <Stack spacing={2}>
        <Alert severity="info" data-testid="forgot-sandbox">{t('forgot.sandbox')}</Alert>
        {requested
          ? <Alert severity="success" role="status" data-testid="forgot-done">{t('forgot.done')}</Alert>
          : <Stack component="form" spacing={2} noValidate onSubmit={(event) => void submit(event)}>
            {error && <Alert severity="error">{t(error === 'VALIDATION_ERROR' ? 'forgot.error.email'
              : error === 'RATE_LIMITED' ? 'recovery.limited' : 'recovery.unavailable')}</Alert>}
            <TextField label={t('login.email')} name="email" type="email" autoComplete="username" required
              slotProps={{ htmlInput: { maxLength: 200 } }} />
            <Button type="submit" variant="contained" loading={request.running} sx={{ minHeight: 44 }}>
              {t('forgot.submit')}
            </Button>
          </Stack>}
        <Link component={RouterLink} to="/login" sx={{ alignSelf: 'flex-start', py: 1 }}>{t('login.title')}</Link>
      </Stack>
    </SectionCard>
  </Box>;
}
