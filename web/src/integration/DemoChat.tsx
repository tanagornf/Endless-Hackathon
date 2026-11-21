import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Chip, LinearProgress, Paper, Stack, TextField, Typography } from '@mui/material';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { MessagePart } from '@nless/shared/core/types';
import { api, formatMoney, LanguageSwitch, useSession } from '../core';
import { apiRequest } from '../core/api';
import { getFailure } from '../core/ui/toast';
import { ServiceAlert } from './ResourcePanel';

type Message = { id: string; seq: number; author: 'customer'|'ai'|'staff'; parts: MessagePart[] };
type Shop = { shopName?: string; publicUrl?: string; welcomeText: string | null; welcomeTextEn: string | null; suggestedQuestions: string[]; suggestedQuestionsEn: string[]; capReached?: boolean };
type Poll = { items: Message[]; cursor: string | null; pending: {state:string} | null; closed: boolean };
type Review = Extract<MessagePart, {type:'order_review'|'booking_review'}>;
const base = import.meta.env.VITE_API_BASE || '/api/v1';
function safeLink(raw?: string) {
  if (!raw) return;
  try { const url=new URL(raw,location.origin); if (url.protocol === 'https:' || url.origin === location.origin) return url.href; } catch { /* malformed link */ }
}
function BubblePart({ part, act, disabled }: { part: MessagePart; act: (part: Review, decision: string) => void; disabled: boolean }) {
  const { t } = useTranslation('integration');
  if (part.type === 'text') return <Typography sx={{whiteSpace:'pre-wrap'}}>{part.text}</Typography>;
  if (part.type === 'product_card') return <Stack spacing={1}>{part.items.map(item => <Box key={item.itemId + (item.variantId ?? '')}>
    <Typography sx={{fontWeight:600}}>{item.name}</Typography><Typography>{item.sku} · {formatMoney(item.unitPriceMinor)}</Typography></Box>)}</Stack>;
  if (part.type === 'order_review' || part.type === 'booking_review') return <Stack spacing={1}>
    {part.type === 'order_review' ? <>{part.lines.map((line,i) => <Typography key={i}>{line.name} × {line.quantity}</Typography>)}
      <Typography sx={{fontWeight:600}}>{t('field.totalMinor')} · {formatMoney(part.totalMinor)}</Typography></> :
      <><Typography>{part.serviceName}</Typography><Typography>{part.localDisplay}</Typography></>}
    <Stack direction="row" spacing={1}>{(['confirm','cancel'] as const).map(choice => <Button key={choice} variant={choice === 'confirm' ? 'contained' : 'outlined'}
      disabled={disabled || Date.parse(part.expiresAt) <= Date.now()} onClick={() => act(part,choice)}>{t(choice)}</Button>)}</Stack>
  </Stack>;
  if (part.type === 'action_buttons') return <Stack><Typography>{part.text}</Typography>{part.buttons.map(button => {
    const href = button.action.kind === 'link' && safeLink(button.action.url);
    return href && <Button component="a" key={button.id} href={href}>{button.label}</Button>;
  })}</Stack>;
  const href = safeLink(part.url);
  return part.type === 'image' && href ? <Box component="img" src={href} alt={part.alt ?? ''} sx={{maxWidth:'100%',maxHeight:240}} /> :
    part.type === 'file' && href ? <Button component="a" href={href}>{part.fileName}</Button> : null;
}
export default function DemoChat({ guest }: {guest: boolean}) {
  const { slug = '' } = useParams();
  const { currentBusiness } = useSession();
  const { t,i18n } = useTranslation('integration');
  const path = guest ? '/public/demo-chat/' + encodeURIComponent(slug) : api.biz('/demo-chat');
  const [shop,setShop] = useState<Shop>();
  const [messages,setMessages] = useState<Message[]>([]);
  const [pending,setPending] = useState(false);
  const [closed,setClosed] = useState(false);
  const [draft,setDraft] = useState('');
  const [busy,setBusy] = useState(false);
  const [ready,setReady] = useState(false);
  const [error,setError] = useState('');
  const [revision,setRevision] = useState(0);
  const [decisions,setDecisions] = useState<string[]>([]);
  const visitor = useRef('');
  const lock = useRef(false);
  const request = useRef({ text:'',id:'' });
  const tail = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);
  const call = <T,>(suffix: string, body?: unknown, signal?: AbortSignal) => apiRequest<T>(base + path + suffix, {
    method: body === undefined ? 'GET' : 'POST', body: body === undefined ? undefined : JSON.stringify(body),
    headers: visitor.current && guest ? { 'X-Demo-Visitor':visitor.current } : {}, redirectOnUnauthorized: !guest, signal,
  });
  useEffect(() => {
    mounted.current=true; return () => {mounted.current=false;};
  },[]);
  useEffect(() => {
    let active = true; let timer: number | undefined;
    const controller = new AbortController();
    let cursor = '';
    setReady(false); setError(''); setPending(false);
    async function poll() {
      try {
        const data = await call<Poll>('/poll' + (cursor ? '?after=' + encodeURIComponent(cursor) : ''),undefined,controller.signal);
        if (!active) return;
        if (data.items.length) setMessages(old => [...new Map([...old,...data.items].map(m => [m.id,m])).values()].sort((a,b) => a.seq-b.seq));
        cursor = data.cursor || cursor;
        setClosed(data.closed); setPending(data.pending?.state === 'typing'); setReady(true); setError('');
        timer=window.setTimeout(poll,1800);
      } catch (cause) { if (active) { setReady(false); setError(getFailure(cause)?.error.code ?? 'INTERNAL'); } }
    }
    async function connect() {
      try {
        const info=await call<Shop>(guest ? '' : '/settings',undefined,controller.signal); if (!active) return;
        setShop(info);
        if (guest) {
          let saved = ''; try { saved = document.cookie.split('; ').find(c => c.startsWith('nless_demo_visitor='))?.slice('nless_demo_visitor='.length) ?? ''; } catch { /* memory fallback */ }
          const auth=await call<{visitorToken:string}>('/session', {visitorToken:saved || visitor.current || undefined},controller.signal);
          if (!active) return;
          visitor.current=auth.visitorToken;
          try { document.cookie='nless_demo_visitor=' + encodeURIComponent(auth.visitorToken) + '; Path=/; SameSite=Lax; Max-Age=2592000' + (location.protocol === 'https:' ? '; Secure' : ''); } catch { /* memory fallback */ }
        }
        await poll();
      } catch (cause) { if (active) setError(getFailure(cause)?.error.code ?? 'INTERNAL'); }
    }
    void connect();
    return () => { active=false; controller.abort(); window.clearTimeout(timer); };
  },[path,guest,revision]);
  useEffect(() => { tail.current?.scrollIntoView({block:'nearest'}); },[messages.length]);
  async function send(text: string) {
    text=text.trim(); if (!text || lock.current || closed || !ready) return;
    lock.current=true; setBusy(true); setError('');
    if (request.current.text !== text) request.current={text,id:crypto.randomUUID()};
    try {
      const result=await call<{message:Message}>('/messages',{text,clientRequestId:request.current.id});
      if (!mounted.current) return;
      setMessages(old => old.some(m => m.id===result.message.id) ? old : [...old,result.message]);
      request.current={text:'',id:''}; setDraft(''); setPending(true);
    } catch (cause) { if (mounted.current) setError(getFailure(cause)?.error.code ?? 'INTERNAL'); }
    finally { lock.current=false; if (mounted.current) setBusy(false); }
  }
  async function decide(part: Review,decision: string) {
    if (lock.current || decisions.includes(part.proposalId)) return;
    lock.current=true; setBusy(true);
    try { await call('/actions',{clientRequestId:crypto.randomUUID(),kind:part.type === 'order_review' ? 'order' : 'booking',proposalId:part.proposalId,version:part.version,reviewToken:part.reviewToken,decision});
      if (mounted.current) setDecisions(old => [...old,part.proposalId]); }
    catch (cause) { if (mounted.current) setError(getFailure(cause)?.error.code ?? 'INTERNAL'); }
    finally { lock.current=false; if (mounted.current) setBusy(false); }
  }
  const en=i18n.resolvedLanguage === 'en';
  const disabled=busy || !ready || closed || Boolean(shop?.capReached);
  return <Paper variant="outlined" sx={{ mx:'auto',maxWidth:720, display:'flex',flexDirection:'column',maxHeight:guest ? 'calc(100dvh - 32px)' : '72dvh',minHeight:320 }}>
    <Stack direction="row" sx={{p:2,alignItems:'center',justifyContent:'space-between',borderBottom:1,borderColor:'divider'}}>
      <Typography component="h1" variant="h6">{shop?.shopName || (!guest && currentBusiness?.name) || t('page.publicChat.title')}</Typography>{guest && <LanguageSwitch compact />}
      {!guest && safeLink(shop?.publicUrl) && <Button component="a" href={safeLink(shop?.publicUrl)}>{t('openDemo')}</Button>}
    </Stack>
    {!ready && !error && <LinearProgress />}
    {error && <ServiceAlert code={error} retry={() => setRevision(v => v+1)} />}
    <Stack role="log" aria-live="polite" spacing={1.4} sx={{p:2,minHeight:100,overflowY:'auto',flex:1,bgcolor:'#F5F8F6'}}>
      {shop && !messages.length && <Typography>{(en ? shop.welcomeTextEn : shop.welcomeText) || t('noMessages')}</Typography>}
      {!messages.length && <Box>{(en ? shop?.suggestedQuestionsEn : shop?.suggestedQuestions)?.map(s => <Chip component="button" clickable disabled={disabled} onClick={() => void send(s)} key={s} label={s} sx={{m:.5,minHeight:44}} />)}</Box>}
      {messages.map(m => <Paper key={m.id} elevation={0} sx={{ maxWidth:'85%',alignSelf:m.author === 'customer' ? 'end' : 'start',bgcolor:m.author==='customer' ? '#DCEEE7' : '#fff',px:1.7,py:1.2 }}>
        <Typography variant="caption" color="text.secondary">{t(m.author === 'ai' ? 'assistant' : m.author)}</Typography>
        {m.parts.map((part,i) => <BubblePart key={i} part={part} act={(p,d) => void decide(p,d)} disabled={disabled || ('proposalId' in part && decisions.includes(part.proposalId))} />)}
      </Paper>)}
      {pending && <Typography role="status" variant="body2">{t('typing')}</Typography>}<div ref={tail} />
    </Stack>
    {closed && <Alert severity="info">{t('closed')}</Alert>}
    <Stack component="form" direction="row" spacing={1} sx={{p:1.5,borderTop:1,borderColor:'divider'}} onSubmit={e => {e.preventDefault(); void send(draft);}}>
      <TextField fullWidth label={t('message')} value={draft} disabled={disabled} onChange={e => setDraft(e.target.value)} slotProps={{htmlInput:{ maxLength:guest ? 500 : 2000 }}} />
      <Button type="submit" variant="contained" disabled={disabled || !draft.trim()}>{t('send')}</Button>
    </Stack>
  </Paper>;
}
