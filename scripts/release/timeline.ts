import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

const repo = 'tanagornf/Endless-Hackathon';
const repoUrl = 'https://github.com/' + repo;
const cutoff = '2026-11-21T10:00:00+07:00';
const issue = 1;
const get = (command: string, args: string[]) => execFileSync(command, args, {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 24 * 1024 * 1024,
}).trim();
const git = (...args: string[]) => get('git', args);
const gh = (...args: string[]) => {
  try { return get('gh', args); }
  catch { throw new Error('GitHub timeline unavailable. Verify GitHub CLI access to the team repository.'); }
};

const bangkok = new Intl.DateTimeFormat('sv-SE', {
  dateStyle: 'short', timeStyle: 'medium', timeZone: 'Asia/Bangkok',
});
const time = (iso: string) => bangkok.format(new Date(iso));
const short = (sha: string) => sha.slice(0, 7);
const safeCell = (value: string) => value
  .replace(/(?:sk-|gh[pousr]_)[\w-]{10,}/gi, '[redacted]')
  .replace(/(password|secret|token|api[_ -]?key)\s*[:=]\s*\S+/gi, '$1 [redacted]')
  .replaceAll('|', '\\|').replaceAll(/\s+/g, ' ').trim();

const prSchema = z.object({
  number: z.number(), title: z.string(), headRefName: z.string(),
  author: z.object({ login: z.string() }).nullable(), mergedAt: z.string(),
  additions: z.number(), deletions: z.number(), mergeCommit: z.object({ oid: z.string() }).nullable(),
});
const boardTypes = 'DONE|FIX|STAGE|NEED|BLOCKED|LEAD:|STATUS|CHANGE|SETUP READY|DEPLOY FREEZE|TASK';
const lanePrefix = new RegExp('^\\[([A-C][0-3]|LEAD|UI)/Codex\\]\\s+((?:' + boardTypes + '))(?=\\s|$)', 'i');
function boardSummary() {
  const output = gh('api', 'repos/' + repo + '/issues/' + issue + '/comments', '--paginate',
    '--jq', '.[] | {id,created_at,body}');
  const counts: Record<string, number> = {};
  const entries: string[] = [];
  for (const line of output.split(/\r?\n/).filter(Boolean)) {
    const parsed = z.object({ id: z.number(), created_at: z.string(), body: z.string() }).safeParse(JSON.parse(line));
    if (!parsed.success || Date.parse(parsed.data.created_at) < Date.parse(cutoff)) continue;
    const { id, created_at: stamp, body } = parsed.data;
    const match = lanePrefix.exec(body);
    if (!match) continue;
    const [, lane, kind] = match.map((value) => value.toUpperCase());
    counts[kind] = (counts[kind] ?? 0) + 1;
    entries.push('| ' + [time(stamp), lane, kind, '[#' + id + '](' + repoUrl + '/issues/1#issuecomment-' + id + ')'].join(' | ') + ' |');
  }
  return { counts, entries };
}
const countsFor = <T>(values: T[], group: (value: T) => string) => values.reduce<Record<string, number>>((counts, value) => {
  const key = group(value);
  counts[key] = (counts[key] ?? 0) + 1;
  return counts;
}, {});

const count = z.number().int().nonnegative();
function report<T extends z.ZodType>(filename: string, since: number, schema: T) {
  if (!existsSync(filename) || statSync(filename).mtimeMs < since) {
    console.warn(filename + ' missing or older than the candidate. Test counts remain unreported.');
    return undefined;
  }
  const data = schema.safeParse(JSON.parse(readFileSync(filename, 'utf8')));
  if (!data.success) throw new Error('Invalid test results in ' + filename);
  return data.data;
}

function smokeFileCount() {
  let count = readdirSync('tests/e2e').filter((file) => file.endsWith('.spec.ts')).length;
  for (const slug of readdirSync('web/src/features')) {
    const dir = join('web/src/features', slug, 'e2e');
    if (existsSync(dir)) count += readdirSync(dir).filter((file) => file.endsWith('.smoke.spec.ts')).length;
  }
  return count;
}

function main() {
  const args = process.argv.slice(2);
  const options = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const [flag, value] = args.slice(index, index + 2);
    if (!['--baseline', '--final'].includes(flag) || !value || options.has(flag) || !/^[a-f0-9]{7,40}$/i.test(value)) {
      throw new Error('Usage: npm run release:timeline -- [--baseline SHA] [--final SHA]');
    }
    options.set(flag, value);
  }
  const base = options.get('--baseline') ?? git('log', 'origin/main', '--before=' + cutoff, '-1', '--format=%H');
  if (!base) throw new Error('No pre-event baseline was found. Pass --baseline SHA.');
  const baseline = git('rev-parse', base + '^{commit}');
  const final = git('rev-parse', (options.get('--final') ?? 'origin/main') + '^{commit}');
  git('merge-base', '--is-ancestor', baseline, final);
  const candidateCommits = new Set(git('rev-list', baseline + '..' + final).split(/\r?\n/).filter(Boolean));
  const finalTimestamp = Number(git('show', '-s', '--format=%ct', final)) * 1000;
  const delta = git('diff', '--numstat', baseline, final).split(/\r?\n/).filter(Boolean);
  const files = delta.length;
  const [insertions, deletions] = delta.reduce(([added, removed], line) => {
    const [add, del] = line.split('\t', 2);
    return [added + (Number(add) || 0), removed + (Number(del) || 0)];
  }, [0, 0]);
  const merged = z.array(prSchema).parse(JSON.parse(gh('pr', 'list', '--repo', repo, '--state', 'merged',
    '--base', 'main', '--limit', '500', '--json', 'number,title,headRefName,author,mergedAt,additions,deletions,mergeCommit')))
    .filter((pr) => Date.parse(pr.mergedAt) >= Date.parse(cutoff) && pr.mergeCommit &&
      candidateCommits.has(pr.mergeCommit.oid))
    .sort((left, right) => left.mergedAt.localeCompare(right.mergedAt));
  const unit = report('docs/evidence/vitest.json', finalTimestamp, z.object({
    numTotalTests: count, numPassedTests: count, numFailedTests: count, numTotalTestSuites: count,
  }));
  const e2e = report('docs/evidence/e2e.json', finalTimestamp, z.object({ stats: z.object({
    expected: count, unexpected: count, flaky: count, skipped: count,
  }) }))?.stats;
  const board = boardSummary();
  const laneOf = (branch: string) => /^lane\/([A-C][1-3])\//.exec(branch)?.[1] ?? /^fix\/([A-C][1-3])\//.exec(branch)?.[1] ?? 'other';
  const fixes = merged.filter((pr) => pr.headRefName.startsWith('fix/'));
  const human = merged.filter((pr) => /(?:fix|revert|hotfix)/i.test(pr.title + ' ' + pr.headRefName));
  const byLane = countsFor(merged.filter((pr) => !pr.headRefName.startsWith('fix/')), (pr) => laneOf(pr.headRefName));
  const numbers = {
    BASELINE_SHA: baseline, FINAL_SHA: final, COMMITS: candidateCommits.size,
    AUTHORS: git('shortlog', '-sn', baseline + '..' + final).split(/\r?\n/).filter(Boolean).length,
    FILES_CHANGED: files, LINES_ADDED: insertions, LINES_DELETED: deletions,
    PR_COUNT: merged.length, FIX_PR_COUNT: fixes.length, FIX_PR_LANES: countsFor(fixes, (pr) => laneOf(pr.headRefName)),
    REVERT_PR_COUNT: merged.filter((pr) => /revert/i.test(pr.headRefName + ' ' + pr.title)).length,
    LANE_PR_TABLE: byLane, HOURLY_PR_COUNTS: countsFor(merged, (pr) => time(pr.mergedAt).slice(11, 13) + ':00'),
    FIRST_MERGE_AT: merged[0] ? time(merged[0].mergedAt) : null, LAST_MERGE_AT: merged.at(-1) ? time(merged.at(-1)!.mergedAt) : null,
    TESTS_TOTAL: unit?.numTotalTests ?? null, TESTS_PASSED: unit?.numPassedTests ?? null, TESTS_FAILED: unit?.numFailedTests ?? null,
    TEST_FILES: unit?.numTotalTestSuites ?? null, SMOKE_FILES: smokeFileCount(), E2E_PASSED: e2e?.expected ?? null,
    E2E_SKIPPED: e2e?.skipped ?? null, E2E_FAILED: e2e ? e2e.unexpected + e2e.flaky : null, BOARD_COUNTS: board.counts,
  };
  const rows = merged.map((pr) => '| ' + [
    time(pr.mergedAt), '[#' + pr.number + '](' + repoUrl + '/pull/' + pr.number + ')', safeCell(pr.title),
    safeCell(pr.headRefName), safeCell(pr.author?.login ?? 'unknown'), '+' + pr.additions + ' / −' + pr.deletions, short(pr.mergeCommit!.oid),
  ].join(' | ') + ' |');
  const path = 'docs/evidence/codex-timeline.md';
  const old = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const humanNotes = /<!-- human-notes -->\s*([\s\S]*?)<!-- end-human-notes -->/.exec(old)?.[1].trim() ?? '';
  const markdown = [
    '# Codex development timeline', '',
    'All times are Asia/Bangkok. Baseline ' + baseline + ', candidate ' + final + '.', '',
    numbers.PR_COUNT + ' merged pull requests, ' + numbers.COMMITS + ' commits and ' + files + ' changed files. ' +
      insertions + ' lines added and ' + deletions + ' removed.', '',
    '| Time | PR | Title | Branch | GitHub author | Diff | SHA |', '|---|---|---|---|---|---|---|', ...rows, '',
    '## Orchestrator fixes', '', ...fixes.map((pr) => '- [#' + pr.number + '](' + repoUrl + '/pull/' + pr.number + ') ' + safeCell(pr.title)), '',
    '## Human corrections', '', ...human.map((pr) => '- [#' + pr.number + '](' + repoUrl + '/pull/' + pr.number + ') ' + safeCell(pr.title)),
    '', '<!-- human-notes -->', humanNotes, '<!-- end-human-notes -->', '', '## Board events', '',
    '| Time | Lane | Event | Board link |', '|---|---|---|---|', ...board.entries, '',
  ].join('\n');
  mkdirSync('docs/evidence', { recursive: true });
  writeFileSync(path, markdown);
  writeFileSync('docs/evidence/numbers.json', JSON.stringify(numbers, null, 2) + '\n');
  console.log(JSON.stringify({ candidate: final, merged: merged.length, commits: numbers.COMMITS, board: board.entries.length }));
}

if (import.meta.main) {
  try { main(); }
  catch (error) {
    console.error(error instanceof Error ? error.message : 'Timeline could not be generated');
    process.exitCode = 1;
  }
}
