import type { Page } from '@nless/shared/core/types';
import type { CatalogRowData, ImportRowView, ImportView } from '@nless/shared/features/knowledge-import/types';
import { Alert, Button, LinearProgress, Skeleton, Stack, Typography } from '@mui/material';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { DataTable, EmptyState, formatMoney, PageHeader, SectionCard, StatusChip, useApiMutation, useApiQuery, useCan, useRealtime, useSession } from '../../core';
import MappingForm from './MappingForm';

const busy = (state: string) => ['queued', 'parsing', 'validating', 'extracting', 'committing'].includes(state);

export default function ImportDetailPage() {
  const { importId = '' } = useParams();
  const { currentBusiness } = useSession();
  return <ImportDetail key={currentBusiness?.id + ':' + importId} importId={importId} />;
}

function ImportDetail({ importId }: { importId: string }) {
  const { t } = useTranslation('knowledge-import');
  const path = '/imports/' + encodeURIComponent(importId);
  const canWrite = useCan('product.write');
  const query = useApiQuery<ImportView>(path);
  const { reload } = query;
  const [lastRecord, setLastRecord] = useState<ImportView>();
  useEffect(() => { if (query.data) setLastRecord(query.data); }, [query.data]);
  const record = query.data ?? lastRecord;
  const running = Boolean(record && busy(record.state));
  const [editing, setEditing] = useState(false);
  const cancel = useApiMutation<Record<string, never>, ImportView>('POST', path + '/cancel');

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(reload, 1500);
    return () => window.clearInterval(timer);
  }, [running, reload]);
  const onChange = useCallback((event: { type: string; featureId?: string; data?: unknown }) => {
    if (event.featureId === 'F06' && (event.data as { id?: string } | null)?.id === importId) reload();
  }, [importId, reload]);
  useRealtime('custom', onChange);

  const back = <Button component={Link} to="/imports">{t('actions.back')}</Button>;
  if (query.error) return <><PageHeader title={t('page.title')} actions={back} /><EmptyState title={t('error.load')} action={<Button onClick={reload}>{t('actions.retry')}</Button>} /></>;
  if (!record) return <><PageHeader title={t('page.title')} actions={back} /><Skeleton variant="rounded" height={120} /></>;
  const editingMapping = record.state === 'awaiting_mapping' || (record.state === 'review' && editing);
  const cancelable = ['queued', 'awaiting_mapping', 'review'].includes(record.state);

  return <Stack spacing={2}>
    <PageHeader title={t('detail.title')} description={record.sourceLabel} actions={back} />
    <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
      <StatusChip status={record.state} label={t('state.' + record.state)} />
      {canWrite && cancelable && <Button disabled={cancel.running} onClick={() => {
        void cancel.run({}).then(value => { setLastRecord(value); reload(); }, () => {});
      }}>{t('actions.cancel')}</Button>}
    </Stack>
    {record.duplicate && <Alert severity="warning">{t('review.duplicate', { version: record.duplicate.version })}</Alert>}
    {running && <SectionCard title={t(record.phase ? 'phase.' + record.phase : 'state.' + record.state)}>
      {record.progress && record.progress.total > 0 ?
        <LinearProgress variant="determinate" value={Math.min(100, 100 * record.progress.done / record.progress.total)} /> :
        <LinearProgress />}
    </SectionCard>}
    {editingMapping && (canWrite ?
      <MappingForm key={record.header?.join('|')} record={record} path={path} onValidated={value => { setEditing(false); setLastRecord(value); reload(); }} /> :
      <Alert severity="info">{t('mapping.readOnly')}</Alert>)}
    {record.state === 'review' && !editing && <SectionCard title={t('review.title')}
      actions={canWrite && <Button onClick={() => setEditing(true)}>{t('actions.remap')}</Button>}>
      <Typography sx={{ mb: 1 }}>{t('review.counts', record.counts)}</Typography>
      <PreviewRows record={record} path={path} />
    </SectionCard>}
    {record.state === 'failed' && <Alert severity="error">{t(['error.' + record.error?.code, 'error.generic'])}</Alert>}
    {record.state === 'cancelled' && <Alert severity="info">{t('state.cancelled')}</Alert>}
  </Stack>;
}

function PreviewRows({ record, path }: { record: ImportView; path: string }) {
  const { t } = useTranslation('knowledge-import');
  const [cursor, setCursor] = useState<string | null>(null);
  const rows = useApiQuery<Page<ImportRowView>>(path + '/rows' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''), {
    deps: [record.timings.readyAt],
  });
  return <>
    {rows.error ? <EmptyState title={t('error.load')} action={<Button onClick={rows.reload}>{t('actions.retry')}</Button>} /> : <DataTable
      rows={rows.data?.items ?? []}
      rowKey={item => item.id}
      loading={rows.loading}
      columns={[
        { key: 'rowNo', header: t('review.row') },
        { key: 'status', header: t('list.state'), render: row => <StatusChip status={row.status} label={t('rowStatus.' + row.status)} /> },
        { key: 'item', header: t('review.item'), render: row => {
          if (!row.data) return row.cells?.find(Boolean) ?? '—';
          const data = row.data;
          if ('sku' in data) return data.sku + ' · ' + data.name;
          return 'question' in data ? data.question : data.title;
        } },
        { key: 'value', header: t('review.value'), render: row => {
          if (!row.data) return '—';
          if ('question' in row.data) return row.data.answer;
          if (!('priceMinor' in row.data)) return row.data.body;
          const data: CatalogRowData = row.data;
          const price = formatMoney(data.priceMinor);
          return data.existing ? t('review.priceChange', { old: formatMoney(data.existing.priceMinor), next: price }) : price;
        } },
        { key: 'error', header: t('review.issue'), render: row => row.error ?
          [row.error.column, t(['error.' + row.error.code, 'error.row'])].filter(Boolean).join(' · ') : '—' },
      ]}
    />}
    <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
      {cursor && <Button onClick={() => setCursor(null)}>{t('actions.first')}</Button>}
      {rows.data?.nextCursor && <Button onClick={() => setCursor(rows.data?.nextCursor ?? null)}>{t('actions.next')}</Button>}
    </Stack>
  </>;
}
