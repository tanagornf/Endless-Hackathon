import { useState } from 'react';
import { Alert, Button, Chip, MenuItem, Stack, Tab, Tabs, TextField } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { CrmCustomerRow, CrmTag } from '@nless/shared/features/crm/types';
import { ConfirmDialog, DataTable, EmptyState, FormDialog, PageHeader, StatusChip, formatDateTime, useApiMutation, useApiQuery, useCan, useRealtime } from '../../core';

const colors = ['grey', 'red', 'orange', 'amber', 'green', 'teal', 'blue', 'purple'];
function TagTable({ rows, reload, loading }: { rows: CrmTag[]; reload: () => void; loading: boolean }) {
  const { t } = useTranslation('crm');
  const manage = useCan('broadcast.tags');
  const [editing, setEditing] = useState<CrmTag | 'new' | null>(null);
  const [deleting, setDeleting] = useState<CrmTag | null>(null);
  const [name, setName] = useState(''), [description, setDescription] = useState(''), [color, setColor] = useState('grey');
  const create = useApiMutation<{ name: string; color: string; description: string }, CrmTag>('POST', '/crm/tags');
  const edit = useApiMutation<{ name: string; color: string; description: string; expectedVersion: number }, CrmTag>('PATCH', '/crm/tags/' + (editing && editing !== 'new' ? editing.id : ''));
  const remove = useApiMutation<{ id: string }, void>('DELETE', input => '/crm/tags/' + input.id);
  const open = (row: CrmTag | 'new') => {
    setEditing(row);
    setName(row === 'new' ? '' : row.name);
    setColor(row === 'new' ? 'grey' : row.color);
    setDescription(row === 'new' ? '' : row.description);
  };
  return <Stack spacing={2}>
    {manage && <Button variant="contained" onClick={() => open('new')} sx={{ alignSelf: 'flex-start' }}>{t('createTag')}</Button>}
    <DataTable rows={rows} loading={loading} rowKey={r => r.id} empty={<EmptyState title={t('noTags')} />} columns={[
      { key: 'name', header: t('tagName') }, { key: 'description', header: t('description') },
      { key: 'color', header: t('color'), render: r => t('colors.' + r.color) },
      { key: 'customerCount', header: t('customerCount') }, { key: 'ruleCount', header: t('ruleCount') },
      ...(manage ? [{
        key: 'actions', header: t('actions'), render: (r: CrmTag) => <Stack direction="row">
          <Button onClick={() => open(r)}>{t('edit')}</Button><Button color="error" onClick={() => setDeleting(r)}>{t('remove')}</Button>
        </Stack>
      }] : []),
    ]} />
    <FormDialog open={editing !== null} title={t(editing === 'new' ? 'createTag' : 'editTag')} onClose={() => setEditing(null)}
      submitting={create.running || edit.running} error={name.trim() ? null : t('nameRequired')}
      onSubmit={async () => {
        if (!name.trim() || !editing) return;
        const draft = { name: name.trim(), description, color };
        if (editing === 'new') await create.run(draft); else await edit.run({ ...draft, expectedVersion: editing.version });
        setEditing(null); reload();
      }}>
      <TextField label={t('tagName')} autoFocus required value={name} onChange={e => setName(e.target.value)} />
      <TextField label={t('description')} value={description} onChange={e => setDescription(e.target.value)} slotProps={{ htmlInput: { maxLength: 200 } }} />
      <TextField select label={t('color')} value={color} onChange={e => setColor(e.target.value)}>
        {colors.map(c => <MenuItem key={c} value={c}>{t('colors.' + c)}</MenuItem>)}
      </TextField>
    </FormDialog>
    <ConfirmDialog open={!!deleting} title={t('remove')} message={t('removePrompt', { name: deleting?.name })} danger onClose={() => setDeleting(null)}
      onConfirm={async () => { if (deleting) { await remove.run({ id: deleting.id }); reload(); } }} />
  </Stack>;
}

export default function CustomersPage() {
  const { t } = useTranslation('crm');
  const navigate = useNavigate();
  const [tab, setTab] = useState('customers');
  const [q, setQ] = useState(''), [tag, setTag] = useState<string[]>([]), [consent, setConsent] = useState(''), [channel, setChannel] = useState('');
  const [pages, setPages] = useState<string[]>([]);
  const criteria = new URLSearchParams();
  if (q.trim()) criteria.set('q', q.trim());
  for (const id of tag) criteria.append('tagId', id);
  if (consent) criteria.set('consent', consent);
  if (channel) criteria.set('channel', channel);
  if (pages.length) criteria.set('cursor', pages[pages.length - 1]);
  const customers = useApiQuery<{ items: CrmCustomerRow[]; nextCursor: string | null; total: number }>(tab === 'customers' ? '/crm/customers?' + criteria : null);
  const tags = useApiQuery<{ items: CrmTag[] }>('/crm/tags');
  useRealtime('custom', e => { if (e.featureId === 'F24') { customers.reload(); tags.reload(); } });
  const filter = (set: (v: string) => void, value: string) => { set(value); setPages([]); };
  const select = (label: string, value: string, change: (v: string) => void, options: { id: string; label: string }[]) =>
    <TextField select size="small" label={label} value={value} onChange={e => filter(change, e.target.value)} sx={{ minWidth: 145 }}>
      <MenuItem value="">{t('all')}</MenuItem>{options.map(item => <MenuItem key={item.id} value={item.id}>{item.label}</MenuItem>)}
    </TextField>;
  return <Stack spacing={2}>
    <PageHeader title={t('page.title')} />
    <Tabs value={tab} onChange={(_e, v: string) => setTab(v)}><Tab value="customers" label={t('allCustomers')} /><Tab value="tags" label={t('tags')} /></Tabs>
    {tags.error && <Alert severity="error" action={<Button onClick={tags.reload}>{t('retry')}</Button>}>{t('loadError')}</Alert>}
    {tab === 'tags' ? <TagTable rows={tags.data?.items ?? []} loading={tags.loading} reload={tags.reload} /> : <>
      <Stack direction={{ xs: 'column', md: 'row' }} sx={{ gap: 1, flexWrap: 'wrap' }}>
        <TextField size="small" label={t('search')} value={q} onChange={e => filter(setQ, e.target.value)} slotProps={{ htmlInput: { maxLength: 100 } }} />
        <TextField select size="small" label={t('tags')} value={tag} sx={{ minWidth: 145 }}
          slotProps={{ select: { multiple: true } }} onChange={e => { const ids = e.target.value; setTag(typeof ids === 'string' ? ids.split(',').filter(Boolean) : ids); setPages([]); }}>
          {(tags.data?.items ?? []).map(item => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}
        </TextField>
        {select(t('consent'), consent, setConsent, ['unknown', 'granted', 'revoked'].map(id => ({ id, label: t('consents.' + id) })))}
        {select(t('channel'), channel, setChannel, ['line', 'web', 'facebook', 'instagram'].map(id => ({ id, label: t('channels.' + id) })))}
      </Stack>
      {customers.error ? <Alert severity="error" action={<Button onClick={customers.reload}>{t('retry')}</Button>}>{t('loadError')}</Alert> :
        <DataTable rows={customers.data?.items ?? []} loading={customers.loading} rowKey={r => r.id}
          empty={<EmptyState title={t('empty')} />} onRowClick={r => navigate('/customers/' + r.id)} columns={[
            { key: 'displayName', header: t('customer'), render: r => r.displayName || t('customer') },
            { key: 'channel', header: t('channel'), render: r => t('channels.' + r.channel) },
            { key: 'tags', header: t('tags'), render: r => <Stack direction="row" sx={{ gap: 0.5, flexWrap: 'wrap' }}>{r.tags.map(item => <Chip key={item.id} label={item.name} />)}</Stack> },
            { key: 'marketingConsent', header: t('consent'), render: r => <StatusChip status={r.marketingConsent} label={t('consents.' + r.marketingConsent)} /> },
            { key: 'phone', header: t('phone') }, { key: 'lastSeenAt', header: t('seen'), render: r => r.lastSeenAt ? formatDateTime(r.lastSeenAt) : '—' },
          ]} />}
      {customers.data && <span>{t('total', { count: customers.data.total })}</span>}
      {(pages.length > 0 || customers.data?.nextCursor) && <Stack direction="row" spacing={1}>
        <Button disabled={!pages.length || customers.loading} onClick={() => setPages(pages.slice(0, -1))}>{t('previous')}</Button>
        <Button disabled={!customers.data?.nextCursor || customers.loading} onClick={() => { const cursor = customers.data?.nextCursor; if (cursor) setPages([...pages, cursor]); }}>{t('next')}</Button>
      </Stack>}
    </>}
  </Stack>;
}
