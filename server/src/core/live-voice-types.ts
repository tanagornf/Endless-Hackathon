import type { UsageAttribution } from './types';

export interface ModelLiveVoiceSessionInput {
  usage: UsageAttribution;
  customerId: string | null;
  offerSdp: string;
  instructions: string;
  signal?: AbortSignal;
}

export interface ModelLiveVoiceSession {
  providerSessionId: string;
  answerSdp: string;
  model: string;
  mode: 'openai' | 'fake';
}

export interface LiveVoiceDuration {
  seconds: number;
  activeSeconds?: number;
  pausedSeconds?: number;
}

export interface LiveVoiceCloseResult {
  confirmed: boolean;
  duration: LiveVoiceDuration | null;
}

export type LiveVoiceEvent =
  | { type: 'transcript'; eventId: string; speaker: 'customer' | 'assistant'; text: string; startMs: number; endMs: number }
  | { type: 'delegation'; eventId: string; delegationId: string; offsetMs: number }
  | { type: 'usage'; eventId: string; duration: LiveVoiceDuration }
  | ({ type: 'closed'; eventId: string } & LiveVoiceCloseResult)
  | { type: 'error'; code: 'provider_error' | 'connection_lost' | 'handler_failed' };

export interface ModelLiveVoiceAttachInput {
  providerSessionId: string;
  onEvent: (event: LiveVoiceEvent) => void | Promise<void>;
  maxSeconds?: number;
  signal?: AbortSignal;
}

export interface LiveVoiceControl {
  sendCommentary(delegationId: string, text: string): Promise<void>;
  close(): Promise<LiveVoiceCloseResult>;
}

export interface ModelLiveVoiceUsageInput {
  usage: UsageAttribution;
  providerSessionId: string;
  /** Final duration observed from the provider close, or null when close could not be confirmed. */
  duration: LiveVoiceDuration | null;
}
