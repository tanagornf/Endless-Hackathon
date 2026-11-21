import type { Page } from '@nless/shared/core/types';
import type { ImportOptions, ImportView } from '@nless/shared/features/knowledge-import/types';
import UploadFileOutlined from '@mui/icons-material/UploadFileOutlined';
import { Button, MenuItem, Stack, Tab, Tabs, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api, DataTable, EmptyState, FormDialog, formatDateTime, PageHeader, StatusChip, useApiMutation, useApiQuery, useCan, useSession } from '../../core';

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
  const [tab, setTab] = useState<'file' | 'text'>('file');
  const [label, setLabel] = useState('');
  const [text, setText] = useState('');
  const [folderName, setFolder] = useState('');
  const [mode, setMode] = useState<ImportOptions['mode']>('extract_faq');
  const textMutation = useApiMutation<{ label?: string; text: string; options: Partial<ImportOptions> }, ImportView>('POST', '/imports/text', { toastOnError: false });
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = useApiQuery<Page<ImportView>>('/imports' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''));

  const isTextFile = file && /\.(txt|md)$/iu.test(file.name);
  const showTextOptions = tab === 'text' || isTextFile;
  function close() {
    setOpen(false);
    setFile(null);
    setText('');
    setLabel('');
    setFolder('');
    setTab('file');
    setMode('extract_faq');
    setError(null);
  }

  async function upload() {
    if (running) return;
    if (tab === 'file' && !file) { setError(t('file.required')); return; }
    if (tab === 'text' && (text.trim().length < 20 || text.length > 200_000)) { setError(t('text.length')); return; }
    setRunning(true);
    setError(null);
    try {
      const options: Partial<ImportOptions> = { mode, ...(folderName.trim() ? { folderName: folderName.trim() } : {}) };
      let result: ImportView;
      if (tab === 'text') {
        result = await textMutation.run({ text, options, ...(label.trim() ? { label: label.trim() } : {}) });
      } else {
        const form = new FormData();
        form.append('file', file!);
        form.append('options', JSON.stringify(options));
        result = await api.upload<ImportView>(api.biz('/imports/file'), form);
      }
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
      <Tabs value={tab} onChange={(_, next: 'file' | 'text') => { setTab(next); setError(null); }} aria-label={t('actions.new')}>
        <Tab value="file" label={t('tab.file')} />
        <Tab value="text" label={t('tab.text')} />
      </Tabs>
      {tab === 'file' ? <>
        <Typography variant="body2">{t('file.limits')}</Typography>
        <Button component="label" variant="outlined">
          {t('file.choose')}
          <input type="file" accept=".csv,.tsv,.txt,.md" data-testid="import-file" aria-label={t('file.choose')}
            style={{ width: 1, height: 1, position: 'absolute', opacity: 0 }}
            onChange={event => { setFile(event.currentTarget.files?.[0] ?? null); setError(null); }} />
        </Button>
        {file && <Typography sx={{ overflowWrap: 'anywhere' }}>{file.name}</Typography>}
      </> : <>
        <TextField label={t('text.label')} value={label} onChange={event => setLabel(event.target.value)} slotProps={{ htmlInput: { maxLength: 100 } }} />
        <TextField multiline minRows={5} label={t('text.contents')} value={text} onChange={event => setText(event.target.value)}
          slotProps={{ htmlInput: { maxLength: 200_000 } }} />
      </>}
      {showTextOptions && <TextField select label={t('mode.label')} value={mode} onChange={event => setMode(event.target.value as ImportOptions['mode'])}>
        <MenuItem value="extract_faq">{t('mode.extract_faq')}</MenuItem>
        <MenuItem value="as_article">{t('mode.as_article')}</MenuItem>
      </TextField>}
      {(showTextOptions || (tab === 'file' && file)) && <TextField label={t('folder.label')} value={folderName}
        onChange={event => setFolder(event.target.value)} slotProps={{ htmlInput: { maxLength: 100 } }} />}
    </FormDialog>}
  </>;
}
