import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AgentToolInput } from '@nless/shared/features/ai-agent/types';
import type { ConversationRecord } from '@nless/shared/features/inbox/types';
import { model } from '../../core';
import { closeDb } from '../../core/db';
import { seedId } from '../../core/seed';
import * as settings from '../business-settings/service';
import { saveMessage } from '../inbox/service';
import { executeAgentTool } from './service';

const businessId = seedId('biz_demo_a');
const items = [{ sku: 'A-GAME-01', name: null, variant_name: null, quantity: 2 }];
let caller: ConversationRecord;
let anotherCustomer: ConversationRecord;

async function openCustomer(text: string) {
  return (await saveMessage({
    businessId, customer: { channel: 'web', externalId: 'f10-voice-read-' + randomUUID() },
    direction: 'inbound', author: 'customer', origin: 'demo', triggerAi: false, parts: [{ type: 'text', text }],
  })).conversation;
}

function request(overrides?: Partial<AgentToolInput>): AgentToolInput {
  return {
    businessId, conversationId: caller.id, customerId: caller.customerId, channel: 'voice',
    name: 'get_price', args: items[0], ...overrides,
  };
}

beforeAll(async () => {
  caller = await openCustomer('How much is A-GAME-01?');
  anotherCustomer = await openCustomer('สวัสดีค่ะ');
});
afterEach(() => vi.restoreAllMocks());
afterAll(closeDb);

describe('F10 verified voice read tools', () => {
  it('uses the exact catalog and localized money format without numeric minor-unit fields', async () => {
    const provider = vi.spyOn(model, 'chat');
    const price = await executeAgentTool(request());
    expect(price).toMatchObject({ ok: true, sku: 'A-GAME-01', unitPrice: '1,490 baht', subtotal: '2,980 baht' });
    const total = await executeAgentTool(request({ name: 'calculate_total', args: { items } }));
    expect(total).toMatchObject({
      ok: true, subtotal: '2,980 baht',
      lines: [expect.objectContaining({ sku: 'A-GAME-01', unitPrice: '1,490 baht', lineTotal: '2,980 baht' })],
    });
    expect(JSON.stringify({ price, total })).not.toMatch(/Minor"/);
    expect(provider).not.toHaveBeenCalled();
  });

  it('requires the matching verified tenant, conversation and customer', async () => {
    const rules = vi.spyOn(settings, 'getEffectiveAnswerRules');
    expect(await executeAgentTool(request({ businessId: seedId('biz_demo_b') }))).toEqual({ ok: false, error: 'NOT_FOUND' });
    expect(await executeAgentTool(request({ customerId: anotherCustomer.customerId }))).toEqual({ ok: false, error: 'NOT_FOUND' });
    expect(await executeAgentTool(request({ conversationId: anotherCustomer.id }))).toEqual({ ok: false, error: 'NOT_FOUND' });
    expect(await executeAgentTool(request({ conversationId: null }))).toEqual({ ok: false, error: 'VALIDATION_ERROR' });
    expect(rules).not.toHaveBeenCalled();
  });

  it('applies current AI rules, validates model args and refuses side-effecting tool names', async () => {
    const rules = await settings.getEffectiveAnswerRules(businessId);
    const policy = vi.spyOn(settings, 'getEffectiveAnswerRules').mockResolvedValue({ ...rules, price: 'never' });
    expect(await executeAgentTool(request())).toEqual({ ok: false, error: 'POLICY_BLOCKED' });
    policy.mockResolvedValue(rules);
    expect(await executeAgentTool(request({ args: { ...items[0], businessId: seedId('biz_demo_b') } })))
      .toEqual({ ok: false, error: 'VALIDATION_ERROR' });
    expect(await executeAgentTool({ ...request(), name: 'handoff_to_staff' } as unknown as AgentToolInput))
      .toEqual({ ok: false, error: 'UNKNOWN_TOOL' });
  });
});
