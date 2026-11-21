import { beforeEach, expect, it, vi } from 'vitest';

const stubs = vi.hoisted(() => ({ create: vi.fn(), record: vi.fn() }));
vi.mock('openai', () => ({
  default: class { responses = { create: stubs.create }; },
}));
vi.mock('./config', async (importOriginal) => {
  const original = await importOriginal<typeof import('./config')>();
  return { ...original, config: {
    ...original.config, MODEL_MODE: 'openai', OPENAI_SHOP_CORRECTION_MODEL: 'requested-test-model',
    MODEL_PRICE_TABLE: { 'requested-test-model': { input: 2, cachedInput: 1, output: 3 } },
    OPENAI_SHOP_CORRECTION_ULTRAFAST_RATE_MULTIPLIER: 2,
  } };
});
vi.mock('./db', () => ({ db: { one: stubs.record } }));
vi.mock('./storage', () => ({ storage: {} }));
vi.mock('./log', () => ({ log: { info: vi.fn(), error: vi.fn() } }));

import { model } from './model';

const scope = { caseId: 'synthetic-case', targetId: null, expectedVersion: 0 };
const draft = { ...scope, action: 'no_change', textTh: null, textEn: null, reason: 'Synthetic test' };
const properties = {
  action: { type: 'string' }, caseId: { type: 'string' }, targetId: { type: ['string', 'null'] },
  expectedVersion: { type: 'integer' }, textTh: { type: ['string', 'null'] },
  textEn: { type: ['string', 'null'] }, reason: { type: 'string' },
};
const input = {
  usage: { featureId: 'F04' as const, businessId: 'synthetic-shop', purpose: 'caller-purpose' },
  redactedInput: JSON.stringify(scope),
  responseFormat: { name: 'shop_correction', schema: {
    type: 'object', additionalProperties: false, properties, required: Object.keys(properties),
  } },
};

function providerResponse() {
  return {
    model: 'requested-test-model', service_tier: 'ultrafast', reasoning: { effort: 'high' },
    status: 'completed', id: 'resp_synthetic', _request_id: 'req_synthetic',
    output: [], output_text: JSON.stringify(draft),
    usage: { input_tokens: 100, output_tokens: 20, output_tokens_details: { reasoning_tokens: 8 } },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  stubs.record.mockResolvedValue({ id: 'usage-synthetic' });
});

it('suppresses a model mismatch and meters the billable response under the actual model', async () => {
  stubs.create.mockResolvedValue({ ...providerResponse(), model: 'other-model' });

  const result = await model.analyzeShopCorrection(input);

  expect(result).toMatchObject({ text: '', model: 'other-model', requestId: 'req_synthetic',
    usage: { inputTokens: 100, outputTokens: 20, costUsdMicros: null, costReason: 'no_rate' } });
  expect(result.json).toBeUndefined();
  const [, values] = stubs.record.mock.calls[0];
  expect(values.slice(7, 19)).toEqual([
    'openai', 'other-model', 100, 20, null, null, 8, null, 'no_rate', expect.any(Number), 'unexpected_profile', null,
  ]);
  expect(values.slice(19, 21)).toEqual(['req_synthetic', 'resp_synthetic']);
  expect(values.slice(23)).toEqual(['high', 'ultrafast', 'ultrafast']);
});

it('sanitizes a failed response with no token counts while metering observed provider identity', async () => {
  stubs.create.mockResolvedValue({ ...providerResponse(), status: 'failed', usage: undefined,
    model: 'observed-failed-model', service_tier: 'priority', reasoning: { effort: 'medium' },
    error: { message: 'Raw provider error text' } });

  const result = await model.analyzeShopCorrection(input);

  expect(result).toMatchObject({ text: '', model: 'observed-failed-model',
    usage: { inputTokens: null, outputTokens: null, costUsdMicros: null, costReason: 'provider_error' } });
  expect(result.json).toBeUndefined();
  const [, values] = stubs.record.mock.calls[0];
  expect(values.slice(17, 21)).toEqual(['failed_response', 'PROVIDER_UNAVAILABLE', 'req_synthetic', 'resp_synthetic']);
  expect(values.slice(23)).toEqual(['medium', 'ultrafast', 'priority']);
  expect(JSON.stringify(values)).not.toContain('Raw provider error text');
});

it('meters a response received after cancellation and suppresses the draft', async () => {
  const controller = new AbortController();
  stubs.create.mockImplementation(async () => {
    controller.abort();
    return providerResponse();
  });

  const result = await model.analyzeShopCorrection({ ...input, signal: controller.signal });

  expect(result).toMatchObject({ text: '', requestId: 'req_synthetic',
    usage: { inputTokens: 100, outputTokens: 20, costUsdMicros: 520, costReason: 'priced' } });
  expect(result.json).toBeUndefined();
  expect(stubs.record).toHaveBeenCalledTimes(1);
  const [, values] = stubs.record.mock.calls[0];
  expect(values.slice(17, 21)).toEqual(['cancelled_after_response', null, 'req_synthetic', 'resp_synthetic']);
});

it('returns a validated candidate and meters the observed profile', async () => {
  stubs.create.mockResolvedValue(providerResponse());
  const result = await model.analyzeShopCorrection(input);
  expect(result.json).toEqual(draft);
  expect(result.usage.costUsdMicros).toBe(520);
  expect(stubs.create).toHaveBeenCalledTimes(1);
});


it('retains reported tokens even when a failed response omits token details', async () => {
  stubs.create.mockResolvedValue({ ...providerResponse(), status: 'failed', output: undefined,
    usage: { input_tokens: 100, output_tokens: 20 } });

  const result = await model.analyzeShopCorrection(input);

  expect(result.json).toBeUndefined();
  expect(result.usage).toMatchObject({ inputTokens: 100, outputTokens: 20, reasoningTokens: null,
    costUsdMicros: 520, costReason: 'priced' });
  const [, values] = stubs.record.mock.calls[0];
  expect(values.slice(17, 21)).toEqual(['failed_response', 'PROVIDER_UNAVAILABLE', 'req_synthetic', 'resp_synthetic']);
});
