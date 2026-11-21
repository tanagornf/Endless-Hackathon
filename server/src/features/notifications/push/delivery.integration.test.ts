import { createECDH, randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import webPush from 'web-push';
import { createSession, db } from '../../../core';
import type { JobContext } from '../../../core';
import { createHttpApp, httpError } from '../../../core/http';
import { handleNotificationPush } from './delivery';
import { registerOwnerConsultLookup } from './destination';
import { registerPushRoutes } from './routes';

vi.mock('../../../core', async (load) => {
  const core = await load<typeof import('../../../core')>();
  const { default: library } = await import('web-push');
  const pair = library.generateVAPIDKeys();
  return { ...core, config: { ...core.config, VAPID_PUBLIC_KEY: pair.publicKey, VAPID_PRIVATE_KEY: pair.privateKey,
    VAPID_SUBJECT: 'mailto:push-fixture@example.test' } };
});

const ownerId = randomUUID();
const strangerId = randomUUID();
const accountId = randomUUID();
const businessId = randomUUID();
const caseId = randomUUID();
const actionStepId = randomUUID();
const link = '/bot-settings?consult=' + caseId;
const endpoint = 'https://web.push.apple.com/fixture-' + randomUUID();
const originApi = '/api/v1/notifications';
const pushApi = originApi + '/push';
const header = ['X-Requested-With', 'nless'] as const;
const sent = { statusCode: 201, headers: {}, body: '' };
const pending = vi.fn();
registerOwnerConsultLookup(pending);

const http = createHttpApp();
registerPushRoutes(http.api('F31'));
http.app.post('/fixture/owner', async (_req, res) => {
  await createSession(ownerId, 'password', res);
  res.sendStatus(204);
});
http.app.post('/fixture/stranger', async (_req, res) => {
  await createSession(strangerId, 'password', res);
  res.sendStatus(204);
});
http.app.use(httpError);
const owner = request.agent(http.app);
const stranger = request.agent(http.app);
const publicClient = request(http.app);
let device: string;

function job(notificationId: string): JobContext<{ notificationId: string }> {
  return { id: randomUUID(), type: 'notifications.push', payload: { notificationId }, businessId,
    attempt: 1, maxAttempts: 3, signal: new AbortController().signal, progress: async () => {} };
}

async function makeNotice() {
  const result = await db.one<{ id: string }>(
    "INSERT INTO notifications (business_id,user_id,type,title,body,link,push_purpose) VALUES ($1,$2,'system',$3,$4,$5,$6) RETURNING id",
    [businessId, ownerId, 'private fixture title', 'private customer context', link,
      JSON.stringify({ kind: 'owner-consult', caseId, actionStepId })],
  );
  return result.id;
}

async function status(agent: typeof owner) {
  return (await agent.get(pushApi + '/status').query({ device }).expect(200)).body.data;
}

describe('durable phone notification delivery', () => {
  beforeAll(async () => {
    await db.tx(async (tx) => {
      await tx.query("INSERT INTO users (id,email,locale) VALUES ($1,$2,'en'),($3,$4,'th')",
        [ownerId, ownerId + '@example.test', strangerId, strangerId + '@example.test']);
      await tx.query("INSERT INTO accounts (id,name,owner_user_id) VALUES ($1,'Push test account',$2)", [accountId, ownerId]);
      await tx.query("INSERT INTO businesses (id,account_id,name) VALUES ($1,$2,'Push test shop')", [businessId, accountId]);
      await tx.query("INSERT INTO memberships (business_id,user_id,role,permissions) VALUES ($1,$2,'owner','{}')", [businessId, ownerId]);
      await tx.query("INSERT INTO notification_preferences (user_id,type,in_app,push) VALUES ($1,'system',true,true)", [ownerId]);
    });
    await owner.post('/fixture/owner').expect(204);
    await stranger.post('/fixture/stranger').expect(204);
    const setup = await owner.post(pushApi + '/subscribe').set(...header).send({
      endpoint,
      keys: {
        p256dh: createECDH('prime256v1').generateKeys().toString('base64url'),
        auth: randomBytes(16).toString('base64url'),
      },
    }).expect(200);
    device = setup.body.data.deviceId;
  }, 35000);

  beforeEach(async () => {
    pending.mockReset().mockResolvedValue(true);
    await db.query('DELETE FROM notifications WHERE business_id = $1', [businessId]);
    await db.query('UPDATE push_subscriptions SET last_accepted_at=NULL WHERE id=$1 AND user_id=$2', [device, ownerId]);
    await db.query("UPDATE notification_preferences SET push=true WHERE user_id=$1 AND type='system'", [ownerId]);
  }, 15000);

  afterEach(() => { vi.restoreAllMocks(); });
  afterAll(async () => {
    await db.tx(async (tx) => {
      await tx.query('DELETE FROM accounts WHERE id=$1', [accountId]);
      await tx.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [[ownerId, strangerId]]);
    });
  }, 20000);

  it('deduplicates concurrent dispatch and accepts a recipient-only ACK before the provider responds', async () => {
    const noticeId = await makeNotice();
    const send = vi.spyOn(webPush, 'sendNotification').mockImplementation(async (_subscription, raw) => {
      const payload = JSON.parse(raw as string);
      expect(payload).toEqual({ noticeId, ref: expect.any(String), language: 'en' });
      await stranger.post(pushApi + '/ack').set(...header).send({ ref: payload.ref }).expect(200);
      expect((await status(owner)).lastAckRef).toBeNull();
      await owner.post(pushApi + '/ack').set(...header).send({ ref: payload.ref }).expect(200);
      expect(await status(owner)).toMatchObject({ lastAckRef: payload.ref, lastAckNoticeId: noticeId, lastAcceptedAt: null });
      return sent;
    });

    await Promise.all([handleNotificationPush(job(noticeId)), handleNotificationPush(job(noticeId))]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(await status(owner)).toMatchObject({ enrolledOnDevice: true, lastAckNoticeId: noticeId, lastAcceptedAt: expect.any(String) });
    expect(await status(stranger)).toMatchObject({ enrolledOnDevice: false, lastAckRef: null });
  }, 35000);

  it('keeps a lost provider response available for ACK and does not send the same alert again', async () => {
    const noticeId = await makeNotice();
    const send = vi.spyOn(webPush, 'sendNotification').mockRejectedValue(new Error('fixture interrupted before provider status'));
    await handleNotificationPush(job(noticeId));
    await handleNotificationPush(job(noticeId));
    expect(send).toHaveBeenCalledTimes(1);
    const row = await db.one<{ state: string; ref: string }>('SELECT state,ref FROM push_deliveries WHERE notification_id=$1', [noticeId]);
    expect(row.state).toBe('pending');
    await owner.post(pushApi + '/ack').set(...header).send({ ref: row.ref }).expect(200);
    expect((await status(owner)).lastAckNoticeId).toBe(noticeId);
  }, 25000);

  it('retries a definite provider rejection with the same durable delivery ref', async () => {
    const noticeId = await makeNotice();
    const send = vi.spyOn(webPush, 'sendNotification').mockRejectedValueOnce({ statusCode: 429 }).mockResolvedValueOnce(sent);
    await expect(handleNotificationPush(job(noticeId))).rejects.toThrow('needs retry');
    await handleNotificationPush(job(noticeId));
    expect(send).toHaveBeenCalledTimes(2);
    expect(JSON.parse(send.mock.calls[0]![1] as string).ref).toEqual(JSON.parse(send.mock.calls[1]![1] as string).ref);
    expect(await db.one('SELECT state,attempt_count FROM push_deliveries WHERE notification_id=$1', [noticeId]))
      .toEqual({ state: 'accepted', attempt_count: 2 });
  }, 25000);

  it('keeps both the tap and phone delivery scoped to current owner permission and live case state', async () => {
    const noticeId = await makeNotice();
    const send = vi.spyOn(webPush, 'sendNotification').mockResolvedValue(sent);
    const path = pushApi + '/open/' + noticeId;
    await publicClient.get(path).expect(401);
    await stranger.get(path).expect(404);
    const destination = await owner.get(path).expect(200);
    expect(destination.body.data).toEqual({ businessId, link });
    expect(destination.headers['cache-control']).toBe('private, no-store');
    pending.mockResolvedValue(false);
    await owner.get(path).expect(404);
    await handleNotificationPush(job(noticeId));
    pending.mockResolvedValue(true);
    await db.query("UPDATE notification_preferences SET push=false WHERE user_id=$1 AND type='system'", [ownerId]);
    await handleNotificationPush(job(noticeId));
    expect(send).not.toHaveBeenCalled();
  }, 25000);

  it('drops an unsubmitted reservation when its case resolves during dispatch', async () => {
    const noticeId = await makeNotice();
    const send = vi.spyOn(webPush, 'sendNotification').mockResolvedValue(sent);
    pending.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await handleNotificationPush(job(noticeId));
    expect(pending).toHaveBeenCalledTimes(2);
    expect(send).not.toHaveBeenCalled();
    expect(await db.maybeOne('SELECT id FROM push_deliveries WHERE notification_id = $1', [noticeId])).toBeNull();
  }, 25000);

  it('serves the worker as public same-scope JavaScript without a redirect', async () => {
    const result = await publicClient.get(originApi + '/sw.js').expect(200);
    expect(result.headers['content-type']).toContain('text/javascript');
    expect(result.headers['service-worker-allowed']).toBe(originApi + '/');
    expect(result.headers.location).toBeUndefined();
  });
});
