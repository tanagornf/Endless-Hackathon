import { expect, test } from 'vitest';
import { checkBranch, ownerOfPath } from './check-paths';

test.each([
  ['server/src/features/catalog/service.ts', 'B1'], ['server/src/features/knowledge-import/routes.ts', 'B3'],
  ['web/src/features/inbox/pages.tsx', 'A1'], ['web/src/features/auth/pages.tsx', 'C3'],
  ['shared/features/comments/types.ts', 'C2'], ['server/src/features/evals/run.ts', 'B1'],
  ['web/src/features/chatgpt-catalog/pages.tsx', 'C1'], ['package-lock.json', 'C1'],
])('%s is owned by %s', (path, owner) => expect(ownerOfPath(path)).toBe(owner));

test('only the one-time C1 setup branch can create another lane’s scaffolds', () => {
  const files = ['server/src/features/inbox/service.ts'];
  expect(checkBranch({ branch: 'lane/C1/core', files, bootstrap: true }).ok).toBe(true);
  expect(checkBranch({ branch: 'lane/C1/core', files }).ok).toBe(false);
  expect(checkBranch({ branch: 'lane/B1/catalog', files }).ok).toBe(false);
  expect(checkBranch({ branch: 'lane/A0/catalog', files }).ok).toBe(false);
});

test('rejects cross-lane or protected files and requires a bounded fix with a test', () => {
  const branch = 'fix/B1/stale-price';
  const path = 'server/src/features/catalog/service.ts';
  const files = [path, 'server/src/features/catalog/service.test.ts'];
  const size = (added: number) => [{ path, added, removed: 1 }];
  expect(checkBranch({ branch, files, numstat: size(39) }).ok).toBe(true);
  expect(checkBranch({ branch, files, numstat: size(40) }).ok).toBe(false);
  expect(checkBranch({ branch, files: [path] }).ok).toBe(false);
  expect(checkBranch({ branch, files: [...files, 'server/src/features/catalog/migrations/002_x.sql'] }).ok).toBe(false);
  expect(checkBranch({ branch, files: [...files, 'web/src/features/inbox/x'] }).ok).toBe(false);
  expect(checkBranch({ branch: 'fix/C1/contract', files: ['contracts.ts', 'scripts/check-paths.test.ts'] }).ok).toBe(false);
});
