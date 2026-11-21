import { Button, Checkbox, CircularProgress, FormControlLabel, Stack } from '@mui/material';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { FeatureFlagView } from '@nless/shared/core/types';
import type { PermissionKey } from '@nless/shared/core/permissions';
import { EmptyState, PageHeader, SectionCard, useApiQuery, useSession } from '../../core';

const steps = [
  { key: 'business', id: 'F04', path: '/business', permission: 'business.read' },
  { key: 'knowledge', id: 'F05', path: '/knowledge', permission: 'product.read' },
  { key: 'catalog', id: 'F08', path: '/catalog', permission: 'product.read' },
  { key: 'channels', id: 'F17', path: '/channels', permission: 'business.channels' },
  { key: 'chat', id: 'F09', path: '/demo-chat', permission: 'insights.demo' },
] as const satisfies readonly { key: string; id: string; path: string; permission: PermissionKey }[];

function savedSteps(key: string): string[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(data) ? data.filter((value): value is string => typeof value === 'string') : [];
  } catch {
    return [];
  }
}

export default function OnboardingPage() {
  const businessId = useSession().currentBusiness?.id;
  return businessId ? <Checklist key={businessId} businessId={businessId} /> : null;
}

function Checklist({ businessId }: { businessId: string }) {
  const { t } = useTranslation('tenancy');
  const { permissions } = useSession();
  const flags = useApiQuery<{ items: FeatureFlagView[] }>('/features', { businessScoped: false });
  const storage = 'nless.onboarding.' + businessId;
  const [done, setDone] = useState(() => savedSteps(storage));
  const visible = steps.filter((step) => permissions.includes(step.permission) &&
    flags.data?.items.some((item) => item.featureId === step.id && item.visible && !item.placeholder));

  function mark(step: string, checked: boolean) {
    const next = checked ? [...new Set([...done, step])] : done.filter((item) => item !== step);
    setDone(next);
    try { localStorage.setItem(storage, JSON.stringify(next)); } catch { /* Optional checklist persistence. */ }
  }

  return (
    <Stack spacing={2}>
      <PageHeader title={t('onboarding.title')} />
      {flags.error
        ? <EmptyState title={t('onboarding.error')} action={<Button onClick={flags.reload}>{t('common:actions.retry')}</Button>} />
        : flags.loading || !flags.data
          ? <CircularProgress size={24} aria-label={t('onboarding.loading')} />
          : visible.length === 0 && <EmptyState title={t('onboarding.empty')} />}
      {visible.map((step) => (
        <SectionCard key={step.key} title={t('onboarding.step.' + step.key)}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <Button component={Link} to={step.path}>{t('onboarding.open')}</Button>
            <FormControlLabel label={t('onboarding.done')} control={
              <Checkbox checked={done.includes(step.key)} onChange={(_, checked) => mark(step.key, checked)} />
            } />
          </Stack>
        </SectionCard>
      ))}
    </Stack>
  );
}
