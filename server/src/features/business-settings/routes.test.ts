import { randomUUID } from 'node:crypto';
import { SEED } from '@nless/shared/core/fixtures';
import { describe, expect, it } from 'vitest';
import { db } from '../../core';
import { createTestAgent, loginAs } from '../../core/test-utils';
import { getBusinessSettings } from './service';

const demoA = SEED.businesses.find(({ alias }) => alias === 'biz_demo_a')!;
const demoB = SEED.businesses.find(({ alias }) => alias === 'biz_demo_b')!;
const ownerA = SEED.users.find(({ alias }) => alias === 'owner_a')!;
const staffA = SEED.users.find(({ alias }) => alias === 'staff_a')!;
const staffB = SEED.users.find(({ alias }) => alias === 'staff_b')!;
const settingsPath = (businessId: string) => '/api/v1/businesses/' + businessId + '/settings';
const toggleAction = 'business-settings.ai.toggle';

async function login(email: string) {
  const agent = await createTestAgent();
  await loginAs(agent, email);
  return agent;
}

async function newBusiness() {
  const accountId = randomUUID();
  const businessId = randomUUID();
  await db.tx(async (tx) => {
    await tx.query('INSERT INTO accounts (id,name,owner_user_id) VALUES ($1,$2,$3)',
      [accountId, 'Settings route test account', ownerA.id]);
    await tx.query("INSERT INTO businesses (id,account_id,name,language) VALUES ($1,$2,$3,'en')",
      [businessId, accountId, 'Settings route test business']);
    await tx.query("INSERT INTO memberships (business_id,user_id,role) VALUES ($1,$2,'owner'),($1,$3,'staff')",
      [businessId, ownerA.id, staffA.id]);
  });
  return { accountId, businessId };
}

describe('F04 business settings', () => {
  it('returns the exact contract for the seeded business', async () => {
    await expect(getBusinessSettings(demoA.id)).resolves.toEqual({
      businessId: demoA.id,
      aiEnabled: true,
      timezone: 'Asia/Bangkok',
      hours: demoA.settings.hours,
      answerPolicy: null,
      language: 'th',
      version: 1,
    });
  });

  it('returns NOT_FOUND for an unknown business', async () => {
    await expect(getBusinessSettings(randomUUID())).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('uses defaults for an unconfigured business and keeps its configured language', async () => {
    const { businessId } = await newBusiness();
    await expect(getBusinessSettings(businessId)).resolves.toEqual({
      businessId,
      aiEnabled: true,
      timezone: 'Asia/Bangkok',
      hours: demoB.settings.hours,
      answerPolicy: null,
      language: 'en',
      version: 1,
    });
  });

  it('persists a toggle, audits the actual change once and can re-enable it', async () => {
    const { businessId } = await newBusiness();
    const owner = await login(ownerA.email);
    const path = settingsPath(businessId);
    const putAi = (enabled: boolean) => owner.put(path + '/ai').set('X-Requested-With', 'nless').send({ enabled });

    const off = await putAi(false);
    expect(off.status).toBe(200);
    expect(off.body.data).toMatchObject({ aiSwitch: false, settings: { aiEnabled: false, version: 2 } });
    await expect(getBusinessSettings(businessId)).resolves.toMatchObject({ aiEnabled: false, version: 2 });

    const repeated = await putAi(false);
    expect(repeated.status).toBe(200);
    expect(repeated.body.data.settings.version).toBe(2);
    const reload = await owner.get(path);
    expect(reload.status).toBe(200);
    expect(reload.body.data).toEqual(repeated.body.data);

    const audits = await db.query('SELECT actor_user_id, target_type, target_id, details FROM audit_events WHERE business_id=$1 AND action=$2',
      [businessId, toggleAction]);
    expect(audits.rows).toEqual([{
      actor_user_id: ownerA.id,
      target_type: 'business',
      target_id: businessId,
      details: { from: true, to: false },
    }]);

    const on = await putAi(true);
    expect(on.status).toBe(200);
    await expect(getBusinessSettings(businessId)).resolves.toMatchObject({ aiEnabled: true, version: 3 });
  });

  it('keeps the bot silent when the business or account is suspended', async () => {
    const { accountId, businessId } = await newBusiness();
    await db.query("UPDATE businesses SET status='suspended' WHERE id=$1", [businessId]);
    await expect(getBusinessSettings(businessId)).resolves.toMatchObject({ aiEnabled: false });
    await db.query("UPDATE businesses SET status='active' WHERE id=$1", [businessId]);
    await db.query("UPDATE accounts SET status='suspended' WHERE id=$1", [accountId]);
    await expect(getBusinessSettings(businessId)).resolves.toMatchObject({ aiEnabled: false });
  });

  it('requires business.read for GET and business.bot_settings for PUT', async () => {
    const { businessId } = await newBusiness();
    const staff = await login(staffA.email);
    expect((await staff.get(settingsPath(demoA.id))).status).toBe(200);

    const deniedRead = await staff.get(settingsPath(businessId));
    expect(deniedRead.status).toBe(403);
    expect(deniedRead.body.error.code).toBe('PERMISSION_DENIED');

    const deniedToggle = await staff.put(settingsPath(demoA.id) + '/ai')
      .set('X-Requested-With', 'nless').send({ enabled: false });
    expect(deniedToggle.status).toBe(403);
    expect(deniedToggle.body.error.code).toBe('PERMISSION_DENIED');
  });

  it('returns NOT_FOUND for cross-tenant settings and leaves the other switch unchanged', async () => {
    const owner = await login(ownerA.email);
    const staff = await login(staffB.email);
    const before = await getBusinessSettings(demoB.id);
    const responses = await Promise.all([
      owner.get(settingsPath(demoB.id)),
      owner.put(settingsPath(demoB.id) + '/ai').set('X-Requested-With', 'nless').send({ enabled: false }),
      staff.get(settingsPath(demoA.id)),
    ]);
    for (const response of responses) {
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    }
    await expect(getBusinessSettings(demoB.id)).resolves.toEqual(before);
  });

  it('returns a validation error for a non-boolean switch value', async () => {
    const owner = await login(ownerA.email);
    const response = await owner.put(settingsPath(demoA.id) + '/ai')
      .set('X-Requested-With', 'nless').send({ enabled: 'false' });
    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: { issues: expect.arrayContaining([expect.objectContaining({ path: 'enabled' })]) },
    });
  });
});
