import type { NotifyInput } from '@nless/shared/features/notifications/types';
import { db, log } from '../../core';
import { canSeeNotification } from './defaults';
import type { Grants } from './defaults';

interface Member extends Grants { userId: string }

export async function findRecipients(input: NotifyInput): Promise<string[]> {
  const { businessId, to, type } = input;
  const params: unknown[] = [businessId];
  let selector: string;
  let requested: string[] | undefined;
  if ('userIds' in to) {
    requested = [...new Set(to.userIds)];
    params.push(requested);
    selector = 'm.user_id = ANY($2::uuid[])';
  } else if ('permission' in to) {
    params.push(to.permission);
    selector = "(m.role = 'owner' OR $2 = ANY(m.permissions))";
  } else {
    selector = "m.role = 'owner'";
  }
  const { rows } = await db.query<Member>(
    'SELECT m.user_id AS "userId", m.role, m.permissions FROM memberships m JOIN users u ON u.id = m.user_id'
    + " WHERE m.business_id = $1 AND m.status = 'active' AND u.status = 'active' AND "
    + selector + ' ORDER BY m.user_id LIMIT 201', params,
  );
  if (requested && rows.length < requested.length) {
    log.warn({ type, skipped: requested.length - rows.length }, 'Notification recipients outside the active membership');
  }
  if (rows.length > 200) log.warn({ type }, 'Notification recipients capped at 200');
  return rows.slice(0, 200).filter((member) => canSeeNotification(member, type)).map((member) => member.userId);
}
