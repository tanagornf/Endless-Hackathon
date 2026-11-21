import type { Page } from '@nless/shared/core/types';
import type { ImportView } from '@nless/shared/features/knowledge-import/types';
import UploadFileOutlined from '@mui/icons-material/UploadFileOutlined';
import { Button, Stack, Typography } from '@mui/material';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api, DataTable, EmptyState, FormDialog, formatDateTime, PageHeader, StatusChip, useApiQuery, useCan, useSession } from '../../core';

export default function ImportsPage() {
  const { currentBusiness } = useSession();
  return <ImportHistory key={currentBusiness?.id} />;
}

function ImportHistory() {
  const { t } = useTranslation('knowledge-import');
  const canWrite = useCan('product.write');
  const navigate = useNavigate();
  const [cursor, setCursor] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = useApiQuery<Page<ImportView>>('/imports' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''));

  function close() {
    setOpen(false);
    setFile(null);
    setError(null);
  }

  async function upload() {
    if (running) return;
    if (!file) { setError(t('file.required')); return; }
    setRunning(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const result = await api.upload<ImportView>(api.biz('/imports/file'), form);
      close();
      navigate('/imports/' + result.id);
    } catch (cause) {
      const reason = (cause as { details?: { reason?: string } }).details?.reason;
      setError(t([reason ? 'error.' + reason : 'error.upload', 'error.upload']));
    } finally { setRunning(false); }
  }

  const newButton = <Button variant="contained" startIcon={<UploadFileOutlined />} onClick={() => setOpen(true)}>{t('actions.new')}</Button>;
  return <>
    <PageHeader title={t('page.title')} description={t('page.subtitle')} actions={canWrite && newButton} />
    {list.error ? <EmptyState title={t('error.load')} action={<Button onClick={list.reload}>{t('actions.retry')}</Button>} /> :
      <DataTable
        rows={list.data?.items ?? []}
        rowKey={item => item.id}
        loading={list.loading}
        onRowClick={item => navigate('/imports/' + item.id)}
        empty={<EmptyState title={t('empty.title')} description={t('empty.description')} />}
        columns={[
          { key: 'sourceLabel', header: t('list.source') },
          { key: 'createdAt', header: t('list.when'), render: item => formatDateTime(item.createdAt) },
          { key: 'state', header: t('list.state'), render: item => <StatusChip status={item.state} label={t('state.' + item.state)} /> },
          { key: 'result', header: t('list.result'), render: item => t('list.counts', item.counts) },
        ]}
      />}
    <Stack direction="row" spacing={1} sx={{ my: 1 }}>
      {cursor && <Button onClick={() => setCursor(null)}>{t('actions.first')}</Button>}
      {list.data?.nextCursor && <Button onClick={() => setCursor(list.data?.nextCursor ?? null)}>{t('actions.next')}</Button>}
    </Stack>
    {canWrite && <FormDialog open={open} title={t('actions.new')} submitLabel={t('actions.upload')} submitting={running} onSubmit={upload} onClose={close} error={error}>
      <Typography variant="body2">{t('file.limits')}</Typography>
      <Button component="label" variant="outlined">
        {t('file.choose')}
        <input type="file" accept=".csv,.tsv" data-testid="import-file" aria-label={t('file.choose')}
          style={{ width: 1, height: 1, position: 'absolute', opacity: 0 }}
          onChange={event => { setFile(event.currentTarget.files?.[0] ?? null); setError(null); }} />
      </Button>
      {file && <Typography sx={{ overflowWrap: 'anywhere' }}>{file.name}</Typography>}
    </FormDialog>}
  </>;
}
