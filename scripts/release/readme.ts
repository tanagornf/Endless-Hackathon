import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import type { ReleaseStatusFile } from '@nless/shared/features/release/types';
import { sameStatusTable } from './claims';

const artifact = 'server/src/features/release/data/release-status.json';
const qr = 'docs/assets/line-qr.png';
const leftovers = /<<|\{\{|\[VERIFY|REPLACE_|\b(?:TODO|TBD|lorem)\b/i;
const counts = z.object({ BASELINE_SHA: z.string().regex(/^[a-f0-9]{40}$/), FINAL_SHA: z.string().regex(/^[a-f0-9]{40}$/),
  PR_COUNT: z.number().int().nonnegative(), COMMITS: z.number().int().nonnegative(), LINES_ADDED: z.number().int().nonnegative(),
  TESTS_PASSED: z.number().int().nonnegative().nullable(), TESTS_TOTAL: z.number().int().nonnegative().nullable(),
  E2E_PASSED: z.number().int().nonnegative().nullable(), E2E_SKIPPED: z.number().int().nonnegative().nullable() });
type Counts = z.infer<typeof counts>;

function lineUrl(value: string) {
  const url = URL.parse(value);
  if (!url || url.protocol !== 'https:' || url.username || url.password ||
      !['line.me', 'lin.ee'].includes(url.hostname) || !url.pathname || url.pathname === '/') {
    throw new Error('An approved LINE Official Account link is required');
  }
  return url.href;
}
function productionUrl(value: string) {
  const url = URL.parse(value);
  if (!url || url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('A production HTTPS origin is required');
  }
  return url.origin;
}
function measurement(data: Counts) {
  return [
    data.PR_COUNT + ' merged pull requests, ' + data.COMMITS + ' commits and ' + data.LINES_ADDED + ' added lines.',
    data.TESTS_TOTAL === null || data.TESTS_PASSED === null ? 'Candidate Vitest counts are unavailable.'
      : 'Vitest: ' + data.TESTS_PASSED + '/' + data.TESTS_TOTAL + ' passed.',
    data.E2E_PASSED === null || data.E2E_SKIPPED === null ? 'Candidate golden-path counts are unavailable.'
      : 'Playwright: ' + data.E2E_PASSED + ' passed and ' + data.E2E_SKIPPED + ' skipped.',
  ].join('\n');
}
function totalLine(snapshot: ReleaseStatusFile) {
  return [snapshot.totals.R + ' R', snapshot.totals.S + ' S', snapshot.totals.A + ' A', snapshot.totals.U + ' U'].join(' · ');
}

function priorWork(data: Counts, variant: string, company: string, answer: string, replyDate: string) {
  if (!['A', 'B'].includes(variant)) throw new Error('Select the recorded --prior-work A or B declaration');
  if (!company || !answer || (variant === 'B' && !replyDate)) throw new Error('The selected declaration requires a company and documented organizer decision');
  const pitch = readFileSync('docs/pitch/PITCH.md', 'utf8').split('## 7. Prior-work declaration')[1]?.split('## 8.')[0];
  const source = pitch?.split('### แบบ ' + variant)[1]?.split(/^### /m)[0];
  const statements = source?.split(/\r?\n/).filter((line) => /^\*\*(?:EN|TH):\*\*/.test(line));
  if (statements?.length !== 2) throw new Error('The selected bilingual declaration is missing from PITCH');
  return statements.map((line) => line.replaceAll('<<COMPANY>>', company).replaceAll('<<BASELINE_SHA>>', data.BASELINE_SHA)
    .replaceAll('<<FINAL_SHA>>', data.FINAL_SHA).replaceAll('<<organizer reply date>>', replyDate)).join('\n\n');
}
const cell = (value: string) => value.replaceAll('|', '\\|').replaceAll(/\r?\n/g, ' ');

function main() {
  const report = JSON.parse(readFileSync(artifact, 'utf8')) as ReleaseStatusFile;
  const data = counts.parse(JSON.parse(readFileSync('docs/evidence/numbers.json', 'utf8')));
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--check') {
    const current = readFileSync('README.md', 'utf8');
    if (leftovers.test(current) || !sameStatusTable(current, report) || !current.includes(measurement(data)) ||
        !current.includes(totalLine(report)) || !current.includes(data.FINAL_SHA) || !existsSync(qr)) {
      throw new Error('README is missing verified release inputs or differs from the evidence');
    }
    console.log('README matches the release evidence');
    return;
  }
  const options = new Map<string, string>();
  const keys = new Set(['--url', '--line-url', '--prior-work', '--company', '--organizer-answer', '--organizer-reply-date']);
  for (let index = 0; index < args.length; index += 2) {
    const [key, value] = args.slice(index, index + 2);
    if (!keys.has(key) || !value || options.has(key) || /[\r\n<>|]/.test(value)) throw new Error('Invalid release README option');
    options.set(key, value);
  }
  if (!existsSync(qr) || readFileSync(qr).subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    throw new Error('The verified LINE QR is missing: ' + qr);
  }
  const table = [
    '| ID | Feature | Mode | Evidence |', '|---|---|---|---|',
    ...report.rows.map((row) => '| ' + [row.featureId, cell(row.name), row.actualMode,
      '[Evidence](' + row.evidenceFile + ')'].join(' | ') + ' |'),
  ].join('\n');
  const fields: Record<string, string> = {
    LIVE_URL: productionUrl(options.get('--url') ?? ''),
    LINE_ENTRY: '[LINE Official Account](' + lineUrl(options.get('--line-url') ?? '') + ') · ![LINE QR](' + qr + ')',
    FINAL_SHA: data.FINAL_SHA, FEATURE_TABLE: table, FEATURE_TOTALS: totalLine(report), MEASURED: measurement(data),
    PRIOR_WORK: priorWork(data, options.get('--prior-work') ?? '', options.get('--company') ?? '',
      options.get('--organizer-answer') ?? '', options.get('--organizer-reply-date') ?? ''),
  };
  const template = readFileSync('scripts/release/README.template.md', 'utf8');
  const result = template.replace(/\{\{([A-Z_]+)\}\}/g, (placeholder, name: string) => fields[name] ?? placeholder);
  if (leftovers.test(result) || !sameStatusTable(result, report)) throw new Error('README rendering produced unresolved evidence');
  writeFileSync('README.md', result);
}
if (import.meta.main) {
  try { main(); }
  catch (error) {
    console.error(error instanceof Error ? error.message : 'README generation failed');
    process.exitCode = 1;
  }
}
