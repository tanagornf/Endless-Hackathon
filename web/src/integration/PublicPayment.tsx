import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, LinearProgress, Stack, Typography } from '@mui/material';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { formatMoney, LanguageSwitch, SectionCard, useApiQuery } from '../core';
import { apiRequest } from '../core/api';
import { ServiceAlert } from './ResourcePanel';

type View = { shopName: string; orderNumber: string; amountMinor: number; state: string; qrImageBase64: string | null;
  receiverMasked: string; receiverName: string; mode: string; attemptsLeft: number; receipt: {receiptNo: string} | null; language: 'th' | 'en' };
export default function PublicPayment() {
  const { token = '' } = useParams();
  const { t, i18n } = useTranslation('integration');
  const initialLanguage = useRef(false);
  const path = '/public/payments/' + encodeURIComponent(token);
  const result = useApiQuery<View>(path,{ businessScoped: false });
  const [message,setMessage] = useState('');
  const [failure,setFailure] = useState(false);
  const [busy,setBusy] = useState(false);
  const lock = useRef(false);
  const view = result.data;
  useEffect(() => {
    if (view?.language && !initialLanguage.current) { initialLanguage.current = true; void i18n.changeLanguage(view.language); }
  }, [view?.language, i18n]);
  useEffect(() => {
    if (view?.state !== 'pending_verification') return;
    const timer = window.setTimeout(result.reload,5000); return () => clearTimeout(timer);
  },[view, result.reload]);
  return <Stack spacing={2} sx={{ mx: 'auto', maxWidth: 500, py: 2 }}>
    <Stack direction="row" sx={{ justifyContent:'space-between', alignItems:'center' }}><Typography component="h1" variant="h5">{t('paymentInfo')}</Typography><LanguageSwitch compact /></Stack>
    {result.loading && <LinearProgress />}
    {result.error && <ServiceAlert code={result.error.error.code} retry={result.reload} />}
    {view && <SectionCard title={view.shopName}><Stack spacing={2}>
      {view.mode === 'sandbox' && <Alert severity="info">{t('sandboxPayment')}</Alert>}
      <Typography>{t('field.orderNumber')} · {view.orderNumber}</Typography>
      <Typography variant="h4">{formatMoney(view.amountMinor)}</Typography>
      <Typography>{t('field.state')} · {t('common:status.payment.' + view.state, { defaultValue: view.state })}</Typography>
      {view.qrImageBase64 && view.state === 'open' && <Box component="img" alt={t('qr')} src={'data:image/png;base64,' + view.qrImageBase64.replace(/^data:image\/png;base64,/, '')}
        sx={{ width:'min(260px,100%)', alignSelf:'center' }} />}
      <Typography>{t('receiver')} · {view.receiverName} {view.receiverMasked}</Typography>
      {view.receipt && <Alert severity="success">{t('receipt')} · {view.receipt.receiptNo}</Alert>}
      {view.state === 'open' && view.attemptsLeft > 0 && <Button variant="contained" component="label" disabled={busy}>{t('attachSlip')}
        <input hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={async e => {
          const file = e.target.files?.[0]; e.target.value=''; if (!file || lock.current) return;
          lock.current = true; setBusy(true); setFailure(false); setMessage('');
          try { const form = new FormData(); form.set('file',file);
            const response = await apiRequest<{customerMessage:string}>((import.meta.env.VITE_API_BASE || '/api/v1') + path + '/slip', { method:'POST',body:form,redirectOnUnauthorized:false });
            setMessage(response.customerMessage); result.reload();
          } catch { setFailure(true); } finally { lock.current=false; setBusy(false); }
        }} /></Button>}
    </Stack></SectionCard>}
    {message && <Alert severity="info">{message}</Alert>}{failure && <Alert severity="error">{t('common:errors.generic')}</Alert>}
  </Stack>;
}
