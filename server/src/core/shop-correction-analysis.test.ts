import { describe, expect, it, vi } from 'vitest';
import {
  prepareShopCorrectionAnalysis, runShopCorrectionAnalysis, SHOP_CORRECTION_ANALYSIS_PURPOSE, validateShopCorrectionResponse,
} from './shop-correction-analysis';
import type { ShopCorrectionAnalysisInput, ShopCorrectionAnalysisSettings } from './shop-correction-analysis';

const settings: ShopCorrectionAnalysisSettings = {
  model: 'test-configured-astra', reasoningEffort: 'high', serviceTier: 'ultrafast',
};
const input: ShopCorrectionAnalysisInput = {
  usage: {
    featureId: 'F04', purpose: 'owner-correction',
    businessId: '00000000-0000-4000-8000-0000000b1000',
    accountId: '00000000-0000-4000-8000-00000000a100',
  },
  redactedInput: '{"caseId":"synthetic-1","targetId":null,"expectedVersion":0,"ownerCorrection":"Please correct the opening time to 10:00."}',
  responseFormat: {
    name: 'shop_correction_draft',
    schema: {
      type: 'object', additionalProperties: false, required: ['action'],
      properties: { action: { type: 'string', enum: ['knowledge_add', 'no_change'] } },
    },
  },
};

describe('shop correction analysis request', () => {
  it('uses the dedicated settings and sends the supplied schema in strict mode', () => {
    const { request } = prepareShopCorrectionAnalysis(input, settings);

    expect(request).toMatchObject({
      model: 'test-configured-astra',
      reasoning: { effort: 'high' },
      service_tier: 'ultrafast',
      store: false,
      truncation: 'disabled',
      max_output_tokens: 2200,
      text: { format: { type: 'json_schema', name: 'shop_correction_draft', strict: true, schema: input.responseFormat.schema } },
    });
    expect(request.input.map(({ role }) => role)).toEqual(['developer', 'user']);
    expect(request.input[0].content).toMatch(/draft/i);
    expect(request.input[1].content).toBe(input.redactedInput);
    expect(request).not.toHaveProperty('tools');
    expect(request).not.toHaveProperty('temperature');
    expect(request).not.toHaveProperty('top_p');
  });

  it('attributes the call to the scoped F04 business without sending raw tenant IDs', () => {
    const first = prepareShopCorrectionAnalysis(input, settings);
    const otherBusiness = '00000000-0000-4000-8000-0000000b2000';
    const second = prepareShopCorrectionAnalysis({ ...input, usage: { ...input.usage, businessId: otherBusiness } }, settings);

    expect(first.usage).toEqual({ ...input.usage, purpose: 'learning.owner-correction' });
    expect(SHOP_CORRECTION_ANALYSIS_PURPOSE).toBe('learning.owner-correction');
    expect(first.request.metadata).toEqual({ feature_id: 'F04', purpose: SHOP_CORRECTION_ANALYSIS_PURPOSE });
    expect(first.request.prompt_cache_key).not.toBe(second.request.prompt_cache_key);
    expect(first.request.safety_identifier).not.toBe(second.request.safety_identifier);
    expect(JSON.stringify(first.request)).not.toContain(input.usage.businessId);
    expect(JSON.stringify(first.request)).not.toContain(input.usage.accountId);
  });

  it('rejects blank business scope and input', () => {
    expect(() => prepareShopCorrectionAnalysis({ ...input, usage: { ...input.usage, businessId: '' } }, settings))
      .toThrow(/business scope/i);
    expect(() => prepareShopCorrectionAnalysis({ ...input, redactedInput: ' ' }, settings))
      .toThrow(/redacted input/i);
  });

  it('rejects an oversized UTF-8 input or response schema', () => {
    expect(() => prepareShopCorrectionAnalysis({ ...input, redactedInput: 'ก'.repeat(6000) }, settings))
      .toThrow(/redacted input/i);
    expect(() => prepareShopCorrectionAnalysis({
      ...input,
      responseFormat: { ...input.responseFormat, schema: { ...input.responseFormat.schema, description: 'x'.repeat(9000) } },
    }, settings)).toThrow(/response schema/i);
  });

  it('keeps the schema validated at preparation time if the caller later changes its object', () => {
    const schema = structuredClone(input.responseFormat.schema);
    const { request } = prepareShopCorrectionAnalysis({
      ...input, responseFormat: { ...input.responseFormat, schema },
    }, settings);

    schema.additionalProperties = true;
    schema.description = 'x'.repeat(9000);
    expect(request.text.format.schema).toEqual(input.responseFormat.schema);
  });

  it('rejects a schema that omits a property from required', () => {
    expect(() => prepareShopCorrectionAnalysis({
      ...input, responseFormat: { ...input.responseFormat, schema: { ...input.responseFormat.schema, required: [] } },
    }, settings)).toThrow(/required properties/i);
  });

  it('rejects a request that explicitly disables strict schema mode', () => {
    expect(() => prepareShopCorrectionAnalysis({
      ...input, responseFormat: { ...input.responseFormat, strict: false },
    }, settings)).toThrow(/strict/i);
  });
});

describe('shop correction analysis execution', () => {
  const fake = () => ({ source: 'fake', action: 'no_change' });

  it('does not use the provider path in fake mode', async () => {
    const send = vi.fn(() => { throw new Error('Unexpected provider call'); });
    const prepared = prepareShopCorrectionAnalysis(input, settings);

    await expect(runShopCorrectionAnalysis(prepared, { mode: 'fake', fake, send }))
      .resolves.toEqual({ source: 'fake', action: 'no_change' });
    expect(send).not.toHaveBeenCalled();
  });

  it('blocks both paths if the caller has already cancelled', async () => {
    const signal = AbortSignal.abort(new Error('case closed'));
    const send = vi.fn(fake);
    const buildFake = vi.fn(fake);
    const prepared = prepareShopCorrectionAnalysis({ ...input, signal }, settings);

    for (const mode of ['fake', 'openai'] as const) {
      await expect(runShopCorrectionAnalysis(prepared, { mode, fake: buildFake, send })).rejects.toThrow('case closed');
    }
    expect(send).not.toHaveBeenCalled();
    expect(buildFake).not.toHaveBeenCalled();
  });

  it('forwards cancellation to the provider and discards a result after cancellation', async () => {
    const controller = new AbortController();
    const prepared = prepareShopCorrectionAnalysis({ ...input, signal: controller.signal }, settings);
    const send = vi.fn(async (request: typeof prepared.request, signal?: AbortSignal) => {
      expect(request).toBe(prepared.request);
      expect(signal).toBe(controller.signal);
      controller.abort(new Error('case closed while analysing'));
      return { source: 'provider', action: 'no_change' };
    });

    await expect(runShopCorrectionAnalysis(prepared, { mode: 'openai', fake, send }))
      .rejects.toThrow('case closed while analysing');
  });
});

describe('shop correction provider response validation', () => {
  const scope = { caseId: 'synthetic-1', targetId: null, expectedVersion: 0 };
  const draft = { action: 'no_change', ...scope, textTh: null, textEn: null, reason: 'No verified correction' };
  const requested = { model: settings.model, service_tier: 'ultrafast', reasoning: { effort: 'high' } };
  const provider = {
    model: settings.model, service_tier: 'ultrafast', reasoning: { effort: 'high' },
    status: 'completed', output_text: JSON.stringify(draft),
    output: [{ type: 'message', status: 'completed', content: [{ type: 'output_text' }] }],
  };

  it('accepts a completed, correctly scoped strict draft if returned effort is high or unreported', () => {
    expect(validateShopCorrectionResponse(requested, settings.model, provider, scope)).toEqual({ json: draft });
    expect(validateShopCorrectionResponse(requested, settings.model, { ...provider, reasoning: null }, scope))
      .toEqual({ json: draft });
  });

  it.each([
    [{ model: 'other-model' }, 'unexpected_profile'],
    [{ service_tier: 'priority' }, 'unexpected_profile'],
    [{ service_tier: null }, 'unexpected_profile'],
    [{ reasoning: { effort: 'medium' } }, 'unexpected_profile'],
    [{ status: 'incomplete' }, 'incomplete_response'],
    [{ incomplete_details: { reason: 'max_output_tokens' } }, 'incomplete_response'],
    [{ output: [{ type: 'message', content: [{ type: 'refusal' }] }] }, 'refusal'],
    [{ output: [{ type: 'message', status: 'incomplete', content: [{ type: 'output_text' }] }] }, 'incomplete_response'],
    [{ output: [{ type: 'function_call' }] }, 'invalid_draft'],
    [{ output_text: 'not JSON' }, 'invalid_draft'],
    [{ output_text: JSON.stringify({ ...draft, extra: true }) }, 'invalid_draft'],
    [{ output_text: JSON.stringify({ ...draft, expectedVersion: 1 }) }, 'invalid_draft'],
    [{ output_text: JSON.stringify({ ...draft, textEn: 'Unexpected advice' }) }, 'invalid_draft'],
  ] as const)('rejects an unusable provider success (%j)', (override, reason) => {
    expect(validateShopCorrectionResponse(requested, settings.model, { ...provider, ...override }, scope))
      .toEqual({ reason });
  });

  it('rejects a request with a changed model, tier, or effort even if the provider reports the expected profile', () => {
    for (const mismatch of [
      { model: 'other-model' }, { service_tier: 'priority' }, { reasoning: { effort: 'medium' } },
    ]) {
      expect(validateShopCorrectionResponse({ ...requested, ...mismatch }, settings.model, provider, scope))
        .toEqual({ reason: 'unexpected_profile' });
    }
  });
});
