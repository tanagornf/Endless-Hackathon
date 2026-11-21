import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { FEATURES, FIX_BRANCH_PATTERN, LANE_BRANCH_PATTERN, LEAD_BRANCH_PATTERN } from '@nless/shared/core/features';
import type { Lane } from '@nless/shared/core/features';

interface Stat { path: string; added: number; removed: number }
interface Input {
  branch: string;
  files: string[];
  numstat?: Stat[];
  bootstrap?: boolean;
}
export function ownerOfPath(path: string): Lane | null {
  const match = /^(?:server\/src\/features|web\/src\/features|shared\/features)\/([^/]+)\//.exec(path.replaceAll('\\', '/'));
  if (!match) return 'C1';
  return FEATURES.find((feature) => feature.folder && feature.slug === match[1])?.lane ?? null;
}
const isTest = (path: string) => path.startsWith('tests/') || /\.(?:test\.tsx?|spec\.ts)$/.test(path);
const immutable = (path: string) => path === 'contracts.ts' || path === 'docs/competition-plan/templates/contracts.ts';
const setupFile = /^(?:server\/src\/features\/[^/]+\/(?:routes\.ts|service\.ts|setup\.ts|run\.ts|EVIDENCE\.md|migrations\/\.gitkeep)|web\/src\/features\/[^/]+\/(?:pages\.tsx|Placeholder\.tsx|i18n\/(?:th|en)\.json)|shared\/features\/[^/]+\/types\.ts)$/;

export function checkBranch({ branch, files, numstat = [], bootstrap = false }: Input) {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (branch === 'main') return { ok: true, errors, warnings };
  if (LEAD_BRANCH_PATTERN.test(branch)) return { ok: true, errors, warnings: ['Lead branch requires a human reviewer'] };
  const lane = LANE_BRANCH_PATTERN.exec(branch)?.[1] as Lane | undefined;
  const fix = FIX_BRANCH_PATTERN.exec(branch)?.[1] as Lane | undefined;
  const owner = lane ?? fix;
  if (!owner) return { ok: false, errors: ['Use lane/<LANE>/<slug> or fix/<OWNER>/<slug>'], warnings };
  const setup = branch === 'lane/C1/core' && bootstrap;
  for (const path of files) {
    const belongs = ownerOfPath(path);
    if (belongs !== owner && !(setup && belongs && setupFile.test(path))) errors.push(path + ' belongs to ' + (belongs ?? 'no registered lane'));
  }
  if (setup) warnings.push('One-time C1 scaffold ownership verified');
  if (fix) {
    if (!files.some(isTest)) errors.push('Fix branch requires a test change');
    if (files.some((path) => immutable(path) || /\/migrations\//.test(path))) errors.push('Fix branch may not change migrations or contracts');
    const size = numstat.filter(({ path }) => !isTest(path)).reduce((total, row) => total + row.added + row.removed, 0);
    if (size > 40) errors.push('Fix branch changes ' + size + ' non-test lines (maximum 40)');
  }
  return { ok: !errors.length, errors, warnings };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  function option(flag: string): string | undefined {
    const index = args.indexOf(flag);
    return index < 0 ? undefined : args[index + 1];
  }
  const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' });
  try {
    const base = option('--base') ?? 'origin/main';
    const branch = option('--branch') ?? process.env.GITHUB_HEAD_REF ?? git('branch', '--show-current').trim();
    if (!base || base.startsWith('-')) throw Error('Invalid base ref');
    const comparison = base + '...HEAD';
    const files = git('diff', '--name-only', '--no-renames', '-z', comparison, '--').split('\0').filter(Boolean);
    const numstat = git('diff', '--numstat', '--no-renames', '-z', comparison, '--').split('\0').filter(Boolean).map((row) => {
      const first = row.indexOf('\t');
      const second = row.indexOf('\t', first + 1);
      const parse = (value: string) => value === '-' ? Infinity : Number(value);
      return { added: parse(row.slice(0, first)), removed: parse(row.slice(first + 1, second)), path: row.slice(second + 1) };
    });
    const bootstrap = !git('ls-tree', base, '--', 'server/src/features').trim();
    const result = checkBranch({ branch, files, numstat, bootstrap });
    if (FIX_BRANCH_PATTERN.test(branch)) {
      try {
        if (!/^[ABC]0$/.test(readFileSync('.lane', 'utf8').trim())) console.warn('Fix branches are intended for orchestrator worktrees');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    for (const warning of result.warnings) console.warn(warning);
    for (const error of result.errors) console.error(error);
    if (!result.ok) process.exitCode = 1;
    else console.log('Ownership check passed for ' + branch);
  } catch {
    console.error('Ownership check could not inspect the requested Git references');
    process.exitCode = 1;
  }
}
