import { Component, lazy, Suspense, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Skeleton, Tab, Tabs } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { SlotContribution } from '@nless/shared/core/loader';
import { EmptyState, PageHeader, useSession, useSlot } from '../../core';
import HoursPanel from './HoursPanel';
import ProfilePanel from './ProfilePanel';

class TabErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function ContributedTab({ slot, businessId }: { slot: SlotContribution; businessId: string }) {
  const { t } = useTranslation('business-settings');
  const Panel = useMemo(() => lazy(slot.load), [slot.load]);
  return (
    <TabErrorBoundary fallback={<EmptyState title={t('tabs.error')} />}>
      <Suspense fallback={<Skeleton height={120} />}>
        <Panel businessId={businessId} />
      </Suspense>
    </TabErrorBoundary>
  );
}

function BusinessTabs({ businessId }: { businessId: string }) {
  const { t } = useTranslation('business-settings');
  const [selected, setSelected] = useState('profile');
  const slots = useSlot('businessTabs');
  const selectedSlot = slots.find(({ id }) => 'extra:' + id === selected);
  const active = selected === 'hours' || selectedSlot ? selected : 'profile';

  return (
    <>
      <Tabs value={active} onChange={(_, value: string) => setSelected(value)} variant="scrollable" sx={{ mb: 2 }}>
        <Tab value="profile" label={t('tabs.profile')} />
        <Tab value="hours" label={t('tabs.hours')} />
        {slots.map((slot) => (
          <Tab key={slot.id} value={'extra:' + slot.id} label={t(slot.labelKey ?? 'tabs.additional')} />
        ))}
      </Tabs>
      {active === 'profile' && <ProfilePanel />}
      {active === 'hours' && <HoursPanel />}
      {selectedSlot && <ContributedTab key={selectedSlot.id} slot={selectedSlot} businessId={businessId} />}
    </>
  );
}

export default function BusinessPage() {
  const businessId = useSession().currentBusiness?.id;
  const { t } = useTranslation('business-settings');

  return (
    <>
      <PageHeader title={t('business.title')} />
      {businessId && <BusinessTabs key={businessId} businessId={businessId} />}
    </>
  );
}
