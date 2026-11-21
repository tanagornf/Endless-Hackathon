import type { ModelChatInput, ModelChatResult, ModelMessage } from '../../core';
import type { ReplyContext } from './context';
import { maskCardNumbers } from './mask';
import { availableTools, declinedTool, runTool, TOOL_BUDGET } from './tools';

type RoundInput = Pick<ModelChatInput, 'messages' | 'tools' | 'toolChoice' | 'providerState'>;
type Call = (input: RoundInput) => Promise<ModelChatResult>;

export interface LoopState {
  messages: ModelMessage[];
  providerState?: unknown;
  executedCalls: number;
}

export async function runModelLoop(
  state: LoopState,
  context: ReplyContext,
  businessId: string,
  call: Call,
  started: number,
  signal: AbortSignal,
): Promise<ModelChatResult> {
  const tools = availableTools(context.rules);
  const canCall = () => state.executedCalls < TOOL_BUDGET && performance.now() - started < 12000;
  const callModel = (allowTools: boolean) => call({
    messages: [...state.messages], tools,
    providerState: state.providerState, toolChoice: allowTools ? 'auto' : 'none',
  });
  let allowTools = canCall();
  let response = await callModel(allowTools);
  while (response.finishReason === 'tool_calls' && response.toolCalls.length) {
    signal.throwIfAborted();
    if (response.providerState !== undefined) state.providerState = response.providerState;
    const allowance = allowTools ? TOOL_BUDGET - state.executedCalls : 0;
    const { toolCalls } = response;
    state.executedCalls += Math.min(allowance, toolCalls.length);
    const outcomes = await Promise.all(toolCalls.map((tool, index) =>
      index < allowance ? runTool({ businessId, language: context.language, rules: context.rules }, tool, signal) : declinedTool(tool),
    ));
    signal.throwIfAborted();
    state.messages.push({ role: 'assistant', content: maskCardNumbers(response.text), toolCalls });
    for (let index = 0; index < outcomes.length; index += 1) {
      const result = outcomes[index];
      state.messages.push({ role: 'tool', toolCallId: toolCalls[index].id, content: JSON.stringify(result.output) });
      context.tools.push(result.trace);
      if (result.knowledge) {
        const added = new Map([...context.knowledge, ...result.knowledge].map((item) => [item.id, item]));
        context.knowledge.splice(0, context.knowledge.length, ...added.values());
      }
      if (result.prices) {
        for (const price of result.prices) {
          if (!context.prices.some(({ quote }) => quote.itemId === price.quote.itemId && quote.variantId === price.quote.variantId && quote.quantity === price.quote.quantity)) {
            context.prices.push(price);
          }
        }
      }
      if (result.total) context.totals.push(result.total);
    }
    if (!allowance) break;
    allowTools = canCall();
    response = await callModel(allowTools);
  }
  return response;
}
