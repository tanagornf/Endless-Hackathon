import { Box, Button, ButtonBase, LinearProgress, Paper, Stack, Typography } from '@mui/material';
import AllInclusiveOutlined from '@mui/icons-material/AllInclusiveOutlined';
import ArrowForwardOutlined from '@mui/icons-material/ArrowForwardOutlined';
import ExpandMoreOutlined from '@mui/icons-material/ExpandMoreOutlined';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { menuIcon } from '../icons';
import { useNavigation } from '../layout/AppShell';
import { groups } from '../layout/Navigation';
import { PageHeader } from '../layout/PageHeader';
import { useSession } from '../session';
import { EmptyState } from '../ui';

const shortcuts = [
  { path: '/chat', label: 'workspace.openInbox' },
  { path: '/demo-chat', label: 'workspace.testChat' },
  { path: '/catalog', label: 'workspace.manageCatalog' },
  { path: '/dashboard', label: '' },
  { path: '/knowledge', label: '' },
  { path: '/members', label: '' },
];

export default function WorkspaceHome({ showDirectory }: { showDirectory: boolean }) {
  const { t } = useTranslation('common');
  const { entries, flags, error } = useNavigation();
  const { currentBusiness } = useSession();
  if (showDirectory && !flags && !error) return <LinearProgress aria-label={t('pages.loading')} />;
  const actions = shortcuts.flatMap(({ path, label }) => {
    const entry = entries.find(item => item.path === path);
    return entry ? [{ ...entry, label: t(label || entry.labelKey) }] : [];
  });
  return <Stack spacing={{ xs: 2.5, sm: 3.5 }}>
    {showDirectory ? <Box component="section" aria-labelledby="workspace-title" sx={{
      position: 'relative', isolation: 'isolate', overflow: 'hidden', borderRadius: '18px',
      background: 'linear-gradient(110deg, #103F40 12%, #15534E 65%, #227466)',
      color: 'white', px: { xs: 2.5, sm: 4 }, py: { xs: 3, sm: 4 },
    }}>
      <AllInclusiveOutlined aria-hidden sx={{
        position: 'absolute', zIndex: -1, pointerEvents: 'none', color: '#A0E2C9', opacity: .14,
        right: { xs: -46, sm: -16 }, top: '50%', transform: 'translateY(-50%) rotate(-15deg)',
        fontSize: { xs: 175, sm: 315 },
      }} />
      <Typography variant="body2" sx={{ color: '#C0E8D9', fontWeight: 600 }}>
        {currentBusiness?.name ?? 'Endless'}
      </Typography>
      <Typography id="workspace-title" component="h1" variant="h4" sx={{
        mt: .5, fontSize: { xs: '1.65rem', sm: '2.15rem' }, lineHeight: 1.4,
      }}>{t('workspace.title')}</Typography>
    </Box> : <>
      <PageHeader title={t('pages.home')} actions={
        <Button component={Link} to="/?view=workspace" endIcon={<ArrowForwardOutlined />}>
          {t('workspace.title')}
        </Button>
      } />
      <Typography>{t('pages.welcome')}</Typography>
    </>}
    {flags && actions.length > 0 && <Paper component="section" variant="outlined" aria-labelledby="shop-shortcuts" sx={{ p: { xs: 1.5, sm: 2 } }}>
      <Typography id="shop-shortcuts" component="h2" variant="h6" sx={{ mb: 1.5 }}>{t('workspace.shortcuts')}</Typography>
      <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: 'repeat(auto-fit, minmax(min(130px, 100%), 1fr))' }}>
        {actions.map(item => {
          const Icon = menuIcon(item.icon);
          return <ButtonBase key={item.path} component={Link} to={item.path} sx={{
            flexDirection: 'column', gap: 1, minHeight: 88, px: 1, py: 1.25, borderRadius: '10px',
            bgcolor: '#F2F7F5', color: 'text.primary', '&:hover, &:focus-visible': { bgcolor: 'primary.light', color: 'primary.dark' },
          }}>
            <Box component="span" sx={{ display: 'grid', placeItems: 'center', width: 36, height: 36,
              borderRadius: '50%', color: 'primary.dark', bgcolor: '#DDEDE6' }}><Icon fontSize="small" /></Box>
            <Typography component="span" variant="body2" sx={{ fontWeight: 600 }}>{item.label}</Typography>
          </ButtonBase>;
        })}
      </Box>
    </Paper>}

    {showDirectory && (entries.length > 0 ? <Box component="section" aria-labelledby="directory-title">
      <Typography id="directory-title" component="h2" variant="h6" sx={{ mb: 1.5 }}>
        {t('workspace.allTools')}
      </Typography>
      <Box sx={{
        display: 'grid', gap: 1.25, alignItems: 'start',
        gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' },
      }}>
        {groups.map(group => {
          const items = entries.filter(item => item.group === group);
          if (!items.length) return null;
          const Icon = menuIcon(items[0].icon);
          return <Paper key={group} component="details" variant="outlined" sx={{
            overflow: 'hidden', '&[open] > summary .directory-chevron': { transform: 'rotate(180deg)' },
          }}>
            <Box component="summary" sx={{
              display: 'flex', alignItems: 'center', gap: 1.25, minHeight: 60, px: 1.5, cursor: 'pointer',
              listStyle: 'none', '&::-webkit-details-marker': { display: 'none' },
              '&:hover': { bgcolor: '#F3F8F6' }, '&:focus-visible': { outlineOffset: -3 },
            }}>
              <Box component="span" sx={{
                display: 'grid', placeItems: 'center', width: 32, height: 32, flexShrink: 0,
                borderRadius: '8px', bgcolor: 'primary.light', color: 'primary.dark',
              }}><Icon sx={{ fontSize: 18 }} /></Box>
              <Typography component="span" variant="body2" sx={{ flex: 1, fontWeight: 600 }}>{t('nav:' + group)}</Typography>
              <ExpandMoreOutlined className="directory-chevron" sx={{ fontSize: 20, color: 'text.secondary' }} />
            </Box>
            <Box sx={{ borderTop: 1, borderColor: 'divider', p: .5 }}>
              {items.map(item => <ButtonBase key={item.path} component={Link} to={item.path} sx={{
                width: '100%', minHeight: 44, px: 1.25, py: .5, gap: 1, borderRadius: '6px',
                justifyContent: 'space-between', textAlign: 'start', color: 'text.secondary',
                '&:hover, &:focus-visible': { bgcolor: '#F2F8F5', color: 'primary.dark' },
              }}>
                <Typography variant="body2">{t(item.labelKey)}</Typography>
                <ArrowForwardOutlined sx={{ fontSize: 16 }} />
              </ButtonBase>)}
            </Box>
          </Paper>;
        })}
      </Box>
    </Box> : <EmptyState title={t(error ? 'errors.generic' : 'workspace.noPages')} />)}
  </Stack>;
}
