import { randomInt } from 'node:crypto';
import { SEED } from '@nless/shared/core/fixtures';
import { expect, test, vi } from 'vitest';
import { config, db } from '../../core';
import { bootstrapLineConnection, connect } from './connection';

const provider = vi.hoisted(() => vi.fn());
vi.mock('./lineApi', () => ({ lineRequest: provider }));

test('scheduled bootstrap leaves the demo shop disconnected even when its configured OA differs', async () => {
  const businessId = SEED.businesses.find((shop) => shop.alias === 'biz_demo_a')!.id;
  const previous = {
    LINE_MODE: config.LINE_MODE,
    LINE_CHANNEL_ID: config.LINE_CHANNEL_ID,
    LINE_CHANNEL_SECRET: config.LINE_CHANNEL_SECRET,
    LINE_CHANNEL_ACCESS_TOKEN: config.LINE_CHANNEL_ACCESS_TOKEN,
  };
  const formerChannel = String(randomInt(100_000_000, 499_999_999));
  const configuredChannel = String(randomInt(500_000_000, 999_999_999));
  const credentials = { channelId: configuredChannel, channelSecret: 'a'.repeat(32), accessToken: 'b'.repeat(64) };
  provider.mockResolvedValue({ status: 200, body: { userId: 'Ufixture', basicId: '@fixture', displayName: 'Fixture OA' } });
  await db.query(
    "INSERT INTO line_connections (business_id, channel_id, display_name, source, status, status_reason, disconnected_at) VALUES ($1, $2, 'Fixture prior OA', 'ui', 'inactive', 'disconnected', now())",
    [businessId, formerChannel],
  );
  Object.assign(config, {
    LINE_MODE: 'real',
    LINE_CHANNEL_ID: configuredChannel,
    LINE_CHANNEL_SECRET: credentials.channelSecret,
    LINE_CHANNEL_ACCESS_TOKEN: credentials.accessToken,
  });

  try {
    await bootstrapLineConnection();
    expect(provider).not.toHaveBeenCalled();

    // The transaction guard also protects against a stale bootstrap precheck.
    const suppressed = await connect(businessId, null, credentials, 'env');
    expect(suppressed).toMatchObject({ connected: false, status: 'inactive', statusReason: 'disconnected' });
    expect(await db.maybeOne('SELECT 1 FROM line_connections WHERE business_id = $1 AND channel_id = $2', [businessId, configuredChannel])).toBeNull();

    const reconnected = await connect(businessId, null, credentials, 'ui');
    expect(reconnected).toMatchObject({ connected: true, status: 'active', channelId: configuredChannel, source: 'ui' });
  } finally {
    Object.assign(config, previous);
    await db.query('DELETE FROM line_connections WHERE business_id = $1 AND channel_id IN ($2, $3)', [businessId, formerChannel, configuredChannel]);
  }
});
