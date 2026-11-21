import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import OpenAI from 'openai';
import { z } from 'zod';
import { config } from './config';
import { db } from './db';
import { AppError } from './errors';
import { log } from './log';
import { storage } from './storage';
import type { ModelApi, ModelChatInput, ModelChatResult, ModelContentPart, ModelUsage, UsageAttribution } from './types';

const mode = config.MODEL_MODE;
const provider = mode === 'openai' ? new OpenAI({ apiKey: config.OPENAI_API_KEY, baseURL: config.OPENAI_BASE_URL, maxRetries: 0, timeout: config.MODEL_TIMEOUT_MS }) : null;
const aliases = { chat: config.OPENAI_CHAT_MODEL, fast: config.OPENAI_CHAT_MODEL_FAST, strong: config.OPENAI_CHAT_MODEL_STRONG };
type Counts = Pick<ModelUsage, 'inputTokens' | 'outputTokens' | 'cachedInputTokens' | 'cacheWriteTokens' | 'reasoningTokens'>;
const noCounts: Counts = { inputTokens: null, outputTokens: null, cachedInputTokens: null, cacheWriteTokens: null, reasoningTokens: null };
type Kind = 'chat' | 'embed' | 'moderate' | 'transcribe' | 'realtime';

export function computeCostMicros(model: string, counts: Counts, audio?: { input: number; output: number; cached: number }): Pick<ModelUsage, 'costUsdMicros' | 'costReason'> {
  if (mode === 'fake') return { costUsdMicros: 0, costReason: 'fake_mode' };
  const rates = config.MODEL_PRICE_TABLE[model];
  if (!rates) return { costUsdMicros: null, costReason: 'no_rate' };
  const input = Math.max(0, (counts.inputTokens ?? 0) - (audio?.input ?? 0));
  const cached = Math.min(input, Math.max(0, (counts.cachedInputTokens ?? 0) - (audio?.cached ?? 0)));
  const cacheWrites = Math.min(input - cached, counts.cacheWriteTokens ?? 0);
  const output = Math.max(0, (counts.outputTokens ?? 0) - (audio?.output ?? 0));
  const cost = (input - cached - cacheWrites) * rates.input + cached * rates.cachedInput
    + cacheWrites * rates.input * 1.25 + output * rates.output;
  const audioCost = audio ? (audio.input - audio.cached) * (rates.audioInput ?? 0)
    + audio.cached * (rates.audioCachedInput ?? 0) + audio.output * (rates.audioOutput ?? 0) : 0;
  return { costUsdMicros: Math.round(cost + audioCost), costReason: 'priced' };
}
type ModelRecord = {
  usage?: Counts;
  requestId?: string | null;
  responseId?: string | null;
  finishReason?: string;
  error?: AppError;
  audio?: { input: number; output: number; cached: number };
  zeroCost?: boolean;
};
async function record(kind: Kind, usage: UsageAttribution, model: string, latencyMs: number, data: ModelRecord = {}) {
  const counts = data.usage ?? noCounts;
  const price = data.error ? { costUsdMicros: null, costReason: 'provider_error' as const }
    : data.zeroCost && mode === 'openai' ? { costUsdMicros: 0, costReason: 'priced' as const }
      : computeCostMicros(model, counts, data.audio);
  const result = { ...counts, ...price };
  const sql = 'INSERT INTO model_usage (business_id,account_id,conversation_id,turn_id,feature_id,purpose,kind,mode,model,'
    + 'input_tokens,output_tokens,cached_input_tokens,cache_write_tokens,reasoning_tokens,cost_usd_micros,cost_reason,'
    + 'latency_ms,finish_reason,error_code,request_id,response_id,audio_input_tokens,audio_output_tokens) '
    + 'VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23) RETURNING id';
  const row = await db.one<{ id: string }>(sql, [
    usage.businessId, usage.accountId ?? null, usage.conversationId ?? null, usage.turnId ?? null, usage.featureId, usage.purpose,
    kind, mode, model, result.inputTokens, result.outputTokens, result.cachedInputTokens, result.cacheWriteTokens,
    result.reasoningTokens, result.costUsdMicros, result.costReason, latencyMs, data.finishReason ?? null,
    data.error?.code ?? null, data.requestId ?? null, data.responseId ?? null, data.audio?.input ?? null, data.audio?.output ?? null,
  ]);
  log.info({ purpose: usage.purpose, mode, model, latencyMs, inputTokens: result.inputTokens, outputTokens: result.outputTokens, costUsdMicros: result.costUsdMicros, providerRequestId: data.requestId }, 'Model usage');
  return { usage: result, usageId: row.id };
}

export function classifyOpenAIError(cause: unknown): AppError {
  if (cause instanceof AppError) return cause;
  const error = cause as { status?: number; code?: string; error?: { code?: string } } | null;
  const code = error?.code ?? error?.error?.code;
  if (error?.status === 429 && ['insufficient_quota', 'credit_balance_exhausted', 'project_spend_limit_exceeded', 'organization_spend_limit_exceeded', 'organization_usage_limit_exceeded'].includes(code ?? '')) {
    return new AppError('PROVIDER_BUDGET_EXHAUSTED', 'Model budget is exhausted');
  }
  if (error?.status === 429 || (error?.status === 503 && code === 'server_is_overloaded')) {
    return new AppError('RATE_LIMITED', 'Model provider is busy', { retryable: true });
  }
  return new AppError('PROVIDER_UNAVAILABLE', 'Model provider is unavailable', { retryable: !error?.status || error.status >= 500 || error.status === 408 });
}

export async function withDeadlineRetry<T>(fn: (signal: AbortSignal) => Promise<T>, timeoutMs: number, caller?: AbortSignal): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  const clock = AbortSignal.timeout(timeoutMs);
  const signal = caller ? AbortSignal.any([caller, clock]) : clock;
  for (let attempt = 0; ; attempt++) {
    try {
      signal.throwIfAborted();
      return await fn(signal);
    } catch (cause) {
      const error = classifyOpenAIError(cause);
      if (attempt || !error.retryable || signal.aborted) throw error;
      const headers = (cause as { headers?: Headers } | null)?.headers;
      const retry = headers?.get('retry-after');
      const wait = retry ? (/^\d+(?:\.\d+)?$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - Date.now()) : 250;
      const time = Math.max(0, Number.isFinite(wait) ? wait : 250) + Math.floor(Math.random() * 75);
      if (Date.now() + time >= deadline) throw error;
      try { await delay(time, undefined, { signal }); }
      catch { throw error; }
    }
  }
}

async function approvedData(part: { dataUrl?: string; uploadRef?: string }, usage: UsageAttribution, kind: 'image' | 'file'): Promise<string> {
  if (Boolean(part.dataUrl) === Boolean(part.uploadRef)) throw new AppError('VALIDATION_ERROR', 'Exactly one attachment source is required');
  let data = part.dataUrl;
  if (part.uploadRef && usage.businessId) {
    const file = await storage.read(part.uploadRef, { businessId: usage.businessId });
    if (file) data = 'data:' + file.file.mimeType + ';base64,' + Buffer.from(file.bytes).toString('base64');
  }
  const match = /^data:([^;,]+);base64,([a-z0-9+/]+={0,2})$/i.exec(data ?? '');
  const permitted = kind === 'image' ? ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] : ['application/pdf'];
  const limit = kind === 'image' ? 20 : 50;
  if (!match || !permitted.includes(match[1].toLowerCase()) || match[2].length * 0.75 >= limit * 1024 * 1024) {
    throw new AppError('VALIDATION_ERROR', 'Attachment type or size is not supported');
  }
  return data!;
}

type ResponseInput = OpenAI.Responses.ResponseInput;
type Replay = { calls: string[]; items: ResponseInput };
function replayState(value: unknown): Replay[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry) => entry && Array.isArray(entry.calls) && Array.isArray(entry.items));
}
export async function buildResponsesRequest(input: ModelChatInput): Promise<OpenAI.Responses.ResponseCreateParamsNonStreaming> {
  const alias = input.model ?? 'chat';
  const model = aliases[alias];
  const requested = input.reasoningEffort ?? (alias === 'fast' ? 'none' : 'low');
  const effort = requested === 'none' && /^gpt-6\.2-/.test(model) ? 'low' : requested;
  const records: ResponseInput = [];
  const replay = replayState(input.providerState);
  let fileBytes = 0;
  for (const message of input.messages) {
    if (message.role === 'tool') {
      records.push({ type: 'function_call_output', call_id: message.toolCallId, output: message.content });
    } else if (message.role === 'assistant') {
      if (message.content) records.push({ role: 'assistant', content: message.content });
      const cached = replay.find((value) => message.toolCalls?.some((call) => value.calls.includes(call.id)));
      if (cached) records.push(...cached.items);
      else for (const value of message.toolCalls ?? []) records.push({ type: 'function_call', call_id: value.id, name: value.name, arguments: JSON.stringify(value.arguments) });
    } else {
      const role = message.role === 'system' ? 'developer' : message.role;
      const parts: OpenAI.Responses.ResponseInputContent[] = [];
      const source: ModelContentPart[] = typeof message.content === 'string' ? [{ type: 'text', text: message.content }] : message.content;
      for (const part of source) {
        if (part.type === 'text') parts.push({ type: 'input_text', text: part.text });
        else {
          if (role !== 'user') throw new AppError('VALIDATION_ERROR', 'Only user messages may contain attachments');
          const data = await approvedData(part, input.usage, part.type);
          if (part.type === 'image') parts.push({ type: 'input_image', image_url: data, detail: part.detail ?? 'auto' });
          else {
            fileBytes += Math.ceil(data.slice(data.indexOf(',') + 1).length * 0.75);
            if (fileBytes >= 50 * 1024 * 1024) throw new AppError('VALIDATION_ERROR', 'Combined file size is too large');
            parts.push({ type: 'input_file', filename: part.filename, file_data: data });
          }
        }
      }
      records.push({ role, content: parts });
    }
  }
  const identity = input.usage.conversationId ?? input.usage.businessId;
  return {
    model, input: records, reasoning: { effort },
    max_output_tokens: Math.max(16, input.maxOutputTokens ?? config.MODEL_MAX_OUTPUT_TOKENS),
    store: false, truncation: 'disabled', parallel_tool_calls: true,
    tools: input.tools?.map((tool) => ({ ...tool, type: 'function', strict: tool.strict ?? true })),
    tool_choice: typeof input.toolChoice === 'object' ? { type: 'function', name: input.toolChoice.name } : input.toolChoice,
    include: ['reasoning.encrypted_content'],
    text: { verbosity: 'low', ...(input.responseFormat ? { format: { type: 'json_schema', ...input.responseFormat, strict: input.responseFormat.strict ?? true } } : {}) },
    ...(input.usage.businessId ? { prompt_cache_key: 'biz:' + input.usage.businessId } : {}),
    ...(identity ? { safety_identifier: createHash('sha256').update(identity).digest('hex') } : {}),
    metadata: { purpose: input.usage.purpose, feature_id: input.usage.featureId, conversation_id: input.usage.conversationId ?? '' },
  };
}
function parsed(text: string): unknown {
  try { return JSON.parse(text); } catch { return undefined; }
}
export function mapResponse(response: OpenAI.Responses.Response, previous?: unknown) {
  const output = response.output ?? [];
  const refusal = output.some((item) => item.type === 'message' && item.content.some((part) => part.type === 'refusal'));
  const toolCalls = output.flatMap((part) => {
    if (part.type !== 'function_call') return [];
    const data = parsed(part.arguments);
    return [{ id: part.call_id, name: part.name, arguments: data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : {} }];
  });
  const finishReason: ModelChatResult['finishReason'] = refusal || response.incomplete_details?.reason === 'content_filter'
    ? 'content_filter' : toolCalls.length ? 'tool_calls' : response.incomplete_details?.reason === 'max_output_tokens' ? 'length' : 'stop';
  const text = refusal ? '' : response.output_text ?? '';
  const providerState = toolCalls.length ? [
    ...replayState(previous),
    { calls: toolCalls.map((call) => call.id), items: output.filter((part) => part.type === 'reasoning' || part.type === 'function_call') },
  ] : undefined;
  return { text, toolCalls, finishReason, providerState };
}
function fnv(text: string): number {
  let hash = 2166136261;
  for (const byte of Buffer.from(text)) hash = Math.imul(hash ^ byte, 16777619);
  return hash >>> 0;
}
function normalized(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((state, value) => state + value * value, 0));
  if (magnitude === 0) vector[0] = 1;
  return magnitude ? vector.map((value) => value / magnitude) : vector;
}
export function fakeTokens(text: string): string[] {
  const words = text.toLowerCase().match(/[a-z0-9]+(?:-[a-z0-9]+)*/g) ?? [];
  const thai = text.match(/\p{Script=Thai}+/gu) ?? [];
  return [...words, ...thai.flatMap((word) => Array.from({ length: Math.max(0, word.length - 1) }, (_, index) => word.slice(index, index + 2)))];
}
function fakeEmbedding(text: string): number[] {
  const vector = Array<number>(config.EMBED_DIM).fill(0);
  for (const token of fakeTokens(text)) vector[fnv(token) % vector.length] += fnv('#' + token) & 1 ? 1 : -1;
  return normalized(vector);
}
const modelCallsDisabled = new AsyncLocalStorage<boolean>();

export function withModelCallsDisabled<T>(work: () => Promise<T>): Promise<T> {
  return modelCallsDisabled.run(true, work);
}

async function tracked<T extends object>(kind: Kind, usage: UsageAttribution, model: string, fn: () => Promise<{ value: T; record?: ModelRecord }>) {
  if (modelCallsDisabled.getStore()) {
    throw new AppError('POLICY_BLOCKED', 'Model calls are disabled during demo reset', {
      details: { reason: 'demo_reset_model_disabled' },
    });
  }
  const start = performance.now();
  let response: { value: T; record?: ModelRecord };
  try { response = await fn(); }
  catch (cause) {
    const error = classifyOpenAIError(cause);
    const providerError = cause as { request_id?: string; headers?: Headers } | null;
    await record(kind, usage, model, Math.round(performance.now() - start), {
      error, requestId: providerError?.request_id ?? providerError?.headers?.get('x-request-id'),
    }).catch(() => log.error('Model failure usage could not be written'));
    throw error;
  }
  const latencyMs = mode === 'fake' ? 0 : Math.round(performance.now() - start);
  const written = await record(kind, usage, model, latencyMs, response.record);
  return { ...response.value, ...written, latencyMs, mode, model };
}
const count = z.number().int().nonnegative();
const realtimeUsage = z.object({
  input_tokens: count, output_tokens: count,
  input_token_details: z.object({ audio_tokens: count.optional(), cached_tokens: count.optional(),
    cached_tokens_details: z.object({ audio_tokens: count.optional() }).optional() }).optional(),
  output_token_details: z.object({ audio_tokens: count.optional() }).optional(),
});
export const model: ModelApi = {
  chat(input) {
    const id = aliases[input.model ?? 'chat'];
    return tracked<Pick<ModelChatResult, 'text' | 'json' | 'requestId' | 'toolCalls' | 'finishReason' | 'providerState'>>('chat', input.usage, id, async () => {
      if (!provider) {
        const last = input.messages.findLast((message) => message.role === 'user');
        const text = typeof last?.content === 'string' ? last.content : last?.content.flatMap((part) => part.type === 'text' ? part.text : []).join(' ') ?? '';
        const toolCalls = input.fake?.toolCalls ?? [];
        return { value: { text: input.fake?.text ?? '[fake-model:' + input.usage.purpose + '] ' + text.slice(0, 200),
          json: input.fake?.json, requestId: null as string | null, toolCalls,
          finishReason: toolCalls.length ? 'tool_calls' as const : 'stop' as const, providerState: toolCalls.length ? { fake: true } : undefined as unknown },
          record: { finishReason: toolCalls.length ? 'tool_calls' : 'stop' } };
      }
      const args = await buildResponsesRequest(input);
      const response = await withDeadlineRetry((signal) => provider.responses.create(args, { signal }), input.timeoutMs ?? config.MODEL_TIMEOUT_MS, input.signal);
      const mapped = mapResponse(response, input.providerState);
      const requestId = response._request_id ?? null;
      const details = response.usage?.input_tokens_details as { cached_tokens?: number; cache_write_tokens?: number } | undefined;
      return { value: { ...mapped, requestId, json: input.responseFormat ? parsed(mapped.text) : undefined },
        record: { finishReason: mapped.finishReason, requestId, responseId: response.id, usage: {
          inputTokens: response.usage?.input_tokens ?? null, outputTokens: response.usage?.output_tokens ?? null,
          cachedInputTokens: details?.cached_tokens ?? null, cacheWriteTokens: details?.cache_write_tokens ?? null,
          reasoningTokens: response.usage?.output_tokens_details.reasoning_tokens ?? null,
        } } };
    });
  },
  embed(input) {
    return tracked('embed', input.usage, config.OPENAI_EMBED_MODEL, async () => {
      const dim = config.EMBED_DIM;
      if (!provider) return { value: { dim, vectors: input.texts.map(fakeEmbedding) } };
      const vectors: number[][] = [];
      let tokens = 0;
      let requestId: string | null = null;
      for (let offset = 0; offset < input.texts.length; offset += 256) {
        const texts = input.texts.slice(offset, offset + 256);
        const result = await withDeadlineRetry((signal) => provider.embeddings.create({
          model: config.OPENAI_EMBED_MODEL, input: texts, dimensions: dim, encoding_format: 'float',
        }, { signal }), config.MODEL_TIMEOUT_MS);
        vectors.push(...result.data.sort((a, b) => a.index - b.index).map((item) => normalized(item.embedding)));
        tokens += result.usage.prompt_tokens;
        requestId = result._request_id ?? null;
      }
      return { value: { dim, vectors }, record: { requestId, usage: { ...noCounts, inputTokens: tokens } } };
    });
  },
  moderate(input) {
    return tracked('moderate', input.usage, config.OPENAI_MODERATION_MODEL, async () => {
      if (!input.text && !input.images?.length) throw new AppError('VALIDATION_ERROR', 'Content is required');
      if (!provider) {
        const flagged = input.text?.includes('[flag]') ?? false;
        return { value: { flagged, categories: flagged ? ['fake'] : [] } };
      }
      const parts: OpenAI.ModerationMultiModalInput[] = [];
      if (input.text) parts.push({ type: 'text', text: input.text });
      for (const image of input.images ?? []) parts.push({ type: 'image_url', image_url: { url: await approvedData(image, input.usage, 'image') } });
      const response = await withDeadlineRetry((signal) => provider.moderations.create({ model: config.OPENAI_MODERATION_MODEL, input: parts }, { signal }), config.MODEL_TIMEOUT_MS);
      const flagged = response.results.some((item) => item.flagged);
      const categories = [...new Set(response.results.flatMap((item) => Object.entries(item.categories).filter(([, value]) => value).map(([key]) => key)))];
      return { value: { flagged, categories }, record: { requestId: response._request_id, responseId: response.id } };
    });
  },
  transcribe(input) {
    return tracked('transcribe', input.usage, config.OPENAI_TRANSCRIBE_MODEL, async () => {
      const { filename, bytes, uploadRef } = input.audio;
      if (!/\.(flac|mp3|mp4|mpeg|mpga|m4a|ogg|wav|webm)$/i.test(filename) || Boolean(bytes) === Boolean(uploadRef)) {
        throw new AppError('VALIDATION_ERROR', 'Provide a supported audio file');
      }
      const source = bytes ?? (uploadRef && input.usage.businessId ? (await storage.read(uploadRef, { businessId: input.usage.businessId }))?.bytes : undefined);
      if (!source?.length || source.length > 25 * 1024 * 1024) throw new AppError('VALIDATION_ERROR', 'Audio size is not allowed');
      if (!provider) return { value: { text: '[fake-transcript] ' + filename, seconds: null } };
      const file = await OpenAI.toFile(Buffer.from(source), filename);
      const args = { model: config.OPENAI_TRANSCRIBE_MODEL, file, languages: input.languages ?? ['th'] };
      const result = await withDeadlineRetry((signal) => provider.audio.transcriptions.create(args, { signal }), config.MODEL_TIMEOUT_MS);
      return { value: { text: result.text, seconds: (result.usage as { seconds?: number } | undefined)?.seconds ?? null }, record: { requestId: result._request_id } };
    });
  },
  async createRealtimeSession(input) {
    return tracked('realtime', input.usage, config.OPENAI_REALTIME_MODEL, async () => {
      const ttl = input.ttlSeconds ?? 600;
      if (!Number.isInteger(ttl) || ttl < 10 || ttl > 7200 || input.businessId !== input.usage.businessId) throw new AppError('VALIDATION_ERROR', 'Invalid Realtime session scope or lifetime');
      if (provider) throw new AppError('SERVICE_NOT_READY', 'Realtime secret minting is not available in this setup');
      return { value: { clientSecret: 'fake-ek-' + randomUUID(), expiresAt: new Date(Date.now() + ttl * 1000).toISOString(), voice: config.OPENAI_REALTIME_VOICE }, record: { zeroCost: true } };
    });
  },
  async recordRealtimeUsage(input) {
    const result = realtimeUsage.safeParse(input.responseUsage);
    if (!result.success) throw new AppError('VALIDATION_ERROR', 'Invalid Realtime usage');
    const data = result.data;
    const audio = { input: data.input_token_details?.audio_tokens ?? 0, output: data.output_token_details?.audio_tokens ?? 0, cached: data.input_token_details?.cached_tokens_details?.audio_tokens ?? 0 };
    if (audio.input > data.input_tokens || audio.output > data.output_tokens || audio.cached > audio.input) throw new AppError('VALIDATION_ERROR', 'Invalid Realtime token counts');
    const { usageId } = await record('realtime', input.usage, config.OPENAI_REALTIME_MODEL, 0, {
      audio, usage: { ...noCounts, inputTokens: data.input_tokens, outputTokens: data.output_tokens, cachedInputTokens: data.input_token_details?.cached_tokens ?? null },
    });
    return { usageId };
  },
};
