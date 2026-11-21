import { Alert, Box, Button, Link, MenuItem, Skeleton, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import type { ApiFailure, Page } from '@nless/shared/core/types';
import type { AiIntent, AiTurnMetrics, AiTurnStateName, AiTurnSummary, AiTurnTrace } from '@nless/shared/features/ai-agent/types';
import { DataTable, EmptyState, PageHeader, SectionCard, StatusChip, formatDateTime, useApiQuery, useRealtime, useSession } from '../../core';

const states: AiTurnStateName[] = ['running', 'completed', 'awaiting_confirmation', 'handoff', 'failed', 'skipped', 'superseded'];
const intents: AiIntent[] = ['GREETING', 'GOODBYE', 'QUESTION', 'REQUEST', 'STATUS_CHECK', 'FEEDBACK', 'CLARIFICATION',
  'ESCALATION', 'OFF_TOPIC', 'PRICE_CALC', 'PRODUCT_FILTER', 'BUSINESS_HOURS', 'BOOKING_AVAILABILITY', 'UNKNOWN'];

function ChatLink({ conversationId }: { conversationId: string }) {
  const { t } = useTranslation('ai-agent');
  return <Link component={RouterLink} to={'/chat?c=' + encodeURIComponent(conversationId)} onClick={(event) => event.stopPropagation()}>
    {t('page.openChat')}
  </Link>;
}

function QueryError({ error, reload, inline = false }: { error: ApiFailure; reload: () => void; inline?: boolean }) {
  const { t } = useTranslation('ai-agent');
  const message = t('common:errors.' + error.error.code, { defaultValue: t('page.error') });
  const retry = <Button onClick={reload}>{t('common:actions.retry')}</Button>;
  return inline ? <Alert severity="error" action={retry}>{message}</Alert> : <EmptyState title={message} action={retry} />;
}

function TurnMetrics() {
  const { t, i18n } = useTranslation('ai-agent');
  const query = useApiQuery<AiTurnMetrics>('/ai/metrics');
  useRealtime('custom', (event) => { if (event.featureId === 'F10' && event.name === 'ai.turn') query.reload(); });
  const values = query.data;
  const numbers = new Intl.NumberFormat(i18n.resolvedLanguage ?? i18n.language);
  const seconds = new Intl.NumberFormat(i18n.resolvedLanguage ?? i18n.language, { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const metrics = values && [
    ['state.completed', numbers.format(values.completed)],
    ['state.awaiting_confirmation', numbers.format(values.awaitingConfirmation)],
    ['state.handoff', numbers.format(values.handoff)],
    ['state.failed', numbers.format(values.failed)],
    ['metrics.median', values.medianLatencyMs === null ? t('page.none') : t('metrics.seconds', { value: seconds.format(values.medianLatencyMs / 1000) })],
  ];
  return <SectionCard title={t('metrics.title')}>
    {query.error ? <QueryError error={query.error} reload={query.reload} /> :
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: 2 }}>
        {metrics ? metrics.map(([label, value]) => <Box key={label}>
          <Typography variant="body2" color="text.secondary">{t(label)}</Typography>
          <Typography variant="h5">{value}</Typography>
        </Box>) : Array.from({ length: 5 }, (_, index) => <Skeleton key={index} height={55} />)}
      </Box>}
  </SectionCard>;
}

function TurnList({ state, intent, select }: { state: string; intent: string; select: (row: AiTurnSummary) => void }) {
  const { t } = useTranslation('ai-agent');
  const filters = new URLSearchParams();
  if (state) filters.set('state', state);
  if (intent) filters.set('intent', intent);
  const [cursor, setCursor] = useState<string | null>(null);
  const [extra, setExtra] = useState<Page<AiTurnSummary> | null>(null);
  const first = useApiQuery<Page<AiTurnSummary>>('/ai/turns?' + filters.toString());
  if (cursor) filters.set('cursor', cursor);
  const more = useApiQuery<Page<AiTurnSummary>>(cursor ? '/ai/turns?' + filters.toString() : null);
  const page = more.data;
  useEffect(() => {
    if (!cursor || !page) return;
    setExtra((previous) => ({ items: [...(previous?.items ?? []), ...page.items], nextCursor: page.nextCursor }));
  }, [page]);
  useRealtime('custom', (event) => {
    if (event.featureId !== 'F10' || event.name !== 'ai.turn') return;
    setExtra(null);
    setCursor(null);
    first.reload();
  });
  const items = [...(first.data?.items ?? []), ...(extra?.items ?? [])];
  const nextCursor = extra ? extra.nextCursor : first.data?.nextCursor;
  if (first.error) return <QueryError error={first.error} reload={first.reload} />;
  return <Stack spacing={2}>
    <DataTable rows={items} rowKey={(row) => row.turnId} loading={first.loading || !first.data} onRowClick={select}
      empty={<EmptyState title={t('list.empty')} description={t('list.emptyHint')} />} columns={[
        { key: 'startedAt', header: t('list.time'), render: (row) => formatDateTime(row.startedAt) },
        { key: 'conversationId', header: t('list.chat'), render: (row) => <ChatLink conversationId={row.conversationId} /> },
        { key: 'intent', header: t('list.intent'), render: (row) => row.intent ? t('intent.' + row.intent, { defaultValue: row.intent }) : t('page.none') },
        { key: 'state', header: t('list.state'), render: (row) => <StatusChip status={row.state} label={t('state.' + row.state)} /> },
        { key: 'replyLanguage', header: t('list.language'), render: (row) => row.replyLanguage ? t('language.' + row.replyLanguage) : t('page.none') },
        { key: 'toolCount', header: t('list.tools'), align: 'right' },
        { key: 'evidenceCount', header: t('list.evidence'), align: 'right' },
        { key: 'guardCount', header: t('list.guards'), align: 'right' },
        { key: 'latencyMs', header: t('list.ms'), align: 'right' },
      ]} />
    {more.error && <QueryError error={more.error} reload={more.reload} inline />}
    {nextCursor && !more.error && <Button sx={{ alignSelf: 'center' }} disabled={more.loading || nextCursor === cursor}
      onClick={() => setCursor(nextCursor)}>{t('list.more')}</Button>}
  </Stack>;
}

function TurnDetail({ turnId }: { turnId: string }) {
  const { t, i18n } = useTranslation('ai-agent');
  const query = useApiQuery<AiTurnTrace>('/ai/turns/' + turnId);
  useRealtime('custom', (event) => {
    if (event.featureId === 'F10' && event.name === 'ai.turn' && event.data.turnId === turnId) query.reload();
  });
  const turn = query.data;
  const none = t('page.none');
  const usd = new Intl.NumberFormat(i18n.resolvedLanguage ?? i18n.language, {
    style: 'currency', currency: 'USD', maximumFractionDigits: 6,
  });
  const cost = turn?.usage?.costUsdMicros;
  return <SectionCard title={t('detail.title')} actions={turn && <ChatLink conversationId={turn.conversationId} />}>
    {query.error ? <QueryError error={query.error} reload={query.reload} /> : !turn ? <Skeleton height={100} /> : <Stack spacing={2}>
      <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(120px, auto) 1fr' }, gap: 1, m: 0 }}>
        {[
          ['list.state', <StatusChip status={turn.state} label={t('state.' + turn.state)} />],
          ['detail.skip', turn.skipReason ? t('skip.' + turn.skipReason, { defaultValue: turn.skipReason }) : none],
          ['list.intent', turn.intent ? t('intent.' + turn.intent, { defaultValue: turn.intent }) : none],
          ['detail.source', turn.intentSource ? t('source.' + turn.intentSource) : none],
          ['detail.confidence', turn.intentConfidence ?? none],
          ['list.language', turn.replyLanguage ? t('language.' + turn.replyLanguage) : none],
          ['detail.evidence', turn.evidenceIds.join(', ') || none],
          ['detail.products', turn.productRefs.map((product) => product.sku + ' · ' + product.name).join(', ') || none],
          ['detail.inputTokens', turn.usage?.inputTokens ?? none],
          ['detail.outputTokens', turn.usage?.outputTokens ?? none],
          ['detail.cachedTokens', turn.usage?.cachedTokens ?? none],
          ['detail.cost', typeof cost === 'number' ? usd.format(cost / 1e6) : t('detail.unknown')],
          ['detail.attempts', turn.attempts],
          ['detail.error', turn.errorCode ?? none],
        ].map(([label, value]) => <Box key={String(label)} sx={{ display: 'contents' }}>
          <Typography component="dt" variant="body2" color="text.secondary">{t(String(label))}</Typography>
          <Typography component="dd" variant="body2" sx={{ m: 0, overflowWrap: 'anywhere' }}>{value}</Typography>
        </Box>)}
      </Box>
      <Typography variant="subtitle2">{t('list.tools')}</Typography>
      <DataTable rows={turn.tools.map((tool, index) => ({ ...tool, index }))} rowKey={(tool) => String(tool.index)}
        empty={none} columns={[
          { key: 'name', header: t('detail.name') },
          { key: 'ok', header: t('detail.result'), render: (tool) => tool.ok ? t('detail.ok') : tool.error ?? t('detail.toolFailed') },
          { key: 'ms', header: t('list.ms'), align: 'right' },
        ]} />
      <Typography variant="subtitle2">{t('list.guards')}</Typography>
      <DataTable rows={turn.guardActions.map((action, index) => ({ ...action, index }))} rowKey={(action) => String(action.index)}
        empty={none} columns={[
          { key: 'guard', header: t('detail.guard') },
          { key: 'action', header: t('detail.action'), render: ({ action }) => t('action.' + action) },
          { key: 'detail', header: t('detail.description') },
        ]} />
      <Typography variant="subtitle2">{t('detail.timing')}</Typography>
      <DataTable rows={Object.entries(turn.timings).map(([step, ms]) => ({ step, ms: Array.isArray(ms) ? ms.join(', ') : ms }))}
        rowKey={(row) => row.step} empty={none} columns={[
          { key: 'step', header: t('detail.name'), render: ({ step }) => t('timing.' + step, { defaultValue: step }) },
          { key: 'ms', header: t('list.ms'), align: 'right' },
        ]} />
    </Stack>}
  </SectionCard>;
}

function ShopAiTurns() {
  const { t } = useTranslation('ai-agent');
  const [state, setState] = useState('');
  const [intent, setIntent] = useState('');
  const [turnId, setTurnId] = useState<string | null>(null);
  const filterKey = state + '/' + intent;
  return <Stack spacing={2}>
    <PageHeader title={t('page.title')} description={t('page.description')} />
    <TurnMetrics />
    <SectionCard title={t('list.title')}>
      <Stack spacing={2}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField select label={t('list.state')} value={state} size="small" sx={{ minWidth: 180 }}
            onChange={(event) => { setState(event.target.value); setTurnId(null); }}>
            <MenuItem value="">{t('list.allStates')}</MenuItem>
            {states.map((value) => <MenuItem key={value} value={value}>{t('state.' + value)}</MenuItem>)}
          </TextField>
          <TextField select label={t('list.intent')} value={intent} size="small" sx={{ minWidth: 180 }}
            onChange={(event) => { setIntent(event.target.value); setTurnId(null); }}>
            <MenuItem value="">{t('list.allIntents')}</MenuItem>
            {intents.map((value) => <MenuItem key={value} value={value}>{t('intent.' + value)}</MenuItem>)}
          </TextField>
        </Stack>
        <TurnList key={filterKey} state={state} intent={intent} select={(row) => setTurnId(row.turnId)} />
      </Stack>
    </SectionCard>
    {turnId && <TurnDetail key={turnId} turnId={turnId} />}
  </Stack>;
}

export default function AiTurnsPage() {
  const { currentBusiness } = useSession();
  return currentBusiness ? <ShopAiTurns key={currentBusiness.id} /> : null;
}
