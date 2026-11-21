import type { AnalyticsSettings, DashboardData } from '@nless/shared/features/analytics/types';
import { Alert, Box, Button, MenuItem, Skeleton, Stack, TextField, Typography } from '@mui/material';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import type { SlotContribution } from '@nless/shared/core/loader';
import { useTranslation } from 'react-i18next';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { EmptyState, FormDialog, formatDateTime, PageHeader, SectionCard, useApiMutation, useApiQuery, useCan, useSession, useSlot } from '../../core';

const ymdBack = (date: string, days: number) => new Date(Date.parse(date + 'T00:00:00Z') - (days - 1) * 86_400_000).toISOString().slice(0, 10);

export default function DashboardPage() {
  const { currentBusiness } = useSession();
  return <ShopOverview key={currentBusiness?.id} businessId={currentBusiness?.id} />;
}

function ShopOverview({ businessId }: { businessId?: string }) {
  const { t } = useTranslation('analytics');
  const slots = useSlot('dashboardCards');
  const [search, setSearch] = useState('');
  const [range, setRange] = useState({ from: '', to: '' });
  const [editing, setEditing] = useState(false);
  const [minutes, setMinutes] = useState(3);
  const report = useApiQuery<DashboardData>('/analytics/dashboard' + search);
  const canEdit = useCan('business.bot_settings');
  const settings = useApiQuery<AnalyticsSettings>(canEdit ? '/analytics/settings' : null);
  const save = useApiMutation<{ expectedVersion: number; minutesPerConversation: number }, AnalyticsSettings>('PUT', '/analytics/settings');
  const { reload } = report;
  const data = report.data;
  const impact = data?.impact;

  useEffect(() => {
    const timer = window.setInterval(reload, 60_000);
    return () => window.clearInterval(timer);
  }, [reload]);

  function setWindow(from: string, to: string) {
    setRange({ from, to });
    setSearch('?' + new URLSearchParams({ from, to }).toString());
  }
  const rate = (value: number | null) => value === null ? t('unknown') : t('percent', { value: Math.round(value * 10) / 10 });
  const seconds = (value: number | null) => value === null ? t('unknown') : t('seconds', { value: Math.round(value) });
  const cards = (rows: { key: string; value: string | number; detail?: string }[]) => <Box sx={{
    display: 'grid', gridTemplateColumns: { xs: 'repeat(2,minmax(0,1fr))', md: 'repeat(4,minmax(0,1fr))' }, gap: 1.25,
  }}>
    {rows.map(({ key, value, detail }) => <SectionCard title={t('tile.' + key)} key={key}>
      <Typography variant="h5" data-testid={'overview-' + key}>{value}</Typography>
      {detail && <Typography variant="body2" color="text.secondary">{detail}</Typography>}
    </SectionCard>)}
  </Box>;

  return <Stack spacing={2}>
    <PageHeader title={t('dashboard.title')} description={t('scope')} actions={<Button onClick={reload}>{t('refresh')}</Button>} />
    {data && <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
      <TextField select size="small" label={t('range.period')} value=""
        sx={{ minWidth: 145 }}
        onChange={event => setWindow(ymdBack(data.range.to, Number(event.target.value)), data.range.to)}>
        {[1, 7, 30].map(value => <MenuItem key={value} value={value}>{t('range.days' + value)}</MenuItem>)}
      </TextField>
      <TextField size="small" type="date" label={t('range.from')} value={range.from || data.range.from}
        slotProps={{ inputLabel: { shrink: true } }} onChange={event => setRange({ ...range, from: event.target.value })} />
      <TextField size="small" type="date" label={t('range.to')} value={range.to || data.range.to}
        slotProps={{ inputLabel: { shrink: true } }} onChange={event => setRange({ ...range, to: event.target.value })} />
      <Button onClick={() => setWindow(range.from || data.range.from, range.to || data.range.to)}>{t('range.apply')}</Button>
    </Stack>}
    {report.loading && <Skeleton variant="rounded" height={240} aria-label={t('loading')} />}
    {report.error && <EmptyState title={t('error')} action={<Button onClick={() => { setRange({ from: '', to: '' }); setSearch(''); reload(); }}>{t('retry')}</Button>} />}
    {data && impact && <>
      <Typography variant="body2" data-testid="overview-period">{t('range.scope', { ...data.range })}</Typography>
      <SectionCard title={t('results')} actions={settings.data && canEdit && <Button onClick={() => {
        setMinutes(settings.data!.minutesPerConversation); setEditing(true);
      }}>{t('estimate.edit')}</Button>}>
        {cards([
          { key: 'active', value: impact.activeConversations },
          { key: 'autoResolved', value: rate(impact.autoResolved.pct), detail: t('definitions.auto', { count: impact.autoResolved.count }) },
          { key: 'handoff', value: rate(impact.handoff.ratePct), detail: t('definitions.handoff', { count: impact.handoff.count }) },
          { key: 'firstResponse', value: seconds(impact.firstResponse.all.medianSeconds),
            detail: t('definitions.response', { ai: seconds(impact.firstResponse.ai.medianSeconds), staff: seconds(impact.firstResponse.staff.medianSeconds), unanswered: impact.firstResponse.unanswered }) },
          { key: 'orders', value: t('unavailable') },
          { key: 'followUps', value: t('unavailable') },
          { key: 'aiCost', value: impact.aiCost.perAutoResolvedUsdMicros === null ? t('unknown')
            : t('cost', { value: (impact.aiCost.perAutoResolvedUsdMicros / 1_000_000).toFixed(6) }), detail: t('definitions.cost') },
          { key: 'timeSaved', value: impact.staffMinutesSaved.minutes === null ? t('unknown') : t('minutes', { value: impact.staffMinutesSaved.minutes }),
            detail: t('estimate.assumption', { minutes: impact.staffMinutesSaved.minutesPerConversation }) },
        ])}
      </SectionCard>
      <SectionCard title={t('activity')}>
        {cards([
          { key: 'customersActive', value: data.conversations.customersActive },
          { key: 'newCustomers', value: data.conversations.newCustomers },
          { key: 'customerMessages', value: data.messages.customer },
          { key: 'aiReplies', value: data.messages.ai },
          { key: 'staffMessages', value: data.messages.staff },
          { key: 'open', value: data.now.openConversations },
          { key: 'waiting', value: data.now.waitingForStaff },
          { key: 'staffTouched', value: impact.staffTouched },
        ])}
      </SectionCard>
      <SectionCard title={t('daily')}>
        {data.daily.some(day => day.customerMessages + day.aiReplies + day.staffMessages > 0) ?
          <ResponsiveContainer width="100%" height={240} minWidth={0}>
            <AreaChart data={data.daily}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" minTickGap={24} tickFormatter={date => formatDateTime(date + 'T00:00:00Z', { dateOnly: true })} />
              <YAxis allowDecimals={false} />
              <Tooltip labelFormatter={date => formatDateTime(date + 'T00:00:00Z', { dateOnly: true })} />
              <Area type="monotone" name={t('tile.customerMessages')} dataKey="customerMessages" stroke="#25736d" fill="#81c2b9" />
              <Area type="monotone" name={t('tile.aiReplies')} dataKey="aiReplies" stroke="#8d5b20" fill="#ecd2a3" />
            </AreaChart>
          </ResponsiveContainer> : <EmptyState title={t('empty')} />}
      </SectionCard>
    </>}
    {data && businessId && slots.map(slot => <OverviewSlot key={slot.id} slot={slot} businessId={businessId} />)}
    {editing && settings.data && <FormDialog open title={t('estimate.edit')} submitting={save.running} onClose={() => setEditing(false)}
      onSubmit={async () => {
        if (!Number.isInteger(minutes) || minutes < 1 || minutes > 60) return;
        await save.run({ expectedVersion: settings.data!.version, minutesPerConversation: minutes });
        setEditing(false);
        settings.reload();
        reload();
      }}>
      <Alert severity="info">{t('estimate.assumption', { minutes })}</Alert>
      <TextField required type="number" label={t('estimate.input')} value={minutes} onChange={event => setMinutes(Number(event.target.value))}
        slotProps={{ htmlInput: { min: 1, max: 60, step: 1 } }} error={!Number.isInteger(minutes) || minutes < 1 || minutes > 60} />
    </FormDialog>}
  </Stack>;
}

function OverviewSlot({ slot, businessId }: { slot: SlotContribution; businessId: string }) {
  const Card = useMemo(() => lazy(slot.load), [slot.load]);
  return <Suspense fallback={<Skeleton variant="rounded" height={100} />}><Card businessId={businessId} /></Suspense>;
}
