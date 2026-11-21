import { describe, expect, it } from 'vitest';
import { parseEvidence, resolveStatus, parseCsv, toCsv } from './evidence-parse';

const columns = '| lane | actual_mode | feature_id | slug | target_mode | status | commit_sha | tests_evidence | checked_at_bangkok | blocker |';
const separator = '|---|---|---|---|---|---|---|---|---|---|';
const table = (...rows: string[]) => ['# Evidence', '## Status', columns, separator, ...rows].join('\n');
const approved = '| A2 | S | F14 | payments | S | DONE | abcdef1 | 12 tests passed \\| account scoped | 2026-11-21 15:28 | bank unverified |';
const template = { feature_id: 'F14', slug: 'payments', lane: 'A2', target_mode: 'S', provider_gate: '' };

describe('release status evidence', () => {
  it('reads columns by label, escaped pipes, and independent evidence links', () => {
    const source = table(approved) + '\n## Evidence links\n- provider: Synthetic sandbox.\n- trace: docs/example.json\n## Other\n- provider: Ignore.';
    const parsed = parseEvidence(source, 'F14', 'payments');
    expect(parsed?.primary.tests_evidence).toBe('12 tests passed | account scoped');
    expect(parsed?.links).toEqual({ trace: 'docs/example.json', provider: 'Synthetic sandbox.' });
    expect(resolveStatus(template, parsed, () => true)).toMatchObject({ actual_mode: 'S', commit_sha: 'abcdef1' });
  });

  it('uses the lowest evidenced submode and applies payment and Meta limits', () => {
    const extra = '| A2 | A | F14 | payments vision | S | DOING | | 4 tests passed | 2026-11-21 15:22 | no provider receipt |';
    expect(resolveStatus(template, parseEvidence(table(approved, extra), 'F14', 'payments'), () => true))
      .toMatchObject({ actual_mode: 'A', tests_evidence: expect.stringContaining('sub: payments vision 4 tests passed') });
    const declaredReal = approved.replace('| S | F14', '| R | F14');
    expect(resolveStatus(template, parseEvidence(table(declaredReal), 'F14', 'payments'), () => true).actual_mode).toBe('S');
    const meta = { ...template, feature_id: 'F18', slug: 'meta', lane: 'C2' };
    expect(resolveStatus(meta, parseEvidence(table(declaredReal.replace('F14 | payments', 'F18 | meta').replace('A2 |', 'C2 |')), 'F18', 'meta'), () => true))
      .toMatchObject({ actual_mode: 'A', blocker: expect.stringContaining('no provider evidence') });
  });

  it('downgrades unmerged claims, missing tests and unchecked dates without raising legacy modes', () => {
    expect(resolveStatus(template, parseEvidence(table(approved), 'F14', 'payments'), () => false))
      .toMatchObject({ actual_mode: 'A', blocker: expect.stringContaining('commit not on main') });
    expect(resolveStatus(template, parseEvidence(table(approved.replace('12 tests passed \\| account scoped', 'looks complete')), 'F14', 'payments'), () => true))
      .toMatchObject({ actual_mode: 'A', blocker: expect.stringContaining('no test evidence') });
    expect(resolveStatus(template, parseEvidence(table(approved.replace('15:28', '18:00')), 'F14', 'payments'), () => true))
      .toMatchObject({ actual_mode: 'A', blocker: expect.stringContaining('out-of-window') });
    expect(resolveStatus(template, null, () => true)).toMatchObject({ actual_mode: 'U', status: 'UNIMPLEMENTED' });
    expect(parseEvidence('| ID | Status | Target mode | Actual mode |\n|---|---|---|---|\n| F01 | DOING | R | A |\n| F35 | DOING | R | U |', 'F35', 'core/jobs')?.primary.actual_mode).toBe('U');
  });

  it('round-trips quoted UTF-8, commas and line breaks in CSV', () => {
    const data = [['feature_id', 'tests_evidence'], ['F01', 'สวัสดี, "English"\ncontinued']];
    expect(parseCsv(toCsv(data))).toEqual(data);
  });
});
