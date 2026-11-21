import { useEffect, useState } from 'react';
import { Alert, Box, Button, LinearProgress, List, ListItem, Stack, TextField } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiRequest } from '../api';
import { PageHeader } from '../layout/PageHeader';
import { useSession } from '../session';
import { LanguageSwitch } from '../ui/LanguageSwitch';
import { SectionCard } from '../ui/SectionCard';

type Status = { enabled: boolean; tokenRequired: boolean };
type User = { email: string; displayName: string };
export default function DevLogin() {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const { refresh } = useSession();
  const [status, setStatus] = useState<Status | null | undefined>();
  const [token, setToken] = useState(() => { try { return sessionStorage.getItem('nless.devToken') ?? ''; } catch { return ''; } });
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void apiRequest<Status>('/api/dev/status').then(setStatus, () => setStatus(null)); }, []);
  async function loadUsers() {
    setError(false);
    setBusy(true);
    try {
      const result = await apiRequest<User[]>('/api/dev/users', { headers: { 'X-Dev-Login-Token': token } });
      setUsers(result);
      if (status?.tokenRequired) try { sessionStorage.setItem('nless.devToken', token); } catch { /* optional */ }
    } catch { setError(true); }
    finally { setBusy(false); }
  }
  useEffect(() => { if (status && !status.tokenRequired) void loadUsers(); }, [status]);
  async function signIn(email: string) {
    setBusy(true);
    setError(false);
    try {
      await apiRequest('/api/dev/login', { method: 'POST', body: JSON.stringify({ email }), headers: { 'X-Dev-Login-Token': token } });
      await refresh();
      navigate('/', { replace: true });
    } catch { setError(true); }
    finally { setBusy(false); }
  }
  return <Box component="main" sx={{ width: 'min(560px, 100%)', mx: 'auto', p: 3 }}>
    <PageHeader title={t('dev.title')} actions={<LanguageSwitch compact />} />
    <SectionCard title={t(status === null ? 'pages.outOfService' : 'dev.choose')}>
      {(busy || status === undefined) && <LinearProgress />}
      {error && <Alert severity="error">{t('errors.generic')}</Alert>}
      {status?.tokenRequired && <Stack component="form" direction={{ xs: 'column', sm: 'row' }} spacing={1} onSubmit={(event) => { event.preventDefault(); void loadUsers(); }}>
        <TextField type="password" label={t('dev.token')} value={token} onChange={(event) => { setToken(event.target.value); setUsers([]); }} />
        <Button disabled={busy} type="submit" variant="contained">{t('actions.open')}</Button>
      </Stack>}
      <List>{users.map((user) => <ListItem key={user.email} disableGutters>
        <Button fullWidth variant="outlined" disabled={busy} onClick={() => void signIn(user.email)}>{user.displayName} · {user.email}</Button>
      </ListItem>)}</List>
    </SectionCard>
  </Box>;
}
