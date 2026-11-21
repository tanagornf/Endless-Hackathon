export type VoiceToolName = 'search_knowledge' | 'get_price' | 'find_slots' | 'create_booking';

/** One finished caption line relayed by the browser (Realtime transcript events). Text is data, never authority. */
export interface VoiceTranscriptRequest {
  /** Realtime conversation item id (dedup key per session). */
  itemId: string;
  role: 'customer' | 'assistant';
  text: string;
  interrupted?: boolean;
}

export interface VoiceSession {
  voiceSessionId: string;
  businessId: string;
  /** The customer the session acts for (Demo Voice visitor = a 'web' customer row); null = staff test. */
  customerId: string | null;
  conversationId: string | null;
  /** Staff user who opened it (Demo Voice page) or null for a customer-facing page. */
  createdByUserId: string | null;
  state: 'active' | 'ended' | 'expired' | 'capped';
  model: string;
  voice: string;
  mode: 'openai' | 'fake';
  startedAt: string;
  /** min(client secret expiry, startedAt + VOICE_MAX_SECONDS). */
  expiresAt: string;
  /** Server-clock seconds from startedAt to the last tool/usage call or end (never from the browser's clock). */
  secondsUsed: number;
}

export interface VoiceSessionStartResponse {
  voiceSessionId: string;
  /** model.createRealtimeSession().clientSecret — ephemeral, never the API key. */
  clientSecret: string;
  expiresAt: string;
  model: string;
  voice: string;
  mode: 'openai' | 'fake';
  maxSeconds: number;
}

/** One realtime function_call relayed by the browser (response.done → output[] item of type 'function_call'). */
export interface VoiceToolRequest {
  /** The function_call's call_id (echoed back as function_call_output.call_id). */
  callId: string;
  name: VoiceToolName;
  /** Raw JSON string from the model. Data, not authority. */
  arguments: string;
}

export interface VoiceToolResponse {
  callId: string;
  /** JSON string the browser sends as conversation.item.create { type: 'function_call_output', call_id, output }. */
  output: string;
}

export interface VoiceUsageReport {
  /** Realtime response id (dedup key). */
  responseId: string;
  /** response.done.response.usage as received. Validated by core model.recordRealtimeUsage. */
  usage: unknown;
}

export interface VoiceUsageAck {
  usageId: string;
  secondsUsed: number;
  /** true → the cap is reached: the browser closes the RTCPeerConnection. */
  capped: boolean;
}
