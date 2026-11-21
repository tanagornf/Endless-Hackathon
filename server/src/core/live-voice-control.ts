import { randomUUID } from 'node:crypto';
import { WebSocket, type RawData } from 'ws';
import { config } from './config';
import { AppError } from './errors';
import { decodeLiveVoiceEvent, liveSessionId } from './live-voice';
import type { LiveVoiceCloseResult, LiveVoiceControl, LiveVoiceEvent, ModelLiveVoiceAttachInput } from './live-voice-types';

const unconfirmed: LiveVoiceCloseResult = { confirmed: false, duration: null };
const empty: LiveVoiceCloseResult = { confirmed: true, duration: { seconds: 0, activeSeconds: 0, pausedSeconds: 0 } };
const providerUnavailable = () => new AppError('PROVIDER_UNAVAILABLE', 'Live voice control is unavailable');

function openSideband(providerSessionId: string, handshakeTimeout: number) {
  return new WebSocket('wss://api.openai.com/v1/live/sessions/' + encodeURIComponent(providerSessionId) + '/attach', {
    headers: { Authorization: 'Bearer ' + config.OPENAI_API_KEY },
    handshakeTimeout,
    maxPayload: 1_048_576,
  });
}

function receive(raw: RawData): LiveVoiceEvent | null {
  try {
    const bytes = Array.isArray(raw) ? Buffer.concat(raw) : Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    return decodeLiveVoiceEvent(JSON.parse(bytes.toString('utf8')));
  } catch {
    return null;
  }
}

export async function recoverLiveVoiceTransport(providerSessionId: string, mode: 'openai' | 'fake'): Promise<LiveVoiceCloseResult> {
  if (!liveSessionId.safeParse(providerSessionId).success) {
    throw new AppError('VALIDATION_ERROR', 'Invalid Live session ID');
  }
  if (mode === 'fake') return empty;

  return new Promise((resolve) => {
    const socket = openSideband(providerSessionId, 2000);
    let finished = false;
    const timer = setTimeout(() => finish(unconfirmed), 3500).unref();
    function finish(result: LiveVoiceCloseResult) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve(result);
      if (socket.readyState === WebSocket.OPEN) socket.close();
      else if (socket.readyState === WebSocket.CONNECTING) socket.terminate();
    }

    socket.once('open', () => {
      if (finished) return;
      socket.send(JSON.stringify({ type: 'session.close', event_id: randomUUID() }), (error) => {
        if (error) finish(unconfirmed);
      });
    });
    socket.on('error', () => finish(unconfirmed));
    socket.once('close', () => finish(unconfirmed));
    socket.on('message', (raw) => {
      const event = receive(raw);
      if (event?.type === 'closed') finish({ confirmed: event.confirmed, duration: event.duration });
    });
  });
}

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

  const socket = openSideband(input.providerSessionId, 5_000);
  const seen = new Set<string>();
  const pendingDelegations = new Set<string>();
  let closing = false;
  let ended = false;
  let recovering = false;
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
      closeTimer = setTimeout(recover, 2_000).unref();
      void send({ type: 'session.close', event_id: randomUUID() }).catch(recover);
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

  function recover() {
    if (ended || recovering) return;
    closing = true;
    recovering = true;
    clearTimeout(closeTimer);
    // Stop media through the caller even if a transcript or delegation callback is busy.
    void Promise.resolve().then(() => input.onEvent({ type: 'error', code: 'connection_lost' })).catch(() => {});
    void recoverLiveVoiceTransport(input.providerSessionId, mode).then(finish, () => finish(unconfirmed));
  }

  socket.on('error', recover);
  socket.once('close', recover);
  socket.on('message', (raw) => {
    const event = receive(raw);
    if (!event) return;
    if ('eventId' in event) {
      if (seen.has(event.eventId)) return;
      if (seen.size >= 4096) seen.delete(seen.values().next().value!);
      seen.add(event.eventId);
    }
    if (event.type === 'delegation') {
      if (closing || ended) return;
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
