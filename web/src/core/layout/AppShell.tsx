import { Suspense, lazy, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import AccountCircleOutlined from '@mui/icons-material/AccountCircleOutlined';
import MenuOutlined from '@mui/icons-material/MenuOutlined';
import { Box, Drawer, IconButton, LinearProgress, List, ListItemButton, ListItemIcon, ListItemText,
  ListSubheader, Menu, MenuItem, Paper, Select, Stack, Typography } from '@mui/material';
import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { MenuEntry, MenuGroup } from '@nless/shared/core/loader';
import { useFeatures } from '../featureFlags';
import { menuIcon } from '../icons';
import { featurePages } from '../registry';
import { useSession } from '../session';
import { useSlot } from '../slots';
import { LanguageSwitch } from '../ui/LanguageSwitch';
import { useToast } from '../ui/toast';

const groups: MenuGroup[] = ['home', 'chat', 'customers', 'knowledge', 'ai', 'live', 'insights', 'commerce', 'settings', 'help', 'admin'];
const ops: MenuEntry = { path: '/ops', labelKey: 'common:pages.jobs', group: 'admin', icon: 'WorkOutlineOutlined', order: 10, platformAdminOnly: true };
const width = 260;
export function AppShell({ children }: { children: ReactNode }) {
  const session = useSession();
  const { visible } = useFeatures();
  const { t } = useTranslation(['common', 'nav', ...featurePages.map((entry) => entry.slug)]);
  const [drawer, setDrawer] = useState(false);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const navigate = useNavigate();
  const toast = useToast();
  const actions = useSlot('topbarActions');
  const actionComponents = useMemo(() => actions.map((entry) => ({ id: entry.id, Component: lazy(entry.load) })), [actions]);
  const entries = [...featurePages.filter((feature) => visible(feature.featureId)).flatMap((feature) => feature.menu ?? []), ops]
    .filter((item) => (!item.platformAdminOnly || session.user?.isPlatformAdmin)
      && (!item.permission || session.permissions.includes(item.permission))
      && (session.currentBusiness || item.group === 'admin' || item.group === 'help'))
    .sort((a, b) => a.order - b.order);

  const navigation = <Box component="nav" aria-label={t('common:pages.menu')} sx={{ width, px: 1.5, pb: 2 }}>
    <Typography component={NavLink} to="/" variant="h5" sx={{ display: 'block', py: 2.2, px: 1.4, color: 'primary.main', textDecoration: 'none' }}>Endless</Typography>
    {groups.map((group) => {
      const items = entries.filter((entry) => entry.group === group);
      if (!items.length) return null;
      return <List key={group} dense disablePadding subheader={<ListSubheader sx={{ lineHeight: '32px', px: 1.5 }}>{t('nav:' + group)}</ListSubheader>}>
        {items.map((entry) => {
          const Icon = menuIcon(entry.icon);
          return <ListItemButton key={entry.path} component={NavLink} to={entry.path} end onClick={() => setDrawer(false)}
            sx={{ borderRadius: 1, minHeight: 44, '&.active': { color: 'primary.main', bgcolor: 'action.selected', '& .MuiListItemText-primary': { fontWeight: 700 } } }}>
            <ListItemIcon sx={{ minWidth: 36 }}><Icon fontSize="small" /></ListItemIcon><ListItemText primary={t(entry.labelKey)} />
          </ListItemButton>;
        })}
      </List>;
    })}
  </Box>;

  return <Box sx={{ display: 'flex', minHeight: '100vh' }}>
    <Paper square component="aside" variant="outlined" sx={{ display: { xs: 'none', md: 'block' }, width, flexShrink: 0, minHeight: '100vh' }}>{navigation}</Paper>
    <Drawer open={drawer} onClose={() => setDrawer(false)} sx={{ display: { md: 'none' } }}>{navigation}</Drawer>
    <Box sx={{ minWidth: 0, flex: 1 }}>
      <Paper square component="header" variant="outlined" sx={{ height: 56, display: 'flex', alignItems: 'center', px: { xs: 1, sm: 2.5 }, gap: 1 }}>
        <IconButton onClick={() => setDrawer(true)} aria-label={t('common:pages.menu')} sx={{ display: { md: 'none' } }}><MenuOutlined /></IconButton>
        {session.businesses.length > 0 && <Select size="small" value={session.currentBusiness?.id ?? ''} aria-label={t('common:pages.shop')}
          onChange={(event) => session.selectBusiness(event.target.value)} sx={{ maxWidth: { xs: 165, sm: 320 } }}>
          {session.businesses.map(({ business }) => <MenuItem key={business.id} value={business.id}>{business.name}</MenuItem>)}
        </Select>}
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', ml: 'auto' }}>
          <LanguageSwitch compact />
          <Suspense fallback={null}>{actionComponents.map(({ id, Component }) => <Component key={id} />)}</Suspense>
          <IconButton aria-label={t('common:pages.account')} onClick={(event) => setAnchor(event.currentTarget)}><AccountCircleOutlined /></IconButton>
          <Menu open={Boolean(anchor)} anchorEl={anchor} onClose={() => setAnchor(null)}>
            <MenuItem onClick={() => { setAnchor(null); navigate('/account'); }}>{t('common:pages.account')}</MenuItem>
            <MenuItem onClick={() => {
              setAnchor(null);
              void session.logout().then(() => navigate('/login'), toast.error);
            }}>{t('common:actions.logout')}</MenuItem>
          </Menu>
        </Stack>
      </Paper>
      <Box component="main" sx={{ maxWidth: 1280, mx: 'auto', p: { xs: 2, sm: 3 } }}>
        <Suspense fallback={<LinearProgress aria-label={t('common:pages.loading')} />}>{children}</Suspense>
      </Box>
    </Box>
  </Box>;
}
