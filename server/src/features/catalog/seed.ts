import type { FeatureSeed } from '../../core';
import { catalogKey } from './sku';

const units: Record<string, string> = {
  'A-GAME-01': 'ชิ้น', 'A-CARD-01': 'ชุด', 'A-SOLD-01': 'ชิ้น', 'A-SERVICE-01': 'ครั้ง',
  'B-KIT-01': 'ชุด', 'B-SERVICE-01': 'ครั้ง',
};
const categories: Record<string, string> = {
  'A-GAME-01': 'เกมกระดาน', 'A-CARD-01': 'การ์ด', 'A-SOLD-01': 'เกมกระดาน', 'A-SERVICE-01': 'บริการ',
  'B-KIT-01': 'อุปกรณ์', 'B-SERVICE-01': 'บริการ',
};
const descriptions: Record<string, string> = {
  'A-GAME-01': 'เกมกระดานสำหรับเล่นกับเพื่อนและครอบครัว',
  'A-CARD-01': 'ชุดการ์ดเกมสำหรับเล่นเป็นกลุ่ม',
  'A-SOLD-01': 'เกมกระดานจากร้านตัวอย่าง',
  'A-SERVICE-01': 'บริการสอนกติกาและพาเริ่มเล่นเกม',
  'B-KIT-01': 'ชุดอุปกรณ์สำหรับซ่อมเบื้องต้น',
  'B-SERVICE-01': 'บริการช่วยตั้งค่าอุปกรณ์',
};

export default {
  featureId: 'F08',
  dependsOn: ['core'],
  async run({ db, fixtures, id, log }) {
    await db.tx(async (tx) => {
      for (const entry of fixtures.catalog) {
        const itemId = id(entry.alias);
        const businessId = id(entry.businessAlias);
        await tx.query(
          'INSERT INTO catalog_items (id,business_id,sku,kind,name,name_en,description,category,price_minor,unit,stock,shippable,duration_minutes,version,source) ' +
          "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'seed') ON CONFLICT (id) DO NOTHING",
          [itemId, businessId, entry.sku, entry.kind, entry.name, entry.nameEn, descriptions[entry.sku],
            categories[entry.sku], entry.priceMinor, units[entry.sku], entry.stock, entry.shippable, entry.durationMinutes, entry.version],
        );
        await tx.query(
          'INSERT INTO catalog_sku_registry (business_id,sku_key,item_id) ' +
          'SELECT business_id,$3,id FROM catalog_items WHERE business_id=$1 AND id=$2 AND sku=$4 AND deleted_at IS NULL ON CONFLICT DO NOTHING',
          [businessId, itemId, catalogKey(entry.sku), entry.sku],
        );
        for (const [position, variant] of entry.variants.entries()) {
          await tx.query('INSERT INTO catalog_variants (id,business_id,item_id,name,name_key,position) ' +
            'VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',
          [variant.id, businessId, itemId, variant.name, catalogKey(variant.name), position]);
        }
        await tx.query(
          'INSERT INTO catalog_price_history (business_id,item_id,version,new_price_minor) ' +
          'SELECT $1,$2,$3,$4 WHERE NOT EXISTS (SELECT 1 FROM catalog_price_history WHERE business_id=$1 AND item_id=$2 AND version=$3 AND variant_id IS NULL)',
          [businessId, itemId, entry.version, entry.priceMinor],
        );
      }
    });
    log('catalog: ' + fixtures.catalog.length + ' items');
  },
} satisfies FeatureSeed;
