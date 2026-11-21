import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { ReleaseStatusFile } from '@nless/shared/features/release/types';

const rules: [string, RegExp][] = [
  ['bank verification', /ยืนยัน(?:กับ)?ธนาคาร|bank[- ]verified|verified (?:by|with) (?:the )?bank/i],
  ['exactly-once delivery', /exactly[- ]once/i],
  ['unverified scale or SLA', /99\.\d+%|enterprise[- ]grade|ล้านข้อความ|scales? to/i],
  ['excluded channel or history', /whatsapp|line history|ประวัติ line/i],
  ['unsupported compliance', /pdpa[- ]compliant|gdpr|soc ?2|iso ?27001|ผ่านการรับรอง/i],
  ['unsupported ChatGPT selling', /(?:ขาย|listed|live) (?:ใน|on|in) chatgpt|openai (?:อนุมัติ|approved|partner)|ชำระเงิน(?:ใน|ผ่าน) chatgpt|agentic checkout/i],
  ['other AI provider', /\bgemini\b|\bbedrock\b|\bllama\b/i],
  ['unmeasured impact', /เพิ่มยอดขาย \d+%|ลด(?:เวลา|ต้นทุน) \d+%|\d+x faster/i],
  ['unsupported completion', /100% (?:complete|เสร็จ)|ครบทุกฟีเจอร์|fully (?:complete|production)/i],
];

export function scanClaims(text: string, filename: string) {
  const problems: string[] = [];
  let ignored = false;
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (line.trim() === '<!-- claims:ignore -->') { ignored = true; continue; }
    if (line.trim() === '<!-- /claims:ignore -->') { ignored = false; continue; }
    if (ignored) continue;
    for (const [label, pattern] of rules) if (pattern.test(line)) problems.push(filename + ':' + (index + 1) + ' ' + label);
  }
  if (ignored) problems.push(filename + ' has an unclosed claims:ignore block');
  return problems;
}

export function sameStatusTable(readme: string, snapshot: ReleaseStatusFile) {
  const matches = [...readme.matchAll(/^\|\s*(F\d\d)\s*\|[^\n]*?\|\s*([RSAU])\s*\|/gm)];
  if (matches.length !== 31 || snapshot.rows.length !== 31) return false;
  const rows = new Map(matches.map((match) => [match[1], match[2]]));
  return rows.size === 31 && snapshot.rows.every((entry) => rows.get(entry.featureId) === entry.actualMode);
}

function files(path: string, accept: (file: string) => boolean): string[] {
  if (!existsSync(path)) return [];
  if (statSync(path).isFile()) return accept(path) ? [path] : [];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
    entry.isSymbolicLink() ? [] : files(join(path, entry.name), accept));
}

if (import.meta.main) {
  const docs = ['README.md', ...files('docs/submission', (file) => /\.(md|txt)$/i.test(file)),
    ...files('docs/pitch', (file) => /\.(md|txt)$/i.test(file))];
  const i18n = files('web/src', (file) => /[\\/]i18n[\\/][^\\/]+\.json$/i.test(file));
  const problems = [...docs, ...i18n].flatMap((file) => scanClaims(readFileSync(file, 'utf8'), file));
  const artifact = 'server/src/features/release/data/release-status.json';
  if (!existsSync(artifact) || !sameStatusTable(readFileSync('README.md', 'utf8'), JSON.parse(readFileSync(artifact, 'utf8')))) {
    problems.push('README.md: feature modes must match the 31 recorded status rows');
  }
  const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
  const dependencies = { ...manifest.dependencies, ...manifest.devDependencies };
  for (const name of Object.keys(dependencies)) {
    if (/anthropic|google\/generative-ai|bedrock|ollama|replicate/i.test(name)) problems.push('package.json: external AI dependency');
  }
  if (problems.length) {
    for (const problem of problems) console.error(problem);
    process.exitCode = 1;
  } else console.log('Release claims check passed');
}
