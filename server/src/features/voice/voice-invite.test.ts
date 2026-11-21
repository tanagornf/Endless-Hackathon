import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SEED } from '@nless/shared/core/fixtures';
import { AppError, config, db, model } from '../../core';
import { createTestAgent } from '../../core/test-utils';
import { saveMessage } from '../inbox/service';
import { createVoiceInvite, verifyLineVoiceChallenge } from './service';
import { seedActiveVoiceConnection } from './voice-test-fixtures';

const shopId = SEED.businesses.find(({ alias }) => alias === 'biz_demo_a')!.id;
const otherShop = SEED.businesses.find(({ alias }) => alias === 'biz_demo_b')!.id;
const lineBot = 'Uvoice-bot-fixture';
const publicBase = config.PUBLIC_BASE_URL;
const offerSdp = 'v=0\r\ns=Fixture';

beforeEach(async () => {
  config.PUBLIC_BASE_URL = 'https://synthetic.example.test';
  await seedActiveVoiceConnection(shopId, lineBot);
});

afterEach(() => {
  config.PUBLIC_BASE_URL = publicBase;
  vi.restoreAllMocks();
});

async function prepare(lineUser: string, eventId: string) {
  const app = await createTestAgent();
  const saved = await saveMessage({
    businessId: shopId, direction: 'inbound', author: 'customer', triggerAi: false,
    customer: { channel: 'line', externalId: lineUser, channelAccountId: lineBot },
    parts: [{ type: 'text', text: 'Voice call' }],
  });
  const scope = {
    businessId: shopId, conversationId: saved.conversation.id, lineUser, lineBot, eventId, language: 'en' as const,
  };
  const invite = await createVoiceInvite(scope);
  const challenge = await app.post('/api/v1/voice/invites/' + invite.id + '/challenges')
    .set('X-Requested-With', 'nless').send({});
  expect(challenge.status).toBe(200);
  const { command, proof } = challenge.body.data;
  const start = (accepted = true, browserProof = proof) =>
    app.post('/api/v1/voice/invites/' + invite.id + '/start')
      .set('X-Requested-With', 'nless').set('X-Voice-Proof', browserProof)
      .send({ accepted, saveTranscript: false, offerSdp });
  return { app, saved, scope, invite, command, proof, start };
}

describe('F30 LINE voice invitation', () => {
  it('binds an idempotent invite and explicit consent to its verified one-to-one LINE sender', async () => {
    const mint = vi.spyOn(model, 'createLiveVoiceSession');
    const { app, scope, invite, command, proof, start } = await prepare('Uvoice-owner-fixture', 'fake-event:invite-consent');
    expect(await createVoiceInvite(scope)).toEqual(invite);
    expect(await verifyLineVoiceChallenge({ ...scope, lineUser: 'Uwrong-customer', command })).toBe(false);
    expect(await verifyLineVoiceChallenge({ ...scope, businessId: otherShop, command })).toBe(false);
    expect(await verifyLineVoiceChallenge({ ...scope, lineBot: 'Uwrong-bot', command })).toBe(false);
    expect((await start()).status).toBe(404);
    expect(await verifyLineVoiceChallenge({ ...scope, command })).toBe(true);
    expect((await start(true, 'invalid-browser-proof')).status).toBe(404);
    expect((await start(false)).status).toBe(400);
    expect(mint).not.toHaveBeenCalled();

    const outcomes = await Promise.all([start(), start()]);
    expect(outcomes.map(({ status }) => status).sort()).toEqual([200, 404]);
    const accepted = outcomes.find(({ status }) => status === 200)?.body.data;
    expect(accepted).toMatchObject({ mode: 'fake', answerSdp: expect.stringContaining('v=0') });
    expect(accepted).not.toHaveProperty('providerSessionId');
    expect(accepted).not.toHaveProperty('clientSecret');
    expect(mint).toHaveBeenCalledTimes(1);
    expect((await app.post('/api/v1/voice/sessions/' + accepted.voiceSessionId + '/end')
      .set('X-Requested-With', 'nless').set('X-Voice-Proof', proof).send({})).status).toBe(200);
  }, 15_000);

  it('never mints from an already verified proof if its OA has disconnected', async () => {
    const mint = vi.spyOn(model, 'createLiveVoiceSession');
    const { scope, command, start } = await prepare('Uretired-shop-call', 'fake-event:voice-oa-disconnected');
    expect(await verifyLineVoiceChallenge({ ...scope, command })).toBe(true);
    await db.query("UPDATE line_connections SET status = 'inactive' WHERE business_id = $1 AND bot_user_id = $2", [shopId, lineBot]);
    expect((await start()).status).toBe(404);
    expect(mint).not.toHaveBeenCalled();
  }, 15_000);

  it('does not reuse an invite if a reserved upstream creation fails', async () => {
    const mint = vi.spyOn(model, 'createLiveVoiceSession')
      .mockRejectedValueOnce(new AppError('PROVIDER_UNAVAILABLE', 'Synthetic provider creation failure'));
    const { saved, scope, invite, command, start } = await prepare('Uprovider-creation-failure', 'fake-event:voice-provider-failure');
    expect(await verifyLineVoiceChallenge({ ...scope, command })).toBe(true);
    expect((await start()).status).toBe(502);
    expect((await start()).status).toBe(404);
    expect(mint).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ customerId: saved.conversation.customerId }));
    expect(await db.one<{ ended: boolean }>('SELECT ended_at IS NOT NULL AS ended FROM voice_sessions WHERE invite_id = $1', [invite.id]))
      .toEqual({ ended: true });
  }, 15_000);
});
