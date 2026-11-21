import { z } from 'zod';
import { AppError, assertRateLimit, defineFeatureRoutes, isFeatureHidden, type RouteContext } from '../../core';
import { getVoiceHistory } from './calls';
import { createVoiceChallenge, voiceChallengeStatus } from './invites';
import { startVoiceCall } from './sessions';
import { endVoiceCall, readVoiceCallStatus, sweepVoiceCalls } from './transport';

const id = z.string().uuid();
const consent = z.object({
  accepted: z.literal(true),
  saveTranscript: z.boolean(),
  offerSdp: z.string().max(65_536).regex(/^v=0\r?\n/),
}).strict();

async function protect(ctx: Pick<RouteContext, 'req' | 'res'>, bucket: string, limit: number, closing = false) {
  if (!closing && await isFeatureHidden('F30')) throw new AppError('NOT_FOUND');
  ctx.res.setHeader('Cache-Control', 'no-store');
  assertRateLimit({ key: 'voice:' + bucket + ':' + ctx.req.ip, limit, windowSeconds: 60 });
  return ctx.req.get('X-Voice-Proof');
}

export default defineFeatureRoutes({
  featureId: 'F30',
  slug: 'voice',
  schedules: [{ name: 'voice.sweep', everySeconds: 30, handler: sweepVoiceCalls }],
  register(api) {
    api.post('/voice/invites/:inviteId/challenges', { auth: 'none', summary: 'Start browser voice verification' }, async (ctx) => {
      await protect(ctx, 'challenge', 12);
      return createVoiceChallenge(id.parse(ctx.params.inviteId));
    });
    api.get('/voice/invites/:inviteId/status', { auth: 'none', summary: 'Check browser voice verification' }, async (ctx) => {
      const proof = await protect(ctx, 'proof-status', 60);
      return voiceChallengeStatus(id.parse(ctx.params.inviteId), proof);
    });
    api.post('/voice/invites/:inviteId/start', { auth: 'none', body: consent, summary: 'Start a consented LINE voice call' }, async (ctx) => {
      const proof = await protect(ctx, 'start', 12);
      return startVoiceCall(id.parse(ctx.params.inviteId), proof, ctx.body.saveTranscript, ctx.body.offerSdp);
    });
    api.get('/voice/sessions/:sessionId/status', { auth: 'none', summary: 'Read active private voice captions' }, async (ctx) => {
      const proof = await protect(ctx, 'call-status', 55);
      return readVoiceCallStatus(id.parse(ctx.params.sessionId), proof);
    });
    api.get('/voice/sessions/:sessionId/history', { auth: 'none', summary: 'Read recent private call history' }, async (ctx) => {
      const proof = await protect(ctx, 'history', 12);
      return getVoiceHistory(id.parse(ctx.params.sessionId), proof);
    });
    api.post('/voice/sessions/:sessionId/end', { auth: 'none', summary: 'End a consented LINE voice call' }, async (ctx) => {
      const proof = await protect(ctx, 'end', 30, true);
      return endVoiceCall(id.parse(ctx.params.sessionId), proof);
    });
  },
});
