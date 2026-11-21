import { config } from '../server/src/core/config';
import { closeDb } from '../server/src/core/db';
import { model } from '../server/src/core/model';
import type { ModelChatInput, UsageAttribution } from '../server/src/core/types';

if (!config.OPENAI_API_KEY) {
  console.log('SKIP: OPENAI_API_KEY is not configured');
} else if (config.MODEL_MODE !== 'openai') {
  console.log('SKIP: smoke requires MODEL_MODE=openai in a development shell');
} else {
  const usage: UsageAttribution = { featureId: 'F01', purpose: 'smoke', businessId: null };
  const rows: { check: string; status: string; model?: string; code?: string }[] = [];
  const check = async (name: string, fn: () => Promise<string>) => {
    try { rows.push({ check: name, status: 'PASS', model: await fn() }); }
    catch (error) { rows.push({ check: name, status: 'FAIL', code: (error as { code?: string }).code ?? 'UNEXPECTED' }); }
  };
  try {
    for (const alias of ['chat', 'fast', 'strong'] as const) await check(alias, async () => (await model.chat({
      usage, model: alias, messages: [{ role: 'user', content: 'ตอบคำเดียวว่า สวัสดี' }], maxOutputTokens: 50,
    })).model);
    await check('Tool round-trip', async () => {
      const tools = [{ name: 'get_time', description: 'Return the current time', parameters: { type: 'object', properties: {}, required: [], additionalProperties: false } }];
      const messages: ModelChatInput['messages'] = [{ role: 'user', content: 'Call get_time and report the answer.' }];
      const input = { usage, tools, messages, maxOutputTokens: 400 };
      const first = await model.chat({ ...input, toolChoice: { name: 'get_time' } });
      if (first.finishReason !== 'tool_calls' || !first.toolCalls.length) throw Error('Missing tool call');
      const second = await model.chat({ ...input, toolChoice: 'none', providerState: first.providerState, messages: [
        ...messages, { role: 'assistant', content: first.text, toolCalls: first.toolCalls },
        ...first.toolCalls.map((call) => ({ role: 'tool' as const, toolCallId: call.id, content: JSON.stringify({ time: '10:00' }) })),
      ] });
      if (second.finishReason !== 'stop') throw Error('Tool loop incomplete');
      return second.model;
    });
    await check('Embeddings 1536', async () => {
      const result = await model.embed({ usage, purpose: 'query', texts: ['ทดสอบ'] });
      if (result.vectors[0]?.length !== 1536) throw Error('Wrong embedding dimension');
      return result.model;
    });
    await check('Moderation', async () => {
      const result = await model.moderate({ usage, text: 'สวัสดี' });
      if (result.flagged) throw Error('Greeting was flagged');
      return result.model;
    });
  } finally {
    console.table(rows);
    if (rows.some(({ status }) => status === 'FAIL')) process.exitCode = 1;
    await closeDb();
  }
}
