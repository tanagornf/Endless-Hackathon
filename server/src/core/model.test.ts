import { afterAll, expect, test } from 'vitest';
import { buildResponsesRequest, classifyOpenAIError, model, withDeadlineRetry, withModelCallsDisabled } from './model';
import { closeDb, db } from './db';
import type { UsageAttribution } from './types';

afterAll(closeDb);
const usage: UsageAttribution = { featureId: 'F01', purpose: 'model-test', businessId: null };

test('uses Responses payloads without persistence and maps strict tools', async () => {
  const request = await buildResponsesRequest({ usage, model: 'fast', messages: [{ role: 'system', content: 'Rules' }],
    tools: [{ name: 'lookup', description: 'Look up a fact', parameters: { type: 'object', properties: {}, required: [], additionalProperties: false } }],
  });
  expect(request).toMatchObject({ store: false, reasoning: { effort: 'low' }, include: ['reasoning.encrypted_content'],
    input: [{ role: 'developer', content: [{ type: 'input_text', text: 'Rules' }] }], tools: [{ strict: true }] });
  expect(request).not.toHaveProperty('temperature');
  expect(request).not.toHaveProperty('top_p');
  expect(request).not.toHaveProperty('user');
});

test('fake responses are deterministic and leave auditable usage without a provider call', async () => {
  const reply = await model.chat({ usage, messages: [{ role: 'user', content: 'Test' }] });
  expect(reply).toMatchObject({ text: '[fake-model:model-test] Test', mode: 'fake', usage: { costUsdMicros: 0, costReason: 'fake_mode' } });
  const embedding = await model.embed({ usage, purpose: 'query', texts: ['A-GAME-01 ทดสอบ', 'A-GAME-01 ทดสอบ'] });
  expect(embedding.vectors[0]).toHaveLength(1536);
  expect(embedding.vectors[0]).toEqual(embedding.vectors[1]);
  expect(await model.moderate({ usage, text: '[flag]' })).toMatchObject({ flagged: true });
  expect(await model.transcribe({ usage, audio: { filename: 'test.wav', bytes: new Uint8Array([1]) } })).toMatchObject({ text: '[fake-transcript] test.wav' });
  expect((await model.createRealtimeSession({ usage: { ...usage, businessId: '00000000-0000-4000-8000-0000000a2000' },
    businessId: '00000000-0000-4000-8000-0000000a2000', customerId: null, instructions: '', tools: [] })).clientSecret).toMatch(/^fake-ek-/);
  expect(await model.recordRealtimeUsage({ usage, responseUsage: { input_tokens: 16, output_tokens: 4 } })).toHaveProperty('usageId');
  expect(await db.one('SELECT mode,cost_reason FROM model_usage WHERE id=$1', [reply.usageId])).toMatchObject({ mode: 'fake', cost_reason: 'fake_mode' });
}, 12000);

test('fake shop correction records the server-owned scope, effort and requested tier with no provider claim', async () => {
  const businessId = '00000000-0000-4000-8000-0000000a2000';
  const trusted = { caseId: 'synthetic-correction', expectedVersion: 3, targetId: null };
  const schema = { type: 'object', additionalProperties: false,
    required: ['action', 'caseId', 'expectedVersion', 'targetId', 'textTh', 'textEn', 'reason'],
    properties: { action: { type: 'string' }, caseId: { type: 'string' }, expectedVersion: { type: 'integer' },
      targetId: { type: ['string', 'null'] }, textTh: { type: ['string', 'null'] }, textEn: { type: ['string', 'null'] },
      reason: { type: 'string' } } };
  const input = { usage: { featureId: 'F04' as const, purpose: 'caller-cannot-select-purpose', businessId },
    redactedInput: JSON.stringify({ ...trusted, correction: 'Synthetic test' }), responseFormat: { name: 'shop_correction', schema } };
  const result = await model.analyzeShopCorrection(input);
  expect(result).toMatchObject({ mode: 'fake', requestId: null, usage: { costUsdMicros: 0, costReason: 'fake_mode' },
    json: { action: 'no_change', ...trusted, textTh: null, textEn: null } });
  const row = await db.one('SELECT business_id,feature_id,purpose,reasoning_effort,requested_service_tier,provider_service_tier FROM model_usage WHERE id=$1', [result.usageId]);
  expect(row).toEqual({ business_id: businessId, feature_id: 'F04', purpose: 'learning.owner-correction',
    reasoning_effort: 'high', requested_service_tier: 'ultrafast', provider_service_tier: null });
  expect(result.text).not.toContain('Synthetic test');
  await expect(model.analyzeShopCorrection({ ...input, redactedInput: '{"correction":"No trusted version"}' }))
    .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  await expect(model.analyzeShopCorrection({ ...input, signal: AbortSignal.abort() })).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
}, 12000);

test('never retries a provider budget exhaustion', async () => {
  const error = { status: 429, code: 'project_spend_limit_exceeded' };
  expect(classifyOpenAIError(error)).toMatchObject({ code: 'PROVIDER_BUDGET_EXHAUSTED', retryable: false });
  let calls = 0;
  await expect(withDeadlineRetry(async () => { calls++; throw error; }, 1000)).rejects.toMatchObject({ code: 'PROVIDER_BUDGET_EXHAUSTED' });
  expect(calls).toBe(1);
});

test('reset scope blocks model use and leaves a concurrent ordinary call available', async () => {
  const blockedUsage = { ...usage, purpose: 'model-test-blocked-reset' };
  const ordinaryUsage = { ...usage, purpose: 'model-test-normal-concurrent' };
  const rejected = expect(withModelCallsDisabled(async () => {
    await Promise.resolve();
    return model.embed({ usage: blockedUsage, purpose: 'query', texts: ['Synthetic reset embedding'] });
  })).rejects.toMatchObject({ code: 'POLICY_BLOCKED', details: { reason: 'demo_reset_model_disabled' } });
  const ordinary = model.embed({ usage: ordinaryUsage, purpose: 'query', texts: ['Synthetic ordinary embedding'] });
  const [, allowed] = await Promise.all([rejected, ordinary]);
  expect(allowed.vectors[0]).toHaveLength(1536);
  expect(await db.maybeOne('SELECT id FROM model_usage WHERE purpose=$1', [blockedUsage.purpose])).toBeNull();
  expect(await db.maybeOne('SELECT id FROM model_usage WHERE id=$1', [allowed.usageId])).toBeTruthy();
}, 12000);
