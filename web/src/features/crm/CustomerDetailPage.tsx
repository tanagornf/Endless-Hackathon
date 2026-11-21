import { useState } from 'react';
import { Alert, Button, Checkbox, CircularProgress, FormControlLabel, MenuItem, Stack, TextField } from '@mui/material';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { CrmCustomerDetail, CrmTag } from '@nless/shared/features/crm/types';
import type { MarketingConsent } from '@nless/shared/core/types';
import { FormDialog, PageHeader, useApiMutation, useApiQuery, useCan, useRealtime, useSession } from '../../core';
import { ProfileCard } from './CustomerPanel';

export default function CustomerDetailPage() {
  const { customerId } = useParams();
  const { currentBusiness } = useSession();
  return <CustomerDetail key={currentBusiness?.id + ':' + customerId} customerId={customerId ?? ''} />;
}

function CustomerDetail({ customerId }: { customerId: string }) {
  const { t } = useTranslation('crm');
  const path = '/crm/customers/' + encodeURIComponent(customerId ?? '');
  const customer = useApiQuery<CrmCustomerDetail>(path);
  const tags = useApiQuery<{ items: CrmTag[] }>('/crm/tags');
  const canEdit = useCan('chat.reply'), canManage = useCan('broadcast.tags');
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<MarketingConsent>('revoked');
  const [attestation, setAttestation] = useState(false);
  const [reason, setReason] = useState('');
  const update = useApiMutation<{ status: MarketingConsent; reason: string; attestation: boolean }, CrmCustomerDetail>('PUT', path + '/consent');
  useRealtime('custom', event => { if (event.featureId === 'F24') { customer.reload(); tags.reload(); } });
  if (customer.error || tags.error) return <Alert severity="error" action={<Button onClick={() => { customer.reload(); tags.reload(); }}>{t('retry')}</Button>}>{t('loadError')}</Alert>;
  if (!customer.data || !tags.data) return <CircularProgress aria-label={t('loading')} />;
  const record = customer.data;
  return <Stack spacing={2}>
    <PageHeader title={record.displayName || t('customer')} />
    <Button component={Link} to="/customers" sx={{ alignSelf: 'flex-start' }}>{t('allCustomers')}</Button>
    <ProfileCard detail={record} availableTags={tags.data.items} canEditTags={canEdit} canCreateTags={canManage} onChange={customer.reload} />
    {(canEdit || canManage) && <Button variant="outlined" onClick={() => { setOpen(true); setAttestation(false); setReason(''); setStatus(canEdit ? 'revoked' : 'unknown'); }}>{t('changeConsent')}</Button>}
    <FormDialog open={open} title={t('changeConsent')} submitting={update.running} error={status === 'granted' && (!attestation || !reason.trim()) ? t('grantRequirements') : null} onClose={() => setOpen(false)}
      onSubmit={async () => { if (status === 'granted' && (!attestation || !reason.trim())) return; await update.run({ status, attestation, reason }); setOpen(false); customer.reload(); }}>
      <TextField select value={status} label={t('consent')} onChange={event => setStatus(event.target.value as MarketingConsent)}>
        {(canManage ? (canEdit ? ['unknown', 'granted', 'revoked'] : ['unknown', 'granted']) : ['revoked']).map(s => <MenuItem key={s} value={s}>{t('consents.' + s)}</MenuItem>)}
      </TextField>
      {status === 'granted' && <FormControlLabel control={<Checkbox checked={attestation} onChange={e => setAttestation(e.target.checked)} required />} label={t('attest')} />}
      <TextField value={reason} required={status === 'granted'} label={t('reason')} onChange={e => setReason(e.target.value)} slotProps={{ htmlInput: { maxLength: 300 } }} />
    </FormDialog>
  </Stack>;
}
