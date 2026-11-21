import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

const buildSchema = z.object({
  sha: z.string().regex(/^[a-f0-9]{7,40}$/i), modelMode: z.literal('openai'),
  schema: z.string().max(200).nullable(),
  providerModes: z.record(z.string(), z.enum(['real', 'fake', 'openai', 'sandbox', 'disabled', 'vision'])).optional(),
});
const statsSchema = z.object({
  expected: z.number().int().nonnegative(), unexpected: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(), flaky: z.number().int().nonnegative(),
});

export function productionResult(value: unknown, exit: number | null) {
  const data = z.object({ stats: statsSchema }).safeParse(value);
  if (!data.success) throw new Error('Playwright report is missing valid production counts');
  const counts = data.data.stats;
  const discovered = counts.expected + counts.unexpected + counts.skipped + counts.flaky;
  return { passed: counts.expected, failed: counts.unexpected + counts.flaky, skipped: counts.skipped,
    green: exit === 0 && discovered === 12 && counts.expected >= 9 && counts.unexpected === 0 && counts.flaky === 0 };
}

async function json(base: URL, pathname: string) {
  const response = await fetch(new URL(pathname, base), { signal: AbortSignal.timeout(6000), redirect: 'error' });
  if (!response.ok) throw new Error(pathname + ' returned HTTP ' + response.status);
  return response.json() as Promise<unknown>;
}

async function serving(base: URL, candidate: string) {
  const cutoff = Date.now() + 8 * 60_000;
  do {
    try {
      const raw = await json(base, '/build-info');
      const metadata = buildSchema.safeParse(raw);
      if (metadata.success && metadata.data.sha.startsWith(candidate)) return metadata.data;
    } catch { /* Render can be between builds. */ }
    const remaining = cutoff - Date.now();
    if (remaining > 0) await delay(Math.min(remaining, 15_000));
  } while (Date.now() < cutoff);
  throw new Error('Candidate SHA was not served in OpenAI mode within eight minutes');
}

async function verifyReadiness(base: URL) {
  const ready = z.object({ status: z.literal('ready'), worker: z.object({ running: z.literal(true) }) });
  for (let index = 0; index < 3; index++) {
    if (index) await delay(2000);
    if (!ready.safeParse(await json(base, '/readyz')).success) throw new Error('Readiness or worker status failed');
  }
}

function runGoldenPath(base: URL, candidate: string) {
  if (!existsSync('tests/e2e/golden-path.spec.ts')) throw new Error('The 12-check golden-path spec is not present in this checkout');
  const working = mkdtempSync(join(tmpdir(), 'nless-release-'));
  const output = join(working, 'result.json');
  try {
    const playwright = createRequire(import.meta.url).resolve('@playwright/test/cli');
    const run = spawnSync(process.execPath, [playwright, 'test', 'tests/e2e/golden-path.spec.ts', '--reporter=json'], {
      env: { ...process.env, E2E_BASE_URL: base.origin, E2E_EXPECT_SHA: candidate, PLAYWRIGHT_JSON_OUTPUT_FILE: output },
      timeout: 240_000, stdio: 'ignore',
    });
    if (!existsSync(output)) throw new Error(run.error ? 'Golden-path runner did not finish' : 'Golden-path runner wrote no report');
    const raw = readFileSync(output, 'utf8');
    const result = productionResult(JSON.parse(raw), run.status);
    const privateValues = ['E2E_PASSWORD', 'E2E_ADMIN_PASSWORD', 'E2E_DEV_LOGIN_TOKEN'].map((name) => process.env[name]).filter((value): value is string => Boolean(value));
    const safeReport = privateValues.reduce((report, value) =>
      report.replaceAll(JSON.stringify(value).slice(1, -1), '[redacted]'), raw);
    writeFileSync('docs/evidence/e2e.json', safeReport);
    return result;
  } finally {
    rmSync(output, { force: true });
    rmdirSync(working);
  }
}

const releaseLog = 'docs/evidence/release.md';
const lastGreen = 'docs/evidence/last-green.json';
function previousGreen(): string {
  if (!existsSync(lastGreen)) return 'unavailable';
  const data = z.object({ sha: z.string().regex(/^[a-f0-9]{7,40}$/i) }).safeParse(JSON.parse(readFileSync(lastGreen, 'utf8')));
  return data.success ? data.data.sha : 'unavailable';
}

async function main() {
  loadEnv({ path: '.env.local', quiet: true });
  const args = process.argv.slice(2);
  const permitted = new Set(['--sha', '--url']);
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const [key, value] = args.slice(index, index + 2);
    if (!permitted.has(key) || !value || values.has(key)) throw new Error('Usage: npm run release:verify -- [--sha SHA] [--url ORIGIN]');
    values.set(key, value);
  }
  const sha = values.get('--sha') ?? execFileSync('git', ['rev-parse', 'origin/main'], { encoding: 'utf8' }).trim();
  if (!/^[a-f0-9]{7,40}$/i.test(sha)) throw new Error('Invalid candidate SHA');
  const target = values.get('--url') ?? process.env.E2E_BASE_URL;
  if (!target) throw new Error('Set E2E_BASE_URL or pass --url for an approved production rehearsal');
  const base = new URL(target);
  if (base.protocol !== 'https:' || base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
    throw new Error('Expected a production HTTPS origin without credentials');
  }
  mkdirSync('docs/evidence', { recursive: true });
  if (!existsSync(releaseLog)) writeFileSync(releaseLog, '# Release evidence\n\n## Verifications\n');
  const checked = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Asia/Bangkok' }).format(new Date());
  const rollback = previousGreen();
  const append = (result: string) => appendFileSync(releaseLog, '\n- ' + checked + ' ICT, ' + sha + '. ' + result + ' Previous verified rollback SHA ' + rollback + '.\n');
  try {
    const build = await serving(base, sha.toLowerCase());
    await verifyReadiness(base);
    const results = runGoldenPath(base, build.sha);
    append('Schema ' + (build.schema || 'unreported') + ', model ' + build.modelMode +
      ', providers ' + JSON.stringify(build.providerModes ?? {}) + '. Playwright ' +
      results.passed + ' passed, ' + results.failed + ' failed, ' + results.skipped + ' skipped.');
    console.log(JSON.stringify({ sha: build.sha, ...results }));
    if (!results.green) process.exitCode = 1;
    else writeFileSync(lastGreen, JSON.stringify({ sha: build.sha, verifiedAt: new Date().toISOString(),
      e2ePassed: results.passed, e2eSkipped: results.skipped }, null, 2) + '\n');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Release verification failed';
    append(message + '.');
    console.error(message);
    process.exitCode = 1;
  }
}
if (import.meta.main) await main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Release verification failed');
  process.exitCode = 1;
});
