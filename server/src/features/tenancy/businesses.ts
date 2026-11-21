import { SEED } from '@nless/shared/core/fixtures';
import type { MyBusinessRow, ProvisionedAccount } from '@nless/shared/features/tenancy/types';
import { AppError, audit, db, log } from '../../core';
import type { DbExecutor } from '../../core';
import { ensureBusinessSettings } from '../business-settings/service';
import { CreateBusinessBody } from './business-input';
import type { BusinessInput } from './business-input';

type AccountRow = { id: string; status: 'active' | 'suspended' | 'disabled' };
type ValidBusinessInput = ReturnType<typeof CreateBusinessBody.parse>;
const seedBusinesses = new Set(SEED.businesses.map(({ id }) => id));

function blocked(reason: string): never {
  throw new AppError('POLICY_BLOCKED', 'Business action is not allowed', { details: { reason } });
}

function inactive(): never {
  throw new AppError('BUSINESS_INACTIVE', 'Business or account is inactive');
}

async function lockTenancy(tx: DbExecutor, key: string): Promise<void> {
  await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [key]);
}

function readOwnedAccount(tx: DbExecutor, userId: string): Promise<AccountRow | null> {
  return tx.maybeOne<AccountRow>(
    'SELECT id,status FROM accounts WHERE owner_user_id=$1 ORDER BY created_at,id LIMIT 1 FOR UPDATE',
    [userId],
  );
}

async function insertBusiness(tx: DbExecutor, accountId: string, userId: string, input: ValidBusinessInput): Promise<MyBusinessRow> {
  const { name, timezone, language } = input;
  const shop = await tx.one<{ id: string }>(
    'INSERT INTO businesses(account_id,name,timezone,language) VALUES($1,$2,$3,$4) RETURNING id',
    [accountId, name, timezone, language],
  );
  await tx.query("INSERT INTO memberships(business_id,user_id,role,permissions) VALUES($1,$2,'owner','{}')", [shop.id, userId]);
  return { businessId: shop.id, name, status: 'active', role: 'owner', isCurrentAccount: true };
}

async function ensureDefaults(businessId: string): Promise<void> {
  try {
    await ensureBusinessSettings(businessId);
  } catch {
    log.warn({ businessId }, 'Business settings initialization did not complete');
  }
}

async function auditBusiness(action: 'create' | 'delete', userId: string, accountId: string, businessId: string): Promise<void> {
  try {
    await audit({ action: 'tenancy.business.' + action, actorUserId: userId, accountId, businessId, targetType: 'business', targetId: businessId });
  } catch {
    log.error({ businessId, accountId, action }, 'Business audit did not complete');
  }
}

export async function listMyBusinesses(userId: string): Promise<{ items: MyBusinessRow[] }> {
  const { rows } = await db.query<MyBusinessRow>(
    'SELECT b.id AS "businessId",b.name,b.status,m.role,(a.owner_user_id=$1) AS "isCurrentAccount" ' +
    'FROM memberships m JOIN businesses b ON b.id=m.business_id JOIN accounts a ON a.id=b.account_id ' +
    "WHERE m.user_id=$1 AND m.status='active' AND b.status<>'deleted' ORDER BY lower(b.name),b.id",
    [userId],
  );
  return { items: rows };
}

export async function createBusiness(userId: string, input: BusinessInput): Promise<MyBusinessRow> {
  const valid = CreateBusinessBody.parse(input);
  const { accountId, business } = await db.tx(async (tx) => {
    await lockTenancy(tx, 'tenancy-user:' + userId);
    const account = await readOwnedAccount(tx, userId);
    if (!account) {
      const member = await tx.maybeOne(
        "SELECT 1 FROM memberships WHERE user_id=$1 AND status='active' LIMIT 1", [userId],
      );
      if (member) throw new AppError('PERMISSION_DENIED', 'Account owner required');
      blocked('no_account');
    }
    if (account.status !== 'active') inactive();
    return { accountId: account.id, business: await insertBusiness(tx, account.id, userId, valid) };
  });
  await ensureDefaults(business.businessId);
  await auditBusiness('create', userId, accountId, business.businessId);
  return business;
}

export async function deleteBusiness(businessId: string, userId: string, confirmName: string): Promise<void> {
  const accountId = await db.tx(async (tx) => {
    await lockTenancy(tx, 'tenancy:' + businessId);
    const shop = await tx.maybeOne<{
      account_id: string; name: string; status: string; account_status: string; role: string;
    }>(
      'SELECT b.account_id,b.name,b.status,a.status AS account_status,m.role ' +
      'FROM businesses b JOIN accounts a ON a.id=b.account_id JOIN memberships m ON m.business_id=b.id ' +
      "WHERE b.id=$1 AND m.user_id=$2 AND m.status='active' FOR NO KEY UPDATE OF a,b",
      [businessId, userId],
    );
    if (!shop) throw new AppError('NOT_FOUND', 'Business not found');
    if (shop.status !== 'active' || shop.account_status !== 'active') inactive();
    if (shop.role !== 'owner') throw new AppError('PERMISSION_DENIED', 'Permission required');
    if (shop.name !== confirmName) {
      throw new AppError('VALIDATION_ERROR', 'Business name does not match', {
        details: { issues: [{ path: 'confirmName', code: 'confirm_name_mismatch' }] },
      });
    }
    const alias = await tx.maybeOne("SELECT 1 FROM seed_aliases WHERE id=$1 AND kind IN ('business','businesses') LIMIT 1", [businessId]);
    if (seedBusinesses.has(businessId) || alias) blocked('seed_business');

    // The account row lock orders independent deletions in the same account.
    const remaining = await tx.maybeOne(
      "SELECT 1 FROM businesses WHERE account_id=$1 AND id<>$2 AND status='active' LIMIT 1", [shop.account_id, businessId],
    );
    if (!remaining) blocked('last_business');
    await tx.query(
      "UPDATE businesses SET status='deleted',version=version+1,updated_at=now() WHERE id=$1 AND account_id=$2",
      [businessId, shop.account_id],
    );
    return shop.account_id;
  });
  await auditBusiness('delete', userId, accountId, businessId);
}

export async function provisionAccountForUser(
  userId: string,
  input: { businessName: string; timezone?: string; language?: 'th' | 'en' },
  ex?: DbExecutor,
): Promise<ProvisionedAccount> {
  const valid = CreateBusinessBody.parse({ name: input.businessName, timezone: input.timezone, language: input.language });
  const provision = async (tx: DbExecutor): Promise<ProvisionedAccount> => {
    await lockTenancy(tx, 'tenancy-user:' + userId);
    const existing = await readOwnedAccount(tx, userId);
    if (existing) {
      if (existing.status !== 'active') inactive();
      const first = await tx.maybeOne<{ id: string }>(
        "SELECT id FROM businesses WHERE account_id=$1 AND status='active' ORDER BY created_at,id LIMIT 1", [existing.id],
      );
      if (!first) inactive();
      return { accountId: existing.id, businessId: first.id, created: false };
    }
    if (await tx.maybeOne('SELECT 1 FROM memberships WHERE user_id=$1 LIMIT 1', [userId])) blocked('already_member');

    const account = await tx.one<{ id: string }>(
      'INSERT INTO accounts(name,owner_user_id) VALUES($1,$2) RETURNING id', [valid.name, userId],
    );
    const business = await insertBusiness(tx, account.id, userId, valid);
    return { accountId: account.id, businessId: business.businessId, created: true };
  };
  if (ex) return provision(ex); // F02 initializes settings after its caller-owned signup transaction commits.
  const result = await db.tx(provision);
  await ensureDefaults(result.businessId);
  if (result.created) await auditBusiness('create', userId, result.accountId, result.businessId);
  return result;
}
