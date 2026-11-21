import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button, CircularProgress, Stack, Tab, Tabs } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import type { PaymentRequestRow, PaymentSettingsView } from '@nless/shared/features/payments/types';
import { DataTable, EmptyState, formatDateTime, formatMoney, PageHeader, SectionCard, StatusChip, useApiQuery, useCan } from '../../core';
import Settings from './Settings';
import SlipReview from './SlipReview';
type Page={items:PaymentRequestRow[];nextCursor:string|null};
type Filter='pending_verification'|'open'|'paid'|'all'|'settings';
export default function PaymentsPage() {
  const {t}=useTranslation('payments');
  const [search, setSearch] = useSearchParams();
  const requestId = search.get('request');
  function selectRequest(id: string | null) {
    setSearch(id ? { request: id } : {}, { replace: true });
  }
  const canConfigure=useCan('business.commerce');
  const [tab,setTab]=useState<Filter>('pending_verification');
  const [cursors,setCursors]=useState<string[]>([]);
  const filter:Filter=tab==='settings'&&!canConfigure?'all':tab;
  const query=new URLSearchParams();
  if(filter!=='all'&&filter!=='settings') query.set('state',filter);
  if(cursors.length) query.set('cursor',cursors.at(-1)!);
  const list=useApiQuery<Page>(filter==='settings'?null:'/payments?'+query.toString());
  const config=useApiQuery<PaymentSettingsView>(canConfigure && filter==='settings'?'/payments/settings':null);
  return <Stack spacing={2}>
    <PageHeader title={t('page.title')}/>
    {requestId && <SlipReview key={requestId} requestId={requestId} onClose={() => selectRequest(null)} onChanged={list.reload} />}
    <Tabs value={filter} onChange={(_,value:Filter)=>{setTab(value);setCursors([]);}} variant="scrollable" scrollButtons="auto">
      {(['pending_verification','open','paid','all',...(canConfigure?['settings']:[])] as Filter[]).map(key=><Tab key={key} value={key} label={t('tabs.'+key)}/>)}
    </Tabs>
    {filter==='settings' ? (config.error?<Alert severity="error" action={<Button onClick={config.reload}>{t('retry')}</Button>}>{t('failed')}</Alert>:
      config.data?<Settings key={config.data.businessId+':'+config.data.version} value={config.data} reload={config.reload}/>:<CircularProgress aria-label={t('loading')}/>) :
      <SectionCard>
        {list.error ? <Alert severity="error" action={<Button onClick={list.reload}>{t('retry')}</Button>}>{t('failed')}</Alert> :
          <DataTable rows={list.data?.items??[]} rowKey={row=>row.id} loading={list.loading} empty={<EmptyState title={t('empty')}/>}
            columns={[{key:'orderNumber',header:t('columns.order')},{key:'customerName',header:t('columns.customer')},
              {key:'amountMinor',header:t('columns.amount'),align:'right',render:row=>formatMoney(row.amountMinor)},
              {key:'state',header:t('columns.state'),render:row=><StatusChip status={row.state} label={t('states.'+row.state)}/>},
              {key:'expiresAt',header:t('columns.expires'),render:row=>formatDateTime(row.expiresAt)},
              {key:'mode',header:t('columns.mode'),render:row=>t('modes.'+row.mode)},
              {key:'id',header:t('slips.details'),render:row=><Button onClick={() => selectRequest(row.id)}>{t('slips.open')}</Button>}]}/>}
        <Stack direction="row" spacing={1}>
          {!!cursors.length && <Button onClick={()=>setCursors(cursors.slice(0,-1))}>{t('previous')}</Button>}
          {list.data?.nextCursor && <Button onClick={()=>setCursors([...cursors,list.data!.nextCursor!])}>{t('next')}</Button>}
        </Stack>
      </SectionCard>}
  </Stack>;
}
