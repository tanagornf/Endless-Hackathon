import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FEATURES } from '@nless/shared/core/features';
import { parseCsv, parseEvidence, resolveStatus, toCsv } from './evidence-parse';

interface Flag { id: string; visible: boolean; placeholder: boolean }
function readFlags(path?: string) {
  if (!path) return null;
  const body = JSON.parse(readFileSync(path, 'utf8'));
  const list = Array.isArray(body) ? body : body.data;
  if (!Array.isArray(list)) throw new Error('Expected a scoped feature list JSON file');
  const flags = new Map<string, Flag>();
  for (const row of list) {
    const id = row?.id ?? row?.featureId;
    const visible = row?.visible ?? (typeof row?.hidden === 'boolean' ? !row.hidden : undefined);
    if (typeof id !== 'string' || typeof visible !== 'boolean' || typeof row?.placeholder !== 'boolean' || flags.has(id)) {
      throw new Error('Invalid or duplicate feature flag row');
    }
    flags.set(id, { id, visible, placeholder: row.placeholder });
  }
  return flags;
}
const filenames = {
  template: 'docs/competition-plan/templates/FEATURE_STATUS.csv',
  csv: 'docs/FEATURE_STATUS.csv',
  report: 'server/src/features/release/data/release-status.json',
  summary: 'docs/evidence/feature-status.md',
};

function appliedCommit(sha: string) {
  try {
    execFileSync('git', ['cat-file', '-e', sha + '^{commit}'], { stdio: 'ignore' });
    execFileSync('git', ['merge-base', '--is-ancestor', sha, 'origin/main'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function buildStatus(flagsPath?: string) {
  const [columns, ...data] = parseCsv(readFileSync(existsSync(filenames.csv) ? filenames.csv : filenames.template, 'utf8'));
  if (!columns?.includes('feature_id') || !columns.includes('actual_mode') || !columns.includes('blocker')) {
    throw new Error('Feature CSV is missing required columns');
  }
  const template = data.map((cells) => {
    if (cells.length !== columns.length) throw new Error('Feature CSV row width differs from the header');
    return Object.fromEntries(columns.map((column, index) => [column, cells[index]]));
  });
  const registry = new Map<string, (typeof FEATURES)[number]>(FEATURES.map((feature) => [feature.id, feature]));
  if (template.length !== 31 || registry.size !== 31 || new Set(template.map((row) => row.feature_id)).size !== 31) {
    throw new Error('Expected 31 distinct in-scope feature rows');
  }
  const flags = readFlags(flagsPath);
  const conflicts: string[] = [];
  const warnings: string[] = [];
  const counts = { R: 0, S: 0, A: 0, U: 0 };
  const rows = template.map((base): Record<string, string> => {
    const feature = registry.get(base.feature_id);
    if (!feature || feature.lane !== base.lane || feature.slug !== base.slug) {
      throw new Error('Feature metadata differs from registry for ' + base.feature_id);
    }
    const path = base.feature_id === 'F01' || base.feature_id === 'F35' ? 'server/src/core/EVIDENCE.md'
      : 'server/src/features/' + base.slug + '/EVIDENCE.md';
    const evidence = existsSync(path) ? parseEvidence(readFileSync(path, 'utf8'), base.feature_id, base.slug) : null;
    const row = resolveStatus(base, evidence, appliedCommit);
    if (feature.id === 'F18' || feature.id === 'F21') {
      Object.assign(row, { status: 'UNIMPLEMENTED', actual_mode: 'U', commit_sha: '', tests_evidence: '', trace_evidence: '',
        provider_evidence: '', checked_at_bangkok: '', blocker: 'Deferred by the LINE-only release scope' });
    }
    const flag = flags?.get(feature.id);
    if (flags && feature.folder && !flag) conflicts.push(feature.id + ' missing from the scoped feature flag snapshot');
    if (flag?.visible && flag.placeholder) conflicts.push(feature.id + ' exposes a placeholder');
    if (flag && row.actual_mode === 'R' && (!flag.visible || flag.placeholder)) conflicts.push(feature.id + ' is R but hidden or placeholder');
    if (flag?.visible && feature.webPaths.length && row.actual_mode !== 'R') warnings.push(feature.id + ' is visible below R');
    counts[row.actual_mode as keyof typeof counts]++;
    return { ...row, tier: feature.tier, declared_mode: evidence?.primary.actual_mode ?? 'U', evidence_path: path,
      menu: !feature.folder ? 'not_applicable' : !flag ? 'unverified' : flag.placeholder ? 'placeholder' : flag.visible ? 'visible' : 'hidden' };
  });
  return { columns, rows, counts, warnings, conflicts, featureFlagsVerified: flags !== null };
}

const repoUrl = 'https://github.com/tanagornf/Endless-Hackathon';
const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();
function timelineBaseline() {
  const path = 'docs/evidence/numbers.json';
  if (!existsSync(path)) return '';
  const candidate = JSON.parse(readFileSync(path, 'utf8')).BASELINE_SHA;
  return typeof candidate === 'string' && /^[a-f0-9]{40}$/i.test(candidate) && appliedCommit(candidate) ? candidate : '';
}
function snapshot(report: ReturnType<typeof buildStatus>) {
  const generatedFromSha = git('rev-parse', 'HEAD');
  return {
    generatedAt: new Date().toISOString(), generatedFromSha,
    baselineSha: timelineBaseline() || git('log', 'origin/main', '--before=2026-11-21T10:00:00+07:00', '-1', '--format=%H'),
    repoUrl, totals: report.counts, featureFlagsVerified: report.featureFlagsVerified,
    rows: report.rows.map((row: Record<string, string>) => ({
      featureId: row.feature_id, slug: row.slug, name: row.feature_name, lane: row.lane, tier: row.tier,
      status: row.status, targetMode: row.target_mode, actualMode: row.actual_mode, providerGate: row.provider_gate,
      commitSha: row.commit_sha, testsEvidence: row.tests_evidence, checkedAtBangkok: row.checked_at_bangkok, blocker: row.blocker,
      evidenceFile: row.evidence_path, downgradedFrom: row.declared_mode === row.actual_mode ? null : row.declared_mode,
      downgradeReason: row.declared_mode === row.actual_mode ? null : row.blocker,
      links: { evidence: repoUrl + '/blob/main/' + row.evidence_path,
        commit: /^[a-f0-9]{7,40}$/i.test(row.commit_sha) ? repoUrl + '/commit/' + row.commit_sha : null },
    })),
  };
}
function markdown(data: ReturnType<typeof snapshot>, warnings: string[]) {
  const quote = (value: string) => value.replaceAll('|', '\\|').replaceAll('\n', ' ');
  const summaries = data.rows.map((row) =>
    '| ' + [row.featureId, quote(row.name), row.lane, row.tier, row.actualMode,
      '[Evidence](' + row.links.evidence + ')', quote(row.blocker)].join(' | ') + ' |');
  return [
    '# Feature release status', '',
    'Total: ' + data.totals.R + ' R, ' + data.totals.S + ' S, ' + data.totals.A + ' A, ' + data.totals.U + ' U.',
    data.featureFlagsVerified ? 'Production flags were compared with the supplied snapshot.' : 'Production flags were not supplied for this roll-up.', '',
    '| ID | Feature | Lane | Tier | Mode | Evidence | Blocker |',
    '|---|---|---|---|---|---|---|', ...summaries, '',
    ...warnings.map((warning) => '- ' + warning),
  ].join('\n').trimEnd() + '\n';
}

if (import.meta.main) {
  try {
    const args = process.argv.slice(2);
    const check = args[0] === '--check';
    const options = check ? args.slice(1) : args;
    if (options.length && (options.length !== 2 || options[0] !== '--flags')) {
      throw new Error('Usage: npm run release:status -- [--check] [--flags PATH]');
    }
    const report = buildStatus(options[1]);
    const csv = toCsv([report.columns, ...report.rows.map((row) =>
      report.columns.map((column) => (row as Record<string, string>)[column] ?? ''))]);
    for (const problem of report.conflicts) console.error(problem);
    if (report.conflicts.length) process.exitCode = 1;
    else {
      if (check && (!existsSync(filenames.csv) || readFileSync(filenames.csv, 'utf8').replaceAll('\r\n', '\n') !== csv)) {
        throw new Error('Feature CSV is stale. Re-run npm run release:status.');
      }
      if (!check) {
        mkdirSync(resolve('docs/evidence'), { recursive: true });
        mkdirSync(resolve('server/src/features/release/data'), { recursive: true });
        const data = snapshot(report);
        writeFileSync(filenames.csv, csv);
        writeFileSync(filenames.report, JSON.stringify(data, null, 2) + '\n');
        writeFileSync(filenames.summary, markdown(data, report.warnings));
      }
      for (const warning of report.warnings) console.warn(warning);
      for (const row of report.rows) if (row.blocker.includes('downgraded:')) console.warn(row.feature_id + ' ' + row.blocker);
      console.log(JSON.stringify({ features: report.rows.length, counts: report.counts,
        featureFlagsVerified: report.featureFlagsVerified, warningCount: report.warnings.length }));
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Release status failed');
    process.exitCode = 1;
  }
}
