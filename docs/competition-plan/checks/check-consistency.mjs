#!/usr/bin/env node
// Consistency check for the planning repo (hand-off deliverable 9). No dependencies. Run from the repo root:
//   node docs/competition-plan/checks/check-consistency.mjs [--verbose]
// Checks: (1) lanes / tiers / owners / order agree across contracts.ts, backlog, FEATURE_STATUS, PLAN, AGENTS, specs index,
// budget doc, prompt pack README, lane prompts and orchestrator prompts; (2) every feature has a build spec with the 15
// fixed headings; (3) per-person midpoint minutes are within ±5%; (4) relative links (and their anchors) resolve;
// (5) no secrets in tracked/untracked-not-ignored files; (6) no reference to removed features except removal notes;
// (7) no non-OpenAI AI provider in the active docs except "do not use" notes. Exit code 1 on any FAIL.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();
const VERBOSE = process.argv.includes('--verbose');
const fails = [];
const warns = [];
const fail = (m) => fails.push(m);
const warn = (m) => warns.push(m);
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));

// ---------- 1. sources of truth ----------
const contracts = read('docs/competition-plan/templates/contracts.ts');
const FEATURES = [...contracts.matchAll(/\{ id: '(F\d\d)', slug: '([^']+)', lane: '([ABC][1-3])', title: '[^']*', mvp: (true|false), tier: '(P[0-3])', folder: (true|false)/g)]
  .map((m) => ({ id: m[1], slug: m[2], lane: m[3], mvp: m[4] === 'true', tier: m[5], folder: m[6] === 'true' }));
if (FEATURES.length !== 31) fail(`contracts.ts FEATURES has ${FEATURES.length} rows, expected 31`);
const byId = Object.fromEntries(FEATURES.map((f) => [f.id, f]));
const LANES = ['C1', 'C2', 'C3', 'B1', 'B2', 'B3', 'A1', 'A2', 'A3'];
const laneOrderBlock = contracts.slice(contracts.indexOf('export const LANE_ORDER'), contracts.indexOf('};', contracts.indexOf('export const LANE_ORDER')));
const LANE_ORDER = {};
for (const m of laneOrderBlock.matchAll(/([ABC][1-3]): \[([^\]]*)\]/g)) LANE_ORDER[m[1]] = [...m[2].matchAll(/F\d\d/g)].map((x) => x[0]);
for (const lane of LANES) {
  const fromFeatures = FEATURES.filter((f) => f.lane === lane).map((f) => f.id).sort();
  const fromOrder = [...(LANE_ORDER[lane] ?? [])].sort();
  if (fromFeatures.join() !== fromOrder.join()) fail(`contracts.ts: LANE_ORDER.${lane} [${LANE_ORDER[lane]}] does not match FEATURES lane column [${fromFeatures}]`);
}
const specFile = (f) => `docs/specs/${f.id}-${f.slug.replace('/', '-')}.md`;
const seq = (lane) => LANE_ORDER[lane].join(' ');

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; } else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [h, ...rest] = rows.filter((r) => r.length > 1);
  return rest.map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ''])));
}

// backlog
const backlog = parseCsv(read('docs/competition-plan/feature-backlog.csv'));
if (backlog.length !== 31) fail(`feature-backlog.csv has ${backlog.length} rows, expected 31`);
const minutes = {};
for (const r of backlog) {
  const f = byId[r.id];
  if (!f) { fail(`backlog: ${r.id} is not in contracts.ts FEATURES`); continue; }
  if (r.lane !== f.lane) fail(`backlog ${r.id}: lane ${r.lane} ≠ contracts ${f.lane}`);
  if (r.slug !== f.slug) fail(`backlog ${r.id}: slug ${r.slug} ≠ contracts ${f.slug}`);
  if (r.tier !== f.tier) fail(`backlog ${r.id}: tier ${r.tier} ≠ contracts ${f.tier}`);
  if (r.owner !== f.lane[0]) fail(`backlog ${r.id}: owner ${r.owner} ≠ lane ${f.lane}`);
  minutes[r.id] = { low: Number(r.effortPersonMinutesLow), high: Number(r.effortPersonMinutesHigh) };
}
for (const f of FEATURES) if (!minutes[f.id]) fail(`backlog: missing ${f.id}`);

// FEATURE_STATUS
const status = parseCsv(read('docs/competition-plan/templates/FEATURE_STATUS.csv'));
if (status.length !== 31) fail(`FEATURE_STATUS.csv has ${status.length} rows, expected 31`);
for (const r of status) {
  const f = byId[r.feature_id];
  if (!f) { fail(`FEATURE_STATUS: ${r.feature_id} is not in contracts.ts`); continue; }
  if (r.lane !== f.lane || r.slug !== f.slug || r.owner !== f.lane[0]) fail(`FEATURE_STATUS ${r.feature_id}: lane/slug/owner ${r.lane}/${r.slug}/${r.owner} ≠ contracts ${f.lane}/${f.slug}/${f.lane[0]}`);
  if (r.status !== 'UNIMPLEMENTED' || r.actual_mode !== 'U') fail(`FEATURE_STATUS ${r.feature_id}: template must start UNIMPLEMENTED / U`);
}

// ---------- 2. documents that repeat the lane order ----------
/** Extract "Fxx … (P#)" pairs in order from a text fragment. */
const pairs = (s) => [...s.matchAll(/\b(F\d\d)\b[^→|]*?[\[(](P[0-3])/g)].map((m) => `${m[1]}:${m[2]}`);
const ids = (s) => [...s.matchAll(/\bF\d\d\b/g)].map((m) => m[0]);
const expectPairs = (lane) => LANE_ORDER[lane].map((id) => `${id}:${byId[id].tier}`).join(' ');

function checkOrderLine(doc, lane, fragment, withTiers = true) {
  if (!fragment) { fail(`${doc}: no feature-order line found for lane ${lane}`); return; }
  const gotIds = ids(fragment).filter((id, i, a) => a.indexOf(id) === i).filter((id) => byId[id]?.lane === lane || LANE_ORDER[lane].includes(id));
  if (gotIds.join(' ') !== seq(lane)) fail(`${doc}: lane ${lane} order is [${gotIds.join(' ')}], contracts say [${seq(lane)}]`);
  if (withTiers) {
    const got = pairs(fragment).filter((p, i, a) => a.indexOf(p) === i);
    if (got.join(' ') !== expectPairs(lane)) fail(`${doc}: lane ${lane} tiers are [${got.join(' ')}], contracts say [${expectPairs(lane)}]`);
  }
}

// PLAN.md lane table: cells like "C1: F01 setup + deploy (P0) → …"
{
  const plan = read('PLAN.md');
  for (const lane of LANES) {
    const m = plan.match(new RegExp(`\\| ?${lane}: ([^|]+)\\|`));
    checkOrderLine('PLAN.md (แบ่งคนและ lanes)', lane, m?.[1]);
  }
  for (const [tier, n] of [['P0', 11], ['P1', 8], ['P2', 11], ['P3', 1]]) {
    const have = FEATURES.filter((f) => f.tier === tier).length;
    if (have !== n) fail(`contracts.ts: ${have} features in ${tier}, PLAN tier table says ${n}`);
    const row = plan.split('\n').find((l) => l.startsWith(`| **${tier}**`));
    const listed = row ? ids(row.split('|')[2]) : [];
    const want = FEATURES.filter((f) => f.tier === tier).map((f) => f.id).sort().join(' ');
    if ([...listed].sort().join(' ') !== want) fail(`PLAN.md tier table ${tier}: [${[...listed].sort().join(' ')}] ≠ contracts [${want}]`);
  }
}
// AGENTS.md §2 table: "| C1 | F01 `core` (P0) → … |"
{
  const agents = read('docs/competition-plan/templates/AGENTS.md');
  for (const lane of LANES) {
    const row = agents.split('\n').find((l) => l.startsWith(`| ${lane} |`));
    checkOrderLine('AGENTS.md §2', lane, row?.split('|')[2]);
  }
  const bytes = Buffer.byteLength(agents, 'utf8');
  if (bytes > 32768) fail(`AGENTS.md is ${bytes} bytes: over the 32 KiB project_doc_max_bytes default`);
  else if (bytes > 30500) warn(`AGENTS.md is ${bytes} bytes: close to the 32 KiB default cap (no global ~/.codex/AGENTS.md on the day, or raise project_doc_max_bytes)`);
}
// prompts/README.md overview table: "| C1 | C | F01 … (P0) → … |"
{
  const pr = read('prompts/README.md');
  for (const lane of LANES) {
    const row = pr.split('\n').find((l) => l.startsWith(`| ${lane} | ${lane[0]} |`));
    checkOrderLine('prompts/README.md (ภาพรวม 12 sessions)', lane, row?.split('|')[3]);
    const range = row?.split('|')[7]?.trim();
    const low = LANE_ORDER[lane].reduce((s, id) => s + minutes[id].low, 0);
    const high = LANE_ORDER[lane].reduce((s, id) => s + minutes[id].high, 0);
    if (range !== `${low}–${high}`) fail(`prompts/README.md: lane ${lane} minutes "${range}" ≠ backlog ${low}–${high}`);
  }
}
// budget doc §5 table
{
  const b = read('docs/budget-and-priority.md');
  const sec = b.slice(b.indexOf('## 5. ลำดับใน lane'));
  for (const lane of LANES) {
    const row = sec.split('\n').find((l) => l.startsWith(`| ${lane} |`));
    checkOrderLine('budget-and-priority.md §5', lane, row?.split('|')[2]);
  }
}
// specs index
{
  const idxDoc = read('docs/specs/README.md');
  for (const f of FEATURES) {
    const row = idxDoc.split('\n').find((l) => l.startsWith(`| ${f.id} |`));
    if (!row) { fail(`docs/specs/README.md: no index row for ${f.id}`); continue; }
    const c = row.split('|').map((x) => x.trim());
    if (c[3] !== f.lane || c[4] !== f.tier) fail(`docs/specs/README.md ${f.id}: lane/tier ${c[3]}/${c[4]} ≠ contracts ${f.lane}/${f.tier}`);
    if (!row.includes(`(${f.id}-${f.slug.replace('/', '-')}.md)`)) fail(`docs/specs/README.md ${f.id}: link is not ${f.id}-${f.slug.replace('/', '-')}.md`);
    const mm = c[6];
    if (mm !== `${minutes[f.id].low}–${minutes[f.id].high}`) fail(`docs/specs/README.md ${f.id}: minutes "${mm}" ≠ backlog ${minutes[f.id].low}–${minutes[f.id].high}`);
  }
}
// lane prompts and orchestrator prompts
for (const lane of LANES) {
  const p = `prompts/lanes/${lane}.md`;
  if (!exists(p)) { fail(`${p} is missing`); continue; }
  const t = read(p);
  const line = t.split('\n').find((l) => l.startsWith('ลำดับงาน (tier):'));
  checkOrderLine(p, lane, line);
  if (!t.includes(`orchestrator ของคุณ: ${lane[0]}0`)) fail(`${p}: does not name its orchestrator ${lane[0]}0`);
  for (const id of LANE_ORDER[lane]) if (id !== 'F01' && !t.includes(specFile(byId[id]))) fail(`${p}: does not point at ${specFile(byId[id])}`);
  if (/\.\.\/papi-ref/.test(t.replace(/\.\.\/papi-ref ปิด[^\n]*/g, ''))) fail(`${p}: still tells the lane to use ../papi-ref (D1)`);
}
for (const person of ['A', 'B', 'C']) {
  const p = `prompts/orchestrators/${person}0.md`;
  if (!exists(p)) { fail(`${p} is missing`); continue; }
  const t = read(p);
  for (const n of [1, 2, 3]) {
    const lane = `${person}${n}`;
    const line = t.split('\n').find((l) => l.startsWith(`${lane}  `));
    checkOrderLine(p, lane, line);
  }
  if (!exists(`prompts/people/${person}.md`)) fail(`prompts/people/${person}.md is missing`);
}

// ---------- 3. specs exist and follow the template ----------
const HEADINGS = ['## 1. ', '## 2. ', '## 3. ', '## 4. ', '## 5. ', '## 6. ', '## 7. ', '## 8. ', '## 9. ', '## 10. ', '## 11. ', '## 12. ', '## 13. ', '## 14. ', '## 15. '];
const HEADING_WORDS = ['user stories', 'Data model', 'API endpoints', 'contracts', 'Algorithms', 'AI calls', 'UI', 'Jobs', 'Seed', 'Tests', 'Acceptance', 'Security', 'Edge cases', 'Build order', 'UNCONFIRMED'];
for (const f of FEATURES) {
  const p = specFile(f);
  if (!exists(p)) { fail(`${p} is missing`); continue; }
  const t = read(p);
  const head = t.slice(0, 2500);
  if (!head.includes(f.lane)) fail(`${p}: header does not mention lane ${f.lane}`);
  if (!head.includes(f.tier)) fail(`${p}: header does not mention tier ${f.tier}`);
  let pos = 0;
  HEADINGS.forEach((h, i) => {
    const at = t.indexOf('\n' + h, pos);
    if (at < 0) fail(`${p}: heading "${h.trim()} …${HEADING_WORDS[i]}" missing or out of order`);
    else {
      const lineEnd = t.indexOf('\n', at + 1);
      if (!t.slice(at, lineEnd).includes(HEADING_WORDS[i])) fail(`${p}: heading ${h.trim()} should contain "${HEADING_WORDS[i]}"`);
      pos = at + 1;
    }
  });
  if (/\.\.\/papi-ref\//.test(t)) fail(`${p}: contains a ../papi-ref path (specs must stand alone, D1)`);
  const brief = `docs/porting/${f.id}-${f.slug.replace('/', '-')}.md`;
  if (exists(brief) && !read(brief).includes(`specs/${f.id}-${f.slug.replace('/', '-')}.md`)) fail(`${brief}: missing the build-spec banner link`);
}

// ---------- 4. balance per person ----------
const mid = (id) => (minutes[id].low + minutes[id].high) / 2;
const perLane = Object.fromEntries(LANES.map((l) => [l, LANE_ORDER[l].reduce((s, id) => s + mid(id), 0)]));
const perPerson = { A: 0, B: 0, C: 0 };
for (const l of LANES) perPerson[l[0]] += perLane[l];
const mean = (perPerson.A + perPerson.B + perPerson.C) / 3;
const balance = Object.entries(perPerson).map(([p, v]) => ({ person: p, lanes: [1, 2, 3].map((n) => `${p}${n} ${perLane[p + n]}`).join(' · '), total: v, dev: ((v - mean) / mean) * 100 }));
for (const b of balance) if (Math.abs(b.dev) > 5) fail(`balance: person ${b.person} is ${b.dev.toFixed(1)}% from the mean (limit ±5%)`);
{
  const plan = read('PLAN.md');
  for (const b of balance) if (!plan.includes(`**${b.total}**`)) fail(`PLAN.md: per-person total ${b.total} for ${b.person} not shown in the balance table`);
  const totalLow = FEATURES.reduce((s, f) => s + minutes[f.id].low, 0), totalHigh = FEATURES.reduce((s, f) => s + minutes[f.id].high, 0);
  const fmt = (n) => n.toLocaleString('en-US');
  if (!plan.includes(`${fmt(totalLow)}–${fmt(totalHigh)}`)) fail(`PLAN.md: total minutes range should be ${fmt(totalLow)}–${fmt(totalHigh)}`);
}

// ---------- 5. files to scan ----------
const listed = execSync('git ls-files -z && git ls-files -z -o --exclude-standard', { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  .split('\0').filter(Boolean).filter((f) => !f.includes('node_modules/') && exists(f));
const mdFiles = listed.filter((f) => f.endsWith('.md'));

// links
const slug = (h) => h.trim().toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, '').replace(/ /g, '-');
const anchorCache = new Map();
function anchorsOf(file) {
  if (anchorCache.has(file)) return anchorCache.get(file);
  const set = new Set();
  const seen = {};
  let inFence = false;
  for (const line of read(file).split('\n')) {
    if (/^(```|~~~)/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const m = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (!m) continue;
    const text = m[2].replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[`*_]/g, (c) => (c === '_' ? '_' : ''));
    let s = slug(text);
    if (seen[s] !== undefined) { seen[s] += 1; s = `${s}-${seen[s]}`; } else seen[s] = 0;
    set.add(s);
  }
  anchorCache.set(file, set);
  return set;
}
let linkCount = 0;
for (const file of mdFiles) {
  let inFence = false;
  const text = read(file);
  const linesArr = text.split('\n');
  linesArr.forEach((line, n) => {
    if (/^(```|~~~)/.test(line.trim())) { inFence = !inFence; return; }
    if (inFence) return;
    for (const m of line.replace(/`[^`]*`/g, '').matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      let target = m[1];
      if (/^(https?:|mailto:|tel:|#$)/.test(target) || target.startsWith('<')) continue;
      if (!/[\/.#]/.test(target)) continue; // not a path (e.g. a regex group such as `](_test)` in prose)
      linkCount++;
      let [p, anchor] = target.split('#');
      try { p = decodeURIComponent(p); anchor = anchor === undefined ? undefined : decodeURIComponent(anchor); } catch { /* keep raw */ }
      const resolved = p === '' ? file : path.posix.normalize(path.posix.join(path.posix.dirname(file), p));
      if (resolved.startsWith('..')) { fail(`${file}:${n + 1}: link leaves the repo: ${target}`); continue; }
      if (!exists(resolved)) { fail(`${file}:${n + 1}: broken link ${target}`); continue; }
      if (anchor && resolved.endsWith('.md') && !anchorsOf(resolved).has(anchor.toLowerCase())) fail(`${file}:${n + 1}: anchor not found: ${target}`);
    }
  });
}

// secrets
const SECRET_PATTERNS = [/sk-[A-Za-z0-9_-]{24,}/, /\bek_[A-Za-z0-9]{16,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /\bghp_[A-Za-z0-9]{30,}/, /\bgithub_pat_[A-Za-z0-9_]{30,}/, /\bAKIA[0-9A-Z]{16}\b/, /\bxox[baprs]-[A-Za-z0-9-]{20,}/, /\b(pkey|skey)_(test|live)_[A-Za-z0-9]{16,}/, /\brnd_[A-Za-z0-9]{24,}/, /postgres(?:ql)?:\/\/[^:\s<>"']+:[^@\s<>"'*]{6,}@[a-z0-9.-]+\.(neon\.tech|render\.com|supabase\.co)/i];
for (const file of listed) {
  if (/\.(png|jpg|jpeg|gif|pdf|zip|ico|woff2?)$/i.test(file)) continue;
  if (/secrets\.env$/.test(file)) fail(`${file}: a secrets file is inside the repo`);
  const text = read(file);
  text.split('\n').forEach((line, n) => { for (const re of SECRET_PATTERNS) if (re.test(line) && !/REDACTED|<[^>]+>|example|xxxx|\.\.\.|…/i.test(line)) fail(`${file}:${n + 1}: looks like a secret (${re})`); });
}

// removed features + non-OpenAI providers: only in the ACTIVE docs (what Codex and the team read on the day)
const ACTIVE = (f) => /^(PLAN\.md|README\.md|prompts\/|docs\/specs\/|docs\/day\/|docs\/pitch\/|docs\/board\/|docs\/COOKBOOK\.md|docs\/budget-and-priority\.md|docs\/competition-plan\/templates\/)/.test(f) && !f.endsWith('PLAN-HANDOFF.md');
const REMOVED = /\bF(19|20|25|28|29|32|33|34)\b/;
const REMOVAL_NOTE = /ตัด|เลิกใช้|ไม่ทำ|ไม่มี|ไม่ port|removed|retired|cut from scope|out of scope|not renumbered|Retired|OUT\b|ห้าม|no feature|gone/i;
const PROVIDERS = /\b(Bedrock|Gemini|Vertex|Cohere|OpenRouter|Qwen|DashScope|DeepInfra|Grok|xAI|Cartesia|ElevenLabs|MiniMax|Mistral|Llama|Typhoon)\b/;
const PROVIDER_NOTE = /ห้าม|ไม่ใช้|ไม่มี|ไม่ port|แทน|เดิม|do not|never|not used|no other|instead|replace|→|vs |เทียบ|benchmark|FahMai|forbidden/i;
for (const file of listed.filter(ACTIVE)) {
  if (!/\.(md|ts|csv|example|toml|json|ps1)$/.test(file)) continue;
  let heading = '';
  read(file).split('\n').forEach((line, n) => {
    if (/^#{1,6}\s/.test(line)) heading = line;
    if (REMOVED.test(line) && REMOVAL_NOTE.test(heading)) return; // inside a "removed from scope" section
    if (REMOVED.test(line) && !REMOVAL_NOTE.test(line)) fail(`${file}:${n + 1}: removed feature referenced without a removal note: ${line.trim().slice(0, 110)}`);
    if (PROVIDERS.test(line) && !PROVIDER_NOTE.test(line)) fail(`${file}:${n + 1}: non-OpenAI AI provider mentioned without a "do not use" note: ${line.trim().slice(0, 110)}`);
  });
}

// ---------- report ----------
console.log('Per-person balance (midpoint minutes from feature-backlog.csv):');
for (const b of balance) console.log(`  ${b.person}: ${b.lanes}  = ${b.total}  (${b.dev >= 0 ? '+' : ''}${b.dev.toFixed(1)}% vs mean ${mean.toFixed(1)})`);
console.log(`Features: ${FEATURES.length} · markdown files: ${mdFiles.length} · relative links checked: ${linkCount} · files scanned for secrets: ${listed.length}`);
for (const w of warns) console.log('WARN  ' + w);
if (fails.length) {
  const show = VERBOSE ? fails : fails.slice(0, 80);
  for (const f of show) console.log('FAIL  ' + f);
  if (show.length < fails.length) console.log(`… ${fails.length - show.length} more (run with --verbose)`);
  console.log(`\n${fails.length} FAIL, ${warns.length} WARN`);
  process.exit(1);
}
console.log(`\nALL CHECKS PASSED (${warns.length} WARN)`);
