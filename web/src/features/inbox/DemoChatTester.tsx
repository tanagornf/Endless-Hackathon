import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Alert, Box, Button, CircularProgress, FormControlLabel, Stack, Switch, TextField, Typography } from '@mui/material';
import QRCode from 'qrcode';
import { useTranslation } from 'react-i18next';
import type { DemoChatSettingsView } from '@nless/shared/features/inbox/types';
import { PageHeader, SectionCard, api, useApiMutation, useApiQuery, useSession, useToast } from '../../core';
import CustomerChatView from './CustomerChatView';
import { chatTransport } from './demoTransport';

type Settings = Pick<DemoChatSettingsView, 'enabled' | 'publicSlug' | 'welcomeText' | 'welcomeTextEn' | 'suggestedQuestions' | 'suggestedQuestionsEn'>;
const settingsPath = '/demo-chat/settings';

function LinkSettings({ initial }: { initial: DemoChatSettingsView }) {
  const { t } = useTranslation('inbox');
  const toast = useToast();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [slug, setSlug] = useState(initial.publicSlug);
  const [welcome, setWelcome] = useState(initial.welcomeText ?? '');
  const [welcomeEn, setWelcomeEn] = useState(initial.welcomeTextEn ?? '');
  const [questions, setQuestions] = useState(initial.suggestedQuestions.join('\n'));
  const [questionsEn, setQuestionsEn] = useState(initial.suggestedQuestionsEn.join('\n'));
  const [saved, setSaved] = useState(initial);
  const [qr, setQr] = useState('');
  const save = useApiMutation<Settings, DemoChatSettingsView>('PUT', settingsPath, { toastOnError: false });
  const [failed, setFailed] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const link = saved.enabled ? new URL(saved.publicUrl, window.location.origin).href : '';
  useEffect(() => {
    let active = true;
    setQr('');
    if (link) void QRCode.toDataURL(link, { width: 180, margin: 1 }).then((value) => {
      if (active) setQr(value);
    }).catch(() => {});
    return () => { active = false; };
  }, [link]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const split = (value: string) => value.split('\n').map((line) => line.trim()).filter(Boolean);
    setFailed(false);
    try {
      setSaved(await save.run({
        enabled, publicSlug: slug.trim(), welcomeText: welcome.trim() || null,
        welcomeTextEn: welcomeEn.trim() || null, suggestedQuestions: split(questions), suggestedQuestionsEn: split(questionsEn),
      }));
      toast.success(t('tester.saved'));
    } catch {
      setFailed(true);
    }
  }

  async function copyLink() {
    setCopyFailed(false);
    try {
      await navigator.clipboard.writeText(link);
      toast.success(t('tester.copied'));
    } catch {
      setCopyFailed(true);
    }
  }

  return <SectionCard title={t('tester.linkTitle')}>
    <Stack component="form" onSubmit={(event) => void submit(event)} spacing={1.5}>
      <FormControlLabel control={<Switch checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />}
        label={t('tester.enabled')} />
      <TextField label={t('tester.slug')} value={slug} onChange={(event) => setSlug(event.target.value)}
        required slotProps={{ htmlInput: { maxLength: 40, pattern: '[a-z0-9][a-z0-9\\-]{2,39}' } }} />
      <TextField label={t('tester.welcomeTh')} value={welcome} onChange={(event) => setWelcome(event.target.value)}
        multiline slotProps={{ htmlInput: { maxLength: 300 } }} />
      <TextField label={t('tester.welcomeEn')} value={welcomeEn} onChange={(event) => setWelcomeEn(event.target.value)}
        multiline slotProps={{ htmlInput: { maxLength: 300 } }} />
      <TextField label={t('tester.questionsTh')} value={questions} onChange={(event) => setQuestions(event.target.value)}
        multiline minRows={2} helperText={t('tester.questionsHint')} />
      <TextField label={t('tester.questionsEn')} value={questionsEn} onChange={(event) => setQuestionsEn(event.target.value)}
        multiline minRows={2} helperText={t('tester.questionsHint')} />
      {failed && <Alert severity="error">{t('tester.saveError')}</Alert>}
      <Button type="submit" variant="contained" disabled={save.running} sx={{ alignSelf: 'flex-start', minHeight: 44 }}>{t('tester.save')}</Button>
    </Stack>
    <Stack spacing={1} sx={{ mt: 2 }}>
      <Typography variant="body2">{t('tester.usage', { used: saved.todayTurns, total: saved.dailyCap })}</Typography>
      {link && <>
        <Typography component="a" href={link} target="_blank" rel="noreferrer" sx={{ color: 'primary.dark', overflowWrap: 'anywhere' }}>{link}</Typography>
        <Button variant="outlined" onClick={() => void copyLink()} sx={{ alignSelf: 'flex-start', minHeight: 44 }}>{t('tester.copy')}</Button>
        {copyFailed && <Alert severity="info">{t('tester.copyError')}</Alert>}
        {qr && <Box component="img" src={qr} alt={t('tester.qr')} sx={{ width: 180, maxWidth: '100%', height: 'auto' }} />}
      </>}
    </Stack>
  </SectionCard>;
}

function Tester({ businessId, shopName }: { businessId: string; shopName: string }) {
  const { t, i18n } = useTranslation('inbox');
  const settings = useApiQuery<DemoChatSettingsView>(settingsPath);
  const transport = useMemo(() => chatTransport(api.biz('/demo-chat')), [businessId]);
  const [reset, setReset] = useState(0);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState(false);
  const english = (i18n.resolvedLanguage ?? i18n.language).startsWith('en');

  async function resetChat() {
    if (resetting) return;
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

  return <Stack spacing={2}>
    <SectionCard title={t('tester.tryTitle')}>
      <Alert severity="info">{t('tester.notice')}</Alert>
      {resetError && <Alert severity="error">{t('public.errors.network')}</Alert>}
      <Button disabled={resetting} onClick={() => void resetChat()} sx={{ minHeight: 44 }}>{t('public.reset')}</Button>
      <Box sx={{ display: 'flex', flexDirection: 'column', height: 'clamp(390px, 65dvh, 640px)', width: '100%' }}>
        <CustomerChatView key={reset} transport={transport} ignoreClosed={reset > 0} limit={2000}
          suggestions={(english ? settings.data?.suggestedQuestionsEn : settings.data?.suggestedQuestions) ?? []}
          greeting={(english ? settings.data?.welcomeTextEn : settings.data?.welcomeText) || t('public.welcome', { shop: shopName })} />
      </Box>
    </SectionCard>
    {settings.error ? <Alert severity="error" action={<Button onClick={settings.reload}>{t('retry')}</Button>}>{t('tester.loadError')}</Alert> :
      settings.data ? <LinkSettings initial={settings.data} /> : <CircularProgress size={24} aria-label={t('loading')} />}
  </Stack>;
}

export default function DemoChatTester() {
  const { t } = useTranslation('inbox');
  const { currentBusiness } = useSession();
  if (!currentBusiness) return null;
  return <Stack spacing={2}>
    <PageHeader title={t('menu.entry1')} />
    <Tester key={currentBusiness.id} businessId={currentBusiness.id} shopName={currentBusiness.name} />
  </Stack>;
}
