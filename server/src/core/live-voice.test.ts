import { expect, test, vi } from 'vitest';
import { createLiveVoiceTransport, decodeLiveVoiceEvent, priceLiveVoice } from './live-voice';

const scope = {
  usage: { featureId: 'F30' as const, purpose: 'voice.live.create', businessId: 'synthetic-shop' },
  customerId: 'synthetic-person',
  offerSdp: 'v=0\r\ns=synthetic WebRTC offer\r\n',
  instructions: 'Speak briefly and delegate shop facts.',
};

test('creates one server delegated WebRTC session with a hashed safety ID and returns its answer', async () => {
  const post = vi.fn(async () => ({
    session: { id: 'live_synthetic' },
    transport: { type: 'webrtc', sdp: 'v=0\r\ns=synthetic answer\r\n' },
  }));
  const result = await createLiveVoiceTransport(scope, 'synthetic-model', '', post);
  expect(result).toEqual({ providerSessionId: 'live_synthetic', answerSdp: 'v=0\r\ns=synthetic answer\r\n' });
  expect(post).toHaveBeenCalledTimes(1);
  expect(post).toHaveBeenCalledWith(expect.objectContaining({
    session: expect.objectContaining({ model: 'synthetic-model', delegation: { type: 'client' }, store: false,
      client: { data_channel: { allowed_client_events: [], allowed_server_events: [] } },
      safety_identifier: expect.stringMatching(/^[a-f0-9]{64}$/) }),
    transport: { type: 'webrtc', sdp: scope.offerSdp },
  }), expect.any(AbortSignal));
  expect(JSON.stringify(post.mock.calls)).not.toContain(scope.customerId);
});

test('invalid offers and cross-feature input fail before provider work', async () => {
  const post = vi.fn();
  await expect(createLiveVoiceTransport({ ...scope, offerSdp: 'junk' }, 'synthetic-model', '', post)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  await expect(createLiveVoiceTransport({ ...scope, usage: { ...scope.usage, featureId: 'F10' } }, 'synthetic-model', '', post))
    .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  expect(post).not.toHaveBeenCalled();
});

test('accepts only trusted event shapes and preserves final cumulative usage', () => {
  expect(decodeLiveVoiceEvent({ type: 'session.delegation.created', event_id: 'event1', offset_ms: 200,
    delegation: { id: 'call1', target: 'client' } })).toEqual({ type: 'delegation', eventId: 'event1', delegationId: 'call1', offsetMs: 200 });
  expect(decodeLiveVoiceEvent({ type: 'session.delegation.created', event_id: 'event1', offset_ms: 200,
    delegation: { id: 'call1', target: 'responses' } })).toBeNull();
  expect(decodeLiveVoiceEvent({ type: 'session.input_transcript.delta', event_id: 'event2', delta: 'Synthetic request',
    start_ms: 100, end_ms: 200 })).toEqual({ type: 'transcript', eventId: 'event2', speaker: 'customer',
      text: 'Synthetic request', startMs: 100, endMs: 200 });
  expect(decodeLiveVoiceEvent({ type: 'session.closed', event_id: 'event3', usage: {
    seconds: 12, active_seconds: 10, paused_seconds: 2 },
  })).toEqual({ type: 'closed', eventId: 'event3', confirmed: true, duration: { seconds: 12, activeSeconds: 10, pausedSeconds: 2 } });
  expect(decodeLiveVoiceEvent({ type: 'session.closed', event_id: 'event4' })).toEqual({
    type: 'closed', eventId: 'event4', confirmed: true, duration: null,
  });
});

test('prices only final duration with configured rates and rejects impossible splits', () => {
  expect(priceLiveVoice({ seconds: 120, activeSeconds: 60, pausedSeconds: 60 }, 0.05, 0.02)).toBe(70000);
  expect(priceLiveVoice({ seconds: 30 }, 0.05, 0.02)).toBe(25000);
  expect(priceLiveVoice(null, 0.05, 0.02)).toBeNull();
  expect(priceLiveVoice({ seconds: 10 }, undefined, undefined)).toBeNull();
  expect(() => priceLiveVoice({ seconds: 10, activeSeconds: 8, pausedSeconds: 8 }, 0.05, 0.02)).toThrow();
});
