import { Alert, Button, Stack, TextField } from '@mui/material';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { KnowledgeFolderRow } from '@nless/shared/features/knowledge/types';
import { ConfirmDialog, DataTable, EmptyState, FormDialog, SectionCard, useApiMutation, useCan, useToast } from '../../core';

export type FolderList = { items: KnowledgeFolderRow[]; unfiledCount: number };
const path = '/knowledge/folders';

export default function FolderManager({ items, loading, failed, refresh }: {
  items: KnowledgeFolderRow[];
  loading: boolean;
  failed: boolean;
  refresh: (removed?: string) => void;
}) {
  const { t } = useTranslation('knowledge');
  const toast = useToast();
  const canWrite = useCan('product.write');
  const canDelete = useCan('product.delete');
  const [editing, setEditing] = useState<KnowledgeFolderRow | 'new' | null>(null);
  const [deleting, setDeleting] = useState<KnowledgeFolderRow | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const editId = editing && editing !== 'new' ? editing.id : '';
  const create = useApiMutation<{ name: string }, KnowledgeFolderRow>('POST', path, { toastOnError: false });
  const rename = useApiMutation<{ name: string }, KnowledgeFolderRow>('PATCH', path + '/' + editId, { toastOnError: false });
  const remove = useApiMutation<string, void>('DELETE', (id) => path + '/' + id);

  function begin(folder: KnowledgeFolderRow | 'new') {
    setName(folder === 'new' ? '' : folder.name);
    setEditing(folder);
    setError(null);
  }
  async function save() {
    try {
      await (editing === 'new' ? create : rename).run({ name });
      toast.success(t('toast.saved'));
      setEditing(null);
      refresh();
    } catch (cause) {
      const detail = cause && typeof cause === 'object' && 'details' in cause ? cause.details : null;
      const code = detail && typeof detail === 'object' && 'code' in detail ? detail.code : null;
      setError(code === 'folder_name_taken' || code === 'folder_name_invalid'
        ? t('folders.' + code)
        : t('common:errors.generic'));
    }
  }

  return <SectionCard title={t('folders.title')} actions={canWrite && <Button onClick={() => begin('new')}>{t('folders.add')}</Button>}>
    {failed
      ? <Alert severity="error" action={<Button onClick={() => refresh()}>{t('common:actions.retry')}</Button>}>{t('error.load')}</Alert>
      : <DataTable rows={items} loading={loading} rowKey={(row) => row.id}
        empty={<EmptyState title={t('folders.empty')} />}
        columns={[
          { key: 'name', header: t('folders.name') },
          { key: 'itemCount', header: t('folders.items'), align: 'right' },
          { key: 'actions', header: t('folders.actions'), render: (row) => <Stack direction="row" spacing={1}>
            {canWrite && <Button onClick={() => begin(row)}>{t('folders.rename')}</Button>}
            {canDelete && <Button color="error" onClick={() => setDeleting(row)}>{t('actions.delete')}</Button>}
          </Stack> },
        ]} />}
    {canWrite && <FormDialog open={editing !== null} title={t(editing === 'new' ? 'folders.add' : 'folders.rename')}
      error={error} submitting={create.running || rename.running} onClose={() => setEditing(null)} onSubmit={save}>
      <TextField autoFocus label={t('folders.name')} value={name} onChange={(event) => setName(event.target.value)}
        slotProps={{ htmlInput: { maxLength: 120 } }} />
    </FormDialog>}
    {canDelete && <ConfirmDialog open={deleting !== null} title={t('folders.deleteTitle')} message={t('folders.deleteMessage')}
      danger confirmLabel={t('actions.delete')} onClose={() => setDeleting(null)} onConfirm={async () => {
        if (!deleting) return;
        await remove.run(deleting.id);
        toast.success(t('toast.deleted'));
        refresh(deleting.id);
      }} />}
  </SectionCard>;
}
