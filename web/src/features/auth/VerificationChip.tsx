import { Link } from '@mui/material';
import type { AuthStatus } from '@nless/shared/features/auth/types';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import { StatusChip, useApiQuery, useSession } from '../../core';

export default function VerificationChip() {
  const { t } = useTranslation('auth');
  const { user } = useSession();
  const { data } = useApiQuery<AuthStatus>(user ? '/auth/status' : null, { businessScoped: false, deps: [user?.id] });
  if (!data || data.emailVerified) return null;
  return <Link component={RouterLink} to="/account" underline="none" sx={{ alignItems: 'center', display: 'inline-flex', minHeight: 44 }}>
    <StatusChip status="pending" label={t('chip.unverified')} />
  </Link>;
}
