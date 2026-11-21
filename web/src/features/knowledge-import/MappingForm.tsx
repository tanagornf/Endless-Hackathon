import type { Page } from '@nless/shared/core/types';
import type { CatalogField, FaqField, ImportMapping, ImportOptions, ImportRowView, ImportView } from '@nless/shared/features/knowledge-import/types';
import { Alert, Button, FormControlLabel, MenuItem, Stack, Switch, TextField } from '@mui/material';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable, SectionCard, useApiMutation, useApiQuery } from '../../core';

type Field = CatalogField | FaqField;
type Target = 'catalog' | 'faq';
type Body = { target: Target; mapping: ImportMapping; options: Pick<ImportOptions, 'catalogMode'> };
const catalogFields: CatalogField[] = ['sku', 'name', 'nameEn', 'description', 'category', 'price', 'unit', 'stock', 'durationMinutes'];
const faqFields: FaqField[] = ['question', 'answer', 'folder'];
const required: Record<Target, Field[]> = { catalog: ['sku', 'name', 'price'], faq: ['question', 'answer'] };

export default function MappingForm({ record, path, onValidated }: { record: ImportView; path: string; onValidated: (record: ImportView) => void }) {
  const { t } = useTranslation('knowledge-import');
  const [target, setTarget] = useState<Target>(record.target === 'faq' ? 'faq' : 'catalog');
  const [mapping, setMapping] = useState<ImportMapping>(record.mapping ?? record.detected?.mapping ?? {});
  const [updateExisting, setUpdateExisting] = useState(record.options.catalogMode === 'update_existing');
  const preview = useApiQuery<Page<ImportRowView>>(path + '/rows?limit=5');
  const mutation = useApiMutation<Body, ImportView>('POST', path + '/mapping');
  const header = record.header ?? [];
  const fields = target === 'catalog' ? catalogFields : faqFields;
  const positions: Partial<Record<Field, number>> = mapping[target] ?? {};
  const valid = required[target].every(field => positions[field] !== undefined);

  function change(column: number, field: string) {
    const next = Object.fromEntries(Object.entries(positions).filter(([other, index]) => index !== column && other !== field));
    if (field) next[field] = column;
    setMapping({ ...mapping, [target]: next });
  }

  return <SectionCard title={t('mapping.title')}>
    <Stack spacing={2}>
      <TextField select label={t('mapping.target')} value={target} onChange={event => setTarget(event.target.value === 'faq' ? 'faq' : 'catalog')}>
        <MenuItem value="catalog">{t('mapping.catalog')}</MenuItem>
        <MenuItem value="faq">{t('mapping.faq')}</MenuItem>
      </TextField>
      {preview.error && <Alert severity="error" action={<Button onClick={preview.reload}>{t('actions.retry')}</Button>}>{t('error.load')}</Alert>}
      {!preview.error && <DataTable<ImportRowView> rows={preview.data?.items ?? []} rowKey={row => row.id} loading={preview.loading}
        columns={header.slice(0, 12).map((name, index) => ({
          key: String(index),
          header: name || t('mapping.column', { number: index + 1 }),
          render: row => row.cells?.[index] ?? '—',
        }))} />}
      <Stack direction="row" sx={{ gap: 1.5, flexWrap: 'wrap' }}>
        {header.map((name, index) => <TextField key={index} select size="small"
          sx={{ minWidth: 145, maxWidth: '100%' }}
          label={t('mapping.column', { number: index + 1 }) + (name ? ' · ' + name : '')}
          value={Object.entries(positions).find(([, column]) => column === index)?.[0] ?? ''}
          onChange={event => change(index, event.target.value)}>
          <MenuItem value="">{t('mapping.ignore')}</MenuItem>
          {fields.map(field => <MenuItem key={field} value={field}>{t('field.' + field)}</MenuItem>)}
        </TextField>)}
      </Stack>
      {target === 'catalog' && <FormControlLabel control={<Switch checked={updateExisting} onChange={(_, value) => setUpdateExisting(value)} />}
        label={t('mapping.update')} />}
      {!valid && <Alert severity="info">{t('mapping.required', { fields: required[target].map(field => t('field.' + field)).join(', ') })}</Alert>}
      <Button variant="contained" disabled={!valid || mutation.running} sx={{ alignSelf: 'start' }} onClick={() => {
        void mutation.run({ target, mapping, options: { catalogMode: updateExisting ? 'update_existing' : 'create_only' } }).then(onValidated, () => {});
      }}>{t('actions.validate')}</Button>
    </Stack>
  </SectionCard>;
}
