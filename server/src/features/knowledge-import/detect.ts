import type { CatalogField, DetectedMapping, FaqField, ImportMapping } from '@nless/shared/features/knowledge-import/types';

const synonyms: Record<CatalogField | FaqField, readonly string[]> = {
  sku: ['sku', 'รหัสสินค้า', 'รหัส', 'code', 'itemcode', 'productcode', 'รหัสsku'],
  name: ['name', 'productname', 'itemname', 'ชื่อสินค้า', 'ชื่อ', 'สินค้า', 'รายการ', 'ชื่อรายการ', 'title'],
  nameEn: ['nameen', 'englishname', 'ชื่ออังกฤษ', 'ชื่อภาษาอังกฤษ'],
  description: ['description', 'desc', 'รายละเอียด', 'คำอธิบาย', 'รายละเอียดสินค้า'],
  category: ['category', 'หมวดหมู่', 'หมวด', 'ประเภท', 'กลุ่มสินค้า'],
  price: ['price', 'unitprice', 'ราคา', 'ราคาขาย', 'ราคาต่อหน่วย', 'ราคาบาท', 'pricethb'],
  unit: ['unit', 'หน่วย', 'หน่วยนับ'],
  stock: ['stock', 'qty', 'quantity', 'สต็อก', 'สต๊อก', 'จำนวน', 'คงเหลือ', 'จำนวนคงเหลือ'],
  durationMinutes: ['duration', 'durationminutes', 'ระยะเวลา', 'นาที', 'เวลานาที'],
  question: ['question', 'q', 'คำถาม', 'หัวข้อ', 'หัวข้อคำถาม'],
  answer: ['answer', 'a', 'คำตอบ', 'เนื้อหา', 'content'],
  folder: ['folder', 'โฟลเดอร์', 'หมวดความรู้'],
};
const normalized = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[\s_\-.:*()฿]+/gu, '');

const fields = (Object.entries(synonyms) as [CatalogField | FaqField, readonly string[]][])
  .map(([field, names]) => ({ field, names: names.map(normalized) }));

export const requiredFields = {
  catalog: ['sku', 'name', 'price'],
  faq: ['question', 'answer'],
} as const;

export function detectMapping(header: readonly string[]): DetectedMapping {
  const matched = new Map<CatalogField | FaqField, number>();
  const used = new Set<number>();
  const cells = header.map(normalized);

  for (const exact of [true, false]) {
    for (const [column, cell] of cells.entries()) {
      if (!cell || used.has(column)) continue;
      const matches = fields.flatMap(({ field, names }) => names.filter((name) =>
        exact ? name === cell : name.length >= 4 && cell.includes(name)).map(name => ({ field, size: name.length })));
      matches.sort((a, b) => b.size - a.size);
      let field = matches[0]?.field;
      if (field === 'name' && /eng?$/u.test(cell)) field = 'nameEn';
      if (!field || matched.has(field)) continue;
      matched.set(field, column);
      used.add(column);
    }
  }

  const mapping: Required<ImportMapping> = { catalog: {}, faq: {} };
  for (const [field, position] of matched) {
    if (field === 'question' || field === 'answer' || field === 'folder') mapping.faq[field] = position;
    else mapping.catalog[field] = position;
  }
  const target = mapping.faq.question !== undefined && mapping.faq.answer !== undefined
    ? 'faq'
    : mapping.catalog.price !== undefined && (mapping.catalog.sku !== undefined || mapping.catalog.name !== undefined)
      ? 'catalog' : null;
  const high = target === 'faq' || (target === 'catalog' && requiredFields.catalog.every(field => mapping.catalog[field] !== undefined));
  return { target, mapping, confidence: high ? 'high' : 'low' };
}
