import type { AuthScope, AuthUser, BusinessRecord, Channel, DeliveryMode, JobState, JsonSchema, MessageAuthor, MessageOrigin, MessagePart } from '@nless/shared/core/types';
import type { MembershipRole, PermissionKey } from '@nless/shared/core/permissions';
import type { FeatureFlagView } from '@nless/shared/core/types';
import type { FeatureId, FolderSlug, MigrationOwner } from '@nless/shared/core/features';
import type { SeedData } from '@nless/shared/core/fixtures';
import type { Application, Request, Response } from 'express';
import type { ZodType } from 'zod';
import type { LiveVoiceControl, ModelLiveVoiceAttachInput, ModelLiveVoiceSession, ModelLiveVoiceSessionInput, ModelLiveVoiceUsageInput } from './live-voice-types';
import type { ShopCorrectionAnalysisInput } from './shop-correction-analysis';
export type * from './live-voice-types';
export type { ShopCorrectionAnalysisInput } from './shop-correction-analysis';

/** Result of getBusiness(): the business, the verified scope, and the user. */
export interface BusinessContext {
  business: BusinessRecord;
  scope: AuthScope & { businessId: string; role: MembershipRole };
  user: AuthUser;
}

export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}

export interface DbExecutor {
  /** Parameterized only ($1..$n). Never string-concatenate user input into SQL. */
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
  /** Exactly one row or throws AppError('NOT_FOUND'). */
  one<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<T>;
  /** Zero or one row. */
  maybeOne<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<T | null>;
}

export interface DbClient extends DbExecutor {
  /** BEGIN/COMMIT/ROLLBACK with a released client. Never call model.* or a provider inside. */
  tx<T>(fn: (tx: DbExecutor) => Promise<T>): Promise<T>;
  /** Session advisory lock on hashtext(key) (e.g. `conversation:<id>`), released in finally. Per-conversation ordering. */
  withAdvisoryLock<T>(key: string, fn: () => Promise<T>): Promise<T>;
  /** `[0.1,0.2,...]` literal for a pgvector parameter. */
  toVector(values: readonly number[]): string;
}

export interface EnqueueOptions {
  /** Unique across all jobs. Same key again → no new job, returns the existing id with deduped: true. */
  dedupKey?: string;
  businessId?: string;
  /** ISO time; default now. */
  runAt?: string;
  /** Default 5 (JOBS_MAX_ATTEMPTS). */
  maxAttempts?: number;
  /** Jobs with the same lockKey never run concurrently (worker takes db.withAdvisoryLock(lockKey)). */
  lockKey?: string;
}

export interface JobContext<P> {
  id: string;
  type: string;
  payload: P;
  businessId: string | null;
  /** 1-based. */
  attempt: number;
  maxAttempts: number;
  /** Aborted when the lease expires or the server shuts down. */
  signal: AbortSignal;
  progress(done: number, total: number): Promise<void>;
}

/**
 * Throw → retry with backoff (5s × attempt²) until maxAttempts, then state 'dead' (visible in /ops).
 * Throw AppError with retryable:false → 'dead' immediately. Return { retryAt } → reschedule without
 * counting a failure. Handlers must be idempotent: a crash after commit re-runs the job.
 */
export type JobHandler<P = any> = (job: JobContext<P>) => Promise<void | { retryAt: string } | { result: Record<string, unknown> }>;

export interface JobsApi {
  /** Durable insert (survives restart). Pending is not done: never report a side effect before the handler finishes. */
  enqueue<P extends Record<string, unknown>>(type: string, payload: P, opts?: EnqueueOptions): Promise<{ jobId: string; deduped: boolean }>;
  get(jobId: string): Promise<{ id: string; type: string; state: JobState; attempts: number; lastError: string | null; progress: { done: number; total: number } | null } | null>;
}

/** Recurring job (F35 cron). Core enqueues `<name>` every `everySeconds` with dedupKey `<name>@<slot>`. */
export interface ScheduleDefinition {
  name: string;
  everySeconds: number;
  handler: JobHandler<{ slot: string }>;
}

export interface UsageAttribution {
  featureId: FeatureId;
  /**
   * Short label, e.g. 'reply', 'classify', 'extract', 'rerank', 'summarize', 'translate', 'slip-read',
   * 'embed-document', 'embed-query', 'moderate', 'transcribe', 'voice.session', 'voice.turn', 'voice.transcribe'.
   */
  purpose: string;
  businessId: string | null;
  accountId?: string | null;
  conversationId?: string | null;
  turnId?: string | null;
}

export interface ModelToolCall {
  /** OpenAI `call_id` of the function_call item. Answer it with { role: 'tool', toolCallId: <this id> }. */
  id: string;
  name: string;
  /**
   * JSON.parse of the function_call `arguments` string ({} when it does not parse). Validate with zod before use:
   * model output is data, not authority.
   */
  arguments: Record<string, unknown>;
}

/**
 * One input content part. Core maps it to a Responses input item: text → input_text · image → input_image
 * { image_url: <data URL>, detail } · file → input_file { filename, file_data: <data URL> }.
 * Image and file parts only in 'user' messages. Give exactly one of dataUrl / uploadRef. uploadRef = core `files` id
 * (StoredFile.id): core reads it with storage.read(id, { businessId: usage.businessId }) (missing or another business's
 * file → VALIDATION_ERROR) and sends it as base64. Never a URL taken from a customer, a web page or model text.
 * Images: PNG / JPEG / WEBP / non-animated GIF (slips: detail 'high'). Files: PDF, < 50 MB in total per request.
 */
export type ModelContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; dataUrl?: string; uploadRef?: string; detail?: 'low' | 'high' | 'auto' }
  | { type: 'file'; filename: string; dataUrl?: string; uploadRef?: string };

/**
 * 'developer' = rules; it replaces 'system' ('system' is still accepted as an alias and sent as 'developer'). Put the
 * stable rules in the FIRST developer message (not `instructions`) so the prefix hits the prompt cache.
 * 'tool' = the result of one ModelToolCall → sent as function_call_output { call_id: toolCallId, output: content }
 * (content = JSON string of the result).
 */
export type ModelMessage =
  | { role: 'developer' | 'system' | 'user'; content: string | ModelContentPart[] }
  | { role: 'assistant'; content: string; toolCalls?: ModelToolCall[] }
  | { role: 'tool'; toolCallId: string; content: string };

export interface ModelTool {
  name: string;
  description: string;
  /**
   * JSON Schema of the arguments, written for strict mode: every property listed in `required`,
   * `additionalProperties: false` on every object, optional fields typed as a union with "null".
   */
  parameters: JsonSchema;
  /** Sent as the function tool's `strict`. Default true. */
  strict?: boolean;
}

export interface ModelChatInput {
  usage: UsageAttribution;
  /** 'chat' (default) = OPENAI_CHAT_MODEL · 'fast' = OPENAI_CHAT_MODEL_FAST · 'strong' = OPENAI_CHAT_MODEL_STRONG. */
  model?: 'chat' | 'fast' | 'strong';
  messages: ModelMessage[];
  tools?: ModelTool[];
  /** → tool_choice ({ name } forces that function). parallel_tool_calls stays true. */
  toolChoice?: 'auto' | 'none' | 'required' | { name: string };
  /**
   * Structured Outputs → text.format { type: 'json_schema', name, schema, strict } (strict default true, same schema
   * rules as ModelTool.parameters). Result.json = JSON.parse(output_text); still validate it with zod.
   */
  responseFormat?: { name: string; schema: JsonSchema; strict?: boolean };
  /**
   * → reasoning.effort. Default 'low' for 'chat' and 'strong', 'none' for 'fast'. Core sends 'low' instead of 'none'
   * to models that reject 'none' (gpt-6.2-*, i.e. the 'strong' default). There is no temperature parameter.
   */
  reasoningEffort?: 'none' | 'low' | 'medium';
  /** → max_output_tokens. Default MODEL_MAX_OUTPUT_TOKENS (2000). INCLUDES reasoning tokens. Minimum 16. */
  maxOutputTokens?: number;
  /** Default MODEL_TIMEOUT_MS (20000). The single retry must fit inside it. */
  timeoutMs?: number;
  signal?: AbortSignal;
  /**
   * Tool loop: pass the previous round's ModelChatResult.providerState back unchanged (omit it on the first round).
   * It carries the provider's reasoning + function_call items, which store:false means OpenAI cannot look up by id;
   * core replays them in front of the matching { role: 'tool' } messages so reasoning survives the loop. Keep the
   * assistant toolCalls message and the tool messages in `messages` as well (traces and fake mode read them).
   */
  providerState?: unknown;
  /** MODEL_MODE=fake only: scripted output for tests. Ignored in openai mode. */
  fake?: { text?: string; json?: unknown; toolCalls?: ModelToolCall[] };
}

export interface ModelUsage {
  /** usage.input_tokens (includes cached and cache-write tokens). Realtime: text + audio input tokens. */
  inputTokens: number | null;
  /** usage.output_tokens (includes reasoningTokens). */
  outputTokens: number | null;
  /** usage.input_tokens_details.cached_tokens */
  cachedInputTokens: number | null;
  /** usage.input_tokens_details.cache_write_tokens (billed 1.25 × input at the default 30-minute TTL). */
  cacheWriteTokens: number | null;
  /** usage.output_tokens_details.reasoning_tokens (already inside outputTokens, billed as output). */
  reasoningTokens: number | null;
  /**
   * USD × 1e6 from MODEL_PRICE_TABLE (per 1M tokens): (input − cached − cacheWrite) × input + cached × cachedInput
   * + cacheWrite × input × 1.25 + output × output. Realtime prices text and audio tokens separately (audio* rates).
   * null when the price table has no rate for the model (never 0 for unknown). Fake mode: 0.
   */
  costUsdMicros: number | null;
  costReason: 'priced' | 'no_rate' | 'fake_mode' | 'provider_error';
}

export interface ModelChatResult {
  /** output_text ('' on a refusal). */
  text: string;
  json?: unknown;
  toolCalls: ModelToolCall[];
  /**
   * 'tool_calls' = the output has function_call items · 'content_filter' = a refusal content item (or incomplete
   * reason 'content_filter') · 'length' = status 'incomplete' + incomplete_details.reason 'max_output_tokens' ·
   * else 'stop'.
   */
  finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter';
  /** Resolved model id, e.g. 'gpt-6.2-sol'. */
  model: string;
  mode: 'openai' | 'fake';
  usage: ModelUsage;
  usageId: string;
  latencyMs: number;
  /** x-request-id of the response (OpenAI response id is kept on the model_usage row). null in fake mode. */
  requestId: string | null;
  /** Opaque. Set when finishReason is 'tool_calls': pass it back as ModelChatInput.providerState next round. */
  providerState?: unknown;
}

export interface ModelEmbedInput {
  usage: UsageAttribution;
  texts: string[];
  /** Labels usage only: documents and queries use the same model (no input_type). */
  purpose: 'document' | 'query';
}

export interface ModelWebSearchInput {
  /** Short, caller-approved public product keywords. Exclude customer or merchant-private data. */
  query: string;
  language: 'th' | 'en';
  usage: UsageAttribution;
  signal?: AbortSignal;
}

export interface ModelWebSearchResult {
  /** Empty when no completed, cited search result is available. */
  answer: string;
  citations: Array<{ url: string; title: string }>;
  usageId: string;
}

export interface ModelEmbedResult {
  /** One vector per input text, length EMBED_DIM (1536), L2-normalized. */
  vectors: number[][];
  dim: number;
  model: string;
  mode: 'openai' | 'fake';
  usage: ModelUsage;
  usageId: string;
}

export interface ModelModerateInput {
  usage: UsageAttribution;
  text?: string;
  /** Exactly one of dataUrl / uploadRef per image (uploadRef read with usage.businessId, like ModelContentPart). ≤ 20 MB each. */
  images?: { dataUrl?: string; uploadRef?: string }[];
}

export interface ModelModerateResult {
  flagged: boolean;
  /** Categories whose flag is true, e.g. 'harassment', 'hate', 'illicit', 'self-harm', 'sexual', 'violence/graphic'. */
  categories: string[];
  model: string;
  mode: 'openai' | 'fake';
  usageId: string;
}

export interface ModelTranscribeInput {
  usage: UsageAttribution;
  /**
   * Exactly one of uploadRef / bytes. filename MUST carry the extension (flac mp3 mp4 mpeg mpga m4a ogg wav webm);
   * ≤ 25 MB.
   */
  audio: { uploadRef?: string; bytes?: Uint8Array; filename: string };
  /** Default ['th']. */
  languages?: string[];
}

export interface ModelTranscribeResult {
  text: string;
  /** usage.seconds when OpenAI reports a duration, else null. */
  seconds: number | null;
  model: string;
  mode: 'openai' | 'fake';
  usageId: string;
}

export interface ModelRealtimeSessionInput {
  usage: UsageAttribution;
  businessId: string;
  /** Hashed (sha256) into the OpenAI-Safety-Identifier header. null = staff test session without a customer. */
  customerId: string | null;
  /** Thai shop instructions: answer in Thai only, keep it short, use the tools for facts. */
  instructions: string;
  /** Same tool names and schemas as the F10 chat tools. They run on OUR server (F30 tools route), never at OpenAI. */
  tools: ModelTool[];
  /** Client secret lifetime in seconds, 10–7200. Default 600. */
  ttlSeconds?: number;
}

export interface ModelRealtimeSession {
  /** Ephemeral key ('ek_…') for the browser's POST /v1/realtime/calls. The only OpenAI credential that may reach a browser. */
  clientSecret: string;
  expiresAt: string;
  model: string;
  voice: string;
  mode: 'openai' | 'fake';
}

export interface ModelRealtimeUsageInput {
  usage: UsageAttribution;
  /**
   * response.done → response.usage as relayed by the browser. CLIENT-REPORTED: core validates the shape with zod and
   * rejects negative or non-integer counts. The caller (F30) dedups per realtime response id before calling.
   */
  responseUsage: unknown;
}

/** One MODEL_PRICE_TABLE entry: USD per 1M tokens, Standard tier (docs/openai-api.md §1.1, realtime §10.1). */
export interface ModelPriceRate {
  input: number;
  cachedInput: number;
  output: number;
  /** Realtime models only: audio token rates (their text tokens use input / cachedInput / output). */
  audioInput?: number;
  audioCachedInput?: number;
  audioOutput?: number;
}

/** MODEL_PRICE_TABLE parsed: model id → rate. A model id that is missing → costUsdMicros null + costReason 'no_rate'. */
export type ModelPriceTable = Record<string, ModelPriceRate>;

export interface ModelApi {
  createLiveVoiceSession(input: ModelLiveVoiceSessionInput): Promise<ModelLiveVoiceSession>;
  attachLiveVoiceSession(input: ModelLiveVoiceAttachInput): Promise<LiveVoiceControl>;
  recordLiveVoiceUsage(input: ModelLiveVoiceUsageInput): Promise<{ usageId: string; costUsdMicros: number | null }>;

  /**
   * One Responses round: openai.responses.create({ model, input, tools, tool_choice, parallel_tool_calls: true,
   * reasoning: { effort }, text: { verbosity: 'low', format? }, max_output_tokens, store: false,
   * prompt_cache_key: `biz:<businessId>`, safety_identifier: sha256(conversationId ?? businessId),
   * metadata: { purpose, feature_id, conversation_id } }).
   * The CALLER runs the tool loop (F10: ≤ 4 tool calls per turn, then answer from what it has):
   *   r = chat({ messages, tools }); while r.finishReason === 'tool_calls': run each r.toolCalls[i] on our server,
   *   append { role: 'assistant', content: r.text, toolCalls: r.toolCalls } + one { role: 'tool', toolCallId, content }
   *   per call, then r = chat({ messages, tools, providerState: r.providerState }).
   * OpenAI never truncates input (truncation 'disabled' → too long = 400): callers keep messages bounded (getHistory limit).
   * @fake text = input.fake?.text ?? `[fake-model:${usage.purpose}] ` + the last user message's text (text parts joined
   *   with ' ', first 200 chars); json = input.fake?.json; toolCalls = input.fake?.toolCalls ?? [];
   *   finishReason 'tool_calls' + providerState { fake: true } when toolCalls is non-empty, else 'stop' (no providerState);
   *   model = the id the alias maps to; latencyMs 0; requestId null; usage tokens null, costUsdMicros 0,
   *   costReason 'fake_mode'. Deterministic, no network.
   */
  chat(input: ModelChatInput): Promise<ModelChatResult>;
  searchWeb(input: ModelWebSearchInput): Promise<ModelWebSearchResult>;
  analyzeShopCorrection(input: ShopCorrectionAnalysisInput): Promise<ModelChatResult>;
  /**
   * openai.embeddings.create({ model: OPENAI_EMBED_MODEL, input, dimensions: EMBED_DIM }) in batches of ≤ 256 texts
   * (a text over 8,192 tokens → VALIDATION_ERROR). Vectors are unit length → pgvector cosine distance `<=>`.
   * Never mix two embedding models in one index: changing OPENAI_EMBED_MODEL or EMBED_DIM means re-embedding everything.
   * @fake MODEL_MODE=fake: deterministic hashing embedding, dim EMBED_DIM —
   *   tokens = lowercase Latin/digit words (split on non-alphanumerics, SKU kept whole e.g. "a-game-01")
   *            + Thai character bigrams (Thai has no spaces);
   *   for each token: i = fnv1a32(token) % dim; v[i] += (fnv1a32('#' + token) & 1) ? 1 : -1; then L2-normalize
   *   (all-zero → v[0] = 1). Same text → same vector; shared words/bigrams → higher cosine.
   */
  embed(input: ModelEmbedInput): Promise<ModelEmbedResult>;
  /**
   * openai.moderations.create({ model: OPENAI_MODERATION_MODEL, input: [{ type: 'text', text },
   * { type: 'image_url', image_url: { url } }, …] }). Free. flagged = any result flagged. Used by F05 / F06 / F12 on
   * what a shop uploads; a warning signal (Thai coverage is not documented), not the only gate. Neither text nor
   * images → VALIDATION_ERROR.
   * @fake flagged = (text ?? '').includes('[flag]'); categories = flagged ? ['fake'] : []. No network.
   */
  moderate(input: ModelModerateInput): Promise<ModelModerateResult>;
  /**
   * openai.audio.transcriptions.create({ model: OPENAI_TRANSCRIBE_MODEL, file: toFile(bytes, filename), languages })
   * for voice-message files from LINE / Messenger / Instagram (F09 / F17 / F18, stretch; the channel owner decides).
   * Missing or oversize audio, or a filename without a supported extension → VALIDATION_ERROR.
   * @fake text `[fake-transcript] <filename>`, seconds null. No network.
   */
  transcribe(input: ModelTranscribeInput): Promise<ModelTranscribeResult>;
  /**
   * F30 voice. POST /v1/realtime/client_secrets (Authorization: Bearer OPENAI_API_KEY, OpenAI-Safety-Identifier:
   * sha256(customerId ?? businessId); never the retired `OpenAI-Beta: realtime=v1` header) with
   * expires_after { anchor: 'created_at', seconds: ttlSeconds } and session { type: 'realtime',
   * model: OPENAI_REALTIME_MODEL, instructions, output_modalities: ['audio'], reasoning: { effort: 'low' },
   * max_output_tokens: 1024, tools: [{ type: 'function', name, description, parameters }], tool_choice: 'auto',
   * audio: { input: { transcription: { model: OPENAI_REALTIME_TRANSCRIBE_MODEL, languages: ['th'] },
   * turn_detection: { type: 'server_vad', silence_duration_ms: 600, create_response: true, interrupt_response: true },
   * noise_reduction: { type: 'far_field' } }, output: { voice: OPENAI_REALTIME_VOICE } } }.
   * Returns ONLY the secret value + expires_at (never OPENAI_API_KEY). The caller binds it to its own server-side
   * voiceSessionId (VoiceSession). Writes a model_usage row for the mint (no tokens; costUsdMicros 0, 'priced');
   * the conversation's cost arrives through recordRealtimeUsage.
   * @fake clientSecret `fake-ek-<uuid>` (random uuid: tests assert the `fake-ek-` prefix only), expiresAt = now +
   *   ttlSeconds (600), model = OPENAI_REALTIME_MODEL, voice = OPENAI_REALTIME_VOICE. No network (a browser cannot
   *   connect with it, so F30 in fake mode is at most A).
   */
  createRealtimeSession(input: ModelRealtimeSessionInput): Promise<ModelRealtimeSession>;
  /**
   * F30 voice. Stores one response.done usage (input_tokens, output_tokens, input_token_details.{text_tokens,
   * audio_tokens, image_tokens, cached_tokens}, output_token_details.{text_tokens, audio_tokens}) as a model_usage row
   * (purpose e.g. 'voice.turn'; live-transcription usage the same way with 'voice.transcribe'), priced with the
   * realtime text + audio rates of MODEL_PRICE_TABLE. Bad shape → VALIDATION_ERROR, nothing written.
   * @fake same validation; writes the row with costUsdMicros 0 / 'fake_mode' and returns its id.
   */
  recordRealtimeUsage(input: ModelRealtimeUsageInput): Promise<{ usageId: string }>;
}

export interface OutboundDelivery {
  messageId: string;
  conversationId: string;
  businessId: string;
  channel: Channel;
  customerExternalId: string;
  channelAccountId: string | null;
  parts: MessagePart[];
  /** provider_meta of the latest inbound message (e.g. LINE replyToken + expiry, Meta 24-hour messaging window). */
  lastInboundMeta: Record<string, unknown>;
  attempt: number;
}

export interface DeliveryResult {
  state: 'sent' | 'failed' | 'unknown';
  mode: DeliveryMode;
  externalRef?: string | null;
  /** Sandbox senders set this instead of externalRef. */
  simulatedRef?: string | null;
  error?: string;
  /** failed + retryable → the deliver job retries. 'unknown' is never blind-retried (SPEC §7). */
  retryable?: boolean;
}

export interface ChannelSender {
  channel: Channel;
  mode: DeliveryMode;
  send(delivery: OutboundDelivery): Promise<DeliveryResult>;
}

export interface SendToCustomerOptions {
  /**
   * Already saved with inbox saveMessage({ direction: 'outbound' })? Pass its id: core delivers that row
   * and does NOT insert again (the F10 ai.reply flow does this). Omit it: core saves the message first
   * via inbox saveMessage, then delivers.
   */
  messageId?: string;
  author?: Exclude<MessageAuthor, 'customer'>;
  authorUserId?: string | null;
  origin?: MessageOrigin;
  clientRequestId?: string;
  /** Assert tenant: conversation of another business → NOT_FOUND. */
  businessId?: string;
}

export interface SendReceipt {
  messageId: string;
  conversationId: string;
  channel: Channel;
  jobId: string;
  delivery: { mode: DeliveryMode; state: 'pending' };
}

export interface StoredFile {
  id: string;
  businessId: string;
  purpose: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  createdAt: string;
}

export interface StorageApi {
  /** Checks size (UPLOAD_MAX_MB) and `allowedMime`. Rejects with VALIDATION_ERROR. */
  save(input: { businessId: string; uploadedBy: string | null; purpose: string; originalName: string; mimeType: string; bytes: Uint8Array; allowedMime?: string[] }): Promise<StoredFile>;
  /** Null when missing or another business's file (R3). */
  read(fileId: string, opts: { businessId: string }): Promise<{ file: StoredFile; bytes: Uint8Array } | null>;
}

export interface UploadedFile {
  fieldName: string;
  originalName: string;
  mimeType: string;
  size: number;
  bytes: Uint8Array;
}

export interface RouteOptions<B = unknown, Q = unknown> {
  /**
   * 'none' public · 'user' session required (ctx.user) · 'business' path MUST contain `:businessId`,
   * core runs getBusiness + (permission) and sets ctx.business/ctx.scope · 'platform_admin' requirePlatformAdmin
   * (F35 ops routes only).
   * Routes without :businessId whose resource belongs to a business (e.g. /conversations/:id) use 'user'
   * and call ctx.requireBusiness(resource.businessId, key) before reading anything else.
   */
  auth: 'none' | 'user' | 'business' | 'platform_admin';
  permission?: PermissionKey;
  /** Parsed and validated before the handler; failure → 400 VALIDATION_ERROR with issues in details. */
  body?: ZodType<B>;
  query?: ZodType<Q>;
  /** multipart via multer (memory). Files appear in ctx.files. */
  upload?: { field: string; maxFiles?: number; maxMb?: number; accept?: string[] };
  /** One-line purpose: shown in the protocol catalog (/api/v1/_meta/routes, F35 SheetBot replacement). */
  summary?: string;
}

export interface RouteContext<B = unknown, Q = unknown> {
  req: Request;
  /**
   * The response, for cookies only (added in v3): F02 login / signup / invitation-accept call
   * createSession(userId, kind, ctx.res) and logout calls destroySession(ctx.req, ctx.res); the public Demo Chat may set
   * its visitor cookie. Handlers never write the body or status through it: they return a value or an HttpResponse.
   */
  res: Response;
  requestId: string;
  params: Record<string, string>;
  body: B;
  query: Q;
  files: UploadedFile[];
  /** Set for auth 'user' | 'business' | 'platform_admin'. */
  user: AuthUser | null;
  /** Set for auth 'business'. */
  business: BusinessRecord | null;
  scope: AuthScope | null;
  /** getBusiness(req, businessId) + optional requirePermission; sets ctx.business/ctx.scope. */
  requireBusiness(businessId: string, permission?: PermissionKey): Promise<BusinessContext>;
}

/** Non-200 or non-JSON responses. Plain return value = 200 ApiResult. */
export type HttpResponse<T> =
  | { kind: 'json'; status: 201 | 202 | 200; data: T }
  | { kind: 'no_content' }
  | { kind: 'redirect'; location: string }
  | { kind: 'file'; bytes: Uint8Array; mimeType: string; fileName?: string; inline?: boolean };

export type RouteHandler<B, Q, R> = (ctx: RouteContext<B, Q>) => Promise<R | HttpResponse<R>>;

export interface WebhookContext {
  /** Exact bytes for signature checks (LINE x-line-signature, Meta x-hub-signature-256). */
  rawBody: Uint8Array;
  text: string;
  json: unknown;
  headers: Record<string, string | string[] | undefined>;
  params: Record<string, string>;
  query: Record<string, unknown>;
  requestId: string;
}

export interface WebhookResult {
  status: number;
  body?: string | Record<string, unknown>;
  contentType?: string;
}

export type WebhookHandler = (ctx: WebhookContext) => Promise<WebhookResult>;

/**
 * Passed to register(). Paths are relative to `/api/v1` (e.g. '/businesses/:businessId/catalog/items').
 * Core wraps the return value in ApiResult, maps AppError → ApiFailure, enforces CSRF (header
 * `X-Requested-With: nless` + Origin check) on state-changing session routes, and records every route
 * for the protocol catalog. A (method, path) already registered by another feature fails boot naming both.
 */
export interface FeatureApi {
  readFeatureFlags(): Promise<FeatureFlagView[]>;
  get<Q = unknown, R = unknown>(path: string, opts: RouteOptions<never, Q>, handler: RouteHandler<never, Q, R>): void;
  post<B = unknown, Q = unknown, R = unknown>(path: string, opts: RouteOptions<B, Q>, handler: RouteHandler<B, Q, R>): void;
  put<B = unknown, Q = unknown, R = unknown>(path: string, opts: RouteOptions<B, Q>, handler: RouteHandler<B, Q, R>): void;
  patch<B = unknown, Q = unknown, R = unknown>(path: string, opts: RouteOptions<B, Q>, handler: RouteHandler<B, Q, R>): void;
  delete<Q = unknown, R = unknown>(path: string, opts: RouteOptions<never, Q>, handler: RouteHandler<never, Q, R>): void;
  /**
   * Mounted at `/webhooks<path>` (e.g. api.webhook('POST', '/line/:channelId', h)). No session, no CSRF,
   * raw body kept. Verify the provider signature in the handler. Do heavy work in a job; answer fast.
   */
  webhook(method: 'GET' | 'POST', path: string, handler: WebhookHandler): void;
}

/** What server/src/features/<slug>/routes.ts default-exports. Core loads every features/*\/routes.ts at boot. */
export interface FeatureRoutes {
  featureId: FeatureId;
  slug: FolderSlug;
  /** Register HTTP routes, webhooks and channel senders. Runs once at boot. */
  register(api: FeatureApi): void | Promise<void>;
  /** Job handlers by job type (e.g. { 'ai.reply': handler }). A type declared by two features fails boot. */
  jobs?: Record<string, JobHandler>;
  schedules?: ScheduleDefinition[];
  /**
   * Added in v3 (F39 MCP server). Called once at boot after /api and /webhooks are mounted and before the SPA fallback.
   * The feature mounts handlers only under its own fixed prefix (F39: '/mcp'); core fails the boot when two features
   * mount the same prefix. Test apps mount it too, so supertest can reach it.
   */
  mountExpress?(app: Application): void;
}

/**
 * File rules (runner = server/src/core/migrate.ts, `npm run db:migrate`):
 *  - Path: server/src/features/<slug>/migrations/NNN_<snake_name>.sql, NNN = 001, 002 … per feature.
 *    Core (F01+F35): server/src/core/migrations/NNN_<name>.sql, owner 'core'.
 *  - First line REQUIRED: `-- dependsOn: core, catalog` (MigrationOwner list; 'core' is always implied).
 *  - Order: topological over owners (union of their files' dependsOn), ties by slug; inside an owner by NNN.
 *    Cycle or unknown slug → runner fails with the cycle/slug. A dependency with zero migration files yet
 *    → warning, continue (its fake needs no table).
 *  - Each file runs in one transaction; applied ids go to schema_migrations(id, owner, checksum, applied_at).
 *    An applied file whose checksum changed → runner fails: add a new NNN file instead (own lane DB:
 *    `npm run db:reset`).
 *  - Create only your own tables. FK only to core tables or to tables of owners in dependsOn. Never
 *    ALTER/DROP core tables or another feature's tables. Cross-feature id without dependsOn → plain uuid
 *    column + index, no FK.
 */
export interface FeatureMigration {
  /** `<owner>/<file name>`, e.g. 'catalog/001_catalog_items.sql'. */
  id: string;
  owner: MigrationOwner;
  seq: number;
  name: string;
  dependsOn: MigrationOwner[];
  sql: string;
  checksum: string;
}

export interface SeedContext {
  db: DbClient;
  fixtures: SeedData;
  /** alias → deterministic uuid (from SEED; also written to core table seed_aliases). */
  id(alias: string): string;
  log(message: string): void;
}

/**
 * `npm run db:seed` runs core seed, then every features/*\/seed.ts in dependsOn order.
 * Must be idempotent (INSERT … ON CONFLICT DO NOTHING) and use only SEED data.
 */
export interface FeatureSeed {
  featureId: FeatureId;
  dependsOn: MigrationOwner[];
  run(ctx: SeedContext): Promise<void>;
}
