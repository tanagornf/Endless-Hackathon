import { Alert, Button, MenuItem, Stack, Tab, Tabs, TextField, Typography } from '@mui/material';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { SlotContribution } from '@nless/shared/core/loader';
import type { Page } from '@nless/shared/core/types';
import type { KnowledgeItemDetail, KnowledgeItemRow } from '@nless/shared/features/knowledge/types';
import {
  DataTable, EmptyState, PageHeader, StatusChip, formatDateTime, useApiMutation,
  useApiQuery, useCan, useRealtime, useSession, useSlot,
} from '../../core';
import FolderManager from './FolderManager';
import type { FolderList } from './FolderManager';

const statuses = ['all', 'webSuggestions', 'draft', 'reviewed', 'active', 'inactive', 'deleted'] as const;
type Filter = typeof statuses[number];

function KnowledgeSlot({ entry, businessId }: { entry: SlotContribution; businessId: string }) {
  const Action = useMemo(() => lazy(entry.load), [entry.load]);
  return <Suspense fallback={null}><Action businessId={businessId} /></Suspense>;
}

function Results({ filter, term, folderId, add }: { filter: Filter; term: string; folderId: string | null; add: React.ReactNode }) {
  const { t } = useTranslation('knowledge');
  const navigate = useNavigate();
  const [cursor, setCursor] = useState<string | null>(null);
  const [rows, setRows] = useState<KnowledgeItemRow[]>([]);
  const request = new URLSearchParams();
  if (term) request.set('q', term);
  if (folderId) request.set('folderId', folderId);
  if (filter === 'deleted') request.set('includeDeleted', 'true');
  else if (filter === 'webSuggestions') request.set('pendingWebSuggestions', 'true');
  else if (filter !== 'all') request.set('status', filter);
  if (cursor) request.set('cursor', cursor);
  const page = useApiQuery<Page<KnowledgeItemRow>>('/knowledge/items?' + request.toString());
  const data = page.data;
  useEffect(() => {
    if (!data) return;
    setRows((current) => {
      const incoming = data.items.filter((entry) => filter !== 'deleted' || entry.status === 'deleted');
      return cursor ? [...current, ...incoming.filter((entry) => !current.some((old) => old.id === entry.id))] : incoming;
    });
  }, [data]);
  useRealtime('knowledge.status', () => {
    setCursor(null);
    page.reload();
  });
  const retry = <Button onClick={page.reload}>{t('common:actions.retry')}</Button>;
  if (page.error && !rows.length) return <EmptyState title={t('error.load')} action={retry} />;
  return <Stack spacing={2}>
    {page.error && <Alert severity="error" action={retry}>{t('error.load')}</Alert>}
    <DataTable rows={rows} loading={page.loading || (!data && !page.error && !rows.length)}
      rowKey={(row) => row.id} onRowClick={(row) => navigate('/knowledge/' + row.id)}
      empty={<EmptyState title={t(filter === 'webSuggestions' ? 'web.empty' : 'empty.title')}
        description={filter === 'all' ? t('empty.description') : undefined} action={filter === 'all' ? add : undefined} />}
      columns={[
        { key: 'title', header: t('table.title'), render: (row) => <Stack sx={{ maxWidth: 360, whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
          <Typography>{row.title || t('page.untitled')}</Typography>
          {row.snippet && <Typography color="text.secondary" variant="body2">{row.snippet}</Typography>}
        </Stack> },
        { key: 'kind', header: t('table.kind'), render: (row) => t('kind.' + row.kind) },
        { key: 'status', header: t('table.status'), render: (row) => <Stack sx={{ alignItems: 'flex-start' }}>
          <StatusChip status={row.status} />
          {row.source === 'web' && <Typography color="text.secondary" variant="caption">{t('web.label')}</Typography>}
        </Stack> },
        { key: 'indexState', header: t('table.index'), render: (row) => <StatusChip status={row.indexState} /> },
        { key: 'folderName', header: t('table.folder'), render: (row) => row.folderName || t('table.unfiled') },
        { key: 'updatedAt', header: t('table.updated'), render: (row) => formatDateTime(row.updatedAt) },
      ]} />
    {data?.nextCursor && <Button sx={{ alignSelf: 'center' }} disabled={page.loading}
      onClick={() => setCursor(data.nextCursor)}>{t('actions.loadMore')}</Button>}
  </Stack>;
}

function KnowledgeList({ businessId }: { businessId: string }) {
  const { t } = useTranslation('knowledge');
  const navigate = useNavigate();
  const canWrite = useCan('product.write');
  const slotActions = useSlot('knowledgeActions');
  const canManageFolders = useCan('product.delete') || canWrite;
  const folderQuery = useApiQuery<FolderList>('/knowledge/folders');
  const [folderId, setFolderId] = useState<string | null>(null);
  const [folderRevision, setFolderRevision] = useState(0);
  const [folders, setFolders] = useState<FolderList>();
  const [manageFolders, setManageFolders] = useState(false);
  useEffect(() => { if (folderQuery.data) setFolders(folderQuery.data); }, [folderQuery.data]);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [term, setTerm] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setTerm(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);
  const create = useApiMutation<Record<string, never>, KnowledgeItemDetail>('POST', '/knowledge/items');
  async function addDraft() {
    if (create.running) return;
    try {
      const item = await create.run({});
      navigate('/knowledge/' + item.id);
    } catch { /* The shared mutation shows the error. */ }
  }
  const add = canWrite
    ? <Button variant="contained" disabled={create.running} onClick={() => void addDraft()}>{t('actions.add')}</Button>
    : null;
  return <>
    <PageHeader title={t('page.title')} description={t('page.subtitle')}
      actions={<Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
        {businessId && slotActions.map((entry) => <KnowledgeSlot key={entry.id} businessId={businessId} entry={entry} />)}
        {canManageFolders && <Button onClick={() => setManageFolders((open) => !open)}>{t('actions.folders')}</Button>}
        {add}
      </Stack>} />
    <Stack spacing={2}>
      <Tabs value={filter} onChange={(_, selected: Filter) => setFilter(selected)} variant="scrollable" scrollButtons="auto"
        aria-label={t('table.status')}>
        {statuses.map((status) => <Tab key={status} value={status} label={t('tabs.' + status)} />)}
      </Tabs>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField label={t('filter.search')} size="small" value={query} onChange={(event) => setQuery(event.target.value)}
          slotProps={{ htmlInput: { maxLength: 160 } }} sx={{ maxWidth: 360 }} />
        <TextField select label={t('filter.folder')} size="small" value={folderId ?? ''}
          onChange={(event) => setFolderId(event.target.value || null)} sx={{ minWidth: 220 }}>
          <MenuItem value="">{t('filter.allFolders')}</MenuItem>
          <MenuItem value="unfiled">{t('folders.choice', { name: t('table.unfiled'), n: folders?.unfiledCount ?? 0 })}</MenuItem>
          {folders?.items.map((folder) =>
            <MenuItem key={folder.id} value={folder.id}>{t('folders.choice', { name: folder.name, n: folder.itemCount })}</MenuItem>)}
        </TextField>
      </Stack>
      {manageFolders && <FolderManager items={folders?.items ?? []} loading={folderQuery.loading || !folders}
        failed={!!folderQuery.error} refresh={(removed) => {
          if (removed && removed === folderId) setFolderId(null);
          folderQuery.reload();
          setFolderRevision((revision) => revision + 1);
        }} />}
      <Results key={JSON.stringify([businessId, filter, term, folderId, folderRevision])}
        filter={filter} term={term} folderId={folderId} add={add} />
    </Stack>
  </>;
}

export default function KnowledgeListPage() {
  const businessId = useSession().currentBusiness?.id;
  return businessId ? <KnowledgeList key={businessId} businessId={businessId} /> : null;
}
