import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentType, FormEvent, LazyExoticComponent } from 'react';
import { Alert, Avatar, Box, Button, Chip, CircularProgress, List, ListItemButton, MenuItem, Paper, Skeleton, Stack, TextField, Typography, useMediaQuery, useTheme } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { SlotContribution } from '@nless/shared/core/loader';
import type { Page } from '@nless/shared/core/types';
import type { ConversationDetail, InboxCounts, InboxRow, MessageRecord } from '@nless/shared/features/inbox/types';
import { ConfirmDialog, EmptyState, PageHeader, StatusChip, formatDateTime, useApiMutation, useApiQuery, useCan, useRealtime, useSession, useSlot } from '../../core';
import { mergeMessages, MessageParts } from './MessageParts';

const filters = ['all', 'waiting', 'active', 'closed'] as const;
const slotComponents = new WeakMap<SlotContribution['load'], LazyExoticComponent<ComponentType<Record<string, unknown>>>>();
const THREAD_REFRESH_MS = 15_000;
const LIST_REFRESH_MS = 30_000;
const unprefixed = { businessScoped: false } as const;

function SlotContent({ slots, props }: { slots: SlotContribution[]; props: Record<string, unknown> }) {
  return <Suspense fallback={null}>{slots.map(({ id, load }) => {
    let Component = slotComponents.get(load);
    if (!Component) {
      Component = lazy(load);
      slotComponents.set(load, Component);
    }
    return <Component key={id} {...props} />;
  })}</Suspense>;
}

function InboxList({ selected, onSelect }: { selected: string | null; onSelect: (id: string) => void }) {
  const { t } = useTranslation('inbox');
  const [filter, setFilter] = useState<(typeof filters)[number]>('all');
  const [assignee, setAssignee] = useState('');
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(input.trim()), 300);
    return () => clearTimeout(timer);
  }, [input]);

  const criteria = new URLSearchParams({ filter });
  if (search) criteria.set('search', search);
  if (assignee) criteria.set('assignee', assignee);
  const query = '/conversations?' + criteria.toString();
  return <Stack spacing={1.5} sx={{ height: '100%', minHeight: 0 }}>
    <TextField size="small" label={t('list.search')} value={input}
      onChange={(event) => setInput(event.target.value)} slotProps={{ htmlInput: { maxLength: 120 } }} />
    <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
      <InboxFilters filter={filter} change={setFilter} />
    </Stack>
    <TextField select size="small" label={t('list.assignee')} value={assignee} onChange={(event) => setAssignee(event.target.value)}>
      <MenuItem value="">{t('list.all')}</MenuItem>
      <MenuItem value="me">{t('list.mine')}</MenuItem>
      <MenuItem value="unassigned">{t('list.unassigned')}</MenuItem>
    </TextField>
    <InboxRows key={query} path={query} selected={selected} onSelect={onSelect} hasSearch={Boolean(search)} />
  </Stack>;
}

function InboxFilters({ filter, change }: { filter: (typeof filters)[number]; change: (filter: (typeof filters)[number]) => void }) {
  const { t } = useTranslation('inbox');
  const counts = useApiQuery<InboxCounts>('/conversations/counts');
  useRealtime('conversation.updated', counts.reload);
  useRealtime('message.created', counts.reload);
  useRealtime('custom', (event) => {
    if (event.featureId === 'F09' && event.name === 'inbox.read') counts.reload();
  });
  return filters.map((choice) => <Chip key={choice} clickable label={
    choice === 'waiting' && counts.data ? t('list.waitingCount', { count: counts.data.waiting }) : t('list.' + choice)
  } variant={choice === filter ? 'filled' : 'outlined'} color={choice === filter ? 'primary' : 'default'}
    aria-pressed={choice === filter} sx={{ minHeight: 44 }} onClick={() => change(choice)} />);
}

function InboxRows({ path, selected, onSelect, hasSearch }: {
  path: string; selected: string | null; onSelect: (id: string) => void; hasSearch: boolean;
}) {
  const { t } = useTranslation('inbox');
  const first = useApiQuery<Page<InboxRow>>(path);
  const [current, setCurrent] = useState<Page<InboxRow>>();
  const [cursor, setCursor] = useState<string | null>(null);
  const [extra, setExtra] = useState<Page<InboxRow>>();
  const more = useApiQuery<Page<InboxRow>>(cursor ? path + '&cursor=' + encodeURIComponent(cursor) : null);
  const debounce = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!first.data) return;
    setCurrent(first.data);
    setCursor(null);
    setExtra(undefined);
  }, [first.data]);
  useEffect(() => {
    if (!more.data) return;
    const page = more.data;
    setExtra((previous) => ({ items: [...(previous?.items ?? []), ...page.items], nextCursor: page.nextCursor }));
  }, [more.data]);

  function scheduleRefresh() {
    clearTimeout(debounce.current);
    debounce.current = window.setTimeout(first.reload, 400);
  }

  useRealtime('message.created', scheduleRefresh);
  useRealtime('conversation.updated', scheduleRefresh);
  useRealtime('custom', (event) => {
    if (event.featureId === 'F09' && event.name === 'inbox.read') scheduleRefresh();
  });
  useEffect(() => {
    const timer = window.setInterval(() => { if (!document.hidden) first.reload(); }, LIST_REFRESH_MS);
    return () => {
      clearInterval(timer);
      clearTimeout(debounce.current);
    };
  }, [first.reload]);

  const rows = new Map<string, InboxRow>();
  for (const row of [...(extra?.items ?? []), ...(current?.items ?? [])]) rows.set(row.conversationId, row);
  const ordered = [...(current?.items ?? []).map((row) => row.conversationId), ...(extra?.items ?? []).map((row) => row.conversationId)];
  const nextCursor = extra ? extra.nextCursor : current?.nextCursor;
  const loadMore = () => { if (nextCursor && !more.loading) setCursor(nextCursor); };

  if (first.error) return <EmptyState title={t('list.loadError')} action={<Button onClick={first.reload}>{t('retry')}</Button>} />;
  if (!current) return <Stack aria-label={t('loading')}>{Array.from({ length: 6 }, (_, index) =>
    <Skeleton key={index} height={56} />)}</Stack>;
  if (!rows.size) return <EmptyState title={t(hasSearch ? 'list.noMatches' : 'list.empty')} />;

  return <Box sx={{ minHeight: 0, overflowY: 'auto' }} onScroll={(event) => {
    const list = event.currentTarget;
    if (!more.error && list.scrollHeight - list.scrollTop - list.clientHeight < 120) loadMore();
  }}>
    <List disablePadding>
      {[...new Set(ordered)].map((id) => {
        const row = rows.get(id);
        if (!row) return null;
        const name: string = row.customerName || t('list.customer');
        const waitingMinutes = row.waitingSince ? Math.max(0, Math.floor((Date.now() - Date.parse(row.waitingSince)) / 60_000)) : 0;
        return <ListItemButton key={id} data-conversation-id={id} selected={selected === id} onClick={() => onSelect(id)}
          sx={{ gap: 1.5, px: 1, py: 1.25, borderRadius: 2, alignItems: 'flex-start' }}>
          <Avatar sx={{ width: 36, height: 36, bgcolor: 'primary.light', color: 'primary.contrastText' }}>
            {Array.from(name)[0]}
          </Avatar>
          <Stack spacing={0.35} sx={{ minWidth: 0, flex: 1 }}>
            <Stack direction="row" sx={{ gap: 1, alignItems: 'baseline', justifyContent: 'space-between' }}>
              <Typography sx={{ fontWeight: 700 }} noWrap>{name}</Typography>
              {row.lastMessageAt && <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                {formatDateTime(row.lastMessageAt)}
              </Typography>}
            </Stack>
            <Typography noWrap variant="body2" color="text.secondary">{row.lastMessagePreview}</Typography>
            <Stack direction="row" sx={{ gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
              <Typography variant="caption">{t('channel.' + row.channel)}</Typography>
              <StatusChip kind="conversation" status={row.handler} />
              {row.unreadCount > 0 && <Chip size="small" color="primary" label={row.unreadCount}
                aria-label={t('list.unreadCount', { count: row.unreadCount })} />}
              {row.isWaiting && <Typography variant="caption" color="warning.dark">
                {t('list.waitingTime', { minutes: waitingMinutes })}
              </Typography>}
            </Stack>
          </Stack>
        </ListItemButton>;
      })}
    </List>
    {nextCursor && <Button fullWidth sx={{ minHeight: 44 }} onClick={more.error ? more.reload : loadMore} disabled={more.loading}>
      {t(more.error ? 'retry' : more.loading ? 'loading' : 'list.more')}
    </Button>}
  </Box>;
}

function StaffMessage({ message, onRetry }: { message: MessageRecord; onRetry?: (text: string) => void }) {
  const { t } = useTranslation('inbox');
  const slots = useSlot('chatMessageActions');
  return <Box data-testid="inbox-message" data-message-id={message.id} data-author={message.author}
    data-direction={message.direction} data-origin={message.origin} sx={{ minWidth: 0 }}>
    <Stack spacing={0.5}>
      <Typography variant="caption" color="text.secondary">{t('author.' + message.author)} · {formatDateTime(message.createdAt)}</Typography>
      <MessageParts parts={message.parts} linkSources={message.direction === 'outbound'}
        fileUrl={(fileId) => '/api/v1/businesses/' + encodeURIComponent(message.businessId) + '/chat/files/' + encodeURIComponent(fileId)} />
      {message.origin !== 'demo' && message.origin !== 'live' && <Typography variant="caption">{t('origin.' + message.origin)}</Typography>}
      {message.direction === 'outbound' && message.delivery.state !== 'not_required' &&
        <Box><StatusChip status={message.delivery.state} label={t('delivery.' + message.delivery.state)} /></Box>}
      {message.delivery.mode === 'sandbox' &&
        <Typography variant="caption" color="warning.dark">{t('delivery.sandbox')}</Typography>}
      {message.delivery.state === 'failed' && <>
        <Typography data-testid="message-delivery-error" variant="caption" color="error.main">
          {t('delivery.error')}
        </Typography>
        {onRetry && message.author === 'staff' && message.text && <Button size="small" onClick={() => onRetry(message.text)}>
          {t('retry')}
        </Button>}
      </>}
      {slots.length > 0 && <SlotContent slots={slots} props={{ conversationId: message.conversationId, message }} />}
    </Stack>
  </Box>;
}

function InboxThread({ id, goBack }: { id: string; goBack: () => void }) {
  const { t } = useTranslation('inbox');
  const path = '/conversations/' + encodeURIComponent(id);
  const detail = useApiQuery<ConversationDetail>(path, unprefixed);
  const history = useApiQuery<Page<MessageRecord>>(path + '/messages', unprefixed);
  const [loadedDetail, setLoadedDetail] = useState<ConversationDetail>();
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [before, setBefore] = useState<string | null>(null);
  const [olderPath, setOlderPath] = useState<string | null>(null);
  const [newMessages, setNewMessages] = useState(false);
  const older = useApiQuery<Page<MessageRecord>>(olderPath, unprefixed);
  const read = useApiMutation<Record<string, never>, { unreadCount: 0 }>('POST', path + '/read', { ...unprefixed, toastOnError: false });
  const send = useApiMutation<{ clientRequestId: string; text: string }, unknown>('POST', path + '/staff-messages', { ...unprefixed, toastOnError: false });
  const takeover = useApiMutation<{ force: boolean }, unknown>('POST', path + '/takeover', { ...unprefixed, toastOnError: false });
  const [holder, setHolder] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sendingError, setSendingError] = useState<string | null>(null);
  const pendingSend = useRef<{ clientRequestId: string; text: string } | null>(null);
  const inFlight = useRef(false);
  const latestSequence = useRef(0);
  const readSequence = useRef(-1);
  const stickToBottom = useRef(true);
  const list = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const { user } = useSession();
  const canReply = useCan('chat.reply');
  const canTakeover = useCan('chat.takeover');
  const desktop = useMediaQuery(useTheme().breakpoints.up('md'));
  const composerSlots = useSlot('chatComposerActions').filter((slot) => slot.id !== 'team.quick' || !desktop);
  const sideSlots = useSlot('chatSidePanels').filter((slot) => desktop || slot.id !== 'team.panel');
  const [showSide, setShowSide] = useState(false);

  useEffect(() => { if (detail.data) setLoadedDetail(detail.data); }, [detail.data]);
  useEffect(() => {
    if (!history.data) return;
    const page = history.data;
    const priorSequence = latestSequence.current;
    const newest = page.items.at(-1)?.seq ?? 0;
    latestSequence.current = Math.max(priorSequence, newest);
    if (!priorSequence) setBefore(page.nextCursor);
    if (newest > priorSequence && priorSequence > 0 && !stickToBottom.current) setNewMessages(true);
    setMessages((previous) => mergeMessages(previous, page.items));
    if (readSequence.current < newest) {
      readSequence.current = newest;
      void read.run({}).catch(() => { readSequence.current = -1; });
    }
  }, [history.data]);
  useEffect(() => {
    if (!older.data) return;
    const page = older.data;
    const currentList = list.current;
    const priorHeight = currentList?.scrollHeight ?? 0;
    const priorScroll = currentList?.scrollTop ?? 0;
    stickToBottom.current = false;
    setMessages((previous) => mergeMessages(previous, page.items));
    setBefore(page.nextCursor);
    requestAnimationFrame(() => { if (currentList) currentList.scrollTop = priorScroll + currentList.scrollHeight - priorHeight; });
  }, [older.data]);
  useEffect(() => {
    if (stickToBottom.current && list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [messages]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden) { history.reload(); detail.reload(); }
    }, THREAD_REFRESH_MS);
    return () => clearInterval(timer);
  }, [history.reload, detail.reload]);
  useRealtime('message.created', (event) => {
    if (event.conversationId === id) { history.reload(); detail.reload(); }
  });
  useRealtime('message.updated', (event) => { if (event.conversationId === id) history.reload(); });
  useRealtime('conversation.updated', (event) => { if (event.conversationId === id) detail.reload(); });

  function submit(event: FormEvent) {
    event.preventDefault();
    void sendText(draft.trim());
  }

  async function sendText(text: string) {
    if (!text || inFlight.current) return;
    const input = pendingSend.current?.text === text ? pendingSend.current : { clientRequestId: crypto.randomUUID(), text };
    pendingSend.current = input;
    inFlight.current = true;
    setSendingError(null);
    try {
      await send.run(input);
      pendingSend.current = null;
      setDraft('');
      stickToBottom.current = true;
      history.reload();
      detail.reload();
    } catch (error) {
      const code = error instanceof Error && 'code' in error ? error.code : null;
      if (code === 'VERSION_CONFLICT' && canTakeover) {
        const name = (error as { details?: { holder?: { displayName?: string } } }).details?.holder?.displayName;
        setHolder(name ?? t('author.staff'));
      } else {
        setSendingError(code === 'VERSION_CONFLICT' ? 'composer.taken' :
          code === 'PERMISSION_DENIED' ? 'composer.noPermission' : 'composer.failed');
      }
    } finally {
      inFlight.current = false;
    }
  }

  function insertText(text: string) {
    const start = composer.current?.selectionStart ?? draft.length;
    const end = composer.current?.selectionEnd ?? draft.length;
    setDraft(draft.slice(0, start) + text + draft.slice(end));
    requestAnimationFrame(() => {
      composer.current?.focus();
      composer.current?.setSelectionRange(start + text.length, start + text.length);
    });
  }

  const groups = useMemo(() => {
    const result: MessageRecord[][] = [];
    for (const message of messages) {
      const previous = result.at(-1);
      if (message.groupId && previous?.[0].groupId === message.groupId) previous.push(message);
      else result.push([message]);
    }
    return result;
  }, [messages]);

  const conversation = loadedDetail?.conversation;
  const belongsToMe = conversation?.assigneeUserId === user?.id;
  const retryLoading = () => { detail.reload(); history.reload(); };
  return <Stack spacing={1.5} sx={{ height: '100%', minHeight: 0 }}>
    <Button onClick={goBack} sx={{ display: { xs: 'inline-flex', md: 'none' }, minHeight: 44, alignSelf: 'flex-start' }}>
      {t('thread.back')}
    </Button>
    {detail.error || history.error ? <Alert severity="error" action={<Button onClick={retryLoading}>{t('retry')}</Button>}>
      {t('thread.loadError')}
    </Alert> : !conversation ? <CircularProgress size={24} aria-label={t('loading')} /> : <>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography component="h2" variant="h6" sx={{ overflowWrap: 'anywhere' }}>
            {conversation.customer.displayName || t('list.customer')}
          </Typography>
          <Stack direction="row" sx={{ gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography variant="caption">{t('channel.' + conversation.channel)}</Typography>
            <StatusChip kind="conversation" status={conversation.handler} />
            {loadedDetail?.assigneeName && <Typography variant="caption">{t('thread.owner', { name: loadedDetail.assigneeName })}</Typography>}
          </Stack>
        </Box>
        {!desktop && sideSlots.length > 0 && <Button sx={{ minHeight: 44 }} aria-expanded={showSide} onClick={() => setShowSide(!showSide)}>
          {t('thread.details')}
        </Button>}
      </Stack>
      <Box sx={{ display: 'flex', flex: 1, minHeight: 0, position: 'relative', gap: 1 }}>
        <Stack ref={list} spacing={1} role="log" aria-live="polite" aria-label={t('thread.messages')}
          sx={{ flex: 1, minWidth: 0, overflowY: 'auto', px: 0.5, pb: 1, overscrollBehavior: 'contain' }}
          onScroll={() => {
            if (!list.current) return;
            const box = list.current;
            stickToBottom.current = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
            if (stickToBottom.current) setNewMessages(false);
          }}>
          {before && <Button sx={{ minHeight: 44 }} disabled={older.loading}
            onClick={() => older.error ? older.reload() : setOlderPath(path + '/messages?before=' + encodeURIComponent(before))}>
            {t(older.error ? 'retry' : older.loading ? 'loading' : 'thread.older')}
          </Button>}
          {!messages.length && !history.loading && <EmptyState title={t('thread.empty')} />}
          {groups.map((group, index) => {
            const first = group[0];
            const date = formatDateTime(first.createdAt, { dateOnly: true });
            const previous = groups[index - 1]?.at(-1);
            const lastDate = previous && formatDateTime(previous.createdAt, { dateOnly: true });
            return <Stack key={first.id} spacing={0.5}>
              {date !== lastDate && <Typography align="center" variant="caption" color="text.secondary">{date}</Typography>}
              <Paper elevation={0} sx={{
                alignSelf: first.direction === 'inbound' ? 'flex-start' : 'flex-end',
                maxWidth: 'min(88%, 420px)', minWidth: 0, p: 1.25, borderRadius: 2,
                bgcolor: first.author === 'staff' ? 'primary.50' : 'action.hover',
              }}>
                <Stack spacing={1}>{group.map((message) => <StaffMessage key={message.id} message={message} onRetry={canReply ? setDraft : undefined} />)}</Stack>
              </Paper>
            </Stack>;
          })}
        </Stack>
        {sideSlots.length > 0 && (desktop || showSide) && <Paper variant="outlined" sx={{
          width: { xs: '100%', md: 'min(42%, 320px)' }, flexShrink: 0, p: 1, overflowY: 'auto',
          position: { xs: 'absolute', md: 'static' }, inset: 0, zIndex: 1,
        }}><SlotContent slots={sideSlots} props={{ conversationId: id }} /></Paper>}
      </Box>
      {newMessages && <Button onClick={() => {
        if (list.current) list.current.scrollTop = list.current.scrollHeight;
        setNewMessages(false);
      }}>{t('thread.newMessages')}</Button>}
      <SlotContent slots={composerSlots} props={{ conversationId: id, insertText, getText: () => draft }} />
      {canReply && conversation.status === 'open' ? <Stack component="form" onSubmit={submit} spacing={0.75}>
        {sendingError && <Alert severity="error">{t(sendingError)}</Alert>}
        {!belongsToMe && conversation.handler === 'ai' && <Typography variant="caption" color="text.secondary">
          {t('composer.takeoverHint')}
        </Typography>}
        <Stack direction="row" sx={{ gap: 1, alignItems: 'flex-end' }}>
          <TextField fullWidth multiline maxRows={5} inputRef={composer} size="small" label={t('composer.label')}
            value={draft} onChange={(event) => setDraft(event.target.value)} slotProps={{ htmlInput: { maxLength: 2000 } }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing &&
                window.matchMedia('(pointer: fine)').matches) {
                event.preventDefault();
                void sendText(draft.trim());
              }
            }} />
          <Button type="submit" variant="contained" sx={{ minHeight: 44 }} disabled={!draft.trim() || send.running}>{t('composer.send')}</Button>
        </Stack>
      </Stack> : <Typography variant="body2" color="text.secondary">{t(conversation.status === 'closed' ? 'thread.closed' : 'composer.viewOnly')}</Typography>}
      <ConfirmDialog open={holder !== null} title={t('composer.takeoverTitle')}
        message={t('composer.takeoverConfirm', { name: holder })} confirmLabel={t('composer.takeoverTitle')}
        onClose={() => setHolder(null)}
        onConfirm={async () => {
          try {
            await takeover.run({ force: true });
          } catch {
            setSendingError('composer.takeoverFailed');
            return;
          }
          const text = pendingSend.current?.text;
          if (text) await sendText(text);
        }} />
    </>}
  </Stack>;
}

export default function InboxPage() {
  const { t } = useTranslation('inbox');
  const [search, setSearch] = useSearchParams();
  const conversation = search.get('c');
  const { currentBusiness } = useSession();
  function choose(id: string | null) {
    const next = new URLSearchParams(search);
    if (id) next.set('c', id);
    else next.delete('c');
    setSearch(next);
  }

  return <Stack spacing={1.5} sx={{ minWidth: 0 }}>
    <PageHeader title={t('page.title')} />
    <Box sx={{
      display: 'grid', minWidth: 0, height: { xs: 'max(420px, calc(100dvh - 205px))', md: 'max(420px, calc(100dvh - 160px))' },
      gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(250px, 360px) minmax(0, 1fr)' }, gap: 1.5,
    }}>
      <Paper variant="outlined" sx={{ p: 1.5, minHeight: 0, minWidth: 0, display: { xs: conversation ? 'none' : 'block', md: 'block' } }}>
        <InboxList key={currentBusiness?.id} selected={conversation} onSelect={choose} />
      </Paper>
      <Paper variant="outlined" sx={{ p: 1.5, minHeight: 0, minWidth: 0, display: { xs: conversation ? 'block' : 'none', md: 'block' } }}>
        {conversation ? <InboxThread key={currentBusiness?.id + ':' + conversation} id={conversation} goBack={() => choose(null)} /> :
          <EmptyState title={t('thread.select')} />}
      </Paper>
    </Box>
  </Stack>;
}
