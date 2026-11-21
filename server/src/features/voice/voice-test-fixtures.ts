import { randomInt } from 'node:crypto';
import { afterEach } from 'vitest';
import { db, encryptSecret } from '../../core';

const testConnections = new Map<string, string>();

afterEach(async () => {
  for (const [businessId, connectionId] of testConnections) {
    await db.query('DELETE FROM line_connections WHERE id = $1 AND business_id = $2', [connectionId, businessId]);
  }
  testConnections.clear();
});

export async function seedActiveVoiceConnection(businessId: string, lineBot: string) {
  if (testConnections.has(businessId)) return;
  const connection = await db.one<{ id: string }>(`
    INSERT INTO line_connections (business_id, channel_id, bot_user_id, channel_secret_enc)
    VALUES ($1, $2, $3, $4) RETURNING id
  `, [businessId, String(randomInt(100_000_000, 999_999_999)), lineBot, encryptSecret('synthetic-voice-connection')]);
  testConnections.set(businessId, connection.id);
}
