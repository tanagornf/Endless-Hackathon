import { expect, test } from 'vitest';
import { planMigrations } from './migrate';
import type { FeatureMigration } from './types';

const file = (owner: FeatureMigration['owner'], seq: number, dependsOn: FeatureMigration['dependsOn'] = []): FeatureMigration => ({
  id: owner + '/' + seq, name: seq + '.sql', owner, seq, dependsOn, sql: '', checksum: '',
});
test('orders owners topologically and orders files within each owner by sequence', () => {
  const core = file('core', 1);
  const catalog = file('catalog', 1);
  const orders = file('orders', 1, ['catalog']);
  const next = file('orders', 2);
  expect(planMigrations([next, orders, core, catalog])).toEqual([core, catalog, orders, next]);
});
test('reports cycles naming their owners', () => {
  expect(() => planMigrations([file('inbox', 1, ['team']), file('team', 1, ['inbox'])])).toThrow(/inbox.*team.*inbox/);
});
