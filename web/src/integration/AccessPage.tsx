import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, LinearProgress, Paper, Stack, TextField, Typography } from '@mui/material';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, LanguageSwitch, useApiQuery, useSession } from '../core';
import { Brand } from '../core/layout/Brand';
import { getFailure } from '../core/ui/toast';
import { ServiceAlert } from './ResourcePanel';

export function safeNext(value: string | null) {
  if (!value?.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/';
  const url = new URL(value, window.location.origin);
  return url.origin === window.location.origin ? url.pathname + url.search + url.hash : '/';
}
export default function AccessPage({ mode }: { mode: string }) {
  const { t, i18n } = useTranslation('integration');
  const session = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useState(() => new URLSearchParams(location.search));
  const token = params.get('token') ?? '';
  const invite = params.get('invite') ?? params.get('inviteToken');
  const config = useApiQuery<{passwordMinLength: number}>('/auth/config', { businessScoped: false });
  const preview = useApiQuery<{businessName: string; emailMasked: string}>(mode === 'invite' && token ? '/invitations/preview?token=' + encodeURIComponent(token) : null, { businessScoped: false });
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [busy,setBusy] = useState(false);
  const sending = useRef(false);
  const isInvite = mode === 'invite';
  const tokenMode = ['reset','verify','invite'].includes(mode);
  useEffect(() => {
    if (token && (mode === 'reset' || mode === 'verify')) navigate(location.pathname, { replace: true });
  }, [token, mode, location.pathname, navigate]);
  const suffix = invite ? '?invite=' + encodeURIComponent(invite) : '';
  return <Box sx={{ mx: 'auto', width: 'min(100%, 480px)', mt: { xs: 2, md: '9vh' } }}>
    <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 2 }}><Brand /><LanguageSwitch compact /></Stack>
    <Paper variant="outlined" sx={{ p: { xs: 2.5, sm: 4 }, borderTop: '4px solid #0F766E' }}>
      <Stack spacing={2}>
        <Typography variant="h5" component="h1">{t('page.' + mode + '.title')}</Typography>
        {mode === 'login' && <Typography color="text.secondary">{t('signInIntro')}</Typography>}
        {!isInvite && config.loading && <LinearProgress />}
        {!isInvite && config.error && <ServiceAlert code={config.error.error.code} retry={config.reload} />}
        {isInvite && preview.error && <ServiceAlert code={preview.error.error.code} retry={preview.reload} />}
        {preview.data && <Typography>{preview.data.businessName} · {preview.data.emailMasked}</Typography>}
        {tokenMode && !token && <Alert severity="warning">{t('invalidLink')}</Alert>}
        {error && <Alert severity="error">{t('common:errors.' + error, { defaultValue: t('common:errors.generic') })}</Alert>}
        {notice ? <Alert severity="success">{t(notice)}</Alert> : <Stack component="form" spacing={2} onSubmit={async e => {
          e.preventDefault(); if (sending.current) return;
          const form = new FormData(e.currentTarget);
          const value = (k: string) => String(form.get(k) ?? '');
          const email = value('email').trim();
          const password = value('password');
          sending.current = true; setBusy(true); setError('');
          try {
            if (isInvite) { await api.post('/invitations/accept', {token}); await session.refresh(); navigate('/', {replace:true}); }
            else if (mode === 'login' || mode === 'signup') {
              const body = mode === 'login' ? {email,password} : {email,password,displayName:value('name'),locale:i18n.resolvedLanguage ?? 'th',
                ...(invite ? {inviteToken:invite} : {businessName:value('shop')})};
              await api.post('/auth/' + mode,body); await session.refresh(); navigate(safeNext(params.get('next')), {replace:true});
            } else if (mode === 'forgot') { await api.post('/auth/password/forgot',{email}); setNotice('checkMail'); }
            else if (mode === 'reset') { await api.post('/auth/password/reset',{token,newPassword:password}); setNotice('passwordSaved'); }
            else { await api.post('/auth/email/verify',{token}); setNotice('verified'); }
          } catch (cause) { setError(getFailure(cause)?.error.code ?? 'INTERNAL'); }
          finally { sending.current = false; setBusy(false); }
        }}>
          {mode === 'signup' && <><TextField required label={t('displayName')} name="name" autoComplete="name" />{!invite && <TextField required name="shop" label={t('shopName')} />}</>}
          {['signup','login','forgot'].includes(mode) && <TextField required name="email" type="email" label={t('email')} autoComplete="email" />}
          {['signup','login','reset'].includes(mode) && <TextField required name="password" type="password" label={t('password')}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'} slotProps={{ htmlInput: {minLength: mode === 'login' ? 1 : config.data?.passwordMinLength ?? 10,maxLength:128} }} />}
          {isInvite && !session.user ? <Stack spacing={1}><Button component={Link} to={'/login?next=' + encodeURIComponent(location.pathname + location.search)}>{t('page.login.title')}</Button>
              {token && <Button variant="outlined" component={Link} to={'/signup?invite=' + encodeURIComponent(token)}>{t('page.signup.title')}</Button>}
            </Stack> :
            <Button type="submit" variant="contained" disabled={busy || (tokenMode && !token) || (isInvite ? !preview.data : !config.data)}>{t(isInvite ? 'confirm' : 'page.' + mode + '.title')}</Button>}
        </Stack>}
        <Stack direction="row" sx={{ flexWrap: 'wrap', justifyContent: 'space-between' }}>
          {mode !== 'login' && <Button component={Link} to={'/login' + suffix}>{t('page.login.title')}</Button>}
          {mode === 'login' && <><Button component={Link} to={'/signup' + suffix}>{t('page.signup.title')}</Button><Button component={Link} to="/forgot-password">{t('page.forgot.title')}</Button></>}
        </Stack>
        {mode === 'login' && import.meta.env.VITE_DEV_LOGIN !== '0' && <Button component={Link} to="/dev-login" variant="outlined">{t('devLogin')}</Button>}
      </Stack>
    </Paper>
  </Box>;
}
