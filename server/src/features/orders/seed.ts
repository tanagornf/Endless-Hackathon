import type { FeatureSeed } from '../../core';

export default {
  featureId: 'F13',
  dependsOn: ['core'],
  async run({ db, fixtures, id }) {
    for (const business of fixtures.businesses) {
      const rule = business.shipping;
      await db.query(`INSERT INTO order_settings (business_id,shipping_kind,shipping_fee_minor,free_from_subtotal_minor)
        VALUES ($1,$2,$3,$4) ON CONFLICT (business_id) DO NOTHING`,
      [id(business.alias), rule.kind, rule.feeMinor, rule.kind === 'threshold' ? rule.freeFromSubtotalMinor : null]);
    }
  },
} satisfies FeatureSeed;
