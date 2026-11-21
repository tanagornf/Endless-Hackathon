import { Box, Stack, Tab, Tabs } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../layout/PageHeader';
import i18n, { i18nReady } from '../i18n';
import { JobsPanel } from './JobsPanel';
import { DeliveriesPanel } from './DeliveriesPanel';
import { FeaturesPanel } from './FeaturesPanel';
import { RoutesPanel, SchedulesPanel } from './CatalogPanels';
import { SystemPanel } from './SystemPanel';
import en from './i18n/en.json';
import th from './i18n/th.json';

function registerTranslations() {
  i18n.addResourceBundle('en', 'ops', en);
  i18n.addResourceBundle('th', 'ops', th);
}
if (i18n.isInitialized) registerTranslations();
else void i18nReady.then(registerTranslations);

const tabs = ['jobs', 'dead', 'deliveries', 'features', 'schedules', 'system', 'routes'] as const;
type TabName = (typeof tabs)[number];

export default function OpsPage() {
  const { t } = useTranslation('ops');
  const [params, setParams] = useSearchParams();
  const tab = tabs.find((item) => item === params.get('tab')) ?? 'jobs';
  return <Stack spacing={2} sx={{ minWidth: 0 }}>
    <PageHeader title={t('page.title')} description={t('page.subtitle')} />
    <Tabs value={tab} aria-label={t('page.title')} variant="scrollable" scrollButtons="auto"
      onChange={(_event, next: TabName) => {
        const updated = new URLSearchParams(params);
        updated.set('tab', next);
        setParams(updated);
      }}>
      {tabs.map((item) => <Tab key={item} value={item} id={`ops-tab-${item}`}
        aria-controls={`ops-panel-${item}`} label={t(`tabs.${item}`)} />)}
    </Tabs>
    {tabs.map((item) => <Box component="section" key={item} hidden={item !== tab} role="tabpanel"
      id={`ops-panel-${item}`} aria-labelledby={`ops-tab-${item}`} tabIndex={0} sx={{ minWidth: 0 }}>
      {item === tab && {
        jobs: <JobsPanel />,
        dead: <JobsPanel dead />,
        deliveries: <DeliveriesPanel />,
        features: <FeaturesPanel />,
        schedules: <SchedulesPanel />,
        system: <SystemPanel />,
        routes: <RoutesPanel />,
      }[tab]}
    </Box>)}
  </Stack>;
}
