import { useEffect, useRef, useState } from 'react';
import { Alert, Box, LinearProgress, Link, Paper, Stack } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import { LanguageSwitch, PageHeader, useApiMutation, useSession } from '../../core';

export default function VerifyEmail() {
  const { t } = useTranslation('auth');
  const session = useSession();
  const [verified, setVerified] = useState(false);
  const [token] = useState(() => new URLSearchParams(window.location.search).get('token'));
  const started = useRef(false);
  const { run, error } = useApiMutation<{ token: string }, { ok: boolean; email: string }>('POST', '/auth/email/verify', {
    businessScoped: false, toastOnError: false,
  });

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    const url = new URL(window.location.href);
    url.searchParams.delete('token');
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    void run({ token }).then(() => setVerified(true), () => {});
  }, [run, token]);

  const failed = !token || Boolean(error);
  const busy = !verified && !failed;
  const key = verified ? 'verify.done' : failed ? 'verify.error' : 'verify.working';

  return <Box sx={{ width: 'min(520px, 100%)', mx: 'auto', px: { xs: 1, sm: 3 }, pt: { xs: 3, sm: 6 } }}>
    <PageHeader title={t('verify.title')} actions={<LanguageSwitch compact />} />
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
      <Stack spacing={2} aria-busy={busy}>
        {busy && <LinearProgress aria-label={t('verify.working')} />}
        <Alert severity={verified ? 'success' : failed ? 'error' : 'info'} role={failed ? 'alert' : 'status'}>{t(key)}</Alert>
        {!busy && <Link component={RouterLink} to={session.user ? '/' : '/login'} sx={{ alignSelf: 'flex-start', py: 1 }}>
          {t(session.user ? 'verify.continue' : 'login.title')}
        </Link>}
      </Stack>
    </Paper>
  </Box>;
}
