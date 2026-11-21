import { Box, Button, Stack, TextField } from '@mui/material';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { ApiQueryState, DataTableColumn, ToastApi } from '../types';
import { DataTable, EmptyState } from '../ui';
import { getFailure } from '../ui/toast';
import { formatDateTime } from '../format';

export const platformScope = { businessScoped: false } as const;
export const actionSize = { minHeight: 44 };
export const dash = '—';

export function opsPath(path: string, filters: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  return params.size ? `${path}?${params}` : path;
}

export function opsDate(value: string | null) {
  return value ? formatDateTime(value) : dash;
}

export function useVisiblePolling({ loading, reload }: Pick<ApiQueryState<unknown>, 'loading' | 'reload'>, enabled = true) {
  const refresh = useCallback(() => {
    if (enabled && !loading && document.visibilityState === 'visible') reload();
  }, [enabled, loading, reload]);
  useEffect(() => {
    if (!enabled || loading) return;
    const timer = window.setInterval(refresh, 5000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [enabled, loading, refresh]);
  return refresh;
}

export function reportUnavailableAction(error: unknown, t: TFunction<'ops'>, toast: ToastApi) {
  const failure = getFailure(error)?.error;
  const reason = failure?.details?.reason;
  if (failure?.code === 'NOT_FOUND') {
    toast.error(t('policy.notFound'));
    return true;
  }
  if (failure?.code === 'POLICY_BLOCKED' && (reason === 'job_running' || reason === 'job_finished' || reason === 'not_unknown' || reason === 'line_resend_unavailable')) {
    toast.error(t('policy.' + reason));
    return true;
  }
  toast.error(error);
  return false;
}

export function useSearchFilter() {
  const [input, setInput] = useState('');
  const [filter, setFilter] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setFilter(input.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [input]);
  return { input, setInput, filter };
}

export function OpsSearch({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <TextField size="small" type="search" label={label} value={value}
    onChange={(event) => onChange(event.target.value)} slotProps={{ htmlInput: { maxLength: 80 } }} />;
}

export function OpsError({ reload }: { reload: () => void }) {
  const { t } = useTranslation('ops');
  return <Box role="alert"><EmptyState title={t('error.load')} action={
    <Button onClick={reload} sx={actionSize}>{t('error.retry')}</Button>
  } /></Box>;
}

export function OpsTable<T>({ columns, rows, query, rowKey, empty }: {
  columns: DataTableColumn<T>[];
  rows: T[];
  query: Pick<ApiQueryState<unknown>, 'error' | 'loading' | 'reload'>;
  rowKey: (row: T) => string;
  empty?: string;
}) {
  const { t } = useTranslation('ops');
  if (query.error) return <OpsError reload={query.reload} />;
  return <Box sx={{ minWidth: 0 }}>
    <DataTable columns={columns} rows={rows} rowKey={rowKey} loading={query.loading}
      empty={<EmptyState title={empty ?? t('table.empty')} />} />
  </Box>;
}

export function Pagination({ cursor, nextCursor, onChange }: {
  cursor?: string;
  nextCursor?: string | null;
  onChange: (cursor?: string) => void;
}) {
  const { t } = useTranslation('ops');
  if (!cursor && !nextCursor) return null;
  return <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
    {cursor && <Button sx={actionSize} onClick={() => onChange()}>{t('table.firstPage')}</Button>}
    <Button sx={actionSize} disabled={!nextCursor} onClick={() => onChange(nextCursor ?? undefined)}>{t('table.nextPage')}</Button>
  </Stack>;
}
