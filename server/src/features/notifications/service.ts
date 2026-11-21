import { AppError } from '../../core';
import type { NotifyInput } from '@nless/shared/features/notifications/types';

/**
 * @owner F31 notifications · C3 · consumers: every lane
 * Persists per-recipient notifications, publishes 'notification.created' to those users, optional web push.
 * @fake no write: logs `[notify:fake] <type> <title>` and returns { notificationIds: [], mode: 'sandbox' }.
 */
export async function notify(input: NotifyInput): Promise<{ notificationIds: string[]; mode: 'real' | 'sandbox' }> {
  return { notificationIds: [], mode: 'sandbox' };
}
