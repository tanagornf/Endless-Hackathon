import { z } from 'zod';
import { AppError, db } from '../../core';
import type { DbExecutor } from '../../core';
import type { Channel, MarketingConsent } from '@nless/shared/core/types';
import type { CrmCustomerDetail, CrmCustomerRow, CrmTag, CustomerProfile, CustomerSummary } from '@nless/shared/features/crm/types';
import type { ListCustomersQuery } from './schemas';

export const uuid = z.string().uuid();
export const missing = () => new AppError('NOT_FOUND', 'CRM record not found');
const person = 'COALESCE(m.person_id,c.id)';
const identities = `FROM customers c LEFT JOIN crm_person_members m ON m.customer_id=c.id AND m.business_id=c.business_id`;
const counts = `SELECT count(*)::int ${identities} JOIN crm_customer_tags a ON a.person_id=${person} AND a.business_id=c.business_id
  WHERE c.business_id=t.business_id AND a.tag_id=t.id AND c.external_id NOT LIKE 'eval-%'`;

export async function tags(businessId: string): Promise<CrmTag[]> {
  return (await db.query<CrmTag>(`SELECT t.id,t.name,t.description,t.color,t.version,(${counts}) AS "customerCount",
    (SELECT count(*)::int FROM crm_rules r WHERE r.business_id=t.business_id AND r.tag_id=t.id) AS "ruleCount"
    FROM crm_tags t WHERE t.business_id=$1 ORDER BY t.name_key COLLATE "C", t.id`, [businessId])).rows;
}

export async function personFor(tx: DbExecutor, businessId: string, customerId: string) {
  if (!uuid.safeParse(customerId).success) throw missing();
  const row = await tx.maybeOne<{ id: string }>(`SELECT ${person} AS id ${identities} WHERE c.business_id=$1 AND c.id=$2`,
    [businessId, customerId]);
  if (!row) throw missing();
  return row.id;
}

type Identity = {
  id: string; personId: string; businessId: string; displayName: string; channel: Channel; externalId: string;
  firstSeenAt: Date; lastSeenAt: Date; createdSort: string; seenSort: string; tags: CrmCustomerRow['tags'];
  marketingConsent: MarketingConsent; consentSource: string | null; consentTime: Date | null;
  phone: string | null; email: string | null; address: string | null; note: string | null; version: number; memberCount: number;
};
const columns = `c.id,${person} AS "personId",c.business_id AS "businessId",c.display_name AS "displayName",
  c.channel,c.external_id AS "externalId",c.first_seen_at AS "firstSeenAt",c.last_seen_at AS "lastSeenAt",
  c.created_at::text AS "createdSort",c.last_seen_at::text AS "seenSort",coalesce(s.status,'unknown') AS "marketingConsent",
  s.source AS "consentSource",s.updated_at AS "consentTime",nullif(p.phone,'') AS phone,nullif(p.email,'') AS email,
  nullif(p.address,'') AS address,nullif(p.note,'') AS note,coalesce(p.version,1) AS version,
  (SELECT count(*)::int + 1 FROM crm_person_members pm WHERE pm.business_id=c.business_id AND pm.person_id=${person}) AS "memberCount",
  COALESCE((SELECT jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'color',t.color,'source',a.source) ORDER BY t.name_key COLLATE "C")
    FROM crm_customer_tags a JOIN crm_tags t ON t.id=a.tag_id AND t.business_id=a.business_id
    WHERE a.business_id=c.business_id AND a.person_id=${person}), '[]'::jsonb) AS tags`;
const joins = `${identities} LEFT JOIN crm_profiles p ON p.business_id=c.business_id AND p.person_id=${person}
  LEFT JOIN crm_consents s ON s.business_id=c.business_id AND s.person_id=${person}`;
const matchTag = `EXISTS(SELECT 1 FROM crm_customer_tags a JOIN crm_tags t ON t.id=a.tag_id AND t.business_id=a.business_id
  WHERE a.business_id=c.business_id AND a.person_id=${person} AND a.tag_id=ANY($2::uuid[]))`;

function summary(row: Identity): CustomerSummary {
  return {
    id: row.id, businessId: row.businessId, displayName: row.displayName, channel: row.channel,
    externalId: row.externalId, tagIds: row.tags.map(tag => tag.id), marketingConsent: row.marketingConsent, lastSeenAt: row.lastSeenAt.toISOString()
  };
}
function publicRow(row: Identity): CrmCustomerRow {
  return {
    id: row.id, displayName: row.displayName, channel: row.channel, tags: row.tags, marketingConsent: row.marketingConsent,
    lastSeenAt: row.lastSeenAt.toISOString(), phone: row.phone, memberCount: row.memberCount
  };
}
async function identity(businessId: string, id: string) {
  if (!uuid.safeParse(id).success) return null;
  return db.maybeOne<Identity>(`SELECT ${columns} ${joins} WHERE c.business_id=$1 AND c.id=$2`, [businessId, id]);
}
export async function profile(businessId: string, id: string): Promise<CustomerProfile | null> {
  const r = await identity(businessId, id);
  return r && {
    ...summary(r), tags: r.tags.map(({ id, name, source }) => ({ id, name, source })), firstSeenAt: r.firstSeenAt.toISOString(),
    contact: { phone: r.phone, email: r.email, address: r.address }, note: r.note
  };
}
export async function detail(businessId: string, id: string): Promise<CrmCustomerDetail> {
  const r = await identity(businessId, id);
  if (!r) throw missing();
  const [members, history, conversation] = await Promise.all([
    db.query<CrmCustomerDetail['members'][number]>(`SELECT c.id AS "customerId",c.display_name AS "displayName",c.channel,
      c.last_seen_at AS "lastSeenAt",(c.id=$2) AS "isPrimary" ${identities} WHERE c.business_id=$1 AND ${person}=$2
      ORDER BY (c.id=$2) DESC,c.id`, [businessId, r.personId]),
    db.query<CrmCustomerDetail['consent']['history'][number]>(`SELECT e.status,e.previous_status AS "previousStatus",e.source,
      u.display_name AS "actorName",e.reason,e.created_at AS "createdAt" FROM crm_consent_events e
      LEFT JOIN users u ON u.id=e.actor_user_id WHERE e.business_id=$1 AND e.person_id=$2 ORDER BY e.created_at DESC,e.id DESC LIMIT 10`, [businessId, r.personId]),
    db.maybeOne<{ id: string }>(`SELECT id FROM conversations WHERE business_id=$1 AND customer_id=$2 ORDER BY last_message_at DESC NULLS LAST,id LIMIT 1`, [businessId, id]),
  ]);
  return {
    ...publicRow(r), externalIdMasked: '…' + r.externalId.slice(-4), firstSeenAt: r.firstSeenAt.toISOString(),
    contact: { phone: r.phone, email: r.email, address: r.address }, note: r.note, profileVersion: r.version, members: members.rows,
    consent: { status: r.marketingConsent, source: r.consentSource, updatedAt: r.consentTime?.toISOString() ?? null, history: history.rows },
    lastConversationId: conversation?.id ?? null
  };
}

function decode(cursor: string | null | undefined, field: 'createdAt' | 'sort') {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (!uuid.safeParse(parsed.id).success || typeof parsed[field] !== 'string' || !Number.isFinite(Date.parse(parsed[field]))) throw new Error();
    return { id: parsed.id as string, time: parsed[field] as string };
  } catch { throw new AppError('VALIDATION_ERROR', 'Invalid CRM page cursor'); }
}
function encode(field: 'createdAt' | 'sort', time: string, id: string) {
  return Buffer.from(JSON.stringify({ [field]: time, id })).toString('base64url');
}

export async function audience(businessId: string, tagIds: string[], opts: { cursor?: string | null; limit?: number; requireConsent?: 'granted' } = {}) {
  const limit = Math.min(opts.limit ?? 50, 200);
  if (!Number.isInteger(opts.limit ?? 50) || limit < 1) throw new AppError('VALIDATION_ERROR', 'Invalid CRM page size');
  const selected = tagIds.filter(id => uuid.safeParse(id).success);
  if (!selected.length) return { items: [], nextCursor: null };
  const cursor = decode(opts.cursor, 'createdAt');
  const { rows } = await db.query<Identity>(`SELECT ${columns} ${joins} WHERE c.business_id=$1 AND c.external_id NOT LIKE 'eval-%'
    AND ${matchTag} AND ($3::text IS NULL OR s.status=$3)
    AND ($4::timestamptz IS NULL OR (c.created_at,c.id)>($4,$5::uuid)) ORDER BY c.created_at,c.id LIMIT $6`,
    [businessId, selected, opts.requireConsent ?? null, cursor?.time ?? null, cursor?.id ?? null, limit + 1]);
  const last = rows[limit - 1];
  return { items: rows.slice(0, limit).map(summary), nextCursor: rows.length > limit ? encode('createdAt', last.createdSort, last.id) : null };
}
export async function customerList(businessId: string, q: z.output<typeof ListCustomersQuery>) {
  const cursor = decode(q.cursor, 'sort');
  const filter = `c.business_id=$1 AND c.external_id NOT LIKE 'eval-%' AND (cardinality($2::uuid[])=0 OR ${matchTag})
    AND ($3::text IS NULL OR coalesce(s.status,'unknown')=$3) AND ($4::text IS NULL OR c.channel=$4)
    AND ($5='' OR strpos(lower(c.display_name),lower($5))>0 OR (strpos($5,'@')>0 AND starts_with(p.email_norm,lower($5)))
      OR ($6<>'' AND starts_with(p.phone_norm,$6)))`;
  const term = q.q ?? '';
  const params = [businessId, q.tagId, q.consent ?? null, q.channel ?? null, term, /^\d{3,}$/.test(term) ? term : ''];
  const [{ rows }, count] = await Promise.all([
    db.query<Identity>(`SELECT ${columns} ${joins} WHERE ${filter}
      AND ($7::timestamptz IS NULL OR c.last_seen_at<$7 OR (c.last_seen_at=$7 AND c.id>$8::uuid))
      ORDER BY c.last_seen_at DESC,c.id LIMIT $9`, [...params, cursor?.time ?? null, cursor?.id ?? null, q.limit + 1]),
    db.one<{ total: number }>(`SELECT count(*)::int AS total ${joins} WHERE ${filter}`, params),
  ]);
  const last = rows[q.limit - 1];
  return { items: rows.slice(0, q.limit).map(publicRow), total: count.total, nextCursor: rows.length > q.limit ? encode('sort', last.seenSort, last.id) : null };
}
