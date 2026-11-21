import type { AuthScope } from '@nless/shared/core/types';
import type {
  ActiveShopInstruction, ShopInstructionCandidate, ShopInstructionReview, ShopInstructionVersion,
} from '@nless/shared/features/business-settings/shop-instructions-types';
import { AppError, auditInTransaction, db, type DbExecutor } from '../../core';

const versionFields = `id,instruction,parent_version_id AS "parentVersionId",candidate_id AS "candidateId",
  restored_from_version_id AS "restoredFromVersionId",actor_user_id AS "actorUserId",
  to_jsonb(created_at)#>>'{}' AS "createdAt"`;
const candidateFields = `id,base_version_id AS "baseVersionId",instruction,reason,to_jsonb(created_at)#>>'{}' AS "createdAt"`;

export function requireShopInstructionOwner(scope: AuthScope): void {
  if (scope.role !== 'owner') throw new AppError('PERMISSION_DENIED', 'An active shop owner is required');
}

export async function lockShopInstructionRevisions(tx: DbExecutor, businessId: string): Promise<void> {
  await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['shop-instructions:' + businessId]);
}

export function readLatestShopInstruction(tx: DbExecutor, businessId: string) {
  return tx.maybeOne<ShopInstructionVersion & { revision: number }>(`
    SELECT ${versionFields},revision FROM shop_instruction_versions WHERE business_id=$1 ORDER BY revision DESC LIMIT 1`, [businessId]);
}

export function readActiveShopInstruction(businessId: string): Promise<ActiveShopInstruction | null> {
  return db.maybeOne<ActiveShopInstruction>(`
    SELECT id,instruction FROM shop_instruction_versions WHERE business_id=$1 ORDER BY revision DESC LIMIT 1`, [businessId]);
}

export async function listShopInstructions(scope: AuthScope): Promise<ShopInstructionReview> {
  requireShopInstructionOwner(scope);
  return db.one<ShopInstructionReview>(`
    WITH versions AS (
      SELECT revision,${versionFields} FROM shop_instruction_versions WHERE business_id=$1
    ), candidates AS (
      SELECT ${candidateFields} FROM shop_instruction_candidates c
      WHERE c.business_id=$1 AND NOT EXISTS (SELECT 1 FROM versions v WHERE v."candidateId"=c.id)
    )
    SELECT (SELECT id FROM versions ORDER BY revision DESC LIMIT 1) AS "activeVersionId",
      COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c."createdAt" DESC,c.id) FROM candidates c),'[]') AS candidates,
      COALESCE((SELECT jsonb_agg(to_jsonb(v)-'revision' ORDER BY v.revision DESC) FROM versions v),'[]') AS versions`,
  [scope.businessId]);
}

async function findCandidate(tx: DbExecutor, businessId: string, id: string): Promise<ShopInstructionCandidate> {
  const candidate = await tx.maybeOne<ShopInstructionCandidate>(`
    SELECT ${candidateFields} FROM shop_instruction_candidates WHERE business_id=$1 AND id=$2`, [businessId, id]);
  if (!candidate) throw new AppError('NOT_FOUND', 'Shop instruction candidate not found');
  return candidate;
}

export async function getShopInstructionCandidate(scope: AuthScope, id: string): Promise<ShopInstructionCandidate> {
  requireShopInstructionOwner(scope);
  return findCandidate(db, scope.businessId, id);
}

type Activation = { kind: 'publish' | 'rollback'; targetId: string; expectedActiveVersionId: string | null };

async function activate(scope: AuthScope, { kind, targetId, expectedActiveVersionId }: Activation): Promise<ShopInstructionVersion> {
  requireShopInstructionOwner(scope);
  return db.tx(async (tx) => {
    const { businessId, userId, accountId } = scope;
    await lockShopInstructionRevisions(tx, businessId);
    const owner = await tx.maybeOne(`
      SELECT 1 FROM memberships m JOIN businesses b ON b.id=m.business_id
      JOIN accounts a ON a.id=b.account_id JOIN users u ON u.id=m.user_id
      WHERE m.business_id=$1 AND m.user_id=$2 AND a.id=$3
        AND m.status='active' AND m.role='owner' AND b.status='active' AND a.status='active' AND u.status='active'
      FOR SHARE OF m,b,a,u`, [businessId, userId, accountId]);
    if (!owner) throw new AppError('PERMISSION_DENIED', 'An active shop owner is required');

    const active = await readLatestShopInstruction(tx, businessId);
    const candidate = kind === 'publish' ? await findCandidate(tx, businessId, targetId) : null;
    const previous = kind === 'rollback'
      ? await tx.maybeOne<ActiveShopInstruction>(`
          SELECT id,instruction FROM shop_instruction_versions WHERE business_id=$1 AND id=$2`, [businessId, targetId])
      : null;
    const target = candidate ?? previous;
    if (!target) throw new AppError('NOT_FOUND', 'Shop instruction version not found');

    const candidateId = candidate?.id ?? null;
    const restoredFrom = previous?.id ?? null;
    if (active && active.actorUserId === userId && active.parentVersionId === expectedActiveVersionId
      && active.candidateId === candidateId && active.restoredFromVersionId === restoredFrom) {
      const { revision: _revision, ...version } = active;
      return version;
    }
    if ((active?.id ?? null) !== expectedActiveVersionId || targetId === active?.id
      || (candidate && candidate.baseVersionId !== expectedActiveVersionId)) {
      throw new AppError('VERSION_CONFLICT', 'The active shop instruction changed');
    }

    const version = await tx.one<ShopInstructionVersion>(`
      INSERT INTO shop_instruction_versions
        (business_id,revision,parent_version_id,candidate_id,restored_from_version_id,instruction,actor_user_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${versionFields}`,
    [businessId, (active?.revision ?? 0) + 1, expectedActiveVersionId, candidateId, restoredFrom, target.instruction, userId]);
    await auditInTransaction(tx, [{
      action: 'business_settings.shop_instruction.' + kind,
      actorUserId: userId,
      businessId,
      accountId,
      targetType: 'shop_instruction_version',
      targetId: version.id,
      details: { parentVersionId: expectedActiveVersionId, candidateId, restoredFromVersionId: restoredFrom },
    }]);
    return version;
  });
}

export const publishShopInstruction = (scope: AuthScope, targetId: string, expectedActiveVersionId: string | null) =>
  activate(scope, { kind: 'publish', targetId, expectedActiveVersionId });

export const rollbackShopInstruction = (scope: AuthScope, targetId: string, expectedActiveVersionId: string | null) =>
  activate(scope, { kind: 'rollback', targetId, expectedActiveVersionId });
