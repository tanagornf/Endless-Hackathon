import { config, encryptSecret, type FeatureSeed } from '../../core';
import { normalizePromptPayId } from './promptpay';
export default {featureId:'F14',dependsOn:['core','orders'],async run({db,fixtures,id}) {
  const digits=normalizePromptPayId('mobile',config.PROMPTPAY_TEST_ID || '0812345678');
  for(const shop of fixtures.businesses) {
    await db.query(`INSERT INTO payment_settings (business_id,promptpay_kind,promptpay_id_enc,promptpay_masked,receiver_name,include_reference,validated_at)
      VALUES ($1,'mobile',$2,$3,$4,false,now()) ON CONFLICT (business_id) DO NOTHING`,
      [id(shop.alias),encryptSecret(digits),'xxx-xxx-'+digits.slice(-4),shop.name]);
  }
}} satisfies FeatureSeed;
