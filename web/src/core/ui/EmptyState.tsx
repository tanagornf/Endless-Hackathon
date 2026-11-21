import InboxOutlined from '@mui/icons-material/InboxOutlined';
import { Stack, Typography } from '@mui/material';
import type { EmptyStateProps } from '../types';

export function EmptyState({ title, description, action, icon }: EmptyStateProps) {
  return <Stack spacing={1.5} sx={{ py: 6, alignItems: 'center', textAlign: 'center' }}>
    {icon ?? <InboxOutlined color="action" fontSize="large" />}
    <Typography component="p" variant="h6">{title}</Typography>
    {description && <Typography variant="body2" color="text.secondary">{description}</Typography>}{action}
  </Stack>;
}
