import { AppError, db, log, model, type LiveVoiceCloseResult, type LiveVoiceControl, type LiveVoiceEvent } from '../../core';
import { appendProviderCaption, authorizeCall, combineCaptions, markVoiceEnded, purgeExpiredVoiceInvites, type CallScope } from './calls';
import { getVoiceFacts } from './tools';

type Segment = Parameters<typeof combineCaptions>[0][number];

interface ActiveVoice {
  control: LiveVoiceControl;
  captions: Segment[];
}

const active = new Map<string, ActiveVoice>();
const noProofOfClose: LiveVoiceCloseResult = { confirmed: false, duration: null };

async function finalize(call: CallScope, result: LiveVoiceCloseResult) {
  try {
    await model.recordLiveVoiceUsage({
      usage: { featureId: 'F30', purpose: 'voice.live.session', businessId: call.business_id, conversationId: call.conversation_id },
      providerSessionId: call.provider_session_id,
      duration: result.confirmed ? result.duration : null,
    });
  } finally {
    await markVoiceEnded(call).catch(() => {});
  }
}

export async function attachVoiceCall(call: CallScope, maxSeconds: number) {
  const captions: Segment[] = [];
  let control: LiveVoiceControl | undefined;
  async function onEvent(event: LiveVoiceEvent) {
    if (event.type === 'transcript') {
      captions.push({ id: event.eventId, role: event.speaker, text: event.text, startMs: event.startMs, endMs: event.endMs });
      if (captions.length > 300) captions.shift();
      await appendProviderCaption(call, event);
    } else if (event.type === 'delegation') {
      if (!control) return;
      const latest = combineCaptions(captions.filter((entry) => entry.startMs <= event.offsetMs + 2_000))
        .findLast(({ role }) => role === 'customer')?.text ?? '';
      let commentary: string;
      try { commentary = await getVoiceFacts(call, latest); }
      catch { commentary = 'I could not verify those shop facts. Ask the customer to try again or return to LINE.'; }
      await control.sendCommentary(event.delegationId, commentary);
    } else if (event.type === 'closed') {
      active.delete(call.id);
      await finalize(call, event);
    } else if (event.type === 'error' && event.code !== 'provider_error') {
      active.delete(call.id);
      await markVoiceEnded(call).catch(() => {});
      await finalize(call, await closeProvider(call, control));
    }
  }
  try {
    control = await model.attachLiveVoiceSession({ providerSessionId: call.provider_session_id, onEvent, maxSeconds });
    active.set(call.id, { control, captions });
  } catch {
    await finalize(call, noProofOfClose).catch(() => log.warn({ voiceSessionId: call.id }, 'Could not finalize voice startup failure'));
    throw new AppError('PROVIDER_UNAVAILABLE', 'Voice audio is unavailable');
  }
}

async function closeProvider(call: CallScope, local?: LiveVoiceControl): Promise<LiveVoiceCloseResult> {
  try {
    if (!local) return await model.closeLiveVoiceSession(call.provider_session_id);
    return await local.close();
  } catch { return noProofOfClose; }
}

async function closeCall(call: CallScope) {
  if (call.ended_at) return;
  const local = active.get(call.id)?.control;
  await markVoiceEnded(call).catch(() => {});
  const result = await closeProvider(call, local);
  active.delete(call.id);
  await finalize(call, result);
}

export async function endVoiceCall(sessionId: string, proof?: string) {
  await closeCall(await authorizeCall(sessionId, proof));
  return { ended: true };
}

export async function readVoiceCallStatus(sessionId: string, proof?: string) {
  const call = await authorizeCall(sessionId, proof);
  const ended = Boolean(call.ended_at || !active.has(call.id) || call.expires_at.getTime() <= Date.now());
  return { ended, captions: combineCaptions(active.get(call.id)?.captions ?? []).slice(-30) };
}

export async function sweepVoiceCalls() {
  const { rows } = await db.query<CallScope>(
    'SELECT * FROM voice_sessions WHERE ended_at IS NULL AND expires_at <= now() AND provider_session_id IS NOT NULL ORDER BY expires_at LIMIT 20');
  for (const call of rows) await closeCall(call).catch(() => log.warn({ voiceSessionId: call.id }, 'Could not close expired voice call'));
  await db.query('UPDATE voice_sessions SET ended_at = expires_at WHERE provider_session_id IS NULL AND ended_at IS NULL AND expires_at <= now()');
  await purgeExpiredVoiceInvites();
}
