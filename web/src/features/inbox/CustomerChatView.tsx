import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import SendOutlined from '@mui/icons-material/SendOutlined';
import { Alert, Box, Button, Chip, CircularProgress, IconButton, Paper, Stack, TextField, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { DemoChatMessage, DemoChatPoll } from '@nless/shared/features/inbox/types';
import { mergeMessages, MessageParts } from './MessageParts';
import type { ReviewAction } from './MessageParts';
import type { ChatTransport } from './demoTransport';

type DeliveryAttempt = { id: string; text: string; state: 'sending' | 'failed' };
type Props = {
  transport: ChatTransport;
  greeting: string;
  suggestions: string[];
  limit: number;
  capReached?: boolean;
  ignoreClosed?: boolean;
  onUnauthorized?: () => void;
};

function errorCode(cause: unknown) {
  return cause instanceof Error && 'code' in cause ? cause.code : null;
}

function errorKey(cause: unknown) {
  switch (errorCode(cause)) {
    case 'RATE_LIMITED': {
      const reason = (cause as { details?: { reason?: string } }).details?.reason;
      if (reason === 'daily_cap') return 'public.errors.dayCap';
      if (reason === 'visitor_daily') return 'public.errors.visitorCap';
      return 'public.errors.rate';
    }
    case 'POLICY_BLOCKED': return 'public.errors.moderation';
    case 'PROPOSAL_EXPIRED': return 'public.errors.proposalExpired';
    case 'SOLD_OUT': return 'public.errors.soldOut';
    case 'SLOT_FULL': return 'public.errors.slotFull';
    case 'VERSION_CONFLICT': return 'public.errors.version';
    case 'SERVICE_NOT_READY': return 'public.errors.unavailable';
    case 'NOT_FOUND': return 'public.errors.notFound';
    case 'AUTH_REQUIRED': return 'public.errors.session';
    default: return 'public.errors.network';
  }
}

export default function CustomerChatView({ transport, greeting, suggestions, limit, capReached, ignoreClosed, onUnauthorized }: Props) {
  const { t } = useTranslation('inbox');
  const [messages, setMessages] = useState<DemoChatMessage[]>([]);
  const [attempt, setAttempt] = useState<DeliveryAttempt>();
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<DemoChatPoll['pending']>(null);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState<string>();
  const [reconnecting, setReconnecting] = useState(false);
  const [loading, setLoading] = useState(true);
  const list = useRef<HTMLDivElement>(null);
  const keepScroll = useRef(true);
  const cursor = useRef<string | null>(null);
  const conversation = useRef<string | null>(null);
  const liveRequest = useRef<AbortController | undefined>(undefined);
  const pollNow = useRef<() => void>(() => {});
  const activeAttempt = useRef<DeliveryAttempt | undefined>(undefined);

  function showAttempt(next?: DeliveryAttempt) {
    activeAttempt.current = next;
    setAttempt(next);
  }

  function acknowledge(id: string) {
    const current = activeAttempt.current;
    if (current?.id !== id) return;
    showAttempt();
    setDraft((text) => text.trim() === current.text ? '' : text);
    setError(undefined);
  }
  const unauthorized = useRef(onUnauthorized);
  unauthorized.current = onUnauthorized;
  const reviewKeys = useRef(new Map<string, string>());
  const length = Array.from(draft.trim()).length;

  useEffect(() => {
    let disposed = false;
    let timer: number | undefined;
    let failures = 0;
    let useShortPollUntil = 0;

    async function poll(immediate = false) {
      if (disposed) return;
      const request = new AbortController();
      liveRequest.current = request;
      const start = Date.now();
      const waitMs = immediate || start < useShortPollUntil ? 0 : 20_000;
      const timeout = window.setTimeout(() => request.abort('timeout'), waitMs + 8_000);
      let interval = 0;
      try {
        const requestedCursor = cursor.current;
        const page = await transport.poll(requestedCursor, waitMs, request.signal);
        if (disposed || request.signal.aborted) return;
        if (page.conversationId !== conversation.current) {
          conversation.current = page.conversationId;
          cursor.current = null;
          setMessages([]);
          setPending(null);
          if (requestedCursor) {
            // A second tab can reset the conversation while this request still carries its old cursor.
            timer = window.setTimeout(() => void poll(true), 0);
            return;
          }
        }
        if (!ignoreClosed || !page.closed) {
          if (page.cursor) cursor.current = page.cursor;
          setMessages((previous) => mergeMessages(previous, page.items));
          const attemptId = activeAttempt.current?.id;
          if (attemptId && page.items.some((row) => row.author === 'customer' && row.clientRequestId === attemptId)) {
            acknowledge(attemptId);
          }
          setPending(page.pending);
        }
        failures = 0;
        setReconnecting(false);
        setLoading(false);
        interval = waitMs === 0 ? (start < useShortPollUntil ? 3_000 : 0) : Math.max(0, 1_000 - (Date.now() - start));
      } catch (cause) {
        if (disposed || (request.signal.aborted && request.signal.reason !== 'timeout')) return;
        setLoading(false);
        failures += 1;
        if (failures >= 2) setReconnecting(true);
        if (failures >= 3 && waitMs > 0) useShortPollUntil = Date.now() + 60_000;
        if (errorCode(cause) === 'AUTH_REQUIRED') unauthorized.current?.();
        interval = Math.min(15_000, 1_000 * 2 ** (failures - 1));
      } finally {
        clearTimeout(timeout);
        if (liveRequest.current === request) liveRequest.current = undefined;
      }
      if (!disposed) timer = window.setTimeout(() => void poll(), interval);
    }

    function immediatePoll() {
      clearTimeout(timer);
      liveRequest.current?.abort('superseded');
      void poll(true);
    }

    function onVisibility() {
      if (!document.hidden) immediatePoll();
    }

    pollNow.current = immediatePoll;
    void poll(true);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      disposed = true;
      clearTimeout(timer);
      liveRequest.current?.abort('disposed');
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [transport, ignoreClosed]);

  useEffect(() => {
    setSlow(false);
    if (pending?.state !== 'typing') return;
    const since = Date.parse(pending.since);
    const timer = window.setTimeout(() => setSlow(true), Math.max(0, 60_000 - (Date.now() - since)));
    return () => clearTimeout(timer);
  }, [pending?.state, pending?.since]);

  useEffect(() => {
    if (keepScroll.current && list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [messages, attempt, pending, slow]);

  async function sendText(input: string, retainedId?: string) {
    const text = input.trim();
    if (capReached || activeAttempt.current?.state === 'sending' || !text) return;
    if (Array.from(text).length > limit) {
      setError('public.errors.length');
      return;
    }
    const id = retainedId ?? crypto.randomUUID();
    keepScroll.current = true;
    showAttempt({ id, text, state: 'sending' });
    setError(undefined);
    try {
      const result = await transport.send(text, id);
      if (activeAttempt.current?.id !== id) return;
      if (conversation.current !== result.conversationId) {
        conversation.current = result.conversationId;
        cursor.current = null;
        setMessages([result.message]);
      } else {
        setMessages((previous) => mergeMessages(previous, [result.message]));
      }
      acknowledge(id);
      setPending({ since: result.message.createdAt, state: 'typing' });
      pollNow.current();
    } catch (cause) {
      if (activeAttempt.current?.id !== id) return;
      showAttempt({ id, text, state: 'failed' });
      setError(errorKey(cause));
      if (errorCode(cause) === 'AUTH_REQUIRED') onUnauthorized?.();
      pollNow.current();
    }
  }

  async function review(input: ReviewAction) {
    const key = input.proposalId + ':' + input.version + ':' + input.decision;
    const clientRequestId = reviewKeys.current.get(key) ?? crypto.randomUUID();
    reviewKeys.current.set(key, clientRequestId);
    setError(undefined);
    try {
      await transport.action(input, clientRequestId);
      pollNow.current();
    } catch (cause) {
      setError(errorKey(cause));
      if (errorCode(cause) === 'AUTH_REQUIRED') onUnauthorized?.();
      throw cause;
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendText(draft, attempt?.state === 'failed' && draft.trim() === attempt.text ? attempt.id : undefined);
  }

  function scrollChanged() {
    const box = list.current;
    if (box) keepScroll.current = box.scrollHeight - box.clientHeight - box.scrollTop < 80;
  }

  const lastCustomer = [...messages].reverse().find((entry) => entry.author === 'customer');
  const lastText = lastCustomer?.parts.find((part) => part.type === 'text')?.text;
  return <Stack sx={{ flex: 1, minHeight: 0, minWidth: 0 }}>
    {reconnecting && <Alert severity="info">{t('public.reconnect')}</Alert>}
    {capReached && <Alert severity="warning">{t('public.errors.dayCap')}</Alert>}
    <Stack role="log" aria-live="polite" aria-label={t('public.chatHistory')} ref={list} onScroll={scrollChanged} spacing={1}
      sx={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', overscrollBehavior: 'contain', p: 1.5 }}>
      {loading && <CircularProgress aria-label={t('loading')} size={22} />}
      {!loading && messages.length === 0 && !attempt && <>
        <Paper elevation={0} sx={{ width: 'fit-content', maxWidth: '90%', p: 1.5, bgcolor: 'action.hover', borderRadius: 2 }}>
          <Typography sx={{ overflowWrap: 'anywhere' }}>{greeting}</Typography>
        </Paper>
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
          {suggestions.map((text) => <Chip key={text} variant="outlined" label={text} clickable disabled={capReached}
            sx={{ minHeight: 44, maxWidth: '100%', '& .MuiChip-label': { whiteSpace: 'normal' } }}
            onClick={() => void sendText(text)} />)}
        </Stack>
      </>}
      {messages.map((message) => <Paper key={message.id} elevation={0} data-testid="demo-chat-message"
        data-message-id={message.id} data-author={message.author}
        sx={{ maxWidth: 'min(90%, 520px)', minWidth: 0, p: 1.25, borderRadius: 2, overflowWrap: 'anywhere',
          alignSelf: message.author === 'customer' ? 'flex-end' : 'flex-start',
          bgcolor: message.author === 'customer' ? 'primary.main' : 'action.hover',
          color: message.author === 'customer' ? 'primary.contrastText' : 'text.primary' }}>
        <MessageParts parts={message.parts} fileUrl={transport.fileUrl} onReview={review}
          onPostback={(text) => void sendText(text)} />
      </Paper>)}
      {attempt && <Paper elevation={0} data-testid="demo-chat-message" data-author="customer" data-message-id={attempt.id}
        sx={{ maxWidth: '90%', alignSelf: 'flex-end', p: 1.25, borderRadius: 2, bgcolor: 'action.hover' }}>
        <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{attempt.text}</Typography>
        {attempt.state === 'sending' ? <Typography variant="caption">{t('delivery.pending')}</Typography> :
          <Button onClick={() => void sendText(attempt.text, attempt.id)} size="small" sx={{ minHeight: 44 }}>{t('public.retrySend')}</Button>}
      </Paper>}
      {pending?.state === 'typing' && <Typography variant="body2" color="text.secondary">
        {t(slow ? 'public.slow' : 'public.typing')}
      </Typography>}
      {pending?.state === 'failed' && <Alert severity="warning" action={lastText &&
        <Button size="small" onClick={() => void sendText(lastText)}>{t('retry')}</Button>}>{t('public.failed')}</Alert>}
    </Stack>
    <Box component="form" onSubmit={submit} sx={{
      px: 1.5, pt: 1, pb: 'max(8px, env(safe-area-inset-bottom))', position: 'sticky', bottom: 0,
      borderTop: 1, borderColor: 'divider', bgcolor: 'background.paper',
    }}>
      {error && <Alert severity="error" sx={{ mb: 1 }}>{t(error, { limit })}</Alert>}
      <Stack direction="row" sx={{ gap: 1, alignItems: 'flex-end' }}>
        <TextField multiline maxRows={4} fullWidth size="small" value={draft}
          onChange={(event) => setDraft(event.target.value)} placeholder={t('public.input')} error={length > limit}
          helperText={length > limit * 0.8 ? t('public.length', { length, limit }) : undefined}
          slotProps={{ htmlInput: { 'data-testid': 'demo-chat-input', 'aria-label': t('public.input'), style: { fontSize: 16 } } }} />
        <IconButton type="submit" data-testid="demo-chat-send" aria-label={t('composer.send')}
          disabled={capReached || !draft.trim() || attempt?.state === 'sending'} color="primary"
          sx={{ width: 44, height: 44, flexShrink: 0, color: 'primary.contrastText', bgcolor: 'primary.main',
            '&:hover': { bgcolor: 'primary.dark' }, '&.Mui-disabled': { bgcolor: 'action.disabledBackground' } }}>
          <SendOutlined fontSize="small" />
        </IconButton>
      </Stack>
    </Box>
  </Stack>;
}
