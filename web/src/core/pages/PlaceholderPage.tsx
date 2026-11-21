import { lazy } from 'react';
import { matchPath, useLocation } from 'react-router-dom';
import { screens } from '../../integration/screens';
import { Button, Link } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FEATURES } from '@nless/shared/core/features';
import type { FeatureId } from '@nless/shared/core/features';
import { PageHeader } from '../layout/PageHeader';
import { LanguageSwitch } from '../ui/LanguageSwitch';
import { SectionCard } from '../ui/SectionCard';
import { StatusChip } from '../ui/StatusChip';

const PreparedPage = lazy(() => import('../../integration/PreparedPage'));
export function PlaceholderPage({ featureId }: { featureId: FeatureId }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  if (import.meta.env.VITE_UI_PREVIEW === '1' && screens.some(screen => screen.id === featureId && matchPath({path:screen.path,end:true},pathname))) return <PreparedPage />;
  const feature = FEATURES.find((item) => item.id === featureId)!;
  const title = t(feature.slug + ':page.title', { defaultValue: feature.title });
  const path = feature.slug.replace('/', '-');
  return <>
    <PageHeader title={title} description={t('pages.placeholder', { id: feature.id, lane: feature.lane })} />
    <SectionCard actions={<StatusChip kind="feature" status="U" />}>
      <Link href={'https://github.com/tanagornf/Endless-Hackathon/blob/main/docs/specs/' + feature.id + '-' + path + '.md'}>{feature.id}</Link>
      {feature.id === 'F02' && <>
        <LanguageSwitch compact />
        {import.meta.env.VITE_DEV_LOGIN !== '0' && <Button component={RouterLink} to="/dev-login">{t('dev.title')}</Button>}
      </>}
    </SectionCard>
  </>;
}
