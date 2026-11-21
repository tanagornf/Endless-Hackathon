import { useState } from 'react';
import { Box, IconButton, InputAdornment, List, ListItemButton, ListItemIcon, ListItemText, ListSubheader, TextField, Typography } from '@mui/material';
import SearchOutlined from '@mui/icons-material/SearchOutlined';
import CloseOutlined from '@mui/icons-material/CloseOutlined';
import { Link, NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { MenuEntry, MenuGroup } from '@nless/shared/core/loader';
import { menuIcon } from '../icons';
import { Brand } from './Brand';

export const groups: MenuGroup[] = ['home','chat','customers','knowledge','ai','live','insights','commerce','settings','help','admin'];
export function Navigation({ entries, close }: { entries: MenuEntry[]; close: () => void }) {
  const { t } = useTranslation('common');
  const [term, setTerm] = useState('');
  const search = term.toLocaleLowerCase().trim();
  const hits = entries.filter(item => [t(item.labelKey), t('nav:' + item.group), item.path, ...(item.searchTerms ?? [])]
    .some(value => value.toLocaleLowerCase().includes(search)));
  return <Box component="nav" aria-label={t('pages.menu')} sx={{ display: 'flex', flexDirection: 'column', height: '100%', width: 260, maxWidth: '90vw' }}>
    <Box component={Link} to="/?view=workspace" onClick={close} sx={{ display: 'block', px: 2.5, py: 2, textDecoration: 'none' }}><Brand /></Box>
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
  </Box>;
}
