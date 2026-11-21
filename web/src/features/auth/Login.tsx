import { useState } from 'react';
import type { FormEvent } from 'react';
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlined from '@mui/icons-material/VisibilityOffOutlined';
import { Alert, Box, Button, IconButton, InputAdornment, Link, Paper, Stack, TextField } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import type { AuthResult, LoginInput } from '@nless/shared/features/auth/types';
import { LanguageSwitch, PageHeader, useApiMutation, useSession } from '../../core';
import { safeNext } from './safeNext';

export default function Login() {
  const { t } = useTranslation('auth');
  const { refresh } = useSession();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const next = safeNext(search.get('next'));
  const signupPath = next === '/invitations/accept' ? '/signup?invite=1' : '/signup';
  const [show, setShow] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const login = useApiMutation<LoginInput, AuthResult>('POST', '/auth/login', {
    businessScoped: false, toastOnError: false,
  });
  const busy = login.running || finishing;
  const error = login.error?.error;
  let message: string | undefined;
  if (error) {
    switch (error.code) {
      case 'AUTH_REQUIRED':
      case 'VALIDATION_ERROR': message = t('login.error.invalid'); break;
      case 'ACCOUNT_DISABLED': message = t('login.error.disabled'); break;
      case 'PERMISSION_DENIED': message = t('login.error.csrf'); break;
      case 'RATE_LIMITED': {
        const seconds = error.details?.retryAfterSeconds;
        const minutes = typeof seconds === 'number' ? Math.max(1, Math.ceil(seconds / 60)) : 1;
        message = t('login.error.locked', { minutes });
        break;
      }
      default: message = t('login.error.unavailable');
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const values = new FormData(event.currentTarget);
    setFinishing(true);
    try {
      await login.run({ email: String(values.get('email')), password: String(values.get('password')) });
      await refresh();
      navigate(next, { replace: true });
    } catch {
      // The mutation exposes the failure for the inline alert.
    } finally {
      setFinishing(false);
    }
  }

  return <Box sx={{ width: 'min(480px, 100%)', mx: 'auto', px: { xs: 2, sm: 3 }, pt: { xs: 4, sm: 8 } }}>
    <PageHeader title={t('login.title')} actions={<LanguageSwitch compact />} />
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
      <Stack component="form" spacing={2.5} onSubmit={(event) => void submit(event)} aria-busy={busy}>
        {message && <Alert severity="error" role="alert" data-testid="login-error">{message}</Alert>}
        <TextField id="auth-login-email" name="email" type="email" autoComplete="username" required
          label={t('login.email')} slotProps={{ htmlInput: { 'data-testid': 'login-email', maxLength: 200 } }} />
        <TextField id="auth-login-password" name="password" type={show ? 'text' : 'password'}
          autoComplete="current-password" required label={t('login.password')} slotProps={{
            htmlInput: { 'data-testid': 'login-password' },
            input: { endAdornment: <InputAdornment position="end">
              <IconButton type="button" edge="end" aria-label={t('login.toggle')} aria-pressed={show}
                onMouseDown={(event) => event.preventDefault()} onClick={() => setShow((value) => !value)}>
                {show ? <VisibilityOffOutlined /> : <VisibilityOutlined />}
              </IconButton>
            </InputAdornment> },
          }} />
        <Button type="submit" variant="contained" data-testid="login-submit" loading={busy}>{t('login.submit')}</Button>
        <Link component={RouterLink} to="/forgot-password" sx={{ alignSelf: 'flex-start', py: 1 }}>{t('login.forgot')}</Link>
        <Link component={RouterLink} to={signupPath} sx={{ alignSelf: 'flex-start', py: 1 }}>{t('login.noAccount')}</Link>
      </Stack>
    </Paper>
  </Box>;
}
