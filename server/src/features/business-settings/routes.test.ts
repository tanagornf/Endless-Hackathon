import { randomUUID } from 'node:crypto';
import { SEED } from '@nless/shared/core/fixtures';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from '../../core';
import { createTestAgent, loginAs } from '../../core/test-utils';
import { ensureBusinessSettings, getBusinessProfile, getBusinessSettings, getCapabilities, getEffectiveAnswerRules } from './service';

const demoA = SEED.businesses.find(({ alias }) => alias === 'biz_demo_a')!;
const demoB = SEED.businesses.find(({ alias }) => alias === 'biz_demo_b')!;
const ownerA = SEED.users.find(({ alias }) => alias === 'owner_a')!;
const ownerB = SEED.users.find(({ alias }) => alias === 'owner_b')!;
const staffA = SEED.users.find(({ alias }) => alias === 'staff_a')!;
const staffB = SEED.users.find(({ alias }) => alias === 'staff_b')!;
const settingsPath = (businessId: string) => '/api/v1/businesses/' + businessId + '/settings';
const toggleAction = 'business-settings.ai.toggle';

type TestSession = Awaited<ReturnType<typeof createTestAgent>>;
const sessions = new Map<string, Promise<TestSession>>();
const ownedAccounts: string[] = [];

function login(email: string): Promise<TestSession> {
  const existing = sessions.get(email);
  if (existing) return existing;

  const signedIn = createTestAgent().then(async (agent) => {
    await loginAs(agent, email);
    return agent;
  });
  sessions.set(email, signedIn);
  return signedIn;
}

afterEach(async () => {
  if (ownedAccounts.length) {
    await db.query('DELETE FROM accounts WHERE id=ANY($1::uuid[])', [ownedAccounts.splice(0)]);
  }
});

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
  ownedAccounts.push(accountId);
  return { accountId, businessId };
}

describe('F04 business settings', { timeout: 20_000 }, () => {
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

  it('resolves effective rules from the right business and keeps explicit denials', async () => {
    const { businessId } = await newBusiness();
    await db.query(
      'INSERT INTO business_settings (business_id,hours,answer_policy,capabilities) VALUES ($1,$2::jsonb,$3::jsonb,$4::jsonb)',
      [businessId, JSON.stringify(demoB.settings.hours),
        JSON.stringify({ price: { reveal: 'always' }, stock: { reveal: 'ask_staff' }, booking: { enabled: false } }),
        JSON.stringify({ canQuotePrices: false, canHandoffToHuman: false, canShareContact: false })],
    );

    await expect(getEffectiveAnswerRules(businessId)).resolves.toEqual({
      price: 'never', stock: 'ask_staff', contact: 'never', generalKnowledge: true,
      booking: false, orders: false, handoff: false,
    });
    await expect(getEffectiveAnswerRules(demoB.id)).resolves.toEqual({
      price: 'always', stock: 'always', contact: 'always', generalKnowledge: true,
      booking: true, orders: true, handoff: true,
    });
  });

  it('rejects an unknown business when looking up effective rules', async () => {
    await expect(getEffectiveAnswerRules(randomUUID())).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('fails closed for corrupt persisted answer policy', async () => {
    const { businessId } = await newBusiness();
    await db.query(
      'INSERT INTO business_settings (business_id,hours,answer_policy) VALUES ($1,$2::jsonb,$3::jsonb)',
      [businessId, JSON.stringify(demoB.settings.hours), JSON.stringify({ price: { reveal: 'unknown' } })],
    );
    await expect(getEffectiveAnswerRules(businessId)).resolves.toEqual({
      price: 'never', stock: 'never', contact: 'never', generalKnowledge: false,
      booking: false, orders: false, handoff: true,
    });
  });

  it('fails closed for corrupt persisted capabilities without erasing explicit denials', async () => {
    const { businessId } = await newBusiness();
    await db.query(
      'INSERT INTO business_settings (business_id,hours,capabilities) VALUES ($1,$2::jsonb,$3::jsonb)',
      [businessId, JSON.stringify(demoB.settings.hours), JSON.stringify({
        canQuotePrices: false, canTakeBookings: 'unknown', canHandoffToHuman: false, canShareContact: false,
      })],
    );
    await expect(getEffectiveAnswerRules(businessId)).resolves.toEqual({
      price: 'never', stock: 'always', contact: 'never', generalKnowledge: true,
      booking: false, orders: false, handoff: false,
    });
  });

  it('allows all supported actions by default for an existing unconfigured business', async () => {
    const { businessId } = await newBusiness();
    await expect(getEffectiveAnswerRules(businessId)).resolves.toEqual({
      price: 'always', stock: 'always', contact: 'always', generalKnowledge: true,
      booking: true, orders: true, handoff: true,
    });
  });


  it('rejects overlapping hours and version conflicts and saves a fully closed week', async () => {
    const { businessId } = await newBusiness();
    const [owner, staff] = await Promise.all([login(ownerA.email), login(staffA.email)]);
    const path = settingsPath(businessId);
    const expected = await getBusinessSettings(businessId);
    const closed = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };
    const updateHours = (hours: typeof expected.hours, version: number) => owner.put(path + '/hours')
      .set('X-Requested-With', 'nless').send({ hours, expectedVersion: version });
    const overlap = await updateHours({
      ...closed, mon: [{ open: '10:00', close: '13:00' }, { open: '12:00', close: '14:00' }],
    }, expected.version);
    expect(overlap.status).toBe(400);
    expect(overlap.body.error.details.issues).toMatchObject([{ path: 'hours.mon.1', code: 'overlap_or_touching' }]);
    await expect(getBusinessSettings(businessId)).resolves.toEqual(expected);
    const updated = await updateHours(closed, expected.version);
    expect(updated.status).toBe(200);
    expect(updated.body.data.settings).toMatchObject({ hours: closed, version: expected.version + 1 });
    const stale = await updateHours(expected.hours, expected.version);
    expect(stale.status).toBe(409);
    expect(stale.body.error).toMatchObject({ code: 'VERSION_CONFLICT', details: { currentVersion: expected.version + 1 } });
    const state = await owner.get(path + '/open-state').query({ at: '2026-11-21T03:00:00Z' });
    expect(state.status).toBe(200);
    expect(state.body.data).toMatchObject({ open: false, reason: 'closed_day', nextOpenAt: null });
    const denied = await staff.put(settingsPath(demoA.id) + '/hours')
      .set('X-Requested-With', 'nless').send({ hours: closed, expectedVersion: 1 });
    expect(denied.status).toBe(403);
  });

  it('validates inclusive closures, scopes mutations, and recalculates open state', async () => {
    const { businessId } = await newBusiness();
    const [owner, differentOwner] = await Promise.all([login(ownerA.email), login(ownerB.email)]);
    const path = settingsPath(businessId) + '/closures';
    const dateAfter = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
    const startDate = dateAfter(400);
    const endDate = dateAfter(401);
    const create = (start: string, end: string) => owner.post(path)
      .set('X-Requested-With', 'nless').send({ startDate: start, endDate: end, reason: 'Synthetic closure' });
    for (const [start, end] of [
      [endDate, startDate], ['2026-02-30', endDate], [dateAfter(-3), dateAfter(-2)], [startDate, dateAfter(767)],
    ] as const) {
      const rejected = await create(start, end);
      expect(rejected.status).toBe(400);
      expect(rejected.body.error.details.issues).not.toEqual([]);
    }
    const created = await create(startDate, endDate);
    expect(created.status).toBe(201);
    const closure = created.body.data;
    const collision = await create(endDate, dateAfter(403));
    expect(collision.status).toBe(400);
    expect(collision.body.error.details).toMatchObject({
      conflictId: closure.id, issues: [expect.objectContaining({ code: 'closure_overlap' })],
    });
    const listed = await owner.get(path);
    expect(listed.body.data.items).toEqual([closure]);
    const state = await owner.get(settingsPath(businessId) + '/open-state').query({ at: endDate + 'T03:00:00Z' });
    expect(state.body.data).toMatchObject({ open: false, reason: 'closure', closure });
    const deniedDelete = await differentOwner.delete(settingsPath(demoB.id) + '/closures/' + closure.id)
      .set('X-Requested-With', 'nless');
    expect(deniedDelete.status).toBe(404);
    const deleted = await owner.delete(path + '/' + closure.id).set('X-Requested-With', 'nless');
    expect(deleted.status).toBe(204);
    expect((await owner.get(path)).body.data.items).toEqual([]);
  }, 20_000);


  it('validates, patches, and resets answer policy without dropping unrelated restrictions', async () => {
    const { businessId } = await newBusiness();
    const owner = await login(ownerA.email);
    const staff = await login(staffA.email);
    const path = settingsPath(businessId) + '/answer-policy';
    const patch = (expectedVersion: number, policy: unknown) =>
      owner.patch(path).set('X-Requested-With', 'nless').send({ expectedVersion, policy });

    const badValue = await patch(1, { price: { reveal: 'maybe' } });
    expect(badValue.status).toBe(400);
    expect(badValue.body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: { issues: [expect.objectContaining({ path: 'policy.price.reveal' })] },
    });
    expect((await patch(1, { pricee: { reveal: 'never' } })).status).toBe(400);
    expect((await patch(1, { price: { reveal: 'never' } })).status).toBe(200);
    const stale = await patch(1, { booking: { enabled: false } });
    expect(stale.status).toBe(409);
    expect(stale.body.error).toMatchObject({ code: 'VERSION_CONFLICT', details: { currentVersion: 2 } });
    expect((await patch(2, { booking: { enabled: false } })).status).toBe(200);
    await expect(getBusinessSettings(businessId)).resolves.toMatchObject({
      answerPolicy: { price: { reveal: 'never' }, booking: { enabled: false } },
    });
    expect((await patch(3, { booking: null })).status).toBe(200);
    await expect(getBusinessSettings(businessId)).resolves.toMatchObject({ answerPolicy: { price: { reveal: 'never' } } });
    const defaults = await patch(4, null);
    expect(defaults.status).toBe(200);
    expect(defaults.body.data.settings.answerPolicy).toBeNull();
    const deniedStaff = await staff.patch(settingsPath(demoA.id) + '/answer-policy')
      .set('X-Requested-With', 'nless').send({ expectedVersion: 1, policy: null });
    expect(deniedStaff.status).toBe(403);
  });

  it('loads saved capabilities and resolves price and order denial consistently', async () => {
    const { businessId } = await newBusiness();
    const owner = await login(ownerA.email);
    const updated = await owner.put(settingsPath(businessId) + '/capabilities')
      .set('X-Requested-With', 'nless').send({
        expectedVersion: 1,
        capabilities: {
          canQuotePrices: false, canTakeOrders: true, canTakeBookings: true, canHandoffToHuman: false, canShareContact: true,
        },
      });
    expect(updated.status).toBe(200);
    expect(updated.body.data.effectiveRules).toMatchObject({ price: 'never', orders: false, handoff: false });
    await expect(getCapabilities(businessId)).resolves.toMatchObject({ canQuotePrices: false, canTakeOrders: true });
    await expect(getEffectiveAnswerRules(businessId)).resolves.toMatchObject({ price: 'never', orders: false, handoff: false });
  });

  it('persists profile and locale in core and F04, with audit field names only', async () => {
    const { businessId } = await newBusiness();
    const owner = await login(ownerA.email);
    const path = settingsPath(businessId);
    const profile = { name: 'F04 synthetic profile', description: 'Test contact', contactPhone: '02-000-0020', contactEmail: '', address: '' };
    const savedProfile = await owner.put(path + '/profile').set('X-Requested-With', 'nless')
      .send({ ...profile, expectedVersion: 1 });
    expect(savedProfile.status).toBe(200);
    await expect(getBusinessProfile(businessId)).resolves.toEqual({ ...profile, contactEmail: null, address: null });
    const profileAudit = await db.one<{ details: { changed: string[] } }>(
      "SELECT details FROM audit_events WHERE business_id=$1 AND action='business-settings.profile.update'", [businessId],
    );
    expect(profileAudit.details).toEqual({ changed: ['name', 'description', 'contactPhone'] });

    const setLocale = (timezone: string, language: 'en' | 'th', expectedVersion: number) => owner.put(path + '/locale')
      .set('X-Requested-With', 'nless').send({ expectedVersion, timezone, language });
    expect((await setLocale('Mars/Base', 'en', 2)).status).toBe(400);
    expect((await setLocale('America/New_York', 'th', 2)).status).toBe(200);
    expect((await setLocale('America/New_York', 'en', 3)).status).toBe(200);
    await expect(getBusinessSettings(businessId)).resolves.toMatchObject({ timezone: 'America/New_York', language: 'en', version: 4 });
    expect((await owner.get('/api/v1/businesses/' + businessId)).body.data).toMatchObject({
      name: profile.name, timezone: 'America/New_York', language: 'en', version: 4,
    });
  });

  it('initializes settings and profile rows idempotently for an existing business', async () => {
    const { businessId } = await newBusiness();
    const first = await ensureBusinessSettings(businessId);
    await expect(ensureBusinessSettings(businessId)).resolves.toEqual(first);
    const counts = await db.one<{ settings: number; profile: number }>(
      'SELECT (SELECT count(*)::int FROM business_settings WHERE business_id=$1) AS settings, ' +
      '(SELECT count(*)::int FROM business_profiles WHERE business_id=$1) AS profile', [businessId],
    );
    expect(counts).toEqual({ settings: 1, profile: 1 });
    await expect(ensureBusinessSettings(randomUUID())).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
