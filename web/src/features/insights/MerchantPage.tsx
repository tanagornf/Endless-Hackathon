import { Alert, Box, Button, CircularProgress, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MerchantProductEvidence, MerchantReport } from '@nless/shared/features/insights/merchant';
import { DataTable, EmptyState, formatDateTime, PageHeader, SectionCard, useApiQuery, useSession } from '../../core';

function ShopReport() {
  const { t } = useTranslation('insights');
  const [days, setDays] = useState<7 | 30>(7);
  const report = useApiQuery<MerchantReport>('/insights/merchant?days=' + days);
  const data = report.data;
  const first = data?.products?.[0];
  return <Stack spacing={2}>
    <PageHeader title={t('page.title')} description={t('scope')} />
    <TextField select label={t('range')} value={days} onChange={event => setDays(Number(event.target.value) === 30 ? 30 : 7)} sx={{ maxWidth: 240 }}>
      {[7, 30].map(value => <MenuItem key={value} value={value}>{t('days', { value })}</MenuItem>)}
    </TextField>
    {data && <Typography color="text.secondary" data-testid="merchant-period">{t('sourcePeriod', {
      since: formatDateTime(data.since), until: formatDateTime(data.until),
    })}</Typography>}
    {report.loading ? <CircularProgress aria-label={t('loading')} /> : report.error ?
      <Alert severity="error" action={<Button onClick={report.reload}>{t('retry')}</Button>}>{t('error')}</Alert> :
      data && (data.conversations === 0 ? <EmptyState title={t('empty')} /> : <>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(3,1fr)', lg: 'repeat(5,1fr)' }, gap: 1 }}>
          {(['customers','conversations','orders','handoffs','pendingSupport'] as const).map(key => <SectionCard key={key} title={t(key)}>
            <Typography variant="h5" data-testid={'merchant-metric-' + key}>{data[key] ?? t('unavailable')}</Typography></SectionCard>)}
        </Box>
        {data.orders === null && <Alert severity="info">{t('incompleteOrders')}</Alert>}
        <SectionCard title={t('products')}>
          {data.products === null ? <Alert severity="info">{t('incompleteProducts')}</Alert> :
            <DataTable<MerchantProductEvidence> rows={data.products} rowKey={item => item.sku}
              empty={<EmptyState title={t('noProducts')} />} columns={[
                { key: 'name', header: t('product'), render: item => item.name + ' · ' + item.sku },
                { key: 'conversations', header: t('productChats'), align: 'right' },
                { key: 'withoutOrder', header: t('productWithoutOrder'), align: 'right' },
              ]} />}
        </SectionCard>
        {first && first.withoutOrder > 0 && <Alert severity="info">
          {t('suggestion', { name: first.name, chats: first.withoutOrder })}
        </Alert>}
        {data.pendingSupport > 0 && <Alert severity="info">{t('handoffAdvice', { chats: data.pendingSupport })}</Alert>}
      </>)}
  </Stack>;
}

export default function MerchantPage() {
  const { currentBusiness } = useSession();
  return <ShopReport key={currentBusiness?.id} />;
}
