import { useState } from 'react';
import type { FormEvent } from 'react';
import { Alert, Box, Button, Link, Paper, Stack, TextField } from '@mui/material';
import type { ApiFailure } from '@nless/shared/core/types';
import type { AuthResult, SignupInput } from '@nless/shared/features/auth/types';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import { LanguageSwitch, PageHeader, useApiMutation, useSession } from '../../core';

function readInviteToken(): string | null {
  try {
    return sessionStorage.getItem('nless.invite');
  } catch {
    return null;
  }
}

function errorKey(error: ApiFailure['error']): string {
  switch (error.details?.reason) {
    case 'email_taken': return 'signup.error.email_taken';
    case 'email_mismatch': return 'signup.error.email_mismatch';
    case 'csrf': return 'login.error.csrf';
    case 'expired':
    case 'revoked':
    case 'accepted':
    case 'declined': return 'signup.error.inviteInvalid';
  }
  switch (error.code) {
    case 'VALIDATION_ERROR': {
      const issues = error.details?.issues;
      if (Array.isArray(issues)) {
        const issue = issues.find((value) => value?.path === 'password' || value?.path?.[0] === 'password');
        switch (issue?.code) {
          case 'too_short': return 'password.error.too_short';
          case 'too_big':
          case 'too_long': return 'password.error.too_long';
        }
      }
      return 'signup.error.validation';
    }
    case 'NOT_FOUND':
    case 'BUSINESS_INACTIVE': return 'signup.error.inviteInvalid';
    case 'RATE_LIMITED': return 'signup.error.limited';
    default: return 'signup.error.unavailable';
  }
}

export default function Signup() {
  const { i18n, t } = useTranslation('auth');
  const { refresh } = useSession();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const invite = search.get('invite') === '1';
  const [finishing, setFinishing] = useState(false);
  const token = invite ? readInviteToken() : null;
  const signup = useApiMutation<SignupInput, AuthResult>('POST', '/auth/signup', {
    businessScoped: false, toastOnError: false,
  });
  const missingInvite = invite && !token;
  const busy = signup.running || finishing;
  const loginPath = invite ? '/login?next=%2Finvitations%2Faccept' : '/login';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || missingInvite) return;
    setFinishing(true);
    const fields = new FormData(event.currentTarget);
    try {
      await signup.run({
        email: String(fields.get('email')),
        password: String(fields.get('password')),
        displayName: String(fields.get('displayName')),
        locale: i18n.resolvedLanguage === 'en' ? 'en' : 'th',
        ...(token ? { inviteToken: token } : { businessName: String(fields.get('businessName')) }),
      });
      if (invite) {
        try { sessionStorage.removeItem('nless.invite'); } catch { /* Browser storage is optional. */ }
      }
      await refresh();
      navigate('/', { replace: true });
    } catch {
      // The mutation exposes the failure for localized inline feedback.
    } finally {
      setFinishing(false);
    }
  }

  return <Box sx={{ width: 'min(520px, 100%)', mx: 'auto', px: { xs: 1, sm: 3 }, pt: { xs: 3, sm: 6 } }}>
    <PageHeader title={t('signup.title')} actions={<LanguageSwitch compact />} />
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
      <Stack component="form" spacing={2} noValidate aria-busy={busy} onSubmit={(event) => void submit(event)}>
        {invite && <Alert severity={missingInvite ? 'error' : 'info'}>
          {t(missingInvite ? 'signup.error.inviteMissing' : 'signup.invite')}
        </Alert>}
        {signup.error && <Alert severity="error" role="alert" data-testid="signup-error">
          {t(errorKey(signup.error.error))}
        </Alert>}
        {!missingInvite && <>
          <TextField id="auth-signup-name" name="displayName" label={t('signup.name')}
            autoComplete="name" required slotProps={{ htmlInput: { maxLength: 80 } }} />
          {!invite && <TextField id="auth-signup-business" name="businessName" label={t('signup.business')}
            autoComplete="organization" required slotProps={{ htmlInput: { minLength: 2, maxLength: 80 } }} />}
          <TextField id="auth-signup-email" name="email" label={t('signup.email')} type="email"
            autoComplete="username" required slotProps={{ htmlInput: { maxLength: 200 } }} />
          <TextField id="auth-signup-password" name="password" label={t('signup.password')} type="password"
            autoComplete="new-password" required slotProps={{ htmlInput: { minLength: 8, maxLength: 128 } }} />
          <Button type="submit" variant="contained" loading={busy} sx={{ minHeight: 44 }}>{t('signup.submit')}</Button>
        </>}
        <Link component={RouterLink} to={loginPath} sx={{ alignSelf: 'flex-start', py: 1 }}>{t('signup.haveAccount')}</Link>
      </Stack>
    </Paper>
  </Box>;
}
