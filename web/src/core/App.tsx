import { Alert, Box, LinearProgress } from '@mui/material';
import { lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { PageRoute } from '@nless/shared/core/loader';
import type { PermissionKey } from '@nless/shared/core/permissions';
import { useFeatures } from './featureFlags';
import WorkspaceHome from './pages/WorkspaceHome';
import { AppShell, SlotItem } from './layout/AppShell';
import { PageHeader } from './layout/PageHeader';
import DevLogin from './pages/DevLogin';
import { useRealtimeConnection } from './realtime';
import { featurePages, registryErrors } from './registry';
import { useSession } from './session';
import { useSlot } from './slots';
import { LanguageSwitch, SectionCard } from './ui';

const routes = featurePages.flatMap((entry) => entry.routes.map((route) => ({ ...route, id: entry.featureId, Component: lazy(route.load) })));
if (registryErrors.length && import.meta.env.DEV) console.error(registryErrors.join('\n'));

function MessagePage({ label }: { label: string }) {
  const { t } = useTranslation('common');
  return <PageHeader title={t(label)} />;
}
const NotFound = () => <MessagePage label="pages.notFound" />;
function Guard({ auth = 'business', permission, children }: { auth?: PageRoute['auth']; permission?: PermissionKey; children: ReactNode }) {
  const { status, user, currentBusiness, permissions } = useSession();
  const location = useLocation();
  if (auth === 'none') return children;
  if (status === 'loading') return <LinearProgress />;
  if (status !== 'ready') return <Navigate replace to={'/login?next=' + encodeURIComponent(location.pathname + location.search + location.hash)} />;
  if (auth === 'platform_admin' && !user?.isPlatformAdmin) return <MessagePage label="pages.forbidden" />;
  if (auth === 'business' && !currentBusiness) return <Navigate replace to="/no-business" />;
  if (permission && !permissions.includes(permission)) return <MessagePage label="pages.forbidden" />;
  return children;
}
function Account() {
  const { t } = useTranslation('common');
  const entries = useSlot('accountTabs');
  const { user, currentBusiness } = useSession();
  return <>
    <PageHeader title={t('pages.account')} />
    {user && <SectionCard title={user.displayName}><Box component="p" sx={{m:0}}>{user.email}</Box>
      {currentBusiness && <Box component="p" sx={{mb:0,color:'text.secondary'}}>{currentBusiness.name}</Box>}</SectionCard>}
    {entries.map(entry => <SlotItem key={entry.id} entry={entry} />)}
  </>;
}
function OAuthCallback() {
  const state = new URLSearchParams(useLocation().search).get('state') ?? '';
  const entry = useSlot('oauthCallbacks').find((slot) => slot.statePrefix && state.startsWith(slot.statePrefix));
  if (!entry) return <NotFound />;
  const Component = lazy(entry.load);
  return <Component />;
}
const PreparedOps = lazy(() => import('../integration/PreparedPage'));
function SessionHome({ children }: { children: ReactNode }) {
  return <Guard auth="user"><AppShell>{children}</AppShell></Guard>;
}
export default function App() {
  const flags = useFeatures(true);
  const { t } = useTranslation('common');
  useRealtimeConnection();
  return <>
    {import.meta.env.DEV && registryErrors.length > 0 && <Alert severity="error">{registryErrors.join(' · ')}</Alert>}
    <Suspense fallback={<LinearProgress />}>
      <Routes>
        <Route path="/" element={<SessionHome><WorkspaceHome /></SessionHome>} />
        <Route path="/account" element={<SessionHome><Account /></SessionHome>} />
        <Route path="/ops" element={<SessionHome><Guard auth="platform_admin"><PreparedOps /></Guard></SessionHome>} />
        <Route path="/oauth/callback" element={<SessionHome><OAuthCallback /></SessionHome>} />
        <Route path="/no-business" element={<SessionHome><MessagePage label="pages.noBusiness" /></SessionHome>} />
        <Route path="/forbidden" element={<SessionHome><MessagePage label="pages.forbidden" /></SessionHome>} />
        <Route path="/dev-login" element={<DevLogin />} />
        {routes.map(({ id, path, auth, permission, layout, Component }) => {
          const publicRoute = layout === 'public' && auth === 'none';
          const available = id === 'F02' || flags.visible(id, publicRoute);
          const loading = id !== 'F02' && publicRoute && flags.publicLoading;
          const content = <Guard auth={auth} permission={permission}>
            {loading ? <LinearProgress aria-label={t('pages.loading')} /> : available ? <Component /> : <NotFound />}
          </Guard>;
          const bare = layout === 'public' || layout === 'bare';
          return <Route key={path} path={path} element={bare ? <Box component="main" sx={{ p: 2 }}>{content}</Box> : <AppShell>{content}</AppShell>} />;
        })}
        <Route path="*" element={<Box component="main" sx={{ p: 3 }}><LanguageSwitch compact /><NotFound /></Box>} />
      </Routes>
    </Suspense>
  </>;
}
