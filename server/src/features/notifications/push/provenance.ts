import { z } from 'zod';
import type { NotifyInput } from '@nless/shared/features/notifications/types';

export const notificationPushPurpose = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('staff-offer'),
    conversationId: z.uuid(),
    version: z.number().int().min(1).max(2147483647),
  }),
  z.strictObject({
    kind: z.literal('owner-consult'),
    caseId: z.uuid(),
    actionStepId: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
  }),
]);

export type NotificationPushPurpose = z.infer<typeof notificationPushPurpose>;

type Event = Pick<NotifyInput, 'businessId' | 'dedupKey' | 'type' | 'to'>;

export function classifyNotificationPush(event: Event): {
  dedupKey: string | null;
  purpose: NotificationPushPurpose | null;
} {
  const { businessId, type, to, dedupKey = null } = event;
  const plain = { dedupKey, purpose: null };
  if (!dedupKey) return plain;
  const [marker, eventBusiness, subjectId, step, extra] = dedupKey.split(':');
  if (eventBusiness?.toLowerCase() !== businessId.toLowerCase() || extra !== undefined) return plain;

  if (marker === 'staff-offer-accepted' && type === 'chat.handoff' &&
      'permission' in to && to.permission === 'chat.takeover' && step && /^v[1-9]\d{0,9}$/.test(step)) {
    const purpose = notificationPushPurpose.safeParse({
      kind: 'staff-offer', conversationId: subjectId?.toLowerCase(), version: Number(step.slice(1)),
    });
    if (purpose.success && purpose.data.kind === 'staff-offer') {
      return { dedupKey: 'handoff:' + purpose.data.conversationId + ':v' + purpose.data.version, purpose: purpose.data };
    }
  }

  if (marker === 'ai-owner-review' && type === 'system' && 'role' in to && to.role === 'owners') {
    const purpose = notificationPushPurpose.safeParse({
      kind: 'owner-consult', caseId: subjectId?.toLowerCase(), actionStepId: step,
    });
    if (purpose.success && purpose.data.kind === 'owner-consult') {
      const parts = [marker, businessId.toLowerCase(), purpose.data.caseId, purpose.data.actionStepId];
      return { dedupKey: parts.join(':'), purpose: purpose.data };
    }
  }
  return plain;
}

export function canReceivePhoneAlert(
  purpose: NotificationPushPurpose,
  role: 'owner' | 'staff',
  permissions: readonly string[],
): boolean {
  return role === 'owner' ||
    (purpose.kind === 'staff-offer' && permissions.includes('chat.read') && permissions.includes('chat.takeover'));
}
