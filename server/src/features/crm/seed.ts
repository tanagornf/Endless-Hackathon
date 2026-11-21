import type { FeatureSeed } from '../../core';

export default {
  featureId: 'F24', dependsOn: ['core'],
  async run({ db, fixtures, id }) {
    await db.tx(async tx => {
      for (const tag of fixtures.tags) {
        const businessId = id(tag.businessAlias);
        const owner = fixtures.memberships.find(m => m.businessAlias === tag.businessAlias && m.role === 'owner');
        await tx.query(`INSERT INTO crm_tags(id,business_id,name,name_key,color,created_by)
          VALUES($1,$2,$3,$4,'amber',$5) ON CONFLICT DO NOTHING`, [tag.id, businessId, tag.name, tag.name.toLowerCase(), owner ? id(owner.userAlias) : null]);
        for (const alias of tag.customerAliases) {
          await tx.query(`INSERT INTO crm_customer_tags(business_id,person_id,tag_id,source,added_by)
            SELECT $1,$2,t.id,'manual',$4 FROM crm_tags t WHERE t.id=$3 AND t.business_id=$1 ON CONFLICT DO NOTHING`,
            [businessId, id(alias), tag.id, owner ? id(owner.userAlias) : null]);
        }
      }
      for (const customer of fixtures.customers) {
        if (customer.consent === 'unknown') continue;
        await tx.query(`INSERT INTO crm_consents(business_id,person_id,status,source) VALUES($1,$2,$3,'seed') ON CONFLICT DO NOTHING`,
          [id(customer.businessAlias), customer.id, customer.consent]);
      }
    });
  },
} satisfies FeatureSeed;
