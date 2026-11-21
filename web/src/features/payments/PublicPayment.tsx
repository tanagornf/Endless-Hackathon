import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Alert, Box, Button, CircularProgress, Container, Stack, Typography } from '@mui/material';
import type { PublicPaymentView } from '@nless/shared/features/payments/types';
import { formatMoney, formatDateTime, PageHeader, SectionCard, useApiQuery } from '../../core';
export default function PublicPayment() {
  const {token=''}=useParams();
  const {t,i18n}=useTranslation('payments');
  const query=useApiQuery<PublicPaymentView>('/public/payments/'+encodeURIComponent(token),{businessScoped:false});
  const value=query.data;
  useEffect(()=>{
    if(!value) return;
    let preferred:string|null=null;
    try {preferred=localStorage.getItem('nless.lang');} catch { /* use customer language */ }
    void i18n.changeLanguage(preferred==='en'||preferred==='th'?preferred:value.language);
  },[value,i18n]);
  const toggle=()=>{
    const lang=i18n.language.startsWith('th')?'en':'th';
    try {localStorage.setItem('nless.lang',lang);} catch { /* available for this visit */ }
    void i18n.changeLanguage(lang);
  };
  return <Container maxWidth="sm" sx={{py:3}}>
    <Stack spacing={2}>
      <Stack direction="row" sx={{alignItems:'center',justifyContent:'space-between'}}>
        <PageHeader title={t('pay.title')}/><Button variant="outlined" onClick={toggle}>{t('pay.switch')}</Button>
      </Stack>
      {query.error ? <Alert severity="error">{t('pay.unavailable')}</Alert> : !value ? <CircularProgress aria-label={t('loading')}/> :
        <SectionCard title={value.shopName}><Stack spacing={2} sx={{alignItems:'flex-start'}}>
          {value.mode==='sandbox' && <Alert severity="warning">{t('pay.test')}</Alert>}
          <Typography>{t('columns.order')} {value.orderNumber}</Typography>
          <Typography variant="h4">{formatMoney(value.amountMinor)}</Typography>
          <Typography>{t('settings.receiver')} · {value.receiverName} {value.receiverMasked}</Typography>
          <Typography>{t('states.'+value.state)} · {t('columns.expires')} {formatDateTime(value.expiresAt)}</Typography>
          {value.qrImageBase64 && <><Box component="img" src={'data:image/png;base64,'+value.qrImageBase64} alt={t('pay.qr')} sx={{maxWidth:'100%',width:300,alignSelf:'center'}}/>
            <Button component="a" href={'data:image/png;base64,'+value.qrImageBase64} download="payment-qr.png" variant="outlined">{t('pay.download')}</Button></>}
        </Stack></SectionCard>}
    </Stack>
  </Container>;
}
