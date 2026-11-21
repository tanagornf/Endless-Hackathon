import { useId, useState } from 'react';
import { Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { ConfirmDialogProps } from '../types';

export function ConfirmDialog({ open, title, message, confirmLabel, danger, onConfirm, onClose }: ConfirmDialogProps) {
  const id = useId();
  const [pending, setPending] = useState(false);
  const { t } = useTranslation('common');
  return <Dialog open={open} fullWidth maxWidth="xs" aria-labelledby={id} onClose={() => { if (!pending) onClose(); }}>
    <DialogTitle id={id}>{title}</DialogTitle>
    <DialogContent><DialogContentText component="div">{message}</DialogContentText></DialogContent>
    <DialogActions>
      <Button autoFocus={danger} disabled={pending} onClick={onClose}>{t('actions.cancel')}</Button>
      <Button color={danger ? 'error' : 'primary'} variant="contained" disabled={pending}
        startIcon={pending ? <CircularProgress size={16} /> : undefined} onClick={() => {
          setPending(true);
          void Promise.resolve().then(onConfirm).then(onClose, () => {}).finally(() => setPending(false));
        }}>{confirmLabel ?? t(danger ? 'actions.delete' : 'actions.confirm')}</Button>
    </DialogActions>
  </Dialog>;
}
