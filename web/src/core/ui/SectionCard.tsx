import { Card, CardContent, CardHeader } from '@mui/material';
import type { SectionCardProps } from '../types';

export function SectionCard({ children, title, actions }: SectionCardProps) {
  return <Card variant="outlined">
    {(title || actions) && <CardHeader title={title} action={actions} slotProps={{ title: { variant: 'h6' } }}
      sx={{ flexWrap: { xs: 'wrap', sm: 'nowrap' }, '& .MuiCardHeader-action': { m: 0, alignSelf: 'center' } }} />}
    <CardContent>{children}</CardContent>
  </Card>;
}
