import { Alert, Box, Button, CircularProgress, Stack, TextField, Typography } from '@mui/material';
import { createPortal } from 'react-dom';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PackingAddress, PackingOrder, PackingUpdate } from '@nless/shared/features/orders/packing';
import { FormDialog, PageHeader, SectionCard, useApiMutation, useApiQuery, useSession } from '../../core';
import './packing.css';

const fields = ['name','phone','line1','line2','district','province','postalCode'] as const;
const bangkokDateTime = (value: Date) => new Date(value.getTime() + 7 * 3600_000).toISOString().slice(0,16);

function EditPacking({ order, close, reload }: { order: PackingOrder; close: () => void; reload: () => void }) {
  const { t } = useTranslation('orders');
  const [address, setAddress] = useState<PackingAddress>(order.address ?? {});
  const [shipByAt, setDeadline] = useState(order.shipByAt ? bangkokDateTime(new Date(order.shipByAt)) : '');
  const save = useApiMutation<PackingUpdate, {version:number}>('PUT','/orders/packing/' + order.id);
  return <FormDialog open title={t('pack.edit') + ' · ' + order.number} onClose={close} submitting={save.running}
    error={save.error ? t('pack.saveError') : null} onSubmit={async () => {
      await save.run({ expectedVersion:order.version, shipByAt:shipByAt ? new Date(shipByAt + ':00+07:00').toISOString() : null, address });
      reload(); close();
    }}>
    <TextField type="datetime-local" label={t('pack.deadline')} value={shipByAt} onChange={e => setDeadline(e.target.value)} slotProps={{inputLabel:{shrink:true}}}/>
    {fields.map(key => <TextField key={key} label={t('pack.' + key)} value={address[key] ?? ''}
      onChange={e => setAddress({...address,[key]:e.target.value})} />)}
  </FormDialog>;
}

function OrderDetails({ order, day }: { order: PackingOrder; day: string }) {
  const { t } = useTranslation('orders');
  const address = order.address;
  const local = order.shipByAt ? bangkokDateTime(new Date(order.shipByAt)) : null;
  return <div className="packing-row">
    <strong>{order.number}</strong> · {t('pack.' + order.status)}
    <div>{t('pack.deadline')} · {local ? local.replace('T',' ') : t('pack.noDeadline')}
      {local && local.slice(0,10) < day && ' · ' + t('pack.carried')}</div>
    <div>{[address?.name,address?.phone].filter(Boolean).join(' · ') || t('pack.noRecipient')}</div>
    <div>{[address?.line1,address?.line2,address?.district,address?.province,address?.postalCode].filter(Boolean).join(' ')}</div>
    {(!address?.name || !address.line1 || !address.postalCode) && <strong>{t('pack.incomplete')}</strong>}
    <ul>{order.items.map((line,idx) => <li key={idx}>{line.name} · {line.sku} × {line.quantity}</li>)}</ul>
  </div>;
}

function Queue() {
  const { t } = useTranslation('orders');
  const { currentBusiness, permissions } = useSession();
  const [day,setDay] = useState(() => bangkokDateTime(new Date()).slice(0,10));
  const [editing,setEditing] = useState<PackingOrder | null>(null);
  const report = useApiQuery<{day:string;items:PackingOrder[]}>(day ? '/orders/packing?day=' + day : null);
  const rows = report.data?.day === day && !report.loading && !report.error ? report.data.items : undefined;
  const shopName = currentBusiness?.name ?? '';
  const count = rows?.reduce((n,row) => n + row.items.reduce((s,item) => s+item.quantity,0),0) ?? 0;
  const summary = t('pack.summary',{orders: rows?.length ?? 0, pieces:count});
  return <Stack spacing={2}>
    <PageHeader title={t('pack.title')} description={t('pack.scope')} />
    <Stack direction="row" sx={{ alignItems: 'center', flexWrap: 'wrap' }} spacing={2}>
      <TextField type="date" label={t('pack.day')} value={day} onChange={e => setDay(e.target.value)} slotProps={{inputLabel:{shrink:true}}} />
      <Button variant="contained" disabled={!rows?.length} onClick={() => window.print()}>{t('pack.print')}</Button>
    </Stack>
    {report.loading && <CircularProgress aria-label={t('pack.loading')} />}
    {report.error && <Alert severity="error" action={<Button onClick={report.reload}>{t('pack.retry')}</Button>}>{t('pack.error')}</Alert>}
    {rows && <><Typography>{summary}</Typography>{rows.length===0 && <Alert severity="info">{t('pack.empty')}</Alert>}
      {rows.map(order => <SectionCard key={order.id}><OrderDetails order={order} day={day}/>
        {permissions.includes('orders.write') && <Button onClick={() => setEditing(order)}>{t('pack.edit')}</Button>}
      </SectionCard>)}</>}
    {editing && <EditPacking key={editing.id} order={editing} close={() => setEditing(null)} reload={report.reload}/>}
    {rows && createPortal(<Box className="packing-print">
      <h1>{t('pack.title')} · {shopName}</h1><p>{day} · Asia/Bangkok · {summary}</p><p>{t('pack.scope')}</p>
      {rows.map(order => <OrderDetails key={order.id} order={order} day={day}/>)}
    </Box>,document.body)}
  </Stack>;
}
export default function PackingPage() {
  const { currentBusiness } = useSession();
  return <Queue key={currentBusiness?.id}/>;
}
