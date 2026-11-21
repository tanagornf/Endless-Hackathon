import { describe, expect, it, vi } from 'vitest';
import { SEED } from '@nless/shared/core/fixtures';
import { config, db, model, type LiveVoiceEvent } from '../../core';
import { createTestAgent } from '../../core/test-utils';
import { saveMessage } from '../inbox/service';
import { createVoiceInvite, getRecentVoiceHistory, verifyLineVoiceChallenge } from './service';
import { seedActiveVoiceConnection } from './voice-test-fixtures';

const shopA = SEED.businesses.find(({ alias }) => alias === 'biz_demo_a')!.id;
const shopB = SEED.businesses.find(({ alias }) => alias === 'biz_demo_b')!.id;
const bot = 'Uprivate-voice-bot';
const offerSdp = 'v=0\r\ns=Fixture';
type App = Awaited<ReturnType<typeof createTestAgent>>;

async function verifyNewInvite(app: App, businessId: string, lineUser: string, eventId: string) {
  await seedActiveVoiceConnection(businessId, bot);
  const { conversation } = await saveMessage({
    businessId, direction: 'inbound', author: 'customer', triggerAi: false,
    customer: { channel: 'line', externalId: lineUser, channelAccountId: bot },
    parts: [{ type: 'text', text: 'Voice call' }],
  });
  const scope = { businessId, conversationId: conversation.id, lineUser, lineBot: bot, eventId, language: 'en' as const };
  const invite = await createVoiceInvite(scope);
  const challenge = await app.post('/api/v1/voice/invites/' + invite.id + '/challenges').set('X-Requested-With', 'nless').send({});
  expect(challenge.status).toBe(200);
  const { command, proof } = challenge.body.data;
  expect(await verifyLineVoiceChallenge({ ...scope, command })).toBe(true);
  return { conversation, invite, proof: proof as string };
}

describe('F30 private call history', () => {
  it('saves only opted-in trusted sideband captions and scopes recall to the verified customer and shop', async () => {
    const app = await createTestAgent();
    const attach = vi.spyOn(model, 'attachLiveVoiceSession');
    const originalBase = config.PUBLIC_BASE_URL;
    config.PUBLIC_BASE_URL = 'https://synthetic.example.test';
    try {
      const first = await verifyNewInvite(app, shopA, 'Uprivate-customer', 'voice-first');
      const start = (flow: typeof first, saveTranscript: boolean) =>
        app.post('/api/v1/voice/invites/' + flow.invite.id + '/start').set('X-Requested-With', 'nless')
          .set('X-Voice-Proof', flow.proof).send({ accepted: true, saveTranscript, offerSdp });
      const answer = await start(first, true);
      expect(answer.status).toBe(200);
      const { voiceSessionId } = answer.body.data;
      const send = (sessionId: string, action: string, proof: string, body: object = {}) =>
        app.post('/api/v1/voice/sessions/' + sessionId + '/' + action).set('X-Requested-With', 'nless')
          .set('X-Voice-Proof', proof).send(body);
      const firstCaption: LiveVoiceEvent = {
        type: 'transcript', eventId: 'part-1', speaker: 'customer', text: 'My preferred color is green.', startMs: 0, endMs: 1500,
      };
      const sendFirstCaption = attach.mock.calls[0][0].onEvent;
      await sendFirstCaption(firstCaption);
      await sendFirstCaption(firstCaption);
      expect((await send(voiceSessionId, 'transcript', first.proof, { role: 'assistant', text: 'Fabricated' })).status).toBe(404);
      expect((await send(voiceSessionId, 'end', first.proof)).body.data).toEqual({ ended: true });
      expect((await send(voiceSessionId, 'end', first.proof)).status).toBe(200);
      expect((await getRecentVoiceHistory(shopA, first.conversation.customerId))[0].captions).toEqual([
        { role: 'customer', text: firstCaption.text },
      ]);
      expect(await getRecentVoiceHistory(shopB, first.conversation.customerId)).toEqual([]);

      const other = await verifyNewInvite(app, shopA, 'Uprivate-other-customer', 'voice-other');
      expect((await send(voiceSessionId, 'end', other.proof)).status).toBe(404);
      const otherCall = await start(other, false);
      expect(otherCall.status).toBe(200);
      await attach.mock.calls[1][0].onEvent({ ...firstCaption, eventId: 'other-1', text: 'I did not opt in.' });
      const get = (sessionId: string, proof: string) =>
        app.get('/api/v1/voice/sessions/' + sessionId + '/history').set('X-Voice-Proof', proof);
      expect((await get(otherCall.body.data.voiceSessionId, other.proof)).body.data).toEqual({ calls: [] });
      expect((await get(voiceSessionId, other.proof)).status).toBe(404);
      expect((await send(otherCall.body.data.voiceSessionId, 'end', other.proof)).status).toBe(200);
      expect(await getRecentVoiceHistory(shopA, other.conversation.customerId)).toEqual([]);

      const next = await verifyNewInvite(app, shopA, 'Uprivate-customer', 'voice-next');
      const nextCall = await start(next, false);
      expect(nextCall.status).toBe(200);
      const nextHistory = await get(nextCall.body.data.voiceSessionId, next.proof);
      expect(nextHistory.body.data.calls).toEqual([expect.objectContaining({ callId: voiceSessionId, captions: [expect.objectContaining({ text: firstCaption.text })] })]);
      expect((await send(nextCall.body.data.voiceSessionId, 'end', next.proof)).status).toBe(200);
    } finally { config.PUBLIC_BASE_URL = originalBase; attach.mockRestore(); }
  }, 30_000);

  it('rejects a proof and session mint after the invitation expires', async () => {
    const app = await createTestAgent();
    const originalBase = config.PUBLIC_BASE_URL;
    config.PUBLIC_BASE_URL = 'https://synthetic.example.test';
    try {
      const first = await verifyNewInvite(app, shopA, 'Uexpired-customer', 'voice-expired');
      await db.query("UPDATE voice_invites SET expires_at = now() - interval '1 minute' WHERE id = $1 AND business_id = $2", [first.invite.id, shopA]);
      const response = await app.post('/api/v1/voice/invites/' + first.invite.id + '/start').set('X-Requested-With', 'nless')
        .set('X-Voice-Proof', first.proof).send({ accepted: true, saveTranscript: true, offerSdp });
      expect(response.status).toBe(404);
    } finally { config.PUBLIC_BASE_URL = originalBase; }
  }, 15_000);
});
