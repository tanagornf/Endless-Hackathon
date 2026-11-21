import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Paper, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import type { DemoChatShopView } from '@nless/shared/features/inbox/types';
import CustomerChatView from './CustomerChatView';
import { chatRequest, chatTransport } from './demoTransport';

function usePublicMetadata() {
  useEffect(() => {
    const viewport = document.querySelector('meta[name="viewport"]');
    const oldContent = viewport?.getAttribute('content');
    viewport?.setAttribute('content', 'width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content');
    const robots = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex';
    document.head.append(robots);
    const visual = window.visualViewport;
    const root = document.documentElement;
    function syncViewport() {
      if (!visual || visual.scale !== 1) return;
      const top = Math.ceil(visual.offsetTop);
      const bottom = Math.floor(visual.offsetTop + visual.height);
      root.style.setProperty('--demo-chat-top', top + 'px');
      root.style.setProperty('--demo-chat-height', (bottom - top) + 'px');
    }
    syncViewport();
    visual?.addEventListener('resize', syncViewport);
    visual?.addEventListener('scroll', syncViewport);
    return () => {
      robots.remove();
      visual?.removeEventListener('resize', syncViewport);
      visual?.removeEventListener('scroll', syncViewport);
      root.style.removeProperty('--demo-chat-top');
      root.style.removeProperty('--demo-chat-height');
      if (oldContent != null) viewport?.setAttribute('content', oldContent);
    };
  }, []);
}

function PublicSession({ path }: { path: string }) {
  const { t, i18n } = useTranslation('inbox');
  const visitorToken = useRef<string | undefined>(undefined);
  const [session, setSession] = useState<{ shop: DemoChatShopView; token: string }>();
  const [error, setError] = useState<string>();
  const [retry, setRetry] = useState(0);
  const [reset, setReset] = useState(0);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState(false);

  useEffect(() => {
    const request = new AbortController();
    setError(undefined);
    const open = async () => {
      try {
        const shop = await chatRequest<DemoChatShopView>(path, { signal: request.signal });
        const current = await chatRequest<{ visitorToken: string }>(path + '/session', {
          method: 'POST',
          body: JSON.stringify({}),
          signal: request.signal,
        }, visitorToken.current);
        if (request.signal.aborted) return;
        let selectedLanguage: string | null = null;
        try { selectedLanguage = localStorage.getItem('nless.lang'); } catch { /* use browser or shop language */ }
        const browserLanguage = navigator.language;
        const language = selectedLanguage === 'th' || selectedLanguage === 'en' ? selectedLanguage :
          browserLanguage ? (browserLanguage.toLowerCase().startsWith('th') ? 'th' : 'en') : shop.language;
        if (i18n.resolvedLanguage !== language) void i18n.changeLanguage(language);
        visitorToken.current = current.visitorToken;
        setSession({ shop, token: current.visitorToken });
      } catch (cause) {
        if (request.signal.aborted) return;
        const code = cause instanceof Error && 'code' in cause ? cause.code : null;
        setError(code === 'NOT_FOUND' ? 'public.errors.notFound' : 'public.errors.network');
      }
    };
    void open();
    return () => request.abort();
  }, [path, retry, i18n]);

  const transport = useMemo(() => session ? chatTransport(path, session.token) : undefined, [path, session]);
  const english = (i18n.resolvedLanguage ?? i18n.language).startsWith('en');
  if (error && !session) return <Alert severity="error" sx={{ m: 2 }} action={
    <Button onClick={() => setRetry((value) => value + 1)}>{t('retry')}</Button>
  }>{t(error)}</Alert>;
  if (!session || !transport) return <Stack sx={{ p: 4, alignItems: 'center' }}><CircularProgress aria-label={t('loading')} /></Stack>;

  async function resetChat() {
    if (!transport || resetting) return;
    setResetting(true);
    setResetError(false);
    try {
      await transport.reset();
      setReset((value) => value + 1);
    } catch {
      setResetError(true);
    } finally {
      setResetting(false);
    }
  }

  return <Stack sx={{
    position: 'fixed', insetInline: 0, top: 'var(--demo-chat-top, 0px)',
    height: 'var(--demo-chat-height, 100vh)', '@supports (height: 100dvh)': { height: 'var(--demo-chat-height, 100dvh)' },
    minWidth: 0, width: '100%', maxWidth: 760, mx: 'auto', bgcolor: 'background.paper',
    pl: 'env(safe-area-inset-left)', pr: 'env(safe-area-inset-right)',
  }}>
    <Paper component="header" square elevation={0} sx={{ borderBottom: 1, borderColor: 'divider', px: 1.5, pt: 'max(4px, env(safe-area-inset-top))', pb: 0.5 }}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1, minHeight: 52 }}>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography component="h1" variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.25, overflowWrap: 'anywhere' }}>
            {session.shop.shopName}
          </Typography>
          <Typography variant="caption" color="text.secondary">{t('public.badge')}</Typography>
        </Box>
        <Button data-testid="demo-chat-lang" aria-label={t('public.language')} variant="outlined"
          sx={{ minWidth: 64, minHeight: 44, px: 0.75, flexShrink: 0 }}
          onClick={() => void i18n.changeLanguage(english ? 'th' : 'en')}>{t('public.languageLabel')}</Button>
        <Button aria-label={t('public.reset')} title={t('public.reset')} disabled={resetting}
          onClick={() => void resetChat()} sx={{ minWidth: 44, minHeight: 44, p: 0, flexShrink: 0 }}>
          <Box component="span" aria-hidden="true">↻</Box>
        </Button>
      </Stack>
    </Paper>
    {!session.shop.aiEnabled && <Alert severity="info">{t('public.aiOff')}</Alert>}
    {resetError && <Alert severity="error">{t('public.errors.network')}</Alert>}
    <CustomerChatView key={reset} transport={transport} ignoreClosed={reset > 0} limit={500}
      greeting={(english ? session.shop.welcomeTextEn : session.shop.welcomeText) || t('public.welcome', { shop: session.shop.shopName })}
      suggestions={english ? session.shop.suggestedQuestionsEn : session.shop.suggestedQuestions}
      capReached={session.shop.capReached}
      onUnauthorized={() => setRetry((value) => value + 1)} />
  </Stack>;
}

export default function PublicDemoChat() {
  const { slug } = useParams<{ slug: string }>();
  usePublicMetadata();
  if (!slug) return null;
  return <PublicSession key={slug} path={'/public/demo-chat/' + encodeURIComponent(slug)} />;
}
