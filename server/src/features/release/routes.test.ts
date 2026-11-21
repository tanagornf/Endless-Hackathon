import { afterAll, expect, it } from 'vitest';
import { closeDb } from '../../core/db';
import { createTestAgent, loginAs } from '../../core/test-utils';

const route = '/api/v1/release/status';
afterAll(closeDb);

it('keeps release evidence private to platform admins and reconciles live flags', async () => {
  const agent = await createTestAgent();
  await agent.get(route).expect(401);
  const merchant = await createTestAgent();
  await loginAs(merchant, 'owner.a@example.test');
  await merchant.get(route).expect(403);

  const admin = await createTestAgent();
  await loginAs(admin, 'admin@example.test');
  const response = await admin.get(route).expect(200);
  expect(response.body.data).toMatchObject({
    build: { sha: expect.stringMatching(/^[a-f0-9]{7,40}$/), modelMode: 'fake' },
    totals: { R: expect.any(Number), S: expect.any(Number), A: expect.any(Number), U: expect.any(Number) },
    conflicts: expect.any(Array),
  });
  expect(response.body.data.rows).toHaveLength(31);
  expect(response.body.data.flags).toHaveLength(29);
  expect(response.body.data.rows.find((row: { featureId: string }) => row.featureId === 'F18')).toMatchObject({ actualMode: 'U' });
  expect(response.body.data.flags.find((row: { featureId: string }) => row.featureId === 'F18')).toMatchObject({ hidden: true });
  expect(JSON.stringify(response.body)).not.toMatch(/OPENAI_API_KEY|SESSION_SECRET|DATABASE_URL/);
}, 15000);
