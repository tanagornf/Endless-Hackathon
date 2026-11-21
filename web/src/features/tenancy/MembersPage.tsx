import { Button, Stack, Tooltip, Typography } from '@mui/material';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ApiFailure } from '@nless/shared/core/types';
import type { MembershipRole, PermissionKey } from '@nless/shared/core/permissions';
import type { MemberRow } from '@nless/shared/features/tenancy/types';
import {
  ConfirmDialog, DataTable, EmptyState, FormDialog, PageHeader, StatusChip, formatDateTime,
  useApiMutation, useApiQuery, useSession, useToast,
} from '../../core';
import type { DataTableColumn } from '../../core';
import PermissionMatrix from './PermissionMatrix';

type MemberDialog = { action: 'permissions' | 'role' | 'revoke' | 'restore'; member: MemberRow };

function rejectedPermissionKeys(failure: ApiFailure | null): string[] {
  const issues = failure?.error.details?.issues;
  if (!Array.isArray(issues)) return [];
  return issues.flatMap((issue) => Array.isArray(issue?.keys)
    ? issue.keys.filter((key: unknown): key is string => typeof key === 'string')
    : []);
}

export default function MembersPage() {
  const { t } = useTranslation('tenancy');
  const businessId = useSession().currentBusiness?.id;
  return (
    <>
      <PageHeader title={t('members.title')} description={t('members.subtitle')} />
      {businessId && <MemberList key={businessId} />}
    </>
  );
}

function MemberList() {
  const { t } = useTranslation('tenancy');
  const toast = useToast();
  const list = useApiQuery<{ items: MemberRow[] }>('/members');
  const [dialog, setDialog] = useState<MemberDialog | null>(null);
  const [permissions, setPermissions] = useState<PermissionKey[]>([]);
  const target = '/members/' + (dialog?.member.userId ?? '');
  const saveGrants = useApiMutation<{ permissions: PermissionKey[] }, MemberRow>('PUT', target + '/permissions');
  const setRole = useApiMutation<{ role: MembershipRole }, MemberRow>('PUT', target + '/role');
  const changeAccess = useApiMutation<Record<string, never>, MemberRow>('POST', target + '/' + dialog?.action);

  function showDialog(action: MemberDialog['action'], member: MemberRow) {
    setPermissions(member.permissions);
    setDialog({ action, member });
  }

  function complete(message: string) {
    toast.success(message);
    list.reload();
    setDialog(null);
  }

  async function confirmAction() {
    if (!dialog || dialog.action === 'permissions') return;
    if (dialog.action === 'role') {
      await setRole.run({ role: dialog.member.role === 'owner' ? 'staff' : 'owner' });
    } else {
      await changeAccess.run({});
    }
    complete(t('common:toast.saved'));
  }

  const columns: DataTableColumn<MemberRow>[] = [
    { key: 'member', header: t('members.col.member'), render: (member) => (
      <Stack>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>{member.displayName}</Typography>
        <Typography variant="body2" color="text.secondary">{member.email}</Typography>
      </Stack>
    ) },
    { key: 'role', header: t('members.col.role'), render: (member) => <StatusChip status={member.role} label={t('role.' + member.role)} /> },
    { key: 'status', header: t('members.col.status'), render: (member) => (
      <StatusChip status={member.status === 'active' ? 'active' : 'inactive'} label={t('status.' + member.status)} />
    ) },
    { key: 'lastSeen', header: t('members.col.lastSeen'), render: (member) => (
      member.lastSeenAt ? formatDateTime(member.lastSeenAt) : t('members.neverSeen')
    ) },
    { key: 'actions', header: t('members.col.actions'), render: (member) => {
      const reason = member.isSelf ? t('block.self_change') : member.isAccountOwner ? t('block.account_owner') : '';
      const locked = Boolean(reason);
      return (
        <Tooltip title={reason}>
          <span>
            {member.status === 'active' ? (
              <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
                {member.role === 'staff' &&
                  <Button disabled={locked} size="small" onClick={() => showDialog('permissions', member)}>{t('actions.editPermissions')}</Button>}
                <Button disabled={locked} size="small" onClick={() => showDialog('role', member)}>{t('actions.changeRole')}</Button>
                <Button disabled={locked} size="small" color="error" onClick={() => showDialog('revoke', member)}>{t('actions.revoke')}</Button>
              </Stack>
            ) : (
              <Button disabled={locked} size="small" onClick={() => showDialog('restore', member)}>{t('actions.restore')}</Button>
            )}
          </span>
        </Tooltip>
      );
    } },
  ];

  const confirmation = dialog?.action === 'role'
    ? { title: t('role.change.title', { name: dialog.member.displayName }),
      message: t(dialog.member.role === 'owner' ? 'role.change.toStaff' : 'role.change.toOwner'), danger: false }
    : dialog?.action === 'revoke'
      ? { title: t('revoke.title'), message: t('revoke.message'), danger: true }
      : dialog?.action === 'restore'
        ? { title: t('restore.title'), message: t('restore.message'), danger: false }
        : null;

  if (list.error) {
    return <EmptyState title={t('members.error')} action={<Button onClick={list.reload}>{t('common:actions.retry')}</Button>} />;
  }

  return (
    <>
      <DataTable columns={columns} rows={list.data?.items ?? []} rowKey={(member) => member.userId}
        loading={list.loading || !list.data} empty={<EmptyState title={t('members.empty')} />} />
      {dialog?.action === 'permissions' &&
        <FormDialog open title={t('permissions.title', { name: dialog.member.displayName })} submitting={saveGrants.running}
          onClose={() => setDialog(null)}
          onSubmit={async () => {
            await saveGrants.run({ permissions });
            complete(t('permissions.saved'));
          }}>
          <PermissionMatrix selected={permissions} invalidKeys={rejectedPermissionKeys(saveGrants.error)} onChange={setPermissions} />
        </FormDialog>}
      {confirmation &&
        <ConfirmDialog open {...confirmation} confirmLabel={t('actions.' + (dialog?.action === 'role' ? 'changeRole' : dialog?.action))}
          onClose={() => setDialog(null)} onConfirm={confirmAction} />}
    </>
  );
}
