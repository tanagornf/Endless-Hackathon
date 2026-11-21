import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { config } from './config';
import { AppError } from './errors';
import type { LiveVoiceDuration, LiveVoiceEvent, ModelLiveVoiceSessionInput } from './live-voice-types';
import type { UsageAttribution } from './types';

export const liveSessionId = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const liveSdp = z.string().max(65_536).regex(/^v=0\r?\n/);
const durationNumber = z.number().finite().min(0).max(86_400);

export function requireLiveVoiceScope(usage: UsageAttribution): string {
  if (usage.featureId !== 'F30' || !usage.businessId) {
    throw new AppError('VALIDATION_ERROR', 'Live voice requires a scoped shop');
  }
  return usage.businessId;
}

const requestInput = z.object({
  customerId: z.string().min(1).max(200).nullable(),
  offerSdp: liveSdp,
  instructions: z.string().trim().min(1).max(16_000),
});
const webrtcAnswer = z.object({
  session: z.object({ id: liveSessionId }),
  transport: z.object({ type: z.literal('webrtc'), sdp: liveSdp }),
});

type PostLiveSession = (body: Record<string, unknown>, signal: AbortSignal) => PromiseLike<unknown>;

export async function createLiveVoiceTransport(input: ModelLiveVoiceSessionInput, model: string, voice: string, post?: PostLiveSession) {
  const businessId = requireLiveVoiceScope(input.usage);
  const parsed = requestInput.safeParse(input);
  if (!parsed.success) throw new AppError('VALIDATION_ERROR', 'Invalid Live WebRTC offer or scope');
  input.signal?.throwIfAborted();
  if (!post) return { providerSessionId: 'fake-live-' + randomUUID(), answerSdp: 'v=0\r\ns=Fake Live voice\r\n' };
  if (!model) throw new AppError('SERVICE_NOT_READY', 'Live voice model is not configured');

  const timeLimit = AbortSignal.timeout(config.MODEL_TIMEOUT_MS);
  const signal = input.signal ? AbortSignal.any([input.signal, timeLimit]) : timeLimit;
  const { customerId, offerSdp, instructions } = parsed.data;
  const reply = await post({
    session: {
      model, instructions, store: false, delegation: { type: 'client' },
      client: { data_channel: { allowed_client_events: [], allowed_server_events: [] } },
      safety_identifier: createHash('sha256').update(businessId + ':' + (customerId ?? 'staff')).digest('hex'),
      ...(voice ? { audio: { output: { voice } } } : {}),
    },
    transport: { type: 'webrtc', sdp: offerSdp },
  }, signal);
  const answer = webrtcAnswer.safeParse(reply);
  if (!answer.success) throw new AppError('PROVIDER_UNAVAILABLE', 'Invalid Live WebRTC response');
  return { providerSessionId: answer.data.session.id, answerSdp: answer.data.transport.sdp };
}

const durationFields = z.object({
  seconds: durationNumber,
  activeSeconds: durationNumber.optional(),
  pausedSeconds: durationNumber.optional(),
}).refine(({ seconds, activeSeconds, pausedSeconds }) => {
  if ((activeSeconds ?? 0) > seconds || (pausedSeconds ?? 0) > seconds) return false;
  return activeSeconds === undefined || pausedSeconds === undefined || Math.abs(activeSeconds + pausedSeconds - seconds) <= 1;
});

export function validateLiveVoiceDuration(value: unknown): LiveVoiceDuration {
  const result = durationFields.safeParse(value);
  if (!result.success) throw new AppError('VALIDATION_ERROR', 'Invalid Live voice duration');
  return result.data;
}

export function priceLiveVoice(duration: LiveVoiceDuration | null, activeUsdPerMinute?: number, pausedUsdPerMinute?: number) {
  if (!duration) return null;
  const { seconds, activeSeconds, pausedSeconds } = validateLiveVoiceDuration(duration);
  const paused = pausedSeconds ?? (activeSeconds === undefined ? 0 : seconds - activeSeconds);
  const active = activeSeconds ?? (seconds - paused);
  if (activeUsdPerMinute === undefined || (paused > 0 && pausedUsdPerMinute === undefined)) return null;
  return Math.round((active * activeUsdPerMinute + paused * (pausedUsdPerMinute ?? 0)) * 1_000_000 / 60);
}

const providerDuration = z.object({
  seconds: durationNumber,
  active_seconds: durationNumber.optional(),
  paused_seconds: durationNumber.optional(),
});

function decodeDuration(value: unknown): LiveVoiceDuration | null {
  const result = providerDuration.safeParse(value);
  if (!result.success) return null;
  const { seconds, active_seconds, paused_seconds } = result.data;
  const decoded = durationFields.safeParse({ seconds, activeSeconds: active_seconds, pausedSeconds: paused_seconds });
  return decoded.success ? decoded.data : null;
}

const eventHead = z.object({ type: z.string(), event_id: liveSessionId }).passthrough();
const transcript = z.object({
  delta: z.string().max(8000), start_ms: z.number().int().nonnegative(), end_ms: z.number().int().nonnegative(),
}).refine(({ start_ms, end_ms }) => end_ms >= start_ms);
const delegation = z.object({
  offset_ms: z.number().int().nonnegative(),
  delegation: z.object({ id: liveSessionId, target: z.literal('client') }),
});

export function decodeLiveVoiceEvent(message: unknown): LiveVoiceEvent | null {
  if (message && typeof message === 'object' && 'type' in message && message.type === 'error') {
    return { type: 'error', code: 'provider_error' };
  }
  const result = eventHead.safeParse(message);
  if (!result.success) return null;
  const { type, event_id: eventId } = result.data;
  switch (type) {
    case 'session.input_transcript.delta':
    case 'session.output_transcript.delta': {
      const data = transcript.safeParse(result.data);
      if (!data.success) return null;
      return { type: 'transcript', eventId, speaker: type === 'session.input_transcript.delta' ? 'customer' : 'assistant',
        text: data.data.delta, startMs: data.data.start_ms, endMs: data.data.end_ms };
    }
    case 'session.delegation.created': {
      const data = delegation.safeParse(result.data);
      return data.success ? { type: 'delegation', eventId, delegationId: data.data.delegation.id, offsetMs: data.data.offset_ms } : null;
    }
    case 'session.usage.updated': {
      const duration = decodeDuration(result.data.usage);
      return duration ? { type: 'usage', eventId, duration } : null;
    }
    case 'session.closed':
      return { type: 'closed', eventId, confirmed: true, duration: decodeDuration(result.data.usage) };
    default:
      return null;
  }
}
