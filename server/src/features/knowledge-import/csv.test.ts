import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv';

describe('F06 CSV import', () => {
  it.each([',', ';', '\t'] as const)('detects delimiter %j in the header', (delimiter) => {
    const parsed = parseCsv('รหัส' + delimiter + 'ราคา\nA-1' + delimiter + '1490');
    expect(parsed).toEqual({
      delimiter, header: ['รหัส', 'ราคา'], rows: [{ rowNo: 2, raw: ['A-1', '1490'] }],
    });
  });

  it('ignores quoted delimiters, preserves escaped quotes and multi-line cells', () => {
    const parsed = parseCsv('\uFEFF"Item, with ""comma,,,""";Notes\r\nA;"first\nsecond"\r\nB;next');
    expect(parsed.delimiter).toBe(';');
    expect(parsed.header).toEqual(['Item, with "comma,,,"', 'Notes']);
    expect(parsed.rows).toEqual([{ rowNo: 2, raw: ['A', 'first\nsecond'] }, { rowNo: 3, raw: ['B', 'next'] }]);
  });

  it('honors a delimiter override and accepts ragged data', () => {
    const parsed = parseCsv('Name, english;Qty,units\nA\nB;20;extra\n', { delimiter: ';' });
    expect(parsed.header).toEqual(['Name, english', 'Qty,units']);
    expect(parsed.rows).toEqual([{ rowNo: 2, raw: ['A'] }, { rowNo: 3, raw: ['B', '20', 'extra'] }]);
  });

  it('keeps original spreadsheet row numbers while skipping empty and whitespace-only records', () => {
    expect(parseCsv('name,qty\n\nA,1\n , \nB,2\n').rows).toEqual([
      { rowNo: 3, raw: ['A', '1'] }, { rowNo: 5, raw: ['B', '2'] },
    ]);
  });

  it('retains at most 30 columns and 500 code points per raw cell or heading', () => {
    const value = '🎲'.repeat(501);
    const wide = Array<string>(32).fill(value).join(',');
    const result = parseCsv(wide + '\n' + wide);
    for (const cells of [result.header, result.rows[0].raw]) {
      expect(cells).toHaveLength(30);
      expect(cells[0]).toBe('🎲'.repeat(500));
    }
  });

  it('accepts exactly 2,000 data rows and rejects the next nonempty record', () => {
    const atLimit = 'Name\n' + 'A\n'.repeat(2_000);
    expect(parseCsv(atLimit + '\n').rows).toHaveLength(2_000);
    expect(() => parseCsv(atLimit + 'B')).toThrow(expect.objectContaining({ details: { reason: 'too_many_rows' } }));
  });

  it('reports empty input and broken quoting with actionable reason codes', () => {
    for (const input of ['', 'header\n\n', ',\n,\n']) {
      expect(() => parseCsv(input)).toThrow(expect.objectContaining({ details: { reason: 'empty_file' } }));
    }
    expect(() => parseCsv('name\n"not closed')).toThrow(expect.objectContaining({ details: { reason: 'csv_unparsable' } }));
  });
});
