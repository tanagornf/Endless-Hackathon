import { Alert, Box, Button, CircularProgress, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MerchantReport } from '@nless/shared/features/insights/merchant';
import { PageHeader, SectionCard, useApiQuery, useSession } from '../../core';

function ShopReport() {
  const { t } = useTranslation('insights');
  const [days, setDays] = useState(7);
  const report = useApiQuery<MerchantReport>('/insights/merchant?days=' + days);
  const data = report.data;
  const first = data?.products[0];
  return <Stack spacing={2}>
    <PageHeader title={t('page.title')} description={t('scope')} />
    <TextField select label={t('range')} value={days} onChange={event => setDays(Number(event.target.value))} sx={{ maxWidth: 240 }}>
      {[7, 30].map(value => <MenuItem key={value} value={value}>{t('days', { value })}</MenuItem>)}
    </TextField>
    {report.loading ? <CircularProgress aria-label={t('loading')} /> : report.error ?
      <Alert severity="error" action={<Button onClick={report.reload}>{t('retry')}</Button>}>{t('error')}</Alert> :
      data && (data.conversations === 0 ? <Alert severity="info">{t('empty')}</Alert> : <>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4,1fr)' }, gap: 1 }}>
          {(['customers','conversations','orders','handoffs'] as const).map(key => <SectionCard key={key} title={t(key)}>
            <Typography variant="h5">{data[key]}</Typography></SectionCard>)}
        </Box>
        <SectionCard title={t('products')}>
          <Stack spacing={2}>{data.products.length ? data.products.map(item => <Box key={item.sku}>
            <Typography variant="subtitle1">{item.name} · {item.sku}</Typography>
            <Typography>{t('productCounts', { chats: item.conversations, pending: item.withoutOrder })}</Typography>
          </Box>) : <Typography>{t('noProducts')}</Typography>}</Stack>
        </SectionCard>
        {first && first.withoutOrder > 0 && <Alert severity="info">
          {t('suggestion', { name: first.name, chats: first.withoutOrder })}
        </Alert>}
        {data.handoffs > 0 && <Alert severity="info">{t('handoffAdvice', { chats: data.handoffs })}</Alert>}
      </>)}
  </Stack>;
}

export default function MerchantPage() {
  const { currentBusiness } = useSession();
  return <ShopReport key={currentBusiness?.id} />;
}
