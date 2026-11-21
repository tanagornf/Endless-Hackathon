import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import type { ReleaseStatusFile } from '@nless/shared/features/release/types';
import { sameStatusTable } from './claims';
import { parseCsv } from './evidence-parse';

const sha = z.string().regex(/^[a-f0-9]{40}$/i);
const requiredRepo = 'https://github.com/tanagornf/Endless-Hackathon';
const validHttps = (value?: string) => {
  if (!value) return '';
  const url = URL.parse(value);
  return url?.protocol === 'https:' && !url.username && !url.password ? url.href : '';
};
const git = (...args: string[]) => execFileSync('git', args, {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
}).trim();

function fileJSON(path: string) {
  return path && existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
}
function png(path: string) {
  return existsSync(path) && readFileSync(path).subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
}

function main() {
  const args = process.argv.slice(2);
  const known = new Set(['--repo-public', '--url', '--final', '--build-info', '--line-oa-name', '--judge-login', '--video-url', '--deck-url', '--prior-work', '--prior-work-evidence']);
  const options = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const [key, value] = args.slice(index, index + 2);
    if (!known.has(key) || !value || options.has(key) || /[\r\n|]/.test(value)) throw new Error('Invalid release pack option');
    options.set(key, value);
  }
  const final = sha.parse(options.get('--final') ?? git('rev-parse', 'origin/main'));
  const origin = git('remote', 'get-url', 'origin');
  if (origin !== requiredRepo + '.git' && origin !== requiredRepo && origin !== 'git@github.com:tanagornf/Endless-Hackathon.git') {
    throw new Error('Unexpected repository');
  }
  const visible = options.get('--repo-public');
  const live = validHttps(options.get('--url'));
  const build = z.object({ sha, modelMode: z.literal('openai') }).safeParse(fileJSON(options.get('--build-info') ?? ''));
  const lastGreen = z.object({ sha, verifiedAt: z.string(), e2ePassed: z.number().min(9) }).safeParse(fileJSON('docs/evidence/last-green.json'));
  const snapshot = fileJSON('server/src/features/release/data/release-status.json') as ReleaseStatusFile | null;
  const csv = existsSync('docs/FEATURE_STATUS.csv') ? parseCsv(readFileSync('docs/FEATURE_STATUS.csv', 'utf8')) : [];
  const idColumn = csv[0]?.indexOf('feature_id') ?? -1;
  const modeColumn = csv[0]?.indexOf('actual_mode') ?? -1;
  const csvRows = new Map(csv.slice(1).map((row) => [row[idColumn], row[modeColumn]]));
  const matching = snapshot?.rows.length === 31 && csvRows.size === 31 &&
    snapshot.rows.every((row) => csvRows.get(row.featureId) === row.actualMode);
  const readme = existsSync('README.md') ? readFileSync('README.md', 'utf8') : '';
  const qr = 'docs/assets/line-qr.png';
  const judge = options.get('--judge-login') ?? '';
  const variant = options.get('--prior-work');
  const priorEvidence = validHttps(options.get('--prior-work-evidence'));
  const media = (path: string, url?: string) => existsSync(path) ? path : validHttps(url);
  const rows: [string, string][] = [
    ['Repository', ['yes', 'no'].includes(visible ?? '') ? requiredRepo + ' · ' + (visible === 'yes' ? 'public' : 'judge invitation required') : ''],
    ['Serving production build', live && build.success && build.data.sha === final ? live + ' · ' + final : ''],
    ['LINE Official Account QR', png(qr) && options.get('--line-oa-name') ? qr + ' · ' + options.get('--line-oa-name') : ''],
    ['Synthetic judge login', /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(judge) ? judge : ''],
    ['Demo video', media('docs/submission/demo.mp4', options.get('--video-url'))],
    ['Slides', media('docs/submission/deck.pdf', options.get('--deck-url'))],
    ['README and status table', snapshot && sameStatusTable(readme, snapshot) && !/<<|\{\{|\[VERIFY|REPLACE_|\b(?:TODO|TBD|lorem)\b/i.test(readme) ? 'README.md' : ''],
    ['Prior work', (variant === 'A' || variant === 'B') && snapshot?.baselineSha && priorEvidence ? variant + ' · ' + snapshot.baselineSha + ' to ' + final + ' · ' + priorEvidence : ''],
    ['Feature status', matching ? 'docs/FEATURE_STATUS.csv · 31 rows' : ''],
    ['Final production golden path', lastGreen.success && lastGreen.data.sha === final ? lastGreen.data.verifiedAt : ''],
  ];
  mkdirSync('docs/submission', { recursive: true });
  const content = ['# Submission checklist', '', 'Candidate ' + final + '.', '',
    '| Item | Evidence |', '|---|---|',
    ...rows.map(([label, value]) => '| ' + label + ' | ' + (value || 'MISSING') + ' |'), '',
    'Customer and judge entry is LINE. Demo Chat is reserved for internal QA.', '',
    'Share judge authentication through the private submission channel.', ''].join('\n');
  writeFileSync('docs/submission/SUBMISSION.md', content);
  const missing = rows.filter(([, value]) => !value).map(([label]) => label);
  for (const item of missing) console.error('MISSING ' + item);
  if (missing.length) process.exitCode = 1;
}
if (import.meta.main) {
  try { main(); }
  catch (error) {
    console.error(error instanceof Error ? error.message : 'Release pack failed');
    process.exitCode = 1;
  }
}
