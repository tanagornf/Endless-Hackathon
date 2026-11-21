import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import { config } from './config';
import { AppError } from './errors';
import { decodeLiveVoiceEvent, liveSessionId } from './live-voice';
import type { LiveVoiceCloseResult, LiveVoiceControl, LiveVoiceEvent, ModelLiveVoiceAttachInput } from './live-voice-types';

const unconfirmed: LiveVoiceCloseResult = { confirmed: false, duration: null };
const empty: LiveVoiceCloseResult = { confirmed: true, duration: { seconds: 0, activeSeconds: 0, pausedSeconds: 0 } };
const providerUnavailable = () => new AppError('PROVIDER_UNAVAILABLE', 'Live voice control is unavailable');

async function fakeControl(input: ModelLiveVoiceAttachInput): Promise<LiveVoiceControl> {
  let closed = false;
  return {
    async sendCommentary() {},
    async close() {
      if (!closed) {
        closed = true;
        await input.onEvent({ type: 'closed', eventId: 'fake-' + randomUUID(), ...empty });
      }
      return empty;
    },
  };
}

export async function attachLiveVoiceTransport(input: ModelLiveVoiceAttachInput, mode: 'openai' | 'fake'): Promise<LiveVoiceControl> {
  if (!liveSessionId.safeParse(input.providerSessionId).success) {
    throw new AppError('VALIDATION_ERROR', 'Invalid Live session ID');
  }
  input.signal?.throwIfAborted();
  const maxSeconds = input.maxSeconds ?? config.VOICE_MAX_SECONDS;
  if (!Number.isInteger(maxSeconds) || maxSeconds <= 0 || maxSeconds > config.VOICE_MAX_SECONDS) {
    throw new AppError('VALIDATION_ERROR', 'Invalid Live session limit');
  }
  if (mode === 'fake') return fakeControl(input);

  const socket = new WebSocket('wss://api.openai.com/v1/live/sessions/' + encodeURIComponent(input.providerSessionId) + '/attach', {
    headers: { Authorization: 'Bearer ' + config.OPENAI_API_KEY },
    handshakeTimeout: 5_000,
    maxPayload: 1_048_576,
  });
  const seen = new Set<string>();
  const pendingDelegations = new Set<string>();
  let closing = false;
  let ended = false;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let resolveFinal!: (result: LiveVoiceCloseResult) => void;
  const final = new Promise<LiveVoiceCloseResult>((resolve) => { resolveFinal = resolve; });
  let nextEvent = Promise.resolve();

  function finish(result: LiveVoiceCloseResult) {
    if (ended) return;
    ended = true;
    clearTimeout(closeTimer);
    clearTimeout(deadline);
    input.signal?.removeEventListener('abort', abort);
    resolveFinal(result);
    if (socket.readyState === WebSocket.OPEN) socket.close();
    else if (socket.readyState === WebSocket.CONNECTING) socket.terminate();
  }

  function send(event: Record<string, string>): Promise<void> {
    return new Promise((resolve, reject) => {
      if (socket.readyState !== WebSocket.OPEN) return reject(providerUnavailable());
      socket.send(JSON.stringify(event), (error) => { if (error) reject(providerUnavailable()); else resolve(); });
    });
  }

  function close(): Promise<LiveVoiceCloseResult> {
    if (!closing && !ended) {
      closing = true;
      closeTimer = setTimeout(() => finish(unconfirmed), 5_000).unref();
      void send({ type: 'session.close', event_id: randomUUID() }).catch(() => finish(unconfirmed));
    }
    return final;
  }

  const abort = () => { void close(); };
  input.signal?.addEventListener('abort', abort, { once: true });

  function emit(event: LiveVoiceEvent) {
    nextEvent = nextEvent.then(() => input.onEvent(event)).catch(() => {
      if (ended || closing) return;
      void close();
      void Promise.resolve().then(() => input.onEvent({ type: 'error', code: 'handler_failed' })).catch(() => {});
    });
  }

  function disconnected() {
    if (!ended) {
      finish(unconfirmed);
      emit({ type: 'error', code: 'connection_lost' });
    }
  }

  socket.on('error', disconnected);
  socket.once('close', disconnected);
  socket.on('message', (raw) => {
    let content: unknown;
    try {
      const bytes = Array.isArray(raw) ? Buffer.concat(raw) : Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
      content = JSON.parse(bytes.toString('utf8'));
    } catch {
      return;
    }
    const event = decodeLiveVoiceEvent(content);
    if (!event) return;
    if ('eventId' in event) {
      if (seen.has(event.eventId)) return;
      if (seen.size >= 4096) seen.delete(seen.values().next().value!);
      seen.add(event.eventId);
    }
    if (event.type === 'delegation') {
      if (pendingDelegations.size >= 256 || pendingDelegations.has(event.delegationId)) return;
      pendingDelegations.add(event.delegationId);
    }
    if (event.type === 'closed') finish({ confirmed: event.confirmed, duration: event.duration });
    emit(event);
  });

  await new Promise<void>((resolve, reject) => {
    function cleanup() {
      socket.off('open', opened);
      socket.off('error', failed);
      socket.off('close', failed);
    }
    function opened() {
      cleanup();
      deadline = setTimeout(abort, maxSeconds * 1000).unref();
      resolve();
    }
    function failed() { cleanup(); reject(providerUnavailable()); }
    socket.once('open', opened);
    socket.once('error', failed);
    socket.once('close', failed);
    if (input.signal?.aborted) abort();
  });

  return {
    async sendCommentary(delegationId, text) {
      if (!liveSessionId.safeParse(delegationId).success || !text.trim() || text.length > 1800 || closing || ended) {
        throw new AppError('VALIDATION_ERROR', 'Invalid Live commentary');
      }
      if (!pendingDelegations.delete(delegationId)) {
        throw new AppError('VALIDATION_ERROR', 'Unknown or answered Live delegation');
      }
      await send({ type: 'session.commentary.append', event_id: randomUUID(), delegation_id: delegationId, content: text });
    },
    close,
  };
}
