import { z } from 'zod';
import type { AgentToolInput, AgentToolName } from '@nless/shared/features/ai-agent/types';
import { getEffectiveAnswerRules } from '../business-settings/service';
import { getConversation, getCustomerLanguage } from '../inbox/service';
import { runTool } from './tools';

const readToolNames = new Set<AgentToolName>(['search_knowledge', 'get_price', 'calculate_total']);
const inputSchema = z.object({
  businessId: z.string().uuid(),
  conversationId: z.string().uuid(),
  customerId: z.string().uuid(),
  args: z.record(z.string(), z.unknown()),
  channel: z.enum(['chat', 'voice']),
  turnId: z.string().uuid().optional(),
});
const failure = (error: string) => ({ ok: false, error });

function voiceResult(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(voiceResult);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(Object.entries(value).flatMap(([key, item]) =>
    key.endsWith('Minor') ? [] : [[key, voiceResult(item)]],
  ));
}

/**
 * Server-only shop facts for a verified session. The calling feature
 * authorizes its session before calling F10 and derives the scope from it.
 */
export async function executeAgentTool(input: AgentToolInput): Promise<Record<string, unknown>> {
  if (!readToolNames.has(input.name)) return failure('UNKNOWN_TOOL');
  const validated = inputSchema.safeParse(input);
  if (!validated.success) return failure('VALIDATION_ERROR');
  const { businessId, conversationId, customerId, args, channel, turnId } = validated.data;
  try {
    const conversation = await getConversation(conversationId, { businessId });
    if (!conversation || conversation.businessId !== businessId || conversation.customerId !== customerId ||
      conversation.status !== 'open') return failure('NOT_FOUND');
    const [rules, language] = await Promise.all([
      getEffectiveAnswerRules(businessId),
      getCustomerLanguage(conversationId, { businessId }),
    ]);
    if (input.name !== 'search_knowledge' && rules.price !== 'always') return failure('POLICY_BLOCKED');
    const { output } = await runTool(
      { businessId, language, rules },
      { id: turnId ?? 'read', name: input.name, arguments: args },
      AbortSignal.timeout(3000),
    );
    return channel === 'voice' ? voiceResult(output) as Record<string, unknown> : output;
  } catch {
    return failure('SERVICE_NOT_READY');
  }
}
