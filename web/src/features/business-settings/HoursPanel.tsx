import { useState } from 'react';
import { Button, FormControlLabel, Skeleton, Stack, Switch, TextField, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { Weekday, WeeklyHours } from '@nless/shared/core/types';
import { BUSINESS_WEEKDAYS } from '@nless/shared/features/business-settings/types';
import type { BusinessClosure, BusinessOpenState, SettingsView } from '@nless/shared/features/business-settings/types';
import {
  ConfirmDialog, DataTable, EmptyState, FormDialog, SectionCard, StatusChip, formatDateTime,
  useApiMutation, useApiQuery, useCan, useRealtime, useToast,
} from '../../core';
import type { DataTableColumn } from '../../core';
import { apiFailure, issueAt } from './settings-errors';

type HoursDraft = { hours: WeeklyHours; expectedVersion: number };
type ClosureDraft = Pick<BusinessClosure, 'startDate' | 'endDate' | 'reason'>;
const standardHours = { open: '09:00', close: '18:00' };
const emptyClosure: ClosureDraft = { startDate: '', endDate: '', reason: '' };

function Retry({ reload }: { reload: () => void }) {
  const { t } = useTranslation('business-settings');
  return <EmptyState title={t('settings.error')} action={<Button onClick={reload}>{t('settings.retry')}</Button>} />;
}

export default function HoursPanel() {
  const { t } = useTranslation('business-settings');
  const canEdit = useCan('business.update');
  const toast = useToast();
  const settings = useApiQuery<SettingsView>('/settings');
  const openState = useApiQuery<BusinessOpenState>('/settings/open-state');
  const closures = useApiQuery<{ items: BusinessClosure[] }>('/settings/closures');
  const update = useApiMutation<HoursDraft, SettingsView>('PUT', '/settings/hours', { toastOnError: false });
  const create = useApiMutation<ClosureDraft, BusinessClosure>('POST', '/settings/closures');
  const remove = useApiMutation<string, void>('DELETE', (id) => '/settings/closures/' + id);
  const [draft, setDraft] = useState<HoursDraft | null>(null);
  const [closureForm, setClosureForm] = useState<ClosureDraft | null>(null);
  const [deleting, setDeleting] = useState<BusinessClosure | null>(null);
  const saved = settings.data?.settings;
  const hours = draft?.hours ?? saved?.hours;

  function reload() {
    settings.reload();
    openState.reload();
    closures.reload();
  }

  useRealtime('custom', (event) => {
    if (event.featureId === 'F04' && event.name === 'business-settings.changed') reload();
  });

  function editHours(change: (current: WeeklyHours) => WeeklyHours) {
    if (!saved && !draft) return;
    setDraft((previous) => {
      const current = previous ?? (saved && { hours: saved.hours, expectedVersion: saved.version });
      if (!current) return null;
      return { ...current, hours: change(current.hours) };
    });
  }

  function setDay(day: Weekday, intervals: WeeklyHours[Weekday]) {
    editHours((current) => ({ ...current, [day]: intervals }));
  }

  async function saveHours() {
    if (!draft) return;
    try {
      await update.run(draft);
      setDraft(null);
      toast.success(t('settings.saved'));
      reload();
    } catch (error) {
      const failure = apiFailure(error);
      if (failure?.error.code === 'VERSION_CONFLICT') {
        setDraft(null);
        toast.error(t('settings.conflict'));
        reload();
      } else {
        toast.error(failure ?? t('settings.error'));
      }
    }
  }

  const hourColumns: DataTableColumn<{ day: Weekday }>[] = [
    { key: 'day', header: t('hours.dayLabel'), render: ({ day }) => t('hours.day.' + day) },
    { key: 'intervals', header: t('hours.timeLabel'), render: ({ day }) => {
      const intervals = hours?.[day] ?? [];
      return (
        <Stack spacing={1}>
          <FormControlLabel
            label={t(intervals.length ? 'hours.dayOpen' : 'hours.dayClosed')}
            control={<Switch checked={Boolean(intervals.length)} disabled={!canEdit || update.running}
              onChange={(_, checked) => setDay(day, checked ? [{ ...standardHours }] : [])} />}
          />
          {intervals.map((interval, index) => {
            const issue = issueAt(update.error, 'hours.' + day + '.' + index);
            return (
              <Stack key={index} spacing={0.5}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  {(['open', 'close'] as const).map((key) => (
                    <TextField key={key} label={t('hours.' + key)} type="time" size="small" value={interval[key]}
                      slotProps={{ inputLabel: { shrink: true } }} error={Boolean(issue)} disabled={!canEdit || update.running}
                      onChange={(event) => setDay(day, intervals.map((value, position) =>
                        position === index ? { ...value, [key]: event.target.value } : value))} />
                  ))}
                  <Button color="error" disabled={!canEdit || update.running}
                    onClick={() => setDay(day, intervals.filter((_, position) => position !== index))}>
                    {t('common:actions.delete')}
                  </Button>
                </Stack>
                {issue && <Typography color="error" variant="caption">
                  {t('hours.issue.' + issue, { defaultValue: t('settings.invalid') })}
                </Typography>}
              </Stack>
            );
          })}
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
            {intervals.length > 0 && <Button disabled={!canEdit || update.running || intervals.length >= 4}
              onClick={() => setDay(day, [...intervals, { open: '', close: '' }])}>{t('hours.addInterval')}</Button>}
            <Button disabled={!canEdit || update.running} onClick={() => editHours(() => Object.fromEntries(
              BUSINESS_WEEKDAYS.map((weekday) => [weekday, intervals.map((interval) => ({ ...interval }))]),
            ) as WeeklyHours)}>{t('hours.copyAll')}</Button>
          </Stack>
        </Stack>
      );
    } },
  ];
  const closureColumns: DataTableColumn<BusinessClosure>[] = [
    { key: 'startDate', header: t('closures.start') },
    { key: 'endDate', header: t('closures.end') },
    { key: 'reason', header: t('closures.reason') },
    { key: 'actions', header: t('settings.actions'), render: (closure) => (
      <Button color="error" disabled={!canEdit || remove.running} onClick={() => setDeleting(closure)}>
        {t('common:actions.delete')}
      </Button>
    ) },
  ];
  const open = openState.data;

  return (
    <Stack spacing={2}>
      <SectionCard title={t('hours.status')}>
        {openState.error ? <Retry reload={openState.reload} /> : open ? (
          <Stack spacing={1} sx={{ alignItems: 'flex-start' }}>
            <StatusChip status={open.open ? 'active' : 'inactive'} label={t(open.open ? 'hours.openNow' : 'hours.closedNow')} />
            {!open.open && <Typography variant="body2">{t('hours.reason.' + open.reason)}</Typography>}
            {!open.open && <Typography color="text.secondary" variant="body2">
              {open.nextOpenAt ? t(open.timezone === 'Asia/Bangkok' ? 'hours.nextOpen' : 'hours.nextOpenBangkok', { when: formatDateTime(open.nextOpenAt) }) : t('hours.noNextOpen')}
            </Typography>}
          </Stack>
        ) : <Skeleton height={60} />}
      </SectionCard>
      <SectionCard title={t('hours.title')} actions={(
        <Button variant="contained" disabled={!canEdit || !draft || update.running || settings.loading}
          onClick={() => void saveHours()}>{t('common:actions.save')}</Button>
      )}>
        {!canEdit && <Typography color="text.secondary">{t('settings.readOnly')}</Typography>}
        {settings.error ? <Retry reload={settings.reload} /> : (
          <DataTable columns={hourColumns} rows={hours ? BUSINESS_WEEKDAYS.map((day) => ({ day })) : []} rowKey={({ day }) => day}
            loading={!hours || settings.loading} />
        )}
      </SectionCard>
      <SectionCard title={t('closures.title')} actions={(
        <Button variant="outlined" disabled={!canEdit || create.running} onClick={() => setClosureForm(emptyClosure)}>
          {t('closures.add')}
        </Button>
      )}>
        {closures.error ? <Retry reload={closures.reload} /> : (
          <DataTable columns={closureColumns} rows={closures.data?.items ?? []} rowKey={({ id }) => id}
            loading={closures.loading || !closures.data} empty={<EmptyState title={t('closures.empty')} />} />
        )}
      </SectionCard>
      {closureForm && (
        <FormDialog open title={t('closures.add')} submitting={create.running}
          onClose={() => setClosureForm(null)} onSubmit={async () => {
            await create.run(closureForm);
            setClosureForm(null);
            toast.success(t('settings.saved'));
            reload();
          }}>
          {(['startDate', 'endDate'] as const).map((key) => {
            const issue = issueAt(create.error, key);
            return <TextField key={key} label={t(key === 'startDate' ? 'closures.start' : 'closures.end')} type="date"
              slotProps={{ inputLabel: { shrink: true } }} value={closureForm[key]} required
              error={Boolean(issue)} helperText={issue && t('closures.issue.' + issue, { defaultValue: t('settings.invalid') })}
              onChange={(event) => setClosureForm({ ...closureForm, [key]: event.target.value })} />;
          })}
          <TextField label={t('closures.reason')} value={closureForm.reason}
            onChange={(event) => setClosureForm({ ...closureForm, reason: event.target.value })} />
        </FormDialog>
      )}
      <ConfirmDialog open={Boolean(deleting)} title={t('closures.deleteTitle')} message={deleting?.reason ?? ''}
        danger onClose={() => setDeleting(null)} onConfirm={async () => {
          if (!deleting) return;
          await remove.run(deleting.id);
          toast.success(t('settings.saved'));
          reload();
        }} />
    </Stack>
  );
}
