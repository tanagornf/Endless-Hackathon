import type { Page } from '@nless/shared/core/types';
import type { CatalogRowData, ImportRowStatus, ImportRowView, ImportView } from '@nless/shared/features/knowledge-import/types';
import { Alert, Button, LinearProgress, MenuItem, Skeleton, Stack, TextField, Typography } from '@mui/material';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { DataTable, EmptyState, formatMoney, PageHeader, SectionCard, StatusChip, useApiMutation, useApiQuery, useCan, useRealtime, useSession } from '../../core';
import MappingForm from './MappingForm';
import EditRowActions from './EditRowActions';
import ReviewActions, { ErrorDownload } from './ReviewActions';

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
    {record.warnings.map(warning => <Alert severity="warning" key={warning.code}>
      {t(['warning.' + warning.code, 'warning.generic'], { n: warning.detail })}
    </Alert>)}
    {running && <SectionCard title={t(record.phase ? 'phase.' + record.phase : 'state.' + record.state)}>
      {record.progress && record.progress.total > 0 ?
        <LinearProgress variant="determinate" value={Math.min(100, 100 * record.progress.done / record.progress.total)} /> :
        <LinearProgress />}
    </SectionCard>}
    {editingMapping && (canWrite ?
      <MappingForm key={record.header?.join('|')} record={record} path={path} onValidated={value => { setEditing(false); setLastRecord(value); reload(); }} /> :
      <Alert severity="info">{t('mapping.readOnly')}</Alert>)}
    {record.state === 'review' && !editing && <SectionCard title={t('review.title')}
      actions={canWrite && record.kind === 'csv' && <Button onClick={() => setEditing(true)}>{t('actions.remap')}</Button>}>
      <Typography sx={{ mb: 1 }}>{t('review.counts', record.counts)}</Typography>
      <PreviewRows record={record} path={path} canWrite={canWrite} onChange={reload} />
      <ReviewActions record={record} path={path} canWrite={canWrite}
        onCommit={value => { setLastRecord(value); reload(); }} />
    </SectionCard>}
    {record.state === 'done' && <SectionCard title={t('done.title')}>
      {record.counts.written + record.counts.updated === 0 && record.counts.error > 0 && <Alert severity="error">{t('done.none')}</Alert>}
      <Typography>{t('done.counts', record.counts)}</Typography>
      <Typography sx={{ display: 'block', mt: 1 }}>{t('done.draftNote')}</Typography>
      <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
        <Button component={Link} to={record.target === 'catalog' ? '/catalog' : '/knowledge'}>
          {t(record.target === 'catalog' ? 'done.reviewCatalog' : 'done.reviewKnowledge')}
        </Button>
        {record.counts.error > 0 && <ErrorDownload path={path} />}
      </Stack>
      <PreviewRows record={record} path={path} canWrite={false} onChange={reload} />
    </SectionCard>}
    {record.state === 'failed' && <Alert severity="error">{t(['error.' + record.error?.code, 'error.generic'])}</Alert>}
    {record.state === 'cancelled' && <Alert severity="info">{t('state.cancelled')}</Alert>}
  </Stack>;
}

function PreviewRows({ record, path, canWrite, onChange }: {
  record: ImportView; path: string; canWrite: boolean; onChange: () => void;
}) {
  const { t } = useTranslation('knowledge-import');
  const [cursor, setCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<ImportRowStatus | ''>('');
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  if (status) params.set('status', status);
  const rows = useApiQuery<Page<ImportRowView>>(path + '/rows?' + params.toString(), { deps: [record.timings.readyAt] });
  const statuses = ['ready', 'error', 'excluded', 'written', 'updated', 'skipped'] as const;
  return <>
    <TextField select size="small" sx={{ my: 1, minWidth: 155 }} label={t('review.filter')} value={status}
      onChange={event => { setStatus(event.target.value as ImportRowStatus | ''); setCursor(null); }}>
      <MenuItem value="">{t('review.all')}</MenuItem>
      {statuses.map(value => <MenuItem key={value} value={value}>{t('rowStatus.' + value)}</MenuItem>)}
    </TextField>
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
          if ('question' in row.data) return <Typography sx={{ maxWidth: 320, whiteSpace: 'normal' }}>{row.data.answer}</Typography>;
          if (!('priceMinor' in row.data)) return <Typography sx={{ maxWidth: 320, whiteSpace: 'pre-wrap' }}>{row.data.body}</Typography>;
          const data: CatalogRowData = row.data;
          const price = formatMoney(data.priceMinor);
          return data.existing ? t('review.priceChange', { old: formatMoney(data.existing.priceMinor), next: price }) : price;
        } },
        { key: 'error', header: t('review.issue'), render: row => {
          const warning = row.warnings.filter(item => item.code !== 'price_will_change')
            .map(item => t(['warning.' + item.code, 'warning.generic']));
          return [row.error?.column, row.error ? t(['error.' + row.error.code, 'error.row']) : null, ...warning]
            .filter(Boolean).join(' · ') || '—';
        } },
        ...(canWrite ? [{ key: 'actions', header: t('review.actions'), render: (row: ImportRowView) =>
          <EditRowActions row={row} path={path} reload={() => { rows.reload(); onChange(); }} /> }] : []),
      ]}
    />}
    <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
      {cursor && <Button onClick={() => setCursor(null)}>{t('actions.first')}</Button>}
      {rows.data?.nextCursor && <Button onClick={() => setCursor(rows.data?.nextCursor ?? null)}>{t('actions.next')}</Button>}
    </Stack>
  </>;
}
