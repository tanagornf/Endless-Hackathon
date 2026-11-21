import type { FeatureSeed } from '../../core';

const profiles = {
  biz_demo_a: ['ร้านบอร์ดเกมสังเคราะห์สำหรับสาธิตระบบ', '02-000-0001', 'shop.a@example.test', 'ที่อยู่สมมติ กรุงเทพฯ'],
  biz_demo_b: ['ร้านซ่อมสังเคราะห์สำหรับสาธิตระบบ', '02-000-0002', 'shop.b@example.test', null],
} as const;

export default {
  featureId: 'F04',
  dependsOn: ['core'],
  async run({ db, fixtures }) {
    await db.tx(async (tx) => {
      for (const business of fixtures.businesses) {
        await tx.query(
          'INSERT INTO business_settings (business_id, ai_enabled, hours) VALUES ($1,$2,$3::jsonb) ' +
          'ON CONFLICT (business_id) DO NOTHING',
          [business.id, business.settings.aiEnabled, JSON.stringify(business.settings.hours)],
        );
        if (business.alias !== 'biz_demo_a' && business.alias !== 'biz_demo_b') continue;
        await tx.query(
          'INSERT INTO business_profiles (business_id, description, contact_phone, contact_email, address) ' +
          'VALUES ($1,$2,$3,$4,$5) ON CONFLICT (business_id) DO NOTHING',
          [business.id, ...profiles[business.alias]],
        );
      }
    });
  },
} satisfies FeatureSeed;
