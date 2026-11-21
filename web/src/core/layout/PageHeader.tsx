import { Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 3, justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
    <div><Typography component="h1" variant="h5">{title}</Typography>
    {description && <Typography variant="body2" color="text.secondary">{description}</Typography>}</div>
    {actions}
  </Stack>;
}
