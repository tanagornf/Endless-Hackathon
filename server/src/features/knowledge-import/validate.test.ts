import { describe, expect, it } from 'vitest';
import { checkRows } from './validate';

const catalog = { catalog: { sku: 0, name: 1, price: 2, stock: 3, durationMinutes: 4 } };
const header = ['SKU', 'Name', 'Price', 'Stock', 'Duration'];
const raw = (cells: string[][]) => cells.map((values, index) => ({ rowNo: index + 2, raw: values }));

describe('F06 row validation', () => {
  it.each([['1,490', 149000], ['฿99 บาท', 9900], ['๑๔๙๐', 149000], ['12.5', 1250]])('converts %s using the real catalog parser', (price, expected) => {
    expect(checkRows(raw([['E2E-A1', 'Demo', price]]), header, 'catalog', catalog)[0]).toMatchObject({
      status: 'ready', data: { priceMinor: expected },
    });
  });

  it('keeps the first SKU and rejects invalid prices and stock per row', () => {
    const rows = checkRows(raw([
      ['E2E-A1', 'Demo', '10', '๑๐'], ['e2e-a1', 'Repeat', '10'], ['E2E-A2', 'Bad price', '-2'],
      ['E2E-A3', 'Bad stock', '10', 'x'], ['E2E-A4', 'Teaching', '12', '1', '30'],
    ]), header, 'catalog', catalog);
    expect(rows.map(row => row.status)).toEqual(['ready', 'error', 'error', 'error', 'ready']);
    expect(rows[0].data).toMatchObject({ stock: 10, kind: 'product' });
    expect(rows[1].error).toMatchObject({ column: 'SKU', code: 'sku_duplicate_in_file' });
    expect(rows[2].error).toMatchObject({ column: 'Price', code: 'price_invalid' });
    expect(rows[3].error).toMatchObject({ column: 'Stock', code: 'stock_invalid' });
    expect(rows[4].data).toMatchObject({ durationMinutes: 30, kind: 'service', stock: null });
  });

  it('deduplicates questions after case, space and punctuation normalization', () => {
    const rows = checkRows(raw([['When do you open?', 'We open at 10 AM.'], ['WHEN do you open!', 'We open daily.'], ['When do you close?', 'No']]),
      ['Question', 'Answer'], 'faq', { faq: { question: 0, answer: 1 } });
    expect(rows[0].status).toBe('ready');
    expect(rows[1].error?.code).toBe('question_duplicate_in_file');
    expect(rows[2].error?.code).toBe('answer_invalid');
  });
});
