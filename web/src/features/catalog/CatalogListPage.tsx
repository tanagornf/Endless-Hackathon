import { Alert, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { Page } from '@nless/shared/core/types';
import type { CatalogCategories, CatalogItemRow } from '@nless/shared/features/catalog/types';
import { DataTable, EmptyState, PageHeader, StatusChip, formatDateTime, formatMoney, useApiQuery, useCan, useSession } from '../../core';
import CatalogCreateDialog from './CatalogCreateDialog';

type CatalogPage = Page<CatalogItemRow> & { missingNameEn: number };
type Filters = { q: string; status: string; kind: string; category: string };

function CatalogResults({ filters, add }: { filters: Filters; add: React.ReactNode }) {
  const { t } = useTranslation('catalog');
  const navigate = useNavigate();
  const [cursor, setCursor] = useState<string | null>(null);
  const [items, setItems] = useState<CatalogItemRow[]>([]);
  const params = new URLSearchParams({ status: filters.status });
  if (filters.q) params.set('q', filters.q);
  if (filters.kind) params.set('kind', filters.kind);
  if (filters.category) params.set('category', filters.category);
  if (cursor) params.set('cursor', cursor);
  const query = useApiQuery<CatalogPage>('/catalog/items?' + params.toString());
  const data = query.data;
  useEffect(() => {
    if (!data) return;
    setItems((previous) => cursor ? [...previous, ...data.items.filter((item) => !previous.some((old) => old.id === item.id))] : data.items);
  }, [data]);
  const retry = <Button onClick={query.reload}>{t('common:actions.retry')}</Button>;
  if (query.error && !items.length) return <EmptyState title={t('list.error')} action={retry} />;
  return <Stack spacing={2}>
    {query.error && <Alert severity="error" action={retry}>{t('list.error')}</Alert>}
    {!!data?.missingNameEn && <Alert severity="info">{t('list.missingNameEn', { count: data.missingNameEn })}</Alert>}
    <DataTable rows={items} loading={query.loading || (!data && !query.error && !items.length)}
      rowKey={(item) => item.id} onRowClick={(item) => navigate('/catalog/' + item.id)} empty={<EmptyState title={t('list.empty')} action={add} />}
      columns={[
        { key: 'name', header: t('table.name'), render: (item) => <Stack data-user-content sx={{ whiteSpace: 'normal' }}>
          <Typography>{item.name}</Typography>
          {item.nameEn && <Typography variant="body2" color="text.secondary">{item.nameEn}</Typography>}
        </Stack> },
        { key: 'sku', header: t('table.sku') },
        { key: 'category', header: t('form.category') },
        { key: 'priceMinor', header: t('table.price'), align: 'right', render: (item) =>
          item.hasVariantPrices ? t('table.fromPrice', { price: formatMoney(item.minPriceMinor) }) : formatMoney(item.priceMinor) },
        { key: 'unit', header: t('form.unit') },
        { key: 'stock', header: t('table.stock'), align: 'right', render: (item) => item.stock === 0
          ? <StatusChip status="inactive" label={t('table.soldOut')} />
          : item.stock ?? t('table.untracked') },
        { key: 'active', header: t('table.status'), render: (item) => <StatusChip status={item.active ? 'active' : 'inactive'} /> },
        { key: 'updatedAt', header: t('table.updated'), render: (item) => formatDateTime(item.updatedAt) },
      ]} />
    {data?.nextCursor && <Button sx={{ alignSelf: 'center' }} disabled={query.loading}
      onClick={() => setCursor(data.nextCursor)}>{t('list.loadMore')}</Button>}
  </Stack>;
}

function CatalogList() {
  const { t } = useTranslation('catalog');
  const canWrite = useCan('product.write');
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [kind, setKind] = useState('');
  const [category, setCategory] = useState('');
  const categories = useApiQuery<CatalogCategories>('/catalog/categories');
  useEffect(() => {
    const debounce = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(debounce);
  }, [search]);
  const filters = { q: query, status, kind, category };
  const add = canWrite ? <Button variant="contained" onClick={() => setCreating(true)}>{t('actions.add')}</Button> : null;
  return <>
    <PageHeader title={t('page.title')} actions={add} />
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField size="small" label={t('filter.search')} value={search} onChange={(event) => setSearch(event.target.value)}
          slotProps={{ htmlInput: { maxLength: 120 } }} sx={{ minWidth: 190 }} />
        <TextField select size="small" label={t('table.status')} value={status} onChange={(event) => setStatus(event.target.value)} sx={{ minWidth: 130 }}>
          <MenuItem value="all">{t('filter.all')}</MenuItem>
          <MenuItem value="active">{t('form.active')}</MenuItem>
          <MenuItem value="inactive">{t('filter.inactive')}</MenuItem>
        </TextField>
        <TextField select size="small" label={t('form.kind')} value={kind} onChange={(event) => setKind(event.target.value)} sx={{ minWidth: 130 }}>
          <MenuItem value="">{t('filter.all')}</MenuItem>
          <MenuItem value="product">{t('kind.product')}</MenuItem>
          <MenuItem value="service">{t('kind.service')}</MenuItem>
        </TextField>
        <TextField select size="small" label={t('form.category')} value={category} disabled={!categories.data}
          onChange={(event) => setCategory(event.target.value)} sx={{ minWidth: 150 }}>
          <MenuItem value="">{t('filter.all')}</MenuItem>
          {category && !categories.data?.items.some((entry) => entry.name === category) &&
            <MenuItem value={category}>{category}</MenuItem>}
          {categories.data?.items.map(({ name }) => <MenuItem value={name} key={name}>{name}</MenuItem>)}
        </TextField>
      </Stack>
      {categories.error && <Alert severity="warning" action={<Button onClick={categories.reload}>{t('common:actions.retry')}</Button>}>
        {t('filter.categoriesError')}
      </Alert>}
      <CatalogResults key={JSON.stringify(filters)} filters={filters} add={add} />
    </Stack>
    {creating && <CatalogCreateDialog onClose={() => setCreating(false)} />}
  </>;
}

export default function CatalogListPage() {
  const businessId = useSession().currentBusiness?.id;
  return businessId ? <CatalogList key={businessId} /> : null;
}
