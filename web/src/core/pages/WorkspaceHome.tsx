import { Box, ButtonBase, LinearProgress, Paper, Stack, Typography } from '@mui/material';
import ArrowForwardOutlined from '@mui/icons-material/ArrowForwardOutlined';
import AllInclusiveOutlined from '@mui/icons-material/AllInclusiveOutlined';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '../layout/AppShell';
import { groups } from '../layout/Navigation';
import { menuIcon } from '../icons';
import { useSession } from '../session';
import { EmptyState } from '../ui';

export default function WorkspaceHome() {
  const { t } = useTranslation('common');
  const { entries, flags, error } = useNavigation();
  const { currentBusiness } = useSession();
  if (!flags && !error) return <LinearProgress aria-label={t('pages.loading')} />;
  return <Stack spacing={3}>
    <Box sx={{ position: 'relative', isolation: 'isolate', overflow: 'hidden', borderRadius: '18px', color: 'white', bgcolor: '#104D48',
      backgroundImage: 'radial-gradient(ellipse at 85% 110%, #24776A, transparent 58%)', px: { xs: 2.5, md: 4 }, py: { xs: 3, md: 4 } }}>
      <AllInclusiveOutlined aria-hidden sx={{ position: 'absolute', zIndex: -1, right: { xs: -32, md: 22 }, top: '50%', transform: 'translateY(-50%) rotate(-13deg)', color: '#92D6B4', opacity: .18, fontSize: { xs: 145, md: 250 } }} />
      <Typography sx={{ color: '#BCE7D8', fontSize: '.85rem', fontWeight: 600, mb: 1 }}>{currentBusiness?.name ?? 'Endless'}</Typography>
      <Typography component="h1" variant="h4" sx={{ maxWidth: '75%', lineHeight: 1.35 }}>{t('workspace.title')}</Typography>
    </Box>
    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2,minmax(0,1fr))', xl: 'repeat(3,minmax(0,1fr))' } }}>
      {groups.map(group => {
        const items = entries.filter(item => item.group === group);
        if (!items.length) return null;
        const Icon = menuIcon(items[0].icon);
        return <Paper component="section" variant="outlined" key={group} sx={{ p: 2, alignSelf: 'start', boxShadow: '0 4px 15px #15372b08' }}>
          <Stack direction="row" spacing={1.4} sx={{ alignItems: 'center', mb: 1.2 }}>
            <Box sx={{ borderRadius: 1, width: 38, height: 38, bgcolor: '#E2F0EA', color: 'primary.dark', display: 'grid', placeItems: 'center' }}><Icon fontSize="small" /></Box>
            <Typography component="h2" variant="h6">{t('nav:' + group)}</Typography>
          </Stack>
          {items.map(item => <ButtonBase key={item.path} component={Link} to={item.path} sx={{ width: '100%', minHeight: 44, px: 1, textAlign: 'start',
            justifyContent: 'space-between', gap: 1, color: 'text.secondary', borderTop: 1, borderColor: 'divider', '&:hover': { bgcolor: '#F2F8F5', color: 'primary.dark' } }}>
            <Typography variant="body2">{t(item.labelKey)}</Typography><ArrowForwardOutlined sx={{ fontSize: 16 }} /></ButtonBase>)}
        </Paper>;
      })}
    </Box>
    {!entries.length && <EmptyState title={t(error ? 'errors.generic' : 'workspace.noPages')} />}
  </Stack>;
}
