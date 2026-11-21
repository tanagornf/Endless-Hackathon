import { useState } from 'react';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, InputAdornment, Stack, TextField, Typography } from '@mui/material';
import SearchOutlined from '@mui/icons-material/SearchOutlined';
import RefreshOutlined from '@mui/icons-material/RefreshOutlined';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { DataTable, EmptyState, SectionCard, StatusChip, formatDateTime, formatMoney } from '../core';
import { useApiQuery } from '../core';
import type { Panel, Screen } from './screens';
import { DashboardBreakdowns } from './DashboardBreakdowns';

type Row = Record<string, unknown>;
export function property(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((obj, key) => obj && typeof obj === 'object' && Object.hasOwn(obj, key) ? (obj as Row)[key] : undefined, value);
}
function useDisplay() {
  const { t, i18n } = useTranslation('integration');
  return (key: string, value: unknown): string => {
    if (value == null || value === '') return '—';
    if (typeof value === 'boolean') return t(value ? 'yes' : 'no');
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return '—';
      if (key.endsWith('Minor')) return formatMoney(value);
      if (key === 'usdMicros') return (value / 1_000_000).toLocaleString(i18n.language, { maximumFractionDigits: 6 });
      return value.toLocaleString(i18n.language);
    }
    if (Array.isArray(value)) return value.map(v => typeof v === 'object' && v ? v.name : v).filter(v => typeof v === 'string').join(', ') || '—';
    if (typeof value !== 'string') return '—';
    if (key.endsWith('At') || key === 'scheduledFor') return Number.isNaN(Date.parse(value)) ? '—' : formatDateTime(value);
    return value;
  };
}

export function ServiceAlert({ code, retry }: { code?: string; retry: () => void }) {
  const { t } = useTranslation('integration');
  const unavailable = code === 'NOT_FOUND' || code === 'SERVICE_NOT_READY' || code === 'INTERNAL';
  return <Alert severity={unavailable ? 'info' : 'warning'} action={<Button color="inherit" onClick={retry}>{t('retry')}</Button>}>
    {unavailable ? t(import.meta.env.VITE_UI_PREVIEW === '1' ? 'unavailablePreview' : 'unavailable') : t('common:errors.' + code, { defaultValue: t('common:errors.generic') })}
  </Alert>;
}

export function ResourcePanel({ screen, panel, endpoint, onRow }: { screen: Screen; panel: Panel; endpoint: string; onRow?: (row: Row) => void }) {
  const { t } = useTranslation('integration');
  const [search, setSearch] = useState('');
  const [pages, setPages] = useState<string[]>([]);
  const [detail, setDetail] = useState<Row | null>(null);
  const navigate = useNavigate();
  const cursor = pages.at(-1);
  const result = useApiQuery<unknown>(endpoint + (cursor ? (endpoint.includes('?') ? '&' : '?') + 'cursor=' + encodeURIComponent(cursor) : ''), { businessScoped: false });
  const display = useDisplay();
  const fields = panel.fields.split(' ').map(field => {
    const [path, label = path] = field.split(':');
    return { path, label, title: t('field.' + label) };
  });
  const raw = panel.rows ? property(result.data, panel.rows) : result.data;
  const rows = Array.isArray(raw) ? raw.filter((row): row is Row => Boolean(row && typeof row === 'object')) : [];
  const malformed = result.data != null && (panel.rows !== null ? !Array.isArray(raw) : typeof result.data !== 'object');
  const matches = rows.filter(row => fields.some(({ label, path }) => display(label, property(row, path)).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())));
  const next = property(result.data, 'nextCursor');
  const valueOf = (row: unknown, field: typeof fields[number]) => display(field.label, property(row, field.path));
  const empty = <EmptyState title={t(search ? 'noMatches' : 'empty')} />;
  const overview = panel.rows === null;
  const shopOverview = overview && screen.key === 'dashboard';
  function choose(row: Row) {
    if (onRow) { onRow(row); return; }
    if (screen.key === 'customers' && typeof row.id === 'string') { navigate('/customers/' + encodeURIComponent(row.id)); return; }
    if (screen.key === 'imports' && typeof row.id === 'string') { navigate('/imports/' + encodeURIComponent(row.id)); return; }
    setDetail(row);
  }
  return <Stack spacing={2}>
    {result.error && <ServiceAlert code={result.error.error.code} retry={result.reload} />}
    {malformed && <Alert severity="error">{t('unavailableFormat')}</Alert>}
    {overview ? <SectionCard title={t('tabs.' + panel.label)} actions={<Button startIcon={<RefreshOutlined />} onClick={result.reload}>{t('refresh')}</Button>}>
      {result.loading ? <CircularProgress size={24} /> : result.data === null ? empty :
        <Box component="dl" sx={{ m: 0, display: 'grid', gap: shopOverview ? { xs: 1, sm: 2 } : 2,
          gridTemplateColumns: shopOverview ? { xs: 'repeat(2,minmax(0,1fr))', md: 'repeat(4,minmax(0,1fr))' }
            : 'repeat(auto-fit,minmax(min(165px,100%),1fr))' }}>
          {fields.map(field => <Box key={field.path} sx={{ p: 2, bgcolor: '#F1F6F4', borderRadius: 1 }}>
            <Typography component="dt" variant="body2" color="text.secondary">{field.title}</Typography>
            <Typography component="dd" sx={{ m: 0, mt: .5, color: 'primary.dark', fontSize: shopOverview ? '1.75rem' : '1.2rem',
              fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{valueOf(result.data, field)}</Typography>
          </Box>)}
        </Box>}
    </SectionCard> : <>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <TextField value={search} onChange={event => setSearch(event.target.value)} label={t('filter')} sx={{ maxWidth: 340, flex: 1 }}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchOutlined fontSize="small" /></InputAdornment> } }} />
        <Button startIcon={<RefreshOutlined />} onClick={result.reload}>{t('refresh')}</Button>
      </Stack>
      <DataTable rows={matches} loading={result.loading} rowKey={row => String(row.id ?? row.conversationId ?? row.turnId ?? row.userId ?? rows.indexOf(row))}
        empty={result.error || malformed ? <Typography sx={{ p: 2, textAlign: 'center' }} color="text.secondary">—</Typography> : empty}
        onRowClick={choose} columns={fields.map(field => ({ key: field.path, header: field.title, render: row => {
          const value = valueOf(row, field);
          return ['status','state'].includes(field.label) && value !== '—' ? <StatusChip status={value} /> : value;
        } }))} />
      {(pages.length > 0 || typeof next === 'string' && next) && <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
        <Button disabled={!pages.length || result.loading} onClick={() => setPages(p => p.slice(0,-1))}>{t('previous')}</Button>
        <Button disabled={!next || result.loading} onClick={() => { if (typeof next === 'string' && next !== cursor) setPages(p => [...p,next]); }}>{t('next')}</Button>
      </Stack>}
    </>}
    {shopOverview && <DashboardBreakdowns
      daily={property(result.data, 'daily')} channels={property(result.data, 'channels')} loading={result.loading} />}
    <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} fullWidth maxWidth="sm" aria-labelledby="row-detail">
      <DialogTitle id="row-detail">{t('details')}</DialogTitle>
      <DialogContent dividers><Box component="dl" sx={{ m: 0 }}>{fields.map(f => <Box key={f.path} sx={{ mb: 1.5 }}>
        <Typography variant="caption" component="dt" color="text.secondary">{f.title}</Typography>
        <Typography component="dd" sx={{ ml: 0 }}>{valueOf(detail, f)}</Typography></Box>)}</Box></DialogContent>
      <DialogActions><Button onClick={() => setDetail(null)}>{t('close')}</Button></DialogActions>
    </Dialog>
  </Stack>;
}
