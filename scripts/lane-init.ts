import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';
import { ALL_LANES, LANE_NUMBER } from '@nless/shared/core/features';
import type { AnyLane } from '@nless/shared/core/features';
import { createDatabases } from './db';

const root = fileURLToPath(new URL('../', import.meta.url));
const local = join(root, '.env.local');
function safeDbUrl(server: string, name: string): string {
  const target = new URL(server);
  if (!['postgres:', 'postgresql:'].includes(target.protocol)) throw new Error('PG_SERVER_URL must be PostgreSQL');
  if (target.hostname.includes('-pooler')) throw new Error('PG_SERVER_URL must use a direct endpoint');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) && target.searchParams.get('sslmode') !== 'require') {
    throw new Error('PG_SERVER_URL must require SSL');
  }
  target.pathname = '/' + name;
  return target.href;
}

try {
  const lane = readFileSync(join(root, '.lane'), 'utf8').trim() as AnyLane;
  if (!ALL_LANES.includes(lane)) throw new Error('Set .lane to a supported lane');
  execFileSync('git', ['check-ignore', '-q', '.env.local'], { cwd: root, stdio: 'ignore' });
  const values = parse(readFileSync(join(root, '.env.example')));
  const secrets = resolve(root, '..', 'nless.secrets.env');
  if (process.env.CI !== 'true' && existsSync(secrets)) {
    for (const [key, value] of Object.entries(parse(readFileSync(secrets)))) {
      if (key in values) values[key] = value;
      else console.warn('Unknown key ' + key);
    }
  } else {
    console.warn('No machine secrets loaded');
  }
  values.PG_SERVER_URL = values.PG_SERVER_URL.includes('REPLACE_') ? '' : values.PG_SERVER_URL;
  for (const key of Object.keys(values)) if (values[key].startsWith('REPLACE')) values[key] = '';
  if (existsSync(local) && !process.argv.includes('--force')) {
    const existing = parse(readFileSync(local));
    if (existing.LANE !== lane) throw new Error('Existing lane file does not match this worktree');
    const main = existing.DATABASE_URL;
    if (main && existing.TEST_DATABASE_URL) await createDatabases([main, existing.TEST_DATABASE_URL]);
    console.log('.env.local already exists');
  } else {
    const number = LANE_NUMBER[lane];
    const webPort = 5170 + number;
    const base = 'http://localhost:' + webPort;
    const name = 'nless_hack_' + lane.toLowerCase();
    Object.assign(values, { LANE: lane, API_PORT: String(3000 + number), WEB_PORT: String(webPort), WEB_ORIGIN: base, APP_BASE_URL: base, E2E_BASE_URL: base });
    values.DATABASE_URL = values.PG_SERVER_URL ? safeDbUrl(values.PG_SERVER_URL, name) : '';
    values.TEST_DATABASE_URL = values.PG_SERVER_URL ? safeDbUrl(values.PG_SERVER_URL, name + '_test') : '';
    values.SESSION_SECRET ||= randomBytes(36).toString('base64url');
    values.TOKEN_ENCRYPTION_KEY ||= randomBytes(32).toString('base64');
    values.BOARD_SOURCE ||= 'sites';
    if (existsSync(local)) {
      const existing = parse(readFileSync(local));
      console.log('Changed keys: ' + Object.keys(values).filter((key) => existing[key] !== values[key]).join(', '));
    }
    writeFileSync(local, Object.entries(values).map(([key, value]) => key + '=' + (value.includes('\"') ? "'" + value.replace(/'/g, '') + "'" : JSON.stringify(value))).join('\n') + '\n', { mode: 0o600 });
    if (values.DATABASE_URL) await createDatabases([values.DATABASE_URL, values.TEST_DATABASE_URL]);
    console.log('Lane ' + lane + ' initialized at API port ' + values.API_PORT + ' and web port ' + values.WEB_PORT);
  }
} catch (error) {
  console.error('Lane initialization failed' + ((error as { code?: string }).code ? ' (' + (error as { code: string }).code + ')' : ''));
  process.exitCode = 1;
}
