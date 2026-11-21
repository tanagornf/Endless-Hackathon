import { Box, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 3, justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
    <Box sx={{ minWidth: 0 }}>
      <Typography component="h1" variant="h5" sx={{ fontSize: { xs: '1.45rem', md: '1.85rem' }, lineHeight: 1.45 }}>{title}</Typography>
      {description && <Typography component="div" variant="body2" sx={{ mt: .5, maxWidth: '75ch', color: 'text.secondary' }}>{description}</Typography>}
    </Box>
    {actions}
  </Stack>;
}
