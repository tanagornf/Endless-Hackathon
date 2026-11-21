// Database readiness probe (D16). Reads PG_SERVER_URL from the environment (never printed), then:
//   CREATE DATABASE nless_probe_<random> -> connect -> CREATE EXTENSION vector -> SELECT '[1,2,3]'::vector <=> '[1,2,4]'::vector -> DROP DATABASE.
// Prints one JSON line per step: {"step","ok","ms","detail"}. Exit 0 = all steps ok, 1 = a step failed, 2 = no URL. The scratch database is
// dropped even when a step fails. Works with Neon (direct endpoint) and local Postgres.
import pg from 'pg';
import { randomBytes } from 'node:crypto';

const url = (process.env.PG_SERVER_URL || '').trim();
if (!url) { console.log(JSON.stringify({ step: 'env', ok: false, ms: 0, detail: 'PG_SERVER_URL is not set' })); process.exit(2); }

const dbName = 'nless_probe_' + randomBytes(4).toString('hex');
const results = [];

function redact(message) {
  let text = String(message);
  try {
    const u = new URL(url);
    for (const secret of [u.password, decodeURIComponent(u.password), u.username]) if (secret && secret.length >= 3) text = text.split(secret).join('[REDACTED]');
  } catch { /* url is not parseable: nothing more to hide */ }
  return text.length > 300 ? text.slice(0, 300) + '...' : text;
}

function urlFor(database) {
  const u = new URL(url);
  u.pathname = '/' + database;
  return u.toString();
}

async function step(name, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    const entry = { step: name, ok: true, ms: Date.now() - started, detail: detail ?? '' };
    results.push(entry); console.log(JSON.stringify(entry));
    return true;
  } catch (error) {
    const entry = { step: name, ok: false, ms: Date.now() - started, detail: redact(error && error.message ? error.message : error) };
    results.push(entry); console.log(JSON.stringify(entry));
    return false;
  }
}

const admin = new pg.Client({ connectionString: url, connectionTimeoutMillis: 15000 });
let created = false;
let ok = await step('connect-server', async () => { await admin.connect(); const r = await admin.query('select version() as v'); return String(r.rows[0].v).split(' ').slice(0, 2).join(' '); });
if (ok) ok = await step('create-database', async () => { await admin.query(`CREATE DATABASE ${dbName}`); created = true; return dbName; });
if (ok) {
  const client = new pg.Client({ connectionString: urlFor(dbName), connectionTimeoutMillis: 15000 });
  const connected = await step('connect-database', async () => { await client.connect(); });
  if (connected) {
    const extension = await step('create-extension-vector', async () => { await client.query('CREATE EXTENSION vector'); const r = await client.query("select extversion from pg_extension where extname='vector'"); return 'vector ' + r.rows[0].extversion; });
    if (extension) {
      await step('cosine-distance', async () => {
        const r = await client.query("select ('[1,2,3]'::vector <=> '[1,2,4]'::vector)::float8 as d");
        const d = Number(r.rows[0].d);
        if (!(d > 0.0084 && d < 0.0087)) throw new Error('unexpected distance ' + d);
        return 'distance ' + d.toFixed(5);
      });
    }
    try { await client.end(); } catch { /* ignore */ }
  }
}
if (created) await step('drop-database', async () => { await admin.query(`DROP DATABASE ${dbName} WITH (FORCE)`); return dbName; });
try { await admin.end(); } catch { /* ignore */ }
process.exit(results.every((entry) => entry.ok) ? 0 : 1);
