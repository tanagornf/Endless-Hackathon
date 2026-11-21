import type { ImportRowView } from '@nless/shared/features/knowledge-import/types';
import { Button, Stack, TextField } from '@mui/material';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormDialog, useApiMutation } from '../../core';

type Input = { excluded?: boolean; question?: string; answer?: string; title?: string; body?: string };

export default function EditRowActions({ row, path, reload }: { row: ImportRowView; path: string; reload: () => void }) {
  const { t } = useTranslation('knowledge-import');
  const [editing, setEditing] = useState(false);
  const data = row.data;
  const faq = data && 'question' in data ? data : null;
  const article = data && 'title' in data ? data : null;
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const update = useApiMutation<Input, ImportRowView>('PATCH', path + '/rows/' + row.id);
  if (!['ready', 'error', 'excluded'].includes(row.status)) return null;

  async function submit() {
    await update.run(faq ? { question: title, answer: body } : { title, body });
    setEditing(false);
    reload();
  }
  function begin() {
    setTitle(faq?.question ?? article?.title ?? '');
    setBody(faq?.answer ?? article?.body ?? '');
    setEditing(true);
  }
  return <>
    <Stack direction="row">
      {(faq || article) && <Button onClick={begin} disabled={update.running}>{t('actions.edit')}</Button>}
      <Button disabled={update.running} onClick={() => {
        void update.run({ excluded: row.status !== 'excluded' }).then(reload, () => {});
      }}>{t(row.status === 'excluded' ? 'actions.include' : 'actions.exclude')}</Button>
    </Stack>
    {editing && <FormDialog open title={t('actions.edit')} submitting={update.running} onSubmit={submit} onClose={() => setEditing(false)}>
      <TextField label={t(faq ? 'field.question' : 'field.title')} value={title} onChange={event => setTitle(event.target.value)}
        slotProps={{ htmlInput: { maxLength: faq ? 200 : 255 } }} />
      <TextField label={t(faq ? 'field.answer' : 'field.body')} value={body} onChange={event => setBody(event.target.value)}
        multiline minRows={4} slotProps={{ htmlInput: { maxLength: faq ? 1_000 : 20_000 } }} />
    </FormDialog>}
  </>;
}
