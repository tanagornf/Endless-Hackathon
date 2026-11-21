import { Alert, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import type { ApiFailure } from '@nless/shared/core/types';
import type { InvitationPreview } from '@nless/shared/features/tenancy/types';
import {
  EmptyState, LanguageSwitch, PageHeader, SectionCard, formatDateTime, useApiMutation, useApiQuery, useSession,
} from '../../core';

const inviteStorage = 'nless.invite';

function forgetToken() {
  try { sessionStorage.removeItem(inviteStorage); } catch { /* Browser storage is optional. */ }
}

function errorKey(failure: ApiFailure): string {
  const reason = failure.error.details?.reason;
  if (typeof reason === 'string') return 'accept.error.' + reason;
  if (failure.error.code === 'NOT_FOUND') return 'accept.error.notFound';
  if (failure.error.code === 'BUSINESS_INACTIVE') return 'accept.error.business_inactive';
  if (failure.error.code === 'RATE_LIMITED') return 'accept.error.rateLimited';
  if (failure.error.code === 'ACCOUNT_DISABLED') return 'accept.error.accountDisabled';
  return 'accept.error.request';
}

export default function AcceptInvitationPage() {
  const { t } = useTranslation('tenancy');
  const navigate = useNavigate();
  const { status, refresh, businesses, selectBusiness } = useSession();
  const initialized = useRef(false);
  const changing = useRef(false);
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [timedOut, setTimedOut] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [declined, setDeclined] = useState(false);
  const [acceptedBusiness, setAcceptedBusiness] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [actionError, setActionError] = useState<ApiFailure | null>(null);
  const preview = useApiQuery<InvitationPreview>(
    token ? '/invitations/preview?' + new URLSearchParams({ token }) : null,
    { businessScoped: false },
  );
  const publicOptions = { businessScoped: false, toastOnError: false };
  const accept = useApiMutation<{ token: string }, { businessId: string }>('POST', '/invitations/accept', publicOptions);
  const decline = useApiMutation<{ token: string }, { ok: true }>('POST', '/invitations/decline', publicOptions);

  useLayoutEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const url = new URL(window.location.href);
    const incoming = url.searchParams.get('token');
    if (incoming !== null) {
      try { sessionStorage.setItem(inviteStorage, incoming); } catch { /* Browser storage is optional. */ }
      url.searchParams.delete('token');
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
      setToken(incoming);
      return;
    }
    try { setToken(sessionStorage.getItem(inviteStorage)); } catch { setToken(null); }
  }, []);

  useEffect(() => {
    if (!token || preview.error || (preview.data && status !== 'loading')) return;
    const timeout = window.setTimeout(() => setTimedOut(true), 10_000);
    return () => window.clearTimeout(timeout);
  }, [token, preview.data, preview.error, status, attempt]);

  useEffect(() => {
    if (acceptedBusiness && !refreshing && businesses.some((entry) => entry.business.id === acceptedBusiness)) {
      selectBusiness(acceptedBusiness);
      navigate('/', { replace: true });
    }
  }, [acceptedBusiness, businesses, refreshing, selectBusiness, navigate]);

  async function openBusiness() {
    setRefreshing(true);
    try { await refresh(); } finally { setRefreshing(false); }
  }

  async function respond(action: 'accept' | 'decline') {
    if (!token || changing.current) return;
    changing.current = true;
    setActionError(null);
    try {
      if (action === 'accept') {
        const result = await accept.run({ token });
        forgetToken();
        setAcceptedBusiness(result.businessId);
        await openBusiness();
      } else {
        await decline.run({ token });
        forgetToken();
        setDeclined(true);
      }
    } catch (error) {
      setActionError((error as { failure?: ApiFailure })?.failure ?? null);
    } finally {
      changing.current = false;
    }
  }

  const waiting = accept.running || decline.running;
  const retry = <Button onClick={() => {
    setTimedOut(false);
    setAttempt((value) => value + 1);
    preview.reload();
    if (status === 'loading') void refresh();
  }}>{t('common:actions.retry')}</Button>;

  const stopped = actionError && [
    'accept.error.expired', 'accept.error.revoked', 'accept.error.accepted', 'accept.error.declined',
    'accept.error.business_inactive', 'accept.error.notFound',
  ].includes(errorKey(actionError));

  function content() {
    if (declined) return <Alert severity="success">{t('accept.declined')}</Alert>;
    if (acceptedBusiness) return (
      <Stack spacing={2}>
        <Alert severity="success">{t('accept.done')}</Alert>
        {!refreshing && <Button onClick={() => void openBusiness()}>{t('accept.openBusiness')}</Button>}
      </Stack>
    );
    if (token === null || token === '') return <EmptyState title={t('accept.error.notFound')} />;
    if (stopped && actionError) return <EmptyState title={t(errorKey(actionError))} />;
    if (timedOut) return <EmptyState title={t('accept.error.timeout')} action={retry} />;
    if (preview.error) return <EmptyState title={t(errorKey(preview.error), { defaultValue: t('accept.error.request') })}
      action={preview.error.error.retryable ? retry : undefined} />;
    if (!preview.data || status === 'loading') return <CircularProgress aria-label={t('accept.loading')} size={24} />;
    const invitation = preview.data;
    return (
      <SectionCard title={invitation.businessName}>
        <Stack spacing={2}>
          <Typography>{t('accept.body', { name: invitation.businessName, email: invitation.emailMasked })}</Typography>
          <Typography>{t('accept.expires', { when: formatDateTime(invitation.expiresAt) })}</Typography>
          {actionError && <Alert severity="error">{t(errorKey(actionError), { defaultValue: t('accept.error.request') })}</Alert>}
          {status === 'anonymous' && <Typography>{t('accept.needLogin')}</Typography>}
          <Stack direction={{ xs: 'column', sm: 'row' }} useFlexGap spacing={1} sx={{ flexWrap: 'wrap' }}>
            {status === 'anonymous'
              ? <>
                  <Button variant="contained" component={Link} to="/login?next=/invitations/accept">{t('accept.signIn')}</Button>
                  <Button variant="outlined" component={Link} to="/signup?invite=1">{t('accept.signUp')}</Button>
                </>
              : <Button variant="contained" disabled={waiting} onClick={() => void respond('accept')}>{t('accept.accept')}</Button>}
            <Button disabled={waiting} onClick={() => void respond('decline')}>{t('accept.decline')}</Button>
          </Stack>
        </Stack>
      </SectionCard>
    );
  }

  return (
    <Stack spacing={2} sx={{ mx: 'auto', maxWidth: 580, p: { xs: 2, sm: 4 } }}>
      <PageHeader title={t('accept.title')} actions={<LanguageSwitch compact />} />
      {content()}
    </Stack>
  );
}
