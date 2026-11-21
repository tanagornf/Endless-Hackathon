import { Chip } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { StatusChipColor, StatusChipKind, StatusChipProps } from '../types';

const colors: Record<StatusChipKind, Record<string, StatusChipColor>> = {
  feature: { R: 'success', S: 'info', A: 'warning', U: 'default' },
  order: { awaiting_payment: 'warning', paid: 'success', preparing: 'info', shipped: 'primary', delivered: 'success', cancelled: 'default' },
  payment: { unpaid: 'warning', pending_verification: 'info', paid: 'success', refunded: 'default' },
  conversation: { open: 'info', closed: 'default', ai: 'secondary', human: 'warning' },
  generic: { active: 'success', ready: 'success', sent: 'success', succeeded: 'success', completed: 'success',
    running: 'info', indexing: 'info', reviewed: 'info', booked: 'info', draft: 'warning', pending: 'warning', queued: 'warning',
    not_started: 'warning', unknown: 'warning', no_show: 'warning', failed: 'error', dead: 'error',
    inactive: 'default', deleted: 'default', cancelled: 'default', not_required: 'default' },
};
export function StatusChip({ kind = 'generic', status, label }: StatusChipProps) {
  const { t } = useTranslation('common');
  const color = Object.hasOwn(colors[kind], status) ? colors[kind][status] : 'default';
  return <Chip size="small" color={color} data-color={color} label={label ?? t('status.' + kind + '.' + status, { defaultValue: status })} />;
}
