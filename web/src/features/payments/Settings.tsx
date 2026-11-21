import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Checkbox, FormControlLabel, MenuItem, Stack, TextField, Typography } from '@mui/material';
import type { PaymentSettingsView } from '@nless/shared/features/payments/types';
import { FormDialog, SectionCard, useApiMutation, useToast } from '../../core';
type Input = {
  expectedVersion:number; promptpayKind:PaymentSettingsView['promptpayKind']; promptpayId:string|null;
  receiverName:string; includeReference:boolean; requestTtlMinutes:number;
};
export default function Settings({value,reload}:{value:PaymentSettingsView;reload:()=>void}) {
  const {t}=useTranslation('payments');
  const toast=useToast();
  const [edit,setEdit]=useState(false);
  const [form,setForm]=useState<Input>({expectedVersion:value.version,promptpayKind:value.promptpayKind,promptpayId:null,
    receiverName:value.receiverName,includeReference:value.includeReference,requestTtlMinutes:value.requestTtlMinutes});
  const [preview,setPreview]=useState('');
  const save=useApiMutation<Input,PaymentSettingsView>('PUT','/payments/settings');
  const qr=useApiMutation<Record<string,never>,{pngBase64:string}>('POST','/payments/settings/test-qr');
  return <SectionCard title={t('settings.title')}>
    <Stack spacing={2}>
      <Typography>{value.configured ? [value.receiverName,value.promptpayMasked].filter(Boolean).join(' · ') : t('settings.unconfigured')}</Typography>
      <Stack direction="row" sx={{gap:1,flexWrap:'wrap'}}>
        <Button variant="outlined" onClick={()=>setEdit(true)}>{t('settings.edit')}</Button>
        {value.configured && <Button variant="outlined" disabled={qr.running} onClick={()=>void qr.run({}).then(result=>setPreview(result.pngBase64)).catch(()=>{})}>{t('settings.preview')}</Button>}
      </Stack>
      {preview && <><Alert severity="warning">{t('pay.test')}</Alert><img src={'data:image/png;base64,'+preview} alt={t('pay.qr')} width="192" height="192"/></>}
    </Stack>
    <FormDialog open={edit} title={t('settings.title')} submitting={save.running} onClose={()=>setEdit(false)}
      onSubmit={async()=>{try{await save.run(form);setEdit(false);toast.success(t('settings.saved'));reload();}catch{ /* core displays failure */ }}}>
      <TextField select label={t('settings.kind')} value={form.promptpayKind??''}
        onChange={event=>setForm({...form,promptpayKind:(event.target.value||null) as Input['promptpayKind'],promptpayId:null})}>
        {['','mobile','national_id','ewallet'].map(kind=><MenuItem key={kind} value={kind}>{t('settings.'+(kind || 'off'))}</MenuItem>)}
      </TextField>
      {!!form.promptpayKind && <TextField label={t('settings.id')} value={form.promptpayId??''} autoComplete="off"
        placeholder={form.promptpayKind===value.promptpayKind?value.promptpayMasked??'':''}
        onChange={event=>setForm({...form,promptpayId:event.target.value||null})}/>}
      <TextField label={t('settings.receiver')} value={form.receiverName} onChange={event=>setForm({...form,receiverName:event.target.value})}/>
      <TextField type="number" label={t('settings.ttl')} value={form.requestTtlMinutes} onChange={event=>setForm({...form,requestTtlMinutes:Number(event.target.value)})}/>
      <FormControlLabel control={<Checkbox checked={form.includeReference} onChange={event=>setForm({...form,includeReference:event.target.checked})}/>} label={t('settings.reference')}/>
    </FormDialog>
  </SectionCard>;
}
