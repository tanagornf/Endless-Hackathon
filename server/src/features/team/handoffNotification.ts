import type { NotifyInput } from '@nless/shared/features/notifications/types';
import { db } from '../../core';
import { notify } from '../notifications/service';

interface NotificationTarget {
  businessId: string;
  customerId: string;
  conversationId: string;
  version: number;
}

const titles: Record<string, { th: string; en: string }> = {
  customer_request: { th: 'ลูกค้าต้องการคุยกับพนักงาน', en: 'Customer asked to speak to a team member' },
  budget_exhausted: { th: 'AI หยุดตอบเนื่องจากวงเงิน API หมด', en: 'AI stopped because the API budget was exhausted' },
  ai_failed: { th: 'AI ตอบไม่สำเร็จ กรุณารับช่วงแชต', en: 'AI could not reply. Please take over the conversation.' },
};
const defaultTitle = { th: 'แชตรอให้พนักงานรับช่วง', en: 'A conversation needs a team member' };

export async function prepareHandoffNotification(row: NotificationTarget, reason: string): Promise<NotifyInput> {
  const { getBusinessSettings } = await import('../business-settings/service');
  const [settings, customer] = await Promise.all([
    getBusinessSettings(row.businessId),
    db.maybeOne<{ displayName: string }>(
      'SELECT display_name AS "displayName" FROM customers WHERE id = $1 AND business_id = $2',
      [row.customerId, row.businessId],
    ),
  ]);
  return {
    businessId: row.businessId,
    to: { permission: 'chat.takeover' },
    type: 'chat.handoff',
    title: (Object.hasOwn(titles, reason) ? titles[reason] : defaultTitle)[settings.language],
    body: customer?.displayName || undefined,
    link: '/chat?c=' + row.conversationId,
    dedupKey: 'handoff:' + row.conversationId + ':v' + row.version,
  };
}

export async function notifyHandoff(row: NotificationTarget, reason: string) {
  return notify(await prepareHandoffNotification(row, reason));
}
