import type { FeatureSeed, SeedContext } from '../../core';

export default {
  featureId: 'F31',
  dependsOn: ['core'],
  async run() {},
} satisfies FeatureSeed;

export async function runDemo({ db, id }: SeedContext): Promise<void> {
  const businessId = id('biz_demo_a');
  const owner = id('owner_a');
  const staff = id('staff_a');
  await db.query(
    'INSERT INTO notifications (business_id,user_id,type,title,body,link,dedup_key,read_at,created_at) VALUES'
    + " ($1,$2,'chat.handoff','ลูกค้าต้องการคุยกับพนักงาน','A Customer One',$4,'demo:1:owner_a',NULL,now()-interval '10 minutes'),"
    + " ($1,$2,'order.created','มีออเดอร์ใหม่ #DEMO-1',NULL,NULL,'demo:2:owner_a',NULL,now()-interval '2 hours'),"
    + " ($1,$2,'report','นำเข้าข้อมูลเสร็จแล้ว',NULL,NULL,'demo:3:owner_a',now(),now()-interval '1 day'),"
    + " ($1,$3,'chat.handoff','ลูกค้าต้องการคุยกับพนักงาน','A Customer One',$4,'demo:1:staff_a',NULL,now()-interval '10 minutes')"
    + ' ON CONFLICT (user_id,dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING',
    [businessId, owner, staff, '/chat?c=' + id('conv_a_staff')],
  );
}

export async function resetDemo(ctx: SeedContext): Promise<void> {
  const businesses = [ctx.id('biz_demo_a'), ctx.id('biz_demo_b')];
  const users = ctx.fixtures.users.map(({ id }) => id);
  await ctx.db.query('DELETE FROM notifications WHERE business_id = ANY($1::uuid[]) AND user_id = ANY($2::uuid[])', [businesses, users]);
}
