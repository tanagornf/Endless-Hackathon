import { LinearProgress } from '@mui/material';
import { Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../core';
import NotificationOpenPage from './NotificationOpenPage';

export default function NotificationOpenRoute() {
  const { status } = useSession();
  const { pathname } = useLocation();
  const { t } = useTranslation('common');
  if (status === 'loading') return <LinearProgress aria-label={t('pages.loading')} />;
  if (status !== 'ready') return <Navigate replace to={'/login?' + new URLSearchParams({ next: pathname })} />;
  return <NotificationOpenPage />;
}
