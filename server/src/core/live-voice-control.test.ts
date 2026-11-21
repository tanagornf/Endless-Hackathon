import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { attachLiveVoiceTransport } from './live-voice-control';

const wire = vi.hoisted(() => ({
  sent: [] as Array<{ type: string; delegation_id?: string; content?: string }>,
  socket: null as unknown as { emit(event: string, value?: unknown): void },
  url: '',
}));

vi.mock('ws', () => ({
  WebSocket: class TestSocket extends EventEmitter {
    static CONNECTING = 0;
    static OPEN = 1;
    readyState = 0;

    constructor(url: string) {
      super();
      wire.url = url;
      wire.socket = this;
      queueMicrotask(() => { this.readyState = 1; this.emit('open'); });
    }

    send(value: string, callback: () => void) {
      wire.sent.push(JSON.parse(value));
      callback();
    }

    close() { this.readyState = 3; this.emit('close'); }
    terminate() { this.close(); }
  },
}));

function push(value: object) {
  wire.socket.emit('message', Buffer.from(JSON.stringify(value)));
}

describe('Live voice controls', () => {
  it('closes the fake adapter locally once', async () => {
    const onEvent = vi.fn();
    const control = await attachLiveVoiceTransport({ providerSessionId: 'fake-test', onEvent }, 'fake');
    await expect(control.close()).resolves.toEqual({ confirmed: true, duration: { seconds: 0, activeSeconds: 0, pausedSeconds: 0 } });
    await control.close();
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(wire.url).toBe('');
  });

  it('accepts one trusted delegation and waits for the provider duration on close', async () => {
    wire.sent.length = 0;
    const onEvent = vi.fn();
    const control = await attachLiveVoiceTransport({ providerSessionId: 'live-test', onEvent }, 'openai');
    expect(wire.url).toBe('wss://api.openai.com/v1/live/sessions/live-test/attach');
    await expect(control.sendCommentary('delegation-test', '1490 THB')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const event = { type: 'session.delegation.created', event_id: 'evt-1', offset_ms: 850,
      delegation: { id: 'delegation-test', target: 'client' } };
    push(event);
    push(event);
    await control.sendCommentary('delegation-test', '1490 THB');
    await expect(control.sendCommentary('delegation-test', '1490 THB')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(wire.sent[0]).toMatchObject({ type: 'session.commentary.append', delegation_id: 'delegation-test', content: '1490 THB' });

    const result = control.close();
    expect(control.close()).toBe(result);
    push({ type: 'session.closed', event_id: 'evt-2', usage: { seconds: 3.5, active_seconds: 3, paused_seconds: 0.5 } });
    await expect(result).resolves.toEqual({ confirmed: true, duration: { seconds: 3.5, activeSeconds: 3, pausedSeconds: 0.5 } });
    expect(wire.sent.filter((event) => event.type === 'session.close')).toHaveLength(1);
  });

  it('reports transport loss without fabricating provider duration', async () => {
    const onEvent = vi.fn();
    const control = await attachLiveVoiceTransport({ providerSessionId: 'live-test', onEvent }, 'openai');
    wire.socket.emit('close');
    await expect(control.close()).resolves.toEqual({ confirmed: false, duration: null });
    expect(onEvent).toHaveBeenCalledWith({ type: 'error', code: 'connection_lost' });
  });
});
