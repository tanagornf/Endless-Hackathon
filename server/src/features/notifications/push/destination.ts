import { AppError, db } from '../../../core';
import { canReceivePhoneAlert, notificationPushPurpose } from './provenance';
import type { NotificationPushPurpose } from './provenance';
import { isOpaqueId } from './transport';

type PhoneNotice = {
  id: string;
  userId: string;
  businessId: string;
  type: 'chat.handoff' | 'system';
  language: 'th' | 'en';
  link: string | null;
  role: 'owner' | 'staff';
  permissions: string[];
  purpose: NotificationPushPurpose;
};

type PhoneNoticeRow = Omit<PhoneNotice, 'purpose'> & { purpose: unknown };
type NoticeScope = { userId: string; businessId?: never } | { businessId: string; userId?: never };

export async function readPhoneNotice(noticeId: string, scope: NoticeScope): Promise<PhoneNotice | null> {
  if (!isOpaqueId(noticeId)) return null;
  const row = await db.maybeOne<PhoneNoticeRow>(
    'SELECT n.id, n.user_id AS "userId", n.business_id AS "businessId", n.type, u.locale AS language, ' +
    'm.role, m.permissions, n.link, n.push_purpose AS purpose FROM notifications n ' +
    'JOIN memberships m ON m.business_id = n.business_id AND m.user_id = n.user_id ' +
    'JOIN users u ON u.id = n.user_id JOIN businesses b ON b.id = n.business_id ' +
    'JOIN accounts a ON a.id = b.account_id WHERE n.id = $1 ' +
    'AND ($2::uuid IS NULL OR n.user_id = $2) AND ($3::uuid IS NULL OR n.business_id = $3) ' +
    "AND m.status = 'active' AND u.status = 'active' AND b.status = 'active' AND a.status = 'active'",
    [noticeId, scope.userId ?? null, scope.businessId ?? null],
  );
  if (!row) return null;
  const purpose = notificationPushPurpose.safeParse(row.purpose);
  if (!purpose.success || !canReceivePhoneAlert(purpose.data, row.role, row.permissions)) return null;
  const expectedType = purpose.data.kind === 'staff-offer' ? 'chat.handoff' : 'system';
  if (row.type !== expectedType) return null;
  return { ...row, purpose: purpose.data };
}

type PendingOwnerConsult = (input: {
  businessId: string;
  caseId: string;
  actionStepId: string;
}) => Promise<boolean>;

let pendingOwnerConsult: PendingOwnerConsult | undefined;

export function registerOwnerConsultLookup(lookup: PendingOwnerConsult): void {
  if (pendingOwnerConsult && pendingOwnerConsult !== lookup) throw new Error('Owner consult lookup already registered');
  pendingOwnerConsult = lookup;
}

export function sameOriginAppPath(value: string): string | null {
  const origin = 'https://endless.invalid';
  if (!value.startsWith('/') || value.startsWith('//') || /[\s\\]/.test(value)) return null;
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/webhooks/')) return null;
    return url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
}

export function ownerConsultDestination(link: string | null, caseId: string): string | null {
  const safe = link && sameOriginAppPath(link);
  if (!safe) return null;
  const url = new URL(safe, 'https://endless.invalid');
  return url.pathname === '/bot-settings' && url.searchParams.size === 1 &&
    url.searchParams.get('consult') === caseId && !url.hash ? safe : null;
}

function isNotFound(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === 'NOT_FOUND' || code === 'BUSINESS_INACTIVE' || code === 'PERMISSION_DENIED';
}

export async function pendingNoticeDestination(notice: PhoneNotice): Promise<string | null> {
  const { businessId, purpose } = notice;
  try {
    if (purpose.kind === 'staff-offer') {
      const { getExplicitStaffRequestForNotification } = await import('../../team/service');
      const key = 'handoff:' + purpose.conversationId + ':v' + purpose.version;
      const receipt = await getExplicitStaffRequestForNotification(businessId, key);
      return receipt?.conversationId === purpose.conversationId && receipt.committedVersion === purpose.version
        ? '/chat?' + new URLSearchParams({ c: purpose.conversationId })
        : null;
    }
    const link = ownerConsultDestination(notice.link, purpose.caseId);
    return link && await pendingOwnerConsult?.({ businessId, caseId: purpose.caseId, actionStepId: purpose.actionStepId })
      ? link
      : null;
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export async function resolvePhoneNotice(userId: string, noticeId: string) {
  const notice = await readPhoneNotice(noticeId, { userId });
  const link = notice && await pendingNoticeDestination(notice);
  if (!notice || !link) throw new AppError('NOT_FOUND', 'Notification destination unavailable');
  return { businessId: notice.businessId, link };
}
