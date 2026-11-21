import { Alert, Button, LinearProgress, Stack } from '@mui/material';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { CatalogItemAdminDetail } from '@nless/shared/features/catalog/types';
import {
  ConfirmDialog, EmptyState, PageHeader, SectionCard, StatusChip, formatDateTime, useApiMutation,
  useApiQuery, useCan, useSession, useToast,
} from '../../core';
import CatalogFields, { catalogFields, catalogValues } from './CatalogFields';
import type { CatalogFieldsState } from './CatalogFields';

type PatchInput = Pick<CatalogItemAdminDetail, 'sku' | 'name' | 'nameEn' | 'priceMinor' | 'active'> & { expectedVersion: number };

function Editor({ id }: { id: string }) {
  const { t } = useTranslation('catalog');
  const navigate = useNavigate();
  const toast = useToast();
  const canWrite = useCan('product.write');
  const path = '/catalog/items/' + id;
  const query = useApiQuery<CatalogItemAdminDetail>(path);
  const patch = useApiMutation<PatchInput, CatalogItemAdminDetail>('PATCH', path, { toastOnError: false });
  const [item, setItem] = useState<CatalogItemAdminDetail>();
  const [fields, setFields] = useState<CatalogFieldsState>();
  const [confirm, setConfirm] = useState<'price' | 'leave' | null>(null);
  const [pending, setPending] = useState<PatchInput>();
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  useEffect(() => {
    if (query.data) {
      setItem(query.data);
      setFields(catalogFields(query.data));
    }
  }, [query.data]);
  const dirty = !!(item && fields && JSON.stringify(fields) !== JSON.stringify(catalogFields(item)));
  useEffect(() => {
    if (!dirty) return;
    const onLeave = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [dirty]);

  async function persist(input: PatchInput) {
    try {
      const saved = await patch.run(input);
      setItem(saved);
      setFields(catalogFields(saved));
      setError(null);
      setConflict(false);
      toast.success(t('toast.saved'));
    } catch (cause) {
      const response = cause && typeof cause === 'object' ? cause : {};
      if ('code' in response && response.code === 'VERSION_CONFLICT') {
        setConflict(true);
        setError(null);
      } else {
        const details = 'details' in response ? response.details : null;
        const skuTaken = details && typeof details === 'object' && 'code' in details && details.code === 'sku_taken';
        setError(t(skuTaken ? 'error.skuTaken' : 'error.save'));
      }
      throw cause;
    }
  }
  function save() {
    if (!item || !fields || !dirty || patch.running || conflict) return;
    const parsed = catalogValues(fields, false);
    if (parsed.error) {
      setError(t(parsed.error));
      return;
    }
    const { name, nameEn, sku, priceMinor, active } = parsed.data;
    const values = { expectedVersion: item.version, name, nameEn, sku, priceMinor, active };
    if (priceMinor !== item.priceMinor) {
      setPending(values);
      setConfirm('price');
    } else {
      void persist(values).catch(() => {});
    }
  }

  const retry = <Button onClick={query.reload}>{t('common:actions.retry')}</Button>;
  if (!item || !fields) return query.error
    ? <EmptyState title={t('list.error')} action={retry} />
    : <LinearProgress />;

  function reloadLatest() {
    setConflict(false);
    setError(null);
    setItem(undefined);
    setFields(undefined);
    query.reload();
  }
  return <>
    <PageHeader title={item.name} description={item.sku} actions={<Button onClick={() => {
      if (dirty) setConfirm('leave');
      else navigate('/catalog');
    }}>{t('actions.back')}</Button>} />
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <StatusChip status={item.active ? 'active' : 'inactive'} />
        <span>{t('editor.version', { version: item.version })}</span>
      </Stack>
      <SectionCard title={t('editor.details')}>
        <Stack spacing={2}>
          {conflict && <Alert severity="warning" action={<Button onClick={reloadLatest}>{t('actions.reload')}</Button>}>
            {t('error.conflict')}
          </Alert>}
          {error && <Alert severity="error">{error}</Alert>}
          <CatalogFields value={fields} disabled={!canWrite || patch.running} creating={false}
            onChange={(change) => setFields((old) => old && ({ ...old, ...change }))} />
          <span>{t('editor.priceChanged', { at: formatDateTime(item.priceChangedAt) })}</span>
          {canWrite && <Button variant="contained" sx={{ alignSelf: 'start' }} disabled={!dirty || patch.running || conflict}
            onClick={save}>{t('actions.save')}</Button>}
        </Stack>
      </SectionCard>
    </Stack>
    {canWrite && <ConfirmDialog open={confirm === 'price'} title={t('confirm.priceTitle')} message={t('confirm.priceMessage')}
      confirmLabel={t('actions.save')} onClose={() => setConfirm(null)} onConfirm={async () => {
        if (!pending) return;
        try { await persist(pending); } finally { setConfirm(null); }
      }} />}
    <ConfirmDialog open={confirm === 'leave'} title={t('confirm.leaveTitle')} message={t('confirm.leaveMessage')}
      confirmLabel={t('actions.leave')} onClose={() => setConfirm(null)} onConfirm={() => navigate('/catalog')} />
  </>;
}

export default function CatalogEditPage() {
  const { itemId } = useParams();
  const businessId = useSession().currentBusiness?.id;
  return businessId && itemId ? <Editor key={businessId + ':' + itemId} id={itemId} /> : null;
}
