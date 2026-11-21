import { useMediaQuery, useTheme } from '@mui/material';
import { TeamControls } from './TeamControls';

export default function QuickActions({ conversationId }: Record<string, unknown>) {
  const desktop = useMediaQuery(useTheme().breakpoints.up('md'));
  if (desktop || typeof conversationId !== 'string' || !conversationId) return null;
  return <TeamControls key={conversationId} conversationId={conversationId} compact />;
}
