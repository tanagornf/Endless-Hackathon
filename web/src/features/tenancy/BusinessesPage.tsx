import LockOutlined from '@mui/icons-material/LockOutlined';
import { Alert, Button, CircularProgress, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { demoBusinesses } from './demo-businesses';
import type { ApiFailure } from '@nless/shared/core/types';
import type { MyBusinessRow } from '@nless/shared/features/tenancy/types';
import { ConfirmDialog, EmptyState, FormDialog, PageHeader, SectionCard, StatusChip, useApiMutation, useApiQuery, useSession, useToast } from '../../core';


const defaultInput = { name: '', timezone: 'Asia/Bangkok', language: 'th' as 'th' | 'en' };
const options = { businessScoped: false, toastOnError: false };

export default function BusinessesPage() {
  const { t } = useTranslation('tenancy');
  const { businesses, currentBusiness, refresh, selectBusiness } = useSession();
  const toast = useToast();
  const navigate = useNavigate();
  const list = useApiQuery<{ items: MyBusinessRow[] }>('/businesses', { businessScoped: false });
  const add = useApiMutation<typeof defaultInput, MyBusinessRow>('POST', '/businesses', options);
  const remove = useApiMutation<{ businessId: string; confirmName: string }, void>(
    'DELETE', ({ businessId, confirmName }) =>
      '/businesses/' + encodeURIComponent(businessId) + '?' + new URLSearchParams({ confirmName }), options,
  );
  const [adding, setAdding] = useState(false);
  const [input, setInput] = useState(defaultInput);
  const [createError, setCreateError] = useState<string | null>(null);
  const [target, setTarget] = useState<MyBusinessRow | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const items = list.data?.items ?? [];

  useEffect(() => {
    if (!createdId || !businesses.some(({ business }) => business.id === createdId)) return;
    selectBusiness(createdId);
    setCreatedId(null);
    navigate('/onboarding');
  }, [businesses, createdId, selectBusiness, navigate]);

  function errorKey(error: unknown): string {
    const failure = (error as { failure?: ApiFailure })?.failure?.error;
    const reason = failure?.details?.reason;
    if (typeof reason === 'string') return 'businesses.block.' + reason;
    if (failure?.code === 'BUSINESS_INACTIVE') return 'businesses.block.inactive';
    const issues = failure?.details?.issues;
    if (Array.isArray(issues)) {
      if (issues.some((issue) => issue?.code === 'confirm_name_mismatch')) return 'businesses.confirmMismatch';
      if (issues.some((issue) => Array.isArray(issue?.path) && issue.path[0] === 'timezone')) return 'businesses.timezoneError';
      if (issues.some((issue) => Array.isArray(issue?.path) && issue.path[0] === 'name')) return 'businesses.nameError';
    }
    return 'businesses.error';
  }

  async function submit() {
    if (input.name.trim().length < 2 || input.name.trim().length > 80) {
      setCreateError('businesses.nameError');
      return;
    }
    setCreateError(null);
    try {
      const result = await add.run({ ...input, timezone: input.timezone.trim() });
      setAdding(false);
      list.reload();
      toast.success(t('businesses.created'));
      setCreatedId(result.businessId);
      await refresh();
    } catch (failure) {
      setCreateError(errorKey(failure));
    }
  }

  async function confirmDelete() {
    if (!target) return;
    if (confirmation !== target.name) {
      setDeleteError('businesses.confirmMismatch');
      throw new Error('Confirmation name mismatch');
    }
    try {
      await remove.run({ businessId: target.businessId, confirmName: confirmation });
      list.reload();
      toast.success(t('businesses.deleted'));
      await refresh();
    } catch (failure) {
      setDeleteError(errorKey(failure));
      throw failure;
    }
  }

  return (
    <Stack spacing={2}>
      <PageHeader title={t('businesses.title')} actions={items.some((row) => row.isCurrentAccount) &&
        <Button variant="contained" onClick={() => {
          setInput(defaultInput);
          setCreateError(null);
          setAdding(true);
        }}>{t('businesses.add')}</Button>
      } />
      {list.error
        ? <EmptyState title={t('businesses.error')} action={<Button onClick={list.reload}>{t('common:actions.retry')}</Button>} />
        : list.loading || !list.data
          ? <CircularProgress size={24} aria-label={t('businesses.loading')} />
          : items.length === 0 && <EmptyState title={t('businesses.empty')} />}
      {items.map((row) => {
        const selected = currentBusiness?.id === row.businessId;
        const membership = businesses.find(({ business }) => business.id === row.businessId);
        const protectedShop = demoBusinesses.has(row.businessId);
        return (
          <SectionCard key={row.businessId} title={row.name}
            actions={selected ? <StatusChip status="active" label={t('businesses.current')} /> : undefined}>
            <Stack spacing={1}>
              <Typography>{t('role.' + row.role)}</Typography>
              {!membership && <StatusChip status="inactive" label={t('businesses.block.inactive')} />}
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
                {!selected && membership && <Button onClick={() => selectBusiness(row.businessId)}>{t('businesses.switch')}</Button>}
                {membership?.permissions.includes('account.businesses') &&
                  <Button color="error" disabled={protectedShop} startIcon={protectedShop ? <LockOutlined /> : undefined}
                    onClick={() => { setTarget(row); setConfirmation(''); setDeleteError(null); }}>
                    {t('businesses.delete')}
                  </Button>}
              </Stack>
              {protectedShop && <Typography variant="body2" color="text.secondary">{t('businesses.block.seed_business')}</Typography>}
            </Stack>
          </SectionCard>
        );
      })}
      {adding && <FormDialog open title={t('businesses.add')} submitLabel={t('businesses.add')} submitting={add.running}
        error={createError ? t(createError, { defaultValue: t('businesses.error') }) : undefined}
        onClose={() => setAdding(false)} onSubmit={submit}>
        <TextField autoFocus required label={t('businesses.name')} value={input.name}
          slotProps={{ htmlInput: { maxLength: 80 } }}
          onChange={(event) => setInput({ ...input, name: event.target.value })} />
        <TextField required label={t('businesses.timezone')} value={input.timezone}
          slotProps={{ htmlInput: { maxLength: 64 } }}
          onChange={(event) => setInput({ ...input, timezone: event.target.value })} />
        <TextField select label={t('businesses.language')} value={input.language}
          onChange={(event) => setInput({ ...input, language: event.target.value === 'en' ? 'en' : 'th' })}>
          <MenuItem value="th">{t('businesses.thai')}</MenuItem>
          <MenuItem value="en">{t('businesses.english')}</MenuItem>
        </TextField>
      </FormDialog>}
      {target && <ConfirmDialog open danger title={t('businesses.delete')} confirmLabel={t('businesses.delete')}
        onClose={() => setTarget(null)} onConfirm={confirmDelete} message={
          <Stack spacing={2}>
            <Typography>{t('businesses.deleteMessage', { name: target.name })}</Typography>
            <TextField label={t('businesses.confirmName')} value={confirmation}
              onChange={(event) => { setConfirmation(event.target.value); setDeleteError(null); }}
              slotProps={{ htmlInput: { maxLength: 80 } }} />
            {deleteError && <Alert severity="error">{t(deleteError, { defaultValue: t('businesses.error') })}</Alert>}
          </Stack>
        } />}
    </Stack>
  );
}
