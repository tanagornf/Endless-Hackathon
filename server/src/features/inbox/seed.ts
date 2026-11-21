import type { FeatureSeed, SeedContext } from '../../core';

const demoSettings = [
  {
    alias: 'biz_demo_a', slug: 'demo-boardgame',
    welcome: 'สวัสดีค่ะ ยินดีต้อนรับสู่ Demo Boardgame Shop ลองถามเรื่องเกม ราคา หรือเวลาเปิดร้านได้เลยนะคะ',
    welcomeEn: 'Hi! Welcome to Demo Boardgame Shop. Ask about games, prices or opening hours.',
    prompts: ['A-GAME-01 ราคาเท่าไหร่คะ', 'ร้านเปิดกี่โมงคะ', 'ค่าส่งเท่าไหร่คะ'],
    promptsEn: ['How much is A-GAME-01?', 'What time do you open?', 'How much is shipping?'],
  },
  {
    alias: 'biz_demo_b', slug: 'demo-repair',
    welcome: 'สวัสดีครับ ยินดีต้อนรับสู่ Demo Repair Studio ถามเรื่องบริการหรือราคาได้เลยครับ',
    welcomeEn: 'Hi! Welcome to Demo Repair Studio. Ask about our services or prices.',
    prompts: ['B-KIT-01 ราคาเท่าไหร่ครับ', 'เปิดวันไหนบ้างครับ'],
    promptsEn: ['How much is B-KIT-01?', 'Which days are you open?'],
  },
];

export default {
  featureId: 'F09',
  dependsOn: ['core'],
  async run(ctx) {
    for (const shop of demoSettings) {
      await ctx.db.query(`INSERT INTO demo_chat_settings (
        business_id,enabled,public_slug,welcome_text,welcome_text_en,suggested_questions,suggested_questions_en)
        VALUES ($1,true,$2,$3,$4,$5,$6) ON CONFLICT (business_id) DO NOTHING`,
      [ctx.id(shop.alias), shop.slug, shop.welcome, shop.welcomeEn, shop.prompts, shop.promptsEn]);
    }
  },
} satisfies FeatureSeed;

export async function resetDemo(ctx: SeedContext) {
  const businessIds = demoSettings.map(({ alias }) => ctx.id(alias));
  await ctx.db.tx(async (tx) => {
    await tx.query(`DELETE FROM customers WHERE business_id=ANY($1::uuid[])
      AND (external_id LIKE 'demo-visitor:%' OR external_id LIKE 'demo:%' OR external_id LIKE 'seed-demo:%')`, [businessIds]);
    await tx.query('DELETE FROM demo_chat_daily_turns WHERE business_id=ANY($1::uuid[])', [businessIds]);
  });
}
