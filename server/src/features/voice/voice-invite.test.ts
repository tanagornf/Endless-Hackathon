import { describe, expect, it, vi } from 'vitest';
import { SEED } from '@nless/shared/core/fixtures';
import { AppError, config, db, model } from '../../core';
import { createTestAgent } from '../../core/test-utils';
import { saveMessage } from '../inbox/service';
import { createVoiceInvite, verifyLineVoiceChallenge } from './service';
import { seedActiveVoiceConnection } from './voice-test-fixtures';

const shopId = SEED.businesses.find(({ alias }) => alias === 'biz_demo_a')!.id;
const lineUser = 'Uvoice-owner-fixture';
const lineBot = 'Uvoice-bot-fixture';

describe('F30 LINE voice invitation', () => {
  it('binds an idempotent invite and explicit consent to its verified one-to-one LINE sender', async () => {
    const app = await createTestAgent();
    const originalPublicBase = config.PUBLIC_BASE_URL;
    config.PUBLIC_BASE_URL = 'https://synthetic.example.test';
    const mint = vi.spyOn(model, 'createLiveVoiceSession');
    await seedActiveVoiceConnection(shopId, lineBot);
    try {
      const saved = await saveMessage({
        businessId: shopId, direction: 'inbound', author: 'customer', triggerAi: false,
        customer: { channel: 'line', externalId: lineUser, channelAccountId: lineBot },
        parts: [{ type: 'text', text: 'Voice call' }],
      });
      const scope = {
        businessId: shopId, conversationId: saved.conversation.id, lineUser, lineBot,
        eventId: 'fake-event:invite-consent', language: 'en' as const,
      };
      const invite = await createVoiceInvite(scope);
      expect(await createVoiceInvite(scope)).toEqual(invite);
      const challenge = await app.post('/api/v1/voice/invites/' + invite.id + '/challenges')
        .set('X-Requested-With', 'nless').send({});
      expect(challenge.status).toBe(200);
      const { command, proof } = challenge.body.data;
      const start = (accepted: boolean, browserProof = proof) =>
        app.post('/api/v1/voice/invites/' + invite.id + '/start')
          .set('X-Requested-With', 'nless').set('X-Voice-Proof', browserProof)
          .send({ accepted, saveTranscript: false, offerSdp: 'v=0\r\ns=Fixture' });
      expect(await verifyLineVoiceChallenge({ ...scope, lineUser: 'Uwrong-customer', command })).toBe(false);
      expect((await start(true)).status).toBe(404);
      expect(await verifyLineVoiceChallenge({ ...scope, command })).toBe(true);
      expect((await start(true, 'invalid-browser-proof')).status).toBe(404);
      expect((await start(false)).status).toBe(400);
      expect(mint).not.toHaveBeenCalled();
      const outcomes = await Promise.all([start(true), start(true)]);
      expect(outcomes.map(({ status }) => status).sort()).toEqual([200, 404]);
      const accepted = outcomes.find(({ status }) => status === 200)?.body.data;
      expect(accepted).toMatchObject({ mode: 'fake', answerSdp: expect.stringContaining('v=0') });
      expect(accepted).not.toHaveProperty('providerSessionId');
      expect(accepted).not.toHaveProperty('clientSecret');
      expect(mint).toHaveBeenCalledTimes(1);
      expect((await app.post('/api/v1/voice/sessions/' + accepted.voiceSessionId + '/end')
        .set('X-Requested-With', 'nless').set('X-Voice-Proof', proof).send({})).status).toBe(200);
    } finally {
      config.PUBLIC_BASE_URL = originalPublicBase;
      mint.mockRestore();
    }
  });
});

  it('never mints from an already verified proof if its OA has disconnected', async () => {
    const app = await createTestAgent();
    const originalPublicBase = config.PUBLIC_BASE_URL;
    config.PUBLIC_BASE_URL = 'https://synthetic.example.test';
    await seedActiveVoiceConnection(shopId, lineBot);
    const mint = vi.spyOn(model, 'createLiveVoiceSession');
    try {
      const saved = await saveMessage({
        businessId: shopId, direction: 'inbound', author: 'customer', triggerAi: false,
        customer: { channel: 'line', externalId: 'Uretired-shop-call', channelAccountId: lineBot },
        parts: [{ type: 'text', text: 'Voice call' }],
      });
      const scope = {
        businessId: shopId, conversationId: saved.conversation.id, lineUser: 'Uretired-shop-call', lineBot,
        eventId: 'fake-event:voice-oa-disconnected', language: 'en' as const,
      };
      const invite = await createVoiceInvite(scope);
      const challenge = await app.post('/api/v1/voice/invites/' + invite.id + '/challenges').set('X-Requested-With', 'nless').send({});
      const { proof, command } = challenge.body.data;
      expect(await verifyLineVoiceChallenge({ ...scope, command })).toBe(true);
      await db.query("UPDATE line_connections SET status = 'inactive' WHERE business_id = $1 AND bot_user_id = $2", [shopId, lineBot]);
      const answer = await app.post('/api/v1/voice/invites/' + invite.id + '/start')
        .set('X-Requested-With', 'nless').set('X-Voice-Proof', proof)
        .send({ accepted: true, saveTranscript: false, offerSdp: 'v=0\r\ns=Fixture' });
      expect(answer.status).toBe(404);
      expect(mint).not.toHaveBeenCalled();
    } finally {
      config.PUBLIC_BASE_URL = originalPublicBase;
      mint.mockRestore();
    }
  }, 15_000);

  it('does not resend an invite if a reserved upstream creation fails', async () => {
    const app = await createTestAgent();
    const originalPublicBase = config.PUBLIC_BASE_URL;
    config.PUBLIC_BASE_URL = 'https://synthetic.example.test';
    await seedActiveVoiceConnection(shopId, lineBot);
    const mint = vi.spyOn(model, 'createLiveVoiceSession')
      .mockRejectedValueOnce(new AppError('PROVIDER_UNAVAILABLE', 'Synthetic provider creation failure'));
    try {
      const saved = await saveMessage({
        businessId: shopId, direction: 'inbound', author: 'customer', triggerAi: false,
        customer: { channel: 'line', externalId: 'Uprovider-creation-failure', channelAccountId: lineBot },
        parts: [{ type: 'text', text: 'Voice call' }],
      });
      const scope = {
        businessId: shopId, conversationId: saved.conversation.id, lineUser: 'Uprovider-creation-failure', lineBot,
        eventId: 'fake-event:voice-provider-failure', language: 'en' as const,
      };
      const invite = await createVoiceInvite(scope);
      const challenge = await app.post('/api/v1/voice/invites/' + invite.id + '/challenges').set('X-Requested-With', 'nless').send({});
      const { proof, command } = challenge.body.data;
      expect(await verifyLineVoiceChallenge({ ...scope, command })).toBe(true);
      const start = () => app.post('/api/v1/voice/invites/' + invite.id + '/start')
        .set('X-Requested-With', 'nless').set('X-Voice-Proof', proof)
        .send({ accepted: true, saveTranscript: false, offerSdp: 'v=0\r\ns=Fixture' });
      expect((await start()).status).toBe(503);
      expect((await start()).status).toBe(404);
      expect(mint).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ customerId: saved.conversation.customerId }));
      expect(await db.one<{ ended: boolean }>('SELECT ended_at IS NOT NULL AS ended FROM voice_sessions WHERE invite_id = $1', [invite.id]))
        .toEqual({ ended: true });
    } finally {
      config.PUBLIC_BASE_URL = originalPublicBase;
      mint.mockRestore();
    }
  }, 15_000);
