import { Alert, Autocomplete, Button, Checkbox, FormControlLabel, TextField } from '@mui/material';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RetrievalCaseRow } from '@nless/shared/features/knowledge-search/types';
import type { KnowledgeItemRow } from '@nless/shared/features/knowledge/types';
import { ConfirmDialog, DataTable, EmptyState, FormDialog, SectionCard, useApiMutation, useApiQuery, useCan, useToast } from '../../core';

const path = '/knowledge-search/eval/cases';
type CaseInput = Pick<RetrievalCaseRow, 'query' | 'expectItemIds' | 'expectNone'>;

export default function SavedRetrievalCases({ query }: { query: string }) {
  const { t } = useTranslation('knowledge-search');
  const canWrite = useCan('product.write');
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [expectNone, setExpectNone] = useState(false);
  const [selected, setSelected] = useState<KnowledgeItemRow[]>([]);
  const [itemSearch, setItemSearch] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<RetrievalCaseRow | null>(null);
  const cases = useApiQuery<{ items: RetrievalCaseRow[] }>(path);
  const items = useApiQuery<{ items: KnowledgeItemRow[] }>(canWrite && open && !expectNone
    ? '/knowledge/items?limit=30&q=' + encodeURIComponent(itemSearch.trim().slice(0, 160)) : null);
  const create = useApiMutation<CaseInput, RetrievalCaseRow>('POST', path, { toastOnError: false });
  const remove = useApiMutation<string, void>('DELETE', (id) => path + '/' + id);
  const options = [...new Map([...selected, ...(items.data?.items ?? [])].map((item) => [item.id, item])).values()];

  function begin() {
    setQuestion(query);
    setExpectNone(false);
    setSelected([]);
    setItemSearch('');
    setFormError(null);
    setOpen(true);
  }

  async function save() {
    if (!question.trim()) { setFormError(t('cases.questionRequired')); return; }
    if (!expectNone && !selected.length) { setFormError(t('cases.expectationRequired')); return; }
    setFormError(null);
    try {
      await create.run({ query: question.trim(), expectNone, expectItemIds: expectNone ? [] : selected.map(({ id }) => id) });
      toast.success(t('cases.saved'));
      setOpen(false);
      cases.reload();
    } catch {
      setFormError(t('cases.saveError'));
    }
  }

  return <SectionCard title={t('cases.title')} actions={canWrite && <Button onClick={begin}>{t('cases.saveAs')}</Button>}>
    {cases.error ? <Alert severity="error" action={<Button onClick={cases.reload}>{t('common:actions.retry')}</Button>}>
      {t('cases.loadError')}
    </Alert> : <DataTable rows={cases.data?.items ?? []} rowKey={(row) => row.id}
      loading={cases.loading || !cases.data} empty={<EmptyState title={t('cases.empty')} />} columns={[
        { key: 'query', header: t('search.question'), render: ({ query }) => <span data-user-content>{query}</span> },
        { key: 'expectation', header: t('cases.expected'), render: (row) => <span data-user-content>{row.expectNone
          ? t('cases.none') : row.expectTitles.map((title) => title || t('cases.untitled')).join(' · ') || t('cases.unavailable')}</span> },
        ...(canWrite ? [{ key: 'actions', header: t('cases.actions'), render: (row: RetrievalCaseRow) =>
          <Button color="error" onClick={() => setDeleting(row)}>{t('cases.delete')}</Button> }] : []),
      ]} />}
    {canWrite && <FormDialog open={open} title={t('cases.saveAs')} submitLabel={t('cases.save')}
      onClose={() => setOpen(false)} error={formError} submitting={create.running} onSubmit={save}>
      <TextField autoFocus required fullWidth label={t('search.question')} value={question}
        onChange={(event) => setQuestion(event.target.value)} slotProps={{ htmlInput: { maxLength: 500 } }} />
      <FormControlLabel label={t('cases.none')} control={<Checkbox checked={expectNone}
        onChange={(event) => setExpectNone(event.target.checked)} />} />
      {!expectNone && <>
        {items.error && <Alert severity="error" action={<Button onClick={items.reload}>{t('common:actions.retry')}</Button>}>
          {t('cases.itemsError')}
        </Alert>}
        <Autocomplete multiple value={selected} options={options} loading={items.loading}
          openText={t('cases.openChoices')} closeText={t('cases.closeChoices')} clearText={t('cases.clearChoices')}
          loadingText={t('cases.itemsLoading')} noOptionsText={t('cases.noItems')} filterOptions={(values) => values}
          getOptionLabel={(item) => item.title || t('cases.untitled')} getOptionKey={(item) => item.id}
          getOptionDisabled={(item) => selected.length >= 5 && !selected.some(({ id }) => id === item.id)}
          isOptionEqualToValue={(item, other) => item.id === other.id}
          onChange={(_, current) => setSelected(current)} onInputChange={(_, value) => setItemSearch(value)}
          renderInput={(props) => <TextField {...props} label={t('cases.expected')} />} />
      </>}
    </FormDialog>}
    {canWrite && <ConfirmDialog open={Boolean(deleting)} title={t('cases.deleteTitle')} message={t('cases.deleteMessage')}
      danger confirmLabel={t('cases.delete')} onClose={() => setDeleting(null)} onConfirm={async () => {
        if (!deleting) return;
        await remove.run(deleting.id);
        toast.success(t('cases.deleted'));
        cases.reload();
      }} />}
  </SectionCard>;
}
