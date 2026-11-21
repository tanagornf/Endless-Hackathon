import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useVoiceCall } from './useVoiceCall';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../../core', () => ({ apiRequest: request }));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  request.mockReset();
});

it('waits for the explicit start action and promptly tears down the mic and connection when server control ends', async () => {
  vi.useFakeTimers();
  const previousMedia = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
  const stopTrack = vi.fn();
  const acquire = vi.fn().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] });
  const peer = {
    addTrack: vi.fn(),
    createDataChannel: vi.fn(),
    createOffer: vi.fn().mockResolvedValue({ sdp: 'v=0\r\ns=Browser' }),
    setLocalDescription: vi.fn().mockResolvedValue(undefined),
    setRemoteDescription: vi.fn().mockResolvedValue(undefined),
    close: vi.fn(),
  };
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: acquire } });
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('RTCPeerConnection', class { constructor() { return peer; } });
  request.mockImplementation(async (path: string) => path.endsWith('/start')
    ? { voiceSessionId: 'call', answerSdp: 'v=0\r\ns=Server', expiresAt: new Date(Date.now() + 120_000).toISOString(), mode: 'openai' }
    : path.endsWith('/status') ? { ended: true, captions: [] } : { ended: true });

  try {
    const { result } = renderHook(() => useVoiceCall('invite', 'private-browser-proof'));
    expect(acquire).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
    await act(() => result.current.start(false));
    expect(acquire).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith('/api/v1/voice/invites/invite/start', expect.objectContaining({
      body: JSON.stringify({ accepted: true, saveTranscript: false, offerSdp: 'v=0\r\ns=Browser' }),
      headers: { 'X-Voice-Proof': 'private-browser-proof' },
    }));
    expect(peer.setRemoteDescription).toHaveBeenCalledWith({ type: 'answer', sdp: 'v=0\r\ns=Server' });

    await act(() => vi.advanceTimersByTimeAsync(2_500));
    expect(result.current.state).toBe('ended');
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(peer.close).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith('/api/v1/voice/sessions/call/end', expect.objectContaining({ keepalive: true }));
  } finally {
    if (previousMedia) Object.defineProperty(navigator, 'mediaDevices', previousMedia);
    else Reflect.deleteProperty(navigator, 'mediaDevices');
  }
});
