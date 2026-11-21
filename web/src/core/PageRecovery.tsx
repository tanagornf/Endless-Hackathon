import { Button, Stack, Typography } from '@mui/material';
import { Component, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export function recoverMissingModule() {
  // History state survives a reload and is scoped to this navigation entry.
  if (window.history.state?.endlessModuleRetried) return;
  try {
    window.history.replaceState({ ...window.history.state, endlessModuleRetried: true }, '');
  } catch {
    return;
  }
  window.location.reload();
}

function RetryPage() {
  const { t } = useTranslation('common');
  return <Stack component="main" role="alert" spacing={2} sx={{ p: 3, alignItems: 'flex-start' }}>
    <Typography>{t('errors.generic')}</Typography>
    <Button variant="contained" onClick={() => window.location.reload()}>{t('actions.retry')}</Button>
  </Stack>;
}

export class PageRecovery extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <RetryPage /> : this.props.children; }
}
