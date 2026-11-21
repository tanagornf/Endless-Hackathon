import { useId, useRef } from 'react';
import { Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, useMediaQuery, useTheme } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { FormDialogProps } from '../types';

export function FormDialog({ open, title, submitLabel, submitDisabled = false, submitting = false, error, onSubmit, onClose, children }: FormDialogProps) {
  const { t } = useTranslation('common');
  const id = useId();
  const pending = useRef(false);
  const mobile = useMediaQuery(useTheme().breakpoints.down('sm'));
  return <Dialog open={open} fullWidth maxWidth="sm" fullScreen={mobile} aria-labelledby={id}
    onClose={() => { if (!submitting && !pending.current) onClose(); }}>
    <form noValidate onSubmit={(event) => {
      event.preventDefault();
      if (submitDisabled || submitting || pending.current) return;
      pending.current = true;
      void Promise.resolve().then(onSubmit).catch(() => {}).finally(() => { pending.current = false; });
    }}>
      <DialogTitle id={id}>{title}</DialogTitle>
      <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>{error && <Alert severity="error">{error}</Alert>}{children}</Stack></DialogContent>
      <DialogActions>
        <Button disabled={submitting} onClick={onClose}>{t('actions.cancel')}</Button>
        <Button type="submit" variant="contained" disabled={submitDisabled || submitting} startIcon={submitting ? <CircularProgress size={16} /> : undefined}>{submitLabel ?? t('actions.save')}</Button>
      </DialogActions>
    </form>
  </Dialog>;
}
