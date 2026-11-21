import { useState } from 'react';
import { Box, IconButton, InputAdornment, List, ListItemButton, ListItemIcon, ListItemText, ListSubheader, TextField, Tooltip, Typography } from '@mui/material';
import MenuOpenOutlined from '@mui/icons-material/MenuOpenOutlined';
import SearchOutlined from '@mui/icons-material/SearchOutlined';
import CloseOutlined from '@mui/icons-material/CloseOutlined';
import { Link, NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { MenuEntry, MenuGroup } from '@nless/shared/core/loader';
import { menuIcon } from '../icons';
import { Brand } from './Brand';

export const groups: MenuGroup[] = ['home','chat','customers','knowledge','ai','live','insights','commerce','settings','help','admin'];
const railPaths = ['/dashboard', '/chat', '/catalog', '/knowledge', '/demo-chat', '/channels', '/members'];
export function Navigation({ entries, close, desktop = false }: { entries: MenuEntry[]; close: () => void; desktop?: boolean }) {
  const { t } = useTranslation('common');
  const [term, setTerm] = useState('');
  const [compact, setCompact] = useState(() => {
    if (!desktop) return false;
    try { return localStorage.getItem('endless.navigation') !== 'expanded'; } catch { return true; }
  });
  function toggleWidth() {
    setCompact(!compact);
    try { localStorage.setItem('endless.navigation', compact ? 'expanded' : 'compact'); } catch { /* Optional preference. */ }
  }
  const search = term.toLocaleLowerCase().trim();
  const hits = entries.filter(item => [t(item.labelKey), t('nav:' + item.group), item.path, ...(item.searchTerms ?? [])]
    .some(value => value.toLocaleLowerCase().includes(search)));
  const toggleLabel = t(compact ? 'workspace.expandMenu' : 'workspace.collapseMenu');
  return <Box component="nav" aria-label={t('pages.menu')} sx={{ display: 'flex', flexDirection: 'column', height: '100%', width: compact ? 68 : 260, maxWidth: '90vw' }}>
    <Box sx={{ display: 'flex', flexDirection: compact ? 'column' : 'row', alignItems: 'center', justifyContent: 'space-between', p: 1, gap: .5 }}>
      <Box component={Link} to="/?view=workspace" aria-label={t('workspace.title')} onClick={close}
        sx={{ display: 'grid', placeItems: 'center', minWidth: 44, minHeight: 44, px: compact ? 0 : 1, textDecoration: 'none' }}><Brand compact={compact} /></Box>
      {desktop && <Tooltip title={toggleLabel} placement="right"><IconButton aria-label={toggleLabel} aria-expanded={!compact} onClick={toggleWidth}>
        <MenuOpenOutlined sx={{ transform: compact ? 'scaleX(-1)' : undefined }} />
      </IconButton></Tooltip>}
    </Box>
    {compact ? <Box sx={{ display: 'flex', alignItems: 'center', flexDirection: 'column', gap: .5, pt: 1, borderTop: 1, borderColor: 'divider', overflowY: 'auto' }}>
      {railPaths.map(path => {
        const entry = entries.find(item => item.path === path);
        if (!entry) return null;
        const label = t(entry.labelKey);
        const Icon = menuIcon(entry.icon);
        return <Tooltip key={path} title={label} placement="right">
          <IconButton component={NavLink} to={path} aria-label={label} sx={{
            borderRadius: '10px', color: 'text.secondary', '&.active': { bgcolor: 'primary.light', color: 'primary.dark' },
          }}><Icon fontSize="small" /></IconButton>
        </Tooltip>;
      })}
    </Box> : <>
    <Box sx={{ px: 2, pb: 2, borderBottom: 1, borderColor: 'divider' }}>
      <TextField fullWidth value={term} onChange={e => setTerm(e.target.value)} placeholder={t('workspace.search')}
        slotProps={{ htmlInput: { 'aria-label': t('workspace.search') }, input: {
          startAdornment: <InputAdornment position="start"><SearchOutlined fontSize="small" /></InputAdornment>,
          endAdornment: term && <IconButton size="small" aria-label={t('workspace.clear')} onClick={() => setTerm('')}><CloseOutlined fontSize="small" /></IconButton>,
        } }} sx={{ '& .MuiInputBase-root': { bgcolor: '#F5F8F7', minHeight: 44, fontSize: '.85rem' } }} />
    </Box>
    <Box sx={{ overflowY: 'auto', px: 1.5, py: 1, flex: 1 }}>
      {groups.map(group => {
        const items = hits.filter(entry => entry.group === group);
        if (!items.length) return null;
        return <List key={group} disablePadding subheader={<ListSubheader disableSticky sx={{ color: 'text.secondary', fontSize: '.73rem',
          px: 1.3, pt: 1.5, pb: .5, lineHeight: 1.8, fontWeight: 600 }}>{t('nav:' + group)}</ListSubheader>}>
          {items.map(entry => {
            const Icon = menuIcon(entry.icon);
            return <ListItemButton component={NavLink} to={entry.path} key={entry.path} onClick={close}
              sx={{ minHeight: 44, px: 1.3, borderRadius: 1, color: 'text.secondary', '&.active': {
                bgcolor: '#DEEFEB', color: 'primary.dark', '& .MuiListItemText-primary': { fontWeight: 700 } } }}>
              <ListItemIcon sx={{ minWidth: 33, color: 'inherit' }}><Icon fontSize="small" /></ListItemIcon>
              <ListItemText primary={t(entry.labelKey)} slotProps={{ primary: { variant: 'body2' } }} />
            </ListItemButton>;
          })}
        </List>;
      })}
      {!hits.length && term && <Typography role="status" variant="body2" sx={{ p: 1.5 }}>{t('workspace.noPages')}</Typography>}
    </Box>
    </>}
  </Box>;
}
