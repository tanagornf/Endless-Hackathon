import { createHash, randomBytes } from 'node:crypto';
import { config, log } from '../../core';
import type { FeatureSeed, SeedContext } from '../../core';

export default {
  featureId: 'F03',
  dependsOn: ['core'],
  async run(ctx) {
    for (const fixture of ctx.fixtures.memberships) {
      const membership = await ctx.db.maybeOne<{ role: string; status: string; permissions: string[] }>(
        'SELECT role,status,permissions FROM memberships WHERE business_id=$1 AND user_id=$2',
        [ctx.id(fixture.businessAlias), ctx.id(fixture.userAlias)],
      );
      if (!membership || membership.role !== fixture.role || membership.status !== 'active' ||
          JSON.stringify([...membership.permissions].sort()) !== JSON.stringify([...fixture.permissions].sort())) {
        log.warn({ businessAlias: fixture.businessAlias, userAlias: fixture.userAlias }, 'Tenancy seed membership differs from fixture');
      }
    }
  },
} satisfies FeatureSeed;

export async function runDemo(ctx: SeedContext): Promise<void> {
  const tokenHash = createHash('sha256').update(randomBytes(32).toString('base64url')).digest('hex');
  await ctx.db.query(
    'INSERT INTO invitations(business_id,email,permissions,token_hash,invited_by,expires_at) ' +
    "VALUES($1,$2,$3,$4,$5,now()+$6::integer*interval '1 hour') " +
    "ON CONFLICT (business_id,email_normalized) WHERE status='pending' DO NOTHING",
    [ctx.id('biz_demo_a'), 'new.staff.a@example.test', ctx.fixtures.memberships.find(
      (membership) => membership.businessAlias === 'biz_demo_a' && membership.role === 'staff',
    )?.permissions ?? [], tokenHash, ctx.id('owner_a'), config.INVITATION_TTL_HOURS],
  );
}

export async function resetDemo(ctx: SeedContext): Promise<void> {
  const shops = ctx.fixtures.businesses.map(({ id }) => id);
  const accounts = ctx.fixtures.accounts.map(({ id }) => id);
  await ctx.db.tx(async (tx) => {
    await tx.query('DELETE FROM invitations WHERE business_id=ANY($1::uuid[])', [shops]);
    for (const shop of ctx.fixtures.businesses) {
      const members = ctx.fixtures.memberships.filter(({ businessAlias }) => businessAlias === shop.alias);
      await tx.query('DELETE FROM memberships WHERE business_id=$1 AND NOT(user_id=ANY($2::uuid[]))',
        [shop.id, members.map(({ userAlias }) => ctx.id(userAlias))]);
      for (const member of members) {
        await tx.query(
          'INSERT INTO memberships(business_id,user_id,role,permissions) VALUES($1,$2,$3,$4) ' +
          "ON CONFLICT(business_id,user_id) DO UPDATE SET role=EXCLUDED.role,permissions=EXCLUDED.permissions,status='active',updated_at=now()",
          [shop.id, ctx.id(member.userAlias), member.role, member.permissions],
        );
      }
    }
    await tx.query(
      "DELETE FROM businesses WHERE account_id=ANY($1::uuid[]) AND NOT(id=ANY($2::uuid[])) AND (name LIKE 'e2e-%' OR status='deleted')",
      [accounts, shops],
    );
  });
}
