export type ReleaseMode = 'R' | 'S' | 'A' | 'U';
type EvidenceFields = Record<string, string>;
interface Evidence {
  primary: EvidenceFields;
  rows: EvidenceFields[];
  links: { trace: string; provider: string };
}
const modeRank = { U: 0, A: 1, S: 2, R: 3 } as const;
const mode = (value?: string): ReleaseMode => value === 'R' || value === 'S' || value === 'A' ? value : 'U';
const headerKey = (value: string) => value.trim().toLowerCase().replaceAll(/[^a-z0-9]+/g, '_');
const cells = (line: string) => line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/)
  .map((value) => value.trim().replaceAll('\\|', '|'));

function section(text: string, name: string) {
  const lines = text.replaceAll('\r', '').split('\n');
  const start = lines.findIndex((line) => line.trim().toLowerCase() === '## ' + name);
  if (start === -1) return undefined;
  const end = lines.findIndex((line, index) => index > start && /^#{1,2}\s/.test(line));
  return lines.slice(start + 1, end === -1 ? undefined : end);
}

export function parseEvidence(text: string, id: string, slug: string): Evidence | null {
  const table = section(text, 'status') ?? text.split(/\r?\n/);
  const rows: EvidenceFields[] = [];
  for (let index = 0; index < table.length - 1; index++) {
    if (!table[index].trim().startsWith('|')) continue;
    const keys = cells(table[index]).map((key) => headerKey(key) === 'id' ? 'feature_id' : headerKey(key));
    if (!keys.includes('feature_id') || !keys.includes('actual_mode') ||
        !cells(table[index + 1]).every((value) => /^:?-{3,}:?$/.test(value))) continue;
    for (let row = index + 2; row < table.length && table[row].trim().startsWith('|'); row++) {
      const values = cells(table[row]);
      if (values.length !== keys.length) continue;
      const item = Object.fromEntries(keys.map((key, column) => [key, values[column]]));
      if (item.feature_id === id) rows.push(item);
    }
  }
  const primary = rows.find((row) => row.slug === slug) ?? rows.find((row) => !row.slug);
  if (!primary) return null;
  const links = { trace: '', provider: '' };
  for (const line of section(text, 'evidence links') ?? []) {
    const match = /^\s*(?:-\s+)?(trace|provider):\s*(.+)$/i.exec(line);
    if (match) links[match[1].toLowerCase() as keyof typeof links] = match[2].trim();
  }
  return { primary, rows, links };
}

function checkedAt(input = '') {
  const match = /^(2026-11-21) ([0-2]\d:[0-5]\d)(?::[0-5]\d)?(?: ?\+07:00)?$/.exec(input);
  return match && match[2] >= '10:00' && match[2] <= '17:00' ? match[1] + ' ' + match[2] : '';
}

export function resolveStatus(base: EvidenceFields, evidence: Evidence | null, onMain: (sha: string) => boolean): EvidenceFields {
  const display = { ...base, status: 'UNIMPLEMENTED', actual_mode: 'U', commit_sha: '', tests_evidence: '',
    checked_at_bangkok: '', trace_evidence: '', provider_evidence: '', blocker: 'no EVIDENCE.md row' };
  if (!evidence) return display;
  const { primary, rows, links } = evidence;
  const notes = [primary.blocker].filter(Boolean);
  let actual = 'R' as ReleaseMode;
  for (const row of rows) {
    let current = mode(row.actual_mode);
    if (current === 'R' || current === 'S') {
      const reasons = [];
      if (!/^[a-f0-9]{7,40}$/i.test(row.commit_sha ?? '') || !onMain(row.commit_sha)) reasons.push('commit not on main');
      if (!/\d+\s*(?:passed|ผ่าน|tests?)/i.test(row.tests_evidence ?? '')) reasons.push('no test evidence');
      if (!checkedAt(row.checked_at_bangkok)) reasons.push('bad or out-of-window checked_at');
      if (base.feature_id === 'F18' && current === 'R' && !links.provider) reasons.push('no provider evidence');
      if (reasons.length > 0) {
        current = 'A';
        notes.push('downgraded: ' + reasons.join(', '));
      } else if (base.feature_id === 'F14' && current === 'R') {
        current = 'S';
        notes.push('downgraded: payment proof is limited to sandbox');
      }
    }
    if (modeRank[current] < modeRank[actual]) actual = current;
  }
  const tests = [primary.tests_evidence ?? '', ...rows.filter((row) => row !== primary)
    .map((row) => 'sub: ' + [row.slug, row.tests_evidence, row.blocker].filter(Boolean).join(' '))].filter(Boolean);
  const primaryStatus = primary.status === 'ADAPTER' ? 'DOING' : primary.status || 'UNIMPLEMENTED';
  const status = primaryStatus === 'DONE' && modeRank[actual] < modeRank[mode(primary.actual_mode)] ? 'DOING' : primaryStatus;
  return { ...display, status, actual_mode: actual,
    target_mode: primary.target_mode || base.target_mode, provider_gate: primary.provider_gate || base.provider_gate,
    commit_sha: primary.commit_sha ?? '', tests_evidence: tests.join('; '), checked_at_bangkok: checkedAt(primary.checked_at_bangkok),
    trace_evidence: links.trace, provider_evidence: links.provider, blocker: [...new Set(notes)].join(' | ') };
}

export function parseCsv(csv: string) {
  const data: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;
  const source = csv.replace(/^\uFEFF/, '').replaceAll('\r\n', '\n');
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (char === '"' && (!value || quoted)) {
      if (quoted && source[index + 1] === '"') {
        value += '"';
        index++;
      } else quoted = !quoted;
    } else if (!quoted && (char === ',' || char === '\n')) {
      row.push(value);
      value = '';
      if (char === '\n') {
        data.push(row);
        row = [];
      }
    } else value += char;
  }
  if (quoted) throw new Error('Unclosed quoted status cell');
  if (source && !source.endsWith('\n')) data.push([...row, value]);
  return data;
}

export function toCsv(rows: readonly (readonly string[])[]) {
  return rows.map((row) => row.map((value) => '"' + value.replaceAll('"', '""') + '"').join(',')).join('\n') + '\n';
}
