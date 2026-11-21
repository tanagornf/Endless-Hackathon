import { Alert, Button, Tab, Tabs } from '@mui/material';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CatalogHistory } from '@nless/shared/features/catalog/types';
import { DataTable, EmptyState, SectionCard, formatDateTime, formatMoney, useApiQuery } from '../../core';

export default function CatalogHistoryPanel({ itemId, revision }: { itemId: string; revision: number }) {
  const { t } = useTranslation('catalog');
  const [tab, setTab] = useState<'prices' | 'stock'>('prices');
  const history = useApiQuery<CatalogHistory>('/catalog/items/' + itemId + '/history', { deps: [revision] });
  const loading = history.loading || (!history.data && !history.error);
  const none = t('history.noneValue');
  const empty = <EmptyState title={t('history.empty')} />;
  return <SectionCard title={t('history.title')}>
    <Tabs value={tab} onChange={(_, selected: 'prices' | 'stock') => setTab(selected)} aria-label={t('history.title')}>
      <Tab value="prices" label={t('history.prices')} />
      <Tab value="stock" label={t('history.stock')} />
    </Tabs>
    {history.error
      ? <Alert severity="error" action={<Button onClick={history.reload}>{t('common:actions.retry')}</Button>}>{t('history.error')}</Alert>
      : tab === 'prices'
        ? <DataTable rows={(history.data?.prices ?? []).map((row, index) => ({ ...row, key: index }))}
          rowKey={(row) => String(row.key)} loading={loading} empty={empty}
          columns={[
            { key: 'version', header: t('history.version') },
            { key: 'oldPriceMinor', header: t('history.oldPrice'), align: 'right',
              render: (row) => row.oldPriceMinor === null ? none : formatMoney(row.oldPriceMinor) },
            { key: 'newPriceMinor', header: t('history.newPrice'), align: 'right', render: (row) => formatMoney(row.newPriceMinor) },
            { key: 'changedAt', header: t('history.changedAt'), render: (row) => formatDateTime(row.changedAt) },
            { key: 'changedByName', header: t('history.changedBy'), render: (row) => row.changedByName || none },
          ]} />
        : <DataTable rows={(history.data?.stock ?? []).map((row, index) => ({ ...row, key: index }))}
          rowKey={(row) => String(row.key)} loading={loading} empty={empty}
          columns={[
            { key: 'delta', header: t('history.delta'), align: 'right', render: (row) => row.delta > 0 ? '+' + row.delta : row.delta },
            { key: 'stockAfter', header: t('table.stock'), align: 'right' },
            { key: 'changedAt', header: t('history.changedAt'), render: (row) => formatDateTime(row.changedAt) },
            { key: 'changedByName', header: t('history.changedBy'), render: (row) => row.changedByName || none },
          ]} />}
  </SectionCard>;
}
