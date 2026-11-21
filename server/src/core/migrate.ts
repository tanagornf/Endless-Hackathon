import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { FEATURES } from '@nless/shared/core/features';
import type { MigrationOwner } from '@nless/shared/core/features';
import { rootDir } from './config';
import { db } from './db';
import { log } from './log';
import type { FeatureMigration } from './types';

const featureOwners = FEATURES.filter((feature) => feature.folder).map((feature) => feature.slug);
const owners: readonly MigrationOwner[] = ['core', ...featureOwners];

export function orderOwners(entries: ReadonlyMap<MigrationOwner, ReadonlySet<MigrationOwner>>): MigrationOwner[] {
  const done = new Set<MigrationOwner>();
  const visiting = new Set<MigrationOwner>();
  function visit(owner: MigrationOwner) {
    if (done.has(owner)) return;
    if (visiting.has(owner)) throw new Error('Dependency cycle: ' + [...visiting, owner].join(' → '));
    if (!owners.includes(owner)) throw new Error('Unknown migration dependency: ' + owner);
    visiting.add(owner);
    const dependencies = [...(entries.get(owner) ?? [])];
    if (owner !== 'core') dependencies.push('core');
    for (const dependency of dependencies.sort()) visit(dependency);
    visiting.delete(owner);
    done.add(owner);
  }
  for (const owner of [...entries.keys()].sort()) visit(owner);
  return [...done];
}

export function planMigrations(files: FeatureMigration[]): FeatureMigration[] {
  const groups = new Map<MigrationOwner, FeatureMigration[]>();
  const dependencies = new Map<MigrationOwner, Set<MigrationOwner>>();
  for (const file of files) {
    groups.set(file.owner, [...(groups.get(file.owner) ?? []), file]);
    dependencies.set(file.owner, new Set([...(dependencies.get(file.owner) ?? []), ...file.dependsOn]));
  }
  return orderOwners(dependencies).flatMap((owner) => (groups.get(owner) ?? [])
    .sort((left, right) => left.seq - right.seq || left.name.localeCompare(right.name)));
}

export async function readMigrations(): Promise<FeatureMigration[]> {
  const files: FeatureMigration[] = [];
  for (const owner of owners) {
    const location = join(rootDir, 'server', 'src', ...(owner === 'core' ? ['core'] : ['features', owner]), 'migrations');
    const names = await readdir(location).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
      return [];
    });
    for (const name of names.filter((name) => name.endsWith('.sql'))) {
      const match = /^(\d{3})_[a-z\d_]+\.sql$/.exec(name);
      if (!match) throw new Error('Invalid migration file name: ' + owner + '/' + name);
      const sql = (await readFile(join(location, name), 'utf8')).replace(/\r\n/g, '\n');
      const header = /^-- dependsOn:[ \t]*(.*)$/m.exec(sql);
      if (!header || header.index !== 0) throw new Error('Migration requires first-line dependsOn: ' + owner + '/' + name);
      const dependsOn = header[1].split(',').map((slug) => slug.trim()).filter(Boolean) as MigrationOwner[];
      files.push({ id: owner + '/' + name, owner, seq: Number(match[1]), name, sql, dependsOn, checksum: createHash('sha256').update(sql).digest('hex') });
    }
  }
  return planMigrations(files);
}

type AppliedMigration = { id: string; checksum: string };
async function appliedMigrations() {
  const { rows } = await db.query<AppliedMigration>('SELECT id, checksum FROM schema_migrations ORDER BY applied_at, id');
  return rows;
}

export async function migrationStatus() {
  const files = await readMigrations();
  const table = await db.one<{ exists: boolean }>("SELECT to_regclass('public.schema_migrations') IS NOT NULL AS exists");
  const applied = table.exists ? await appliedMigrations() : [];
  return {
    schema: applied.at(-1)?.id ?? null,
    pending: files.filter((file) => !applied.some((record) => record.id === file.id && record.checksum === file.checksum)).length,
  };
}

export async function migrate(): Promise<number> {
  const files = await readMigrations();
  for (const file of files) {
    for (const dependency of file.dependsOn) {
      if (!files.some((candidate) => candidate.owner === dependency)) log.warn({ migration: file.id, dependency }, 'Dependency has no migrations');
    }
  }
  return db.withAdvisoryLock('nless.migrate', async () => {
    await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (id text PRIMARY KEY, owner text NOT NULL, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    const applied = new Map((await appliedMigrations()).map((record) => [record.id, record.checksum]));
    let count = 0;
    for (const file of files) {
      if (applied.has(file.id)) {
        if (applied.get(file.id) !== file.checksum) throw new Error('Applied migration changed: ' + file.id);
        continue;
      }
      await db.tx(async (tx) => {
        await tx.query(file.sql);
        await tx.query('INSERT INTO schema_migrations (id,owner,checksum) VALUES ($1,$2,$3)', [file.id, file.owner, file.checksum]);
      });
      count++;
      log.info({ migration: file.id }, 'Migration applied');
    }
    return count;
  });
}
