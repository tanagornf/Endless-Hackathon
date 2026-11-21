import { lazy, Suspense, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Avatar, Box, Drawer, IconButton, LinearProgress, Menu, MenuItem, Paper, Stack, Typography } from '@mui/material';
import MenuOutlined from '@mui/icons-material/MenuOutlined';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { MenuEntry, SlotContribution } from '@nless/shared/core/loader';
import { useFeatures } from '../featureFlags';
import { featurePages } from '../registry';
import { useSession } from '../session';
import { useSlot } from '../slots';
import { LanguageSwitch } from '../ui/LanguageSwitch';
import { useToast } from '../ui/toast';
import { Navigation, groups } from './Navigation';
import { ShopSwitcher } from './ShopSwitcher';
import { menuIcon } from '../icons';

const ops: MenuEntry = { path: '/ops', labelKey: 'common:pages.jobs', group: 'admin', icon: 'WorkOutlineOutlined', order: 10, platformAdminOnly: true };
export function SlotItem({ entry, props }: { entry: SlotContribution; props?: Record<string,unknown> }) {
  const Component = useMemo(() => lazy(entry.load), [entry.load]);
  return <Suspense fallback={null}><Component {...props} /></Suspense>;
}
export function useNavigation() {
  const session = useSession();
  const flags = useFeatures();
  const entries = [...featurePages.filter(f => flags.visible(f.featureId)).flatMap(f => f.menu ?? []), ops]
    .filter(item => (!item.platformAdminOnly || session.user?.isPlatformAdmin)
      && (!item.permission || session.permissions.includes(item.permission))
      && (session.currentBusiness || item.group === 'admin' || item.group === 'help' || item.path === '/businesses'))
    .sort((a,b) => groups.indexOf(a.group) - groups.indexOf(b.group) || a.order - b.order);
  return { entries, ...flags };
}
export function AppShell({ children }: { children: ReactNode }) {
  const session = useSession();
  const { entries } = useNavigation();
  const { t } = useTranslation('common');
  const [drawer,setDrawer] = useState(false);
  const [anchor,setAnchor] = useState<HTMLElement | null>(null);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const toast = useToast();
  const actions = useSlot('topbarActions');
  const current = entries.filter(e => pathname === e.path || pathname.startsWith(e.path + '/')).sort((a,b) => b.path.length - a.path.length)[0];
  const mobile = entries.filter(e => e.mobileTab).sort((a,b) => a.order - b.order).slice(0,4);
  const close = () => setDrawer(false);
  return <Box sx={{ display:'flex', minHeight:'100dvh' }}>
    <Box component="a" href="#workspace-main" sx={{position:'fixed',top:-80,left:8,zIndex:1500,p:1,bgcolor:'white','&:focus':{top:8}}}>{t('workspace.skip')}</Box>
    <Box component="aside" sx={{bgcolor:'white',borderRight:1,borderColor:'divider',display:{xs:'none',md:'block'},position:'sticky',top:0,height:'100dvh',flexShrink:0}}>
      <Navigation entries={entries} close={close} />
    </Box>
    <Drawer open={drawer} onClose={close} sx={{ display:{md:'none'} }}><Navigation entries={entries} close={close} /></Drawer>
    <Box sx={{flex:1,minWidth:0}}>
      <Paper square component="header" elevation={0} sx={{minHeight:56,px:{xs:.5,sm:2.5},gap:{xs:0,sm:1},display:'flex',alignItems:'center',borderBottom:1,borderColor:'divider'}}>
        <IconButton onClick={() => setDrawer(true)} aria-label={t('pages.menu')} sx={{display:{md:'none'}}}><MenuOutlined /></IconButton>
        <ShopSwitcher />
        <Stack direction="row" sx={{ml:'auto',alignItems:'center',flexShrink:0}}>
          <LanguageSwitch compact />{actions.map(entry => <SlotItem key={entry.id} entry={entry} />)}
          <IconButton aria-label={t('pages.account')} onClick={e => setAnchor(e.currentTarget)}>
            <Avatar sx={{width:32,height:32,fontSize:'.9rem',bgcolor:'#DAE9DF',color:'#285346'}}>{Array.from(session.user?.displayName ?? '')[0] || '•'}</Avatar>
          </IconButton>
          <Menu open={Boolean(anchor)} anchorEl={anchor} onClose={() => setAnchor(null)}>
            <MenuItem component={Link} to="/account" onClick={() => setAnchor(null)}>{t('pages.account')}</MenuItem>
            <MenuItem onClick={() => {setAnchor(null); void session.logout().then(() => navigate('/login'),toast.error);}}>{t('actions.logout')}</MenuItem>
          </Menu>
        </Stack>
      </Paper>
      <Box id="workspace-main" component="main" tabIndex={-1} sx={{maxWidth:1280,mx:'auto',p:{xs:2,sm:3},pb:{xs:mobile.length ? 11 : 3,md:3}}}>
        {current && <Typography variant="overline" sx={{color:'primary.main',fontWeight:700,letterSpacing:'.07em',textTransform:'none'}}>{t('nav:' + current.group)}</Typography>}
        <Suspense fallback={<LinearProgress aria-label={t('pages.loading')} />}><Box key={session.currentBusiness?.id ?? 'account'}>{children}</Box></Suspense>
      </Box>
      {!!mobile.length && <Box role="group" aria-label={t('workspace.shortcuts')} sx={{display:{xs:'flex',md:'none'},position:'fixed',bottom:0,insetInline:0,bgcolor:'white',borderTop:1,borderColor:'divider',pb:'env(safe-area-inset-bottom)',zIndex:10}}>
        {mobile.map(item => {const Icon = menuIcon(item.icon);return <Box key={item.path} component={Link} to={item.path} aria-current={current?.path===item.path ? 'page' : undefined}
          sx={{flex:1,textAlign:'center',textDecoration:'none',py:.8,fontSize:'.74rem',color:current?.path===item.path ? 'primary.main' : 'text.secondary'}}>
          <Icon fontSize="small" sx={{display:'block',mx:'auto'}} />{t(item.labelKey)}</Box>;})}
      </Box>}
    </Box>
  </Box>;
}
