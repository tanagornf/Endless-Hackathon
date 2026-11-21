import { Box, MenuItem, Select, Typography } from '@mui/material';
import CheckRounded from '@mui/icons-material/CheckRounded';
import KeyboardArrowDownRounded from '@mui/icons-material/KeyboardArrowDownRounded';
import StorefrontOutlined from '@mui/icons-material/StorefrontOutlined';
import { useTranslation } from 'react-i18next';
import { useSession } from '../session';

export function ShopSwitcher({ onSelect }: { onSelect: (id: string) => void }) {
  const { businesses, currentBusiness } = useSession();
  const { t } = useTranslation('common');
  if (!currentBusiness || businesses.length === 0) return null;

  const identity = <Box component="span" sx={{
    display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, maxWidth: 320,
  }}>
    <Box component="span" sx={{
      display: 'grid', placeItems: 'center', flexShrink: 0, width: 30, height: 30,
      borderRadius: '8px', bgcolor: 'primary.light', color: 'primary.dark',
    }}><StorefrontOutlined sx={{ fontSize: 18 }} /></Box>
    <Typography component="span" variant="body2" noWrap title={currentBusiness.name}
      sx={{ fontWeight: 600, lineHeight: 1.6 }}>{currentBusiness.name}</Typography>
  </Box>;

  return <Select value={currentBusiness.id} onChange={event => onSelect(event.target.value)}
    inputProps={{ 'aria-label': t('pages.shop') }} renderValue={() => identity}
    IconComponent={KeyboardArrowDownRounded}
    sx={{
      minWidth: 0, maxWidth: 320, borderRadius: '10px', bgcolor: 'background.paper',
      '& .MuiSelect-select.MuiSelect-outlined': {
        display: 'flex', alignItems: 'center', minWidth: 0, minHeight: 44, boxSizing: 'border-box', py: 0, pl: .75,
      },
      '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' },
      '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'primary.main' },
      '& .MuiSelect-icon': { color: 'primary.dark', right: 7 },
    }}
    MenuProps={{
      anchorOrigin: { vertical: 'bottom', horizontal: 'left' },
      transformOrigin: { vertical: 'top', horizontal: 'left' },
      slotProps: {
        paper: { elevation: 0, sx: {
          mt: .75, width: 'min(300px, calc(100vw - 32px))', maxHeight: 'min(360px, 60dvh)',
          border: 1, borderColor: 'divider', borderRadius: '12px', boxShadow: '0 8px 24px #173C3221',
        } },
        list: { sx: { p: .5 } },
      },
    }}>
    {businesses.map(({ business }) => <MenuItem key={business.id} value={business.id} sx={{
      minHeight: 44, px: 1.5, py: 1, gap: 1, borderRadius: '8px', whiteSpace: 'normal',
      '&.Mui-selected': { bgcolor: 'primary.light', color: 'primary.dark' },
    }}>
      <Typography component="span" variant="body2" sx={{
        flex: 1, minWidth: 0, overflowWrap: 'anywhere', fontWeight: business.id === currentBusiness.id ? 600 : 400,
      }}>{business.name}</Typography>
      {business.id === currentBusiness.id && <CheckRounded fontSize="small" />}
    </MenuItem>)}
  </Select>;
}
