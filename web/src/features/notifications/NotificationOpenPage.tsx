import { Button, CircularProgress } from '@mui/material';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { EmptyState, PageHeader, useApiQuery, useSession } from '../../core';

export default function NotificationOpenPage() {
  const { t } = useTranslation('notifications');
  const navigate = useNavigate();
  const { noticeId } = useParams<{ noticeId: string }>();
  const { businesses, currentBusiness, selectBusiness } = useSession();
  const request = useApiQuery<{ businessId: string; link: string }>(
    noticeId ? '/notifications/push/open/' + encodeURIComponent(noticeId) : null,
    { businessScoped: false },
  );
  const destination = request.data;
  const active = destination && businesses.some(({ business }) => business.id === destination.businessId);

  useEffect(() => {
    if (!destination || !active) return;
    if (currentBusiness?.id !== destination.businessId) {
      selectBusiness(destination.businessId);
    } else {
      navigate(destination.link, { replace: true });
    }
  }, [active, currentBusiness?.id, destination, navigate, selectBusiness]);

  return <>
    <PageHeader title={t('page.title')} />
    {!noticeId || request.error || (destination && !active)
      ? <EmptyState title={t('push.openUnavailable')} action={
        <Button component={Link} to="/notifications">{t('bell.viewAll')}</Button>
      } />
      : <CircularProgress size={24} aria-label={t('common:pages.loading')} />}
  </>;
}
