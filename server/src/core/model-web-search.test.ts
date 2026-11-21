import type OpenAI from 'openai';
import { expect, test, vi } from 'vitest';
import { config } from './config';
import { db } from './db';
import { buildWebSearchRequest, mapWebSearchResponse, model } from './model';

vi.mock('./db', () => ({ db: { one: vi.fn(async () => ({ id: 'usage-test' })) } }));

test('sends only normalized public keywords and requires native web search', () => {
  const request = buildWebSearchRequest({ query: '  โซนี่  WH-1000XM5  ', language: 'th' });
  expect(request).toMatchObject({
    model: config.OPENAI_CHAT_MODEL,
    input: 'โซนี่ WH-1000XM5',
    instructions: expect.stringContaining('Thai'),
    tools: [{ type: 'web_search' }],
    tool_choice: 'required',
    max_tool_calls: 1,
    store: false,
  });
  expect(request).not.toHaveProperty('metadata');
  expect(request).not.toHaveProperty('prompt_cache_key');
  expect(request).not.toHaveProperty('safety_identifier');
});

test.each(['', 'A'.repeat(121), 'contact buyer@example.com', 'https://example.com', 'buyer 081-234-5678', 'camera\nprivate note'])(
  'rejects keyword input outside the public search format (%j)', (query) => {
    expect(() => buildWebSearchRequest({ query, language: 'en' })).toThrow('Search requires short public product keywords');
  },
);

const search: OpenAI.Responses.ResponseOutputItem = {
  type: 'web_search_call', id: 'ws_test', status: 'completed', action: { type: 'search' },
};

function message(urls: string[], text = 'Product specification'): OpenAI.Responses.ResponseOutputMessage {
  return {
    type: 'message', id: 'msg_test', role: 'assistant', status: 'completed',
    content: [{
      type: 'output_text', text,
      annotations: urls.map((url) => ({ type: 'url_citation', url, title: ' Product manual ', start_index: 0, end_index: 21 })),
    }],
  };
}

function response(output: OpenAI.Responses.ResponseOutputItem[], status: OpenAI.Responses.ResponseStatus = 'completed') {
  return { output, status } as OpenAI.Responses.Response;
}

test('uses citation annotations and deduplicates valid public links after a completed search', () => {
  expect(mapWebSearchResponse(response([search, message([
    'https://example.com/manual', 'https://EXAMPLE.COM/manual', 'javascript:alert(1)', 'https://user@example.com/manual',
  ])]))).toEqual({ answer: 'Product specification', citations: [{ url: 'https://example.com/manual', title: 'Product manual' }] });
});

test('retains only text parts with their own HTTPS citation, including parts that reuse a source', () => {
  const cited = message(['https://example.com/manual']);
  expect(mapWebSearchResponse(response([search, { ...cited, content: [
    ...message([], 'Uncited claim').content,
    ...cited.content,
    ...message(['http://example.com/insecure'], 'HTTP citation only').content,
    ...message(['https://example.com/manual'], 'Another cited detail').content,
  ] }]))).toEqual({
    answer: 'Product specification\nAnother cited detail', citations: [{ url: 'https://example.com/manual', title: 'Product manual' }],
  });
});

test('discards incomplete, uncited and unsearched text', () => {
  const cited = message(['https://example.com/manual']);
  const empty = { answer: '', citations: [] };
  expect(mapWebSearchResponse(response([cited]))).toEqual(empty);
  expect(mapWebSearchResponse(response([{ ...search, status: 'failed' }, cited]))).toEqual(empty);
  expect(mapWebSearchResponse(response([search, cited], 'incomplete'))).toEqual(empty);
  expect(mapWebSearchResponse(response([search, message([])]))).toEqual(empty);
});

test('fake search returns no sources and preserves attribution in model usage', async () => {
  const usage = { featureId: 'F10', purpose: 'f10.web_search', businessId: 'business-test', accountId: 'account-test',
    conversationId: 'conversation-test', turnId: 'turn-test' } as const;
  await expect(model.searchWeb({ query: 'board game rules', language: 'en', usage })).resolves.toMatchObject({
    answer: '', citations: [], usageId: 'usage-test', mode: 'fake', usage: { costUsdMicros: 0 },
  });
  expect(db.one).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO model_usage'), expect.arrayContaining([
    usage.businessId, usage.accountId, usage.conversationId, usage.turnId, usage.featureId, usage.purpose, 'chat', 'fake',
  ]));
});
