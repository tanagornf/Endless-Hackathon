import type { FeatureSeed, SeedContext } from '../../core';

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


export async function runDemo({ db, id }: SeedContext): Promise<void> {
  const reason = 'ปิดปีใหม่ (ข้อมูลสาธิต)';
  await db.query(
    "INSERT INTO business_closures (business_id,start_date,end_date,reason) SELECT $1,'2026-12-31','2027-01-02',$2 " +
    'WHERE NOT EXISTS (SELECT 1 FROM business_closures WHERE business_id=$1 AND reason=$2)',
    [id('biz_demo_a'), reason],
  );
}

export async function resetDemo({ db, fixtures }: SeedContext): Promise<void> {
  await db.tx(async (tx) => {
    for (const business of fixtures.businesses) {
      await tx.query(
        "UPDATE business_settings SET ai_enabled=true,answer_policy=NULL,capabilities='{}'::jsonb,hours=$2::jsonb, " +
        'version=version+1,updated_at=now() WHERE business_id=$1',
        [business.id, JSON.stringify(business.settings.hours)],
      );
      await tx.query('DELETE FROM business_closures WHERE business_id=$1', [business.id]);
    }
  });
}
