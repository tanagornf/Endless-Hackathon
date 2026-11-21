import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, Checkbox, CircularProgress, FormControlLabel, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { EmptyState, PageHeader, SectionCard, formatDateTime } from '../../core';
import { useVoiceCall, voiceRequest } from './useVoiceCall';

interface VoiceChallenge { proof: string; command: string; language: 'th' | 'en'; basicId: string | null }
interface VoiceHistory {
  calls: { callId: string; startedAt: string; captions: { role: 'customer' | 'assistant'; text: string }[] }[];
}
const isInviteId = (value: string | null): value is string =>
  Boolean(value?.match(/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i));

export default function VoiceCallPage() {
  const { t, i18n } = useTranslation('voice');
  const [inviteId] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('invite'));
  const invitePath = '/invites/' + inviteId;
  const [challenge, setChallenge] = useState<VoiceChallenge>();
  const [verified, setVerified] = useState(false);
  const [pending, setPending] = useState(false);
  const [inviteFailed, setInviteFailed] = useState(false);
  const [micConsent, setMicConsent] = useState(false);
  const [saveTranscript, setSaveTranscript] = useState(false);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<VoiceHistory>();
  const [historyFailed, setHistoryFailed] = useState(false);
  const call = useVoiceCall(inviteId, challenge?.proof);

  const checkProof = useCallback(async () => {
    if (!challenge || verified || document.visibilityState === 'hidden') return;
    try {
      const result = await voiceRequest<{ verified: boolean }>(invitePath + '/status', 'GET', challenge.proof);
      if (result.verified) setVerified(true);
    } catch (error) {
      if (typeof error === 'object' && error && 'status' in error && error.status === 404) setInviteFailed(true);
    }
  }, [challenge, invitePath, verified]);

  useEffect(() => {
    if (!challenge || verified || inviteFailed) return;
    const check = () => void checkProof();
    const interval = window.setInterval(check, 2_500);
    document.addEventListener('visibilitychange', check);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', check);
    };
  }, [challenge, verified, inviteFailed, checkProof]);

  useEffect(() => {
    if (call.state !== 'ended' || !call.sessionId || !challenge) return;
    let current = true;
    voiceRequest<VoiceHistory>('/sessions/' + call.sessionId + '/history', 'GET', challenge.proof)
      .then((result) => { if (current) setHistory(result); })
      .catch(() => { if (current) setHistoryFailed(true); });
    return () => { current = false; };
  }, [call.state, call.sessionId, challenge]);

  async function beginVerification() {
    setPending(true);
    try {
      const result = await voiceRequest<VoiceChallenge>(invitePath + '/challenges', 'POST', undefined, {});
      setChallenge(result);
      if (i18n.resolvedLanguage !== result.language) void i18n.changeLanguage(result.language);
    } catch { setInviteFailed(true); }
    finally { setPending(false); }
  }

  const lineLink = challenge?.basicId && /^@[A-Za-z0-9._-]+$/.test(challenge.basicId)
    ? 'https://line.me/R/oaMessage/' + encodeURIComponent(challenge.basicId) + '/?' + encodeURIComponent(challenge.command)
    : null;
  const running = ['microphone', 'connecting', 'listening', 'speaking'].includes(call.state);
  const ended = ['ended', 'failed', 'simulated'].includes(call.state);

  return <Box sx={{ maxWidth: 560, mx: 'auto', pt: { xs: 2, sm: 4 } }}>
    <PageHeader title={t('page.title')} />
    <Stack spacing={2}>
      {!isInviteId(inviteId) || inviteFailed ? <SectionCard><EmptyState title={t('invite.unavailable')} description={t('invite.returnToLine')} /></SectionCard>
        : !challenge ? <SectionCard>
          <Stack spacing={2}>
            <Typography>{t('invite.intro')}</Typography>
            <Button variant="contained" size="large" disabled={pending} onClick={() => void beginVerification()} sx={{ minHeight: 48 }}>
              {pending ? <CircularProgress size={24} aria-label={t('invite.working')} /> : t('invite.verify')}
            </Button>
          </Stack>
        </SectionCard>
          : !verified ? <SectionCard title={t('invite.proofTitle')}>
            <Stack spacing={2}>
              <Typography>{t('invite.proofHelp')}</Typography>
              <Typography component="code" sx={{ overflowWrap: 'anywhere', color: 'text.secondary' }}>{challenge.command}</Typography>
              {lineLink && <Button component="a" href={lineLink} target="_blank" rel="noreferrer" variant="contained" sx={{ minHeight: 48 }}>{t('invite.openLine')}</Button>}
              <Button variant="outlined" sx={{ minHeight: 48 }} onClick={() => {
                void navigator.clipboard?.writeText(challenge.command).then(() => setCopied(true), () => {});
              }}>{copied ? t('invite.copied') : t('invite.copy')}</Button>
              <Typography role="status" color="text.secondary" variant="body2">{t('invite.waiting')}</Typography>
            </Stack>
          </SectionCard> : <SectionCard title={t('call.title')}>
            <Stack spacing={2}>
              {call.state === 'ready' && <>
                <Alert severity="info">{t('call.private')}</Alert>
                <FormControlLabel control={<Checkbox checked={micConsent} onChange={(_, checked) => setMicConsent(checked)} />} label={t('call.micConsent')} />
                <FormControlLabel control={<Checkbox checked={saveTranscript} onChange={(_, checked) => setSaveTranscript(checked)} />} label={t('call.saveTranscript')} />
                <Button variant="contained" size="large" disabled={!micConsent} sx={{ minHeight: 52 }} onClick={() => {
                  if (micConsent) void call.start(saveTranscript);
                }}>{t('call.start')}</Button>
              </>}
              {call.state !== 'ready' && <Typography role="status">{t('status.' + call.state)}</Typography>}
              {call.state === 'denied' && <Button onClick={call.retryPermission} variant="outlined" sx={{ minHeight: 48 }}>{t('call.tryAgain')}</Button>}
              {running && <Button color="error" variant="contained" sx={{ minHeight: 48 }} onClick={() => call.stop()}>{t('call.end')}</Button>}
              {call.needsAudioTap && running && <Button onClick={call.playAudio} variant="outlined" sx={{ minHeight: 48 }}>{t('call.playAudio')}</Button>}
              {ended && <Typography variant="body2" color="text.secondary">{t('invite.returnToLine')}</Typography>}
            </Stack>
          </SectionCard>}
      {(running || (ended && call.captions.length > 0)) && <SectionCard title={t('call.captions')}>
        {call.captions.length === 0 ? <EmptyState title={t('call.emptyCaptions')} /> : <Stack spacing={1.25} role="log" aria-live="polite">
          {call.captions.map(({ id, role, text }) => <Box key={id}>
            <Typography component="span" variant="caption" color="text.secondary">{t('role.' + role)}</Typography>
            <Typography sx={{ overflowWrap: 'anywhere' }}>{text}</Typography>
          </Box>)}
        </Stack>}
      </SectionCard>}
      {historyFailed && <Alert severity="warning">{t('history.unavailable')}</Alert>}
      {!!history?.calls.length && <SectionCard title={t('history.title')}>
        <Stack spacing={2}>{history.calls.map(({ callId, startedAt, captions }) => <Stack key={callId} spacing={.5}>
          <Typography variant="subtitle2">{formatDateTime(startedAt)}</Typography>
          {captions.map(({ role, text }, index) => <Typography key={index} variant="body2" sx={{ overflowWrap: 'anywhere' }}>
            {t('role.' + role)}{' · '}{text}
          </Typography>)}
        </Stack>)}</Stack>
      </SectionCard>}
      <audio ref={call.audio} autoPlay />
    </Stack>
  </Box>;
}
