import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { FEATURES } from '@nless/shared/core/features';
import type { MigrationOwner } from '@nless/shared/core/features';
import { SEED } from '@nless/shared/core/fixtures';
import { rootDir } from './config';
import { db } from './db';
import { log } from './log';
import { orderOwners } from './migrate';
import type { FeatureSeed, SeedContext } from './types';

const fixtures = [SEED.users, SEED.accounts, SEED.businesses, SEED.customers, SEED.conversations, SEED.catalog, SEED.knowledgeFolders, SEED.knowledge, SEED.templates, SEED.tags, SEED.resources];
const aliases = new Map(fixtures.flatMap((group) => group.map(({ alias, id }) => [alias, id] as const)));
export function seedId(alias: string): string {
  const id = aliases.get(alias);
  if (!id) throw new Error('Unknown seed alias: ' + alias);
  return id;
}

type SeedModule = { default: FeatureSeed; runDemo?(ctx: SeedContext): Promise<void>; resetDemo?(ctx: SeedContext): Promise<void> };
export async function featureSeeds(): Promise<SeedModule[]> {
  const seeds = new Map<MigrationOwner, SeedModule>();
  const dependencies = new Map<MigrationOwner, Set<MigrationOwner>>();
  for (const feature of FEATURES) {
    if (!feature.folder) continue;
    const location = join(rootDir, 'server', 'src', 'features', feature.slug, 'seed.ts');
    if (!existsSync(location)) continue;
    const module = await import(pathToFileURL(location).href) as SeedModule;
    if (module.default.featureId !== feature.id) throw new Error('Unexpected feature id in seed for ' + feature.slug);
    seeds.set(feature.slug, module);
    dependencies.set(feature.slug, new Set(module.default.dependsOn));
  }
  return orderOwners(dependencies).flatMap((owner) => seeds.get(owner) ?? []);
}

export const seedContext: SeedContext = { db, fixtures: SEED, id: seedId, log: (message) => log.info(message) };
export async function seed(): Promise<void> {
  await db.tx(async (tx) => {
    for (const row of SEED.users) {
      await tx.query('INSERT INTO users (id,email,display_name,is_platform_admin) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING', [row.id, row.email, row.displayName, row.isPlatformAdmin]);
    }
    for (const row of SEED.accounts) {
      await tx.query('INSERT INTO accounts (id,name,owner_user_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [row.id, row.name, seedId(row.ownerAlias)]);
    }
    for (const row of SEED.businesses) {
      await tx.query('INSERT INTO businesses (id,account_id,name,timezone,language) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING', [row.id, seedId(row.accountAlias), row.name, row.timezone, row.language]);
    }
    for (const row of SEED.memberships) {
      await tx.query('INSERT INTO memberships (business_id,user_id,role,permissions) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING', [seedId(row.businessAlias), seedId(row.userAlias), row.role, row.permissions]);
    }
    for (const row of SEED.customers) {
      await tx.query('INSERT INTO customers (id,business_id,channel,external_id,display_name) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING', [row.id, seedId(row.businessAlias), row.channel, row.externalId, row.displayName]);
    }
    for (const row of SEED.conversations) {
      const businessId = seedId(row.businessAlias);
      const conversation = await tx.query(`INSERT INTO conversations
        (id,business_id,customer_id,channel,handler,assignee_user_id,next_seq,last_message_at,last_message_preview,last_inbound_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,now(),$8,now()) ON CONFLICT (id) DO NOTHING`, [
        row.id, businessId, seedId(row.customerAlias), row.channel, row.handler,
        row.assigneeAlias ? seedId(row.assigneeAlias) : null, row.messages.length + 1, row.messages.at(-1)?.text ?? '',
      ]);
      if (!conversation.rowCount) continue;
      for (const [index, message] of row.messages.entries()) {
        await tx.query(`INSERT INTO messages (business_id,conversation_id,seq,direction,author,author_user_id,parts,text,channel,origin)
          VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,'system') ON CONFLICT DO NOTHING`, [
          businessId, row.id, index + 1, message.author === 'customer' ? 'inbound' : 'outbound',
          message.author, message.authorAlias ? seedId(message.authorAlias) : null,
          JSON.stringify([{ type: 'text', text: message.text }]), message.text, row.channel,
        ]);
      }
    }
    for (const [kind, group] of Object.entries({
      users: SEED.users, accounts: SEED.accounts, businesses: SEED.businesses, customers: SEED.customers, conversations: SEED.conversations,
    })) {
      for (const { alias, id } of group) {
        await tx.query('INSERT INTO seed_aliases (alias,id,kind) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [alias, id, kind]);
      }
    }
  });
  for (const feature of await featureSeeds()) await feature.default.run(seedContext);
}
