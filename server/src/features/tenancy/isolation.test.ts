import { randomUUID } from 'node:crypto';
import { SEED } from '@nless/shared/core/fixtures';
import { describe, expect, it } from 'vitest';
import { db } from '../../core';
import { getBusinessSettings } from '../business-settings/service';
import { createTestAgent, loginAs } from '../../core/test-utils';

const shopA = SEED.businesses.find(({ alias }) => alias === 'biz_demo_a')!;
const shopB = SEED.businesses.find(({ alias }) => alias === 'biz_demo_b')!;
const ownerA = SEED.users.find(({ alias }) => alias === 'owner_a')!;
const ownerB = SEED.users.find(({ alias }) => alias === 'owner_b')!;
const staffA = SEED.users.find(({ alias }) => alias === 'staff_a')!;
const staffB = SEED.users.find(({ alias }) => alias === 'staff_b')!;
const admin = SEED.users.find(({ alias }) => alias === 'platform_admin')!;
const businessPath = (id: string) => '/api/v1/businesses/' + id;
const targetDistinctPaths = 15;

type Route = { method: string; auth: string; path: string };

type TestSession = Awaited<ReturnType<typeof createTestAgent>>;
const sessions = new Map<string, Promise<TestSession>>();

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

function materialize(path: string, businessId: string) {
  return path.replace(/:(\w+)/g, (_, parameter: string) => parameter === 'businessId' ? businessId : randomUUID());
}

describe('F03 tenant isolation', () => {
  it('rejects all registered business GET routes when called under the wrong tenant', async () => {
    const [agentA, employeeA, agentB] = await Promise.all([login(ownerA.email), login(staffA.email), login(ownerB.email)]);
    const routesResponse = await agentA.get('/api/v1/_meta/routes');
    expect(routesResponse.status).toBe(200);
    const registry = routesResponse.body.data as Route[];
    const paths = registry
      .filter(({ method, auth, path }) => method === 'GET' && auth === 'business' && path.includes(':businessId'))
      .map(({ path }) => path);
    expect(paths).toEqual(expect.arrayContaining([
      '/api/v1/businesses/:businessId',
      '/api/v1/businesses/:businessId/settings',
      '/api/v1/businesses/:businessId/members',
    ]));

    const distinctPaths = new Set(paths);
    expect(distinctPaths.size).toBe(paths.length);
    let tested = 0;
    let ownDataResponses = 0;
    for (const path of distinctPaths) {
      const attempts = await Promise.all([
        agentA.get(materialize(path, shopB.id)),
        employeeA.get(materialize(path, shopB.id)),
        agentB.get(materialize(path, shopA.id)),
        agentA.get(materialize(path, shopA.id)),
      ]);
      for (const denied of attempts.slice(0, 3)) {
        expect(denied.status, path).toBe(404);
        expect(denied.body.error.code, path).toBe('NOT_FOUND');
        tested++;
      }
      const own = attempts[3]!;
      if (own.status === 200) {
        expect(JSON.stringify(own.body), path).not.toContain(shopB.marker);
        ownDataResponses++;
      }
    }
    expect(tested).toBe(distinctPaths.size * 3);
    expect(ownDataResponses).toBeGreaterThan(0);
    const skipped = registry.length - distinctPaths.size;
    const uncovered = Math.max(0, targetDistinctPaths - distinctPaths.size);
    console.info('F03 isolation checked ' + distinctPaths.size + '/' + targetDistinctPaths + ' distinct business GET paths. ' +
      uncovered + ' additional distinct paths pending, ' + tested + ' cross-tenant requests verified, ' +
      skipped + ' registry entries outside scope: ' + [...distinctPaths].join(', '));
  }, 30_000);

  it('rejects cross-tenant settings and member writes without changing shop B', async () => {
    const agent = await login(ownerA.email);
    const shopBSettings = businessPath(shopB.id) + '/settings';
    const before = await getBusinessSettings(shopB.id);
    const deniedToggle = await agent.put(shopBSettings + '/ai').set('X-Requested-With', 'nless').send({ enabled: false });
    expect(deniedToggle.status).toBe(404);
    const deniedRevoke = await agent.post(businessPath(shopB.id) + '/members/' + staffB.id + '/revoke').set('X-Requested-With', 'nless');
    expect(deniedRevoke.status).toBe(404);
    expect(deniedRevoke.body.error.code).toBe('NOT_FOUND');
    await expect(getBusinessSettings(shopB.id)).resolves.toEqual(before);
    await expect(db.one('SELECT status FROM memberships WHERE business_id=$1 AND user_id=$2', [shopB.id, staffB.id]))
      .resolves.toEqual({ status: 'active' });
  });

  it('lists only authorized shops for owner A and grants no implicit access to platform admin', async () => {
    const [agentA, administrator] = await Promise.all([login(ownerA.email), login(admin.email)]);
    const me = await agentA.get('/api/v1/me');
    expect(me.status).toBe(200);
    const visibleBusinessIds = me.body.data.businesses.map((row: { business: { id: string } }) => row.business.id) as string[];
    const demoBusinessIds = new Set(SEED.businesses.map(({ id }) => id));
    expect(visibleBusinessIds.filter((id) => demoBusinessIds.has(id))).toEqual([shopA.id]);
    // Other integration suites can provision legitimate additional shops in the same test DB.
    const memberships = await db.query<{ business_id: string }>(
      "SELECT business_id FROM memberships WHERE user_id=$1 AND status='active'", [ownerA.id],
    );
    const allowedBusinessIds = new Set(memberships.rows.map(({ business_id }) => business_id));
    for (const businessId of visibleBusinessIds) expect(allowedBusinessIds.has(businessId)).toBe(true);
    const adminMe = await administrator.get('/api/v1/me');
    expect(adminMe.status).toBe(200);
    expect(adminMe.body.data.businesses).toEqual([]);
    for (const shop of [shopA, shopB]) {
      expect((await administrator.get(businessPath(shop.id))).status).toBe(404);
    }
  });

  it('tests valid sensitive detail IDs with authorized success controls in the correct shop', async () => {
    const [agentA, agentB] = await Promise.all([login(ownerA.email), login(ownerB.email)]);
    const item = SEED.knowledge.find(({ alias }) => alias === 'kn_b_faq')!;
    const path = '/knowledge/items/' + item.id;
    const paths = [path, path + '/revisions', path + '/revisions/' + item.revision];

    for (const detail of paths) {
      const allowed = await agentB.get(businessPath(shopB.id) + detail);
      expect(allowed.status, detail).toBe(200);
      if (!detail.endsWith('/revisions')) {
        expect(JSON.stringify(allowed.body), detail).toContain(shopB.marker);
      }

      const [wrongBusiness, wrongResource] = await Promise.all([
        agentA.get(businessPath(shopB.id) + detail),
        agentA.get(businessPath(shopA.id) + detail),
      ]);
      for (const denied of [wrongBusiness, wrongResource]) {
        expect(denied.status, detail).toBe(404);
        expect(denied.body.error.code, detail).toBe('NOT_FOUND');
        expect(JSON.stringify(denied.body), detail).not.toContain(shopB.marker);
      }
    }
  });
});
