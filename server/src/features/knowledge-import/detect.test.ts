import { describe, expect, it } from 'vitest';
import { detectMapping } from './detect';

describe('F06 detects sheet headings', () => {
  it.each([
    ['รหัสสินค้า', 'ชื่อสินค้า', 'ราคาขาย'],
    ['SKU', 'Product Name', 'Price (THB)'],
    ['Product_Code', 'ชื่อ สินค้า', 'ราคา (บาท)'],
  ])('recognizes the product columns in %s, %s, %s', (...header) => {
    expect(detectMapping(header)).toMatchObject({ target: 'catalog', confidence: 'high', mapping: { catalog: { sku: 0, name: 1, price: 2 } } });
  });

  it('recognizes the English name without stealing the primary name', () => {
    expect(detectMapping(['ชื่อสินค้า(EN)', 'ชื่อสินค้า', 'misc', 'ราคา'])).toMatchObject({
      target: 'catalog', confidence: 'low', mapping: { catalog: { nameEn: 0, name: 1, price: 3 } },
    });
  });

  it('prioritizes a complete Q&A pair and leaves unrecognized columns unassigned', () => {
    expect(detectMapping(['คำถาม', 'คำตอบ', 'SKU', 'Price', ' Other '])).toEqual({
      target: 'faq', confidence: 'high', mapping: { faq: { question: 0, answer: 1 }, catalog: { sku: 2, price: 3 } },
    });
    expect(detectMapping(['misc'])).toEqual({ target: null, confidence: 'low', mapping: { catalog: {}, faq: {} } });
  });
});
