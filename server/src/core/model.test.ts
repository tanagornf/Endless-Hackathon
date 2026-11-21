import { afterAll, expect, test } from 'vitest';
import { buildResponsesRequest, classifyOpenAIError, model, withDeadlineRetry } from './model';
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

test('never retries a provider budget exhaustion', async () => {
  const error = { status: 429, code: 'project_spend_limit_exceeded' };
  expect(classifyOpenAIError(error)).toMatchObject({ code: 'PROVIDER_BUDGET_EXHAUSTED', retryable: false });
  let calls = 0;
  await expect(withDeadlineRetry(async () => { calls++; throw error; }, 1000)).rejects.toMatchObject({ code: 'PROVIDER_BUDGET_EXHAUSTED' });
  expect(calls).toBe(1);
});
