import { Alert, Button, Stack, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Page } from '@nless/shared/core/types';
import type { CatalogItemRow } from '@nless/shared/features/catalog/types';
import { DataTable, EmptyState, PageHeader, StatusChip, formatMoney, useApiQuery, useSession } from '../../core';

type CatalogPage = Page<CatalogItemRow> & { missingNameEn: number };

function CatalogList() {
  const { t } = useTranslation('catalog');
  const [cursor, setCursor] = useState<string | null>(null);
  const [items, setItems] = useState<CatalogItemRow[]>([]);
  const path = '/catalog/items' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : '');
  const query = useApiQuery<CatalogPage>(path);
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
      rowKey={(item) => item.id} empty={<EmptyState title={t('list.empty')} />}
      columns={[
        { key: 'name', header: t('table.name'), render: (item) => <Stack data-user-content sx={{ whiteSpace: 'normal' }}>
          <Typography>{item.name}</Typography>
          {item.nameEn && <Typography variant="body2" color="text.secondary">{item.nameEn}</Typography>}
        </Stack> },
        { key: 'sku', header: t('table.sku') },
        { key: 'priceMinor', header: t('table.price'), align: 'right', render: (item) =>
          item.hasVariantPrices ? t('table.fromPrice', { price: formatMoney(item.minPriceMinor) }) : formatMoney(item.priceMinor) },
        { key: 'stock', header: t('table.stock'), align: 'right', render: (item) => item.stock === 0
          ? <StatusChip status="inactive" label={t('table.soldOut')} />
          : item.stock ?? t('table.untracked') },
        { key: 'active', header: t('table.status'), render: (item) => <StatusChip status={item.active ? 'active' : 'inactive'} /> },
      ]} />
    {data?.nextCursor && <Button sx={{ alignSelf: 'center' }} disabled={query.loading}
      onClick={() => setCursor(data.nextCursor)}>{t('list.loadMore')}</Button>}
  </Stack>;
}

export default function CatalogListPage() {
  const { t } = useTranslation('catalog');
  const businessId = useSession().currentBusiness?.id;
  return <>
    <PageHeader title={t('page.title')} />
    {businessId && <CatalogList key={businessId} />}
  </>;
}
