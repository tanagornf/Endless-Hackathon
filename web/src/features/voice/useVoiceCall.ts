import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../../core';
import type { VoiceLiveCallStatus, VoiceLiveStartResponse } from '@nless/shared/features/voice/types';

export interface VoiceCaption { id: string; role: 'customer' | 'assistant'; text: string }
export type CallState = 'ready' | 'microphone' | 'connecting' | 'listening' | 'speaking' | 'ended' | 'unsupported' | 'denied' | 'failed' | 'simulated';

export function voiceRequest<T>(path: string, method: 'GET' | 'POST', proof?: string, body?: unknown, keepalive = false) {
  return apiRequest<T>('/api/v1/voice' + path, {
    method, redirectOnUnauthorized: false, cache: 'no-store', keepalive,
    headers: proof ? { 'X-Voice-Proof': proof } : undefined,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

interface ActiveCall {
  proof: string;
  stream?: MediaStream;
  peer?: RTCPeerConnection;
  id?: string;
  expiry?: ReturnType<typeof setTimeout>;
  poll?: ReturnType<typeof setInterval>;
  connectionTimeout?: ReturnType<typeof setTimeout>;
}

const sessionPath = (id: string, action: string) => '/sessions/' + id + '/' + action;

export function useVoiceCall(inviteId: string | null, proof: string | undefined) {
  const active = useRef<ActiveCall | null>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const [state, setState] = useState<CallState>('ready');
  const [sessionId, setSessionId] = useState<string>();
  const [captions, setCaptions] = useState<VoiceCaption[]>([]);
  const [needsAudioTap, setNeedsAudioTap] = useState(false);

  const stop = useCallback((next: CallState = 'ended', visible = true) => {
    const call = active.current;
    if (!call) return;
    active.current = null;
    clearTimeout(call.expiry);
    clearTimeout(call.connectionTimeout);
    clearInterval(call.poll);
    call.peer?.close();
    call.stream?.getTracks().forEach((track) => track.stop());
    if (audio.current) audio.current.srcObject = null;
    if (call.id) void voiceRequest(sessionPath(call.id, 'end'), 'POST', call.proof, {}, true).catch(() => {});
    if (visible) {
      setNeedsAudioTap(false);
      setState(next);
    }
  }, []);

  useEffect(() => {
    const close = () => stop('ended', false);
    window.addEventListener('pagehide', close);
    return () => {
      window.removeEventListener('pagehide', close);
      close();
    };
  }, [stop]);

  const playAudio = () => {
    if (audio.current) void audio.current.play().then(() => setNeedsAudioTap(false), () => setNeedsAudioTap(true));
  };

  async function start(saveTranscript: boolean) {
    if (!inviteId || !proof || active.current || state !== 'ready') return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) {
      setState('unsupported');
      return;
    }
    const call: ActiveCall = { proof };
    active.current = call;
    setState('microphone');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (active.current !== call) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      call.stream = stream;
    } catch {
      if (active.current === call) stop('denied');
      return;
    }

    setState('connecting');
    try {
      const peer = new RTCPeerConnection();
      call.peer = peer;
      peer.ontrack = (event) => {
        if (!audio.current || active.current !== call) return;
        audio.current.srcObject = event.streams[0] ?? new MediaStream([event.track]);
        playAudio();
      };
      peer.onconnectionstatechange = () => {
        if (active.current !== call) return;
        if (peer.connectionState === 'connected') {
          clearTimeout(call.connectionTimeout);
          setState('listening');
        } else if (peer.connectionState === 'failed') stop('failed');
        else if (peer.connectionState === 'disconnected') {
          clearTimeout(call.connectionTimeout);
          call.connectionTimeout = setTimeout(() => stop('failed'), 8_000);
        }
      };
      call.stream.getTracks().forEach((track) => peer.addTrack(track, call.stream!));
      peer.createDataChannel('oai-events');
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      if (active.current !== call) return;
      const session = await voiceRequest<VoiceLiveStartResponse>('/invites/' + inviteId + '/start', 'POST', proof,
        { accepted: true, saveTranscript, offerSdp: peer.localDescription?.sdp ?? offer.sdp });
      if (active.current !== call) {
        void voiceRequest(sessionPath(session.voiceSessionId, 'end'), 'POST', proof, {}, true).catch(() => {});
        return;
      }
      call.id = session.voiceSessionId;
      setSessionId(session.voiceSessionId);
      if (session.mode !== 'openai') {
        stop('simulated');
        return;
      }
      if (!session.answerSdp) throw new Error('Voice answer is missing');
      call.expiry = setTimeout(() => stop(), Math.max(0, Date.parse(session.expiresAt) - Date.now()));
      call.connectionTimeout = setTimeout(() => stop('failed'), 20_000);
      await peer.setRemoteDescription({ type: 'answer', sdp: session.answerSdp });
      if (active.current !== call) return;
      let statusPending = false;
      let missedStatuses = 0;
      let lastStatusAt = Date.now();
      call.poll = setInterval(() => {
        if (Date.now() - lastStatusAt > 7_500) { stop('failed'); return; }
        if (statusPending) return;
        statusPending = true;
        void voiceRequest<VoiceLiveCallStatus>(sessionPath(session.voiceSessionId, 'status'), 'GET', proof)
          .then((status) => {
            if (active.current !== call) return;
            missedStatuses = 0;
            lastStatusAt = Date.now();
            setCaptions(status.captions);
            if (status.ended) stop();
          }).catch(() => {
            if (active.current === call && ++missedStatuses >= 2) stop('failed');
          })
          .finally(() => { statusPending = false; });
      }, 2_500);
    } catch {
      if (active.current === call) stop('failed');
    }
  }

  return { state, sessionId, captions, audio, needsAudioTap, playAudio, start, stop, retryPermission: () => setState('ready') };
}
