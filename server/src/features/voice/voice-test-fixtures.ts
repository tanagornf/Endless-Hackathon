import { randomInt } from 'node:crypto';
import { db } from '../../core';

export async function seedActiveVoiceConnection(businessId: string, lineBot: string) {
  await db.query(`
    INSERT INTO line_connections (business_id, channel_id, bot_user_id, channel_secret_enc)
    VALUES ($1, $2, $3, 'synthetic-not-used-by-voice')
    ON CONFLICT (business_id) WHERE status IN ('active','error')
    DO UPDATE SET bot_user_id = excluded.bot_user_id, channel_secret_enc = excluded.channel_secret_enc, status = 'active'
  `, [businessId, String(randomInt(100_000_000, 999_999_999)), lineBot]);
}
