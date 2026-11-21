import { useState } from 'react';
import { Alert, Button, Stack, Tab, Tabs, TextField } from '@mui/material';
import { matchPath, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, DataTable, EmptyState, PageHeader, SectionCard, useApiMutation, useSession, useSlot } from '../core';
import { SlotItem } from '../core/layout/AppShell';
import { ResourcePanel } from './ResourcePanel';
import { screens } from './screens';
import type { Screen } from './screens';
import AccessPage from './AccessPage';
import DemoChat from './DemoChat';
import PublicPayment from './PublicPayment';
import { FeatureVisibility } from './FeatureVisibility';

function SearchTest() {
  const { t } = useTranslation('integration');
  const [question,setQuestion] = useState('');
  const [hits,setHits] = useState<{title:string;snippet:string;score:number}[] | null>(null);
  const search = useApiMutation<{query:string},{hits:NonNullable<typeof hits>}>('POST','/knowledge-search/search');
  return <SectionCard title={t('query')}><Stack spacing={2} component="form" onSubmit={async e => {
    e.preventDefault();
    if (search.running || !question.trim()) return;
    setHits(null);
    try {setHits((await search.run({query:question.trim()})).hits);} catch { /* core toast */ }
  }}>
    <TextField label={t('query')} value={question} onChange={e => setQuestion(e.target.value)} slotProps={{htmlInput:{maxLength:500}}} />
    <Button type="submit" variant="contained" sx={{alignSelf:'start'}} disabled={!question.trim() || search.running}>{t('search')}</Button>
    {hits && <DataTable rows={hits} rowKey={item => hits.indexOf(item).toString()} columns={[
      {key:'title',header:t('field.title')},{key:'snippet',header:t('field.summary')},{key:'score',header:t('field.score')},
    ]} />}
  </Stack></SectionCard>;
}
function DateFilter({ apply }: { apply: (query:string) => void }) {
  const { t } = useTranslation('integration');
  const [from,setFrom] = useState('');
  const [to,setTo] = useState('');
  const invalid = Boolean(from && to && (to < from || (Date.parse(to)-Date.parse(from))/86400000 > 92));
  return <Stack component="form" spacing={1} onSubmit={e => {
    e.preventDefault(); if (!invalid) apply(from && to ? '?from=' + from + '&to=' + to : '');
  }}><Stack direction={{xs:'column',sm:'row'}} spacing={1.5}>
    <TextField type="date" label={t('from')} value={from} required={Boolean(to)} onChange={e => setFrom(e.target.value)} slotProps={{inputLabel:{shrink:true}}} />
    <TextField type="date" label={t('to')} value={to} required={Boolean(from)} onChange={e => setTo(e.target.value)} slotProps={{inputLabel:{shrink:true}}} />
    <Button type="submit" variant="outlined" disabled={invalid}>{t('apply')}</Button>
  </Stack>{invalid && <Alert severity="warning">{t('dateError')}</Alert>}</Stack>;
}
function MerchantScreen({ screen }: {screen:Screen}) {
  const { t } = useTranslation('integration');
  const { currentBusiness,permissions } = useSession();
  const params = useParams();
  const [url,setUrl] = useSearchParams();
  const [range,setRange] = useState('');
  const [revision,setRevision] = useState(0);
  const panels = screen.panels.filter(p => !p.permission || permissions.includes(p.permission));
  const panel = panels.find(p => p.label === url.get('tab')) ?? panels[0];
  const dashboard = useSlot('dashboardCards');
  const business = useSlot('businessTabs');
  const channels = useSlot('channelCards');
  const read = useApiMutation<{all:true},unknown>('POST','/notifications/read');
  if (!screen.global && !currentBusiness) return <EmptyState title={t('common:pages.noBusiness')} />;
  if (screen.permission && !permissions.includes(screen.permission)) return <EmptyState title={t('common:pages.forbidden')} />;
  if (!panel) return <EmptyState title={t('noAccess')} />;
  const path = panel.endpoint.replace(/:([A-Za-z]+)/g, (_,key:string) => encodeURIComponent(params[key] ?? ''));
  const endpoint = (screen.global ? path : api.biz(path)) + range;
  const slots = screen.key === 'dashboard' ? dashboard : screen.key === 'business' ? business : screen.key === 'line' ? channels : [];
  return <Stack spacing={2.5}>
    <PageHeader title={t('page.' + screen.key + '.title')} description={t('page.' + screen.key + '.description')} />
    {screen.key === 'search' && <SearchTest />}
    {['voice','call'].includes(screen.key) && <Alert severity="info">{t('unavailableVoice')}</Alert>}
    {['dashboard','usage','insights'].includes(screen.key) && <DateFilter apply={setRange} />}
    {panels.length > 1 && <Tabs value={panel.label} variant="scrollable" scrollButtons="auto" aria-label={t('page.' + screen.key + '.title')}
      onChange={(_,label:string) => setUrl(prev => {const next=new URLSearchParams(prev);next.set('tab',label);return next;})}>
      {panels.map(p => <Tab key={p.label} value={p.label} label={t('tabs.' + p.label)} />)}
    </Tabs>}
    {screen.key === 'notifications' && <Button sx={{alignSelf:'end'}} disabled={read.running} onClick={async () => {
      try {await read.run({all:true});setRevision(v => v+1);} catch { /* core toast */ }
    }}>{t('readAll')}</Button>}
    {screen.key === 'ops' && panel.label === 'features' ? <FeatureVisibility /> :
      <ResourcePanel key={endpoint + panel.label + revision} screen={screen} panel={panel} endpoint={endpoint} />}
    {slots.map(entry => <SlotItem key={entry.id} entry={entry} props={{businessId:currentBusiness?.id}} />)}
  </Stack>;
}
export default function PreparedPage() {
  const { pathname } = useLocation();
  const { t } = useTranslation('integration');
  const screen = screens.find(item => matchPath({path:item.path,end:true},pathname));
  if (!screen) return <EmptyState title={t('common:pages.notFound')} />;
  if (screen.id === 'F02' || screen.key === 'invite') return <AccessPage key={pathname} mode={screen.key} />;
  if (screen.key === 'publicChat' || screen.key === 'demo') return <DemoChat key={pathname} guest={screen.key==='publicChat'} />;
  if (screen.key === 'publicPay') return <PublicPayment key={pathname} />;
  return <MerchantScreen key={pathname} screen={screen} />;
}
