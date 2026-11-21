import { Alert, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { STAFF_DEFAULT_PERMISSIONS } from '@nless/shared/core/permissions';
import type { PermissionKey } from '@nless/shared/core/permissions';
import type { ApiFailure } from '@nless/shared/core/types';
import type { InvitationCreated, InvitationRow, InvitationStatus } from '@nless/shared/features/tenancy/types';
import {
  ConfirmDialog, DataTable, EmptyState, FormDialog, PageHeader, StatusChip, formatDateTime,
  useApiMutation, useApiQuery, useSession, useToast,
} from '../../core';
import type { DataTableColumn } from '../../core';
import PermissionMatrix from './PermissionMatrix';

const statuses: InvitationStatus[] = ['pending', 'accepted', 'revoked', 'declined', 'expired'];

export default function InvitationsPage() {
  const businessId = useSession().currentBusiness?.id;
  return businessId ? <InvitationList key={businessId} /> : null;
}

function InvitationList() {
  const { t } = useTranslation('tenancy');
  const toast = useToast();
  const [status, setStatus] = useState<InvitationStatus | ''>('');
  const [inviting, setInviting] = useState(false);
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState(false);
  const [permissions, setPermissions] = useState<PermissionKey[]>([...STAFF_DEFAULT_PERMISSIONS]);
  const [result, setResult] = useState<InvitationCreated | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<InvitationRow | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const linkInput = useRef<HTMLInputElement>(null);
  const sendingLink = useRef(false);
  const list = useApiQuery<{ items: InvitationRow[] }>('/invitations' + (status ? '?status=' + status : ''));
  const create = useApiMutation<{ email: string; permissions: PermissionKey[] }, InvitationCreated>(
    'POST', '/invitations', { toastOnError: false },
  );
  const resend = useApiMutation<{ id: string }, InvitationCreated>(
    'POST', ({ id }) => '/invitations/' + id + '/resend', { toastOnError: false },
  );
  const revoke = useApiMutation<{ id: string }, InvitationRow>(
    'POST', ({ id }) => '/invitations/' + id + '/revoke', { toastOnError: false },
  );

  function failureText(failure?: ApiFailure) {
    const reason = failure?.error.details?.reason;
    if (typeof reason === 'string') {
      return t('invitations.block.' + reason, { defaultValue: t('invitations.error') });
    }
    return t(failure?.error.code === 'RATE_LIMITED' ? 'invitations.rateLimited' : 'invitations.error');
  }

  function showResult(value: InvitationCreated) {
    setResult(value);
    setInviting(false);
    list.reload();
  }

  async function rotate(row: InvitationRow) {
    if (sendingLink.current) return;
    sendingLink.current = true;
    setActionError(null);
    try {
      showResult(await resend.run({ id: row.id }));
    } catch (error) {
      setActionError(failureText((error as { failure?: ApiFailure })?.failure));
    } finally {
      sendingLink.current = false;
    }
  }

  const columns: DataTableColumn<InvitationRow>[] = [
    { key: 'email', header: t('invitations.email'), render: (row) => (
      <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{row.email}</Typography>
    ) },
    { key: 'status', header: t('members.col.status'), render: (row) => (
      <StatusChip status={row.status} label={t('invitations.state.' + row.status)} />
    ) },
    { key: 'expiresAt', header: t('invitations.col.expires'), render: (row) => formatDateTime(row.expiresAt) },
    { key: 'inviter', header: t('invitations.col.invitedBy'), render: (row) => row.invitedByName ?? t('invitations.unknownInviter') },
    { key: 'actions', header: t('members.col.actions'), render: (row) => (
      (row.status === 'pending' || row.status === 'expired') && (
        <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
          <Button disabled={resend.running} onClick={() => void rotate(row)}>{t('invitations.resend')}</Button>
          <Button color="error" disabled={resend.running} onClick={() => setRevokeTarget(row)}>{t('invitations.revoke')}</Button>
        </Stack>
      )
    ) },
  ];
  const issues = create.error?.error.details?.issues;
  const invalidKeys = Array.isArray(issues) ? issues.flatMap((issue) => Array.isArray(issue?.keys) ? issue.keys : []) : [];
  const createError = create.error && failureText(create.error);

  return (
    <Stack spacing={2}>
      <PageHeader title={t('invitations.title')} actions={
        <Button variant="contained" onClick={() => {
          setEmail('');
          setEmailError(false);
          setPermissions([...STAFF_DEFAULT_PERMISSIONS]);
          setInviting(true);
        }}>{t('invitations.invite')}</Button>
      } />
      <TextField select size="small" label={t('invitations.filter')} value={status}
        onChange={(event) => setStatus(event.target.value as InvitationStatus | '')} sx={{ maxWidth: 260 }}>
        <MenuItem value="">{t('invitations.all')}</MenuItem>
        {statuses.map((value) => <MenuItem key={value} value={value}>{t('invitations.state.' + value)}</MenuItem>)}
      </TextField>
      {actionError && <Alert severity="error" onClose={() => setActionError(null)}>{actionError}</Alert>}
      {list.error
        ? <EmptyState title={t('invitations.error')} action={<Button onClick={list.reload}>{t('common:actions.retry')}</Button>} />
        : <DataTable columns={columns} rows={list.data?.items ?? []} rowKey={(row) => row.id}
            loading={list.loading || !list.data} empty={<EmptyState title={t('invitations.empty')} />} />}
      {inviting && <FormDialog open title={t('invitations.invite')} submitLabel={t('invitations.create')}
        error={createError} submitting={create.running} onClose={() => setInviting(false)}
        onSubmit={async () => {
          if (!email.trim() || !linkEmailIsValid(email)) {
            setEmailError(true);
            return;
          }
          showResult(await create.run({ email, permissions }));
        }}>
        <TextField type="email" fullWidth required autoFocus label={t('invitations.email')} value={email}
          slotProps={{ htmlInput: { maxLength: 200 } }}
          error={emailError} helperText={emailError ? t('invitations.invalidEmail') : undefined}
          onChange={(event) => { setEmail(event.target.value); setEmailError(false); }} />
        <PermissionMatrix selected={permissions} invalidKeys={invalidKeys} onChange={setPermissions} />
      </FormDialog>}
      {revokeTarget && <ConfirmDialog open danger title={t('invitations.revoke')}
        message={t('invitations.revokeConfirm', { email: revokeTarget.email })}
        confirmLabel={t('invitations.revoke')} onClose={() => setRevokeTarget(null)} onConfirm={async () => {
          try {
            await revoke.run({ id: revokeTarget.id });
            list.reload();
            toast.success(t('invitations.state.revoked'));
          } catch (error) {
            setActionError(failureText((error as { failure?: ApiFailure })?.failure));
          }
        }} />}
      {result && <FormDialog open title={t('invitations.link.title')} submitLabel={t('invitations.link.copy')}
        onClose={() => setResult(null)} onSubmit={async () => {
          try {
            await navigator.clipboard.writeText(result.link);
            toast.success(t('invitations.link.copied'));
          } catch {
            linkInput.current?.focus();
            linkInput.current?.select();
            toast.info(t('invitations.link.selected'));
          }
        }}>
        <Typography>{t('invitations.link.' + result.delivery, { when: formatDateTime(result.invitation.expiresAt) })}</Typography>
        <TextField inputRef={linkInput} fullWidth value={result.link} label={t('invitations.link.title')}
          slotProps={{ input: { readOnly: true } }} />
      </FormDialog>}
    </Stack>
  );
}

function linkEmailIsValid(email: string): boolean {
  const input = document.createElement('input');
  input.type = 'email';
  input.value = email.trim();
  return input.validity.valid;
}
