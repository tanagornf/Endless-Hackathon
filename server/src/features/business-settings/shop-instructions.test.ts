import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import type { AuthScope } from '@nless/shared/core/types';
import { createSession, db } from '../../core';
import { createHttpApp, httpError } from '../../core/http';
import {
  getShopInstructionCandidate,
  listShopInstructions,
  publishShopInstruction,
  readActiveShopInstruction,
  recordInstructionReplay,
  rollbackShopInstruction,
} from './shop-instructions-repo';
import { registerShopInstructionRoutes } from './shop-instructions-routes';

const shops: string[] = [];
const users: string[] = [];
const accounts: string[] = [];

async function createOwner() {
  const accountId = randomUUID();
  const businessId = randomUUID();
  const userId = randomUUID();
  await db.tx(async (tx) => {
    await tx.query('INSERT INTO users (id,email,display_name) VALUES ($1,$2,$3)', [
      userId, userId + '@example.test', 'Instruction reviewer',
    ]);
    await tx.query('INSERT INTO accounts (id,name,owner_user_id) VALUES ($1,$2,$3)', [accountId, 'Instruction QA', userId]);
    await tx.query('INSERT INTO businesses (id,account_id,name) VALUES ($1,$2,$3)', [
      businessId, accountId, 'Instruction QA',
    ]);
    await tx.query("INSERT INTO memberships (business_id,user_id,role) VALUES ($1,$2,'owner')", [businessId, userId]);
  });
  shops.push(businessId);
  users.push(userId);
  accounts.push(accountId);
  return { businessId, accountId, userId, role: 'owner', permissions: ['business.bot_settings'], isPlatformAdmin: false } satisfies AuthScope;
}

const passingOutcomes = [
  { fixtureId: 'original', language: 'th', arm: 'baseline', expectedCase: 'ask_preference', actualResult: 'ask_count', passed: false },
  { fixtureId: 'original', language: 'th', arm: 'candidate', expectedCase: 'ask_preference', actualResult: 'ask_preference', passed: true },
  { fixtureId: 'rephrase', language: 'en', arm: 'candidate', expectedCase: 'ask_preference', actualResult: 'ask_preference', passed: true },
  { fixtureId: 'negative', language: 'en', arm: 'negative', expectedCase: 'keep_guard', actualResult: 'keep_guard', passed: true },
  { fixtureId: 'other-shop', language: 'th', arm: 'cross_shop', expectedCase: 'shop_unchanged', actualResult: 'shop_unchanged', passed: true },
] as const;

async function recordReplay(scope: AuthScope, id: string) {
  const reviewed = await getShopInstructionCandidate(scope, id);
  return recordInstructionReplay({
    businessId: scope.businessId!, candidateId: id, baseVersionId: reviewed.baseVersionId,
    candidateDigest: reviewed.candidateDigest, replayRunId: randomUUID(), fixtureSetDigest: 'a'.repeat(64),
    mode: 'fake', outcomes: [...passingOutcomes],
  });
}

async function candidate(scope: AuthScope, instruction: string, parent: string | null = null, withReplay = true) {
  const id = randomUUID();
  await db.query(`
    INSERT INTO shop_instruction_candidates (business_id,id,answer_receipt_id,case_id,action_step_id,analysis_usage_id,
      base_version_id,instruction,reason)
    VALUES ($1,$2,$3,$4,'test',$5,$6,$7,'Owner clarification')`,
  [scope.businessId, id, randomUUID(), randomUUID(), randomUUID(), parent, instruction]);
  if (withReplay) expect(await recordReplay(scope, id)).toEqual({ passed: true });
  return id;
}

afterEach(async () => {
  await db.query('DELETE FROM audit_events WHERE business_id = ANY($1::uuid[])', [shops.splice(0)]);
  await db.query('DELETE FROM accounts WHERE id = ANY($1::uuid[])', [accounts.splice(0)]);
  await db.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [users.splice(0)]);
});

describe('F04 shop instruction revisions', () => {
  it('requires owner approval, scopes both review and active reads, and audits rollback', async () => {
    const a = await createOwner();
    const b = await createOwner();
    const first = await candidate(a, 'Ask which expansion they need.', null, false);
    expect(await readActiveShopInstruction(a.businessId)).toBeNull();
    expect(await listShopInstructions(a)).toMatchObject({ activeVersionId: null, candidates: [{ id: first }], versions: [] });
    expect(await listShopInstructions(b)).toEqual({ activeVersionId: null, candidates: [], versions: [] });
    await expect(getShopInstructionCandidate(b, first)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(publishShopInstruction({ ...a, role: 'staff' }, first, null)).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    await expect(publishShopInstruction(a, first, null)).rejects.toMatchObject({ code: 'POLICY_BLOCKED' });
    const review = await getShopInstructionCandidate(a, first);
    expect(review.replayPassed).toBe(false);
    const report = {
      businessId: a.businessId, candidateId: first, candidateDigest: review.candidateDigest, baseVersionId: null,
      replayRunId: randomUUID(), fixtureSetDigest: 'b'.repeat(64), mode: 'fake' as const, outcomes: [...passingOutcomes],
    };
    await expect(recordInstructionReplay({ ...report, businessId: b.businessId })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(recordInstructionReplay({ ...report, candidateDigest: '0'.repeat(64) })).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    await expect(recordInstructionReplay({ ...report, outcomes: report.outcomes.slice(0, 2) })).resolves.toEqual({ passed: false });
    await expect(recordInstructionReplay(report)).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    await expect(publishShopInstruction(a, first, null)).rejects.toMatchObject({ code: 'POLICY_BLOCKED' });
    await expect(recordReplay(a, first)).resolves.toEqual({ passed: true });

    const original = await publishShopInstruction(a, first, null);
    expect(await publishShopInstruction(a, first, null)).toEqual(original);
    const next = await candidate(a, 'Offer the base set first.', original.id);
    const replacement = await publishShopInstruction(a, next, original.id);
    expect(await readActiveShopInstruction(a.businessId)).toEqual({ id: replacement.id, instruction: 'Offer the base set first.' });
    expect(await readActiveShopInstruction(b.businessId)).toBeNull();
    await expect(rollbackShopInstruction(b, original.id, null)).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const rolledBack = await rollbackShopInstruction(a, original.id, replacement.id);
    expect(rolledBack).toMatchObject({ parentVersionId: replacement.id, restoredFromVersionId: original.id });
    expect(await rollbackShopInstruction(a, original.id, replacement.id)).toEqual(rolledBack);
    expect(await readActiveShopInstruction(a.businessId)).toEqual({ id: rolledBack.id, instruction: 'Ask which expansion they need.' });
    expect(await listShopInstructions(a)).toMatchObject({ activeVersionId: rolledBack.id, candidates: [], versions: [
      { id: rolledBack.id }, { id: replacement.id }, { id: original.id },
    ] });
    const audit = await db.query<{ action: string; targetId: string; actorId: string }>(`
      SELECT action,target_id AS "targetId",actor_user_id AS "actorId" FROM audit_events
      WHERE business_id=$1 AND action LIKE 'business_settings.shop_instruction.%' ORDER BY created_at,id`, [a.businessId]);
    expect(audit.rows).toHaveLength(3);
    expect(audit.rows).toEqual(expect.arrayContaining([
      { action: 'business_settings.shop_instruction.publish', targetId: original.id, actorId: a.userId },
      { action: 'business_settings.shop_instruction.publish', targetId: replacement.id, actorId: a.userId },
      { action: 'business_settings.shop_instruction.rollback', targetId: rolledBack.id, actorId: a.userId },
    ]));
  });

  it('admits one activation for a parent and rejects delayed retries after the head moves', async () => {
    const a = await createOwner();
    const first = await candidate(a, 'Offer help with add-ons.');
    const second = await candidate(a, 'Ask for a SKU.');
    const decisions = await Promise.allSettled([
      publishShopInstruction(a, first, null),
      publishShopInstruction(a, second, null),
    ]);
    expect(decisions.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(decisions.find(({ status }) => status === 'rejected')).toMatchObject({ reason: { code: 'VERSION_CONFLICT' } });
    const active = (await readActiveShopInstruction(a.businessId))!;
    const next = await candidate(a, 'Ask which accessory they need.', active.id);
    const newest = await publishShopInstruction(a, next, active.id);
    const winner = decisions[0].status === 'fulfilled' ? first : second;
    await expect(publishShopInstruction(a, winner, null)).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    await expect(rollbackShopInstruction(a, active.id, active.id)).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    await db.query("UPDATE memberships SET status='revoked' WHERE business_id=$1 AND user_id=$2", [a.businessId, a.userId]);
    await expect(rollbackShopInstruction(a, active.id, newest.id)).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  });

  it('requires a signed-in, active owner even when staff have bot settings permission', async () => {
    const owner = await createOwner();
    const staff = await createOwner();
    await db.query(`
      INSERT INTO memberships (business_id,user_id,role,permissions) VALUES ($1,$2,'staff','{business.bot_settings}')`,
    [owner.businessId, staff.userId]);
    const candidateId = await candidate(owner, 'Ask whether the gift recipient has played before.', null, false);
    const { app, api } = createHttpApp();
    registerShopInstructionRoutes(api('F04'));
    app.post('/test-session/:userId', async (req, res) => {
      await createSession(req.params.userId, 'password', res);
      res.sendStatus(204);
    });
    app.use(httpError);
    const agent = request.agent(app);
    const path = '/api/v1/businesses/' + owner.businessId + '/settings/shop-instructions';
    const publish = path + '/candidates/' + candidateId + '/publish';
    const send = (body: unknown) => agent.post(publish).set('X-Requested-With', 'nless').send(body as object);

    await agent.get(path).expect(401);
    await agent.post('/test-session/' + staff.userId).expect(204);
    await agent.get(path).expect(403);
    await send({ expectedActiveVersionId: null }).expect(403);
    await agent.post('/test-session/' + owner.userId).expect(204);
    await agent.get(path + '/candidates/' + candidateId).expect(200)
      .expect('Cache-Control', 'no-store');
    await send({ expectedActiveVersionId: null, instruction: 'A different draft' }).expect(400);
    expect(await readActiveShopInstruction(owner.businessId)).toBeNull();
    await send({ expectedActiveVersionId: null }).expect(422);
    await expect(recordReplay(owner, candidateId)).resolves.toEqual({ passed: true });
    const { body: published } = await send({ expectedActiveVersionId: null }).expect(200);
    const restoreBaseline = () => agent.post(path + '/versions/baseline/rollback').set('X-Requested-With', 'nless');
    await restoreBaseline().send({ expectedActiveVersionId: null }).expect(409);
    const { body: baseline } = await restoreBaseline().send({ expectedActiveVersionId: published.data.id }).expect(200);
    expect(baseline.data).toMatchObject({
      parentVersionId: published.data.id, restoredFromVersionId: null, candidateId: null, instruction: null,
    });
    expect(await readActiveShopInstruction(owner.businessId)).toBeNull();
    expect(await readActiveShopInstruction(staff.businessId)).toBeNull();
    expect((await listShopInstructions(owner)).activeVersionId).toBe(baseline.data.id);
    const otherShop = path.replace(owner.businessId, staff.businessId);
    await agent.get(otherShop).expect(404);
  });
});
