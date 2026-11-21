import { z } from 'zod';
import { AppError, auditInTransaction, db, publish } from '../../core';
import type { DbExecutor } from '../../core';
import type { MarketingConsent } from '@nless/shared/core/types';
import { missing, personFor, tags, uuid } from './repo';
import type { AssignTagBody, CreateTagBody, UpdateTagBody } from './schemas';

type Actor = { businessId: string; actorUserId: string | null };
type TagDraft = z.output<typeof CreateTagBody>;
const deny = (reason: string, extra = {}) => new AppError('POLICY_BLOCKED', reason, { details: { reason, ...extra } });
const lock = (tx: DbExecutor, key: string) => tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [key]);
const tagLock = (tx: DbExecutor, businessId: string) => lock(tx, 'crm:tags:' + businessId);
const changed = (businessId: string, customerId?: string) => publish(businessId, {
  type: 'custom', featureId: 'F24', name: customerId ? 'crm.customer.changed' : 'crm.customers.changed', data: customerId ? { customerId } : {},
});

function audit(tx: DbExecutor, actor: Actor, action: string, targetType: 'customer' | 'tag', targetId: string, details: Record<string, unknown> = {}) {
  return auditInTransaction(tx, [{ ...actor, action, targetType, targetId, details }]);
}
function cleanName(input: string) {
  const name = input.normalize('NFKC').trim().replace(/\s+/g, ' ');
  const length = [...new Intl.Segmenter('th', { granularity: 'grapheme' }).segment(name)].length;
  if (!length || length > 32) throw new AppError('VALIDATION_ERROR', 'Invalid tag length', { details: { reason: 'name_too_long' } });
  return { name, key: name.toLowerCase() };
}
async function requireTag(tx: DbExecutor, businessId: string, id: string) {
  if (!uuid.safeParse(id).success) throw missing();
  const tag = await tx.maybeOne<{ id: string; version: number }>(`SELECT id,version FROM crm_tags WHERE business_id=$1 AND id=$2 FOR UPDATE`, [businessId, id]);
  if (!tag) throw missing();
  return tag;
}
async function insertTag(tx: DbExecutor, actor: Actor, draft: TagDraft, reuse: boolean) {
  const { name, key } = cleanName(draft.name);
  await tagLock(tx, actor.businessId);
  const existing = await tx.maybeOne<{ id: string }>('SELECT id FROM crm_tags WHERE business_id=$1 AND name_key=$2', [actor.businessId, key]);
  if (existing) {
    if (reuse) return existing.id;
    throw deny('tag_exists', { tagId: existing.id });
  }
  const { count } = await tx.one<{ count: number }>('SELECT count(*)::int AS count FROM crm_tags WHERE business_id=$1', [actor.businessId]);
  if (count >= 30) throw deny('tag_limit');
  const { id } = await tx.one<{ id: string }>(`INSERT INTO crm_tags(business_id,name,name_key,description,color,created_by)
    VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, [actor.businessId, name, key, draft.description, draft.color, actor.actorUserId]);
  await audit(tx, actor, 'crm.tag.create', 'tag', id);
  return id;
}
async function tagResult(businessId: string, id: string) {
  const tag = (await tags(businessId)).find(t => t.id === id);
  if (!tag) throw missing();
  return tag;
}
export async function createTag(actor: Actor, draft: TagDraft) {
  const id = await db.tx(tx => insertTag(tx, actor, draft, false));
  changed(actor.businessId);
  return tagResult(actor.businessId, id);
}
export async function updateTag(actor: Actor, id: string, patch: z.output<typeof UpdateTagBody>) {
  await db.tx(async tx => {
    await tagLock(tx, actor.businessId);
    const tag = await requireTag(tx, actor.businessId, id);
    if (tag.version !== patch.expectedVersion) throw new AppError('VERSION_CONFLICT', 'Tag changed');
    const display = patch.name === undefined ? null : cleanName(patch.name);
    if (display) {
      const other = await tx.maybeOne<{ id: string }>('SELECT id FROM crm_tags WHERE business_id=$1 AND name_key=$2 AND id<>$3', [actor.businessId, display.key, id]);
      if (other) throw deny('tag_exists', { tagId: other.id });
    }
    await tx.query(`UPDATE crm_tags SET name=coalesce($3,name),name_key=coalesce($4,name_key),description=coalesce($5,description),
      color=coalesce($6,color),version=version+1,updated_at=now() WHERE business_id=$1 AND id=$2`,
      [actor.businessId, id, display?.name, display?.key, patch.description, patch.color]);
    await audit(tx, actor, 'crm.tag.update', 'tag', id);
  });
  changed(actor.businessId);
  return tagResult(actor.businessId, id);
}
export async function deleteTag(actor: Actor, id: string) {
  await db.tx(async tx => {
    await tagLock(tx, actor.businessId);
    await requireTag(tx, actor.businessId, id);
    if (await tx.maybeOne('SELECT 1 FROM crm_rules WHERE business_id=$1 AND tag_id=$2 LIMIT 1', [actor.businessId, id])) throw deny('tag_has_rules');
    await tx.query('DELETE FROM crm_tags WHERE business_id=$1 AND id=$2', [actor.businessId, id]);
    await audit(tx, actor, 'crm.tag.delete', 'tag', id);
  });
  changed(actor.businessId);
}
export async function assignTag(actor: Actor, customerId: string, input: z.output<typeof AssignTagBody>) {
  const modified = await db.tx(async tx => {
    const personId = await personFor(tx, actor.businessId, customerId);
    const tagId = 'tagId' in input ? input.tagId : await insertTag(tx, actor, { name: input.name, color: input.color ?? 'grey', description: '' }, true);
    await requireTag(tx, actor.businessId, tagId);
    const result = await tx.query(`INSERT INTO crm_customer_tags(business_id,person_id,tag_id,source,added_by) VALUES ($1,$2,$3,'manual',$4)
      ON CONFLICT(person_id,tag_id) DO UPDATE SET source='manual',rule_id=NULL,evidence=NULL,added_at=now(),added_by=EXCLUDED.added_by
      WHERE crm_customer_tags.business_id=EXCLUDED.business_id AND crm_customer_tags.source<>'manual'`,
      [actor.businessId, personId, tagId, actor.actorUserId]);
    await tx.query('DELETE FROM crm_tag_suppressions WHERE person_id=$1 AND tag_id=$2', [personId, tagId]);
    if (result.rowCount) await audit(tx, actor, 'crm.tag.assign', 'customer', customerId, { tagId, source: 'manual', via: 'staff' });
    return result.rowCount > 0;
  });
  if (modified) changed(actor.businessId, customerId);
}
export async function unassignTag(actor: Actor, customerId: string, tagId: string) {
  const removed = await db.tx(async tx => {
    const personId = await personFor(tx, actor.businessId, customerId);
    await requireTag(tx, actor.businessId, tagId);
    const row = await tx.maybeOne<{ source: string; rule_id: string | null }>(`DELETE FROM crm_customer_tags WHERE business_id=$1 AND person_id=$2 AND tag_id=$3 RETURNING source,rule_id`, [actor.businessId, personId, tagId]);
    if (!row) return false;
    if (row.source === 'automation' && row.rule_id) {
      await tx.query('INSERT INTO crm_tag_suppressions(person_id,tag_id,rule_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [personId, tagId, row.rule_id]);
    }
    await audit(tx, actor, 'crm.tag.unassign', 'customer', customerId, { tagId, source: row.source, via: 'staff' });
    return true;
  });
  if (removed) changed(actor.businessId, customerId);
}
export async function addInferredTag(input: { businessId: string; customerId: string; tagId: string; evidence: string }): Promise<{ added: boolean }> {
  if (!input.evidence.trim() || Array.from(input.evidence).length > 300) throw new AppError('VALIDATION_ERROR', 'Tag evidence is too long');
  const added = await db.tx(async tx => {
    const personId = await personFor(tx, input.businessId, input.customerId);
    await requireTag(tx, input.businessId, input.tagId);
    const result = await tx.query(`INSERT INTO crm_customer_tags(business_id,person_id,tag_id,source,evidence)
      VALUES($1,$2,$3,'inferred',$4) ON CONFLICT DO NOTHING`, [input.businessId, personId, input.tagId, input.evidence]);
    if (result.rowCount) await audit(tx, { businessId: input.businessId, actorUserId: null }, 'crm.tag.assign', 'customer', input.customerId, { tagId: input.tagId, source: 'inferred', via: 'inferred' });
    return result.rowCount > 0;
  });
  if (added) changed(input.businessId, input.customerId);
  return { added };
}
export async function setMarketingConsent(input: { businessId: string; customerId: string; status: MarketingConsent; source: 'staff' | 'customer' | 'import' | 'system'; actorUserId?: string | null; reason?: string }): Promise<{ status: MarketingConsent; changed: boolean }> {
  if (Array.from(input.reason ?? '').length > 300) throw new AppError('VALIDATION_ERROR', 'Consent reason is too long');
  const modified = await db.tx(async tx => {
    const personId = await personFor(tx, input.businessId, input.customerId);
    await lock(tx, 'crm:consent:' + personId);
    const previous = (await tx.maybeOne<{ status: MarketingConsent }>('SELECT status FROM crm_consents WHERE business_id=$1 AND person_id=$2', [input.businessId, personId]))?.status ?? 'unknown';
    if (previous === input.status) return false;
    if (previous === 'revoked' && input.source !== 'staff') throw deny('revoked_is_sticky');
    const values = [input.businessId, personId, input.status, input.source, input.actorUserId ?? null, input.reason ?? ''];
    await tx.query(`INSERT INTO crm_consents(business_id,person_id,status,source,actor_user_id,reason) VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT(person_id) DO UPDATE SET status=EXCLUDED.status,source=EXCLUDED.source,actor_user_id=EXCLUDED.actor_user_id,
      reason=EXCLUDED.reason,updated_at=now() WHERE crm_consents.business_id=EXCLUDED.business_id`, values);
    await tx.query(`INSERT INTO crm_consent_events(business_id,person_id,status,source,actor_user_id,reason,previous_status) VALUES($1,$2,$3,$4,$5,$6,$7)`, [...values, previous]);
    await audit(tx, { businessId: input.businessId, actorUserId: input.actorUserId ?? null }, 'crm.consent.change', 'customer', input.customerId, { from: previous, to: input.status, source: input.source });
    return true;
  });
  if (modified) changed(input.businessId, input.customerId);
  return { status: input.status, changed: modified };
}
