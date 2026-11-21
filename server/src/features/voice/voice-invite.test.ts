import { describe, expect, it, vi } from 'vitest';
import { SEED } from '@nless/shared/core/fixtures';
import { config, model } from '../../core';
import { createTestAgent } from '../../core/test-utils';
import { saveMessage } from '../inbox/service';
import { createVoiceInvite, verifyLineVoiceChallenge } from './service';

const shopId = SEED.businesses.find(({ alias }) => alias === 'biz_demo_a')!.id;
const lineUser = 'Uvoice-owner-fixture';
const lineBot = 'Uvoice-bot-fixture';

describe('F30 LINE voice invitation', () => {
  it('binds an idempotent invite and explicit consent to its verified one-to-one LINE sender', async () => {
    const app = await createTestAgent();
    const originalPublicBase = config.PUBLIC_BASE_URL;
    config.PUBLIC_BASE_URL = 'https://synthetic.example.test';
    const mint = vi.spyOn(model, 'createLiveVoiceSession');
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
    } finally {
      config.PUBLIC_BASE_URL = originalPublicBase;
      mint.mockRestore();
    }
  });
});
