import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { PermissionKey } from '@nless/shared/core/permissions';
import { PageHeader } from './layout/PageHeader';
import { useCan } from './session';

export function RequirePermission({ permission, children }: { permission: PermissionKey; children: ReactNode }) {
  const { t } = useTranslation('common');
  return useCan(permission) ? children : <PageHeader title={t('pages.forbidden')} />;
}
