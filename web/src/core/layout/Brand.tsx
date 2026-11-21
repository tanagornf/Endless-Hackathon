import AllInclusive from '@mui/icons-material/AllInclusive';
import { Box, Stack, Typography } from '@mui/material';

export function Brand() {
  return <Stack direction="row" spacing={1.1} sx={{ alignItems: 'center' }}>
    <Box sx={{ display: 'grid', placeItems: 'center', width: 38, height: 38, borderRadius: '12px',
      bgcolor: 'primary.dark', color: '#A4F3C9' }}><AllInclusive sx={{ fontSize: 29 }} /></Box>
    <Typography component="span" sx={{ fontSize: '1.65rem', fontWeight: 600, lineHeight: 1.4, letterSpacing: '-.045em', color: 'text.primary' }}>Endless</Typography>
  </Stack>;
}
